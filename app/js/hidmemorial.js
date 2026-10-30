/* =====================================================================
 * hidmemorial.js — MEMORIAL DE CÁLCULO HIDROSSANITÁRIO (água fria, esgoto
 * e recalque) — motor PURO, ES5, sem DOM, Node-testável. Mesma arquitetura
 * do js/madmemorial.js: funções de formato copiadas e adaptadas.
 *
 *   HidMemorial.gerar(resultado, opcoes) → { ok, html, titulo, secoes,
 *        tabelas, avisos, conferencias, naoAbrangidos }
 *
 *   resultado  o de HidDimensionar.calcular (docs/hidro/CONTRATO.md §4).
 *              O memorial NÃO recalcula: apresenta valores, `passos` e
 *              `fonte` que vieram prontos.
 *   opcoes     obra { nome, endereco, cidade, proprietario, contratante } ·
 *              documento { numero, revisao, data, situacao } ·
 *              revisoes [{ rev, data, descricao, por }] ·
 *              responsavel { nome, titulo, abrev, conselho, crea, empresa,
 *              cnpj } · contratanteAssinatura { empresa, nome, cargo } ·
 *              local · logos { ra, contratante, proprietario } (data URL) ·
 *              clima (resultado do ClimDimensionar: entra como seção do MESMO memorial —
 *              o memorial único da tela "Gerar documentos", 17/10/2026) ·
 *              links (js/hiddoclinks.js: a página da norma no catálogo da ABNT, só URL conferida).
 *              Nada de obra/responsável fica fixo aqui: faltou → [PLACEHOLDER]
 *              em vermelho.
 *
 * REGRAS (registro formal de engenharia — não afrouxar):
 *   · Pendência = "não verificado: falta <chave>". Recado que mente é pior
 *     que nenhum: verificação pendente NUNCA aparece como OK; sem η não há
 *     "OK" numérico.
 *   · Resultado calculado com tabela de teste (fixture) leva o selo
 *     "TABELAS DE TESTE — NÃO É NORMA" na capa e em cada seção de cálculo.
 *   · Texto do motor com undefined/NaN/null vira "[valor indefinido]" E
 *     entra nas conferências internas (esconder o defeito seria pior).
 *   · Norma citada com edição e TIPO DE FONTE (primária/secundária) vindos
 *     do resultado; nenhum valor de norma é escrito aqui.
 * Teste: node tools/test-hid-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* hid:fisica-inicio — APRESENTAÇÃO, não física: todo número deste arquivo é casa decimal, índice de coluna/célula, largura, tamanho de fonte, cor ou tolerância de comparação de ponto flutuante. Valor de norma NUNCA é escrito aqui: chega pronto no resultado do HidDimensionar (verificado por tools/test-hid-memorial.js / test-hid-planilhas.js, que comparam com o resultado). Fonte da regra de leitura: CONTRATO §5. */

  /* ================================================================ LIMPEZA PARA O CLIENTE (F8, 28/10/2026)
     O documento vai ao cliente: não carrega bastidor (nome de arquivo de código, ordem do Rogério, licença de cópia de norma,
     TCC/apostila/blog, página de PDF). A fonte secundária fica como "referência bibliográfica secundária". */
  var REF_SEC = "referência bibliográfica secundária";
  var LIMPA_FONTE = [
    [/[A-ZÀ-Ú][A-ZÀ-Ú-]{2,},\s*(?:[A-Z]\.\s*){1,3}[^|<()]*?…,\s*p\.\s*\d+\s*\(TCC p\.\s*\d+\)/g, REF_SEC],
    [/[A-ZÀ-Ú][A-ZÀ-Ú-]{2,},\s*(?:[A-Z]\.\s*){1,3}[^|<]*?\bTCC\b[^|<]*?((?:19|20)\d\d)/g, REF_SEC + " ($1)"],
    [/\bTCC\b,?\s*(?:[A-Z]{2,8},\s*)?(?:[A-ZÀ-Ú][\wÀ-ú]+(?: [A-ZÀ-Ú][\wÀ-ú]+)*,\s*)?((?:19|20)\d\d)/g, REF_SEC + " ($1)"],
    [/(?:Figura|Tabela|Quadro)\s+\d+\s+do\s+TCC\s*=\s*/g, ""],
    [/(?:Figura|Tabela|Quadro)\s+\d+\s+do\s+TCC\s*\(/g, "("],
    [/\s*\(TCC p\.\s*\d+\)/g, ""],
    [/NOVACAP\/DF\.[^|<]*?(?:\(R\d+\)|…)/g, REF_SEC + " (memorial de projeto de instalações hidrossanitárias de órgão público)"],
    [/(?:Tabela|Figura|Quadro)\s+(\d+)\s+do\s+memorial\b/g, "$&"],
    [/,?\s*p\.\s*PDF p\.\s*\d+/g, ""],
    [/\bPDF p\.\s*\d+/g, ""],
    [/(?:[A-ZÀ-Ú]{3,},\s*(?:[A-Z]\.\s*){1,3};?\s*)+(?=apostila|referência bibliográfica secundária)/g, ""],
    [/\bapostila\b[^|<.;()]*(?:PUC[^|<.;()]*)?/gi, REF_SEC],
    [/(referência bibliográfica secundária)\.?\s*PUC Goi[áa]s/g, "$1"],
    [/(?:(?:na|no|em|da|do) )?c[óo]pia hospedada no blog[^|<.;()]*/gi, REF_SEC],
    [/\bblog\b[^|<.;()]*/gi, REF_SEC],
    [/;?\s*exemplar pr[óo]prio pendente[^|<]*?(?=\s*[|<]|$)/g, ""],
    [/\(c[óo]pia n[ãa]o arquivada[^)]*\)/gi, ""],
    [/\s*\(via TCC[^)]*\)/g, ""],
    [/\s*\((?:parametros|opcoes|config)\.[\w.]+\)/g, ""],
    [/\(\s*HidNormas:[^)]*\)/g, "(tabelas de norma do cálculo)"],
    [/\bHidNormas\b/g, "acervo de normas"],
    [/\bpadrão do motor\b/g, "padrão do cálculo"],
    [/Decisão do RT \(gerente do hidro\)/g, "Decisão do responsável técnico"],
    [/\bgerente do hidro\b/g, "responsável técnico"],
    [/\s*\(valores com o item; exemplarLicenciado: false\)/g, ""],
    [/leitura do motor, o texto/g, "leitura adotada no projeto; o texto"],
    [/pelo motor da piscina/g, "pelo cálculo da piscina"],
    [/informada pelo chamador/g, "informada no projeto"],
    [/\bos motores\b/g, "o cálculo"],
    [/\(NR-24, NR-18, MEC 2006, RDC 50\)/g, "(cada linha com a sua fonte)"],
    [/sólido "c487-coz-inferior:\d+" do móvel \(o cooktop desenhado\)/g, "cooktop desenhado no móvel da cozinha"],
    [/c487-parede-E-MURO-E1/g, "no muro esquerdo (E1)"],
    [/\bfogao\b/g, "fogão"],
    [/Os ábacos \(a\) aresta viva e \(b\) funil de saída da NBR 10844 \(Figura 5 da norma; Figura 4\.5 do UFSM\) são desenhos e não foram digitalizados em tabela\. Só há a tabela de Botelho & Ribeiro Jr\. \(secundária, do livro-texto\)\./g, "Os ábacos da NBR 10844 (aresta viva e funil de saída) não estão digitalizados em tabela; o condutor vertical foi conferido pela tabela de capacidade do livro-texto (fonte secundária)."],
    [/(parede )?\bc487-parede-([A-Z][A-Za-z0-9-]*)/g, "parede $2"],
    [/\bind\.dilatacao\.pontos_fixos(?:\[cobre\])?/g, "distância máxima entre pontos fixos (cobre)"],
    [/\bap\.condutor_vertical\.abacos\b/g, "ábaco do condutor vertical"],
    [/;\s*informe opcoes\.[\w.]+[^)|<]*/g, ""],
    [/\s*\([a-z][a-z0-9_]+(?:\.[a-z0-9_]+){2,}\)/g, ""],
    [/\s*\([a-z][a-z0-9]+\.[a-z0-9]*_[a-z0-9_]*\)/g, ""],
    [/\bTCC\b/g, REF_SEC],
    [/(?:dados-fonte|docs|tools|js)\/[\w./-]+/g, ""]
  ];
  /* Casa 487 (F9): chave de código (material, peça, aparelho) nunca vai ao cliente: nome em português; as demais "palavra_palavra" perdem o sublinhado */
  var NOME_CHAVE = { pvc_soldavel: "PVC soldável", pvc_roscavel: "PVC roscável", pvc_serie_r: "PVC série reforçada", pvc_esgoto: "PVC esgoto (série normal)", pvc_esgoto_enterrado: "PVC ocre enterrado (NBR 7362)",
    condutor_horizontal: "condutor horizontal", condutor_vertical: "condutor vertical", pia_cozinha: "pia de cozinha", bacia_caixa_acoplada: "bacia com caixa acoplada", caixa_inspecao: "caixa de inspeção",
    maquina_lavar_roupa: "máquina de lavar roupa", ducha_higienica: "ducha higiênica", ralo_seco: "ralo seco", ralo_sifonado: "ralo sifonado", caixa_sifonada: "caixa sifonada", agua_fria: "água fria",
    registro_gaveta: "registro de gaveta", registro_esfera: "registro de esfera", registro_pressao: "registro de pressão", gas_residencial: "gás residencial" };
  function humanizaChaves(x) {
    return x.replace(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g, function (m, off, str) {
      var prev = off > 0 ? str.charAt(off - 1) : "", nxt = str.substr(off + m.length, 2);
      if (/[\w.\/\-\[:#]/.test(prev) || /^(?:\.[A-Za-z0-9]|[\/\-\[\]])/.test(nxt)) return m;   /* parte de chave pontuada, caminho, id com hífen: fica (outro filtro cuida) */
      return Object.prototype.hasOwnProperty.call(NOME_CHAVE, m) ? NOME_CHAVE[m] : m.replace(/_/g, " ");
    });
  }
  function limpaFonte(s) {
    var x = String(s == null ? "" : s);
    LIMPA_FONTE.forEach(function (r) { x = x.replace(r[0], r[1]); });
    x = humanizaChaves(x);
    return x.replace(/\(\s*\)/g, "").replace(/,\s*,/g, ",").replace(/\s+([,.;])/g, "$1").replace(/[ \t]{2,}/g, " ");
  }
  /* decisão do projetista: some a frase que cita código, ferramenta, a ordem do Rogério ou o estrutural */
  var RE_BASTIDOR = /(?:\b(?:tools|js|dados-fonte)\/|\.js\b|\bBim[A-Z]\w*\.|\bHid[A-Z]\w*\.|\bClim[A-Z]\w*\.|ordem direta|vale como regra do projeto|\(F\d\)|\bo motor\b|a ferramenta|o TA\b|\bTA punha|\bTraçar automaticamente\b|Corrigir sozinho|DECIS[ÃA]O DO ROG|ESTADO DO MODELO|AUTOCORRE[ÇC][ÃA]O|\bRogério\b|ROG[ÉE]RIO)/;
  var RE_ESTRUTURAL = /^\s*(?:PILARES|preparo estrutural)/i;
  function decisaoCliente(texto) {
    var x = String(texto == null ? "" : texto).replace(/^DECIS[ÃA]O DO ROG[ÉE]RIO[^:]*:\s*/i, "");
    if (RE_ESTRUTURAL.test(x)) return "";
    var partes = x.split(/\s*\|\s*/).map(function (seg) {
      var frases = seg.match(/[\s\S]+?(?:[.!?](?=\s+[A-ZÀ-Ú"(]|\s*$)|$)/g) || [];
      return limpaFonte(frases.filter(function (f) { return !RE_BASTIDOR.test(f); }).join(" ")).trim();
    }).filter(Boolean);
    return partes.join(" | ");
  }
  /* texto do usuário/nº de conselho: "CREA 1420606204" → { conselho: "CREA", num: "1420606204" } (evita "CREA nº CREA 1420606204") */
  function creaPartes(rp) {
    rp = rp || {};
    var bruto = String(rp.crea == null ? "" : rp.crea).trim(), cons = String(rp.conselho || "").trim();
    var m = /^(CREA|CAU|CRT)(?:[\s\-\/]*(?:n[ºo°.]*))?[\s:\-]*(.*)$/i.exec(bruto);
    if (m) { if (!cons) cons = m[1].toUpperCase(); bruto = m[2].trim(); }
    return { conselho: cons || "CREA", num: bruto };
  }
  function creaTxt(rp) { var c = creaPartes(rp); return c.conselho + " nº " + (c.num || "[Nº]"); }
  /* endereço sem repetir a cidade ("Rua X, 487 — Uberlândia/MG" + cidade "Uberlândia/MG") */
  function enderecoTxt(ob) {
    ob = ob || {};
    var e = String(ob.endereco || "").trim(), c = String(ob.cidade || "").trim();
    if (!e) return c;
    if (c && e.toLowerCase().indexOf(c.toLowerCase()) >= 0) return e;
    return [e, c].filter(Boolean).join(" — ");
  }

  /* ================================================================ FORMATO */
  var NB = String.fromCharCode(160), MENOS = "−";
  var estado = { indefinidos: [] };
  var RE_INDEF = /\b(undefined|nan|null|infinity)\b/i, RE_INDEF_G = /\b(undefined|nan|null|infinity)\b/gi;
  var COR = { azul: "#00406A", marrom: "#6F5F48", verde: "#3F7818", areia: "#A89868", falha: "#a3352b", alerta: "#c27c2c" };

  function fin(v) { return typeof v === "number" && isFinite(v); }
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
  /* texto que veio do motor: ponto decimal antes de unidade → vírgula; escapa e denuncia valor indefinido */
  /* Casa 487 (F9): "1.000 L" é MIL litros, não "1,000 L" (um litro): para litros só vira vírgula com 1 ou 2 casas ("0.5 L"); as demais unidades seguem como antes */
  var RE_DEC = /(\d)\.(\d{1,3})(?=\s?(?:m|cm|mm|kPa|m\/s|L\/s|m³\/h|m³|h|%)(?![\wÀ-ú]))|(\d)\.(\d{1,2})(?=\s?L(?![\wÀ-ú\/]))/g;
  function viraVirgula(m, a, b, c, d) { return a != null && a !== undefined && b !== undefined ? a + "," + b : c + "," + d; }
  function t(s, onde) {
    var x = limpaFonte(s).replace(RE_DEC, viraVirgula);
    if (RE_INDEF.test(x)) { x = x.replace(RE_INDEF_G, "[valor indefinido]"); estado.indefinidos.push((onde ? onde + ": " : "") + x.slice(0, 90)); }
    return esc(x);
  }
  function ph(v, rotulo) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rotulo) + "]</span>"; }
  function dataTxt(d) {
    function dois(n) { return (n < 10 ? "0" : "") + n; }
    if (d instanceof Date && !isNaN(d.getTime())) return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear();
    if (typeof d === "string" && d.trim()) return d.trim();
    return dataTxt(new Date());
  }
  function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
  function imgOk(s) { return typeof s === "string" && (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(s) || /^https?:\/\/\S+$/i.test(s)); }
  function plural(n, um, varios) { return br(n, 0) + " " + (n === 1 ? um : varios); }
  function unicos(l) { var o = []; l.forEach(function (x) { if (x != null && x !== "" && o.indexOf(x) < 0) o.push(x); }); return o; }

  /* ================================================================ SEÇÕES */
  var SECOES = [
    { id: "objeto", titulo: "Objeto e escopo desta emissão" },
    { id: "normas", titulo: "Método de cálculo, normas e tabelas, com tipo de fonte" },
    { id: "premissas", titulo: "Premissas e decisões de engenharia" },
    { id: "confirmacoes", titulo: "Confirmações do responsável técnico" },
    { id: "programa", titulo: "Programa de necessidades" },
    { id: "af", titulo: "Água fria" },
    { id: "es", titulo: "Esgoto sanitário e ventilação" },
    { id: "recalque", titulo: "Recalque" },
    { id: "aq", titulo: "Água quente" },
    { id: "ap", titulo: "Águas pluviais e aproveitamento de água de chuva" },
    { id: "incendio", titulo: "Incêndio (hidrantes, extintores e reserva técnica)" },
    { id: "tratamento", titulo: "Tratamento (fossa, ETE ou ETA) e unidades cotadas" },
    { id: "industrial", titulo: "Fluidos industriais (ar comprimido, vapor, óleo, gás)" },
    { id: "gas", titulo: "Gás combustível (GLP) — abrigo e rede embutida" },
    { id: "clima", titulo: "Climatização" },
    { id: "materiais", titulo: "Materiais e peças especificados" },
    { id: "verificacoes", titulo: "Verificações" },
    { id: "decisoes", titulo: "Decisões de projeto" },
    { id: "pendencias", titulo: "Avisos e pendências" },
    { id: "conclusao", titulo: "Conclusão" },
    { id: "referencias", titulo: "Referências" },
    { id: "termo", titulo: "Responsabilidade técnica" }
  ];
  function S(id) { for (var i = 0; i < SECOES.length; i++) if (SECOES[i].id === id) return i + 1; return "—"; }

  function Doc() { this.nTab = 0; this.avisos = []; this.conf = []; this.naoAbr = []; }
  Doc.prototype.tab = function (legenda, cab, linhas, op) {
    op = op || {};
    if (!linhas || !linhas.length) return op.vazio ? '<p class="nota">' + op.vazio + "</p>" : "";
    this.nTab++;
    var h = '<table class="t' + (op.classe ? " " + op.classe : "") + (linhas.length <= 10 ? " curta" : "") + '"><caption><b>Tabela ' + this.nTab + "</b> — " + legenda + "</caption>";
    if (cab) h += "<thead><tr>" + cab.map(function (c) { return typeof c === "string" ? "<th>" + c + "</th>" : '<th class="' + c.c + '">' + c.t + "</th>"; }).join("") + "</tr></thead>";
    h += "<tbody>" + linhas.join("") + "</tbody></table>";
    if (op.nota) h += '<p class="nota">' + op.nota + "</p>";
    return h;
  };
  Doc.prototype.aviso = function (x) { if (this.avisos.indexOf(x) < 0) this.avisos.push(x); };
  Doc.prototype.conferir = function (id, ok, texto) { this.conf.push({ id: id, ok: !!ok, texto: texto }); if (!ok) this.aviso("Conferência falhou — " + texto); };
  Doc.prototype.naoAbrangido = function (x) { if (this.naoAbr.indexOf(x) < 0) this.naoAbr.push(x); };
  function td(h, cls) { return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + (h == null ? "" : h) + "</td>"; }
  function tn(h) { return td(h, "n"); }
  function trw(cells, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" + cells.join("") + "</tr>"; }
  function thn(tx) { return { t: tx, c: "n" }; }
  function h3(tx) { return "<h3>" + tx + "</h3>"; }
  function caixa(h, tipo) { return '<div class="caixa' + (tipo ? " " + tipo : "") + '">' + h + "</div>"; }
  function naoAbrCaixa(d, tx, item) { d.naoAbrangido(item || tx); return caixa("<b>Não abrangido nesta emissão.</b> " + tx, "neutra"); }
  /* situação: pendente NUNCA vira OK */
  function sit(status) {
    if (status === "ok") return '<span class="ok">OK</span>';
    if (status === "reprovado") return '<span class="falha">NÃO ATENDE</span>';
    if (status === "pendente") return '<span class="pend">PENDENTE</span>';
    if (status === "nao_aplicavel") return '<span class="neutro">NÃO SE APLICA</span>';
    return '<span class="pend">NÃO VERIFICADO</span>';
  }
  function clsLinha(status) { return status === "reprovado" ? "linha-falha" : (status === "pendente" ? "linha-alerta" : ""); }
  function tipoFonte(f) { f = obj(f); return f.tipo === "primaria" ? "primária" : (f.tipo === "secundaria" ? "SECUNDÁRIA" : "não informado"); }
  function fonteCurta(f) {
    f = obj(f);
    if (!f.chave && !f.norma) return "—";
    return t([f.norma, f.edicao ? "ed. " + f.edicao : "", f.tabela ? "tab. " + f.tabela : "", f.pagina ? "p. " + f.pagina : ""].filter(Boolean).join(", ")) + " <i>(" + tipoFonte(f) + ")</i>";
  }
  function passosLista(p, onde) { p = arr(p); return p.length ? p.map(function (x) { return t(x, onde); }).join("<br>") : "—"; }
  function dedupSeq(l) { var o = []; arr(l).forEach(function (x) { if (o[o.length - 1] !== x) o.push(x); }); return o; }
  function faltaTxt(chaves) { return arr(chaves).length ? "não verificado: falta " + arr(chaves).map(function (k) { return "<code>" + esc(k) + "</code>"; }).join(", ") : ""; }

  /* ================================================================ CONTEXTO */
  function contexto(r, op) {
    var ob = obj(op.obra), rp = obj(op.responsavel), dc = obj(op.documento);
    var af = obj(obj(r.sistemas).agua_fria), es = obj(obj(r.sistemas).esgoto);
    return {
      r: r, op: op, ob: ob, rp: rp, d: dc,
      obraNome: ob.nome ? String(ob.nome) : "[OBRA]",
      num: dc.numero || "", rev: dc.revisao || "R00", data: dataTxt(dc.data),
      af: af, es: es, rc: r.recalque && typeof r.recalque === "object" ? r.recalque : null,
      aq: obj(r.sistemas).agua_quente && typeof r.sistemas.agua_quente === "object" ? r.sistemas.agua_quente : null,
      ap: obj(r.sistemas).pluvial && typeof r.sistemas.pluvial === "object" ? r.sistemas.pluvial : null,
      inc: obj(r.sistemas).incendio && typeof r.sistemas.incendio === "object" ? r.sistemas.incendio : null,
      tr: obj(r.sistemas).tratamento && typeof r.sistemas.tratamento === "object" ? r.sistemas.tratamento : null,
      ind: obj(r.sistemas).industrial && typeof r.sistemas.industrial === "object" ? r.sistemas.industrial : null,
      gas: obj(r.sistemas).gas && typeof r.sistemas.gas === "object" ? r.sistemas.gas : null,
      verifs: objs(r.verificacoes), fixture: r.fixture === true,
      clima: op.clima && typeof op.clima === "object" && Array.isArray(op.clima.ambientes) ? op.clima : null
    };
  }
  /* ITENS A CONFIRMAR (F8, 28/10/2026): o que o cálculo não fechou por falta de dado/fonte, cada um com a premissa adotada.
     Entra na capa ("com N itens a confirmar"), na conclusão e no quadro da seção "Confirmações do responsável técnico".
     Reprovação de cálculo NÃO é item a confirmar: continua sendo "Não atende". */
  var ROT_CHAVE = { "af.aparelhos": "tabela de aparelhos de água fria", "es.aparelhos": "tabela de aparelhos de esgoto", "ind.dilatacao.pontos_fixos": "distância máxima entre pontos fixos (dilatação da tubulação)", "ap.condutor_vertical.abacos": "ábaco do condutor vertical", "entrada.alimentador": "alimentador predial" };
  function chaveHumana(x) {
    return String(x == null ? "" : x).replace(/\[([a-z_]+)=([^\]]*)\]/g, function (m, k, v) { return "(" + k.replace(/_/g, " ") + ": " + v.replace(/_/g, " ") + ")"; }).replace(/\b([a-z]{2,}(?:\.[a-z][a-z_0-9]*)+)(\[[^\]]*\])?/g, function (m, k, q) {
      var r = ROT_CHAVE[k] || k.split(".").pop().replace(/_/g, " ");
      return r + (q ? " (" + q.slice(1, -1).replace(/=/g, ": ").replace(/_/g, " ") + ")" : "");
    });
  }
  var PREMISSA_PADRAO = "Prevalece o dimensionamento adotado no projeto; o responsável técnico confere este item antes da execução e registra a confirmação.";
  /* premissa por tipo de item (o que o projeto ADOTA enquanto o dado/fonte não chega); sem tipo conhecido, a padrão. Nenhum valor de norma aqui. */
  var PREMISSA_TIPO = [
    [/ducha/i, "Adotados a vazão e o peso da ficha do fabricante da ducha higiênica instalada (valor a registrar pelo responsável técnico na compra); a rede segue dimensionada com esse ponto."],
    [/[áa]baco|condutor vertical/i, "Condutores verticais conferidos pela tabela de capacidade disponível (fonte secundária), com folga nas verificações; o ábaco da norma é conferido pelo responsável técnico."],
    [/pontos fixos|dilata/i, "Rede embutida em parede e piso, sem trecho aparente: a verificação é tratada como não aplicável; o responsável técnico confirma."],
    [/alimentador/i, "Pressão mínima da rede pública e traçado do ramal a obter da concessionária; o projeto prevê a espera da boia na cota indicada e o alimentador é dimensionado com esses dados."],
    [/press[ãa]o din[âa]mica|press[ãa]o m[íi]nima/i, "Pressão dinâmica a conferir pelo responsável técnico no ponto mais desfavorável (vazão de projeto, perdas e a carga das caixas indicada nas pranchas) antes da execução."]
  ];
  function premissaDe(item, dada) {
    if (dada) return dada;
    for (var i = 0; i < PREMISSA_TIPO.length; i++) if (PREMISSA_TIPO[i][0].test(item)) return PREMISSA_TIPO[i][1];
    return PREMISSA_PADRAO;
  }
  /* Casa 487 (F9): a mesma questão aparecia 2 vezes (a pendência de fonte e a verificação não concluída): um item por TEMA, com rótulo curto */
  var TEMAS_CONFIRMAR = [[/[áa]bacos?/i, "Condutor vertical pelo ábaco da NBR 10844"], [/pontos fixos/i, "Distância máxima entre pontos fixos da tubulação de cobre (dilatação)"],
                         [/alimentador predial|pressão mínima da rede pública/i, "Alimentador predial: pressão mínima da rede pública e traçado do ramal (concessionária)"]];
  /* rótulo curto do TEMA (ábaco, pontos fixos, alimentador) para a prancha: o texto cru da pendência cita fontes e figuras que não são do cliente */
  function rotuloTema(x) { for (var ti = 0; ti < TEMAS_CONFIRMAR.length; ti++) if (TEMAS_CONFIRMAR[ti][0].test(String(x))) return TEMAS_CONFIRMAR[ti][1]; return null; }
  function itensConfirmar(r, k) {
    var out = [], vistos = {}, grupos = {}, temasVistos = {};
    function add(item, motivo, premissa) {
      var it = chaveHumana(limpaFonte(item)).replace(/\s+/g, " ").trim(); if (!it || vistos[it]) return;
      for (var ti = 0; ti < TEMAS_CONFIRMAR.length; ti++) if (TEMAS_CONFIRMAR[ti][0].test(it)) { if (temasVistos[ti]) return; temasVistos[ti] = 1; it = TEMAS_CONFIRMAR[ti][1]; break; }
      if (vistos[it]) return;
      /* a mesma verificação em vários alvos ("… — gas-t1", "… — gas-t4") vira UM item com a lista dos alvos */
      var m = /^(.*?)\s+—\s+(\S+)$/.exec(it);
      if (m) {
        var g = grupos[m[1] + "|" + motivo];
        if (g) { if (g.alvos.indexOf(m[2]) < 0) g.alvos.push(m[2]); vistos[it] = 1; return; }
        grupos[m[1] + "|" + motivo] = { alvos: [m[2]], idx: out.length };
        vistos[it] = 1; out.push({ item: it, base: m[1], motivo: chaveHumana(limpaFonte(motivo || "")).trim(), premissa: limpaFonte(premissaDe(m[1], premissa)) }); return;
      }
      vistos[it] = 1; out.push({ item: it, motivo: chaveHumana(limpaFonte(motivo || "")).trim(), premissa: limpaFonte(premissaDe(it, premissa)) });
    }
    objs(obj(r).premissas).filter(function (p) { return p.origem === "confirmacao_rt"; }).forEach(function (p) { add(p.item, p.projeto ? "item do projeto a confirmar com o responsável técnico" : "", p.valor); });
    objs(obj(r).pendencias).forEach(function (p) { add(p.texto || p.motivo || p.chave, "dado ou fonte não disponível", p.premissa); });
    objs(obj(r).verificacoes).filter(function (v) { return v.status === "pendente"; }).forEach(function (v) { add(String(v.nome || v.id || "") + (v.alvo ? " — " + v.alvo : ""), "verificação não concluída por falta de dado", v.premissa); });
    if (k) {
      objs(k.pendencias).forEach(function (p) { add("Climatização: " + (p.texto || p.motivo || p.chave), "dado ou fonte não disponível", p.premissa); });
      objs(k.verificacoes).filter(function (v) { return v.status === "pendente"; }).forEach(function (v) { add("Climatização: " + String(v.nome || v.id || "") + (v.alvo ? " — " + v.alvo : ""), "verificação não concluída por falta de dado", v.premissa); });
    }
    Object.keys(grupos).forEach(function (kk) { var g = grupos[kk], o = out[g.idx]; if (g.alvos.length > 1) o.item = o.base + " — " + g.alvos.join(", "); });
    return out;
  }
  /* situação da climatização (resultado do ClimDimensionar), para a capa e a conclusão do memorial único */
  function climaSit(c) {
    var k = c.clima; if (!k) return null;
    var rep = objs(k.verificacoes).filter(function (v) { return v.status === "reprovado"; }).length + objs(k.avisos).filter(function (a) { return a.gravidade === "erro"; }).length;
    var pen = objs(k.pendencias).length + objs(k.verificacoes).filter(function (v) { return v.status === "pendente"; }).length;
    return { rep: rep, pen: pen, fixture: k.fixture === true, ok: k.ok === true && !rep && !pen };
  }
  /* os sistemas que o resultado TRAZ (o memorial único fala deles; os ausentes saem numa linha, sem página própria) */
  var NOMES_SIS = { af: "água fria", es: "esgoto sanitário com ventilação", recalque: "recalque", aq: "água quente", ap: "águas pluviais", incendio: "incêndio", tratamento: "tratamento de esgoto/água", industrial: "fluidos industriais", gas: "gás GLP", clima: "climatização" };
  function presentes(c) {
    var o = [];
    if (objs(c.af.trechos).length || objs(c.af.pontos).length) o.push("af");
    if (objs(c.es.trechos).length) o.push("es");
    if (c.rc) o.push("recalque"); if (c.aq) o.push("aq"); if (c.ap) o.push("ap"); if (c.inc) o.push("incendio"); if (c.tr) o.push("tratamento"); if (c.ind) o.push("industrial"); if (c.gas) o.push("gas"); if (c.clima) o.push("clima");
    return o;
  }
  function ausente(c, id) { var DEP = { recalque: "rc", aq: "aq", ap: "ap", incendio: "inc", tratamento: "tr", industrial: "ind", gas: "gas", clima: "clima" }; return DEP[id] ? !c[DEP[id]] : false; }
  function listaPt(l) { return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : (l[0] || ""); }
  function seloFixture(c) {
    return c.fixture ? caixa("<b>TABELAS DE TESTE — NÃO É NORMA.</b> Este resultado foi calculado com tabelas de teste (fixture) e <b>não pode ser usado como memorial de projeto</b>. Os valores abaixo servem só para conferir o funcionamento do cálculo.", "erro") : "";
  }

  /* ================================================================ CAPA */
  function logoBox(src, rot, alt) {
    /* sem imagem: a RA sai com o nome por extenso; contratante/proprietário sem logo NÃO deixam caixa nem "[LOGO]" (pessoa física não tem logo) */
    if (!imgOk(src)) return alt === "RA Engenharia" ? '<div class="logo-box"><div class="logo-txt">RA Engenharia Especial</div><div class="logo-rot">' + esc(rot) + "</div></div>" : "";
    return '<div class="logo-box"><img class="logo" src="' + esc(src) + '" alt="' + esc(alt) + '"><div class="logo-rot">' + esc(rot) + "</div></div>";
  }
  function situacaoGeral(c) {
    var r = c.r, rep = c.verifs.filter(function (v) { return v.status === "reprovado"; }).length, pen = arr(r.pendencias).length + c.verifs.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = arr(r.avisos).filter(function (a) { return a.gravidade === "erro"; }).length;
    var ks = climaSit(c);
    if (ks) { rep += ks.rep; pen += ks.pen; if (ks.fixture) return { ok: false, txt: '<span class="falha">NÃO É NORMA</span> — climatização calculada com tabelas de teste' }; }
    if (c.fixture) return { ok: false, txt: '<span class="falha">NÃO É NORMA</span> — calculado com tabelas de teste' };
    /* STATUS = o cálculo real (F8, 28/10/2026): reprovação/erro de cálculo → "Não atende"; só item de fonte/confirmação →
       "Emitido para execução — com N itens a confirmar"; nada → "Atende". Continua proibido dizer "Atende" com item a confirmar. */
    var itens = itensConfirmar(r, c.clima);
    if (rep || erros) {
      return { ok: false, tipo: "reprovado", n: itens.length, txt: '<span class="falha">Não atende — ver seção ' + S("pendencias") + "</span>: " +
        [rep ? plural(rep, "verificação reprovada", "verificações reprovadas") : "", itens.length ? plural(itens.length, "item a confirmar", "itens a confirmar") : "", erros ? plural(erros, "aviso de erro", "avisos de erro") : ""].filter(Boolean).join("; ") + "." };
    }
    if (itens.length) {
      return { ok: false, tipo: "emitido", n: itens.length, txt: '<span class="pend">' + (global.HidStatusEmissao || "Emitido para execução") + ' — com ' + plural(itens.length, "item a confirmar", "itens a confirmar") + "</span> (ver quadro na seção " + S("confirmacoes") + ")." };
    }
    if (r.ok !== true || (ks && !ks.ok)) {
      return { ok: false, tipo: "incompleto", n: 0, txt: '<span class="falha">Não verificado — situação incompleta</span> (ver seção ' + S("pendencias") + ")." };
    }
    return { ok: true, tipo: "atende", n: 0, txt: '<span class="ok">Atende — todas as verificações desta emissão atendem</span>; partes não abrangidas na seção ' + S("pendencias") + "." };
  }
  function capa(c) {
    var op = c.op, lg = obj(op.logos), ob = c.ob, rp = c.rp, g = situacaoGeral(c);
    var revs = objs(op.revisoes);
    if (!revs.length) revs = [{ rev: c.rev, data: c.data, descricao: "Emissão inicial" }];
    return '<section class="capa" id="sec-capa">' +
      '<div class="capa-logos">' + logoBox(lg.ra, "Projeto e cálculo", "RA Engenharia") + logoBox(lg.contratante, "Contratante", "Contratante") + (lg.proprietario && lg.proprietario !== lg.contratante ? logoBox(lg.proprietario, "Proprietário", "Proprietário") : "") + "</div>" +
      '<div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Instalações hidrossanitárias' + (c.clima ? " e climatização" : "") + " — " + esc(c.obraNome) + "</h1>" +
      '<div class="sub">' + esc((function (l) { var x = listaPt(l.map(function (k) { return NOMES_SIS[k]; })); return x ? x.charAt(0).toUpperCase() + x.slice(1) : "Sistemas prediais"; })(presentes(c))) + "</div></div>" +
      (c.fixture ? '<div class="capa-sit">TABELAS DE TESTE — NÃO É NORMA — NÃO USAR COMO MEMORIAL DE PROJETO</div>' : "") +
      (c.d.situacao ? '<div class="capa-sit2">' + t(c.d.situacao) + "</div>" : "") +
      '<div class="capa-vazio"></div>' +
      '<table class="capa-ficha"><tbody>' +
      "<tr><td>Documento</td><td><b>" + ph(c.num, "Nº DO DOCUMENTO") + " " + esc(c.rev) + "</b> — " + esc(c.data) + "</td></tr>" +
      "<tr><td>Obra</td><td>" + ph(ob.nome, "OBRA") + "</td></tr>" +
      "<tr><td>Endereço</td><td>" + ph(enderecoTxt(ob), "ENDEREÇO") + "</td></tr>" +
      "<tr><td>Proprietário</td><td>" + ph(ob.proprietario || ob.cliente, "PROPRIETÁRIO") + "</td></tr>" +
      (ob.contratante && ob.contratante !== (ob.proprietario || ob.cliente) ? "<tr><td>Contratante</td><td>" + ph(ob.contratante, "CONTRATANTE") + "</td></tr>" : "") +
      "<tr><td>Responsável técnico</td><td>" + ph(rp.abrev || rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME") + " — " + esc(creaTxt(rp)) + " — " + ph(rp.empresa, "EMPRESA") + (rp.cnpj ? " (CNPJ " + esc(rp.cnpj) + ")" : "") + "</td></tr>" +
      "<tr><td>Situação do cálculo</td><td" + (g.ok ? "" : ' class="sit-falha"') + ">" + g.txt + "</td></tr>" +
      "</tbody></table>" +
      '<table class="capa-rev"><caption>Quadro de revisões</caption><thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Por</th></tr></thead><tbody>' +
      revs.map(function (x) { return "<tr><td>" + esc(x.rev) + "</td><td>" + esc(x.data) + "</td><td>" + t(x.descricao) + "</td><td>" + esc(x.por || "") + "</td></tr>"; }).join("") + "</tbody></table>" +
      "</section>";
  }
  function sumario(c, d) {
    return '<section class="sumario" id="sumario"><h2 class="sem-num">Sumário</h2><ol class="sum">' +
      SECOES.map(function (s, i) { return '<li><a href="#sec-' + s.id + '"><span class="sn">' + (i + 1) + "</span>" + esc(s.titulo) + "</a></li>"; }).join("") + "</ol>" +
      '<p class="nota">Este memorial contém ' + SECOES.length + " seções numeradas e " + d.nTab + " tabelas. Documento " + esc(c.num) + " " + esc(c.rev) + " de " + esc(c.data) + ".</p></section>";
  }

  /* ================================================================ 1 OBJETO */
  function secObjeto(c, d) {
    var r = c.r, rs = obj(r.resumo), h = seloFixture(c);
    h += "<p>Este memorial apresenta o dimensionamento das instalações prediais da obra <b>" + ph(c.ob.nome, "OBRA") + "</b>: " + esc(listaPt(presentes(c).map(function (k) { return NOMES_SIS[k]; })) || "água fria e esgoto sanitário") + ". Os valores vêm do cálculo executado sobre o modelo; este documento apresenta, por extenso, o que foi calculado, com que dados e com que fonte, e <b>não recalcula</b>.</p>";
    h += d.tab("Resumo do cálculo", ["Item", thn("Quantidade")], [
      trw([td("Trechos de água fria"), tn(br(fin(rs.trechosAF) ? rs.trechosAF : arr(c.af.trechos).length, 0))]),
      trw([td("Trechos de esgoto"), tn(br(fin(rs.trechosES) ? rs.trechosES : arr(c.es.trechos).length, 0))]),
      trw([td("Trechos com DN alterado pelo cálculo (a aplicar no modelo)"), tn(br(fin(rs.alterados) ? rs.alterados : arr(r.ops).length, 0))]),
      trw([td("Verificações"), tn(br(c.verifs.length, 0))]),
      trw([td("Verificações que não atendem"), tn(br(c.verifs.filter(function (v) { return v.status === "reprovado"; }).length, 0))], c.verifs.some(function (v) { return v.status === "reprovado"; }) ? "linha-falha" : ""),
      trw([td("Verificações pendentes (não verificado)"), tn(br(c.verifs.filter(function (v) { return v.status === "pendente"; }).length, 0))]),
      trw([td("Valores de norma pendentes (chaves)"), tn(br(arr(r.pendencias).length, 0))], arr(r.pendencias).length ? "linha-alerta" : "")
    ], { classe: "ficha", nota: "Situação por sistema — água fria: " + sit(c.af.status) + "; esgoto: " + sit(c.es.status) + "; recalque: " + (c.rc ? sit(c.rc.status) : "não calculado") + "." });
    var pr = presentes(c), aus = ["recalque", "aq", "ap", "incendio", "tratamento", "industrial", "clima"].filter(function (k) { return pr.indexOf(k) < 0; });
    h += "<p><b>Sistemas calculados nesta emissão:</b> " + esc(listaPt(pr.map(function (k) { return NOMES_SIS[k]; }))) + "." + (aus.length ? " Sistemas não presentes no modelo (seções sem cálculo, mantidas para a numeração): " + esc(listaPt(aus.map(function (k) { return NOMES_SIS[k]; }))) + "." : "") + "</p>";
    return h;
  }

  /* Casa 487 (F9): a NR-24 é de local de TRABALHO; numa residência não se aplica — a tabela do programa de necessidades que a cita não vai à lista de normas do cliente */
  function semNr24(ns) { return ns.filter(function (n) { return !/^\s*NR-24\b/.test(String(n && n.doc || "")); }); }
  /* ================================================================ 2 NORMAS */
  function secNormas(c, d) {
    var r = c.r, ns = semNr24(objs(r.normas)), h = seloFixture(c);
    if (!ns.length) return h + naoAbrCaixa(d, "o resultado não trouxe a lista de tabelas de norma utilizadas; nenhum valor de norma pode ser atribuído a uma fonte neste documento.", "lista de normas e tabelas utilizadas");
    var sec = ns.filter(function (n) { return n.tipo === "secundaria"; }).length, pri = ns.filter(function (n) { return n.tipo === "primaria"; }).length;
    h += "<p>Foram utilizadas " + plural(ns.length, "tabela", "tabelas") + " de norma: " + plural(pri, "de fonte primária", "de fonte primária") + " (texto da norma consultado) e " + plural(sec, "de fonte secundária", "de fonte secundária") + " (transcrição de terceiros, com página).</p>";
    if (sec) h += caixa("<b>Fonte secundária.</b> " + plural(sec, "tabela vem", "tabelas vêm") + " de transcrição de terceiros. Cada valor deve ser conferido no texto da norma antes da assinatura do projeto.", "alerta");
    /* a ressalva de exemplar (cópia sem licença) é controle INTERNO da RA, não entra no documento do cliente (F8, 28/10/2026) */
    h += d.tab("Tabelas de norma utilizadas", ["Título", "Norma / edição", "Documento de origem", "Tabela / página", "Tipo de fonte"],
      ns.map(function (n) {
        return trw([td(t(n.titulo, "normas")), td(t(n.norma, "normas") + (n.edicao ? ", ed. " + t(n.edicao, "normas") : "")),
          td(t(n.doc, "normas")), td(t([n.tabela, n.pagina ? "p. " + n.pagina : ""].filter(Boolean).join(", ") || "—", "normas")),
          td((n.tipo === "primaria" ? "primária" : (n.tipo === "secundaria" ? '<b class="alerta-tx">secundária</b>' : "não informado")) + linkNorma(c, n.norma))], n.tipo === "secundaria" ? "linha-alerta" : "");
      }), { classe: "normas compacta" });
    return h;
  }

  /* página da norma no catálogo da ABNT — SÓ a URL que o registro conferido traz (js/hiddoclinks.js); sem registro, nada */
  function linkNorma(c, norma) {
    var L = c.op.links || global.HidDocLinks || null, u = L && L.norma ? L.norma(norma) : null;
    /* o catálogo da ABNT não tem endereço fixo por norma (18/10/2026): link ao catálogo + a edição vigente conferida */
    return u ? '<br><small><a href="' + esc(u.url) + '">catálogo ABNT</a>: vigente ' + esc(u.edicao) + (u.emVigor === false ? " (fora de vigor)" : "") + "</small>" : "";
  }

  /* ================================================================ 3 PREMISSAS */
  function secConfirmacoes(c, d) {
    var itens = itensConfirmar(c.r, c.clima);
    if (!itens.length) return seloFixture(c) + "<p>Nenhum item a confirmar nesta emissão: todas as verificações têm dado e fonte.</p>";
    return seloFixture(c) + "<p>Itens que o cálculo não fecha sozinho (dado do local, da concessionária ou do fabricante, ou fonte fora do acervo). Para cada um está a premissa adotada no projeto; o responsável técnico confirma antes da execução.</p>" +
      d.tab("Itens a confirmar, com a premissa adotada", ["#", "Item a confirmar", "Por quê", "Premissa adotada", "Confirma"],
        itens.map(function (x, i) { return trw([td(String(i + 1)), td(t(x.item, "confirmações")), td(t(x.motivo || "—", "confirmações")), td(t(x.premissa, "confirmações")), td("Responsável técnico")], "linha-alerta"); }), { classe: "compacta" });
  }
  function secPremissas(c, d) {
    var r = c.r, h = seloFixture(c), af = c.af;
    var dec = [];
    if (af.metodoVazao === "pesos") dec.push("<b>Vazão de projeto da água fria:</b> método dos pesos da NBR 5626:1998 (Anexo A), Q = C·√ΣP, adotado como <b>método reconhecido</b>. A NBR 5626:2020 retirou o roteiro e as tabelas de pesos e deixa a escolha do método ao projetista. No ramal de um aparelho só, Q não fica abaixo da vazão daquele aparelho.");
    else if (af.metodoVazao) dec.push("<b>Vazão de projeto da água fria:</b> método <i>" + t(af.metodoVazao, "premissas") + "</i>, conforme escolhido nas opções do cálculo.");
    if (c.es.trechos && c.es.trechos.length) dec.push("<b>Esgoto:</b> dimensionamento pelo <b>método tabular</b> da NBR 8160 (unidades Hunter de contribuição × diâmetro). O método hidráulico (anexos B e D) não foi aplicado nesta emissão.");
    if (af.formulaPerda) dec.push("<b>Perda de carga distribuída:</b> " + t(af.formulaPerda, "premissas") + " (fórmula adotada por material). A fórmula de Fair-Whipple-Hsiao é utilizada com os coeficientes tabelados quando não há rugosidade tabelada para o material.");
    dec.push("<b>Perdas localizadas:</b> por comprimento equivalente (ou coeficiente K) da tabela de norma indicada na seção " + S("normas") + ". Luvas e reduções são tratadas como <b>perda desprezada</b> (sem comprimento equivalente nas tabelas utilizadas); registro de pressão considerado como globo aberto e retenção como tipo pesado, as maiores perdas. Tubulação de <b>PPR</b>: método do fabricante, Δh = ΣK·v²/2g com o coeficiente K de cada conexão (sem converter em comprimento equivalente); conexão sem K no manual do fabricante fica <b>pendente</b>.");
    dec.push("<b>Pressão mínima por ponto:</b> vale a maior entre a mínima da tabela de norma e a requerida pela peça no catálogo do fabricante, quando existir.");
    dec.push("<b>Exceção da NBR 5626:2020</b> à pressão mínima de 5 kPa (trechos verticais de tomada d'água na saída de reservatório elevado): <b>não aplicada</b>; o cálculo avisa o ponto e quanto subir o nível, e a decisão é do responsável técnico.");
    h += "<p>As decisões abaixo foram tomadas pelo projeto e valem para todo o cálculo:</p><ol class=\"regras\">" + dec.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>";
    /* PROJETO INTELIGENTE (js/hidkit.js, js/hidambiente.js): o que o sistema decidiu sozinho ao posicionar os aparelhos e ligar
       os ambientes — válvula e prumada, alturas dos pontos, posição da caixa sifonada, ventilação (distâncias da NBR 8160), espera
       do ramal. Cada linha diz a fonte; o que ficou sem fonte aparece como pendência (nunca vira número). */
    var da = objs(r.decisoesAutomaticas);
    if (da.length) h += '<p>As decisões que o sistema tomou ao posicionar os aparelhos e ligar os ambientes (válvula e prumada, alturas dos pontos, caixa sifonada, ventilação, esperas) estão na <a href="#sec-decisoes">seção ' + S("decisoes") + "</a>, com a fonte de cada uma.</p>";
    var pr = objs(r.premissas).filter(function (p) { return p.origem !== "confirmacao_rt"; }).concat(objs(af.premissas)).concat(c.es.premissas ? objs(c.es.premissas) : []).concat(c.rc ? objs(c.rc.premissas) : []);
    h += d.tab("Premissas registradas pelo cálculo", ["Item", "Valor", "Origem"],
      pr.map(function (p) { return trw([td(t(p.item, "premissas")), td(t(p.valor, "premissas")), td(p.origem === "entrada" ? "dado de entrada" : (p.origem === "norma" ? "tabela de norma" : (p.origem === "padrao_motor" ? "padrão do cálculo" : (p.origem === "criterio_projetista" ? "critério do projetista (não normativo)" : t(p.origem || "—")))))]); }),
      { classe: "compacta", vazio: "O resultado não registrou premissas." });
    var o = obj(r.opcoes); void o;
    h += "<p>Temperatura da água: " + un(af.temperatura_C, 0, "°C") + "; massa específica " + un(obj(af.fluido).rho, 2, "kg/m³") + "; viscosidade cinemática " + (fin(obj(af.fluido).nu) ? br(obj(af.fluido).nu * 1e6, 4) + NB + "mm²/s" : "—") + (obj(af.fluido).fonte ? " (fonte: " + t(af.fluido.fonte, "premissas") + ")." : ".") + "</p>";
    /* CRITÉRIO DE PROJETISTA (js/hidcriterios.js): a qualidade do traçado do modelo e o que um projetista conferiria */
    var Q = c.op.criterios;
    if (Q && typeof Q === "object" && Q.apontamentos) {
      var rotG = { dura: "PROIBIDO", alerta: "alerta", sugestao: "sugestão" };
      h += "<h3>Qualidade do traçado (critério de projetista)</h3><p>Nota <b>" + esc(String(Q.nota)) + "/100</b> (" + esc(Q.conceito) + ") — " + Q.contagem.dura + " proibido(s), " + Q.contagem.alerta + " alerta(s), " + Q.contagem.sugestao + " sugestão(ões). Critérios em docs/hidro/CRITERIOS-DE-PROJETISTA.md (fonte de cada regra na tabela).</p>";
      if (Q.apontamentos.length) h += d.tab("Apontamentos do critério de projetista", ["Gravidade", "Apontamento", "Fonte"], Q.apontamentos.map(function (a) { return trw([td(rotG[a.gravidade] || a.gravidade), td("<b>" + esc(a.titulo) + ":</b> " + esc(a.texto)), td(esc(a.fonte))]); }), { classe: "compacta", vazio: "Nenhum." });
    }
    return h;
  }

  /* ================================================================ 4 PROGRAMA */
  function secPrograma(c, d) {
    var p = c.r.programa, h = seloFixture(c);
    if (!p || typeof p !== "object") return h + naoAbrCaixa(d, "o cálculo foi executado sem programa de necessidades (uso, população, consumo e reservação).", "programa de necessidades (população, consumo diário e reservação)");
    h += "<p>Uso: <b>" + t(p.uso, "programa") + "</b>. Situação do programa: " + sit(p.status) + ".</p>";
    var pop = obj(p.populacao), cons = obj(p.consumoDiario), res = obj(p.reservacao);
    h += d.tab("População, consumo diário e reservação", ["Grandeza", thn("Valor"), "Cálculo", "Fonte"], [
      trw([td("População"), tn(pop.status === "pendente" ? "não verificado" : un(pop.valor, 0, "pessoas")), td(passosLista(pop.passos, "programa")), td(fonteCurta(pop.fonte))], clsLinha(pop.status)),
      trw([td("Consumo diário"), tn(cons.status === "pendente" ? "não verificado" : un(cons.L, 0, "L/dia")), td(passosLista(cons.passos, "programa")), td(fonteCurta(cons.fonte))], clsLinha(cons.status)),
      trw([td("Reservação mínima"), tn(res.status === "pendente" ? "não verificado" : un(res.minimo_L, 0, "L")), td(passosLista(res.passos, "programa")), td(fonteCurta(res.fonte))], clsLinha(res.status)),
      trw([td("Reservação máxima"), tn(res.status === "pendente" ? "não verificado" : un(res.maximo_L, 0, "L")), td("—"), td("—")]),
      trw([td("Reserva de incêndio somada"), tn(un(res.incendio_L, 0, "L")), td(res.incendioOrigem ? t(res.incendioOrigem, "programa") : (res.incendio_L ? "informada na entrada" : "—")), td("—")]),
      trw([td("<b>Reservação total mínima</b>"), tn(res.status === "pendente" ? "não verificado" : "<b>" + un(res.total_min_L, 0, "L") + "</b>"), td("mínima + incêndio"), td("—")], "tot")
    ], { classe: "compacta" });
    var ap = objs(p.aparelhosMinimos);
    h += d.tab("Aparelhos mínimos × aparelhos do modelo", ["Aparelho", thn("Exigido"), thn("No modelo"), thn("Falta"), "Regra", "Fonte", "Situação"],
      ap.map(function (a) { return trw([td(t(a.aparelho, "programa")), tn(br(a.exigido, 0)), tn(br(a.noModelo, 0)), tn(br(a.falta, 0)), td(t(a.regra, "programa")), td(fonteCurta(a.fonte)), td(a.status === "ok" ? sit("ok") : (a.status === "pendente" ? sit("pendente") : '<span class="falha">FALTA</span>'))], a.falta > 0 ? "linha-falha" : clsLinha(a.status)); }),
      { classe: "compacta", vazio: "O programa não listou aparelhos mínimos para este uso (<b>não verificado</b>: falta <code>programa.aparelhos_minimos</code>)." });
    arr(p.pendencias).forEach(function (x) { d.naoAbrangido("programa: " + (typeof x === "string" ? x : (x && (x.chave || x.motivo)) || "pendência")); });
    return h;
  }

  /* ================================================================ 5 ÁGUA FRIA */
  function secAF(c, d) {
    var af = c.af, h = seloFixture(c);
    var trs = objs(af.trechos);
    if (!trs.length) return h + naoAbrCaixa(d, "o resultado não trouxe trechos de água fria.", "água fria (trechos)");
    var al = obj(af.alimentacao);
    h += "<p>Situação da água fria: " + sit(af.status) + ". Método de vazão: <b>" + t(af.metodoVazao || "—", "af") + "</b>. Fórmula de perda de carga: <b>" + t(af.formulaPerda || "—", "af") + "</b>.</p>";
    h += d.tab("Alimentação", ["Item", thn("Valor")], [
      trw([td("Tipo"), tn(t(al.tipo || "—", "af"))]),
      trw([td("Nó de partida"), tn(t(al.no || "—", "af"))]),
      trw([td("Cota da saída"), tn(un(al.cota, 2, "m"))]),
      trw([td("Cota do nível d'água mínimo"), tn(un(al.nivelAgua, 2, "m"))]),
      trw([td("Pressão disponível (rede pública)"), tn(un(al.pressao_kpa, 1, "kPa"))])
    ], { classe: "ficha", nota: al.aviso ? "<b>Aviso:</b> " + t(al.aviso, "af") : "" });
    h += h3(S("af") + ".1 Dimensionamento trecho a trecho");
    h += d.tab("Água fria — dimensionamento por trecho (montante → jusante)",
      ["Trecho", "De → para", "Mat.", thn("DN modelo"), thn("DN calc."), thn("Di (mm)"), thn("L (m)"), thn("Desn. (m)"), thn("ΣP"), thn("Q (L/s)"), thn("v (m/s)"), thn("J (m/m)"), thn("hf (m)"), thn("P mont. (kPa)"), thn("P jus. (kPa)"), "Situação"],
      trs.map(function (x) {
        var pend = x.status === "pendente";
        return trw([td("<b>" + t(x.aresta || x.id, "af") + "</b>" + (x.travado ? " (travado)" : "")), td(t(x.de, "af") + " → " + t(x.para, "af")), td(t(x.material, "af")), tn(br(x.dnModelo, 0)), tn("<b>" + br(x.dn, 0) + "</b>"),
          tn(br(x.di_mm, 1)), tn(br(x.comprimento_m, 2)), tn(br(x.desnivel_m, 2)), tn(br(x.somaPesos, 2)), tn(br(x.vazao_ls, 3)), tn(br(x.velocidade_ms, 2)), tn(br(x.J_m_m, 4)), tn(br(x.perda_m, 3)),
          tn(br(x.pressaoMontante_kpa, 1)), tn(br(x.pressaoJusante_kpa, 1)), td(sit(x.status) + (pend && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status));
      }), { classe: "resumo", nota: "ΣP: soma dos pesos relativos acumulados a jusante. hf = perda distribuída + localizada. A pressão em kPa é dinâmica (com escoamento)." });
    h += h3(S("af") + ".2 Memória de cálculo por trecho");
    h += d.tab("Água fria — passos do cálculo", ["Trecho", "Conexões (perda localizada)", "Passos"],
      trs.map(function (x) {
        var cx = objs(x.conexoes).map(function (k) { return t(k.tipo, "af") + (fin(k.leq_m) ? " (Leq " + br(k.leq_m, 2) + " m)" : (fin(k.k) ? " (K " + br(k.k, 2) + ")" : "")) + ": " + br(k.perda_m, 4) + " m" + pecaTxt(k); });
        return trw([td("<b>" + t(x.aresta || x.id, "af") + "</b>"), td(cx.length ? cx.join("<br>") : "nenhuma"), td(passosLista(x.passos, "af trecho " + x.id))], clsLinha(x.status));
      }), { classe: "compacta" });
    var pts = objs(af.pontos);
    h += h3(S("af") + ".3 Pontos de utilização e pressões");
    h += d.tab("Pontos de utilização — pressão dinâmica × mínima",
      ["Ponto", "Aparelho", thn("Cota (m)"), thn("Q (L/s)"), thn("Peso"), thn("P dinâmica (kPa)"), thn("P estática (kPa)"), thn("P mínima (kPa)"), thn("η"), "Situação"],
      pts.map(function (p) {
        return trw([td(t(p.famInst || p.no, "af")), td(t(p.aparelho, "af")), tn(br(p.cota, 2)), tn(br(p.vazao_ls, 2)), tn(br(p.peso, 2)), tn(br(p.pressaoDinamica_kpa, 1)), tn(br(p.pressaoEstatica_kpa, 1)),
          tn(fin(p.pressaoMinima_kpa) ? br(p.pressaoMinima_kpa, 1) : "não verificado"), tn(br(p.eta, 2)), td(sit(p.status || (p.ok === true ? "ok" : (p.ok === false ? "reprovado" : "pendente"))))], clsLinha(p.status));
      }), { classe: "resumo", vazio: "O resultado não trouxe pontos de utilização (<b>não verificado</b>: pressão nos aparelhos).", nota: "η = pressão mínima ÷ pressão dinâmica disponível (≤ 1 atende)." });
    var pc = obj(af.pontoCritico);
    if (pc.no) {
      h += caixa("<b>Ponto mais desfavorável:</b> " + t(pc.famInst || pc.no, "af") + " (" + t(pc.aparelho || "—", "af") + "), folga de pressão de " + un(pc.folga_kpa, 2, "kPa") + ". Caminho crítico: " + dedupSeq(pc.caminho).map(function (x) { return t(x, "af"); }).join(" → ") + ".");
    } else if (pts.length) {
      h += naoAbrCaixa(d, "o resultado não identificou o ponto mais desfavorável.", "ponto mais desfavorável da água fria");
    }
    /* estática / VRP */
    var maxEst = null; pts.forEach(function (p) { if (fin(p.pressaoEstatica_kpa) && (maxEst === null || p.pressaoEstatica_kpa > maxEst)) maxEst = p.pressaoEstatica_kpa; });
    var vEst = c.verifs.filter(function (v) { return v.sistema === "agua_fria" && /est[áa]tic/i.test(String(v.nome)); });
    h += h3(S("af") + ".4 Pressão estática e válvula redutora (VRP)");
    if (vEst.length) {
      h += d.tab("Verificação da pressão estática", ["Alvo", thn("Valor"), thn("Limite"), thn("η"), "Situação", "Fonte"],
        vEst.map(function (v) { return trw([td(t(v.alvo, "af")), tn(v.status === "pendente" ? "não verificado" : un(v.valor, 1, v.unidade || "kPa")), tn(fin(v.limite) ? un(v.limite, 1, v.unidade || "kPa") : "—"), tn(br(v.eta, 2)), td(sit(v.status)), td(fonteCurta(v.fonte))], clsLinha(v.status)); }), { classe: "compacta" });
      if (vEst.some(function (v) { return v.status === "reprovado"; })) h += caixa("Há ponto com pressão estática acima do limite: prever válvula redutora de pressão (VRP) ou reservatório intermediário na(s) coluna(s) indicada(s).", "alerta");
    } else {
      h += naoAbrCaixa(d, "a verificação da pressão estática máxima não consta no resultado" + (maxEst !== null ? " (maior pressão estática calculada nos pontos: " + un(maxEst, 1, "kPa") + ")" : "") + " — não verificado: falta <code>af.pressao.estatica_maxima</code> ou o cálculo da verificação.", "verificação da pressão estática máxima (VRP)");
    }
    return h + secPressao(c, d);
  }
  /* PRESSURIZAÇÃO (js/hidpressao.js, 18/10/2026): memorial PARAMETRIZADO — entradas, seleção na curva de cada
     candidato, escolhido com o ponto de operação, verificação final da rede e especificação da instalação */
  function secPressao(c, d) {
    var PZ = global.HidPressao || (typeof require === "function" ? (function () { try { return require("./hidpressao.js"); } catch (e) { return null; } })() : null);
    var M = PZ && PZ.memorial ? PZ.memorial(c.r) : null; if (!M || !arr(M.secoes).length) return "";
    var h = h3(S("af") + ".5 Pressurização");
    M.secoes.forEach(function (s) {
      h += "<h4>" + esc(s.titulo) + "</h4>";
      arr(s.tabelas).forEach(function (tb) {
        h += d.tab(esc(tb.titulo), arr(tb.cab).map(esc), arr(tb.linhas).map(function (ln) { return trw(arr(ln).map(function (x) { return td(esc(x)); }), /não atende|não resolve/.test(arr(ln).join(" ")) ? "linha-falha" : ""); }), { classe: "compacta" });
      });
      arr(s.paragrafos).forEach(function (p) { h += "<p>" + esc(p) + "</p>"; });
    });
    return h;
  }

  /* ================================================================ 6 ESGOTO */
  /* a peça da ficha (js/hidpecas.js) que deu o coeficiente, com a fonte — "joelho90 … ← Joelho 90° PVC soldável DE 25 (Tigre, p. 36)" */
  function pecaTxt(k) {
    var p = obj(k.peca); if (!p.id) return "";
    var f = obj(k.fonteFicha), fo = f.doc ? String(f.doc).split(" (")[0].split(",")[0] + (f.pagina ? ", " + f.pagina : "") : "";
    return " <small class=\"peca\">← " + esc(p.descricao || p.id) + (fo ? " · " + esc(fo) : "") + (k.semValorTabelado ? " · sem valor tabelado (premissa)" : "") + "</small>";
  }
  /* MATERIAIS E PEÇAS ESPECIFICADOS — pedido do Rogério (17/10/2026): cada peça com o ícone renderizado, a descrição,
     o código, a norma do produto e o coeficiente usado no cálculo. A lista vem de opcoes.materiais (a tela monta com
     HidPecas.listaMaterial sobre o quantitativo do modelo); sem ela, das peças que o próprio resultado usou. Os ícones
     chegam em opcoes.icones ({ nome: data URL }) — o memorial sai com as imagens DENTRO (vale impresso e em PDF). */
  function secMateriais(c, d) {
    var PC = global.HidPecas || (typeof require === "function" ? (function () { try { return require("./hidpecas.js"); } catch (e) { return null; } })() : null);
    var ic = obj(c.op.icones), lista = objs(c.op.materiais), usadas = PC && PC.doResultado ? PC.doResultado(c.r) : [], h = "";
    if (!lista.length && usadas.length) lista = usadas.map(function (u) { var fc = PC.ficha(u.ficha); return { ficha: u.ficha, icone: u.icone, descricao: u.descricao, quantidade: null, unidade: fc ? fc.identificacao.unidade : "", fabricante: fc ? arr(fc.comercial.fabricante).map(function (x) { return x.fabricante + " " + x.codigo; }) : [], norma: u.norma, coeficientes: u.coeficientes, preco: fc ? PC.precoPara(fc) : null }; });
    if (!lista.length) return naoAbrCaixa(d, "o modelo não trouxe a lista de material e o resultado não usou peça com ficha técnica.", "materiais e peças especificados");
    var semIcone = 0;
    h += "<p>Peças do modelo com a ficha técnica do catálogo nativo (docs/hidro/CONTRATO.md §7): a imagem é a geometria da própria peça; o código SINAPI é o da composição da aplicação (data-base indicada) e o coeficiente é o que o cálculo leu da ficha, com a fonte.</p>";
    h += d.tab("Materiais e peças especificados", ["Peça", "Descrição", thn("Qtd."), "Fabricante (código)", "SINAPI (data-base)", "Norma do produto", "Coeficientes usados no cálculo (fonte)"],
      lista.map(function (l) {
        var src = l.icone ? ic[l.icone] : null; if (!src) semIcone++;
        var img = src && imgOk(src) ? '<img class="peca-ico" src="' + esc(src) + '" alt="' + esc(l.descricao) + '">' : '<span class="peca-ico vazio">sem ícone</span>';
        var pr = obj(l.preco), sin = pr.codigo ? "<b>" + esc(pr.codigo) + "</b>" + (pr.data ? " (" + esc(String(pr.data).split("-").reverse().join("/")) + ")" : "") : (pr.estimativa ? "sem composição própria (preço estimado pelo mais alto, ref. " + esc(pr.codigoReferencia || "") + ")" : '<span class="pend">não verificado: sem composição</span>');
        var co = objs(l.coeficientes).map(function (k) { return esc(k.rotulo) + ": " + (k.pendente ? '<span class="pend">' + esc(k.texto) + "</span>" : "<b>" + esc(k.texto) + "</b>" + (k.fonte ? " <small>(" + esc(k.fonte) + ")</small>" : "")); });
        return trw([td(img, "ico"), td("<b>" + t(l.descricao, "materiais") + "</b>" + (l.produto ? "<br><small>" + t(l.produto, "materiais") + "</small>" : "") + (l.origem === "importada" ? "<br><small>família importada mapeada para o tipo nativo</small>" : "")),
          tn(fin(l.quantidade) ? br(l.quantidade, l.unidade === "m" ? 2 : 0) + NB + esc(l.unidade || "") : "—"), td(arr(l.fabricante).length ? arr(l.fabricante).map(esc).join("<br>") : "—"), td(sin),
          td(l.norma ? esc(l.norma) : '<span class="pend">não consta no catálogo</span>'), td(co.length ? co.join("<br>") : "—")]);
      }), { classe: "catalogo", nota: "Coeficiente pendente = a tabela da fonte necessária ainda não está no acervo (nunca valor de memória)." });
    if (usadas.length) {
      h += h3(S("materiais") + ".1 Peças lidas pelo cálculo");
      h += d.tab("Coeficiente de cada peça no cálculo, trecho a trecho", ["Peça", "Uso no cálculo", "Trechos / pontos"],
        usadas.map(function (u) { var src = u.icone ? ic[u.icone] : null; return trw([td((src && imgOk(src) ? '<img class="peca-ico mini" src="' + esc(src) + '" alt=""> ' : "") + "<b>" + esc(u.descricao) + "</b>"), td(u.usos.map(function (x) { return esc(x); }).join("<br>")), td(u.trechos.map(function (x) { return esc(x); }).join(", "))]); }),
        { classe: "compacta", nota: "Água fria e quente: comprimento equivalente (Leq) ou K da ficha da peça real do nó. Esgoto: UHC da ficha da família do aparelho." });
    }
    d.semIcone = semIcone; d.nMateriais = lista.length;   /* a tela confere (não é divergência de cálculo: a célula já diz "sem ícone") */
    return h;
  }
  function secES(c, d) {
    var es = c.es, h = seloFixture(c), trs = objs(es.trechos);
    if (!trs.length) return h + naoAbrCaixa(d, "o resultado não trouxe trechos de esgoto.", "esgoto (trechos)");
    h += "<p>Situação do esgoto: " + sit(es.status) + ". Dimensionamento pelo método tabular da NBR 8160: DN pela soma das unidades Hunter de contribuição (UHC) a jusante, sem diminuição de diâmetro no sentido do escoamento.</p>";
    var pts = objs(es.pontos);
    h += d.tab("Unidades Hunter de contribuição por aparelho", ["Ponto", "Aparelho", thn("UHC"), thn("DN mín. (mm)"), "Situação"],
      pts.map(function (p) { return trw([td(t(p.famInst || p.peca || p.no, "es")), td(t(p.aparelho, "es")), tn(fin(p.uhc) ? br(p.uhc, 0) : "não verificado"), tn(fin(p.dnMin) ? br(p.dnMin, 0) : "—"), td(sit(p.status))], clsLinha(p.status)); }),
      { classe: "compacta", vazio: "O resultado não trouxe os pontos de esgoto (<b>não verificado</b>: UHC por aparelho)." });
    var NCLASSE = { ramal_descarga: "ramal de descarga", ramal_esgoto: "ramal de esgoto", tubo_queda: "tubo de queda", subcoletor: "subcoletor / coletor" };
    h += h3(S("es") + ".1 Ramais, tubos de queda e subcoletores");
    h += d.tab("Esgoto — dimensionamento por trecho", ["Trecho", "Classe", "Mat.", thn("DN modelo"), thn("DN calc."), thn("UHC"), thn("Decl. (%)"), thn("Decl. mín. (%)"), "Situação"],
      trs.map(function (x) {
        return trw([td("<b>" + t(x.aresta || x.id, "es") + "</b>" + (x.travado ? " (travado)" : "")), td(NCLASSE[x.classe] || t(x.classe, "es")), td(t(x.material, "es")), tn(br(x.dnModelo, 0)), tn("<b>" + br(x.dn, 0) + "</b>"), tn(br(x.uhc, 0)),
          tn(fin(x.declividade_pct) ? br(x.declividade_pct, 2) : "—"), tn(fin(x.declividadeMin_pct) ? br(x.declividadeMin_pct, 2) : "—"), td(sit(x.status) + (x.status === "pendente" && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status));
      }), { classe: "resumo", nota: "Declividade em branco: trecho vertical (ramal de descarga, tubo de queda). Subcoletor e coletor: declividade do modelo × mínima da tabela." });
    h += d.tab("Esgoto — passos do cálculo", ["Trecho", "Passos"], trs.map(function (x) { return trw([td("<b>" + t(x.aresta || x.id, "es") + "</b>"), td(passosLista(x.passos, "es trecho " + x.id))], clsLinha(x.status)); }), { classe: "compacta" });
    var vt = objs(es.ventilacao);
    h += h3(S("es") + ".2 Ventilação");
    h += d.tab("Ventilação — primária, ramais e colunas", ["Elemento", "Tipo", thn("DN modelo"), thn("DN exigido"), thn("UHC"), thn("Compr. (m)"), "Passos", "Situação"],
      vt.map(function (v) { return trw([td("<b>" + t(v.id, "es") + "</b>"), td(t(v.tipo, "es")), tn(br(v.dnModelo, 0)), tn(fin(v.dnReq) ? br(v.dnReq, 0) : "—"), tn(br(v.uhc, 0)), tn(br(v.comprimento_m, 2)), td(passosLista(v.passos, "es ventilação " + v.id)), td(sit(v.status))], clsLinha(v.status)); }),
      { classe: "compacta", vazio: "O resultado não trouxe elementos de ventilação (<b>não verificado</b>: ventilação)." });
    var tq = objs(es.tubosQueda);
    if (tq.length) h += "<p>Tubos de queda identificados: " + tq.map(function (q) { return t(typeof q === "object" ? (q.id || q.nome || JSON.stringify(q)) : q, "es"); }).join(", ") + ".</p>";
    h += h3(S("es") + ".3 Desconectores e caixas");
    h += naoAbrCaixa(d, "o resultado não dimensiona caixas de inspeção, fossa/filtro/sumidouro nem a distância do coletor ao ponto de lançamento (a caixa de gordura tem tipo e capacidade pelas decisões do projeto, NBR 8160, 5.1.5.1). Esses itens ficam para emissão posterior ou para cálculo à parte. Os avisos de desconector (distância à ventilação) constam na seção " + S("pendencias") + ".", "caixas de inspeção e destino final do esgoto (a caixa de gordura consta nas decisões do projeto)");
    return h;
  }

  /* ================================================================ 7 RECALQUE */
  function secRecalque(c, d) {
    var rc = c.rc, h = seloFixture(c);
    if (!rc) return h + naoAbrCaixa(d, "o cálculo foi executado sem dados de recalque (níveis, vazão, bombas).", "recalque (AMT, NPSH e escolha da bomba)");
    h += "<p>Situação do recalque: " + sit(rc.status) + ".</p>";
    h += d.tab("Altura manométrica total e NPSH disponível", ["Grandeza", thn("Valor")], [
      trw([td("Vazão de projeto"), tn(un(rc.vazao_m3h, 2, "m³/h"))]),
      trw([td("Altura geométrica Hg"), tn(un(rc.Hg_m, 2, "m"))]),
      trw([td("Perda de carga na sucção"), tn(un(rc.perdaSuccao_m, 2, "m"))]),
      trw([td("Perda de carga no recalque"), tn(un(rc.perdaRecalque_m, 2, "m"))]),
      trw([td("<b>Altura manométrica total (AMT)</b>"), tn("<b>" + un(rc.AMT_m, 2, "m") + "</b>")], "tot"),
      trw([td("<b>NPSH disponível</b>"), tn("<b>" + un(rc.NPSHd_m, 2, "m") + "</b>")], "tot")
    ], { classe: "ficha" });
    h += "<h3>Memória de cálculo</h3><ol class=\"regras\">" + arr(rc.passos).map(function (x) { return "<li>" + t(x, "recalque") + "</li>"; }).join("") + "</ol>";
    var cs = arr(rc.curvaSistema);
    h += d.tab("Curva do sistema (altura necessária × vazão)", [thn("Q (m³/h)"), thn("H (m)")], cs.map(function (p) { return trw([tn(br(p.q_m3h, 2)), tn(br(p.h_m, 2))]); }), { classe: "compacta", vazio: "O resultado não trouxe a curva do sistema (<b>não verificado</b>)." });
    var esc_ = obj(rc.escolha);
    if (esc_.id) {
      h += caixa("<b>Bomba escolhida:</b> " + t(esc_.nome || esc_.id, "recalque") + ". Ponto de operação: Q = " + un(esc_.q_op, 2, "m³/h") + ", H = " + un(esc_.h_op, 2, "m") + "; NPSH requerido " + un(esc_.npshr, 2, "m") + " × disponível " + un(esc_.npshd, 2, "m") + (fin(esc_.potencia_cv) ? "; potência informada " + un(esc_.potencia_cv, 1, "cv") : "") + ". " + (esc_.aprovada === true ? sit("ok") : (esc_.aprovada === false ? sit("reprovado") : sit("pendente"))));
    } else {
      h += naoAbrCaixa(d, "nenhuma bomba foi escolhida (sem catálogo informado ou nenhuma atende).", "escolha da bomba de recalque");
    }
    var rk = objs(rc.ranking);
    h += d.tab("Bombas avaliadas", ["Bomba", thn("Q op. (m³/h)"), thn("H op. (m)"), thn("NPSHr (m)"), thn("NPSHd (m)"), "Situação", "Motivos"],
      rk.map(function (b) { return trw([td(t(b.nome || b.id, "recalque")), tn(br(b.q_op, 2)), tn(br(b.h_op, 2)), tn(br(b.npshr, 2)), tn(br(b.npshd, 2)), td(b.aprovada === true ? sit("ok") : (b.aprovada === false ? sit("reprovado") : sit("pendente"))), td(arr(b.motivos).map(function (m) { return t(m, "recalque"); }).join("; ") || "—")], b.aprovada === false ? "linha-falha" : ""); }),
      { classe: "compacta" });
    return h;
  }


  /* ================================================================ ÁGUA QUENTE (fase 2) */
  function secAQ(c, d) {
    var aq = c.aq, h = seloFixture(c);
    if (!aq) return h + naoAbrCaixa(d, "o cálculo foi executado sem água quente (nem rede no modelo, nem dados de consumo/aquecimento).", "água quente");
    var S0 = S("aq");
    h += "<p>Situação da água quente: " + sit(aq.status) + ". Vazões por aparelho: <b>" + t(aq.fonteVazoes === "envoltoria" ? "envoltória (o maior entre o manual Tigre 2025 e a USP 1994/NBR 7198:1993, por aparelho)" : aq.fonteVazoes, "aq") + "</b>.</p>";
    var T = obj(aq.temperaturas);
    h += h3(S0 + ".1 Temperaturas e mistura");
    h += "<ol class=\"regras\">" + arr(T.passos).map(function (x) { return "<li>" + t(x, "aq") + "</li>"; }).join("") + "</ol>";
    var cs = obj(aq.consumo);
    if (aq.consumo) {
      h += h3(S0 + ".2 Consumo diário");
      var ps = arr(cs.passosPopulacao).concat(cs.porUso ? arr(cs.porUso.passos) : []).concat(cs.porAquecedor ? arr(cs.porAquecedor.passos) : []);
      h += "<ol class=\"regras\">" + ps.map(function (x) { return "<li>" + t(x, "aq") + "</li>"; }).join("") + "</ol>";
      h += "<p>Volume diário de água quente adotado: " + (fin(cs.volumeNecessario_L) ? "<b>" + un(cs.volumeNecessario_L, 1, "L") + "</b> (" + t(cs.metodoAdotado, "aq") + ")" : "<b>não verificado</b>") + ".</p>";
    }
    var ah = aq.aquecimento;
    if (ah) {
      h += h3(S0 + ".3 Aquecimento (" + t(ah.tipo || "—", "aq") + ")");
      h += "<ol class=\"regras\">" + arr(ah.passos).map(function (x) { return "<li>" + t(x, "aq") + "</li>"; }).join("") + "</ol><p>Situação: " + sit(ah.status) + ".</p>";
    }
    var dv = objs(aq.divergencias);
    if (dv.length) h += d.tab("Água quente — divergência entre as fontes de vazão/peso (adotado o maior)", ["Aparelho", "Grandeza", thn("Tigre 2025"), thn("USP 1994"), "Adotado"],
      dv.map(function (x) { return trw([td(t(x.aparelho, "aq")), td(t(x.coluna, "aq")), tn(br(x.tigre, 3)), tn(br(x.usp1994, 3)), td(t(x.adotado, "aq"))]); }), { classe: "compacta" });
    var trs = objs(aq.trechos);
    if (trs.length) {
      var al = obj(aq.alimentacao);
      h += h3(S0 + ".4 Rede de água quente trecho a trecho");
      h += "<p>Alimentação: " + t(al.tipo || "—", "aq") + (fin(al.carga_m) ? ", carga " + un(al.carga_m, 3, "m") : "") + (al.origemNivelMax ? "; estática pelo " + t(al.origemNivelMax, "aq") : "") + ". Método e limites: os da água fria (NBR 5626:2020, que trata água fria e quente); propriedades da água a " + un(aq.temperatura_C, 0, "°C") + ".</p>";
      h += d.tab("Água quente — dimensionamento por trecho (aquecedor → pontos)",
        ["Trecho", "Mat.", thn("DN modelo"), thn("DN calc."), thn("Di (mm)"), thn("L (m)"), thn("ΣP"), thn("Q (L/s)"), thn("v (m/s)"), thn("hf (m)"), thn("P jus. (kPa)"), "Situação"],
        trs.map(function (x) {
          return trw([td("<b>" + t(x.aresta || x.id, "aq") + "</b>" + (x.travado ? " (travado)" : "")), td(t(x.material, "aq")), tn(br(x.dnModelo, 0)), tn("<b>" + br(x.dn, 0) + "</b>"), tn(br(x.di_mm, 1)), tn(br(x.comprimento_m, 2)),
            tn(br(x.somaPesos, 2)), tn(br(x.vazao_ls, 3)), tn(br(x.velocidade_ms, 2)), tn(br(x.perda_m, 3)), tn(br(x.pressaoJusante_kpa, 1)), td(sit(x.status) + (x.status === "pendente" && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status));
        }), { classe: "resumo" });
      h += d.tab("Água quente — passos do cálculo", ["Trecho", "Passos"], trs.map(function (x) { return trw([td("<b>" + t(x.aresta || x.id, "aq") + "</b>"), td(passosLista(x.passos, "aq trecho " + x.id))], clsLinha(x.status)); }), { classe: "compacta" });
      h += d.tab("Água quente — pontos de utilização", ["Ponto", "Aparelho", thn("Q (L/s)"), thn("Peso"), thn("P dinâmica (kPa)"), thn("P mínima (kPa)"), "Situação"],
        objs(aq.pontos).map(function (p) { return trw([td(t(p.famInst || p.no, "aq")), td(t(p.aparelho, "aq")), tn(br(p.vazao_ls, 2)), tn(br(p.peso, 2)), tn(br(p.pressaoDinamica_kpa, 1)), tn(fin(p.pressaoMinima_kpa) ? br(p.pressaoMinima_kpa, 1) : "não verificado"), td(sit(p.status))], clsLinha(p.status)); }), { classe: "compacta" });
    }
    var mx = objs(aq.misturadores);
    if (mx.length) h += d.tab("Misturadores — pressão da água fria × da quente no mesmo ponto", ["Ponto", thn("p AF (kPa)"), thn("p AQ (kPa)"), thn("|Δp| (kPa)"), thn("Limite (kPa)"), "Situação"],
      mx.map(function (m) { return trw([td(t(m.famInst, "aq")), tn(br(m.pAF_kpa, 1)), tn(br(m.pAQ_kpa, 1)), tn(br(m.dif_kpa, 1)), tn(fin(m.limite_kpa) ? br(m.limite_kpa, 1) : "sem fonte"), td(sit(m.status))], clsLinha(m.status)); }), { classe: "compacta" });
    var rc = aq.recirculacao;
    if (rc && rc.maior) h += "<p>Retorno (recirculação): maior comprimento aquecedor → ponto = " + un(rc.maior.comprimento_m, 2, "m") + " (" + t(rc.maior.famInst, "aq") + ")" + (fin(rc.maior.volume_L) ? ", com " + un(rc.maior.volume_L, 2, "L") + " de água parada no tubo" : "") + "; limite " + (fin(rc.limite_m) ? un(rc.limite_m, 1, "m") + (rc.origemLimite === "entrada" ? " (informado pelo projetista)" : "") : "<b>sem fonte — não verificado</b>") + ".</p>";
    var pt = objs(aq.pressaoTubo);
    if (pt.length) h += "<p>Pressão de serviço dos tubos na temperatura da água (catálogo): " + pt.map(function (x) { return t(x.material + " " + (x.classe || ""), "aq") + " " + un(x.pressao_kpa, 1, "kPa") + " a " + x.temperatura_C + " °C"; }).join("; ") + ".</p>";
    var dl = objs(aq.dilatacao).filter(function (x) { return fin(x.deltaL_mm); });
    if (dl.length) h += d.tab("Dilatação térmica por trecho (ΔL = α·L·ΔT)", ["Trecho", "Mat.", thn("L (m)"), thn("α (mm/m·°C)"), thn("ΔT (°C)"), thn("ΔL (mm)")],
      dl.map(function (x) { return trw([td(t(x.aresta || x.trecho, "aq")), td(t(x.material, "aq")), tn(br(x.comprimento_m, 2)), tn(br(x.alfa_mm_m_C, 3)), tn(br(x.deltaT_C, 0)), tn(br(x.deltaL_mm, 1))]); }), { classe: "compacta" });
    var iso = obj(aq.isolamento);
    if (aq.isolamento) h += caixa("<b>Isolamento térmico:</b> " + t(iso.exigencia || "exigência não lida", "aq") + ". " + t(iso.perdaCalor, "aq") + ".", "neutra");
    if (trs.length) {
      d.naoAbrangido("água quente: DN mínimo dos sub-ramais (tabela em polegada sem correspondência de DE para PPR/CPVC na base)");
      d.naoAbrangido("água quente: liras e juntas de dilatação (tabela de liras do fabricante com unidade a conferir) e perda de calor (fórmula pendente na fonte)");
    }
    return h;
  }

  /* ================================================================ PLUVIAL (fase 2) */
  function secAP(c, d) {
    var ap = c.ap, h = seloFixture(c);
    if (!ap) return h + naoAbrCaixa(d, "o cálculo foi executado sem águas pluviais (nem condutores no modelo, nem áreas/calhas).", "águas pluviais");
    var S0 = S("ap"), I = obj(ap.intensidade);
    h += "<p>Situação das águas pluviais: " + sit(ap.status) + ".</p>";
    h += h3(S0 + ".1 Intensidade pluviométrica");
    h += "<ol class=\"regras\">" + arr(I.passos).map(function (x) { return "<li>" + t(x, "ap") + "</li>"; }).join("") + "</ol>";
    h += "<p>I = " + (fin(I.valor_mm_h) ? "<b>" + un(I.valor_mm_h, 0, "mm/h") + "</b> — " + (I.origem === "informada" ? "<b>informada pelo projetista</b>: " + t(obj(I.fonte).doc, "ap") : fonteCurta(I.fonte)) : "<b>não verificado</b> (sem intensidade com fonte)") + ".</p>";
    var as = objs(ap.areas);
    h += d.tab("Áreas de contribuição e vazões (Q = I·A/60)", ["Área", "Caso", thn("A (m²)"), thn("Q (L/min)"), "Passos", "Situação"],
      as.map(function (a) { return trw([td(t(a.id, "ap")), td(t(a.caso || "informada", "ap")), tn(br(a.area_m2, 2)), tn(br(a.vazao_l_min, 1)), td(passosLista(a.passos, "ap área " + a.id)), td(sit(a.status))], clsLinha(a.status)); }),
      { classe: "compacta", vazio: "Nenhuma área de contribuição informada." });
    var chs = objs(ap.calhas);
    if (chs.length) h += d.tab("Calhas", ["Calha", "Seção", thn("i (%)"), thn("Q projeto (L/min)"), thn("Capacidade (L/min)"), "Método", "Situação"],
      chs.map(function (x) { return trw([td(t(x.id, "ap")), td(t(x.secao, "ap") + (fin(x.lamina_mm) ? "<br>lâmina " + un(x.lamina_mm, 0, "mm") : (x.secao === "retangular" ? "<br><b>lâmina não verificada</b>" : ""))), tn(br(x.declividade_pct, 2)), tn(br(x.vazaoProjeto_l_min, 1)), tn(br(x.capacidade_l_min, 1)), td(t(x.metodoCapacidade || "—", "ap") + "<br>" + passosLista(x.passos, "ap calha")), td(sit(x.status))], clsLinha(x.status)); }), { classe: "compacta" });
    var trs = objs(ap.trechos);
    if (trs.length) {
      h += h3(S0 + ".2 Condutores");
      h += d.tab("Condutores verticais e horizontais", ["Trecho", "Classe", "Mat.", thn("DN modelo"), thn("DN calc."), thn("Q (L/min)"), thn("i (%)"), thn("i mín. (%)"), "Situação"],
        trs.map(function (x) { return trw([td("<b>" + t(x.aresta || x.id, "ap") + "</b>" + (x.travado ? " (travado)" : "")), td(t(x.classe, "ap")), td(t(x.material, "ap")), tn(br(x.dnModelo, 0)), tn("<b>" + br(x.dn, 0) + "</b>"), tn(br(x.vazao_l_min, 1)), tn(br(x.declividade_pct, 2)), tn(br(x.declividadeMin_pct, 2)),
          td(sit(x.status) + (x.status === "pendente" && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status)); }), { classe: "resumo", nota: "DN nunca diminui no sentido do escoamento. Condutor vertical pela tabela DN × vazão (Botelho & Ribeiro Jr.); horizontal pela tabela DN × n × declividade, na coluna de declividade não acima da do trecho." });
      h += d.tab("Condutores — passos do cálculo", ["Trecho", "Passos"], trs.map(function (x) { return trw([td("<b>" + t(x.aresta || x.id, "ap") + "</b>"), td(passosLista(x.passos, "ap trecho " + x.id))], clsLinha(x.status)); }), { classe: "compacta" });
    }
    var apr = ap.aproveitamento;
    if (apr) {
      h += h3(S0 + ".3 Aproveitamento de água de chuva (NBR 15527)");
      h += caixa("<b>Edição:</b> os métodos e coeficientes foram lidos em fontes que citam a NBR 15527:2007; a vigente é a 2019 — conferir antes de assinar.", "alerta");
      h += "<ol class=\"regras\">" + arr(apr.passos).map(function (x) { return "<li>" + t(x, "ap") + "</li>"; }).join("") + "</ol>";
      h += d.tab("Reservatório de água de chuva — métodos", ["Método", thn("Volume (L)"), "Passos", "Situação"],
        objs(apr.metodos).map(function (m) { return trw([td(t(m.metodo, "ap")), tn(br(m.volume_L, 0)), td(passosLista(m.passos, "ap método")), td(sit(m.status))], clsLinha(m.status)); }), { classe: "compacta", vazio: "Métodos não calculados (<b>não verificado</b>)." });
    }
    if (chs.length && !chs.some(function (c0) { return c0 && c0.bocal; })) d.naoAbrangido("pluvial: bocal de saída das calhas pelo ábaco da NBR 10844 (lâmina × comprimento) — ábaco não digitalizado");
    d.naoAbrangido("pluvial: calhas de piso e grelhas (tabela do fabricante não transcrita)");
    return h;
  }
  /* ================================================================ INCÊNDIO (F3) */
  function txt0(v) { return v == null ? "" : String(v); }
  function secIN(c, d) {
    var inc = c.inc, h = seloFixture(c);
    if (!inc) return h + naoAbrCaixa(d, "o cálculo foi executado sem a entrada de incêndio (ocupação, área e altura).", "incêndio");
    var S0 = S("incendio"), en = obj(inc.enquadramento), rv = obj(inc.reserva), hd = obj(inc.hidrantes), ex = obj(inc.extintores), ch = obj(inc.chuveiros);
    h += "<p>Situação do incêndio: " + sit(inc.status) + ". Ocupação <b>" + t(en.divisao || "—", "in") + "</b>" + (en.descricao ? " — " + t(en.descricao, "in") : "") + ", área " + un(en.area_m2, 0, "m²") + ", altura " + un(en.altura_m, 2, "m") + (en.faixaAltura ? " (faixa " + t(en.faixaAltura, "in") + ")" : "") + ".</p>";
    h += h3(S0 + ".1 Enquadramento (IT 01 do CBMMG)");
    var ms = obj(en.medidas), NOM = { extintores: "Extintores", hidrantes_mangotinhos: "Hidrantes e mangotinhos", chuveiros_automaticos: "Chuveiros automáticos" };
    h += d.tab("Exigências da IT 01" + (obj(en.tabela).tabela ? " — " + t(en.tabela.tabela, "in") + (en.tabela.pagina ? " (PDF p." + t(en.tabela.pagina, "in") + ")" : "") : ""), ["Medida", "Exigida", "Linha da tabela e passos", "Fonte"],
      Object.keys(NOM).map(function (k) { var m = obj(ms[k]); return trw([td(NOM[k]), td(m.exigido === true ? "<b>sim</b>" : (m.exigido === false ? "não" : "<b>não verificado</b>")), td(passosLista(m.passos, "in " + k) + (arr(m.notas).length ? "<br>notas: " + arr(m.notas).map(function (x) { return t(typeof x === "string" ? x : JSON.stringify(x), "in"); }).join("; ") : "")), td(fonteCurta(m.fonte))], m.exigido == null ? "linha-alerta" : ""); }),
      { classe: "compacta", vazio: "Enquadramento não calculado (<b>não verificado</b>)." });
    if (arr(en.isencoes).length) h += "<p>Isenções declaradas pelo RT: " + arr(en.isencoes).map(function (x) { return t(typeof x === "string" ? x : (x.id || JSON.stringify(x)), "in"); }).join("; ") + ".</p>";
    h += h3(S0 + ".2 Hidrantes e mangotinhos (IT 17)");
    if (hd.exigido === false) h += "<p>Não exigidos para esta ocupação e altura.</p>";
    else {
      h += "<p>Sistema: <b>" + t(hd.sistema || "—", "in") + "</b>" + (hd.tipo != null ? " (Tipo " + t(hd.tipo, "in") + ")" : "") + "; vazão mínima por saída " + un(hd.vazaoMin_lpm, 0, "L/min") + "; alcance da mangueira " + un(hd.alcance_m, 1, "m") + "; esguichos por ponto " + br(hd.esguichosPorPonto, 0) + ".</p>";
      h += "<ol class=\"regras\">" + arr(hd.passosVazao).map(function (x) { return "<li>" + t(x, "in") + "</li>"; }).join("") + "</ol>";
      h += d.tab("Pontos de hidrante/mangotinho (modelo ou propostos)", ["Id", "Pavimento", thn("x (m)"), thn("z (m)"), "Origem"],
        objs(hd.pontos).map(function (p) { return trw([td(t(p.id, "in")), td(t(p.pavimento, "in")), tn(br(p.x, 2)), tn(br(p.z, 2)), td(t(p.origem, "in"))]); }), { classe: "compacta", vazio: "Nenhum ponto definido (sem pavimentos com geometria): <b>não verificado</b> a cobertura." });
      h += d.tab("Cobertura por pavimento (alcance da mangueira pelos caminhos da planta)", ["Pavimento", "Situação", thn("Área descoberta (m²)")],
        objs(hd.cobertura).map(function (x) { return trw([td(t(x.pavimento, "in")), td(sit(x.status)), tn(br(x.area_descoberta_m2, 1))], clsLinha(x.status)); }), { classe: "compacta" });
      var cl = obj(hd.calculo);
      if (hd.calculo) {
        h += h3(S0 + ".3 Dois jatos mais desfavoráveis");
        h += "<p>Hidrante A: <b>" + t(cl.A, "in") + "</b> (Q = " + un(cl.QA, 1, "L/min") + "); hidrante B: <b>" + t(cl.B, "in") + "</b> (Q = " + un(cl.QB, 1, "L/min") + "); junção: " + t(cl.juncao, "in") + ".</p>";
        h += "<ol class=\"regras\">" + arr(cl.passos).map(function (x) { return "<li>" + t(x, "in") + "</li>"; }).join("") + "</ol>";
      }
      var trs = objs(hd.trechos);
      if (trs.length) {
        h += h3(S0 + ".4 Perda de carga na rede (Hazen-Williams)");
        h += d.tab("Rede de incêndio — trechos", ["Trecho", "Mat.", thn("DN modelo"), thn("DN calc."), thn("Q (L/min)"), thn("v (m/s)"), thn("J (m/m)"), thn("Perda (m)"), thn("P jus. (mca)"), "Situação"],
          trs.map(function (x) { return trw([td("<b>" + t(x.id, "in") + "</b>"), td(t(x.material, "in")), tn(br(x.dnModelo, 0)), tn("<b>" + br(x.dn, 0) + "</b>"), tn(br(x.vazao_lpm, 1)), tn(br(x.velocidade_ms, 2)), tn(br(x.J_m_m, 4)), tn(br(x.perda_m, 3)), tn(br(x.pressaoJusante_mca, 1)), td(sit(x.status) + (x.status === "pendente" ? "<br>" + passosLista(x.passos, "in trecho " + x.id) : ""))], clsLinha(x.status)); }), { classe: "resumo" });
      }
      var bb = hd.bomba;
      if (bb) {
        h += h3(S0 + ".5 Bomba de incêndio");
        h += "<p>Vazão " + un(bb.vazao_lpm, 0, "L/min") + ", AMT " + un(bb.AMT_m, 2, "m") + "; perda na sucção " + un(bb.perdaSuccao_m, 2, "m") + ".</p><ol class=\"regras\">" + arr(bb.passos).map(function (x) { return "<li>" + t(x, "in") + "</li>"; }).join("") + "</ol>";
        if (bb.escolha) h += "<p>Bomba do catálogo: <b>" + t(bb.escolha.nome || bb.escolha.id, "in") + "</b>" + (bb.escolha.aConferir ? " (<b>a conferir</b> com o fabricante)" : "") + ".</p>";
      }
    }
    h += h3(S0 + ".6 Reserva técnica de incêndio");
    h += "<ol class=\"regras\">" + arr(rv.passos).map(function (x) { return "<li>" + t(x, "in") + "</li>"; }).join("") + "</ol><p>Reserva técnica: " + (fin(rv.total_L) ? "<b>" + un(rv.total_L, 0, "L") + "</b> (hidrantes " + un(rv.hidrantes_m3, 2, "m³") + (fin(rv.chuveiros_m3) && rv.chuveiros_m3 > 0 ? " + chuveiros " + un(rv.chuveiros_m3, 2, "m³") : "") + "), somada à reservação da água fria" : "<b>não verificado</b>") + ".</p>";
    h += h3(S0 + ".7 Extintores (IT 16)");
    if (ex.exigido === false) h += "<p>Não exigidos.</p>";
    else {
      h += "<p>Risco: " + t(ex.risco || "não verificado (informe a carga de incêndio ou o risco)", "in") + "; classes de fogo " + arr(ex.classes).map(function (x) { return t(x, "in"); }).join(", ") + (fin(ex.distanciaMax_m) ? "; distância máxima a percorrer " + un(ex.distanciaMax_m, 1, "m") : "") + ".</p>";
      h += d.tab("Extintores por pavimento", ["Pavimento", thn("Mínimo"), thn("Existentes"), thn("Propostos"), thn("Total"), "Situação"],
        objs(ex.porPavimento).map(function (x) { return trw([td(t(x.pavimento, "in")), tn(br(x.minimo, 0)), tn(br(x.existentes, 0)), tn(br(x.propostos, 0)), tn(br(x.total, 0)), td(sit(x.status))], clsLinha(x.status)); }), { classe: "compacta", vazio: "Sem pavimentos informados: <b>não verificado</b> o número de extintores." });
    }
    h += h3(S0 + ".8 Chuveiros automáticos (NBR 10897:2020)");
    if (ch.exigido === true) {
      var vch = objs(inc.verificacoes).filter(function (v) { return /chuveiro|densidade|área de operação|ponto do piso|cálculo hidráulico/i.test(txt0(v.nome)); }), dm = obj(ch.demanda);
      h += "<p>Exigidos pela IT 01 do CBMMG. Classe de risco: <b>" + t(ch.risco || "não verificado", "in") + "</b> (sem classe informada, o cálculo sugere pela Tabela A.1 e o RT confirma). Situação: " + sit(ch.status === "calculado" ? "ok" : (ch.status || "pendente")) + ".</p>";
      h += d.tab("Chuveiros — resultado", ["Grandeza", thn("Valor"), "Observação"], [
        trw([td("Densidade de projeto"), tn(fin(ch.densidade) ? br(ch.densidade, 1) + NB + "mm/min" : "<b>não verificado</b>"), td("Figura 42 — <b>lido em gráfico, ±0,1 L/min/m²</b> (lado seguro: maior densidade lida)")]),
        trw([td("Área de operação"), tn(un(ch.areaOperacao_m2, 0, "m²")), td("com os ajustes de 8.5.5 (resposta rápida, teto, ação prévia)")]),
        trw([td("Área por chuveiro (S × L)"), tn(un(ch.areaPorChuveiro_m2, 1, "m²")), td("Tabela 10")]),
        trw([td("Chuveiros na área / por ramal"), tn(fin(ch.nChuveirosArea) ? br(ch.nChuveirosArea, 0) + " / " + br(ch.porRamal, 0) : "<b>não verificado</b>"), td("9.4.4.2")]),
        trw([td("Fator K e vazão mínima"), tn(fin(ch.k) ? br(ch.k, 0) + " / " + un(ch.vazaoMinChuveiro_lpm, 1, "L/min") : "<b>não verificado</b>"), td("Tabela 1; K·√48 kPa")]),
        trw([td("Cálculo hidráulico (9.4)"), tn(ch.hidraulico ? "calculado" : "<b>não verificado: falta a rede</b>"), td("informe a rede (nós, trechos, chuveiros) e a pressão disponível")]),
        trw([td("Reserva dos chuveiros"), tn(fin(obj(inc.reserva).chuveiros_m3) ? un(inc.reserva.chuveiros_m3, 2, "m³") : "<b>não verificado</b>"), td(fin(dm.duracao_min) ? "duração " + br(dm.duracao_min, 0) + " min (Tabela 27)" : "—")])
      ], { classe: "compacta" });
      h += d.tab("Chuveiros — verificações e passos", ["Verificação", "Situação", "Passos"], vch.map(function (v) { return trw([td(t(v.nome, "in")), td(sit(v.status)), td(passosLista(v.passos, "in " + v.id))], clsLinha(v.status)); }), { classe: "compacta" });
      h += passosOl(dm.passos, "in reserva");
      d.naoAbrangido("incêndio: obstruções fora da Tabela 15 e tetos das Tabelas 16–22 da NBR 10897 (pendentes por tabela não transcrita)");
    } else if (ch.exigido === false) h += "<p>Não exigidos para esta ocupação e altura.</p>";
    else h += "<p><b>Não verificado</b> se são exigidos.</p>";
    var ob = objs(inc.avisos).filter(function (a) { return a.gravidade !== "info"; });
    if (ob.length) h += caixa("<b>Avisos do incêndio:</b><ul>" + ob.map(function (a) { return "<li>" + t(a.texto, "in") + "</li>"; }).join("") + "</ul>", "alerta");
    h += caixa("<b>Legislação:</b> as ITs 16 e 17 citam os Decretos 44.746/2008 e 44.270/2006, revogados pelo Decreto 47.998/2020 (vigente); a IT 16 cita a NBR 12693:2013, cuja vigente é a de 2021. Conferir decreto posterior antes de emitir o PSCIP.", "neutra");
    d.naoAbrangido("incêndio: projeto técnico (PSCIP) e demais medidas (saídas de emergência, sinalização, alarme, iluminação de emergência) — fora do escopo hidráulico");
    return h;
  }

  /* ================================================================ TRATAMENTO (fossa+filtro+sumidouro | ETE | ETA) */
  function passosOl(l, onde) { l = arr(l); return l.length ? "<ol class=\"regras\">" + l.map(function (x) { return "<li>" + t(x, onde) + "</li>"; }).join("") + "</ol>" : ""; }
  function dimsTxt(m) {
    m = obj(m); var p = [];
    if (fin(m.comprimento_m)) p.push("C " + un(m.comprimento_m, 2, "m"));
    if (fin(m.largura_m)) p.push("L " + un(m.largura_m, 2, "m"));
    if (fin(m.diametro_m)) p.push("Ø " + un(m.diametro_m, 2, "m"));
    if (fin(m.profundidade_m)) p.push("H " + un(m.profundidade_m, 2, "m"));
    if (fin(m.altura_m)) p.push("H " + un(m.altura_m, 2, "m"));
    if (fin(m.volume_m3)) p.push("V " + un(m.volume_m3, 3, "m³"));
    return p.length ? p.join(" · ") : "<b>não verificado</b> (sem dimensões calculadas)";
  }
  function secTR(c, d) {
    var tr = c.tr, h = seloFixture(c);
    if (!tr) return h + naoAbrCaixa(d, "o cálculo foi executado sem a entrada de tratamento (fossa, ETE ou ETA).", "tratamento");
    var S0 = S("tratamento"), nome = tr.sistema === "ete" ? "ETE (estação de tratamento de esgoto)" : (tr.sistema === "eta" ? "ETA (estação de tratamento de água)" : "fossa séptica + filtro anaeróbio + disposição");
    h += "<p>Sistema: <b>" + t(nome, "tr") + "</b>. Situação: " + sit(tr.status) + ".</p>";
    if (tr.fonteAviso) h += caixa("<b>Fonte dos valores:</b> " + t(tr.fonteAviso, "tr"), "alerta");
    h += h3(S0 + ".1 Parâmetros, com a edição da norma");
    h += d.tab("Parâmetros adotados", ["Parâmetro", thn("Valor"), "Unidade", "Edição", "Fonte"],
      objs(tr.parametros).map(function (p) { return trw([td(t(p.nome, "tr")), tn(typeof p.valor === "number" ? br(p.valor, 3) : t(p.valor, "tr")), td(t(p.unidade || "—", "tr")), td(t(p.edicao || "—", "tr")), td(fonteCurta(p.fonte))]); }),
      { classe: "compacta", vazio: "Nenhum parâmetro registrado (<b>não verificado</b>)." });
    h += h3(S0 + ".2 Passos do cálculo");
    var bl = [["Contribuição", obj(tr.contribuicao).passos], ["Tanque séptico", obj(obj(tr.tanque).calculo).passos], ["Tanque — geometria", obj(obj(tr.tanque).geometria).passos], ["Filtro anaeróbio", obj(tr.filtro).passos], ["Disposição final", obj(tr.disposicao).passos],
              ["Vazões", obj(tr.vazoes).passos], ["Reator UASB", obj(tr.uasb).passos], ["Floculador", obj(tr.floculador).passos], ["Decantador", obj(tr.decantador).passos], ["Filtros", obj(tr.filtros).passos]];
    bl.forEach(function (b) { if (arr(b[1]).length) h += "<p><b>" + b[0] + "</b></p>" + passosOl(b[1], "tr " + b[0]); });
    if (tr.linhasParalelas > 1) h += caixa("<b>" + br(tr.linhasParalelas) + " linhas de tanque em paralelo</b> (a parcela fixa do volume vale em cada uma). O limite de vazão por linha é critério do projetista, não normativo.", "alerta");
    h += h3(S0 + ".3 Unidades dimensionadas e cotadas (planta e corte na prancha de tratamento)");
    h += d.tab("Unidades do tratamento", ["Unidade", "Tipo", "Forma", "Dimensões (cotas)", "Produto de catálogo", "Situação"],
      objs(tr.unidades).map(function (u) {
        var pr = obj(u.produto), dm = u.dims || (u.id === "tanque" ? obj(obj(tr.tanque).geometria) : null);
        return trw([td("<b>" + t(u.id, "tr") + "</b> " + t(u.nome, "tr")), td(t(u.tipo, "tr")), td(t(u.forma || "—", "tr")), td(dm ? dimsTxt(dm) : (u.param && fin(u.param.Diametro_produto) ? "Ø " + un(u.param.Diametro_produto, 2, "m") + " · H " + un(u.param.Altura_produto, 2, "m") + " (produto)" : "<b>não verificado</b> (sem dimensões calculadas)")),
          td(pr.codigo ? t(pr.fabricante, "tr") + " " + t(pr.codigo, "tr") + " — " + un(pr.vazao_L_dia, 0, "L/dia") : "—"), td(sit(u.status || (dm ? "ok" : "pendente")))], clsLinha(u.status || (dm ? "ok" : "pendente")));
      }), { classe: "resumo", vazio: "Nenhuma unidade dimensionada (<b>não verificado</b>)." });
    h += d.tab("Afastamentos mínimos", ["Unidade", thn("Distância mínima (m)"), "Alvos", "Edição", thn("Medido (m)"), "Situação"],
      objs(tr.afastamentos).map(function (a) { return trw([td(t(a.unidade, "tr")), tn(br(a.distancia_m, 2)), td(t(a.alvos, "tr")), td(t(a.edicao || "—", "tr")), tn(fin(a.medido_m) ? br(a.medido_m, 2) : "não verificado"), td(sit(a.status || "pendente"))], clsLinha(a.status || "pendente")); }),
      { classe: "compacta" });
    var ob = objs(tr.avisos).filter(function (a) { return a.gravidade !== "info"; });
    if (ob.length) h += caixa("<b>Avisos do tratamento:</b><ul>" + ob.map(function (a) { return "<li>" + t(a.texto, "tr") + "</li>"; }).join("") + "</ul>", "alerta");
    d.naoAbrangido("tratamento: ensaio de infiltração, lençol freático e licenciamento ambiental são dados do RT; sem eles a disposição fica 'não verificado'");
    return h;
  }
  /* ================================================================ FLUIDOS INDUSTRIAIS */
  function secIND(c, d) {
    var ind = c.ind, h = seloFixture(c);
    if (!ind) return h + naoAbrCaixa(d, "o cálculo foi executado sem a entrada de fluido industrial.", "fluidos industriais");
    var S0 = S("industrial"), fl = obj(ind.fluido);
    h += "<p>Fluido: <b>" + t(fl.tipo || "—", "ind") + "</b>" + (fl.estado && fl.estado !== "gas" ? " (" + t(fl.estado, "ind") + ")" : "") + ", " + un(fl.temperatura_C, 1, "°C") + ", " + un(fl.pressao_kPa, 0, "kPa") + " manométrica; serviço " + t(ind.servico || "—", "ind") + "; material " + t(ind.material || "—", "ind") + "; método " + t(ind.metodo || "—", "ind") + ". Situação: " + sit(ind.status) + ".</p>";
    h += h3(S0 + ".1 Fluido na origem");
    h += passosOl(fl.passos, "ind fluido");
    h += h3(S0 + ".2 Rede trecho a trecho");
    h += d.tab("Rede industrial — dimensionamento por trecho", ["Trecho", "Série", thn("DN modelo"), thn("DN calc."), thn("De × e (mm)"), thn("Di (mm)"), thn("L (m)"), thn("v (m/s)"), thn("Perda (kPa)"), thn("P jus. (kPa)"), "Classe de pressão", "Situação"],
      objs(ind.trechos).map(function (x) {
        var cl = obj(x.classe);
        return trw([td("<b>" + t(x.id, "ind") + "</b>" + (x.travado ? " (travado)" : "")), td(t(x.serie || "—", "ind")), tn(t(x.dnModelo == null ? "—" : x.dnModelo, "ind")), tn("<b>" + t(x.dn == null ? "—" : x.dn, "ind") + "</b>"), tn(br(x.de_mm, 2) + " × " + br(x.e_mm, 2)), tn(br(x.di_mm, 1)), tn(br(x.comprimento_m, 2)), tn(br(x.velocidade_ms, 2)), tn(br(x.perda_kPa, 2)), tn(br(x.pressaoJusante_kPa, 1)),
          td(cl.ok === true ? "atende (" + un(cl.Pmax_kPa, 0, "kPa") + ")" : (cl.ok === false ? "<b>NÃO ATENDE</b>" : "<b>não verificado</b>")), td(sit(x.status) + (x.status === "pendente" && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status));
      }), { classe: "resumo", vazio: "Nenhum trecho calculado (<b>não verificado</b>)." });
    h += d.tab("Rede industrial — passos do cálculo", ["Trecho", "Passos"], objs(ind.trechos).map(function (x) { return trw([td("<b>" + t(x.id, "ind") + "</b>"), td(passosLista(x.passos, "ind trecho " + x.id))], clsLinha(x.status)); }), { classe: "compacta" });
    h += d.tab("Consumidores", ["Consumidor", "Nó", thn("Vazão (kg/h)"), thn("Pressão (kPa)"), thn("Perda total (kPa)"), "Caminho"],
      objs(ind.consumidores).map(function (k) { return trw([td(t(k.id, "ind")), td(t(k.no, "ind")), tn(br(k.vazao_kg_h, 1)), tn(br(k.pressao_kPa, 1)), tn(br(k.perdaTotal_kPa, 2)), td(arr(k.caminho).map(function (x) { return t(x, "ind"); }).join(" → "))]); }), { classe: "compacta" });
    var gp = objs(ind.golpe);
    if (gp.length) h += d.tab("Golpe de aríete (líquidos com válvula)", ["Consumidor", thn("a (m/s)"), thn("L (m)"), thn("Tcrit (s)"), thn("Fechamento (s)"), thn("Sobrepressão (kPa)"), "Situação"], gp.map(function (g) { return trw([td(t(g.consumidor, "ind")), tn(br(g.a_ms, 0)), tn(br(g.L_m, 1)), tn(br(g.Tcrit_s, 2)), tn(br(g.tc_s, 2)), tn(br(g.sobrepressao_kPa, 0)), td(sit(g.status))], clsLinha(g.status)); }), { classe: "compacta" });
    var dl = objs(ind.dilatacao);
    if (dl.length) h += d.tab("Dilatação térmica e liras", ["Trecho", thn("ΔT (K)"), thn("ΔL (mm)"), "Lira", "Situação"], dl.map(function (x) { return trw([td(t(x.trecho, "ind")), tn(br(x.dT_K, 0)), tn(br(x.dL_mm, 1)), td(x.lira ? "perna " + un(x.lira.perna_m, 2, "m") : "—"), td(sit(x.status))], clsLinha(x.status)); }), { classe: "compacta" });
    var ar = ind.arComprimido;
    if (ar) { h += h3(S0 + ".3 Ar comprimido"); h += "<p>Demanda " + un(ar.demanda_l_s, 2, "L/s") + "; reservatório mínimo " + (ar.reservatorio && fin(ar.reservatorio.volume_L) ? "<b>" + un(ar.reservatorio.volume_L, 0, "L") + "</b>" : "<b>não verificado</b>") + ".</p>" + passosOl(arr(ar.passos).concat(obj(ar.reservatorio).passos || []), "ind ar"); }
    var ob = objs(ind.avisos).filter(function (a) { return a.gravidade !== "info"; });
    if (ob.length) h += caixa("<b>Avisos da rede industrial:</b><ul>" + ob.map(function (a) { return "<li>" + t(a.texto, "ind") + "</li>"; }).join("") + "</ul>", "alerta");
    return h;
  }
  /* ================================================================ GÁS GLP (F3, Casa 487, 27/10/2026) */
  /* r.sistemas.gas = o resultado do HidInd (NBR 15526, GLP) com `projetoGas` anexado por HidGasRede.anexar (premissas, local do abrigo, rota,
     verificações de traçado, estanqueidade, pendências de fonte). O memorial não recalcula: apresenta. */
  function secGAS(c, d) {
    var g = c.gas, h = seloFixture(c);
    if (!g) return h + naoAbrCaixa(d, "o projeto não tem rede de gás.", "gás combustível");
    var S0 = S("gas"), pj = obj(g.projetoGas), ab = obj(pj.abrigo), rd = obj(pj.rede), mm = obj(pj.memorial), fl = obj(g.fluido);
    h += "<p>Gás <b>GLP</b> em botijões P13, " + un(fl.pressao_kPa, 2, "kPa") + " manométrica na saída do regulador; tubo de <b>cobre classe " + t(g.serie || "A", "gas") + "</b> embutido (parede e piso), dimensionado pela <b>ABNT NBR 15526</b> (Anexo B, GLP, perda ≤ 10 % da pressão). Situação: " + sit(g.status) + ".</p>";
    h += h3(S0 + ".1 Premissas e decisões");
    h += d.tab("Premissas do gás", ["Item", "Valor adotado", "Origem", "Conferir"], objs(pj.premissas).map(function (p) { return trw([td("<b>" + t(p.item, "gas") + "</b>"), td(t(p.valor, "gas")), td(t(p.origem, "gas")), td(t(p.conferir || "—", "gas"))]); }), { classe: "compacta", vazio: "Sem premissas registradas (<b>não verificado</b>)." });
    h += h3(S0 + ".2 Consumidor, vazão e local do abrigo");
    h += d.tab("Consumidor e vazão", ["Aparelho", "Potência (kcal/h)", "Potência (kW)", "Vazão (m³/h a 20 °C, 1 atm)", "PCI do GLP (kcal/m³)"],
      objs(pj.consumidores).map(function (k) { return trw([td(t(k.id + " — " + String(k.aparelho || "").replace(/_/g, " "), "gas")), tn(br(k.kcal_h, 0)), tn(br(k.kW, 1)), tn(br(mm.vazao_m3_h, 3)), tn(br(mm.pci, 0))]); }), { classe: "compacta", vazio: "Sem consumidor (<b>não verificado</b>)." });
    h += "<p>O abrigo de 2 botijões P13 (um em uso, um reserva) fica <b>" + t(ab.parede || "—", "gas") + "</b>, no ponto (" + br(ab.x, 2) + " ; " + br(-num0(ab.z), 2) + ") m do projeto, <b>fora da projeção da edificação</b>, ao ar livre, com área livre à frente para a troca e sem a fachada da rua à vista. Afastamento ao mais próximo (" + t(ab.afastDe || "—", "gas") + "): " + un(ab.afastamento_m, 2, "m") + ". Percurso da rede: " + un(rd.comprimento_m, 2, "m") + " até o cooktop; " + br(rd.cotovelos, 0) + " mudanças de direção (cotovelos 90°).</p>";
    h += h3(S0 + ".3 Dimensionamento trecho a trecho (NBR 15526)");
    h += d.tab("Rede de gás — dimensionamento por trecho", ["Trecho", thn("DN"), thn("Di (mm)"), thn("L (m)"), "Fórmula", thn("v (m/s)"), thn("Perda (kPa)"), thn("P jus. (kPa)"), "Situação"],
      objs(g.trechos).map(function (x) { var gs = obj(x.gas); return trw([td("<b>" + t(x.id, "gas") + "</b>"), tn(t(x.dn == null ? "—" : x.dn, "gas")), tn(br(x.di_mm, 1)), tn(br(x.comprimento_m, 2)), td(t(gs.formula || "—", "gas")), tn(br(x.velocidade_ms, 2)), tn(br(x.perda_kPa, 4)), tn(br(x.pressaoJusante_kPa, 3)), td(sit(x.status) + (x.status === "pendente" && arr(x.pendencias).length ? "<br>" + faltaTxt(x.pendencias) : ""))], clsLinha(x.status)); }), { classe: "resumo", vazio: "Nenhum trecho calculado (<b>não verificado</b>)." });
    h += d.tab("Rede de gás — passos do cálculo", ["Trecho", "Passos"], objs(g.trechos).map(function (x) { return trw([td("<b>" + t(x.id, "gas") + "</b>"), td(passosLista(x.passos, "gas trecho " + x.id))], clsLinha(x.status)); }), { classe: "compacta" });
    h += h3(S0 + ".4 Verificações do local e do traçado");
    h += d.tab("Local do abrigo e traçado embutido", ["Verificação", "Situação", "Como foi conferido"], objs(pj.verificacoes).map(function (v) { return trw([td(t(v.nome, "gas")), td(sit(v.status)), td(t(v.texto, "gas"))], clsLinha(v.status)); }), { classe: "compacta", vazio: "Sem verificações de traçado (<b>não verificado</b>)." });
    var es = obj(mm.estanqueidade);
    h += h3(S0 + ".5 Teste de estanqueidade (antes de pôr em uso)");
    h += "<p>" + (es.etapa1 ? "<b>1ª etapa:</b> " + t(es.etapa1.regra, "gas") + " → pressão de ensaio mínima de <b>" + un(es.etapa1.pressao_kPa, 1, "kPa") + "</b>. " : "<b>1ª etapa:</b> <b>não verificado</b> (tabela de estanqueidade indisponível). ") +
         (es.etapa2 ? "<b>2ª etapa:</b> " + t(es.etapa2.regra, "gas") + ". " : "") + "Fonte: " + t(es.fonte || "NBR 15526 8.1", "gas") + ". O ensaio é executado e registrado na obra — este memorial não o substitui.</p>";
    var pm = objs(pj.pendencias);
    if (pm.length) h += caixa("<b>Pendências de fonte e de conferência do gás:</b><ul>" + pm.map(function (x) { return "<li>" + t(x.texto, "gas") + "</li>"; }).join("") + "</ul>", "alerta");
    var ob = objs(g.avisos).filter(function (a) { return a.gravidade !== "info"; });
    if (ob.length) h += caixa("<b>Avisos do cálculo do gás:</b><ul>" + ob.map(function (a) { return "<li>" + t(a.texto, "gas") + "</li>"; }).join("") + "</ul>", "alerta");
    return h;
  }
  function num0(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  /* ================================================================ 8 VERIFICAÇÕES */
  /* ================================================================ CLIMATIZAÇÃO (memorial único) */
  function secClima(c, d, n) {
    if (!c.clima) return naoAbrCaixa(d, "o projeto não tem climatização dimensionada (sem resultado do painel Climatização).", "climatização");
    var CM = global.ClimMemorial || (typeof require === "function" ? (function () { try { return require("./climmemorial.js"); } catch (e) { return null; } })() : null);
    if (!CM || !CM.corpo) return caixa("<b>Climatização não apresentada:</b> o módulo do memorial da climatização (js/climmemorial.js) não carregou. O resultado existe e <b>não foi verificado</b> neste documento.", "erro");
    var k = CM.corpo(c.clima, c.op, { prefixo: n, tabela: d.nTab });
    if (!k.ok) return caixa("<b>Climatização não apresentada:</b> " + esc(k.motivo || "resultado inválido") + ".", "erro");
    d.nTab = k.tabelas;
    k.conferencias.forEach(function (x) { d.conferir(x.id, x.ok, x.texto); });
    k.avisos.forEach(function (a) { d.aviso(a); });
    return "<p>Climatização dimensionada sobre os ambientes do modelo (carga térmica, solução, equipamento, rede frigorígena e dreno). Situação: " + sit(k.situacao === "ok" ? "ok" : (k.situacao === "reprovado" ? "reprovado" : "pendente")) + ".</p>" + k.html;
  }

  /* ================================================================ DECISÕES AUTOMÁTICAS */
  /* decisão do projetista como linha limpa: "Decisão | Motivo: … | Fonte: …" (convenção do texto da config); sem a convenção, só a decisão */
  function decisaoPartes(texto) {
    var x = decisaoCliente(texto); if (!x) return null;
    var m = /^(.*?)(?:\s*\|\s*Motivo:\s*(.*?))?(?:\s*\|\s*(?:Fonte|Norma)[^:]*:\s*(.*))?$/.exec(x);
    return { decisao: (m && m[1]) || x, motivo: (m && m[2]) || "", fonte: (m && m[3]) || "" };
  }
  function secDecisoes(c, d) {
    var da = objs(c.r.decisoesAutomaticas), h = seloFixture(c);
    if (!da.length) return h + "<p>Nenhuma decisão registrada nesta emissão: os aparelhos, as caixas e a ventilação estão como foram desenhados no modelo.</p>";
    var linhas = [], pend = [];
    da.forEach(function (x) {
      objs(x.decisoes).forEach(function (y) {
        var p = decisaoPartes(y.texto); if (!p) return;
        linhas.push(trw([td(t(x.elemento, "decisões")), td(t(p.decisao, "decisões")), td(t(p.motivo || y.motivo || "—", "decisões")), td(t(p.fonte || y.fonte || "—", "decisões"))]));
      });
      objs(x.pendencias).forEach(function (y) {
        var m = decisaoCliente(y.motivo || y.chave); if (!m) return;
        pend.push(trw([td(t(x.elemento, "decisões")), td(t(chaveHumana(m), "decisões"))], "linha-alerta"));
      });
    });
    h += "<p>Decisões de projeto que valem para a execução, com o motivo e a norma ou fonte. O que ficou sem fonte está na tabela seguinte e <b>não foi adotado como valor</b>.</p>";
    h += d.tab("Decisões de projeto", ["Elemento", "Decisão", "Motivo", "Norma / fonte"], linhas, { classe: "compacta", vazio: "Nenhuma decisão de projeto registrada." });
    if (pend.length) h += d.tab("Itens em aberto das decisões de projeto", ["Elemento", "Em aberto"], pend, { classe: "compacta" });
    return h;
  }

  /* ================================================================ CONCLUSÃO */
  function secConclusao(c, d) {
    var r = c.r, g = situacaoGeral(c), h = seloFixture(c), ks = climaSit(c);
    var linhas = [], ST = { af: c.af.status, es: c.es.status, recalque: c.rc && c.rc.status, aq: c.aq && c.aq.status, ap: c.ap && c.ap.status, incendio: c.inc && c.inc.status, tratamento: c.tr && c.tr.status, industrial: c.ind && c.ind.status };
    presentes(c).forEach(function (k) {
      var st = k === "clima" ? (ks.ok ? "ok" : (ks.rep ? "reprovado" : "pendente")) : ST[k];
      linhas.push(trw([td('<a href="#sec-' + k + '">' + esc(NOMES_SIS[k].charAt(0).toUpperCase() + NOMES_SIS[k].slice(1)) + "</a>"), td(sit(st || "pendente"))], clsLinha(st || "pendente")));
    });
    h += "<p>Situação do cálculo nesta emissão: " + g.txt + "</p>";
    h += d.tab("Situação por sistema", ["Sistema", "Situação"], linhas, { classe: "ficha" });
    var rep = c.verifs.filter(function (v) { return v.status === "reprovado"; }).length + (ks ? ks.rep : 0);
    var pen = arr(r.pendencias).length + c.verifs.filter(function (v) { return v.status === "pendente"; }).length + (ks ? ks.pen : 0);
    if (g.tipo === "emitido") h += "<p>O projeto está <b>" + (global.HidStatusEmissao ? global.HidStatusEmissao.toLowerCase() : "emitido para execução") + "</b>: sem reprovação nos sistemas calculados. " + plural(g.n, "item depende", "itens dependem") + " de confirmação do responsável técnico, cada um com a premissa adotada (<a href=\"#sec-confirmacoes\">seção " + S("confirmacoes") + "</a>). Confirmado ou corrigido o item, a revisão seguinte registra a confirmação.</p>";
    else if (g.ok) h += "<p>As verificações desta emissão atendem aos critérios indicados na seção " + S("normas") + ". Os itens não abrangidos estão listados na seção " + S("pendencias") + " e não fazem parte desta conclusão.</p>";
    else h += "<p>O projeto <b>não pode ser declarado conforme</b> nesta emissão: " + ([rep ? plural(rep, "verificação não atende", "verificações não atendem") : "", pen ? plural(pen, "item não verificado", "itens não verificados") : ""].filter(Boolean).join(" e ") || "a situação do cálculo está incompleta") +
      ' (<a href="#sec-pendencias">seção ' + S("pendencias") + "</a>). Corrigidos esses itens, o cálculo deve ser refeito e o memorial reemitido em nova revisão.</p>";
    return h;
  }

  function secVerif(c, d) {
    var h = seloFixture(c), vs = c.verifs;
    if (!vs.length) return h + naoAbrCaixa(d, "o resultado não trouxe verificações.", "verificações");
    var sis = { agua_fria: "água fria", esgoto: "esgoto", recalque: "recalque", programa: "programa", agua_quente: "água quente", pluvial: "pluvial", incendio: "incêndio", tratamento: "tratamento", ete: "ETE", eta: "ETA", industrial: "fluido industrial" };
    var rep = vs.filter(function (v) { return v.status === "reprovado"; }).length, pen = vs.filter(function (v) { return v.status === "pendente"; }).length;
    h += "<p>" + plural(vs.length, "verificação", "verificações") + ": " + (vs.length - rep - pen) + " atendem, " + rep + " não atendem e " + pen + " pendentes (<b>não verificado</b>). η = valor ÷ limite, no sentido em que η ≤ 1 atende.</p>";
    h += d.tab("Verificações com passos", ["Id", "Sistema", "Alvo", "Verificação", thn("Valor"), thn("Limite"), thn("η"), "Situação", "Passos", "Fonte"],
      vs.map(function (v) {
        var pend = v.status === "pendente";
        return trw([td(t(v.id, "verificações")), td(sis[v.sistema] || t(v.sistema, "verificações")), td(t(v.alvo, "verificações")), td(t(v.nome, "verificações")),
          tn(pend || !fin(v.valor) ? "não verificado" : br(v.valor, 3) + NB + t(v.unidade || "", "verificações")), tn(fin(v.limite) ? br(v.limite, 3) : "—"), tn(br(v.eta, 2)),
          td(sit(v.status)), td(passosLista(v.passos, "verificação " + v.id)), td(fonteCurta(v.fonte))], clsLinha(v.status));
      }), { classe: "resumo" });
    return h;
  }

  /* ================================================================ 9 AVISOS E PENDÊNCIAS */
  function secPend(c, d) {
    var r = c.r, h = seloFixture(c);
    /* avisos de CONTROLE INTERNO da RA (licença de exemplar de norma, convênio de compra) não vão ao cliente */
    var RE_INTERNO_AV = /licenciad|exemplarLicenciado|conv[êe]nio Confea|comprar\/consultar a norma/i;
    var av = objs(r.avisos).filter(function (a) { return !RE_INTERNO_AV.test(String(a.texto || "") + " " + String(a.corrigir && a.corrigir.texto || "")); }), pen = objs(r.pendencias);
    var ORD = { erro: 0, aviso: 1, info: 2 };
    av = av.slice().sort(function (a, b) { return (ORD[a.gravidade] == null ? 3 : ORD[a.gravidade]) - (ORD[b.gravidade] == null ? 3 : ORD[b.gravidade]); });
    h += h3(S("pendencias") + ".1 Avisos");
    h += av.length ? d.tab("Avisos do cálculo", ["Gravidade", "Sistema", "Aviso", "Elementos", "Como corrigir"],
      av.map(function (a) {
        return trw([td(a.gravidade === "erro" ? '<span class="falha">ERRO</span>' : (a.gravidade === "aviso" ? '<span class="pend">AVISO</span>' : "INFO")), td(t(a.sistema, "avisos")), td(t(a.texto, "avisos")),
          td(arr(a.elementos).map(function (x) { return t(x, "avisos"); }).join(", ") || "—"), td(a.corrigir && a.corrigir.texto ? t(a.corrigir.texto, "avisos") : "—")], a.gravidade === "erro" ? "linha-falha" : (a.gravidade === "aviso" ? "linha-alerta" : ""));
      }), { classe: "compacta" }) : "<p>O cálculo não emitiu avisos.</p>";
    h += h3(S("pendencias") + ".2 Pendências: não verificado");
    if (pen.length) {
      h += caixa("<b>Valores de norma que faltaram.</b> A verificação que depende de cada um deles <b>não foi feita</b> e não pode ser considerada atendida.", "alerta");
      h += d.tab("Pendências por chave de tabela", ["Chave que falta", "Motivo", "Não verificado em"],
        pen.map(function (p) { return trw([td("<code>não verificado: falta " + t(p.chave, "pendências") + "</code>"), td(t(p.motivo, "pendências")), td(arr(p.usadoEm).map(function (x) { return t(x, "pendências"); }).join("<br>") || "—")], "linha-alerta"); }), { classe: "compacta" });
    } else h += "<p>Nenhuma chave de tabela de norma ficou pendente.</p>";
    var vp = c.verifs.filter(function (v) { return v.status === "pendente"; });
    if (vp.length) h += d.tab("Verificações pendentes", ["Id", "Alvo", "Verificação", "Fonte"], vp.map(function (v) { return trw([td(t(v.id, "pendências")), td(t(v.alvo, "pendências")), td(t(v.nome, "pendências") + " — <b>não verificado</b>"), td(fonteCurta(v.fonte))], "linha-alerta"); }), { classe: "compacta" });
    /* peça "só desenho" (família do escritório sem tipo do motor) em projeto com memorial: listada aqui e em "não abrangidos"; não reprova o resto */
    var psc = objs(r.pecasSemCalculo);
    if (psc.length) {
      h += caixa("<b>Peças que não entram no cálculo (só desenho).</b> A família do escritório não foi reconhecida nem mapeada para um tipo do motor: o cálculo <b>não a considerou</b> (ponto de utilização, perda ou desconector). O restante das verificações segue valendo.", "alerta");
      h += d.tab("Peças sem cálculo", ["Peça", "Família", "Motivo", "Como resolver"], psc.map(function (p) {
        d.naoAbrangido("peça sem cálculo (só desenho): " + p.nome + " (" + p.id + ")");
        return trw([td(t(p.id, "pendências")), td(t(p.nome, "pendências")), td(t(p.motivo, "pendências")), td(p.equivalente ? "mapear ou trocar por " + t(p.equivalente.nome, "pendências") : "mapear para um tipo do motor")], "linha-alerta");
      }), { classe: "compacta" });
    }
    var tp = objs(c.af.trechos).concat(objs(c.es.trechos)).concat(c.aq ? objs(c.aq.trechos) : []).concat(c.ap ? objs(c.ap.trechos) : []).filter(function (x) { return x.status === "pendente"; });
    if (tp.length) h += d.tab("Trechos com cálculo pendente", ["Trecho", "O que falta"], tp.map(function (x) { return trw([td("<b>" + t(x.aresta || x.id, "pendências") + "</b>"), td(faltaTxt(x.pendencias) || "não verificado")], "linha-alerta"); }), { classe: "compacta" });
    h += h3(S("pendencias") + ".3 Itens não abrangidos nesta emissão");
    h += "@@NAO_ABRANGIDOS@@";
    h += "@@CONFERENCIAS@@";   /* só aparece se houver divergência (F9: a lista de conferências internas é controle da RA, não do cliente) */
    if (arr(r.ops).length) h += "<p>O cálculo propõe alterar o DN de " + plural(arr(r.ops).length, "trecho", "trechos") + " no modelo (operação desfazível): " + arr(r.ops).map(function (o) { return t(o.id, "ops") + " → DN " + br(o.dn, 0); }).join("; ") + ".</p>";
    return h;
  }

  /* ================================================================ 10 REFERÊNCIAS / 11 TERMO */
  function secRef(c, d) {
    var ns = semNr24(objs(c.r.normas)), docs = unicos(ns.map(function (n) { return [n.norma, n.edicao ? "ed. " + n.edicao : "", n.doc].filter(Boolean).join(" — "); }));
    var h = seloFixture(c) + "<p>Documentos de origem dos valores de norma (vindos do resultado do cálculo):</p>";
    h += docs.length ? '<ul class="refs">' + docs.map(function (x) { return "<li>" + t(x, "referências") + "</li>"; }).join("") + "</ul>" : "<p>Nenhum documento de origem informado pelo resultado (<b>não verificado</b>: fonte das tabelas).</p>";
    /* só as fórmulas que o cálculo USOU (revisão F7 B4: listava Darcy-Weisbach mesmo com FWH) */
    var fp = String(c.af.formulaPerda || ""), usou = { darcy: /darcy/.test(fp), fwh: /fwh/.test(fp), hw: /hw/.test(fp) };
    h += "<p>Métodos físicos utilizados (sem valor de norma embutido):</p><ul class=\"refs\">" +
      (usou.darcy ? "<li>Equação de Darcy-Weisbach com fator de atrito de Colebrook-White (perda distribuída).</li>" : "") +
      (usou.fwh ? "<li>Equação de Fair-Whipple-Hsiao (tubo liso), com os coeficientes da fonte da tabela (perda distribuída).</li>" : "") +
      (usou.hw ? "<li>Equação de Hazen-Williams (perda distribuída).</li>" : "") +
      (!usou.darcy && !usou.fwh && !usou.hw ? "<li>Perda distribuída: <b>não verificado</b> (fórmula não informada pelo resultado).</li>" : "") +
      "<li>Propriedades da água por temperatura" + (obj(c.af.fluido).fonte ? ": " + t(c.af.fluido.fonte, "referências") + "." : ".") + "</li></ul>";
    return h;
  }
  /* cargo do contratante na assinatura: o informado; senão "Proprietário" quando o contratante é o próprio proprietário */
  function assinCargo(c, ca) {
    if (ca && ca.cargo) return String(ca.cargo);
    var nome = (ca && ca.nome) || c.ob.contratante || c.ob.proprietario || "";
    return nome && nome === (c.ob.proprietario || c.ob.cliente) ? "Proprietário" : "";
  }
  function secTermo(c, d) {
    var rp = c.rp, ca = obj(c.op.contratanteAssinatura), g = situacaoGeral(c);
    var h = seloFixture(c) + "<p>O responsável técnico declara que o cálculo acima segue os métodos e as fontes indicadas. Situação do cálculo nesta emissão: " + g.txt + (g.tipo === "emitido" ? " Os itens a confirmar (seção " + S("confirmacoes") + ") seguem com a premissa registrada e serão conferidos antes da execução; os itens não abrangidos (seção " + S("pendencias") + ") não estão cobertos por esta declaração." : " Os itens não verificados e não abrangidos (seção " + S("pendencias") + ") não estão cobertos por esta declaração.") + "</p>";
    h += '<div class="assin-grade">' +
      '<div class="assin"><div class="assin-linha"></div><div><b>' + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</b></div><div>" + ph(rp.titulo, "TÍTULO") + " — " + esc(creaTxt(rp)) + "</div><div>" + ph(rp.empresa, "EMPRESA") + (rp.cnpj ? " — CNPJ " + esc(rp.cnpj) : "") + '</div><div class="assin-tit">Responsável técnico</div></div>' +
      '<div class="assin"><div class="assin-linha"></div><div><b>' + ph(ca.nome || c.ob.contratante || c.ob.proprietario, "NOME DO CONTRATANTE") + "</b></div>" + (assinCargo(c, ca) ? "<div>" + esc(assinCargo(c, ca)) + "</div>" : "") + (ca.empresa ? "<div>" + esc(ca.empresa) + "</div>" : "") + '<div class="assin-tit">Contratante</div></div></div>';
    h += '<p class="local">' + ph(c.op.local, "LOCAL") + ", " + esc(c.data) + ".</p>";
    return h;
  }

  /* ================================================================ CSS */
  function css(c) {
    var rp = c.rp, A = COR.azul;
    var topoE = c.obraNome + " — Instalações hidrossanitárias" + (c.clima ? " e climatização" : "") + (c.fixture ? " — TABELAS DE TESTE" : ""), topoD = "Memorial de cálculo " + (c.num ? c.num + " " : "") + c.rev;
    var rodE = [rp.empresa || "RA Engenharia", rp.nome ? "Resp. técnico: " + (rp.abrev ? rp.abrev + " " : "") + rp.nome + (rp.crea ? " — " + creaTxt(rp) : "") : ""].filter(Boolean).join(" · ");
    var mb = "font: 7.3pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    return "@page { size: A4; margin: 20mm 12mm 17mm 16mm;" +
      " @top-left { content: " + cssStr(topoE) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @top-right { content: " + cssStr(topoD) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @bottom-left { content: " + cssStr(rodE) + "; " + mb + " vertical-align: top; padding-top: 3mm; }" +
      " @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " vertical-align: top; padding-top: 3mm; } }" +
      "@page :first { @top-left { content: none; border: none; } @top-right { content: none; border: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font: 9.2pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 190mm; margin: 10mm auto; padding: 0 8mm; } .sec, .sumario { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 20pt; font-weight: 600; margin: 2mm 0; color: " + A + "; }" +
      "h2 { font-size: 13.5pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid " + A + "; color: #1d2733; break-after: avoid; }" +
      "h2 .num { color: " + A + "; margin-right: 3mm; } h2 .de { float: right; font-size: 7.2pt; font-weight: 400; color: #8a95a3; margin-top: 2.6mm; }" +
      "h3 { font-size: 10.6pt; font-weight: 600; margin: 5mm 0 2mm; color: " + A + "; break-after: avoid; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul, ol { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; } code { font-size: 8pt; }" +
      ".sec { break-before: page; } .sec.curta { break-before: auto; margin-top: 6mm; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 7.9pt; line-height: 1.3; font-variant-numeric: tabular-nums; }" +
      "table.t caption { caption-side: top; text-align: left; font-size: 8.1pt; padding-bottom: 1.2mm; }" +
      "table.t th { background: #e6edf3; color: " + A + "; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1mm 1.3mm; vertical-align: bottom; }" +
      "table.t td { border: 0.5pt solid #ccd5de; padding: 0.85mm 1.3mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.tot td { background: #eef3f8; border-top: 0.9pt solid #8a97a6; }" +
      "table.t tr.linha-falha td { background: #fbefed; } table.t tr.linha-alerta td { background: #fbf6ea; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; }" +
      "table.compacta { font-size: 7.3pt; } table.compacta td { padding: 0.6mm 1.1mm; } table.resumo { font-size: 6.6pt; } table.resumo th, table.resumo td { padding: 0.6mm 0.8mm; }" +
      "table.ficha td:first-child { width: 42%; color: #3a4654; } table.normas { table-layout: fixed; }" +
      "table.catalogo td.ico { width: 19mm; padding: 0.6mm; text-align: center; vertical-align: middle; background: #fff !important; } img.peca-ico { width: 17mm; height: 17mm; object-fit: contain; display: block; margin: 0 auto; } img.peca-ico.mini { width: 7mm; height: 7mm; display: inline-block; vertical-align: middle; margin: 0 1mm 0 0; } span.peca-ico.vazio { display: inline-block; width: 17mm; font-size: 6pt; color: #9aa4af; } table.catalogo td { vertical-align: middle; } small.peca { color: #4a5664; }" +
      "table.curta { break-inside: avoid; } thead { display: table-header-group; } tr { break-inside: avoid; } caption { break-after: avoid; }" +
      ".nota { font-size: 7.6pt; color: #4a5664; } p.nota { margin-top: -2mm; }" +
      ".ok { color: " + COR.verde + "; font-weight: 700; } .falha { color: " + COR.falha + "; font-weight: 700; } .pend { color: #9a5b12; font-weight: 700; } .neutro { color: #555; font-weight: 700; } .ph { color: #b3261e; font-weight: 600; } .alerta-tx { color: #9a5b12; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid " + A + "; background: #f3f6f9; padding: 2.2mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; }" +
      ".caixa.alerta { border-left-color: " + COR.alerta + "; background: #fbf6ea; } .caixa.neutra { border-left-color: " + COR.areia + "; background: #f7f4ee; } .caixa.erro { border-left-color: " + COR.falha + "; background: #fbf1ef; } .caixa ul { margin: 1.5mm 0 0; }" +
      "a { color: " + A + "; text-decoration: none; } ul.refs li { margin-bottom: 1.6mm; } ol.regras li { margin-bottom: 1.4mm; text-align: justify; }" +
      ".capa { height: 258mm; display: flex; flex-direction: column; break-after: page; }" +
      ".capa-logos { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; } .logo-box { flex: 1; text-align: center; }" +
      ".logo-box .logo { max-height: 24mm; max-width: 56mm; } .logo-txt { font-size: 13pt; font-weight: 600; color: " + A + "; padding: 4mm 0; } .logo-ph { height: 20mm; display: flex; align-items: center; justify-content: center; border: 0.6pt dashed #c9b9a0; font-size: 10pt; }" +
      ".logo-rot { font-size: 6.8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #8a7a62; margin-top: 1.2mm; }" +
      ".capa-faixa { display: flex; height: 1.3mm; margin: 5mm 0 7mm; } .capa-faixa span { display: block; height: 100%; } .capa-faixa .f1 { flex: 6; background: " + A + "; } .capa-faixa .f2 { flex: 2; background: " + COR.areia + "; } .capa-faixa .f3 { flex: 1; background: " + COR.verde + "; }" +
      ".capa-tit .sobre { font-size: 8.5pt; letter-spacing: 0.2em; color: " + COR.marrom + "; font-weight: 600; } .capa-tit .sub { color: #4a5664; font-size: 9.6pt; }" +
      ".capa-sit { margin-top: 3mm; border: 1.2pt solid " + COR.falha + "; color: " + COR.falha + "; font-weight: 700; font-size: 9pt; text-align: center; padding: 2mm; letter-spacing: 0.04em; }" +
      ".capa-sit2 { margin-top: 3mm; font-size: 8.4pt; text-align: center; color: #4a5664; } .capa-vazio { flex: 1; }" +
      ".capa-ficha, .capa-rev { width: 100%; border-collapse: collapse; font-size: 8.1pt; margin-top: 1.5mm; } .capa-ficha td { border-bottom: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; vertical-align: top; } .capa-ficha td:first-child { width: 26%; color: #5b6774; }" +
      ".capa-rev caption { text-align: left; font-weight: 600; color: " + A + "; font-size: 8.2pt; padding: 2mm 0 1mm; } .capa-rev th { background: #e6edf3; border: 0.5pt solid #b8c4d0; padding: 1mm 1.5mm; text-align: left; font-weight: 600; } .capa-rev td { border: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; }" +
      ".capa-ficha td.sit-falha { background: #fbefed; color: #a3352b; }" +
      ".sumario { break-after: page; } ol.sum { list-style: none; padding: 0; margin: 3mm 0 6mm; font-size: 10.4pt; }" +
      "ol.sum li { padding: 1.6mm 0; border-bottom: 0.5pt solid #e1e7ed; } ol.sum .sn { display: inline-block; width: 9mm; color: " + A + "; font-weight: 600; } ol.sum a { color: #1d2733; }" +
      ".assin-grade { display: flex; justify-content: space-between; gap: 6mm; margin: 26mm 0 6mm; break-inside: avoid; } .assin { flex: 1; text-align: center; font-size: 8.2pt; }" +
      ".assin-linha { border-top: 0.7pt solid #1d2733; margin-bottom: 2mm; } .assin div { margin-bottom: 0.6mm; } .assin-tit { margin-top: 1.5mm; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: " + COR.marrom + "; }" +
      "p.local { margin-top: 10mm; text-align: center; }";
  }

  /* ================================================================ GERAR */
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    estado.indefinidos = [];
    if (!r || typeof r !== "object" || !r.sistemas) return { ok: false, motivo: "Sem resultado de cálculo para gerar o memorial.", html: "", titulo: "", secoes: [], tabelas: 0, avisos: [], conferencias: [], naoAbrangidos: [] };
    var c = contexto(r, opcoes), d = new Doc();
    var FN = { objeto: secObjeto, normas: secNormas, premissas: secPremissas, confirmacoes: secConfirmacoes, programa: secPrograma, af: secAF, es: secES, recalque: secRecalque, aq: secAQ, ap: secAP, incendio: secIN, tratamento: secTR, industrial: secIND, gas: secGAS, clima: secClima, materiais: secMateriais, verificacoes: secVerif, decisoes: secDecisoes, pendencias: secPend, conclusao: secConclusao, referencias: secRef, termo: secTermo };
    var corpo = SECOES.map(function (s, i) {
      var n = i + 1, h;
      try { h = FN[s.id](c, d, n); }
      catch (e) { d.aviso("Seção " + n + " (" + s.titulo + ") gerada com erro: " + (e && e.message)); h = caixa("<b>Esta seção não pôde ser gerada:</b> " + esc(e && e.message) + ".", "erro"); }
      /* sistema ausente: a seção fica (numeração estável, o leitor vê que não há), mas sem página própria */
      return '<section class="sec' + (ausente(c, s.id) ? " curta" : "") + '" id="sec-' + s.id + '"><h2><span class="num">' + n + "</span>" + esc(s.titulo) + '<span class="de">seção ' + n + " de " + SECOES.length + " · " + esc(c.rev) + "</span></h2>" + h + "</section>";
    }).join("");

    /* conferências internas: o memorial apresenta, não recalcula, mas confere que apresentou tudo */
    var trAF = objs(c.af.trechos), trES = objs(c.es.trechos);
    d.conferir("trechos-af", trAF.every(function (x) { return corpo.indexOf("<b>" + esc(x.aresta || x.id) + "</b>") >= 0; }), "todos os " + trAF.length + " trechos de água fria do resultado aparecem no memorial");
    var trAQ = c.aq ? objs(c.aq.trechos) : [], trAP = c.ap ? objs(c.ap.trechos) : [];
    if (c.aq) d.conferir("trechos-aq", trAQ.every(function (x) { return corpo.indexOf("<b>" + esc(x.aresta || x.id) + "</b>") >= 0; }), "todos os " + trAQ.length + " trechos de água quente do resultado aparecem no memorial");
    if (c.ind) d.conferir("trechos-industrial", objs(c.ind.trechos).every(function (x) { return corpo.indexOf("<b>" + esc(x.id) + "</b>") >= 0; }), "todos os " + objs(c.ind.trechos).length + " trechos da rede industrial do resultado aparecem no memorial");
    if (c.gas) d.conferir("trechos-gas", objs(c.gas.trechos).every(function (x) { return corpo.indexOf("<b>" + esc(x.id) + "</b>") >= 0; }), "todos os " + objs(c.gas.trechos).length + " trechos da rede de gás do resultado aparecem no memorial");
    if (c.tr) d.conferir("unidades-tratamento", objs(c.tr.unidades).every(function (u) { return corpo.indexOf("<b>" + esc(u.id) + "</b>") >= 0; }), "todas as " + objs(c.tr.unidades).length + " unidades do tratamento aparecem no memorial");
    if (c.inc) d.conferir("trechos-incendio", objs(obj(c.inc.hidrantes).trechos).every(function (x) { return corpo.indexOf("<b>" + esc(x.id) + "</b>") >= 0; }), "todos os trechos da rede de incêndio do resultado aparecem no memorial");
    if (c.ap) d.conferir("trechos-ap", trAP.every(function (x) { return corpo.indexOf("<b>" + esc(x.aresta || x.id) + "</b>") >= 0; }), "todos os " + trAP.length + " condutores de pluvial do resultado aparecem no memorial");
    d.conferir("trechos-es", trES.every(function (x) { return corpo.indexOf(esc(x.aresta || x.id)) >= 0 || corpo.indexOf(esc(limpaFonte(x.aresta || x.id))) >= 0; }), "todos os " + trES.length + " trechos de esgoto do resultado aparecem no memorial");
    d.conferir("verificacoes", c.verifs.every(function (v) { return corpo.indexOf(esc(v.id)) >= 0; }), "todas as " + c.verifs.length + " verificações do resultado aparecem no memorial");
    d.conferir("pendencias", objs(r.pendencias).every(function (p) { return corpo.indexOf(esc(p.chave)) >= 0 || corpo.indexOf(esc(limpaFonte(p.chave))) >= 0; }), "toda pendência de norma do resultado aparece como 'não verificado'");   /* F9: a chave sai em português (limpaFonte) */
    d.conferir("fixture", !c.fixture || corpo.indexOf("NÃO É NORMA") >= 0, "resultado calculado com tabelas de teste leva o selo de aviso na capa e nas seções");
    d.conferir("textos", estado.indefinidos.length === 0, "textos dos motores sem valor indefinido" + (estado.indefinidos.length ? ": " + estado.indefinidos.length + " ocorrência(s)" : ""));
    estado.indefinidos.forEach(function (x) { d.aviso("Texto do motor com valor indefinido — " + x); });

    var confHtml = '<ul class="conf">' + d.conf.map(function (k) { return "<li>" + (k.ok ? '<span class="ok">verdadeira</span>' : '<span class="falha">FALSA</span>') + " — " + esc(k.texto) + "</li>"; }).join("") + "</ul>";
    var divs = d.avisos.slice();
    confHtml += divs.length ? caixa("<b>Divergências encontradas:</b><ul>" + divs.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", "erro") : caixa("Todas as conferências internas passaram.");
    corpo = corpo.replace("@@CONFERENCIAS@@", divs.length ? h3(S("pendencias") + ".4 Conferências internas do memorial") + confHtml : "");
    corpo = corpo.replace("@@NAO_ABRANGIDOS@@", d.naoAbr.length ? "<ul>" + d.naoAbr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "<p>Nenhum.</p>");
    var titulo = "Memorial de cálculo — Instalações hidrossanitárias" + (c.clima ? " e climatização" : "") + " — " + c.obraNome;
    function limpaHtml(h) { return h.replace(/(<style[\s\S]*?<\/style>)|>([^<]+)</g, function (m, st, tx) { return st ? st : ">" + limpaFonte(tx) + "<"; }); }
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — HidMemorial"><title>' + esc(titulo) + "</title><style>" + css(c) + "</style></head><body>" +
      capa(c) + sumario(c, d) + corpo + "</body></html>";
    html = limpaHtml(html);
    return {
      ok: true, html: html, titulo: titulo,
      secoes: [{ id: "capa", numero: null, titulo: "Capa" }].concat(SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; })),
      tabelas: d.nTab, avisos: divs, conferencias: d.conf.slice(), naoAbrangidos: d.naoAbr.slice(), materiais: { linhas: d.nMateriais || 0, semIcone: d.semIcone || 0 }
    };
  }

  /* hid:fisica-fim */

  var HidMemorial = { rotuloTema: rotuloTema, chaveHumana: chaveHumana, itensConfirmar: itensConfirmar, gerar: gerar, SECOES: SECOES, CORES: COR, limpaFonte: limpaFonte, decisaoCliente: decisaoCliente, creaTxt: creaTxt, enderecoTxt: enderecoTxt };
  global.HidMemorial = HidMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = HidMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
