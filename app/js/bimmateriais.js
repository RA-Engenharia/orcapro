/* =====================================================================
 * bimmateriais.js — MATERIAIS DO PROJETO: o motor puro (09/10/2026)
 *
 * Gerenciar › Biblioteca › Materiais do projeto (prévia do modelador). Cada
 * obra tem a SUA lista de materiais — o "Porcelanato polido da obra do
 * Quiosque", com a cor, o padrão de corte, a aparência de render e a massa
 * dela. A biblioteca RA de render (data/materiais-render-ra.json,
 * js/rendermat.js) continua SÓ LEITURA: daqui ela é ponto de partida
 * ("usar como base", "importar", "duplicar"), nunca é alterada.
 *
 * Um material tem quatro grupos de campos (as abas da tela):
 *   Identidade  nome, descrição, classe, fabricante, modelo, comentários,
 *               marca e o CÓDIGO de orçamento (SINAPI, conferido no mapa
 *               js/sinapimapa.js — código fora do mapa é recusado e vazio é
 *               PENDENTE; nunca se inventa código);
 *   Gráficos    cor de sombreamento, transparência, padrão de SUPERFÍCIE e de
 *               CORTE (os preenchimentos RA da P6, data/estilos-objeto-ra.json)
 *               e a cor de cada padrão;
 *   Aparência   os números físicos do render (cor base, rugosidade,
 *               metalicidade, transmissão, IOR, verniz, relevo, escala da
 *               textura) partindo de um material da biblioteca RA (a base);
 *   Físico      massa específica (kg/m³) com a FONTE (a tabela da NBR 6120
 *               do js/bimpeso.js quando o nome casa; senão, o que a pessoa
 *               informar). Sem fonte, fica vazio — nunca um número de reserva.
 *
 * ⚠ SEM LISTA DENTRO DE LISTA. Cada material é UM registro plano (só texto,
 *   número, booleano ou null) — a nuvem recusa array dentro de array (memória
 *   orcapro-nuvem-lista-em-lista) e um registro plano nunca cai nessa.
 *   `plano(rec)` confere; o teste reprova o registro que não for.
 * ⚠ A PEÇA guarda só o id do material (`materialProj`, gravado pela op
 *   `marcar` do registro de parâmetros — js/bimparam.js): trocar o material,
 *   substituir em todo o modelo e o Ctrl+Z são ops do editor, como as outras.
 *
 * Quem usa o que sai daqui (ganchos "MATERIAIS"):
 *   js/bimrender.js   — a Aparência ganha da casagem automática por nome;
 *   js/ifcsaida.js    — nome, cor e transparência no IfcMaterial/estilo;
 *   js/bimmodelovista.js + js/desenho2d.js — o padrão de corte na planta;
 *   js/bimpropsui.js  — o campo "Material" oferece os materiais do projeto;
 *   js/gestao.js      — a massa entra no peso das peças (js/bimpeso.js).
 * Teste: node tools/test-bimmateriais.js. ES5; global BimMateriais + module.exports.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  /* número BR: "2.300" = 2300, "2.300,5" = 2300,5, "0,4" = 0,4 (e o número JS como está) */
  function num(v, d) {
    if (v == null || v === "") return d;
    if (typeof v === "number") return isFinite(v) ? v : d;
    var s = String(v).trim().replace(/\s/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var n = Number(s); return isFinite(n) ? n : d;
  }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  var ACENTOS = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
                  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n" };
  function chaveNome(s) {
    return txt(s).toLowerCase().replace(/[áàâãäéêèëíìîïóòôõöúùûüçñ]/g, function (c) { return ACENTOS[c] || c; })
      .replace(/\s+/g, " ").trim();
  }
  function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(txt(h).trim()); }
  function hex(h, pad) { var s = txt(h).trim().toLowerCase(); if (/^[0-9a-f]{6}$/.test(s)) s = "#" + s; return hexOk(s) ? s : pad; }

  /* ------------------------------------------------------------ CLASSES */
  var CLASSES = [
    { id: "concreto", nome: "Concreto" }, { id: "alvenaria", nome: "Alvenaria" }, { id: "argamassa", nome: "Argamassa e revestimento" },
    { id: "ceramica", nome: "Cerâmica" }, { id: "pedra", nome: "Pedra" }, { id: "madeira", nome: "Madeira" }, { id: "metal", nome: "Metal" },
    { id: "vidro", nome: "Vidro" }, { id: "pintura", nome: "Pintura" }, { id: "plastico", nome: "Plástico" }, { id: "tecido", nome: "Tecido" },
    { id: "isolamento", nome: "Isolamento" }, { id: "terra", nome: "Terra e agregados" }, { id: "generico", nome: "Genérico" }
  ];
  var CLASSE = {}; CLASSES.forEach(function (c) { CLASSE[c.id] = c; });
  /* categoria da biblioteca RA de render → classe (e as exceções por id) */
  var CLASSE_DA_CATEGORIA = { piso: "ceramica", parede: "pintura", vidro: "vidro", madeira: "madeira", concreto: "concreto", alvenaria: "alvenaria",
                              pedra: "pedra", metal: "metal", plastico: "plastico", loucas: "ceramica", tecido: "tecido", cobertura: "ceramica", externo: "terra" };
  var CLASSE_DO_ID = { reboco: "argamassa", gesso: "argamassa", textura_acrilica: "pintura", telha_metalica: "metal", telha_fibrocimento: "generico",
                       telha_shingle: "generico", agua: "generico", asfalto: "generico", piso_intertravado: "concreto", deck_madeira: "madeira", pvc_amadeirado: "plastico" };

  /* os PREENCHIMENTOS RA (as chaves de data/estilos-objeto-ra.json
     `preenchimentos`, P6). "" = o da categoria (o estilo de objeto manda).
     O teste confere que esta lista é a do arquivo. */
  var PADROES = ["vazio", "solido", "cinza", "concreto", "alvenaria", "bloco", "terra", "areia", "brita", "madeira", "aco", "isolamento", "gesso", "telha", "vidro"];
  var CORTE_DA_CLASSE = { concreto: "concreto", alvenaria: "alvenaria", argamassa: "gesso", madeira: "madeira", metal: "aco", vidro: "vidro", isolamento: "isolamento", terra: "terra" };

  /* faixas físicas da Aparência (as mesmas do js/rendermat.js validar, mais a escala) */
  var FAIXA = { apRugosidade: [0, 1], apMetalicidade: [0, 1], apTransmissao: [0, 1], apIor: [1, 2.5], apClearcoat: [0, 1], apClearcoatRug: [0, 1], apRelevo: [0, 1], apEscala: [0.05, 20] };
  var AP_PADRAO = { apRugosidade: 0.5, apMetalicidade: 0, apTransmissao: 0, apIor: 1.5, apClearcoat: 0, apClearcoatRug: 0, apRelevo: 0, apEscala: 1 };
  var MASSA_MAX = 25000;   /* kg/m³ — acima disso não é material de construção (aço 7850, chumbo 11340) */

  /* o registro: SÓ estes campos, todos planos */
  var CAMPOS = ["id", "obraId", "nome", "descricao", "classe", "fabricante", "modelo", "comentarios", "marca", "codigo",
                "cor", "transparencia", "padraoSup", "corSup", "padraoCorte", "corCorte",
                "apBase", "apCor", "apRugosidade", "apMetalicidade", "apTransmissao", "apIor", "apClearcoat", "apClearcoatRug", "apRelevo", "apEscala",
                "massa", "massaRef", "origem", "criado", "alterado"];
  var LIM = { nome: 80, descricao: 300, fabricante: 80, modelo: 80, comentarios: 300, marca: 24, codigo: 12, massaRef: 200, origem: 40 };

  /* um registro limpo: só os campos conhecidos, tipos e faixas */
  function normalizar(m) {
    m = m || {};
    var o = {};
    o.id = txt(m.id).trim().slice(0, 60);
    o.obraId = txt(m.obraId).trim().slice(0, 120);
    o.nome = txt(m.nome).replace(/\s+/g, " ").trim().slice(0, LIM.nome);
    ["descricao", "fabricante", "modelo", "comentarios", "marca", "massaRef", "origem"].forEach(function (k) { o[k] = txt(m[k]).trim().slice(0, LIM[k]); });
    o.codigo = txt(m.codigo).replace(/\D/g, "").slice(0, LIM.codigo);
    o.classe = CLASSE[m.classe] ? m.classe : "generico";
    o.cor = hex(m.cor, "#bfbfbf");
    o.transparencia = Math.round(clamp(num(m.transparencia, 0), 0, 100));
    o.padraoSup = PADROES.indexOf(m.padraoSup) >= 0 ? m.padraoSup : "";
    o.padraoCorte = PADROES.indexOf(m.padraoCorte) >= 0 ? m.padraoCorte : "";
    o.corSup = hex(m.corSup, "#000000"); o.corCorte = hex(m.corCorte, "#000000");
    o.apBase = /^[a-z0-9_]+$/.test(txt(m.apBase)) ? txt(m.apBase) : "";
    o.apCor = hex(m.apCor, o.cor);
    Object.keys(FAIXA).forEach(function (k) { o[k] = r3(clamp(num(m[k], AP_PADRAO[k]), FAIXA[k][0], FAIXA[k][1])); });
    var ms = num(m.massa, null);
    o.massa = ms != null && ms > 0 && ms <= MASSA_MAX ? Math.round(ms * 10) / 10 : null;
    if (o.massa == null) o.massaRef = "";
    o.criado = txt(m.criado).slice(0, 40); o.alterado = txt(m.alterado).slice(0, 40);
    return o;
  }
  /* o registro é PLANO? (nenhum valor é lista nem objeto) */
  function plano(rec) {
    if (!rec || typeof rec !== "object") return false;
    return Object.keys(rec).every(function (k) { var v = rec[k]; return v === null || typeof v === "string" || typeof v === "boolean" || fin(v); });
  }

  /* ------------------------------------------------------------ nomes */
  function porNome(lista, nome) { var k = chaveNome(nome); if (!k) return null; return arr(lista).filter(function (m) { return m && chaveNome(m.nome) === k; })[0] || null; }
  function porId(lista, id) { var s = txt(id); if (!s) return null; return arr(lista).filter(function (m) { return m && m.id === s; })[0] || null; }
  /* "Porcelanato polido" → se existe, "Porcelanato polido (cópia)", "(cópia 2)"… */
  function nomeLivre(lista, nome, exceto, sufixo) {
    var base = txt(nome).replace(/\s+/g, " ").trim().slice(0, LIM.nome - 12) || "Material";
    function livre(n) { var m = porNome(lista, n); return !m || (exceto && m.id === exceto); }
    if (!sufixo) { if (livre(base)) return base; for (var j = 2; j < 1000; j++) if (livre(base + " " + j)) return base + " " + j; }
    var s = sufixo || "cópia", n1 = base + " (" + s + ")";
    if (livre(n1)) return n1;
    for (var i = 2; i < 1000; i++) { var ni = base + " (" + s + " " + i + ")"; if (livre(ni)) return ni; }
    return base + " " + Date.now().toString(36);
  }
  var _seq = 0;
  function novoId(agora) { _seq = (_seq + 1) % 1296; return "mp-" + (agora || Date.now()).toString(36) + "-" + ("0" + _seq.toString(36)).slice(-2) + Math.floor(Math.random() * 1296).toString(36); }
  function carimbo(o, opts) { var t = (opts && opts.agora) || new Date().toISOString(); if (!o.criado) o.criado = t; o.alterado = t; return o; }

  /* ------------------------------------------------------------ CRUD
   * As funções devolvem { ok, mat } ou { ok:false, erro } e NÃO gravam: quem
   * grava (Store, por obra) é a tela. opts = { obraId, agora, id, RM } */
  function novo(lista, dados, opts) {
    opts = opts || {}; dados = dados || {};
    var nome = txt(dados.nome).trim();
    if (nome && porNome(lista, nome)) return { ok: false, erro: "Já existe um material \"" + nome + "\" neste projeto." };
    var m = normalizar(dados);
    m.id = opts.id || novoId(); m.obraId = txt(opts.obraId || dados.obraId);
    m.nome = nome ? m.nome : nomeLivre(lista, "Novo material");
    m.origem = m.origem || "projeto";
    return { ok: true, mat: carimbo(m, opts) };
  }
  function duplicar(lista, origem, opts) {
    opts = opts || {};
    if (!origem) return { ok: false, erro: "Escolha o material a duplicar." };
    var m = normalizar(origem);
    m.id = opts.id || novoId(); m.obraId = txt(opts.obraId || origem.obraId); m.criado = "";
    m.nome = nomeLivre(lista, origem.nome, null, "cópia");
    m.origem = origem.origem && /^ra:/.test(origem.origem) ? origem.origem : "projeto";
    return { ok: true, mat: carimbo(m, opts) };
  }
  function renomear(lista, id, nome, opts) {
    var m = porId(lista, id); if (!m) return { ok: false, erro: "Material não encontrado." };
    var n = txt(nome).replace(/\s+/g, " ").trim();
    if (!n) return { ok: false, erro: "O nome não pode ficar vazio." };
    if (n.length > LIM.nome) return { ok: false, erro: "O nome tem no máximo " + LIM.nome + " caracteres." };
    var outro = porNome(lista, n);
    if (outro && outro.id !== id) return { ok: false, erro: "Já existe um material \"" + n + "\" neste projeto." };
    var o = normalizar(m); o.nome = n;
    return { ok: true, mat: carimbo(o, opts) };
  }
  /* mudar campos (as abas): só o que é campo do registro; o nome passa pelo renomear */
  function alterar(lista, id, campos, opts) {
    var m = porId(lista, id); if (!m) return { ok: false, erro: "Material não encontrado." };
    var o = normalizar(m), c = campos || {};
    if (c.nome != null && chaveNome(c.nome) !== chaveNome(m.nome)) { var rn = renomear(lista, id, c.nome, opts); if (!rn.ok) return rn; o.nome = rn.mat.nome; }
    if (c.codigo != null) { var v = validarCodigo(c.codigo); if (!v.ok) return { ok: false, erro: v.erro }; }
    /* a cor de sombreamento SEGUE a cor da Aparência enquanto as duas forem iguais (ligadas);
       quem escolhe uma cor de sombreamento diferente desliga o vínculo */
    var ligadas = hex(m.cor, "") === hex(m.apCor, "#");
    Object.keys(c).forEach(function (k) { if (k !== "id" && k !== "obraId" && k !== "nome" && k !== "criado" && CAMPOS.indexOf(k) >= 0) o[k] = c[k]; });
    if (c.apCor != null && c.cor == null && ligadas) o.cor = c.apCor;
    if (c.massa != null && c.massaRef == null) o.massaRef = "informado pelo usuário";
    o = normalizar(o);
    return { ok: true, mat: carimbo(o, opts) };
  }

  /* ------------------------------------------------------------ biblioteca RA (só leitura) */
  function classeDoRA(mr) { return CLASSE_DO_ID[mr.id] || CLASSE_DA_CATEGORIA[mr.categoria] || "generico"; }
  /* a massa pela tabela da NBR 6120 (js/bimpeso.js) quando o nome casa; senão vazio */
  function massaPelaTabela(nome) {
    var P = dep("BimPeso", "./bimpeso.js"); if (!P || !P.casarMaterial) return null;
    var t = null; try { t = P.casarMaterial(nome); } catch (e) { t = null; }
    if (!t || !(t.kNm3 > 0)) return null;
    return { massa: Math.round(t.kNm3 * 1000 / P.G * 10) / 10, ref: "ABNT NBR 6120:2019 (" + t.kNm3 + " kN/m³): " + txt(t.ref).slice(0, 140) };
  }
  /* um material do projeto a partir de um da biblioteca RA (importar / duplicar) */
  function doRA(lista, idRA, RM, opts) {
    opts = opts || {};
    var mr = RM && RM.material ? RM.material(idRA) : null;
    if (!mr) return { ok: false, erro: "Material da biblioteca RA não encontrado: " + idRA + "." };
    var classe = classeDoRA(mr), ms = massaPelaTabela(mr.nome);
    var m = normalizar({
      nome: mr.nome, descricao: "Da biblioteca RA de render", classe: classe, cor: mr.cor,
      transparencia: mr.transmissao > 0 ? 70 : 0, padraoCorte: CORTE_DA_CLASSE[classe] || "", padraoSup: "",
      apBase: mr.id, apCor: mr.cor, apRugosidade: mr.rugosidade, apMetalicidade: mr.metalicidade, apTransmissao: mr.transmissao, apIor: mr.ior,
      apClearcoat: num(mr.clearcoat, 0), apClearcoatRug: num(mr.clearcoat_rugosidade, 0), apRelevo: num(mr.relevo, 0), apEscala: 1,
      massa: ms ? ms.massa : null, massaRef: ms ? ms.ref : "", origem: "ra:" + mr.id
    });
    m.id = opts.id || novoId(); m.obraId = txt(opts.obraId);
    m.nome = opts.copia ? nomeLivre(lista, mr.nome, null, "cópia") : nomeLivre(lista, mr.nome);
    return { ok: true, mat: carimbo(m, opts) };
  }
  /* "usar como base": a Aparência inteira vem do material RA (a identidade fica) */
  function usarBase(mat, idRA, RM) {
    var mr = RM && RM.material ? RM.material(idRA) : null;
    if (!mat || !mr) return { ok: false, erro: "Material da biblioteca RA não encontrado." };
    var o = normalizar(mat);
    o.apBase = mr.id; o.apCor = hex(mr.cor, o.apCor); o.apRugosidade = mr.rugosidade; o.apMetalicidade = mr.metalicidade; o.apTransmissao = mr.transmissao;
    o.apIor = mr.ior; o.apClearcoat = num(mr.clearcoat, 0); o.apClearcoatRug = num(mr.clearcoat_rugosidade, 0); o.apRelevo = num(mr.relevo, 0); o.apEscala = 1;
    return { ok: true, mat: normalizar(o) };
  }

  /* ------------------------------------------------------------ código de orçamento */
  var _idxSinapi = null;
  function indiceSinapi() {
    var M = dep("SinapiMapa", "./sinapimapa.js"), mapa = M && (M.MAPA || M.mapa || M);
    if (_idxSinapi && _idxSinapi.de === mapa) return _idxSinapi.idx;
    var idx = {}, pc = mapa && mapa.porClasse;
    if (pc) Object.keys(pc).forEach(function (cl) { arr(pc[cl]).forEach(function (c) { if (!idx[c]) idx[c] = cl; }); });
    _idxSinapi = { de: mapa, idx: idx };
    return idx;
  }
  /* vazio = PENDENTE (ok); código que não está no mapa SINAPI = recusado */
  function validarCodigo(cod, idx) {
    var c = txt(cod).replace(/\s/g, "");
    if (!c) return { ok: true, pendente: true };
    if (!/^\d{4,7}$/.test(c)) return { ok: false, erro: "Código SINAPI tem só números (4 a 7 dígitos)." };
    idx = idx || indiceSinapi();
    if (!Object.keys(idx).length) return { ok: false, erro: "O mapa SINAPI (js/sinapimapa.js) não carregou: não dá para conferir o código." };
    if (!idx[c]) return { ok: false, erro: "O código " + c + " não está no mapa SINAPI das classes modeláveis — confira o código; sem ele o material fica pendente." };
    return { ok: true, pendente: false, classe: idx[c] };
  }

  /* ------------------------------------------------------------ o modelo (estado do editor) */
  /* todas as peças do editor que podem levar material (as mesmas que o `marcar` alcança) */
  function pecas(estado) {
    var st = estado || {}, l = [];
    ["caixas", "coberturas", "familias", "volumes", "forros", "telhados", "bordas", "fundacoes"].forEach(function (k) { arr(st[k]).forEach(function (x) { if (x && x.id != null) l.push(x); }); });
    var T = st.terreno; if (T) ["topos", "subregioes", "plataformas", "componentes"].forEach(function (k) { arr(T[k]).forEach(function (x) { if (x && x.id != null) l.push(x); }); });
    return l;
  }
  /* id da peça → id do material do projeto */
  function materialDasPecas(estado) { var o = {}; pecas(estado).forEach(function (p) { if (p.materialProj) o[String(p.id)] = String(p.materialProj); }); return o; }
  function usos(estado, id) { var s = txt(id); return pecas(estado).filter(function (p) { return p.materialProj != null && String(p.materialProj) === s; }).map(function (p) { return String(p.id); }); }
  function contagem(estado) { var o = {}; pecas(estado).forEach(function (p) { if (p.materialProj) o[p.materialProj] = (o[p.materialProj] || 0) + 1; }); return o; }
  /* APAGAR SÓ O QUE NÃO É USADO: com peça usando, recusa e diz quantas */
  function podeApagar(estado, id) {
    var u = usos(estado, id);
    if (u.length) return { ok: false, n: u.length, erro: "Este material está em " + u.length + " peça(s) do modelo. Use \"Substituir em todo o modelo\" antes de apagar." };
    return { ok: true, n: 0 };
  }
  /* a op que põe UM material em várias peças (vazio = volta ao da categoria) */
  function opsAplicar(ids, idMat) { return arr(ids).map(function (id) { return { op: "marcar", id: id, materialProj: txt(idMat) }; }); }
  /* SUBSTITUIR EM TODO O MODELO: toda peça com `de` passa a `para` (um lote, um Ctrl+Z) */
  function opsSubstituir(estado, de, para, lista) {
    if (!txt(de)) return { ok: false, erro: "Escolha o material a substituir." };
    if (txt(de) === txt(para)) return { ok: false, erro: "Escolha um material diferente para pôr no lugar." };
    if (para && lista && !porId(lista, para)) return { ok: false, erro: "O material novo não está no projeto." };
    var u = usos(estado, de);
    if (!u.length) return { ok: false, erro: "Nenhuma peça do modelo usa este material." };
    return { ok: true, n: u.length, ops: opsAplicar(u, para || "") };
  }

  /* ------------------------------------------------------------ saídas para os outros módulos */
  function hexInt(h) { return parseInt(hex(h, "#808080").slice(1), 16); }
  /* RENDER: os parâmetros do motor (o mesmo formato do RenderMat.parametros)
     — a base RA dá a textura (rejunte, CC0); a Aparência do projeto manda nos números */
  function parametrosRender(mat, RM, ctx) {
    if (!mat) return null;
    var m = normalizar(mat), p = null, B = RM && RM.biblioteca ? RM.biblioteca() : null;
    var base = m.apBase && RM && RM.material && RM.material(m.apBase) ? m.apBase : (B ? B.padrao : "");
    try { p = base && RM.parametros ? RM.parametros(base, { cor: null, nome: (ctx && ctx.nome) || m.nome }) : null; } catch (e) { p = null; }
    function lin(c) { return RM && RM.linear ? RM.linear(c) : Math.pow(c, 2.2); }
    var s = [parseInt(m.apCor.slice(1, 3), 16) / 255, parseInt(m.apCor.slice(3, 5), 16) / 255, parseInt(m.apCor.slice(5, 7), 16) / 255];
    if (!p) p = { id: base || "projeto", espessura: 0, sheen: 0, sheenCor: [1, 1, 1], sheenRugosidade: 0.5, atenuacao: null, textura: null, fontes: null };
    p.cor = [lin(s[0]), lin(s[1]), lin(s[2])]; p.corSrgb = s; p.origemCor = "projeto";
    p.rugosidade = m.apRugosidade; p.metalicidade = m.apMetalicidade; p.transmissao = m.apTransmissao; p.ior = m.apIor;
    p.clearcoat = m.apClearcoat; p.clearcoatRugosidade = m.apClearcoatRug; p.relevo = m.apRelevo;
    if (p.transmissao > 0 && !(p.espessura > 0)) p.espessura = 0.006;
    if (p.transmissao > 0 && p.metalicidade > 0) p.metalicidade = 0;   /* metal não transmite luz (a mesma regra da biblioteca) */
    var tx = p.textura;
    if (tx && tx.tipo === "rejunte" && arr(tx.peca).length === 2) tx.peca = [r3(tx.peca[0] * m.apEscala), r3(tx.peca[1] * m.apEscala)];
    else if (tx && tx.tipo === "cc0") tx.escalaProjeto = m.apEscala;
    p.projeto = m.id; p.nome = m.nome; p.pintada = false;
    return p;
  }
  /* PRÉVIA (three r150 do visualizador): MeshPhysicalMaterial */
  function paraThree(mat) {
    var m = normalizar(mat);
    return { color: m.apCor, roughness: m.apRugosidade, metalness: m.apMetalicidade, transmission: m.apTransmissao, ior: m.apIor,
             clearcoat: m.apClearcoat, clearcoatRoughness: m.apClearcoatRug, thickness: m.apTransmissao > 0 ? 0.2 : 0 };
  }
  /* IFC: nome, cor (inteiro 0xRRGGBB) e transparência (0..1) do IfcSurfaceStyleShading */
  function ifcEstilo(mat) { var m = normalizar(mat); return { nome: m.nome, cor: hexInt(m.cor), transparencia: Math.round(m.transparencia) / 100 }; }
  function ifcOpts(lista) { var o = { porId: {}, porNome: {} }; arr(lista).forEach(function (m) { if (!m || !m.id || !txt(m.nome)) return; var e = ifcEstilo(m); o.porId[m.id] = e; o.porNome[e.nome] = e; }); return o; }
  /* 2D: o padrão de corte (null = o da categoria) */
  function estiloCorte(mat) { if (!mat || !mat.padraoCorte) return null; return { id: mat.id, preench: mat.padraoCorte, cor: hex(mat.corCorte, "#000000") }; }
  function estiloSuperficie(mat) { if (!mat || !mat.padraoSup) return null; return { id: mat.id, preench: mat.padraoSup, cor: hex(mat.corSup, "#000000") }; }
  /* 3D: cor e opacidade do sombreamento */
  function sombreamento(mat) { var m = normalizar(mat); return { cor: m.cor, opacidade: Math.round((1 - m.transparencia / 100) * 1000) / 1000 }; }
  /* PESO: kN/m³ pela massa (kg/m³ × g / 1000), com a fonte */
  function densidade(mat) {
    var m = mat && normalizar(mat); if (!m || !(m.massa > 0)) return null;
    var P = dep("BimPeso", "./bimpeso.js"), g = P && P.G ? P.G : 9.80665;
    return { kNm3: m.massa * g / 1000, ref: "material do projeto \"" + m.nome + "\": " + m.massa + " kg/m³" + (m.massaRef ? " (" + m.massaRef + ")" : "") };
  }
  /* PROPRIEDADES: as opções do campo Material */
  var POR_CATEGORIA = "<Por categoria>";
  function opcoesProps(lista) {
    return [{ id: "", rotulo: POR_CATEGORIA }].concat(arr(lista).filter(function (m) { return m && m.id; }).slice().sort(function (a, b) { return chaveNome(a.nome) < chaveNome(b.nome) ? -1 : 1; }).map(function (m) { return { id: m.id, rotulo: m.nome }; }));
  }

  /* ------------------------------------------------------------ biblioteca do projeto (.json) */
  var FORMATO = "orcapro-materiais-projeto";
  function exportar(lista, opts) {
    var mats = arr(lista).map(function (m) { var o = normalizar(m); delete o.id; delete o.obraId; return o; });
    return JSON.stringify({ formato: FORMATO, versao: 1, gerado: (opts && opts.agora) || new Date().toISOString(), obra: txt(opts && opts.obra), materiais: mats }, null, 1);
  }
  /* importar: mesmo nome = ATUALIZA o material do projeto (o id fica, as peças continuam
     com ele); nome novo = material novo. Devolve { ok, criar:[], atualizar:[], erros:[] } */
  function importar(texto, lista, opts) {
    opts = opts || {};
    var j = null;
    try { j = typeof texto === "string" ? JSON.parse(texto) : texto; } catch (e) { return { ok: false, erro: "O arquivo não é um JSON válido." }; }
    if (!j || j.formato !== FORMATO || !arr(j.materiais).length) return { ok: false, erro: "O arquivo não é uma biblioteca de materiais do OrçaPRO (.json exportado daqui)." };
    var criar = [], atualizar = [], erros = [], vistos = {}, base = arr(lista).slice();
    j.materiais.forEach(function (x, i) {
      if (!x || !txt(x.nome).trim()) { erros.push("material " + (i + 1) + ": sem nome"); return; }
      var k = chaveNome(x.nome); if (vistos[k]) { erros.push("\"" + x.nome + "\" repetido no arquivo"); return; } vistos[k] = 1;
      if (x.codigo && !validarCodigo(x.codigo, opts.idxSinapi).ok) { x = JSON.parse(JSON.stringify(x)); x.codigo = ""; erros.push("\"" + x.nome + "\": código fora do mapa SINAPI — ficou pendente"); }
      var ex = porNome(base, x.nome);
      if (ex) { var o = normalizar(x); o.id = ex.id; o.obraId = ex.obraId; o.criado = ex.criado; o.origem = ex.origem || o.origem; atualizar.push(carimbo(o, opts)); }
      else { var n = novo(base, x, { obraId: opts.obraId, agora: opts.agora }); if (n.ok) { n.mat.origem = "importado"; criar.push(n.mat); base.push(n.mat); } else erros.push(n.erro); }
    });
    return { ok: true, criar: criar, atualizar: atualizar, erros: erros };
  }

  var BimMateriais = {
    CLASSES: CLASSES, PADROES: PADROES, CAMPOS: CAMPOS, FAIXA: FAIXA, AP_PADRAO: AP_PADRAO, POR_CATEGORIA: POR_CATEGORIA, FORMATO: FORMATO, MASSA_MAX: MASSA_MAX,
    chaveNome: chaveNome, normalizar: normalizar, plano: plano, porNome: porNome, porId: porId, nomeLivre: nomeLivre, novoId: novoId,
    novo: novo, duplicar: duplicar, renomear: renomear, alterar: alterar,
    classeDoRA: classeDoRA, massaPelaTabela: massaPelaTabela, doRA: doRA, usarBase: usarBase,
    indiceSinapi: indiceSinapi, validarCodigo: validarCodigo,
    pecas: pecas, materialDasPecas: materialDasPecas, usos: usos, contagem: contagem, podeApagar: podeApagar, opsAplicar: opsAplicar, opsSubstituir: opsSubstituir,
    parametrosRender: parametrosRender, paraThree: paraThree, ifcEstilo: ifcEstilo, ifcOpts: ifcOpts, estiloCorte: estiloCorte, estiloSuperficie: estiloSuperficie,
    sombreamento: sombreamento, densidade: densidade, opcoesProps: opcoesProps, hexInt: hexInt,
    exportar: exportar, importar: importar
  };
  global.BimMateriais = BimMateriais;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMateriais;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
