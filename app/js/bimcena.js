/* =====================================================================
 * bimcena.js — OrçaPRO CENA: o estado da cena (módulo PURO, ES5, sem DOM).
 *
 * "Cena" é o módulo de apresentação do OrçaPRO: abrir o projeto, vestir de render ao vivo
 * (js/bimrendervivo.js), escolher hora, estação e céu, trocar materiais, arrastar vegetação e
 * móveis, ligar as luminárias do projeto, salvar câmeras, comparar antes e depois e sair com a
 * imagem. ESTE arquivo é só a regra: o que é a cena, como se valida, o que o "desfazer" guarda,
 * como o aparelho escolhe a qualidade. A tela (js/bimcenaui.js) e o motor (js/bimrendervivo.js)
 * só orquestram.
 *
 * Padrão da casa: motor puro + fiação fina. Cada função daqui tem teste com controle negativo
 * (tools/test-bimcena.js).
 *
 * O ESTADO (JSON, versão 1) — é o que `BimCenaArm` grava no projeto (entidade bim_cenas):
 *   { v, nome,
 *     ambiente : { hora "HH:MM"|"" (vazio = segue o relógio do estilo), data "AAAA-MM-DD"|"" (vazio = hoje),
 *                  estacao "auto"|"verao"|"outono"|"inverno"|"primavera", nuvens 0..1, ceu "auto"|"calculado"|<id>,
 *                  exposicao -2..2 },
 *     vista    : { pos, alvo, fov } | null  (a última posição da câmera livre),
 *     cameras  : [ { id, nome, camera:{pos,alvo,fov,quat?} (coordenadas do PROJETO, m), hora?, miniatura? } ],
 *     camAtiva : id|"",
 *     materiais: { <idMaterialRender>: { cor "#rrggbb", rugosidade 0..1, metal 0..1, verniz 0..1, relevo 0..2, escala 0.25..4 } },
 *     luzes    : { <idLuminaria>: bool },            (o que a pessoa ligou/apagou à mão)
 *     objetos  : [ { id, item, pos, rotY, esc, ... } ] (BimCenaObjs.normalizar — vegetação, móveis, luminárias da cena)
 *     fogos    : [ { id, pos:[x,y,z], escala } ],
 *     efeitos  : { raios, vento, agua, fogo } (js/bimcenaefeitos.js normalizar),
 *     qualidade: { modo "auto"|"leve"|"alta"|"ultra" } }
 *
 * ⚠ COORDENADAS: câmera, objetos e fogos moram em coordenadas do PROJETO (as do BIM, metros).
 *   O motor trabalha com a origem subtraída (`vivo._origemCena`); a conversão é `paraMotor`/`doMotor`.
 *   Gravar em coordenadas do motor faria a cena sair do lugar quando a origem da obra mudasse.
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  var TETO = { cameras: 24, objetos: 300, fogos: 12, materiais: 200, nome: 60, desfazer: 60 };
  var TETO_JSON_KB = 400;   /* o registro inteiro (js/bimcenaarm.js recusa acima disso) */

  function num(v, d) { var n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return isFinite(n) ? n : d; }
  function clamp(v, a, b, d) { var n = num(v, d); return n < a ? a : (n > b ? b : n); }
  function txt(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

  /* ------------------------------------------------------------ hora e estação */
  function minutos(s) { var p = String(s || "").split(":"); if (p.length < 2) return null; var h = +p[0], m = +p[1]; return isFinite(h) && isFinite(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null; }
  function hm(min) { var t = Math.round(num(min, 0)); t = ((t % 1440) + 1440) % 1440; var h = Math.floor(t / 60), m = t % 60; return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2); }
  function horaValida(s) { var m = minutos(s); return m == null ? "" : hm(m); }
  function dataValida(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if (!m) return "";
    var a = +m[1], me = +m[2], d = +m[3], dt = new Date(Date.UTC(a, me - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d ? String(s) : "";
  }
  /* hemisfério SUL (o Brasil): o solstício de dezembro abre o verão. Datas astronômicas de 21/dez, 21/mar, 21/jun, 23/set. */
  var ESTACOES = {
    verao: { nome: "Verão", mmdd: "01-15" }, outono: { nome: "Outono", mmdd: "04-20" },
    inverno: { nome: "Inverno", mmdd: "07-15" }, primavera: { nome: "Primavera", mmdd: "10-15" }
  };
  function estacaoDaData(iso) {
    var d = dataValida(iso); if (!d) return "";
    var mm = +d.slice(5, 7), dd = +d.slice(8, 10), k = mm * 100 + dd;
    if (k >= 1221 || k <= 320) return "verao";
    if (k <= 620) return "outono";
    if (k <= 922) return "inverno";
    return "primavera";
  }
  function dataDaEstacao(est, anoRef) { var e = ESTACOES[est]; return e ? (anoRef || new Date().getFullYear()) + "-" + e.mmdd : ""; }
  function hojeISO(agora) { var d = agora || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  /* a data e a hora que valem para o sol: estação escolhida manda na data; "auto" = a data do estado ou hoje */
  function ambienteEfetivo(est, agora) {
    var a = (est && est.ambiente) || {}, ano = (agora || new Date()).getFullYear();
    var data = a.estacao && a.estacao !== "auto" && ESTACOES[a.estacao] ? dataDaEstacao(a.estacao, ano) : (dataValida(a.data) || hojeISO(agora));
    return { data: data, estacao: estacaoDaData(data), hora: horaValida(a.hora), nuvens: num(a.nuvens, 0.15) };
  }

  /* ------------------------------------------------------------ cor */
  function corHex(v, pad) {
    if (Array.isArray(v) && v.length >= 3) {
      return "#" + [0, 1, 2].map(function (i) { return ("0" + Math.round(clamp(v[i], 0, 1, 0) * 255).toString(16)).slice(-2); }).join("");
    }
    var m = /^#?([0-9a-f]{6})$/i.exec(String(v == null ? "" : v).trim());
    return m ? "#" + m[1].toLowerCase() : (pad === undefined ? "" : pad);
  }
  function hexCor(hex) { var h = corHex(hex, ""); return h ? [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; }) : null; }
  function paraLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  /* ------------------------------------------------------------ materiais editáveis */
  var CAMPOS_MAT = {
    rugosidade: [0, 1], metal: [0, 1], verniz: [0, 1], relevo: [0, 2], escala: [0.25, 4]
  };
  function normalizarMaterial(p) {
    var q = obj(p), o = {}, cor = corHex(q.cor, "");
    if (cor) o.cor = cor;
    Object.keys(CAMPOS_MAT).forEach(function (k) {
      if (q[k] === undefined || q[k] === null || q[k] === "") return;
      var n = num(q[k], NaN); if (isNaN(n)) return;
      o[k] = clamp(n, CAMPOS_MAT[k][0], CAMPOS_MAT[k][1], CAMPOS_MAT[k][0]);
    });
    return o;
  }
  function idMaterialValido(id) { return /^[a-z0-9][a-z0-9_\-]{0,63}$/i.test(String(id || "")); }

  /* ------------------------------------------------------------ câmera */
  function v3(v, d) { return Array.isArray(v) && v.length >= 3 && [0, 1, 2].every(function (i) { return isFinite(+v[i]); }) ? [+v[0], +v[1], +v[2]] : d; }
  function normalizarCamera(c) {
    var q = obj(c), pos = v3(q.pos, null); if (!pos) return null;
    var o = { pos: pos, alvo: v3(q.alvo, null), fov: clamp(q.fov, 10, 120, 50) };
    if (!o.alvo) { var k = Array.isArray(q.quat) && q.quat.length === 4 && q.quat.every(function (x) { return isFinite(+x); }) ? q.quat.map(Number) : null; if (!k) return null; o.quat = k; delete o.alvo; }
    if (q.near != null) o.near = clamp(q.near, 0.01, 2, 0.1);
    return o;
  }
  /* câmera do motor (origem subtraída) <-> câmera do projeto */
  function somar(a, b, s) { return [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]]; }
  function cameraParaProjeto(cam, origem) {
    var o = v3(origem, [0, 0, 0]), c = copia(cam); c.pos = somar(cam.pos, o, 1); if (cam.alvo) c.alvo = somar(cam.alvo, o, 1); return c;
  }
  function cameraParaMotor(cam, origem) {
    var o = v3(origem, [0, 0, 0]), c = copia(cam); c.pos = somar(cam.pos, o, -1); if (cam.alvo) c.alvo = somar(cam.alvo, o, -1); return c;
  }
  var _seq = 0;
  function novoId(pre) { _seq++; return pre + "-" + Date.now().toString(36) + _seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function normalizarCameraSalva(c) {
    var q = obj(c), cam = normalizarCamera(q.camera); if (!cam) return null;
    var o = { id: txt(q.id, 40) || novoId("cam"), nome: txt(q.nome, TETO.nome) || "Câmera", camera: cam };
    var h = horaValida(q.hora); if (h) o.hora = h;
    var mi = typeof q.miniatura === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(q.miniatura) && q.miniatura.length <= 24000 ? q.miniatura : "";
    if (mi) o.miniatura = mi;
    return o;
  }

  /* ------------------------------------------------------------ efeitos (espelho de js/bimcenaefeitos.js normalizar; ali é a fonte) */
  var EFEITOS_PADRAO = {
    raios: { on: false, forca: 0.5 }, vento: { on: true, forca: 0.5, dir: 53.13 },
    agua: { on: false, forca: 0.5 }, fogo: { on: true, forca: 0.8 }
  };
  function normalizarEfeitos(e, base) {
    var b = base || EFEITOS_PADRAO, q = obj(e);
    function sec(k) { return obj(q[k]); }
    function lig(v, d) { return v === undefined || v === null ? d : (v === "false" || v === "0" ? false : !!v); }
    var dir = clamp(sec("vento").dir, -1e6, 1e6, b.vento.dir); dir = ((dir % 360) + 360) % 360;
    return {
      raios: { on: lig(sec("raios").on, b.raios.on), forca: clamp(sec("raios").forca, 0, 1, b.raios.forca) },
      vento: { on: lig(sec("vento").on, b.vento.on), forca: clamp(sec("vento").forca, 0, 1, b.vento.forca), dir: dir },
      agua: { on: lig(sec("agua").on, b.agua.on), forca: clamp(sec("agua").forca, 0, 1, b.agua.forca) },
      fogo: { on: lig(sec("fogo").on, b.fogo.on), forca: clamp(sec("fogo").forca, 0, 1, b.fogo.forca) }
    };
  }

  /* ------------------------------------------------------------ o estado */
  function padrao() {
    return {
      v: VERSAO, nome: "",
      ambiente: { hora: "", data: "", estacao: "auto", nuvens: 0.15, ceu: "auto", exposicao: 0 },
      vista: null, cameras: [], camAtiva: "", materiais: {}, luzes: {}, objetos: [], fogos: [],
      efeitos: normalizarEfeitos({}, EFEITOS_PADRAO), qualidade: { modo: "auto" }
    };
  }
  /* aceita qualquer coisa (lixo, versão antiga, JSON de outra pessoa) e devolve um estado VÁLIDO. Nunca lança. */
  function normalizar(raw, opc) {
    var q = obj(raw), base = padrao(), o = {};
    var objFn = opc && opc.normalizarObjeto;   /* BimCenaObjs.normalizar, quando carregado */
    o.v = VERSAO;
    o.nome = txt(q.nome, TETO.nome);
    var a = obj(q.ambiente);
    o.ambiente = {
      hora: horaValida(a.hora), data: dataValida(a.data),
      estacao: a.estacao === "auto" || ESTACOES[a.estacao] ? a.estacao : "auto",
      nuvens: clamp(a.nuvens, 0, 1, base.ambiente.nuvens),
      ceu: /^[a-z0-9][a-z0-9_\-]{0,63}$/i.test(String(a.ceu || "")) ? String(a.ceu) : "auto",
      exposicao: clamp(a.exposicao, -2, 2, 0)
    };
    o.vista = normalizarCamera(q.vista);   /* onde a pessoa parou: a cena reabre no mesmo lugar */
    var vistos = {};
    o.cameras = arr(q.cameras).map(normalizarCameraSalva).filter(function (c) { if (!c || vistos[c.id]) return false; vistos[c.id] = 1; return true; }).slice(0, TETO.cameras);
    o.camAtiva = vistos[q.camAtiva] ? String(q.camAtiva) : "";
    o.materiais = {};
    Object.keys(obj(q.materiais)).slice(0, TETO.materiais).forEach(function (id) {
      if (!idMaterialValido(id)) return;
      var m = normalizarMaterial(q.materiais[id]); if (Object.keys(m).length) o.materiais[id] = m;
    });
    o.luzes = {};
    Object.keys(obj(q.luzes)).slice(0, 400).forEach(function (id) { if (typeof q.luzes[id] === "boolean") o.luzes[txt(id, 80)] = q.luzes[id]; });
    var ids = {};
    o.objetos = arr(q.objetos).map(function (x) {
      var r = objFn ? objFn(x) : (x && typeof x === "object" && x.id && x.item && v3(x.pos, null) ? copia(x) : null);
      if (!r || !r.id || ids[r.id]) return null; ids[r.id] = 1; return r;
    }).filter(Boolean).slice(0, TETO.objetos);
    var fid = {};
    o.fogos = arr(q.fogos).map(function (f) {
      var p = v3(obj(f).pos, null); if (!p) return null;
      var id = txt(f.id, 40) || novoId("fogo"); if (fid[id]) return null; fid[id] = 1;
      return { id: id, pos: p, escala: clamp(f.escala, 0.2, 4, 1) };
    }).filter(Boolean).slice(0, TETO.fogos);
    o.efeitos = normalizarEfeitos(q.efeitos, EFEITOS_PADRAO);
    var ql = obj(q.qualidade).modo;
    o.qualidade = { modo: ql === "leve" || ql === "alta" || ql === "ultra" ? ql : "auto" };
    return o;
  }
  function tamanhoKB(estado) { try { return Math.ceil(JSON.stringify(estado).length / 1024); } catch (e) { return 0; } }
  function cabe(estado) { var kb = tamanhoKB(estado); return { ok: kb <= TETO_JSON_KB, kb: kb, teto: TETO_JSON_KB }; }

  /* ------------------------------------------------------------ mudanças (sempre devolvem um estado NOVO: o desfazer guarda o anterior) */
  function com(estado, mudanca, opc) { var e = Object.assign({}, estado); mudanca(e); return normalizar(e, opc); }
  function definirAmbiente(est, campos, opc) {
    return com(est, function (e) { e.ambiente = Object.assign({}, e.ambiente, obj(campos)); if (campos && campos.estacao && campos.estacao !== "auto" && campos.data === undefined) e.ambiente.data = ""; if (campos && campos.data && campos.estacao === undefined) e.ambiente.estacao = "auto"; }, opc);
  }
  function definirEfeitos(est, campos, opc) {
    return com(est, function (e) {
      var b = normalizarEfeitos(e.efeitos, EFEITOS_PADRAO);
      e.efeitos = normalizarEfeitos(campos, b);
    }, opc);
  }
  function definirMaterial(est, id, props, opc) {
    if (!idMaterialValido(id)) return est;
    return com(est, function (e) {
      var m = Object.assign({}, e.materiais); var novo = Object.assign({}, m[id] || {}, normalizarMaterial(props));
      if (Object.keys(novo).length) m[id] = novo; else delete m[id];
      e.materiais = m;
    }, opc);
  }
  function restaurarMaterial(est, id, opc) {
    if (!est.materiais || !est.materiais[id]) return est;
    return com(est, function (e) { var m = Object.assign({}, e.materiais); delete m[id]; e.materiais = m; }, opc);
  }
  function definirLuz(est, id, ligada, opc) { return com(est, function (e) { var l = Object.assign({}, e.luzes); l[id] = !!ligada; e.luzes = l; }, opc); }
  function adicionarCamera(est, dados, opc) {
    if (est.cameras.length >= TETO.cameras) return { estado: est, erro: "Limite de " + TETO.cameras + " câmeras por cena: apague alguma para salvar outra." };
    var c = normalizarCameraSalva(Object.assign({}, dados, { id: dados && dados.id })); if (!c) return { estado: est, erro: "A câmera não tem posição válida." };
    if (!dados || !dados.nome) c.nome = "Câmera " + (est.cameras.length + 1);
    var e = com(est, function (x) { x.cameras = x.cameras.concat([c]); x.camAtiva = c.id; }, opc);
    return { estado: e, id: c.id };
  }
  function renomearCamera(est, id, nome, opc) { return com(est, function (e) { e.cameras = e.cameras.map(function (c) { return c.id === id ? Object.assign({}, c, { nome: txt(nome, TETO.nome) || c.nome }) : c; }); }, opc); }
  function removerCamera(est, id, opc) { return com(est, function (e) { e.cameras = e.cameras.filter(function (c) { return c.id !== id; }); if (e.camAtiva === id) e.camAtiva = ""; }, opc); }
  function atualizarCamera(est, id, camera, extra, opc) {
    return com(est, function (e) { e.cameras = e.cameras.map(function (c) { return c.id === id ? Object.assign({}, c, extra || {}, { camera: camera }) : c; }); }, opc);
  }
  function moverCamera(est, id, delta, opc) {
    var i = -1; est.cameras.forEach(function (c, k) { if (c.id === id) i = k; });
    var j = i + delta; if (i < 0 || j < 0 || j >= est.cameras.length) return est;
    return com(est, function (e) { var l = e.cameras.slice(); var t = l[i]; l[i] = l[j]; l[j] = t; e.cameras = l; }, opc);
  }
  /* a próxima câmera na ordem (percurso de apresentação); circular */
  function vizinhaCamera(est, delta) {
    var n = est.cameras.length; if (!n) return null;
    var i = -1; est.cameras.forEach(function (c, k) { if (c.id === est.camAtiva) i = k; });
    var j = i < 0 ? (delta > 0 ? 0 : n - 1) : (((i + delta) % n) + n) % n;
    return est.cameras[j];
  }

  /* ------------------------------------------------------------ desfazer / refazer */
  /* Cada mudança vira UM passo; arrastar um controle deslizante gera dezenas de mudanças com a mesma `chave` em
     menos de `janelaMs` entre si — todas entram no MESMO passo (senão Ctrl+Z desfaria um pixel do controle). */
  function Historico(inicial, opc) {
    opc = opc || {};
    this.limite = opc.limite || TETO.desfazer; this.janelaMs = opc.janelaMs == null ? 700 : opc.janelaMs;
    this.agora = opc.agora || function () { return Date.now(); };
    this.pilha = [copia(inicial)]; this.i = 0; this._chave = null; this._t = 0;
  }
  Historico.prototype.atual = function () { return copia(this.pilha[this.i]); };
  Historico.prototype.registrar = function (estado, chave) {
    var t = this.agora();
    if (JSON.stringify(estado) === JSON.stringify(this.pilha[this.i])) return false;   /* idempotente: nada mudou */
    this.pilha = this.pilha.slice(0, this.i + 1);
    if (chave && chave === this._chave && t - this._t <= this.janelaMs && this.i > 0) { this.pilha[this.i] = copia(estado); }
    else { this.pilha.push(copia(estado)); this.i++; }
    this._chave = chave || null; this._t = t;
    while (this.pilha.length > this.limite) { this.pilha.shift(); this.i--; }
    return true;
  };
  Historico.prototype.podeDesfazer = function () { return this.i > 0; };
  Historico.prototype.podeRefazer = function () { return this.i < this.pilha.length - 1; };
  Historico.prototype.desfazer = function () { if (!this.podeDesfazer()) return null; this.i--; this._chave = null; return this.atual(); };
  Historico.prototype.refazer = function () { if (!this.podeRefazer()) return null; this.i++; this._chave = null; return this.atual(); };
  Historico.prototype.zerar = function (estado) { this.pilha = [copia(estado)]; this.i = 0; this._chave = null; };

  /* ------------------------------------------------------------ antes × depois */
  var ROTULOS = { hora: "Hora", data: "Data", estacao: "Estação", nuvens: "Nuvens", ceu: "Céu", exposicao: "Exposição" };
  function diferencas(a, b) {
    var d = [], A = a || padrao(), B = b || padrao();
    Object.keys(ROTULOS).forEach(function (k) {
      var x = A.ambiente[k], y = B.ambiente[k];
      if (String(x) !== String(y)) d.push(ROTULOS[k] + ": " + (x === "" ? "automático" : x) + " → " + (y === "" ? "automático" : y));
    });
    var ids = {}; Object.keys(A.materiais).concat(Object.keys(B.materiais)).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (k) { if (JSON.stringify(A.materiais[k] || null) !== JSON.stringify(B.materiais[k] || null)) d.push("Material " + k + " alterado"); });
    ["raios", "vento", "agua", "fogo"].forEach(function (k) { if (JSON.stringify(A.efeitos[k]) !== JSON.stringify(B.efeitos[k])) d.push("Efeito " + k + " alterado"); });
    var nA = A.objetos.length, nB = B.objetos.length; if (nA !== nB) d.push("Objetos: " + nA + " → " + nB);
    var lu = {}; Object.keys(A.luzes).concat(Object.keys(B.luzes)).forEach(function (k) { lu[k] = 1; });
    var nl = Object.keys(lu).filter(function (k) { return A.luzes[k] !== B.luzes[k]; }).length; if (nl) d.push("Luminárias alteradas: " + nl);
    return d;
  }
  function posDivisor(x, largura) { var w = Math.max(1, num(largura, 1)); return clamp(num(x, w / 2) / w, 0.02, 0.98, 0.5); }

  /* ------------------------------------------------------------ qualidade pelo aparelho */
  var NIVEIS = ["leve", "alta", "ultra"];
  /* Escolhe o ponto de PARTIDA. Quem manda depois é o controlador de quadros (abaixo): aparelho que a regra superestimou
     é rebaixado em segundos; um que ela subestimou continua fluido, só que mais leve do que poderia. Na dúvida, o lado leve:
     "nunca travar a página" pesa mais que "ultra". */
  function classificarAparelho(i) {
    i = obj(i); var motivos = [], pts = 0;
    var desc = String([i.vendor, i.arquitetura, i.dispositivo, i.descricao, i.gpu].filter(Boolean).join(" ")).toLowerCase();
    if (i.fallback || /swiftshader|llvmpipe|software|microsoft basic|warp/.test(desc)) {
      return { nivel: "leve", escala: 0.5, pontos: 0, motivos: ["sem placa de vídeo de verdade (processamento por software): imagem reduzida e sem efeitos pesados"], software: true };
    }
    if (i.mobile) { motivos.push("aparelho móvel"); pts -= 2; }
    var dedicada = /rtx|gtx|geforce|quadro|radeon rx|radeon pro|arc a\d|rx \d{4}|nvidia|titan/.test(desc) && !/laptop gpu mx|mx\d{3}/.test(desc);
    var integrada = /intel|uhd|iris|radeon graphics|vega|apple|adreno|mali|powervr/.test(desc) && !dedicada;
    if (dedicada) { pts += 3; motivos.push("placa de vídeo dedicada"); }
    if (integrada) motivos.push("placa de vídeo integrada");   /* integrada não ganha ponto: o UHD 620 de notebook não segura o nível alto */
    if (/apple/.test(desc) && /m[1-9]/.test(desc)) { pts += 2; motivos.push("chip de classe M"); }
    var gb = num(i.memoriaGB, 0), nuc = num(i.nucleos, 0);
    if (gb >= 8) pts += 1; else if (gb && gb < 4) { pts -= 1; motivos.push("pouca memória (" + gb + " GB)"); }
    if (nuc >= 8) pts += 1; else if (nuc && nuc < 4) { pts -= 1; motivos.push("poucos núcleos (" + nuc + ")"); }
    var tex = num(i.maxTexturas, 16);
    if (tex >= 24) { pts += 1; motivos.push("limites de textura altos"); }
    var pixels = num(i.telaW, 1920) * num(i.telaH, 1080) * Math.pow(num(i.dpr, 1), 2);
    if (pixels > 3840 * 2160 * 0.9) { pts -= 2; motivos.push("tela de muitos pixels"); }
    var nivel = pts >= 4 ? "ultra" : (pts >= 2 ? "alta" : "leve");
    if (!desc) { nivel = "leve"; motivos.push("a placa não se identificou: começa leve e sobe se sobrar fôlego"); }
    return { nivel: nivel, escala: nivel === "leve" ? 0.75 : 1, pontos: pts, motivos: motivos, software: false };
  }
  function nivelAbaixo(n) { var k = NIVEIS.indexOf(n); return k > 0 ? NIVEIS[k - 1] : n; }
  function nivelAcima(n) { var k = NIVEIS.indexOf(n); return k >= 0 && k < NIVEIS.length - 1 ? NIVEIS[k + 1] : n; }

  /* O CONTROLADOR DE FLUIDEZ: recebe a taxa de quadros medida e devolve o que fazer. Sem relógio próprio (testável).
     Regras (cada uma existe por um defeito que impede):
       · não julga enquanto a cena está carregando/calculando a luz (a taxa cai por motivo temporário — rebaixar aí deixaria
         o aparelho bom para sempre em "leve");
       · só desce depois de `janela` amostras seguidas abaixo do alvo (um tranco de 1 s não rebaixa);
       · desce primeiro a RESOLUÇÃO (escala 1 → 0,5; instantâneo, sem recompilar) e só depois sugere trocar de nível (recompila);
       · só sobe depois de MUITO tempo folgado (histerese) e nunca acima do nível escolhido pela pessoa/aparelho;
       · piso: escala 0,5. Abaixo disso a imagem perde a utilidade — aí fica o aviso, não mais rebaixo. */
  function Controlador(opc) {
    opc = opc || {};
    this.alvo = opc.alvo || 24; this.folga = opc.folga || 50; this.janela = opc.janela || 3; this.janelaSobe = opc.janelaSobe || 12;
    this.escala = opc.escala || 1; this.nivel = opc.nivel || "alta"; this.nivelMax = opc.nivelMax || this.nivel; this.escalaMin = 0.5;
    this.lentas = 0; this.folgadas = 0; this.historico = [];
  }
  Controlador.prototype.amostra = function (qps, ctx) {
    ctx = ctx || {};
    if (ctx.ocupado || !(qps >= 0)) { this.lentas = 0; this.folgadas = 0; return { acao: "espera" }; }
    if (qps < this.alvo) {
      this.folgadas = 0; this.lentas++;
      if (this.lentas < this.janela) return { acao: "observa" };
      this.lentas = 0;
      if (this.escala > this.escalaMin + 1e-6) {
        this.escala = Math.max(this.escalaMin, Math.round((this.escala - 0.15) * 100) / 100);
        this.historico.push({ acao: "resolucao", escala: this.escala, qps: qps });
        return { acao: "resolucao", escala: this.escala, motivo: "a imagem ficou abaixo de " + this.alvo + " quadros por segundo: resolução reduzida" };
      }
      var n = nivelAbaixo(this.nivel);
      if (n !== this.nivel) {
        this.nivel = n; this.escala = 0.75; this.nivelMax = n;
        this.historico.push({ acao: "nivel", nivel: n, qps: qps });
        return { acao: "nivel", nivel: n, escala: this.escala, motivo: "mesmo na resolução mínima a taxa ficou baixa: qualidade " + n };
      }
      return { acao: "limite", motivo: "este aparelho está no mínimo de qualidade e ainda abaixo de " + this.alvo + " quadros por segundo" };
    }
    this.lentas = 0;
    if (qps >= this.folga && this.escala < 1 - 1e-6) {
      this.folgadas++;
      if (this.folgadas >= this.janelaSobe) {
        this.folgadas = 0; this.escala = Math.min(1, Math.round((this.escala + 0.15) * 100) / 100);
        this.historico.push({ acao: "sobe", escala: this.escala, qps: qps });
        return { acao: "resolucao", escala: this.escala, motivo: "sobrou fôlego: resolução aumentada" };
      }
    } else this.folgadas = 0;
    return { acao: "mantem" };
  };

  /* ------------------------------------------------------------ saída de imagem */
  /* a largura manda; a altura segue a proporção da janela (proporções fixas 16:9, 4:3, 1:1 com enquadramento: Entrega 2) */
  var RESOLUCOES = { tela: { nome: "Tamanho da tela", w: 0 }, hd: { nome: "HD (1280 px de largura)", w: 1280, h: 720 }, fhd: { nome: "Full HD (1920 px de largura)", w: 1920, h: 1080 }, uhd: { nome: "4K (3840 px de largura)", w: 3840, h: 2160 } };
  /* o tamanho de saída para a razão da tela: lado maior da resolução pedida, mantendo a proporção; nunca passa de `teto` (memória da placa) */
  function tamanhoSaida(res, razao, teto) {
    var r = RESOLUCOES[res] || RESOLUCOES.tela, a = clamp(razao, 0.25, 4, 16 / 9), t = clamp(teto, 512, 8192, 4096);
    if (!r.w) return null;
    var w = r.w, h = Math.round(w / a);
    if (Math.max(w, h) > t) { var k = t / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    return { w: w, h: h, cortado: w < r.w };
  }
  function nomeArquivo(est, camNome, agora) {
    var d = agora || new Date(), p = function (n) { return ("0" + n).slice(-2); };
    var base = txt((est && est.nome) || "cena", 40) || "cena";
    var cam = camNome ? "-" + txt(camNome, 30) : "";
    var s = (base + cam).normalize ? (base + cam).normalize("NFD").replace(/[̀-ͯ]/g, "") : (base + cam);
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cena";
    return "orcapro-cena-" + s + "-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".png";
  }

  var BimCena = {
    VERSAO: VERSAO, TETO: TETO, TETO_JSON_KB: TETO_JSON_KB, ESTACOES: ESTACOES, RESOLUCOES: RESOLUCOES, NIVEIS: NIVEIS, EFEITOS_PADRAO: EFEITOS_PADRAO,
    padrao: padrao, normalizar: normalizar, tamanhoKB: tamanhoKB, cabe: cabe, copia: copia,
    minutos: minutos, hm: hm, horaValida: horaValida, dataValida: dataValida, estacaoDaData: estacaoDaData, dataDaEstacao: dataDaEstacao, hojeISO: hojeISO, ambienteEfetivo: ambienteEfetivo,
    corHex: corHex, hexCor: hexCor, paraLinear: paraLinear, normalizarMaterial: normalizarMaterial, idMaterialValido: idMaterialValido, CAMPOS_MAT: CAMPOS_MAT,
    normalizarCamera: normalizarCamera, cameraParaProjeto: cameraParaProjeto, cameraParaMotor: cameraParaMotor,
    definirAmbiente: definirAmbiente, definirEfeitos: definirEfeitos, definirMaterial: definirMaterial, restaurarMaterial: restaurarMaterial, definirLuz: definirLuz,
    adicionarCamera: adicionarCamera, renomearCamera: renomearCamera, removerCamera: removerCamera, atualizarCamera: atualizarCamera, moverCamera: moverCamera, vizinhaCamera: vizinhaCamera,
    Historico: Historico, diferencas: diferencas, posDivisor: posDivisor,
    classificarAparelho: classificarAparelho, nivelAbaixo: nivelAbaixo, nivelAcima: nivelAcima, Controlador: Controlador,
    tamanhoSaida: tamanhoSaida, nomeArquivo: nomeArquivo, novoId: novoId
  };
  global.BimCena = BimCena;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCena;
})(typeof window !== "undefined" ? window : this);
