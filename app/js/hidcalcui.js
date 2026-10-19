/* =====================================================================
 * hidcalcui.js — a TELA do dimensionamento hidrossanitário (fase 1, F6)
 *
 * Painel "Dimensionar hidrossanitário" dentro da aba Instalações do BIM
 * (js/biminstui.js chama HidCalcUI.montar(corpo) ao desenhar o painel; SÓ com a
 * prévia ?previa=hidro — BimPrevia.hidro(), decisão do gerente de 17/10/2026 até o
 * Rogério decidir produto e preço; este arquivo faz parte do grupo "hidro" do
 * index.html, que só baixa ao abrir o painel com a prévia ligada, ver js/carregar.js). O cálculo é dos motores puros (HidDimensionar
 * e filhos, contrato em docs/hidro/CONTRATO.md): aqui só se monta a ENTRADA a
 * partir do modelo do BIM, se mostra o RESULTADO e se chamam o memorial, as
 * planilhas e as pranchas PELO NOME (HidMemorial.gerar, HidPlanilhas.escrever,
 * HidPranchas.gerar/exportar). Módulo ausente → o botão diz "módulo não
 * carregado" na própria tela (nunca falha calada).
 *
 *   a) Programa: uso, porte e alimentação já preenchidos (zero configuração)
 *      e o quadro "aparelhos mínimos × existentes no modelo" com a fonte;
 *   b) Dimensionar → resultado em tabelas, ponto mais desfavorável, avisos e
 *      pendências (Corrigir / Mostrar no 3D) e as cores no 3D por verificação;
 *   c) Aplicar diâmetros → ops instAlterar num LOTE (um Ctrl+Z desfaz tudo);
 *   d) Memorial (HTML imprimível), Planilhas (.xlsx), Pranchas (PDF);
 *   e) Biblioteca: as famílias hid-* (HidFamilias) com filtro por fabricante
 *      e por tipo, para colocar no modelo.
 *
 * ⚠ Pendência nunca aparece como "atendido": "não verificado: falta X".
 * ⚠ Nenhum valor de norma aqui (test-hid-sem-numero-magico varre este arquivo):
 *   só valores INICIAIS de porte da obra, editáveis, marcados hid:ok.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;

  function B() { return global.BIM; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = parseFloat(String(v).replace(",", ".")); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function fmt(n, c) {
    if (n == null || !isFinite(n)) return "—";
    var U = global.Util; if (U && U.fmtNum) return U.fmtNum(n, c == null ? 2 : c);
    var f = Math.pow(10, c == null ? 2 : c); return String(Math.round(n * f) / f).replace(".", ",");   // hid:ok potência de 10 para arredondar casas
  }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }
  function rotulo(s) { s = String(s == null ? "" : s).replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); }
  function dep(nome) { return global[nome] || null; }

  /* valores INICIAIS do porte da obra (não são norma: o RT confirma). Linha única, marcada. */
  var INICIAL = { pavimentos: 1, area_m2: 100, dormitorios: 3, unidades: 1, funcionarios: 10, trabalhadores: 10, trabalhadores_turno: 10, alunos: 50, leitos: 10, hospedados: 10, hospedes: 10, refeicoes: 50, lugares: 50, vagas: 10 };   // hid:ok porte inicial editável
  var PADRAO_GERAL = INICIAL.unidades;
  var ROTULOS = { area_m2: "Área construída (m²)", dormitorios: "Dormitórios", unidades: "Unidades", funcionarios: "Funcionários", trabalhadores: "Trabalhadores", trabalhadores_turno: "Trabalhadores por turno",
    alunos: "Alunos", leitos: "Leitos", hospedados: "Hospedados", hospedes: "Hóspedes", refeicoes: "Refeições por dia", lugares: "Lugares", vagas: "Vagas" };
  var CASAS_Q = 3, LIMITE_LISTA = 40;   // hid:ok casas decimais da vazão e tamanho da lista na tela (apresentação)
  var CHAVE_LS = "orcapro:hid:entrada";
  var CORES = { ok: "#2e9e5b", aviso: "#e0a100", falha: "#d33a2c" };   // verde / âmbar / vermelho: ok, não verificado, reprovado
  var FAMILIA_DO_GRUPO = { bacia: "hid-bacia-caixa-acoplada", lavatorio: "hid-lavatorio-coluna", chuveiro: "hid-chuveiro", pia: "hid-pia-cozinha", tanque: "hid-tanque-lavar", mictorio: "hid-mictorio" };
  var RESERVATORIOS = { "ra-caixa-dagua": 1, "hid-caixa-dagua": 1, "hid-reservatorio-tanque": 1 };

  /* ------------------------------------------------------------------ estado da tela */
  var E = {
    uso: null, valores: {}, populacao: "",
    alim: { tipo: null, nivelAgua: "", nivelAguaMax: "", pressao_kpa: "", ponto: "", conector: "" },
    rec: { ligado: false, nivelSuccao: "", nivelChegada: "", cotaBomba: "", trechosSuccao: "", trechosRecalque: "" },
    rota: { sel: null, dest: {}, piso: "", params: {}, terreo: false, atravessarViga: false, res: null, opsNaProposta: null, aplicada: null, previaI: null, previa: null, sug: false, idsAplicados: [], avisosInclinacao: null },
    /* água quente / pluvial / incêndio: padrões preenchidos ("zero configuração"); o RT confere e edita */
    aq: { ligado: false, tipo: "passagem", energia: "gas", aquecedor: "", coletor: "", tempoRecuperacao: "", volume: "" },
    ap: { ligado: false, cidade: "", situacao: "cobertura", intensidade: "", fonteIntensidade: "", areaCobertura: "" },
    inc: { ligado: false, ocupacao: "", area: "", altura: "", carga: "", construidaAte2005: false, nivelMax: "", extintorCap: "", ch: { risco: "", metodo: "calculo", k: "", peDireito: "", defletor: "", obstrucoes: "", areaSistema: "" }, d2: {}, confirmacoes: [], cfItem: "", cfJust: "", cfResp: "" },
    tr: { ligado: false, tipo: "fossa", padrao: "", tMedia: "", tMesFrio: "", limpezaAnos: "", ensaios: "", percMedia: "", camadas: "", lencol: "", vazao: "", ox: "", oy: "", oz: "" },
    ind: { ligado: false, fluido: "ar", estado: "saturado", temperatura: "", pressao: "", material: "aco_carbono", servico: "" },
    tpl: { id: "", antes: null, mudancas: [], decisoes: [], nome: "", avisos: [] }, clima: null, hidTemplate: null,
    destinosAP: {},   // área → calha escolhida pelo "Corrigir" do aviso de área sem destino
    resultado: null, opsNoCalculo: null, modeloNoCalculo: null, msg: null, memorialHtml: null, memorial: null,
    lib: { fab: "", fam: "", busca: "" }, _raiz: null, _indice: null
  };

  function salvarLS() { try { global.localStorage.setItem(CHAVE_LS, JSON.stringify({ uso: E.uso, valores: E.valores, populacao: E.populacao, alim: E.alim, rec: E.rec, aq: E.aq, ap: E.ap, inc: E.inc, tr: E.tr, ind: E.ind })); } catch (e) {} }
  function lerLS() {
    try {
      var o = JSON.parse(global.localStorage.getItem(CHAVE_LS) || "null"); if (!o) return;
      if (o.uso) E.uso = o.uso; if (o.valores) E.valores = o.valores; if (o.populacao != null) E.populacao = o.populacao;
      if (o.alim) Object.keys(o.alim).forEach(function (k) { E.alim[k] = o.alim[k]; });
      if (o.rec) Object.keys(o.rec).forEach(function (k) { E.rec[k] = o.rec[k]; });
      ["aq", "ap", "inc", "tr", "ind"].forEach(function (g) { if (o[g]) Object.keys(o[g]).forEach(function (k) { E[g][k] = o[g][k]; }); });
    } catch (e) {}
  }
  var lido = false;

  /* ------------------------------------------------------------------ o modelo do BIM */
  function modelo() {
    var b = B(); if (!b || !b.editarEstado) return null;
    var est = b.editarEstado(); if (!est || !est.estado) return null;
    return { estado: est.estado, ops: est.ops, avaliarFam: function (f, t, i) { return b.familiaAvaliar(f, t, i); } };
  }
  function pavimentos() {
    var out = [];
    try {
      var L = global.BimEdit && BimEdit.niveisAtuais ? BimEdit.niveisAtuais() : null;
      arr(L).forEach(function (n) { if (n && isFinite(n.elevacao) && !/terreno|funda|sondag|cobertura|telhado/i.test(n.nome || "")) out.push({ nome: n.nome || "Nível", cota: n.elevacao }); });
    } catch (e) {}
    return out;
  }
  function usos() {
    var NR = dep("HidNormas"), v = {}, out = [];
    if (!NR) return out;
    ["programa.consumo_per_capita", "programa.populacao", "programa.aparelhos_minimos"].forEach(function (k) {
      try { arr(NR.linhas(k)).forEach(function (l) { if (l.uso && l.uso !== "*" && !v[l.uso]) { v[l.uso] = 1; out.push(l.uso); } }); } catch (e) {}
    });
    return out;
  }
  function basesDoUso(uso) {
    var NR = dep("HidNormas"), v = {}, out = [];
    if (!NR || !uso) return out;
    ["programa.populacao", "programa.consumo_per_capita", "programa.aparelhos_minimos"].forEach(function (k) {
      try { arr(NR.linhas(k, { uso: uso })).forEach(function (l) { var b = l.base; if (b && b !== "pessoa" && b !== "populacao" && !v[b]) { v[b] = 1; out.push(b); } }); } catch (e) {}
    });
    return out;
  }
  function rotuloBase(b) { return ROTULOS[b] || rotulo(String(b).replace(/\./g, " – ")); }
  function valorBase(b) { if (E.valores[b] != null && E.valores[b] !== "") return E.valores[b]; return INICIAL[b] != null ? INICIAL[b] : PADRAO_GERAL; }

  function reservatorios(m) {
    var out = [];
    if (!m) return out;
    arr(m.estado.familias).forEach(function (f) { if (RESERVATORIOS[f.famId]) out.push({ id: f.id, famId: f.famId, conector: f.id + ":saida" }); });
    return out;
  }
  function pontasAF(m) {
    var out = [], BI = dep("BimInst");
    if (!m || !BI) return out;
    try {
      /* PROJETO INTELIGENTE: a ESPERA do barrilete (ponta que "continua", js/hidambiente.js) também é ponto de alimentação; a
         descida da válvula (descarga, js/hidkit.js) não entra */
      var est = m.estado, HKp = dep("HidKit"); if (HKp) { try { var bP = B(); est = HKp.paraCalculo(m.estado, bP && bP.editarOps ? bP.editarOps() : []); } catch (eP) { est = m.estado; } }
      var R = BI.rede(est, m.avaliarFam), sis = {};
      R.trechos.forEach(function (t) { sis[t.id] = t.sistema; });
      R.pontasLivres.forEach(function (p) { if (sis[p.trecho] === "agua_fria") out.push({ rot: "trecho " + p.trecho + " (" + fmt(p.x, 2) + "; " + fmt(p.y, 2) + "; " + fmt(p.z, 2) + ")", ponto: { x: p.x, y: p.y, z: p.z } }); });
      arr(R.continuacoes).forEach(function (p) { if (sis[p.trecho] === "agua_fria") out.push({ rot: "espera " + p.trecho + " (" + fmt(p.x, 2) + "; " + fmt(p.y, 2) + "; " + fmt(p.z, 2) + ")", ponto: { x: p.x, y: p.y, z: p.z } }); });
    } catch (e) {}
    return out;
  }
  function garantirPadroes(m) {
    if (!lido) { lido = true; lerLS(); }
    var us = usos();
    if (!E.uso || us.indexOf(E.uso) < 0) E.uso = us.indexOf("residencial_unifamiliar") >= 0 ? "residencial_unifamiliar" : (us[0] || null);
    if (E.valores.pavimentos == null || E.valores.pavimentos === "") { var pv = pavimentos().length; E.valores.pavimentos = pv > 0 ? pv : INICIAL.pavimentos; }
    if (!E.alim.tipo) E.alim.tipo = reservatorios(m).length ? "reservatorio" : "rede_publica";
    padroesSistemas();
  }

  /* ------------------------------------------------------------------ a ENTRADA do cálculo */
  function programaEntrada() {
    var p = { uso: E.uso, pavimentos: num(E.valores.pavimentos, INICIAL.pavimentos) };
    basesDoUso(E.uso).forEach(function (b) {
      var partes = b.split("."), alvo = p, k;
      for (k = 0; k < partes.length - 1; k++) { alvo[partes[k]] = alvo[partes[k]] && typeof alvo[partes[k]] === "object" ? alvo[partes[k]] : {}; alvo = alvo[partes[k]]; }
      alvo[partes[partes.length - 1]] = num(valorBase(b), null);
    });
    if (num(E.populacao, null) != null) p.populacao = num(E.populacao, null);
    return p;
  }
  function ids(txt) { return String(txt || "").split(/[\s,;]+/).filter(Boolean); }
  function entrada(m) {
    var al = { tipo: E.alim.tipo === "rede_publica" ? "rede_publica" : "reservatorio" };
    if (al.tipo === "rede_publica") {
      al.pressao_kpa = num(E.alim.pressao_kpa, null);
      var pt = pontasAF(m).filter(function (x) { return x.rot === E.alim.ponto; })[0] || pontasAF(m)[0];
      if (pt) al.ponto = pt.ponto;
    } else {
      if (num(E.alim.nivelAgua, null) != null) al.nivelAgua = num(E.alim.nivelAgua, null);
      if (num(E.alim.nivelAguaMax, null) != null) al.nivelAguaMax = num(E.alim.nivelAguaMax, null);
      var rs = reservatorios(m);
      if (rs.length > 1 && E.alim.conector) al.conector = E.alim.conector;
    }
    var en = { modelo: { estado: m.estado, avaliarFam: m.avaliarFam }, alimentacao: al, programa: programaEntrada(), pavimentos: pavimentos(), opcoes: {} };
    if (E.rec.ligado) {
      en.recalque = { nivelSuccao: num(E.rec.nivelSuccao, null), nivelChegada: num(E.rec.nivelChegada, null), cotaBomba: num(E.rec.cotaBomba, null),
                      trechosSuccao: ids(E.rec.trechosSuccao), trechosRecalque: ids(E.rec.trechosRecalque) };
    }
    var ct = entradaTR(), cd = entradaIND(m);
    if (ct) en.tratamento = ct;
    if (cd) en.industrial = cd;
    /* PROJETO INTELIGENTE (js/hidkit.js): a válvula de descarga e a torneira da pia/tanque são o PONTO do aparelho; a descida
       da válvula é descarga (fora da rede pressurizada); as decisões automáticas vão ao memorial */
    var HK = dep("HidKit"), HKU = dep("HidKitUI"), opsK = null;
    if (HK) { try { var bK = B(); opsK = bK && bK.editarOps ? bK.editarOps() : null; } catch (eK) { opsK = null; } }
    if (HK && opsK) {
      en.modelo.estado = HK.paraCalculo(m.estado, opsK);
      var fz = HK.aparelhosForcados(opsK); if (Object.keys(fz).length) en.aparelhos = fz;
      var tv = HK.travados(opsK); if (tv.length) en.opcoes.travados = arr(en.opcoes.travados).concat(tv);
      if (HKU && HKU.decisoes) en.decisoesAutomaticas = HKU.decisoes(m.estado, m.avaliarFam, opsK);
    }
    /* PROJETO COM MEMORIAL DE CÁLCULO (18/10/2026): peça "só desenho" vira aviso com Corrigir e pendência do memorial */
    var HBm = dep("HidBiblioteca"); if (HBm && HBm.memorialDoProjeto) en.memorial = !!HBm.memorialDoProjeto();
    var cq = entradaAQ(), cp = entradaAP(m), ci = entradaINC(m);
    if (cq) en.aguaQuente = cq;
    if (cp) en.pluvial = cp;
    if (ci) en.incendio = ci;
    return en;
  }

  /* quadro "aparelhos mínimos × existentes": o programa sozinho, sem rodar a rede */
  function quadro(m) {
    var PG = dep("HidPrograma"), NR = dep("HidNormas"), AF = dep("HidAF");
    if (!PG || !NR || !AF || !m || !E.uso) return null;
    var noModelo = {};
    arr(m.estado.familias).forEach(function (f) { var g = AF.grupoDaFamilia(f.famId); if (g) noModelo[g] = (noModelo[g] || 0) + 1; });
    try { return PG.calcular(programaEntrada(), NR.contexto(), noModelo); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ cores no 3D */
  function corDoStatus(s) { return s === "ok" ? CORES.ok : (s === "reprovado" ? CORES.falha : CORES.aviso); }
  var PESO = { ok: 0, pendente: 1, reprovado: 2 };   // hid:ok ordem de gravidade para escolher a pior cor
  /* O pior estado de cada TRECHO: o do próprio trecho, o das verificações cujo alvo é ele ou o aparelho/peça ligado a ele
     (o desconector "bac" pinta o ramal de descarga da bacia) e o dos avisos de erro (reprovado) e de aviso (não verificado). */
  function estadosPorTrecho(R, m) {
    var pior = {}, alvoParaTrechos = {}, BI = dep("BimInst");
    function sobe(id, st) { if (id == null) return; if (pior[id] == null || PESO[st] > PESO[pior[id]]) pior[id] = st; }
    if (m && BI) { try { BI.rede(m.estado, m.avaliarFam).ligacoes.forEach(function (l) { [l.famInst, l.alvo].forEach(function (k) { if (k != null) (alvoParaTrechos[k] = alvoParaTrechos[k] || []).push(l.trecho); }); }); } catch (e) {} }
    function paraTrechos(id, st) { sobe(id, st); arr(alvoParaTrechos[id]).forEach(function (t) { sobe(t, st); }); }
    ["agua_fria", "esgoto"].forEach(function (s) { arr(R && R.sistemas && R.sistemas[s] && R.sistemas[s].trechos).forEach(function (t) { sobe(t.id, t.status || "pendente"); }); });
    arr(R && R.verificacoes).forEach(function (v) { if (v.status !== "ok") paraTrechos(v.alvo, v.status); });
    arr(R && R.avisos).forEach(function (a) { if (a.gravidade === "info") return; arr(a.elementos).forEach(function (id) { paraTrechos(id, a.gravidade === "erro" ? "reprovado" : "pendente"); }); });
    return pior;
  }
  function aplicarCores(R) {
    var mapa = {}, U = global.BimInstUI;
    if (R) { var pior = estadosPorTrecho(R, modelo()); Object.keys(pior).forEach(function (id) { mapa[id] = corDoStatus(pior[id]); }); }
    if (U) { U._corVerif = R ? mapa : null; try { var b = B(); if (b && b.editarReconstruir) b.editarReconstruir(); } catch (e) {} }
    return mapa;
  }

  /* ------------------------------------------------------------------ ações */
  /* J1: ASSINATURA do modelo no instante do cálculo (hash do que o cálculo lê). Modelo diferente → saídas e Aplicar BLOQUEADOS. */
  function hashTxt(t) { var h = 5381, i; for (i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h) + ":" + t.length; }   // hid:ok hash djb2 (identificação, não norma)
  function assinatura(m) {
    if (!m || !m.estado) return "";
    var est = m.estado;
    var o = { i: est.instalacoes, f: arr(est.familias).map(function (f) { return [f.id, f.famId, f.tipoId, f.x, f.y, f.z, f.rotY, f.inst]; }),
              a: arr(est.ambientes).map(function (a) { return [a.id, a.calc && a.calc.area, a.calc && a.calc.base, a.calc && a.calc.contorno]; }), t: est.telhados, c: est.coberturas };
    try { return hashTxt(JSON.stringify(o)); } catch (e) { return String(m.ops); }
  }
  function modeloMudou() { var m = modelo(); return !!(E.resultado && m && E.opsNoCalculo != null && assinatura(m) !== E.opsNoCalculo); }
  function bloqueadoPorModelo() {
    if (!modeloMudou()) return false;
    E.msg = { k: "aviso", t: "O modelo mudou desde o cálculo — Dimensionar de novo. Memorial, planilhas, pranchas, manual e Aplicar ficam bloqueados até lá." };
    redesenhar();
    return true;
  }

  function dimensionar() {
    var m = modelo(), HD = dep("HidDimensionar");
    if (!HD) { E.msg = { k: "erro", t: "Dimensionamento: módulo não carregado (js/hiddimensionar.js)." }; redesenhar(); return null; }
    if (!m) { E.msg = { k: "erro", t: "Abra o BIM para dimensionar." }; redesenhar(); return null; }
    var R = null;
    try { var HBd = dep("HidBiblioteca"); if (HBd && HBd.marcarDimensionado) HBd.marcarDimensionado(); } catch (eM) {}   /* o projeto passa a "ter dimensionamento": o memorial liga por padrão */
    try { R = HD.calcular(entrada(m)); } catch (e) { E.msg = { k: "erro", t: "O cálculo falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    E.resultado = R; E.opsNoCalculo = assinatura(m); E.msg = null; E.memorialHtml = null;
    aplicarCores(R);
    salvarLS();
    redesenhar();
    return R;
  }
  function aplicarOps(ops, rotuloMsg) {
    var b = B();
    if (!b || !b.editarLote) { E.msg = { k: "erro", t: "O editor do BIM não está disponível para aplicar." }; redesenhar(); return false; }
    if (bloqueadoPorModelo()) return false;
    ops = arr(ops).filter(function (o) { return o && (o.op === "instAlterar" || o.op === "peca") && o.id != null; });   // diâmetros e as peças do incêndio (hidrantes, extintores, chuveiros)
    if (!ops.length) { E.msg = { k: "info", t: "Nada a aplicar: os diâmetros do modelo já são os calculados." }; redesenhar(); return false; }
    var ok = b.editarLote({ op: "lote", id: "hid-dn-" + String(new Date().getTime()), origem: "hidrossanitario", ops: JSON.parse(JSON.stringify(ops)) });   // um lote = uma entrada de desfazer
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou as alterações." }; redesenhar(); return false; }
    E.msg = { k: "ok", t: (rotuloMsg || "Diâmetros aplicados") + ": " + ops.length + " operação(ões). Ctrl+Z desfaz tudo de uma vez." };
    dimensionar();
    return true;
  }
  function aplicar() { return aplicarOps(E.resultado ? E.resultado.ops : [], "Diâmetros aplicados no modelo"); }

  function baixar(nome, dados, mime) {
    if (!doc) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }   // hid:ok 5 s até soltar a URL do arquivo
  }
  function dadosEmpresa() {
    var d = {}, logo = null, o = null;
    try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
    try { var g = global.Gestao; if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e2) {}
    return { d: d, logo: logo, obra: o || {} };
  }
  function exigeResultado() {
    if (!E.resultado) { E.msg = { k: "aviso", t: "Dimensione primeiro: sem resultado não há o que apresentar." }; redesenhar(); return false; }
    if (bloqueadoPorModelo()) return false;
    return true;
  }
  /* ---------------------------------------------------------------- LISTA DE MATERIAL (frente PEÇA COMPLETA, 17/10/2026)
     "Na lista de material sair o ícone da peça": cada linha do quantitativo do modelo com a ficha técnica (js/hidpecas.js),
     o ícone renderizado (img/hid-pecas, tools/gerar-hid-icones.js), o código do fabricante, a composição SINAPI da
     aplicação com preço e data-base e o total. Memorial, planilha e manual recebem a MESMA lista e os ícones em data URL. */
  function listaMaterialDoModelo(m) {
    var PC = dep("HidPecas"), BI = dep("BimInst"); if (!PC || !BI || !m) return null;
    try { return PC.listaMaterial(BI.qto(m.estado, m.avaliarFam), arr(m.estado.familias)); } catch (e) { return null; }
  }
  /* tamanhos dos ícones (px): documento (memorial/manual) e planilha/tela — os arquivos de img/hid-pecas */
  var ICONE_TELA = 256, ICONE_DOC = 512;   // hid:ok tamanho de imagem, não norma
  function dinheiro(v) { return typeof v === "number" && isFinite(v) ? "R$ " + fmt(v, 2) : "—"; }
  function htmlListaMaterial(m) {
    var PC = dep("HidPecas"), L = listaMaterialDoModelo(m);
    if (!PC || !L || !L.length) return "";
    var tot = L.reduce(function (a, x) { return a + (typeof x.total === "number" ? x.total : 0); }, 0), semPreco = L.filter(function (x) { return !x.preco || typeof x.preco.valor !== "number"; }).length;
    var h = '<details open data-hid="lista-material" style="margin:10px 0 6px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Lista de material — ' + L.length + " peça(s) · " + dinheiro(tot) + (semPreco ? " · " + semPreco + " sem preço" : "") + "</summary>";
    /* linhas em CARTÃO de catálogo (a gaveta tem ~430 px): ícone | descrição com fabricante e SINAPI | quantidade e total */
    h += '<table class="tbl hid-lista" data-hid="tab-lista"><thead><tr><th>Peça</th><th>Descrição · fabricante · SINAPI</th><th class="n">Qtd · total</th></tr></thead><tbody>';
    L.forEach(function (x) {
      var src = x.icone ? PC.icone({ icone: x.icone }, PC.TAMANHOS[0]) : null, pr = x.preco || {};
      var sin = pr.codigo ? '<span title="' + esc(pr.descricao || "") + '">SINAPI ' + esc(pr.codigo) + "</span>" + (pr.data ? " (" + esc(PC.dataTxt(pr.data)) + ")" : "") + " · " + dinheiro(pr.valor) + "/" + esc(x.unidade || "un")
        : (pr.estimativa ? '<span title="' + esc(pr.criterio || "") + '">sem composição · estimativa ' + dinheiro(pr.valor) + "</span>" : '<span class="hid-pend" title="' + esc(pr.criterio || pr.fonteNecessaria || "") + '">SINAPI pendente</span>');
      h += "<tr><td class=\"hid-ico\">" + (src ? '<img data-hid-ico="' + esc(x.icone) + '" src="' + esc(src) + '" alt="' + esc(x.descricao) + '">' : '<span class="muted">—</span>') + "</td>" +
        "<td><div class=\"hid-nome\">" + esc(x.descricao) + "</div>" + (x.produto ? '<div class="hid-sub">' + esc(x.produto) + "</div>" : "") +
        '<div class="hid-sub">' + (arr(x.fabricante).length ? esc(arr(x.fabricante).slice(0, 2).join(" · ")) + " — " : "") + sin + (x.norma ? " — " + esc(x.norma) : "") + "</div></td>" +
        '<td class="n"><b>' + (typeof x.quantidade === "number" ? fmt(x.quantidade, x.unidade === "m" ? 2 : 0) + " " + esc(x.unidade) : "—") + '</b><div class="hid-sub">' + dinheiro(x.total) + "</div></td></tr>";
    });
    h += "</tbody></table><p class=\"muted\" style=\"font-size:11.5px;margin:2px 0\">Ícone = a geometria da própria peça. Preço: composição SINAPI da aplicação (data-base entre parênteses); estimativa = sem composição própria, pelo mais alto. A mesma lista vai ao memorial, à planilha e ao manual.</p></details>";
    return h;
  }
  /* os ícones em data URL (memorial, planilha e manual saem com a imagem dentro); carrega uma vez e guarda */
  function comIcones(tam, fn) {
    var PC = dep("HidPecas"), L = listaMaterialDoModelo(modelo()) || [];
    if (!PC || !PC.carregarIcones) { fn(); return; }
    var nomes = L.map(function (x) { return x.icone; }).concat(PC.doResultado(E.resultado || {}).map(function (u) { return u.icone; }));
    PC.carregarIcones(nomes, tam).then(function () { fn(); }, function () { fn(); });
  }
  /* CRITÉRIO DE PROJETISTA no memorial: a nota e os apontamentos do modelo (js/hidcriterios.js) */
  function criteriosDoModelo() {
    var Hc = dep("HidCriterios"), m = modelo(); if (!Hc || !m) return null;
    try { var A = Hc.auditar(Hc.doEstado(m.estado, m.avaliarFam)); return A.trechos ? A : null; } catch (e) { return null; }
  }
  function memorial() {
    if (!exigeResultado()) return null;
    var M = dep("HidMemorial");
    if (!M || !M.gerar) { E.msg = { k: "erro", t: "Memorial: módulo não carregado (js/hidmemorial.js)." }; redesenhar(); return null; }
    var em = dadosEmpresa(), g;
    try { g = M.gerar(E.resultado, { obra: { nome: em.obra.nome || "", endereco: em.obra.local || "", cliente: em.obra.clienteNome || "" }, responsavel: { nome: em.d.responsavel || "", titulo: em.d.titulo || "", crea: em.d.crea || "" },
                                    empresa: { nome: em.d.nome || "", cnpj: em.d.cnpj || "", logoDataUrl: em.logo || "" }, documento: { revisao: "R00", data: new Date() },
                                    materiais: listaMaterialDoModelo(modelo()) || [], icones: dep("HidPecas") ? HidPecas.iconesEmCache(ICONE_DOC) : {}, criterios: criteriosDoModelo() }); }
    catch (e) { E.msg = { k: "erro", t: "O memorial falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    if (!g || !g.ok) { E.msg = { k: "erro", t: "Memorial: " + ((g && g.motivo) || "não foi possível gerar") }; redesenhar(); return null; }
    E.memorialHtml = g.html; E.memorial = { titulo: g.titulo, secoes: g.secoes.length, tabelas: g.tabelas, divergencias: arr(g.avisos).length };
    var aberto = null;
    try { var bl = new Blob([g.html], { type: "text/html;charset=utf-8" }); aberto = global.open ? global.open(URL.createObjectURL(bl), "_blank") : null; } catch (e2) { aberto = null; }
    if (!aberto) baixar("memorial-hidrossanitario.html", g.html, "text/html;charset=utf-8");
    E.msg = { k: arr(g.avisos).length ? "aviso" : "ok", t: "Memorial gerado (" + g.secoes.length + " seções, " + g.tabelas + " tabelas)" + (arr(g.avisos).length ? " com " + arr(g.avisos).length + " divergência(s) interna(s): conferir" : "") + (aberto ? ". Aberto em outra janela: imprima ou salve em PDF." : ". Baixado como HTML: abra e imprima.") };
    redesenhar();
    return g;
  }
  function planilhas() {
    if (!exigeResultado()) return false;
    var P = dep("HidPlanilhas"), X = typeof ExcelOrc !== "undefined" ? ExcelOrc : dep("ExcelOrc"), m = modelo(), BI = dep("BimInst");   /* o global do gerador de planilhas é ExcelOrc (js/excel.js) */
    if (!P || !P.escrever) { E.msg = { k: "erro", t: "Planilhas: módulo não carregado (js/hidplanilhas.js)." }; redesenhar(); return false; }
    if (!X || !X.ensureExcelJS) { E.msg = { k: "erro", t: "O gerador de planilha (ExcelJS) não está disponível." }; redesenhar(); return false; }
    var qto = null; try { qto = m && BI ? BI.qto(m.estado, m.avaliarFam) : null; } catch (e) { qto = null; }
    X.ensureExcelJS(function () {
      var PCx = dep("HidPecas");
      P.escrever(E.resultado, qto, { ExcelJS: global.ExcelJS, familias: m ? arr(m.estado.familias) : [], icones: PCx ? PCx.iconesEmCache(PCx.TAMANHOS[0]) : {} }).then(function (buf) {
        baixar("dimensionamento-hidrossanitario.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        E.msg = { k: "ok", t: "Planilhas geradas (dimensionamento-hidrossanitario.xlsx)." }; redesenhar();
      }, function (er) { E.msg = { k: "erro", t: "As planilhas falharam: " + (er && er.message ? er.message : er) }; redesenhar(); });
    });
    return true;
  }
  function pranchas() {
    if (!exigeResultado()) return false;
    /* GERAR PRANCHAS (18/10/2026): a tela de configuração memorizada por obra (js/hidpranchasui.js); sem ela, o jogo padrão */
    var HPU = dep("HidPranchasUI");
    if (HPU && HPU.abrir && global.UI && global.UI.modal) {
      var emU = dadosEmpresa(), mU = modelo();
      return HPU.abrir({ resultado: E.resultado, modelo: { estado: mU.estado, avaliarFam: mU.avaliarFam }, pavimentos: pavimentos(), empresa: emU.d || {}, obra: emU.obra || {}, logo: emU.logo || null,
                         obraKey: String((global.Gestao && global.Gestao._bimSel) || "geral"), obraId: String((global.Gestao && global.Gestao._bimSel) || "") });
    }
    var P = dep("HidPranchas"), m = modelo();
    if (!P || !P.gerar) { E.msg = { k: "erro", t: "Pranchas: módulo não carregado (js/hidpranchas.js)." }; redesenhar(); return false; }
    var em = dadosEmpresa(), r, pdf;
    try {
      r = P.gerar(E.resultado, { estado: m.estado, avaliarFam: m.avaliarFam }, { pavimentos: pavimentos(), empresa: em.d && em.d.nome ? em.d : "", responsavel: em.d.responsavel || "", registro: em.d.crea || "", tituloProfissional: em.d.titulo || "",
                                                                                    obra: em.obra.nome || "", proprietario: em.obra.clienteNome || "", contratante: em.obra.clienteNome || "", local: em.obra.local || "", logo: em.logo || null });
      pdf = r && r.ok ? P.exportar(r, "pdf") : null;
    } catch (e) { E.msg = { k: "erro", t: "As pranchas falharam: " + (e && e.message ? e.message : e) }; redesenhar(); return false; }
    if (!r || !r.ok) { E.msg = { k: "erro", t: "Pranchas: " + arr(r && r.avisos).join(" ") }; redesenhar(); return false; }
    if (!pdf) { E.msg = { k: "erro", t: "Pranchas geradas, mas o conversor para PDF (js/svgpdf.js) não está disponível." }; redesenhar(); return false; }
    baixar("projeto-hidrossanitario.pdf", pdf, "application/pdf");
    E.msg = { k: arr(r.avisos).length ? "aviso" : "ok", t: "Pranchas geradas: " + r.folhas.length + " folha(s) em PDF" + (arr(r.avisos).length ? " — " + arr(r.avisos).length + " aviso(s) da emissão: conferir" : "") + "." };
    redesenhar();
    return true;
  }

  /* ------------------------------------------------------------------ TRAÇADO INTELIGENTE (js/hidrota.js) */
  var ROTA_GEO = ["alturaEnchimento", "alturaRamalAF", "peDireito"];
  var ROTA_ROT = { alturaEnchimento: "Enchimento do piso (m)", alturaRamalAF: "Ramal de água na parede (m)", peDireito: "Pé-direito (m)" };
  var ROTA_SIS = { esgoto: "Esgoto (tubo de queda)", ventilacao: "Ventilação (coluna)", agua_fria: "Água fria (coluna)" };
  function verticais(m, sistema) {
    var out = [], BI = dep("BimInst");
    if (!m || !BI) return out;
    try {
      BI.rede(m.estado, m.avaliarFam).trechos.forEach(function (t) {
        if (t.sistema !== sistema || Math.abs(t.p1.x - t.p2.x) > BI.TOL || Math.abs(t.p1.z - t.p2.z) > BI.TOL || Math.abs(t.p1.y - t.p2.y) <= BI.TOL) return;
        out.push({ id: t.id, x: t.p1.x, z: t.p1.z, yBase: Math.min(t.p1.y, t.p2.y), yTopo: Math.max(t.p1.y, t.p2.y) });
      });
    } catch (e) {}
    return out;
  }
  function aparelhosRota(m) {
    var HR = dep("HidRota"), out = { aparelhos: [], pecas: [] };
    if (!HR || !m) return out;
    try { var en = HR.entradaDoModelo(m.estado, m.avaliarFam, {}); out.aparelhos = en.aparelhos; out.pecas = en.pecas; } catch (e) {}
    return out;
  }
  function selecionados(lista) { return lista.filter(function (a) { return !E.rota.sel || E.rota.sel[a.id] !== false; }); }
  function destinoDe(m, sis) {
    var c = verticais(m, sis), ach = c.filter(function (x) { return x.id === E.rota.dest[sis]; })[0] || c[0];
    if (!ach) return null;
    return { tipo: sis === "esgoto" ? "tubo_queda" : "coluna", id: ach.id, x: ach.x, z: ach.z, yBase: ach.yBase, yTopo: ach.yTopo, existente: true };
  }
  function pisoPadrao(m, ap) {
    var ys = [], ids = {};
    ap.forEach(function (a) { ids[a.id] = 1; });
    arr(m && m.estado.familias).forEach(function (f) { if (ids[f.id] && isFinite(f.y)) ys.push(f.y); });
    return ys.length ? Math.min.apply(null, ys) : 0;
  }
  function opsDoModelo() {
    var BI = dep("BimInst"), b = B(), ops = [];
    try { ops = b && b.editarOps ? b.editarOps() : []; if (global.BimEdit && BimEdit.achatar) ops = BimEdit.achatar(ops); } catch (e) {}
    return arr(ops).filter(function (o) { return o && BI && BI.ehOp && BI.ehOp(o.op); });
  }
  function entradaRota(m) {
    var HR = dep("HidRota"), a = aparelhosRota(m), sel = selecionados(a.aparelhos.concat(a.pecas)), ids = sel.map(function (x) { return x.id; }), grupoDe = {};
    ids.forEach(function (i) { grupoDe[i] = "1"; });
    var piso = num(E.rota.piso, null); if (piso == null) piso = pisoPadrao(m, a.aparelhos);
    var par = { terreo: !!E.rota.terreo, atravessarViga: !!E.rota.atravessarViga };
    Object.keys(E.rota.params).forEach(function (k) { var v = num(E.rota.params[k], null); if (v != null) par[k] = v; });   // os campos da tela + os que o "Corrigir" preenche
    var dest = {}; ["esgoto", "ventilacao", "agua_fria"].forEach(function (s) { var d = destinoDe(m, s); if (d) dest[s] = d; });
    var en = HR.entradaDoModelo(m.estado, m.avaliarFam, { so: ids, grupoDe: grupoDe, grupos: [{ id: "1", piso: piso }], destinos: dest, piso: piso, parametros: par, opsModelo: opsDoModelo() });
    en.pecas = en.pecas.filter(function (p) { return ids.indexOf(p.id) >= 0; });
    return en;
  }
  function propor() {
    var m = modelo(), HR = dep("HidRota");
    if (!HR) { E.msg = { k: "erro", t: "Traçado automático: módulo não carregado (js/hidrota.js)." }; redesenhar(); return null; }
    if (!m) { E.msg = { k: "erro", t: "Abra o BIM para traçar." }; redesenhar(); return null; }
    var res = null;
    try { res = HR.propor(entradaRota(m)); } catch (e) { E.msg = { k: "erro", t: "O traçado falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    previaRota(null);
    E.rota.res = res; E.rota.opsNaProposta = m.ops; E.rota.aplicada = null; E.rota.sug = false; E.msg = null;
    redesenhar();
    return res;
  }
  function previaRota(i) {
    var b = B(), op = i == null || !E.rota.res ? null : E.rota.res.opcoes[i], novo = op ? i : null;
    if (E.rota.previaI === novo) return;
    E.rota.previaI = novo;
    try { E.rota.previa = b && b.editarPreviaInst ? b.editarPreviaInst(op ? op.ops : null) : null; } catch (e) { E.rota.previa = null; }
  }
  function aplicarRota(i) {
    var b = B(), m = modelo(), op = E.rota.res && E.rota.res.opcoes[i];
    if (!op || !b || !b.editarLote || !m) return false;
    if (m.ops !== E.rota.opsNaProposta) { E.msg = { k: "aviso", t: "O modelo mudou depois da proposta: proponha de novo antes de aplicar." }; redesenhar(); return false; }
    previaRota(null);
    var ok = b.editarLote({ op: "lote", id: "hid-rota-" + String(new Date().getTime()), origem: "hidrota", ops: JSON.parse(JSON.stringify(op.ops)) });
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou o traçado." }; redesenhar(); return false; }
    var m2 = modelo(), inc = 0, BI = dep("BimInst");
    try { inc = BI.verificar(m2.estado, m2.avaliarFam).itens.filter(function (x) { return x.tipo === "inclinacao"; }).length; } catch (e) {}
    E.rota.aplicada = i; E.rota.opsNaProposta = m2.ops; E.rota.sug = true; E.rota.avisosInclinacao = inc;
    E.rota.idsAplicados = op.ops.map(function (o) { return o.id; }).filter(function (x) { return x != null; });
    E.resultado = null; E.opsNoCalculo = null; aplicarCores(null);
    E.msg = { k: inc ? "aviso" : "ok", t: "Traçado aplicado: " + op.nome + " (" + op.ops.length + " operações, uma entrada de desfazer). O modelador acusa " + inc + " aviso(s) de inclinação. Próximo passo: Dimensionar." };
    redesenhar();
    return true;
  }
  function usarSelecao(modo) {
    var b = B(), m = modelo(); if (!b || !b.selecao || !m) return false;
    var uids = arr(b.selecao().uids).map(function (u) { return String(u).replace(/^edit:/, ""); });
    if (modo === "aparelhos") {
      var tudo = aparelhosRota(m), todos = tudo.aparelhos.concat(tudo.pecas);
      var ok = todos.filter(function (a) { return uids.indexOf(a.id) >= 0; });
      if (!ok.length) { E.msg = { k: "aviso", t: "Nenhum aparelho do modelo está selecionado no 3D." }; redesenhar(); return false; }
      E.rota.sel = {}; todos.forEach(function (a) { E.rota.sel[a.id] = uids.indexOf(a.id) >= 0; });
      E.msg = { k: "info", t: ok.length + " aparelho(s) escolhido(s) pela seleção do 3D." };
    } else {
      var achou = false;
      ["esgoto", "ventilacao", "agua_fria"].forEach(function (s) { verticais(m, s).forEach(function (c) { if (uids.indexOf(c.id) >= 0) { E.rota.dest[s] = c.id; achou = true; } }); });
      E.msg = achou ? { k: "info", t: "Destino escolhido pela seleção do 3D." } : { k: "aviso", t: "Selecione no 3D um tubo vertical (tubo de queda ou coluna)." };
    }
    redesenhar();
    return true;
  }
  function htmlRota(m) {
    var HR = dep("HidRota"), h = '<div data-hid="rota" style="margin-top:12px;border-top:1px solid rgba(127,127,127,.25);padding-top:8px"><b>Traçado por opções (avançado)</b>';
    if (!HR) return h + '<p class="muted" style="font-size:12px">Traçado automático: módulo não carregado (js/hidrota.js).</p></div>';
    var a = aparelhosRota(m), lista = a.aparelhos.concat(a.pecas);
    h += '<p class="muted" style="font-size:11.5px;margin:2px 0 6px">Escolha os aparelhos do ambiente e para onde o esgoto, a ventilação e a água vão. O sistema propõe até três traçados (parede, piso, forro) e mostra por que cada um.</p>';
    if (!lista.length) return h + '<p class="muted" style="font-size:12px">Nenhum aparelho com ponto de ligação no modelo: coloque bacia, lavatório, chuveiro etc. (biblioteca abaixo).</p></div>';
    h += '<div data-hid="rota-aparelhos" style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;margin:4px 0">' + lista.map(function (x) {
      var on = !E.rota.sel || E.rota.sel[x.id] !== false;
      return '<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-hid-campo="rota:sel:' + esc(x.id) + '"' + (on ? " checked" : "") + "> " + esc(rotulo(x.aparelho || x.peca || x.id)) + ' <span class="muted">(' + esc(x.id) + ")</span></label>";
    }).join("") + '<button class="btn sm ghost" data-hid="rota-sel-3d" title="Usa os aparelhos que estão selecionados no 3D">Usar seleção do 3D</button></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">';
    ["esgoto", "ventilacao", "agua_fria"].forEach(function (s) {
      var c = verticais(m, s), sel = destinoDe(m, s);
      h += '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:150px;flex:1"><span>' + esc(ROTA_SIS[s]) + '</span><select class="inp" data-hid-campo="rota:dest:' + s + '">' +
        (c.length ? c.map(function (x) { return '<option value="' + esc(x.id) + '"' + (sel && sel.id === x.id ? " selected" : "") + ">" + esc(x.id + " (" + fmt(x.x, 2) + "; " + fmt(x.z, 2) + ")") + "</option>"; }).join("") : '<option value="">nenhum no modelo</option>') + "</select></label>";
    });
    h += '<button class="btn sm ghost" data-hid="rota-dest-3d" style="align-self:flex-end" title="Usa o tubo vertical selecionado no 3D">Usar seleção do 3D</button></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + campo("Piso acabado (cota, m)", "rota:piso", E.rota.piso !== "" ? E.rota.piso : fmt(pisoPadrao(m, a.aparelhos), 2));
    ROTA_GEO.forEach(function (k) { h += campo(ROTA_ROT[k], "rota:geo:" + k, E.rota.params[k] != null && E.rota.params[k] !== "" ? E.rota.params[k] : fmt(HR.GEO[k], 2)); });
    h += '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" data-hid-campo="rota:terreo"' + (E.rota.terreo ? " checked" : "") + "> Térreo (sobre o solo)</label>" +
      '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" data-hid-campo="rota:viga"' + (E.rota.atravessarViga ? " checked" : "") + "> Permitir furo em viga</label></div>";
    h += '<button class="btn sm primary" data-hid="rota-propor">Propor traçados</button>';
    var R = E.rota.res; if (!R) return h + "</div>";
    var obs = m && E.rota.opsNaProposta != null && m.ops !== E.rota.opsNaProposta;
    if (obs) h += '<div data-hid="rota-obsoleta" style="border:1px solid ' + CORES.aviso + ';border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px"><b>O modelo mudou depois da proposta.</b> Proponha de novo antes de aplicar.</div>';
    if (R.fixture) h += '<div style="border:1px solid ' + CORES.falha + ';border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px"><b>TABELAS DE TESTE — NÃO É NORMA.</b></div>';
    if (!R.opcoes.length) h += '<p data-hid="rota-sem" style="font-size:12px;margin:6px 0"><b>Nenhum traçado fechou.</b> Veja abaixo o motivo de cada estratégia.</p>';
    R.opcoes.forEach(function (o, i) {
      var aplicada = E.rota.aplicada === i;
      h += '<div data-rota-op="' + i + '" data-hid="rota-opcao" style="border:1px solid rgba(127,127,127,.4);border-radius:10px;padding:8px 10px;margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Opção ' + o.ordem + " — " + esc(o.nome) + "</b><span>" +
        '<button class="btn sm" data-hid="rota-previa" data-i="' + i + '" title="Mostra esta opção no 3D (também aparece ao passar o mouse sobre o cartão)">Ver no 3D</button> ' +
        '<button class="btn sm primary" data-hid="rota-aplicar" data-i="' + i + '"' + (obs || E.rota.aplicada != null ? " disabled" : "") + ">" + (aplicada ? "Aplicada" : "Aplicar esta opção") + "</button></span></div>" +
        '<p style="font-size:12px;margin:4px 0">' + fmt(o.comprimento, 2) + " m de tubo · " + o.conexoes + " conexões · custo relativo " + fmt(o.custoRelativo, 2) + (o.ordem === 1 ? " (a mais barata)" : "") + " · travessias: " + o.travessias.parede + " parede, " + o.travessias.laje + " laje, " + o.travessias.viga + " viga</p>" +
        '<details style="font-size:12px"><summary style="cursor:pointer">Por que esta opção</summary><ul style="margin:4px 0;padding-left:18px">' + arr(o.justificativa).map(function (j) { return "<li>" + esc(j) + "</li>"; }).join("") + "</ul></details>";
      var fonteAv = arr(o.problemas).length ? o.problemas : arr(o.avisos).map(function (t) { return { texto: t, elementos: [] }; });
      var probs = fonteAv.map(function (pb, k) {
        var ac = pb.acao && pb.acao.tipo ? pb.acao : null, pcs = arr(pb.elementos).length ? arr(pb.elementos) : (aplicada ? arr(E.rota.idsAplicados) : []);
        return { tipo: "rota" + i + "-" + k, titulo: pb.texto || String(pb), gravidade: "aviso", pecas: pcs,
                 solucoes: ac ? [{ id: "r" + i + "_" + k, texto: rotuloAcaoRota(ac) }] : [{ id: "n" + k, texto: "confira o ponto indicado e ajuste à mão, ou escolha outra opção" }] };
      });
      if (probs.length && dep("ProblemaCard")) h += ProblemaCard.lista(probs, { titulo: "Avisos desta opção (" + probs.length + ")", prefixoIndice: "r" + i + "_", acoes: function (sol) { return /^r\d+_\d+$/.test(String(sol.id)) ? sol.texto : false; }, gravidade: "aviso" });
      if (arr(o.pendencias).length) h += '<ul style="font-size:12px;margin:4px 0;padding-left:18px">' + o.pendencias.map(function (p) { return "<li><b>não verificado: falta " + esc(p.chave) + "</b> — " + esc(p.motivo) + "</li>"; }).join("") + "</ul>";
      h += "</div>";
    });
    if (arr(R.descartadas).length) h += '<div data-hid="rota-descartadas" style="font-size:12px;margin:6px 0"><b>Estratégias descartadas</b><ul style="margin:4px 0;padding-left:18px">' + R.descartadas.map(function (d) { return "<li><b>" + esc(d.nome) + ":</b> " + esc(d.motivo) + "</li>"; }).join("") + "</ul>" +
      (dep("ProblemaCard") ? ProblemaCard.lista(R.descartadas.map(function (d, k) { return { tipo: "descartada" + k, titulo: d.nome + ": " + d.motivo, gravidade: "aviso", pecas: arr(d.elementos), solucoes: d.acao && d.acao.tipo ? [{ id: "d" + k, texto: rotuloAcaoRota(d.acao) }] : [] }; }).filter(function (pb) { return pb.pecas.length || pb.solucoes.length; }),
        { titulo: "Estratégias descartadas: o que fazer", prefixoIndice: "d", acoes: function (sol) { return /^d\d+$/.test(String(sol.id)) ? sol.texto : false; }, gravidade: "aviso" }) : "") + "</div>";
    var geral = arr(R.pendencias).filter(function (p) { return !/^rota\.estrategia\./.test(p.chave); });
    if (geral.length) h += '<div data-hid="rota-pend" style="font-size:12px;margin:6px 0"><b>Não verificado (' + geral.length + ')</b><ul style="margin:4px 0;padding-left:18px">' + geral.slice(0, LIMITE_LISTA).map(function (p) { return "<li>falta " + esc(p.chave) + " — " + esc(p.motivo) + "</li>"; }).join("") + "</ul></div>";
    if (E.rota.sug) h += '<p style="font-size:12px;margin:6px 0">Traçado aplicado. <button class="btn sm primary" data-hid="dimensionar">Dimensionar agora</button></p>';
    return h + "</div>";
  }

  /* ------------------------------------------------------------------ biblioteca (famílias hid-*) */
  function indiceBiblioteca() {
    if (E._indice) return E._indice;
    var F = dep("HidFamilias"), out = { itens: [], fabricantes: [], familias: [] }, fv = {};
    if (!F) return out;
    try {
      F.todas().forEach(function (f) {
        out.familias.push({ id: f.id, nome: f.nome });
        arr(f.tipos).forEach(function (t) {
          var fab = String((t.valores && t.valores.Fabricante) || "");
          out.itens.push({ fam: f.id, famNome: f.nome, tipo: t.id, nome: t.nome, fab: fab, conferir: !!(t.valores && t.valores.A_conferir) });
          if (fab && !fv[fab]) { fv[fab] = 1; out.fabricantes.push(fab); }
        });
      });
      out.fabricantes.sort();
    } catch (e) {}
    E._indice = out;
    return out;
  }
  function colocar(famId, tipoId) {
    var UI_ = global.FamiliaUI, f = UI_ && UI_.obter ? UI_.obter(famId) : null;
    if (!f) { E.msg = { k: "erro", t: "A biblioteca de famílias não tem " + famId + " (js/familiaui.js)." }; redesenhar(); return false; }
    UI_.colocar(f, tipoId);
    E.msg = { k: "info", t: "Clique no modelo para colocar: " + f.nome + "." };
    redesenhar();
    return true;
  }

  /* ------------------------------------------------------------------ HTML */
  var ST = { ok: "atende", reprovado: "não atende", pendente: "não verificado", nao_aplicavel: "não se aplica" };
  function pilula(s) {
    var tom = s === "ok" ? "ok" : (s === "reprovado" ? "erro" : "alerta");
    return global.Modulo && Modulo.pilula ? Modulo.pilula(ST[s] || s, tom) : '<span style="font-weight:600;color:' + corDoStatus(s) + '">' + esc(ST[s] || s) + "</span>";
  }
  function campo(rot, nome, valor, extra) {
    return '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:120px;flex:1"><span>' + esc(rot) + '</span><input class="inp" data-hid-campo="' + esc(nome) + '" value="' + esc(valor) + '" inputmode="decimal"' + (extra || "") + "></label>";
  }
  function htmlPrograma(m) {
    var us = usos(), h = '<div data-hid="programa"><b>Programa de necessidades</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">';
    h += '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:200px;flex:2"><span>Uso da edificação</span><select class="inp" data-hid-campo="uso">' +
      us.map(function (u) { return '<option value="' + esc(u) + '"' + (u === E.uso ? " selected" : "") + ">" + esc(rotulo(u)) + "</option>"; }).join("") + "</select></label>";
    h += campo("Pavimentos", "v:pavimentos", E.valores.pavimentos);
    basesDoUso(E.uso).forEach(function (b) { h += campo(rotuloBase(b), "v:" + b, valorBase(b)); });
    h += campo("População (se já definida)", "populacao", E.populacao, ' placeholder="calculada pela norma"');
    h += "</div>";
    h += '<p class="muted" style="font-size:11.5px;margin:2px 0 6px">Valores iniciais de porte: confirme os da sua obra. A população e as quantidades vêm das tabelas de norma; o que não está nelas aparece como pendência.</p>';
    var q = quadro(m);
    if (!q) return h + '<p class="muted" style="font-size:12px">Quadro de aparelhos indisponível (motores do programa não carregados).</p></div>';
    if (q.populacao && q.populacao.valor != null) h += '<p style="font-size:12px;margin:4px 0">População: <b>' + fmt(q.populacao.valor, 0) + "</b>" + (q.consumoDiario && q.consumoDiario.L != null ? " · consumo diário: <b>" + fmt(q.consumoDiario.L, 0) + " L</b>" : "") +
      (q.reservacao && q.reservacao.minimo_L != null ? " · reservação mínima: <b>" + fmt(q.reservacao.minimo_L, 0) + " L</b>" : "") + "</p>";
    else h += '<p style="font-size:12px;margin:4px 0">População: <b>não verificado</b> — ' + esc(arr(q.populacao && q.populacao.passos).join(" ") || "informe a população ou complete o porte") + "</p>";
    h += '<table class="tbl" data-hid="quadro" style="font-size:12px;margin:4px 0 8px"><thead><tr><th>Aparelho</th><th>Exigido</th><th>No modelo</th><th>Situação</th><th>Fonte</th><th></th></tr></thead><tbody>';
    if (!arr(q.aparelhosMinimos).length) h += '<tr><td colspan="6" class="muted">Sem aparelhos mínimos tabelados para este uso: não verificado.</td></tr>';
    arr(q.aparelhosMinimos).forEach(function (a, i) {
      var g = dep("HidPrograma") ? HidPrograma.grupo(a.aparelho) : a.aparelho, fonte = a.fonte && (a.fonte.doc || a.fonte.norma) ? (a.fonte.doc || a.fonte.norma) + (a.fonte.pagina ? ", p. " + a.fonte.pagina : "") : "sem fonte";
      var bt = a.falta > 0 && FAMILIA_DO_GRUPO[g] ? '<button class="btn sm" data-hid="colocar-grupo" data-grupo="' + esc(g) + '" title="' + esc("Arma a colocação de " + a.falta + " " + rotulo(a.aparelho).toLowerCase()) + '">Corrigir: colocar</button>' : "";
      h += "<tr><td>" + esc(rotulo(a.aparelho)) + '</td><td title="' + esc(a.regra) + '">' + (a.exigido == null ? "—" : a.exigido) + "</td><td>" + a.noModelo + "</td><td>" +
        (a.exigido == null ? pilula("pendente") : (a.falta > 0 ? '<span style="color:' + CORES.falha + ';font-weight:600">faltam ' + a.falta + "</span>" : pilula("ok"))) + '</td><td style="font-size:11px">' + esc(fonte) + "</td><td>" + bt + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function htmlAlimentacao(m) {
    var rs = reservatorios(m), pt = pontasAF(m), h = '<div data-hid="alimentacao"><b>Alimentação</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">';
    h += '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:200px;flex:2"><span>Origem da água</span><select class="inp" data-hid-campo="alim:tipo">' +
      '<option value="reservatorio"' + (E.alim.tipo === "reservatorio" ? " selected" : "") + ">Reservatório (superior, por gravidade)</option>" +
      '<option value="rede_publica"' + (E.alim.tipo === "rede_publica" ? " selected" : "") + ">Rede pública (com pressão)</option></select></label>";
    if (E.alim.tipo === "rede_publica") {
      h += campo("Pressão disponível (kPa)", "alim:pressao_kpa", E.alim.pressao_kpa, ' placeholder="informe"');
      h += '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:200px;flex:2"><span>Ponto de entrada (ponta de tubo de água fria)</span><select class="inp" data-hid-campo="alim:ponto">' +
        (pt.length ? pt.map(function (p) { return '<option value="' + esc(p.rot) + '"' + (p.rot === E.alim.ponto ? " selected" : "") + ">" + esc(p.rot) + "</option>"; }).join("") : '<option value="">nenhuma ponta livre no modelo</option>') + "</select></label>";
    } else {
      h += campo("Nível d'água mínimo (m)", "alim:nivelAgua", E.alim.nivelAgua, ' placeholder="cota da saída (conservador)"') + campo("Nível d'água máximo (m)", "alim:nivelAguaMax", E.alim.nivelAguaMax, ' placeholder="caixa cheia (opcional)"');
      if (rs.length > 1) h += '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:200px;flex:2"><span>Reservatório que alimenta</span><select class="inp" data-hid-campo="alim:conector">' +
        rs.map(function (r) { return '<option value="' + esc(r.conector) + '"' + (r.conector === E.alim.conector ? " selected" : "") + ">" + esc(r.id + " (" + r.famId + ")") + "</option>"; }).join("") + "</select></label>";
      else if (!rs.length) h += '<span class="muted" style="font-size:12px;align-self:center">Nenhum reservatório no modelo: coloque uma caixa-d\'água (biblioteca abaixo) ou use a rede pública.</span>';
    }
    h += "</div>";
    h += '<label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-hid-campo="rec:ligado"' + (E.rec.ligado ? " checked" : "") + "> Reservatório inferior + recalque (bomba)</label>";
    if (E.rec.ligado) {
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + campo("Nível mínimo da sucção (m)", "rec:nivelSuccao", E.rec.nivelSuccao) + campo("Nível de chegada (m)", "rec:nivelChegada", E.rec.nivelChegada) + campo("Cota da bomba (m)", "rec:cotaBomba", E.rec.cotaBomba) +
        campo("Trechos da sucção (ids)", "rec:trechosSuccao", E.rec.trechosSuccao) + campo("Trechos do recalque (ids)", "rec:trechosRecalque", E.rec.trechosRecalque) + "</div>" +
        '<p class="muted" style="font-size:11.5px;margin:2px 0">Sem curva de bomba cadastrada, a escolha da bomba fica como "não verificado: falta a curva".</p>';
    }
    return h + "</div>";
  }
  /* ------------------------------------------------------------------ ÁGUA QUENTE, PLUVIAL E INCÊNDIO (entrada e resultado) */
  function cidadesPluvial() {
    var NR = dep("HidNormas"), v = {}, out = [];
    try { arr(NR.linhas("ap.intensidade.localidade")).forEach(function (l) { if (l.localidade && !v[l.localidade]) { v[l.localidade] = 1; out.push(l.localidade); } }); } catch (e) {}
    return out;
  }
  function ocupacoes() {
    var NR = dep("HidNormas"), out = [];
    try { arr(NR.linhas("in.it01.classificacao_ocupacao")).forEach(function (l) { if (l.divisao) out.push({ divisao: l.divisao, rot: l.divisao + " — " + l.descricao + " (grupo " + l.grupo + ")" }); }); } catch (e) {}
    return out;
  }
  function ficha(it) { return it && it.dados && it.dados.fichaTecnicaComoImpressa ? it.dados.fichaTecnicaComoImpressa : (it && it.dados) || {}; }
  function primeiroNumero(txt) { var m = String(txt == null ? "" : txt).replace(",", ".").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; }
  function valorDaFicha(it, re) { var f = ficha(it), k = Object.keys(f).filter(function (x) { return re.test(x); })[0]; return k ? primeiroNumero(f[k]) : null; }
  function equipamentos(tipo) {
    var C = dep("HidCatalogo"), out = [];
    try { arr(C.itens({ tipo: tipo })).forEach(function (it) { out.push(it); }); } catch (e) {}
    return out;
  }
  function fonteDoItem(it) { var f = it && it.fonte || {}; return (f.arquivo || f.json || "catálogo") + (f.pagina ? ", p. " + f.pagina : ""); }
  /* áreas de cobertura lidas do MODELO (projeção horizontal): telhado por perímetro (contorno) e cobertura de 1/2 águas (x0..x1 × z0..z1) */
  function areasCobertura(m) {
    var out = [], est = m && m.estado || {};
    function poligono(P) { var a = 0, i, n = P.length; for (i = 0; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }   // hid:ok área pela fórmula do laço (geometria)
    arr(est.telhados).forEach(function (t) {
      var P = arr(t && t.contorno).map(function (q) { return Array.isArray(q) ? [Number(q[0]), Number(q[1])] : [Number(q && q.x), Number(q && q.z)]; });
      if (P.length >= 3 && P.every(function (q) { return isFinite(q[0]) && isFinite(q[1]); })) out.push({ id: String(t.id), area_m2: poligono(P), origem: "telhado" });   // hid:ok mínimo de 3 vértices (geometria)
    });
    arr(est.coberturas).forEach(function (c) {
      if (!c) return;
      var a = Math.abs((Number(c.x1) - Number(c.x0)) * (Number(c.z1) - Number(c.z0)));
      if (isFinite(a) && a > 0) out.push({ id: String(c.id), area_m2: a, origem: "cobertura" });
    });
    return out;
  }
  function alturaDoModelo() { var ps = pavimentos(); if (ps.length < 2) return null; var c = ps.map(function (p) { return p.cota; }); return Math.max.apply(null, c) - Math.min.apply(null, c); }

  function entradaAQ() {
    var a = E.aq; if (!a.ligado) return null;
    var cfg = { uso: E.uso, aquecimento: { tipo: a.tipo, energia: a.tipo === "solar" ? "solar" : a.energia } }, it;
    if (num(a.tempoRecuperacao, null) != null) cfg.aquecimento.tempoRecuperacao_h = num(a.tempoRecuperacao, null);
    if (num(a.volume, null) != null) cfg.aquecimento.volumeAdotado_L = num(a.volume, null);
    if (a.tipo === "passagem" && a.aquecedor) {
      it = equipamentos("aquecedor_gas_passagem").filter(function (x) { return x.id === a.aquecedor; })[0];
      if (it) {
        var pm = valorDaFicha(it, /Pressão de água.*mínima/i);
        cfg.aquecedor = { nome: it.codigo, vazao_l_min: valorDaFicha(it, /Vazão de água/i), fonte: fonteDoItem(it) };
        if (pm != null) cfg.aquecedor.pressaoMin_kpa = pm * 9.80665;   // hid:ok mca → kPa (g = 9,80665 m/s², física)
      }
    }
    if (a.tipo === "solar" && a.coletor) {
      it = equipamentos("coletor_solar").filter(function (x) { return x.id === a.coletor; })[0];
      if (it) { var ar = valorDaFicha(it, /Área externa/i); if (ar != null) cfg.aquecimento.coletorArea_m2 = ar; }
    }
    return cfg;
  }
  function entradaAP(m) {
    var a = E.ap; if (!a.ligado) return null;
    var cfg = { situacao: a.situacao }, ar = areasCobertura(m);
    if (a.cidade && a.cidade !== "__outra") cfg.cidade = a.cidade;
    if (num(a.intensidade, null) != null) { cfg.intensidade_mm_h = num(a.intensidade, null); if (a.fonteIntensidade) cfg.fonteIntensidade = a.fonteIntensidade; }
    if (ar.length) cfg.areas = ar.map(function (x) { return { id: x.id, area_m2: x.area_m2 }; });
    else if (num(a.areaCobertura, null) != null) cfg.areas = [{ id: "cobertura", area_m2: num(a.areaCobertura, null) }];
    arr(cfg.areas).forEach(function (x) { if (E.destinosAP[x.id]) x.destino = { calha: E.destinosAP[x.id] }; });   // escolha feita pelo "Corrigir" (acao.tipo "destino")
    return cfg;
  }
  /* pavimentos do modelo para marcar a isenção D.2; modelo sem níveis: um pavimento único, sem cota */
  function pavsD2() { var p = pavimentos(); return p.length ? p : [{ nome: "Pavimento único" }]; }
  /* J2: hidrantes e extintores que o MODELO já tem (peças do biminst e famílias hid-hidrante-abrigo / hid-extintor), por pavimento (cota).
     O motor verifica a cobertura dos existentes e só propõe o que falta; depois de Aplicar, recalcular não repropõe os mesmos.
     Chuveiros modelados (peça chuveiro_automatico e família hid-sprinkler) vão em pavimentos[].chuveiros. */
  function pecasExistentes(m, pavs) {
    var est = m && m.estado || {}, lista = [], out = {};
    arr(est.instalacoes && est.instalacoes.pecas).forEach(function (p) { if (p && (p.peca === "hidrante_abrigo" || p.peca === "extintor" || p.peca === "chuveiro_automatico")) lista.push({ id: String(p.id), tipo: p.peca === "extintor" ? "ext" : (p.peca === "chuveiro_automatico" ? "chu" : "hid"), x: Number(p.x), y: Number(p.y), z: Number(p.z) }); });
    arr(est.familias).forEach(function (f) { if (f && (f.famId === "hid-hidrante-abrigo" || f.famId === "hid-extintor" || f.famId === "hid-sprinkler")) lista.push({ id: String(f.id), tipo: f.famId === "hid-extintor" ? "ext" : (f.famId === "hid-sprinkler" ? "chu" : "hid"), x: Number(f.x), y: Number(f.y), z: Number(f.z) }); });
    var ord = arr(pavs).slice().sort(function (a, b) { return (a.cota == null ? 0 : a.cota) - (b.cota == null ? 0 : b.cota); });
    lista.forEach(function (q) {
      if (!isFinite(q.x) || !isFinite(q.z)) return;
      var nome = null;
      if (ord.length === 1 || !isFinite(q.y)) nome = ord[0] && ord[0].nome;
      else ord.forEach(function (p, i) { var lim = i + 1 < ord.length ? ord[i + 1].cota : Infinity; if (q.y >= p.cota - 0.05 && q.y < lim - 0.05) nome = p.nome; });   // hid:ok tolerância de nível de 5 cm (geometria)
      if (nome == null) return;
      var o = out[nome] = out[nome] || { hidrantes: [], extintores: [], chuveiros: [] };
      (q.tipo === "ext" ? o.extintores : (q.tipo === "chu" ? o.chuveiros : o.hidrantes)).push({ id: q.id, x: q.x, z: q.z });
    });
    return out;
  }

  /* chuveiros automáticos (NBR 10897:2020, CONTRATO-INCENDIO §2): só vai o que o RT preencheu; sem risco o motor sugere pela Tabela A.1 (premissa) */
  function chuveirosEntrada(a) {
    var c = a.ch || {}, q = {};
    if (c.risco) q.risco = c.risco;
    if (c.metodo) q.metodo = c.metodo;
    if (num(c.k, null) != null) q.k = num(c.k, null);
    if (num(c.peDireito, null) != null) q.peDireito_m = num(c.peDireito, null);
    if (num(c.defletor, null) != null) q.defletorTeto_mm = num(c.defletor, null);
    if (num(c.areaSistema, null) != null) q.areaSistema_m2 = num(c.areaSistema, null);
    var ob = String(c.obstrucoes || "").split(/\n+/).map(function (l, i) { var p = l.split(";"); return { id: "o" + (i + 1), tipo: String(p[0] || "").trim(), a_mm: num(p[1], null), b_mm: num(p[2], null) }; }).filter(function (o) { return o.tipo && o.a_mm != null; });
    if (ob.length) q.obstrucoes = ob;
    var pre = Object.keys(q).filter(function (k) { return k !== "metodo" || q.metodo !== "calculo"; });   // o método padrão sozinho = nada preenchido
    return pre.length ? q : null;
  }
  function entradaINC(m) {
    var a = E.inc; if (!a.ligado) return null;
    var cfg = { ocupacao: a.ocupacao, area_m2: num(a.area, null), altura_m: num(a.altura, null), construidaAte2005: !!a.construidaAte2005 };
    if (num(a.carga, null) != null) cfg.cargaIncendio_MJm2 = num(a.carga, null);
    var pv = pavimentos(); if (pv.length) cfg.nPavimentos = pv.length;
    /* nível máximo da reserva (IT 17 5.8.8): o informado aqui ou, sendo a mesma caixa, o nível máximo da água fria */
    var nm = num(a.nivelMax, null); if (nm == null) nm = num(E.alim.nivelAguaMax, null);
    if (nm != null) cfg.rede = { origem: { nivelMax_m: nm } };
    if (a.extintorCap) cfg.extintor = { capacidade: a.extintorCap };
    var pol = poligonosPorNivel(m), ex0 = pecasExistentes(m, pavsD2());
    var d2 = pavsD2().map(function (p, i) {
      var o = { nome: p.nome, isencaoD2: !!a.d2[i] }; if (p.cota != null) o.cota = p.cota;
      if (ex0[p.nome]) { if (ex0[p.nome].hidrantes.length) o.hidrantes = ex0[p.nome].hidrantes; if (ex0[p.nome].extintores.length) o.extintores = ex0[p.nome].extintores; if (ex0[p.nome].chuveiros.length) o.chuveiros = ex0[p.nome].chuveiros; }
      if (num(a.ch.peDireito, null) != null) o.peDireito_m = num(a.ch.peDireito, null);
      if (pol[p.nome]) { o.poligono = pol[p.nome].poligono; if (arr(pol[p.nome].acessos).length) o.acessos = pol[p.nome].acessos; }
      return o;
    });
    if (d2.some(function (p) { return p.isencaoD2 || p.poligono || p.hidrantes || p.extintores || p.chuveiros || p.peDireito_m != null; })) cfg.pavimentos = d2;
    var chq = chuveirosEntrada(a); if (chq) cfg.chuveiros = chq;
    if (arr(a.confirmacoes).length) cfg.confirmacoesRT = JSON.parse(JSON.stringify(a.confirmacoes));
    return cfg;
  }
  /* padrões ao abrir ("zero configuração"): Barbacena (a cidade da tabela), a divisão A-2, área do programa e altura do modelo */
  function padroesSistemas() {
    var cs = cidadesPluvial(), os = ocupacoes();
    if (!E.ap.cidade) E.ap.cidade = cs.indexOf("Barbacena/MG") >= 0 ? "Barbacena/MG" : (cs[0] || "__outra");   // a tabela de intensidades cresceu: a cidade da obra da RA (MG) é o padrão
    if (!E.inc.ocupacao) E.inc.ocupacao = (os.filter(function (o) { return o.divisao === "A-2"; })[0] || os[0] || {}).divisao || "";
    if (E.inc.area === "") E.inc.area = E.valores.area_m2 != null ? E.valores.area_m2 : INICIAL.area_m2;
    if (E.inc.altura === "") { var h = alturaDoModelo(); if (h != null && h > 0) E.inc.altura = Math.round(h * 100) / 100; }   // hid:ok arredondamento a 2 casas
  }
  function selectOpc(nome, rot, valor, opcoes) {
    return '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:150px;flex:1"><span>' + esc(rot) + '</span><select class="inp" data-hid-campo="' + esc(nome) + '">' +
      opcoes.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(valor) ? " selected" : "") + ">" + esc(o.t) + "</option>"; }).join("") + "</select></label>";
  }
  function caixa(nome, rot, ligado) { return '<label style="font-size:12px;display:flex;align-items:center;gap:6px;margin:4px 0"><input type="checkbox" data-hid-campo="' + nome + '"' + (ligado ? " checked" : "") + "> <b>" + esc(rot) + "</b></label>"; }

  function htmlAguaQuente() {
    var a = E.aq, h = '<div data-hid="aq">' + caixa("aq:ligado", "Água quente", a.ligado);
    if (!a.ligado) return h + "</div>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("aq:tipo", "Tipo de aquecimento", a.tipo, [{ v: "passagem", t: "Passagem (aquecedor instantâneo)" }, { v: "acumulacao", t: "Acumulação (reservatório térmico)" }, { v: "solar", t: "Solar (coletores)" }]);
    if (a.tipo !== "solar") h += selectOpc("aq:energia", "Energia", a.energia, [{ v: "gas", t: "Gás" }, { v: "eletrico", t: "Elétrico" }]);
    if (a.tipo === "passagem") {
      var eq = equipamentos("aquecedor_gas_passagem");
      h += selectOpc("aq:aquecedor", "Aquecedor do catálogo", a.aquecedor, [{ v: "", t: eq.length ? "— escolha (sem escolha: não verificado) —" : "catálogo sem aquecedores" }].concat(eq.map(function (it) { return { v: it.id, t: it.codigo + (it.fabricante ? " (" + it.fabricante + ")" : "") }; })));
    } else if (a.tipo === "solar") {
      var co = equipamentos("coletor_solar");
      h += selectOpc("aq:coletor", "Coletor solar do catálogo", a.coletor, [{ v: "", t: co.length ? "— escolha (sem escolha: não verificado) —" : "catálogo sem coletores" }].concat(co.map(function (it) { return { v: it.id, t: it.codigo + (it.fabricante ? " (" + it.fabricante + ")" : "") }; })));
    } else h += campo("Tempo de recuperação (h)", "aq:tempoRecuperacao", a.tempoRecuperacao, ' placeholder="informe"') + campo("Volume adotado (L)", "aq:volume", a.volume, ' placeholder="opcional: o menor comercial que atende"');
    return h + "</div></div>";
  }
  function htmlPluvial(m) {
    var a = E.ap, h = '<div data-hid="ap">' + caixa("ap:ligado", "Águas pluviais", a.ligado);
    if (!a.ligado) return h + "</div>";
    var cs = cidadesPluvial(), ar = areasCobertura(m), tot = ar.reduce(function (s, x) { return s + x.area_m2; }, 0);
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("ap:cidade", "Cidade (tabela de intensidades)", a.cidade, cs.map(function (c) { return { v: c, t: c }; }).concat([{ v: "__outra", t: "Outra cidade (informar a intensidade)" }])) +
      selectOpc("ap:situacao", "Situação (período de retorno)", a.situacao, [{ v: "cobertura", t: "Cobertura / terraço" }, { v: "pavimentada", t: "Área pavimentada" }, { v: "sem_extravasamento", t: "Sem extravasamento" }]);
    if (a.cidade === "__outra") h += campo("Intensidade informada pelo projetista (mm/h)", "ap:intensidade", a.intensidade, ' placeholder="informe"') + campo("Fonte da intensidade", "ap:fonteIntensidade", a.fonteIntensidade, ' placeholder="ex.: estudo, posto, ano"');
    h += (ar.length ? '<span class="muted" data-hid="ap-areas" style="font-size:12px;align-self:center;flex:2">Áreas lidas do modelo: ' + ar.length + " (" + fmt(tot, 1) + " m² em projeção horizontal)</span>" : campo("Área de cobertura (m²)", "ap:areaCobertura", a.areaCobertura, ' placeholder="sem telhado no modelo: informe"')) + "</div>";
    return h + "</div>";
  }
  /* COMPONENTE "Confirmações do RT" (item, justificativa, responsável): o mesmo no incêndio e na climatização.
     st = { confirmacoes: [], cfItem, cfJust, cfResp }; a = os atributos de cada tela (data-hid-* ou data-clim-*) e as sugestões de item. */
  function htmlConfirmacoes(st, a) {
    var id = "cf-sug-" + String(a.pre).replace(/\W/g, "");
    return '<div ' + a.raiz + ' style="font-size:12px;margin:6px 0"><b>Confirmações do RT</b> (item, justificativa, responsável — vão ao memorial)' +
      arr(st.confirmacoes).map(function (c, i) { return '<div ' + a.item + ' style="margin:2px 0">• ' + esc(c.item) + " — " + esc(c.justificativa) + " (" + esc(c.responsavel) + ') <button class="btn sm ghost" ' + a.del + ' data-i="' + i + '">remover</button></div>'; }).join("") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0"><label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:120px;flex:1"><span>Item confirmado</span><input class="inp" ' + a.campo + '="' + a.pre + 'cfItem" value="' + esc(st.cfItem) + '" list="' + id + '"></label>' +
      '<datalist id="' + id + '">' + arr(a.sugestoes).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>" +
      campoAttr("Justificativa", a.campo, a.pre + "cfJust", st.cfJust) + campoAttr("Responsável", a.campo, a.pre + "cfResp", st.cfResp) +
      '<button class="btn sm" ' + a.add + ' style="align-self:flex-end">Adicionar confirmação</button></div></div>';
  }
  function campoAttr(rot, attr, nome, valor) { return '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:120px;flex:1"><span>' + esc(rot) + '</span><input class="inp" ' + attr + '="' + esc(nome) + '" value="' + esc(valor) + '"></label>'; }
  /* devolve o texto do erro (item, justificativa e responsável são obrigatórios) ou null quando adicionou */
  function confAdicionar(st) {
    if (!String(st.cfItem).trim() || !String(st.cfJust).trim() || !String(st.cfResp).trim()) return "Confirmação do RT: informe o item, a justificativa e o responsável.";
    st.confirmacoes.push({ item: String(st.cfItem).trim(), justificativa: String(st.cfJust).trim(), responsavel: String(st.cfResp).trim() }); st.cfItem = st.cfJust = st.cfResp = "";
    return null;
  }

  function htmlChuveiros(a) {
    var c = a.ch, R = E.resultado && E.resultado.sistemas && E.resultado.sistemas.incendio, ch = R && R.chuveiros, sug = ch && ch.risco && !c.risco;
    var exist = 0;
    var pol = pecasExistentes(modelo(), pavsD2()); Object.keys(pol).forEach(function (k) { exist += arr(pol[k].chuveiros).length; });
    var h = '<details data-hid="inc-chuv"' + (sug || ch ? " open" : "") + ' style="margin:6px 0"><summary style="cursor:pointer;font-size:12.5px"><b>Chuveiros automáticos (NBR 10897:2020)</b></summary><div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("inc:ch:risco", "Classe de risco (vazio: sugestão do motor pela Tabela A.1)", c.risco, [{ v: "", t: "— sugestão do motor (Tabela A.1) —" }, { v: "leve", t: "leve" }, { v: "ordinario_1", t: "ordinário 1" }, { v: "ordinario_2", t: "ordinário 2" }, { v: "extra_1", t: "extra 1" }, { v: "extra_2", t: "extra 2" }]) +
      selectOpc("inc:ch:metodo", "Método", c.metodo, [{ v: "calculo", t: "por cálculo hidráulico" }, { v: "tabela", t: "por tabela (9.5)" }]) +
      campo("Fator K do chuveiro", "inc:ch:k", c.k, ' placeholder="catálogo do chuveiro"') + campo("Pé-direito (m)", "inc:ch:peDireito", c.peDireito, ' placeholder="informe"') +
      campo("Distância do defletor ao teto (mm)", "inc:ch:defletor", c.defletor, ' placeholder="informe"') + campo("Área do sistema (m²)", "inc:ch:areaSistema", c.areaSistema, ' placeholder="informe"') + "</div>" +
      taArea("Obstruções (tipo ; a em mm ; b em mm, uma por linha — ex.: lateral ; 300 ; 200)", "inc:ch:obstrucoes", c.obstrucoes, "lateral ; 300 ; 200") +
      '<p class="muted" style="font-size:12px;margin:4px 0">Chuveiros modelados lidos do modelo: ' + exist + ' (peça chuveiro_automatico e família hid-sprinkler). A rede e os ramais do cálculo hidráulico saem "não verificado: falta a rede" até serem informados.</p>';
    if (sug) h += '<p data-hid="inc-risco-sug" style="font-size:12px;margin:4px 0">O motor sugeriu o risco <b>' + esc(rotulo(ch.risco)) + '</b> (Tabela A.1). <button class="btn sm" data-hid="inc-risco-conf">Confirmar este risco</button></p>';
    return h + "</details>";
  }
  function htmlIncendio() {
    var a = E.inc, h = '<div data-hid="inc">' + caixa("inc:ligado", "Incêndio (ITs do CBMMG)", a.ligado);
    if (!a.ligado) return h + "</div>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("inc:ocupacao", "Ocupação (Decreto 47.998/2020)", a.ocupacao, ocupacoes().map(function (o) { return { v: o.divisao, t: o.rot }; })) +
      campo("Área total (m²)", "inc:area", a.area) + campo("Altura (m)", "inc:altura", a.altura, ' placeholder="informe"') + campo("Carga de incêndio (MJ/m²)", "inc:carga", a.carga, ' placeholder="só se a tabela pedir"') + "</div>" +
      '<label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-hid-campo="inc:construidaAte2005"' + (a.construidaAte2005 ? " checked" : "") + "> Construída até 01/07/2005</label>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + campo("Nível máximo da reserva (m)", "inc:nivelMax", a.nivelMax, ' placeholder="vazio: o nível máximo da água fria (mesma caixa)"') +
      campo("Capacidade do extintor especificado", "inc:extintorCap", a.extintorCap, ' placeholder="ex.: 2-A:20-B:C (do catálogo)"') + "</div>";
    var pvs = pavsD2();
    if (pvs.length) h += '<div data-hid="inc-d2" style="font-size:12px;margin:4px 0"><b>Isenção D.2 da IT 17</b> (pavimento duplex, triplex, mezanino, sobreloja): ' + pvs.map(function (p, i) {
      return '<label style="margin-right:10px"><input type="checkbox" data-hid-campo="inc:d2:' + i + '"' + (a.d2[i] ? " checked" : "") + "> " + esc(p.nome) + "</label>"; }).join("") + "</div>";
    h += htmlChuveiros(a);
    var polM = poligonosPorNivel(modelo()), semPiso = pavimentos().length ? pavimentos().filter(function (p) { return !polM[p.nome]; }) : [{ nome: "o pavimento (o modelo não tem níveis)" }];
    h += semPiso.length ? '<p data-hid="inc-sempiso" style="font-size:12px;margin:4px 0;color:' + CORES.aviso + '"><b>não verificado: falta o piso de ' + semPiso.map(function (p) { return esc(p.nome); }).join(", ") + '</b> — a cobertura dos hidrantes precisa do contorno: desenhar o piso (ou os ambientes) do pavimento no modelo.</p>'
      : (pavimentos().length ? '<p class="muted" data-hid="inc-comPiso" style="font-size:12px;margin:4px 0">Contorno e acessos dos pavimentos lidos do modelo.</p>' : "");
    h += htmlConfirmacoes(a, { raiz: 'data-hid="inc-conf"', item: 'data-hid="inc-conf-item"', add: 'data-hid="inc-conf-add"', del: 'data-hid="inc-conf-del"', campo: "data-hid-campo", pre: "inc:", sugestoes: [] });
    return h + "</div>";
  }
  function htmlSistemas(m) { return '<div data-hid="sistemas"><b>Água quente, pluvial e incêndio</b>' + htmlAguaQuente() + htmlPluvial(m) + htmlIncendio() + "</div>"; }

  /* resultado dos três sistemas: situação, números principais e "não verificado: falta X" por pendência */
  function pendLista(ps) {
    ps = arr(ps); if (!ps.length) return "";
    return '<ul style="font-size:12px;margin:2px 0 8px;padding-left:18px">' + ps.slice(0, LIMITE_LISTA).map(function (p) { return "<li><b>não verificado: falta " + esc(p.chave) + "</b> — " + esc(p.motivo) + "</li>"; }).join("") + "</ul>";
  }
  function pendDe(R, prefixos) {
    function casa(t) { return prefixos.some(function (x) { return String(t).indexOf(x) === 0; }); }
    return arr(R.pendencias).filter(function (p) { return casa(p.chave) || arr(p.usadoEm).some(casa); });
  }
  function chuveirosResumo(inc) {
    var ch = inc && inc.chuveiros; if (!ch || ch.exigido !== true) return ch && ch.exigido === false ? '<p data-hid="res-chuv" style="font-size:12px;margin:2px 0 6px">Chuveiros automáticos: não exigidos.</p>' : "";
    var d = ch.demanda || {};
    return '<p data-hid="res-chuv" style="font-size:12px;margin:2px 0 6px"><b>Chuveiros (NBR 10897:2020)</b> ' + pilula(ch.status === "calculado" ? "ok" : (ch.status || "pendente")) + " risco " + esc(rotulo(ch.risco || "não verificado")) + " · densidade " + (ch.densidade != null ? fmt(ch.densidade, 1) + " mm/min" : "não verificado") +
      " × área " + (ch.areaOperacao_m2 != null ? fmt(ch.areaOperacao_m2, 0) + " m²" : "não verificado") + " · " + (ch.nChuveirosArea != null ? ch.nChuveirosArea + " chuveiro(s) na área" : "") + " · K " + (ch.k != null ? ch.k : "não verificado") +
      " · reserva dos chuveiros " + (inc.reserva && inc.reserva.chuveiros_m3 != null ? fmt(inc.reserva.chuveiros_m3, 2) + " m³" : "não verificado") + (d.duracao_min != null ? " (" + d.duracao_min + " min)" : "") + (ch.hidraulico ? "" : " · cálculo hidráulico: não verificado: falta a rede") + "</p>";
  }
  function htmlResultadoSistemas(R) {
    var h = "", aq = R.sistemas && R.sistemas.agua_quente, ap = R.sistemas && R.sistemas.pluvial, inc = R.sistemas && R.sistemas.incendio, x;
    if (aq) {
      x = aq.aquecimento || {};
      h += '<div data-hid="res-aq"><b>Água quente</b> ' + pilula(aq.status === "vazio" ? "pendente" : aq.status) + '<p style="font-size:12px;margin:2px 0 6px">' +
        (aq.consumo && aq.consumo.volumeNecessario_L != null ? "volume necessário " + fmt(aq.consumo.volumeNecessario_L, 0) + " L · " : "") + "aquecimento " + esc(x.tipo || E.aq.tipo) +
        (x.potencia_kW != null ? " · " + fmt(x.potencia_kW, 1) + " kW" : "") + (x.nAquecedores != null ? " · " + x.nAquecedores + " aquecedor(es)" : "") + (x.nColetores != null ? " · " + x.nColetores + " coletor(es)" : "") + " · " + arr(aq.trechos).length + " trecho(s) de rede</p>" +
        pendLista(pendDe(R, ["aq.", "entrada.aguaQuente", "água quente", "catalogo."])) + "</div>";
    }
    if (ap) {
      var it = ap.intensidade || {};
      h += '<div data-hid="res-ap"><b>Pluvial</b> ' + pilula(ap.status === "vazio" ? "pendente" : ap.status) + '<p style="font-size:12px;margin:2px 0 6px">' +
        (it.valor_mm_h != null ? "intensidade " + fmt(it.valor_mm_h, 0) + " mm/h (" + esc(it.origem || "") + (it.periodo_anos ? ", T = " + it.periodo_anos + " anos" : "") + ")" : "não verificado: falta a intensidade pluviométrica") +
        " · " + arr(ap.areas).length + " área(s) · " + arr(ap.trechos).length + " condutor(es)</p>" + pendLista(pendDe(R, ["ap.", "ch.", "entrada.pluvial", "pluvial"])) + "</div>";
    }
    if (inc) {
      var en = inc.enquadramento || {}, rs = inc.resumo || {}, hd = inc.hidrantes || {}, rv = inc.reserva || {};
      var exig = ["extintores", "hidrantes_mangotinhos", "chuveiros_automaticos"].map(function (k) { var me = (en.medidas || {})[k]; return rotulo(k) + ": " + (!me ? "—" : me.exigido === true ? "exigido" : me.exigido === false ? "não exigido" : "não verificado"); });
      h += '<div data-hid="res-inc"><b>Incêndio</b> ' + pilula(inc.status === "vazio" ? "pendente" : inc.status) + '<p style="font-size:12px;margin:2px 0 4px">' + esc(en.divisao || "") + (en.descricao ? " — " + esc(en.descricao) : "") + " · " + exig.map(esc).join(" · ") + "</p>" +
        '<p style="font-size:12px;margin:2px 0 6px">hidrantes: ' + (rs.hidrantes != null ? rs.hidrantes : "—") + " · extintores: " + (rs.extintores != null ? rs.extintores : "—") + " · chuveiros: " + (rs.chuveiros != null ? rs.chuveiros : "—") +
        " · reserva técnica de incêndio: " + (rv.total_L != null ? fmt(rv.total_L, 0) + " L" : "não verificado: falta a reserva") + (hd.bomba && hd.bomba.AMT_m != null ? " · AMT da bomba " + fmt(hd.bomba.AMT_m, 1) + " m" : "") + "</p>" +
        chuveirosResumo(inc) + pendLista(arr(inc.pendencias)) + "</div>";
    }
    return h;
  }

  /* "Corrigir" dos avisos do TRAÇADO (hidrota problemas[].acao): parametro → preenche o campo sugerido e propõe de novo;
     permitirFuroViga → marca e propõe de novo; qualquer outra (ajustar, peca, ponto, selecionar…) → seleciona as peças no 3D.
     Propor não altera o modelo: nada é aplicado em silêncio. */
  function rotuloAcaoRota(a) {
    if (a.tipo === "parametro") return "usar " + (a.campo || "o valor") + " = " + (a.sugerido != null ? a.sugerido : "o sugerido") + " e propor de novo";
    if (a.tipo === "permitirFuroViga") return "permitir furo em viga e propor de novo";
    return "selecionar a peça para ajustar";
  }
  function corrigirRota(a, elementos) {
    if (!a || !a.tipo) return false;
    if (a.tipo === "parametro" && a.campo) {
      if (a.sugerido == null) { E.msg = { k: "aviso", t: "Sem valor sugerido para " + a.campo + ": preencha o campo à mão." }; redesenhar(); return false; }
      E.rota.params[a.campo] = a.sugerido;
      propor();
      return true;
    }
    if (a.tipo === "permitirFuroViga") { E.rota.atravessarViga = true; propor(); return true; }
    var ids = arr(a.ids).length ? a.ids : arr(elementos);
    if (dep("ProblemaCard") && ids.length) ProblemaCard.mostrarNo3D(ids);
    return true;
  }

  /* ------------------------------------------------------------------ TRATAMENTO e FLUIDOS INDUSTRIAIS (tela) */
  function servicosInd() {
    var NR = dep("HidNormas"), v = {}, out = [];
    try { arr(NR.linhas("ind.velocidade.recomendada")).forEach(function (l) { if (l.servico && !v[l.servico]) { v[l.servico] = 1; out.push(l.servico); } }); } catch (e) {}
    return out;
  }
  /* "a ; b" por linha (vírgula decimal aceita) → [[a, b]] só com pares numéricos */
  function linhasPares(txt) {
    return String(txt == null ? "" : txt).split(/\n+/).map(function (l) { return l.split(/[;\t]/).map(function (x) { return num(x, null); }); }).filter(function (q) { return q.length >= 2 && q[0] != null && q[1] != null; });   // hid:ok par = 2 colunas
  }
  function entradaTR() {
    var a = E.tr; if (!a.ligado) return null;
    var cfg = { tipo: a.tipo };
    if (a.tipo === "eta") { if (num(a.vazao, null) != null) cfg.vazao_Ls = num(a.vazao, null); return cfg; }
    if (a.padrao) cfg.padrao = a.padrao;
    if (a.tipo === "ete") { if (num(a.tMedia, null) != null) cfg.temperatura_C = num(a.tMedia, null); return cfg; }
    if (num(a.limpezaAnos, null) != null) cfg.limpeza_anos = num(a.limpezaAnos, null);
    if (num(a.tMedia, null) != null || num(a.tMesFrio, null) != null) cfg.clima = { tMedia_C: num(a.tMedia, null), tMesFrio_C: num(a.tMesFrio, null) };
    /* ENSAIO DE PERCOLAÇÃO (NBR 17076:2024, Anexo N): leituras por cava (intervalo ; rebaixamento), ou a taxa média da área, ou o K médio por camadas */
    var inf = {}, ens = linhasPares(a.ensaios).map(function (q) { return { intervalo_min: q[0], rebaixamento_m: q[1] }; }), cam = linhasPares(a.camadas).map(function (q) { return { K_min_m: q[0], H_m: q[1] }; });
    if (ens.length) inf.ensaios = ens;
    if (num(a.percMedia, null) != null) inf.percolacao_min_m = num(a.percMedia, null);
    if (cam.length) inf.camadas = cam;
    if (Object.keys(inf).length) cfg.infiltracao = inf;
    if (num(a.lencol, null) != null) cfg.lencol = { profundidade_m: num(a.lencol, null) };
    return cfg;
  }
  /* rede industrial lida do modelo: trechos do sistema industrial; origem = ponta que ninguém alimenta; consumidores = pontas livres */
  function redeInd(m) {
    var BI = dep("BimInst"), R = null, nos = {}, chaves = {}, n = 0, trechos = [], de = {}, para = {};
    try { R = BI.rede(m.estado, m.avaliarFam); } catch (e) { return null; }
    function no(p) {
      var k = [Math.round(p.x * 50), Math.round(p.y * 50), Math.round(p.z * 50)].join("/");   // hid:ok mesma ponta a 2 cm (geometria do biminst)
      if (!chaves[k]) { chaves[k] = "N" + (n++); nos[chaves[k]] = { cota: p.y, x: p.x, y: p.y, z: p.z }; }
      return chaves[k];
    }
    arr(R.trechos).forEach(function (t) {
      if (t.sistema !== "industrial") return;
      var a = no(t.p1), b = no(t.p2); de[a] = (de[a] || 0) + 1; para[b] = (para[b] || 0) + 1;
      trechos.push({ id: t.id, de: a, para: b, comprimento_m: t.comprimento, dn: t.dn });
    });
    if (!trechos.length) return null;
    var origem = Object.keys(nos).filter(function (k) { return de[k] && !para[k]; })[0] || trechos[0].de;
    var cons = Object.keys(nos).filter(function (k) { return k !== origem && !de[k]; }).map(function (k) { return { id: "C-" + k, no: k }; });
    return { origem: origem, nos: nos, trechos: trechos, consumidores: cons };
  }
  function entradaIND(m) {
    var a = E.ind; if (!a.ligado) return null;
    var cfg = { fluido: { tipo: a.fluido }, material: a.material };
    if (a.fluido === "vapor") cfg.fluido.estado = a.estado;
    if (num(a.temperatura, null) != null) cfg.fluido.temperatura_C = num(a.temperatura, null);
    if (num(a.pressao, null) != null) cfg.fluido.pressao_kPa = num(a.pressao, null);
    if (a.servico) cfg.servico = a.servico;
    var rd = redeInd(m); if (rd) cfg.rede = rd;
    return cfg;
  }
  function taArea(rot, nome, valor, ph) { return '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:220px;flex:2"><span>' + esc(rot) + '</span><textarea class="inp" rows="3" data-hid-campo="' + esc(nome) + '" placeholder="' + esc(ph) + '">' + esc(valor) + "</textarea></label>"; }
  function htmlTratamento() {
    var a = E.tr, h = '<div data-hid="tr">' + caixa("tr:ligado", "Tratamento (fossa, ETE ou ETA)", a.ligado);
    if (!a.ligado) return h + "</div>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("tr:tipo", "Tipo", a.tipo, [{ v: "fossa", t: "Fossa séptica + filtro anaeróbio + sumidouro/vala" }, { v: "ete", t: "ETE (UASB)" }, { v: "eta", t: "ETA (floculador, decantador, filtros)" }]);
    if (a.tipo === "eta") h += campo("Vazão de projeto (L/s)", "tr:vazao", a.vazao, ' placeholder="informe"');
    else {
      h += selectOpc("tr:padrao", "Padrão da residência", a.padrao, [{ v: "", t: "não informado (lado seguro)" }, { v: "alto", t: "alto" }, { v: "medio", t: "médio" }, { v: "baixo", t: "baixo" }]);
      h += campo("Temperatura média (°C)", "tr:tMedia", a.tMedia, ' placeholder="informe"');
      if (a.tipo === "fossa") h += campo("Temperatura do mês mais frio (°C) — K do tanque e T do filtro (Tabela D.1)", "tr:tMesFrio", a.tMesFrio, ' placeholder="informe"') + campo("Intervalo de limpeza (anos)", "tr:limpezaAnos", a.limpezaAnos) +
        taArea("Ensaio de percolação — leituras por cava (intervalo em min ; rebaixamento em m, uma por linha; mínimo 3) — NBR 17076, Anexo N", "tr:ensaios", a.ensaios, "ex.: 30 ; 0,05") +
        campo("ou taxa média de percolação da área (min/m)", "tr:percMedia", a.percMedia, ' placeholder="média das cavas"') + taArea("ou K médio por camadas (K em min/m ; espessura H em m, uma por linha)", "tr:camadas", a.camadas, "ex.: 40 ; 1,5") + campo("Lençol freático (m)", "tr:lencol", a.lencol, ' placeholder="profundidade"');
    }
    h += "</div>";
    if (a.tipo !== "eta") h += '<p class="muted" style="font-size:12px;margin:2px 0">A população vem do programa de necessidades (acima).</p>';
    if (a.tipo === "fossa") h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + campo("Origem x (m)", "tr:ox", a.ox) + campo("Origem y — geratriz da chegada (m)", "tr:oy", a.oy) + campo("Origem z (m)", "tr:oz", a.oz) + "</div>";
    return h + "</div>";
  }
  function htmlIndustrial() {
    var a = E.ind, h = '<div data-hid="ind">' + caixa("ind:ligado", "Fluido industrial (ar comprimido, vapor, óleo, gás, água)", a.ligado);
    if (!a.ligado) return h + "</div>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      selectOpc("ind:fluido", "Fluido", a.fluido, [{ v: "ar", t: "Ar comprimido" }, { v: "vapor", t: "Vapor" }, { v: "agua", t: "Água" }, { v: "oleo", t: "Óleo térmico" }, { v: "gn", t: "Gás natural" }, { v: "glp", t: "GLP" }, { v: "gas_ideal", t: "Outro gás (ideal)" }]);
    if (a.fluido === "vapor") h += selectOpc("ind:estado", "Estado", a.estado, [{ v: "saturado", t: "saturado" }, { v: "superaquecido", t: "superaquecido" }]);
    h += campo("Temperatura (°C)", "ind:temperatura", a.temperatura, ' placeholder="informe"') + campo("Pressão manométrica na origem (kPa)", "ind:pressao", a.pressao, ' placeholder="informe"') +
      selectOpc("ind:material", "Material", a.material, [{ v: "aco_carbono", t: "Aço carbono" }, { v: "inox", t: "Aço inox" }, { v: "cobre", t: "Cobre" }, { v: "pead", t: "PEAD" }]) +
      selectOpc("ind:servico", "Serviço (velocidade recomendada)", a.servico, [{ v: "", t: "— escolha (sem escolha: não verificado) —" }].concat(servicosInd().map(function (s) { return { v: s, t: rotulo(s) }; }))) + "</div>";
    return h + '<p class="muted" style="font-size:12px;margin:2px 0">A rede é lida dos trechos do sistema "Fluidos industriais" do modelo; consumidores = pontas livres (informe vazão e pressão para fechar).</p></div>';
  }
  function htmlSistemas2() { return '<div data-hid="sistemas2">' + htmlTratamento() + htmlIndustrial() + "</div>"; }

  /* ação trocarTipo (vem do motor): botão que muda o tipo de tratamento (ex.: fossa → ETE) e dimensiona de novo */
  function acaoTrocarTipo(tr) {
    var achou = null;
    arr(tr && tr.avisos).concat(arr(tr && tr.problemas)).forEach(function (a) { var c = a && (a.corrigir && a.corrigir.acao || a.acao); if (!achou && c && c.tipo === "trocarTipo") achou = c; });
    if (!achou && tr && tr.status === "nao_aplicavel" && tr.sistema === "tratamento") achou = { tipo: "trocarTipo", para: "ete" };   // fora do escopo da 17076 → ETE
    return achou;
  }
  function trocarTipoHtml(tr) {
    var c = acaoTrocarTipo(tr); if (!c) return "";
    return '<p style="margin:2px 0 6px"><button class="btn sm primary" data-hid="tr-trocar" data-para="' + esc(c.para || "ete") + '">Corrigir: trocar o tipo para ' + esc(String(c.para || "ete").toUpperCase()) + " e dimensionar de novo</button></p>";
  }
  function trocarTipo(para) { E.tr.tipo = para === "eta" || para === "fossa" ? para : "ete"; salvarLS(); return dimensionar(); }
  function resultadoTR(R) {
    var tr = R.sistemas && R.sistemas.tratamento, ind = R.sistemas && R.sistemas.industrial, h = "";
    if (tr) {
      var un = arr(tr.unidades), cn = tr.contribuicao || {};
      h += '<div data-hid="res-tr"><b>Tratamento</b> ' + pilula(tr.status) + '<p style="font-size:12px;margin:2px 0 6px">' + (cn.Qd_L != null ? "contribuição " + fmt(cn.Qd_L, 0) + " L/dia" : "não verificado: falta a contribuição") + " · " + un.length + " unidade(s)" +
        (tr.linhasParalelas > 1 ? " · " + tr.linhasParalelas + " linhas em paralelo" : "") + (un.length ? ": " + un.map(function (u) { return esc(u.id); }).join(", ") : "") + "</p>" + (tr.status === "nao_aplicavel" ? '<p data-hid="tr-fora" style="font-size:12px;margin:2px 0 6px;color:' + CORES.aviso + '"><b>Fora do escopo da NBR 17076</b> (vazão ou carga orgânica acima do limite do sistema): a fossa não se aplica.</p>' : "") +
        arr(tr.avisos).filter(function (x) { return /regi[ãa]o arenosa/i.test(x.texto || ""); }).map(function (x) { return '<p data-hid="tr-arenosa" style="font-size:12px;margin:2px 0 6px">' + esc(x.texto) + "</p>"; }).join("") +
        trocarTipoHtml(tr) + pendLista(arr(tr.pendencias)) +
        (tr.sistema === "tratamento" ? '<button class="btn sm" data-hid="tr-aplicar" title="Põe tanques, filtro e disposição no modelo com as ligações; Ctrl+Z desfaz tudo de uma vez">Aplicar tanques no modelo</button>' : "") + "</div>";
    }
    if (ind) {
      h += '<div data-hid="res-ind"><b>Fluido industrial</b> ' + pilula(ind.status) + '<p style="font-size:12px;margin:2px 0 6px">' + esc(ind.metodo || "método não verificado") + " · " + arr(ind.trechos).length + " trecho(s) · " + arr(ind.consumidores).length + " consumidor(es)" +
        (ind.aplicavel ? "" : " · o modelo desta instalação não aceita o sistema industrial") + "</p>" + pendLista(arr(ind.pendencias)) + "</div>";
    }
    return h;
  }
  function aplicarTratamento() {
    var b = B(), HT = dep("HidTanques"), tr = E.resultado && E.resultado.sistemas.tratamento;
    if (!tr || tr.sistema !== "tratamento") { E.msg = { k: "aviso", t: "Dimensione o tratamento primeiro." }; redesenhar(); return false; }
    if (bloqueadoPorModelo()) return false;
    if (!HT || !b || !b.editarLote) { E.msg = { k: "erro", t: "O editor do BIM ou o módulo de tanques (js/hidtanques.js) não está disponível." }; redesenhar(); return false; }
    var un = arr(tr.unidades), p0 = un[0] && un[0].param || {}, dsp = tr.disposicao || {};
    var o = { x: num(E.tr.ox, 0), y: num(E.tr.oy, 0), z: num(E.tr.oz, 0) };
    var r = HT.opsConjunto(un, { origem: o, dn: p0.DN_entrada, espacamento_m: dsp.espacamento_m, prefixo: "trat" });
    if (!arr(r.ops).length) { E.msg = { k: "aviso", t: "Nenhuma unidade com dimensões para pôr no modelo (não verificado)." + (arr(r.avisos)[0] ? " " + r.avisos[0].texto : "") }; redesenhar(); return false; }
    var ok = b.editarLote({ op: "lote", id: "hid-trat-" + String(new Date().getTime()), origem: "hidrossanitario", ops: JSON.parse(JSON.stringify(r.ops)) });
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou as unidades do tratamento." }; redesenhar(); return false; }
    E.msg = { k: arr(r.pendencias).length ? "aviso" : "ok", t: "Tratamento aplicado: " + r.ops.length + " operação(ões) (unidades e ligações). Ctrl+Z desfaz tudo de uma vez." + (arr(r.pendencias).length ? " Atenção: " + r.pendencias[0].motivo : "") };
    redesenhar();
    return true;
  }

  /* ------------------------------------------------------------------ TEMPLATES POR USO e MANUAL (rodada 3) */
  var CAMPOS_TPL = ["uso", "aq", "ap", "inc", "tr", "ind", "clima", "hidTemplate"];
  function instantaneo() { var o = {}; CAMPOS_TPL.forEach(function (k) { o[k] = JSON.parse(JSON.stringify(E[k] === undefined ? null : E[k])); }); return o; }
  function restaurar(o) {
    CAMPOS_TPL.forEach(function (k) {
      if (o[k] === null || o[k] === undefined) { if (k === "clima" || k === "hidTemplate") E[k] = null; return; }
      if (typeof o[k] === "object" && !Array.isArray(o[k]) && E[k] && typeof E[k] === "object") { Object.keys(o[k]).forEach(function (c) { E[k][c] = o[k][c]; }); } else E[k] = o[k];
    });
  }
  /* aplica o template ao ESTADO DA TELA (nunca ao porte, população, alimentação nem recalque — o dado da obra vale mais); guarda o antes para desfazer */
  function aplicarTemplate() {
    var HT = dep("HidTemplates");
    if (!HT || !HT.aplicar) { E.msg = { k: "erro", t: "Templates: módulo não carregado (js/hidtemplates.js)." }; redesenhar(); return null; }
    if (!E.tpl.id) { E.msg = { k: "aviso", t: "Escolha o template por uso." }; redesenhar(); return null; }
    var antes = instantaneo(), r = null;
    try { r = HT.aplicar(JSON.parse(JSON.stringify(antes)), E.tpl.id); } catch (e) { E.msg = { k: "erro", t: "O template falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    if (!r || !r.ok) { E.msg = { k: "erro", t: "Template: " + arr(r && r.erros).join("; ") }; redesenhar(); return null; }
    restaurar(r.estado);
    E.tpl.antes = antes; E.tpl.mudancas = arr(r.mudancas); E.tpl.decisoes = arr(r.decisoes); E.tpl.nome = r.nome; E.tpl.avisos = arr(r.avisos);
    E.resultado = null; E.opsNoCalculo = null; aplicarCores(null); salvarLS();
    E.msg = { k: "ok", t: "Template \"" + r.nome + "\" aplicado: " + E.tpl.mudancas.length + " campo(s) mudaram; as decisões abaixo são do RT. Dimensione de novo." };
    redesenhar();
    return r;
  }
  function desfazerTemplate() {
    if (!E.tpl.antes) return false;
    restaurar(E.tpl.antes); E.tpl.antes = null; E.tpl.mudancas = []; E.tpl.decisoes = []; E.resultado = null; E.opsNoCalculo = null; aplicarCores(null); salvarLS();
    E.msg = { k: "ok", t: "Template desfeito: a tela voltou ao estado de antes." }; redesenhar();
    return true;
  }
  function baixarTemplate() {
    var HT = dep("HidTemplates");
    if (!HT || !HT.paraOptpl) { E.msg = { k: "erro", t: "Templates: módulo não carregado (js/hidtemplates.js)." }; redesenhar(); return false; }
    if (!E.tpl.id) { E.msg = { k: "aviso", t: "Escolha o template por uso." }; redesenhar(); return false; }
    var txtOptpl = null;
    try { txtOptpl = HT.paraOptpl(E.tpl.id); } catch (e) { txtOptpl = null; }
    if (!txtOptpl) { E.msg = { k: "erro", t: "Não consegui gerar o .optpl deste template." }; redesenhar(); return false; }
    baixar("template-" + E.tpl.id + ".optpl", txtOptpl, "application/json;charset=utf-8");
    E.msg = { k: "ok", t: "Template baixado: template-" + E.tpl.id + ".optpl (famílias, sistemas, opções e padrão de prancha do uso)." }; redesenhar();
    return true;
  }
  function htmlTemplates() {
    var HT = dep("HidTemplates"), lista = [], h = '<div data-hid="templates"><b>Template por uso</b>';
    try { lista = HT && HT.lista ? arr(HT.lista()) : []; } catch (e) { lista = []; }
    if (!lista.length) return h + '<p class="muted" style="font-size:12px;margin:4px 0">Templates indisponíveis (js/hidtemplates.js).</p></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0;align-items:flex-end">' +
      selectOpc("tpl:id", "Uso da edificação", E.tpl.id, [{ v: "", t: "— escolha o uso —" }].concat(lista.map(function (x) { return { v: x.id, t: x.nome }; }))) +
      '<button class="btn sm primary" data-hid="tpl-aplicar">Aplicar template</button><button class="btn sm" data-hid="tpl-baixar" title="Baixa o template do uso como arquivo .optpl">Baixar template (.optpl)</button>' +
      (E.tpl.antes ? '<button class="btn sm ghost" data-hid="tpl-desfazer">Desfazer template</button>' : "") + "</div>";
    var sel = lista.filter(function (x) { return x.id === E.tpl.id; })[0];
    if (sel && sel.descricao) h += '<p class="muted" style="font-size:12px;margin:2px 0">' + esc(sel.descricao) + "</p>";
    if (arr(E.tpl.mudancas).length) h += '<details data-hid="tpl-mudancas" style="font-size:12px;margin:4px 0"><summary>O que o template mudou (' + E.tpl.mudancas.length + ')</summary><ul style="margin:4px 0;padding-left:18px">' +
      E.tpl.mudancas.map(function (m) { return "<li>" + esc(m.campo) + ": " + esc(JSON.stringify(m.de)) + " → <b>" + esc(JSON.stringify(m.para)) + "</b></li>"; }).join("") + "</ul></details>";
    if (arr(E.tpl.decisoes).length) h += '<div data-hid="tpl-decisoes" style="font-size:12px;margin:4px 0;border:1px solid ' + CORES.aviso + ';border-radius:8px;padding:6px 10px"><b>Decisões que o RT confirma</b><ul style="margin:4px 0;padding-left:18px">' +
      E.tpl.decisoes.map(function (d) { return "<li>" + esc(typeof d === "string" ? d : (d.texto || d.item || JSON.stringify(d))) + "</li>"; }).join("") + "</ul></div>";
    return h + "</div>";
  }
  /* J17: o material mais usado de cada sistema no modelo (o manual monta com o material do projeto, não o padrão do biminst) */
  function materiaisDoModelo() {
    var m = modelo(), cont = {}, out = {};
    arr(m && m.estado && m.estado.instalacoes && m.estado.instalacoes.trechos).forEach(function (t) { var k = t.sistema + "|" + t.material; cont[k] = (cont[k] || 0) + 1; });
    Object.keys(cont).forEach(function (k) { var s = k.split("|")[0], mt = k.split("|")[1]; if (!out[s] || cont[k] > cont[s + "|" + out[s]]) out[s] = mt; });
    return out;
  }
  function manual() {
    if (!exigeResultado()) return null;
    var M = dep("HidManual");
    if (!M || !M.gerar) { E.msg = { k: "erro", t: "Manual: módulo não carregado (js/hidmanual.js)." }; redesenhar(); return null; }
    var em = dadosEmpresa(), g, comClima = !!(global.ClimCalcUI && ClimCalcUI.estado && ClimCalcUI.estado.resultado);
    try { g = M.gerar(E.resultado, { obra: { nome: em.obra.nome || "", endereco: em.obra.local || "", cidade: em.obra.cidade || "" }, documento: { revisao: "R00", data: new Date() },
                                     responsavel: { nome: em.d.responsavel || "", crea: em.d.crea || "" }, materiais: materiaisDoModelo(), clima: comClima,
                                     pecas: listaMaterialDoModelo(modelo()) || [], icones: dep("HidPecas") ? HidPecas.iconesEmCache(ICONE_DOC) : {} }); }
    catch (e) { E.msg = { k: "erro", t: "O manual falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    if (!g || !g.ok || !g.html) { E.msg = { k: "erro", t: "Manual: " + arr(g && g.avisos).join(" ") }; redesenhar(); return null; }
    E.manualHtml = g.html; E.manual = { pendencias: arr(g.pendencias).length, avisos: arr(g.avisos).length };
    var aberto = null;
    try { var bl = new Blob([g.html], { type: "text/html;charset=utf-8" }); aberto = global.open ? global.open(URL.createObjectURL(bl), "_blank") : null; } catch (e2) { aberto = null; }
    if (!aberto) baixar("manual-execucao-e-uso.html", g.html, "text/html;charset=utf-8");
    E.msg = { k: E.manual.pendencias || E.manual.avisos ? "aviso" : "ok", t: "Manual de execução e uso gerado: " + E.manual.pendencias + " pendência(s) (fonte ou página não localizada) e " + E.manual.avisos + " aviso(s)" + (aberto ? ". Aberto em outra janela." : ". Baixado como HTML.") };
    redesenhar();
    return g;
  }

  /* ------------------------------------------------------------------ POLÍGONO DOS PAVIMENTOS para o incêndio */
  /* Do modelo, por nível: o contorno dos ambientes (calc.contorno) e as portas das paredes externas (acessos). Os ambientes do nível
     são UNIDOS no contorno externo (L, U, T; pátio interno fechado entra como parte do pavimento). Ambiente diagonal ou peças sem
     contato → sem polígono: fica a pendência "desenhar o piso do pavimento". Nada é inventado. */
  function ptXZ(q) { return Array.isArray(q) ? { x: Number(q[0]), z: Number(q[1]) } : { x: Number(q && q.x), z: Number(q && q.z) }; }
  /* UNIÃO de ambientes → contorno externo do pavimento. Os ambientes de uma edificação são ortogonais: as coordenadas x e z de todos os
     vértices formam uma grade; cada célula da grade está dentro se o centro dela cai em algum ambiente; as arestas entre célula dentro e
     célula fora são o contorno. Vale para L, U, T e pátio interno (vazio fechado = furo, que fica FORA do contorno e é descartado: o pátio
     aberto para fora já é o U). Ambiente não ortogonal (diagonal) → null (continua a pendência, nada é inventado). */
  function uniaoPoligonos(lista) {
    var polis = arr(lista).map(function (c) { return arr(c).map(ptXZ); }).filter(function (P) { return P.length >= 3 && P.every(function (q) { return isFinite(q.x) && isFinite(q.z); }); });   // hid:ok polígono = 3 vértices ou mais
    if (!polis.length) return null;
    var tol = 1e-6, xs = [], zs = [];   // hid:ok tolerância numérica de coordenada (geometria)
    function add(v, l) { for (var i = 0; i < l.length; i++) if (Math.abs(l[i] - v) < tol) return; l.push(v); }
    for (var a = 0; a < polis.length; a++) {
      var P = polis[a];
      for (var k = 0; k < P.length; k++) {
        var q = P[k], r = P[(k + 1) % P.length];
        if (Math.abs(q.x - r.x) > tol && Math.abs(q.z - r.z) > tol) return null;   // aresta diagonal
        add(q.x, xs); add(q.z, zs);
      }
    }
    xs.sort(function (u, v) { return u - v; }); zs.sort(function (u, v) { return u - v; });
    function dentro(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i].z > z) !== (P[j].z > z) && x < (P[j].x - P[i].x) * (z - P[i].z) / (P[j].z - P[i].z) + P[i].x) c = !c; } return c; }
    var nx = xs.length - 1, nz = zs.length - 1, cel = [], i, j;
    for (i = 0; i < nx; i++) { cel[i] = []; for (j = 0; j < nz; j++) { var cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2; cel[i][j] = polis.some(function (P) { return dentro(P, cx, cz); }); } }
    function c(i2, j2) { return i2 >= 0 && j2 >= 0 && i2 < nx && j2 < nz && cel[i2][j2]; }
    /* furos: células fora que não alcançam a borda da grade */
    var fora = [], pilha = [];
    for (i = 0; i < nx; i++) { fora[i] = []; for (j = 0; j < nz; j++) fora[i][j] = false; }
    function semear(i2, j2) { if (i2 >= 0 && j2 >= 0 && i2 < nx && j2 < nz && !cel[i2][j2] && !fora[i2][j2]) { fora[i2][j2] = true; pilha.push([i2, j2]); } }
    for (i = 0; i < nx; i++) { semear(i, 0); semear(i, nz - 1); }
    for (j = 0; j < nz; j++) { semear(0, j); semear(nx - 1, j); }
    while (pilha.length) { var t = pilha.pop(); semear(t[0] + 1, t[1]); semear(t[0] - 1, t[1]); semear(t[0], t[1] + 1); semear(t[0], t[1] - 1); }
    var furos = 0;
    for (i = 0; i < nx; i++) for (j = 0; j < nz; j++) if (!cel[i][j] && !fora[i][j]) { furos++; cel[i][j] = true; }   // pátio interno fechado: tratado como parte do pavimento
    /* arestas do contorno, orientadas com o interior à esquerda, depois encadeadas */
    var seg = {}, ini = [];
    function ponto(i2, j2) { return i2 + "," + j2; }
    function aresta(a1, b1, a2, b2) { var k = ponto(a1, b1); (seg[k] = seg[k] || []).push([a2, b2]); ini.push(k); }
    for (i = 0; i < nx; i++) for (j = 0; j < nz; j++) {
      if (!cel[i][j]) continue;
      if (!c(i, j - 1)) aresta(i, j, i + 1, j);
      if (!c(i + 1, j)) aresta(i + 1, j, i + 1, j + 1);
      if (!c(i, j + 1)) aresta(i + 1, j + 1, i, j + 1);
      if (!c(i - 1, j)) aresta(i, j + 1, i, j);
    }
    if (!ini.length) return null;
    var cont = [], atual = ini[0].split(",").map(Number), inicio = atual.slice(), guarda = 0;
    do {
      cont.push(atual);
      var prox = (seg[ponto(atual[0], atual[1])] || []).shift();
      if (!prox) return null;
      atual = prox; guarda++;
    } while ((atual[0] !== inicio[0] || atual[1] !== inicio[1]) && guarda < 100000);   // hid:ok guarda contra laço (grade pequena)
    if (Object.keys(seg).some(function (k2) { return seg[k2].length; })) return { poligono: null, partes: 2, furos: furos };   // duas peças separadas (ou toque em canto): sem contorno único
    /* tira vértices colineares */
    var pts = cont.map(function (q) { return { x: xs[q[0]], z: zs[q[1]] }; }), lim = [];
    for (i = 0; i < pts.length; i++) {
      var an = pts[(i + pts.length - 1) % pts.length], pr = pts[(i + 1) % pts.length], at = pts[i];
      if (Math.abs((at.x - an.x) * (pr.z - at.z) - (at.z - an.z) * (pr.x - at.x)) > tol) lim.push(at);
    }
    return { poligono: lim, partes: 1, furos: furos };
  }

  function poligonosPorNivel(m) {
    var out = {}, est = m && m.estado || {}, ps = pavimentos().slice().sort(function (a, b) { return a.cota - b.cota; }), ambs = arr(est.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3 && isFinite(a.calc.area); });   // hid:ok polígono = 3 vértices ou mais
    ps.forEach(function (p, i) {
      var lim = i + 1 < ps.length ? ps[i + 1].cota : Infinity;
      var as = ambs.filter(function (a) { var b = isFinite(a.calc.base) ? Number(a.calc.base) : 0; return b >= p.cota - 0.05 && b < lim - 0.05; });   // hid:ok tolerância de 5 cm no nível (geometria)
      if (!as.length) return;
      var usoParede = {};
      as.forEach(function (a) {
        arr(a.calc.lados).forEach(function (l) { if (l.fonte && l.fonte.tipo === "parede") { (usoParede[l.fonte.id] = usoParede[l.fonte.id] || {})[a.id] = 1; } });
      });
      var un = uniaoPoligonos(as.map(function (a) { return a.calc.contorno; }));
      if (un && un.poligono) out[p.nome] = { poligono: un.poligono, cota: p.cota, nivelIdx: i, usoParede: usoParede, lim: lim, furos: un.furos };
    });
    /* acessos: portas hospedadas em parede de um só ambiente (externa), no nível do pavimento */
    arr(est.familias).forEach(function (f) {
      if (!f || !/porta/i.test(f.famId || "") || !f.host || f.host.id == null) return;
      Object.keys(out).forEach(function (nome) {
        var o = out[nome], ext = Object.keys(o.usoParede[f.host.id] || {}).length === 1;
        if (ext && isFinite(f.y) && f.y >= o.cota - 0.05 && f.y < o.lim - 0.05 && isFinite(f.x) && isFinite(f.z)) (o.acessos = o.acessos || []).push({ x: Number(f.x), z: Number(f.z) });   // hid:ok mesma tolerância de nível
      });
    });
    return out;
  }

  function problemas(R) {
    var out = [];
    arr(R && R.avisos).forEach(function (a, i) {
      if (a.gravidade === "info") return;
      if (/^peca-sem-calculo-/.test(String(a.id || ""))) return;   /* esses aparecem no bloco "Peças sem cálculo", calculado do modelo de agora (não do resultado velho) */
      var c = a.corrigir, tem = !!(c && arr(c.ops).length);
      var ac = c && c.acao, sol = c && c.texto ? [{ id: "c" + i, texto: c.texto, pecas: [], temOps: tem, ops: c.ops }] : [];
      /* acao.tipo "destino" (pluvial): uma solução por calha candidata da área sem destino */
      if (ac && ac.tipo === "destino" && arr(ac.calhas).length) sol = arr(ac.calhas).map(function (ch, k) { return { id: "dc" + i + "_" + k, texto: "ligar a área " + ac.area + " à calha " + ch, pecas: [], temOps: true, ops: [] }; });
      /* PRESSURIZAÇÃO (js/hidpressaoui.js): pressão insuficiente → opções (a)–(d) com custo e consequência */
      var PZU = dep("HidPressaoUI"), pzTxt = "";
      if (c && arr(c.opcoes).length && PZU) { sol = PZU.solucoes(c, i); pzTxt = PZU.texto(c); }
      out.push({ tipo: a.id || ("hd" + i), titulo: a.texto, texto: pzTxt || undefined, gravidade: a.gravidade === "erro" ? "erro" : "aviso", pecas: arr(a.elementos), solucoes: sol });
    });
    return out;
  }
  /* ---------------------------------------------------------------- PROJETO COM MEMORIAL × PEÇA "SÓ DESENHO" (18/10/2026)
     Pedido do Rogério: "Nos projetos com memorial de cálculo vou usar só as que estão parametrizadas." O interruptor é por projeto
     (padrão: ligado quando o projeto tem dimensionamento). Ligado, a peça do escritório sem tipo do motor (js/biminstbiblioteca.js) aparece
     aqui na hora, sem esperar o Dimensionar, com Corrigir: MAPEAR (a ação que a tela de Famílias já tem) ou TROCAR pela equivalente do OrçaPRO,
     na mesma posição e com as ligações (HidBiblioteca.opsTrocar). */
  function semCalculoDoModelo(m) {
    var HB = dep("HidBiblioteca"); if (!HB || !m || !HB.memorialDoProjeto || !HB.memorialDoProjeto()) return [];
    try { return HB.pecasSemCalculo(m.estado); } catch (e) { return []; }
  }
  function htmlMemorial(m) {
    var HB = dep("HidBiblioteca"); if (!HB || !HB.memorialDoProjeto || !m) return "";
    var on = HB.memorialDoProjeto();
    var h = '<label data-hid="memorial-sw" style="display:flex;gap:6px;align-items:center;font-size:12px;margin:6px 0" title="Ligado: a lista de peças abre só com o que entra no cálculo e peça sem cálculo vira aviso. Fica gravado neste projeto.">' +
      '<input type="checkbox" data-hid-campo="memorial"' + (on ? " checked" : "") + "> <b>Projeto com memorial de cálculo</b></label>";
    var L = semCalculoDoModelo(m);
    if (L.length && dep("ProblemaCard")) {
      var probs = L.map(function (p) {
        return { tipo: "peca-sem-calculo", titulo: "Peça sem cálculo: mapear ou trocar pela equivalente OrçaPRO — " + p.nome + " (" + p.id + ")", texto: p.motivo, gravidade: "aviso", pecas: [p.id],
                 solucoes: [{ id: "sc:" + p.id + ":m", texto: "mapear a peça para um tipo do motor", temOps: true },
                            { id: "sc:" + p.id + ":t", texto: p.equivalente ? "trocar pela peça equivalente do OrçaPRO (" + p.equivalente.nome + ")" : "trocar por uma peça equivalente do OrçaPRO", temOps: true }] };
      });
      h += '<div data-hid="sem-calculo">' + ProblemaCard.lista(probs, { titulo: "Peças sem cálculo (" + L.length + ")", prefixoIndice: "sc", acoes: function (s) { return s.temOps ? s.texto : false; }, gravidade: "aviso" }) + "</div>";
    }
    return h;
  }
  function escolherNaLista(titulo, opcoes, padrao, aoEscolher) {
    if (!(global.UI && UI.modal)) return false;
    var corpo = '<p style="font-size:12px;margin:0 0 6px">Escolha uma opção e confirme.</p><select class="inp" data-hid-escolha style="width:100%">' +
      opcoes.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === padrao ? " selected" : "") + ">" + esc(o.t) + "</option>"; }).join("") + "</select>";
    UI.modal(titulo, corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Confirmar", classe: "primary", onClick: function () { var s = doc && doc.querySelector("select[data-hid-escolha]"), v = s ? s.value : ""; UI.fecharModal(); if (v) aoEscolher(v); } }
    ]);
    return true;
  }
  /* modo "m" = mapear · "t" = trocar pela equivalente */
  function corrigirSemCalculo(instId, modo) {
    var m = modelo(), HB = dep("HidBiblioteca"), b = B(); if (!m || !HB) return false;
    var p = arr(semCalculoDoModelo(m)).filter(function (x) { return String(x.id) === String(instId); })[0]; if (!p) { redesenhar(); return false; }
    if (modo === "m") {
      var ops = Object.keys(HB.MOTORES).filter(function (k) { return k !== "generica"; }).map(function (k) { return { v: k, t: HB.MOTORES[k].rotulo }; });
      return escolherNaLista('Mapear "' + p.nome + '" para…', ops, p.equivalente ? p.equivalente.motor : "", function (motor) {
        var fam = global.FamiliaUI && FamiliaUI.obter ? FamiliaUI.obter(p.famId) : null;
        if (fam && FamiliaUI.mapearEscritorio(fam, motor)) { E.msg = { k: "ok", t: '"' + p.nome + '" agora é ' + HB.MOTORES[motor].rotulo + " e entra no cálculo. Dimensione de novo." }; }
        else E.msg = { k: "erro", t: "Não consegui gravar o mapeamento da família." };
        redesenhar();
      });
    }
    function trocar(destino) {
      var r = HB.opsTrocar(m.estado, m.avaliarFam, p.id, destino);
      if (!r.ok) { E.msg = { k: "erro", t: r.erro }; redesenhar(); return; }
      var ok = b && b.editarLote ? b.editarLote({ op: "lote", id: "hid-troca-" + String(new Date().getTime()), origem: "hidrossanitario", ops: JSON.parse(JSON.stringify(r.ops)) }) : false;
      E.msg = ok ? { k: r.perdidas ? "aviso" : "ok", t: "Peça trocada pela equivalente do OrçaPRO, na mesma posição. " + r.avisos.join("; ") + ". Ctrl+Z desfaz." } : { k: "erro", t: "O editor recusou a troca." };
      redesenhar();
    }
    if (p.equivalente) { trocar({ famId: p.equivalente.famId, tipoId: p.equivalente.tipoId }); return true; }
    /* sem equivalente certo: a pessoa escolhe entre as peças do OrçaPRO da mesma categoria (as que entram no cálculo) */
    var BT = global.BimInstTipos, cand = BT && BT.catalogo ? BT.catalogo(p.cat).filter(function (t) { return t.origemFam === "orcapro" && t.famId && t.origem === "familia" && t.calculo && t.calculo.entra; }) : [];
    var vistos = {}; cand = cand.filter(function (t) { if (vistos[t.famId]) return false; vistos[t.famId] = 1; return true; });   /* uma opção por família (o tipo da peça se ajusta depois, no seletor) */
    if (!cand.length) { E.msg = { k: "aviso", t: "Não há peça do OrçaPRO equivalente a esta na lista. Use Mapear." }; redesenhar(); return false; }
    return escolherNaLista('Trocar "' + p.nome + '" por…', cand.map(function (t) { return { v: t.id, t: t.familia }; }), cand[0].id, function (id) {
      var t = cand.filter(function (x) { return x.id === id; })[0]; if (t) trocar({ famId: t.famId, tipoId: t.tipoId });
    });
  }
  function htmlResultado(m) {
    var R = E.resultado; if (!R) return '<p class="muted" style="font-size:12px">Clique em <b>Dimensionar</b> para calcular a água fria, o esgoto e (se ligado) o recalque com o modelo atual.</p>';
    var h = "", obsoleto = !!(m && E.opsNoCalculo != null && assinatura(m) !== E.opsNoCalculo), rs = R.resumo || {};
    if (obsoleto) h += '<div data-hid="obsoleto" style="border:1px solid ' + CORES.aviso + ';border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px"><b>O modelo mudou depois do cálculo.</b> Os números abaixo não valem mais: dimensione de novo. As cores no 3D foram retiradas.</div>';
    if (R.fixture) h += '<div style="border:1px solid ' + CORES.falha + ';border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px"><b>TABELAS DE TESTE — NÃO É NORMA.</b> Este resultado não pode ir a memorial.</div>';
    var estado = R.ok ? "ok" : (rs.reprovadas || rs.erros ? "reprovado" : "pendente");
    h += '<p data-hid="situacao" style="font-size:13px;margin:6px 0">Situação: ' + pilula(estado) + " · " + (rs.trechosAF || 0) + " trecho(s) de água fria, " + (rs.trechosES || 0) + " de esgoto · " + (rs.alterados || 0) + " diâmetro(s) a alterar · " +
      (rs.reprovadas || 0) + " reprovada(s) · " + (rs.pendentes || 0) + " não verificada(s)</p>";
    var af = R.sistemas && R.sistemas.agua_fria, es = R.sistemas && R.sistemas.esgoto;
    if (af && arr(af.trechos).length) {
      h += "<b>Água fria</b> " + pilula(af.status === "vazio" ? "pendente" : af.status);
      h += '<table class="tbl" data-hid="tab-af" style="font-size:12px;margin:4px 0 8px"><thead><tr><th>Trecho</th><th>DN modelo</th><th>DN calc.</th><th>Q (L/s)</th><th>V (m/s)</th><th>Perda (m)</th><th>P jusante (kPa)</th><th>Situação</th></tr></thead><tbody>';
      af.trechos.forEach(function (t) { h += "<tr><td>" + esc(t.id) + "</td><td>" + (t.dnModelo == null ? "—" : t.dnModelo) + "</td><td><b>" + (t.dn == null ? "—" : t.dn) + "</b></td><td>" + fmt(t.vazao_ls, CASAS_Q) + "</td><td>" + fmt(t.velocidade_ms, 2) + "</td><td>" + fmt(t.perda_m, CASAS_Q) + "</td><td>" + fmt(t.pressaoJusante_kpa, 1) + "</td><td>" + pilula(t.status) + "</td></tr>"; });
      h += "</tbody></table>";
      if (af.pontoCritico) h += '<p data-hid="critico" style="font-size:12px;margin:2px 0 8px">Ponto mais desfavorável: <b>' + esc(rotulo(af.pontoCritico.aparelho || af.pontoCritico.famInst || af.pontoCritico.no)) + "</b> (" + esc(af.pontoCritico.famInst || "") + "), folga de pressão " + fmt(af.pontoCritico.folga_kpa, 1) + " kPa.</p>";
    }
    if (es && arr(es.trechos).length) {
      h += "<b>Esgoto</b> " + pilula(es.status === "vazio" ? "pendente" : es.status);
      h += '<table class="tbl" data-hid="tab-es" style="font-size:12px;margin:4px 0 8px"><thead><tr><th>Trecho</th><th>Classe</th><th>DN modelo</th><th>DN calc.</th><th>UHC</th><th>Declividade (%)</th><th>Situação</th></tr></thead><tbody>';
      es.trechos.forEach(function (t) { h += "<tr><td>" + esc(t.id) + "</td><td>" + esc(rotulo(t.classe)) + "</td><td>" + (t.dnModelo == null ? "—" : t.dnModelo) + "</td><td><b>" + (t.dn == null ? "—" : t.dn) + "</b></td><td>" + (t.uhc == null ? "não verificado" : fmt(t.uhc, 0)) + "</td><td>" + fmt(t.declividade_pct, 2) + "</td><td>" + pilula(t.status) + "</td></tr>"; });
      h += "</tbody></table>";
    }
    if (R.recalque) {
      var rc = R.recalque;
      h += "<b>Recalque</b> " + pilula(rc.status === "vazio" ? "pendente" : rc.status) + '<p style="font-size:12px;margin:2px 0 8px">' + (rc.AMT_m != null ? "AMT " + fmt(rc.AMT_m, 2) + " m · vazão " + fmt(rc.vazao_m3h, 2) + " m³/h" : "não verificado: faltam dados do recalque") +
        (rc.NPSHd_m != null ? " · NPSH disponível " + fmt(rc.NPSHd_m, 2) + " m" : "") + "</p>";
    }
    h += htmlResultadoSistemas(R) + resultadoTR(R);
    var probs = problemas(R);
    if (probs.length && dep("ProblemaCard")) {
      h += '<div data-hid="problemas">' + ProblemaCard.lista(probs, { titulo: "Avisos e correções (" + probs.length + ")", prefixoIndice: "", acoes: function (s) { return s.temOps ? s.texto : false; }, gravidade: "aviso" }) + "</div>";
    }
    if (arr(R.pendencias).length) {
      h += '<div data-hid="pendencias" style="font-size:12px;margin:8px 0"><b>Não verificado: falta informação (' + R.pendencias.length + ")</b><ul style=\"margin:4px 0;padding-left:18px\">" +
        R.pendencias.slice(0, LIMITE_LISTA).map(function (p) { return "<li><b>não verificado: falta " + esc(p.chave) + "</b> — " + esc(p.motivo) + (arr(p.usadoEm).length ? " <span class=\"muted\">(" + esc(arr(p.usadoEm).join("; ")) + ")</span>" : "") + "</li>"; }).join("") + "</ul></div>";
    }
    return h;
  }
  function htmlBiblioteca() {
    var ix = indiceBiblioteca(), h = '<div data-hid="biblioteca"><b>Famílias hidrossanitárias</b>';
    if (!ix.itens.length) return h + '<p class="muted" style="font-size:12px">Famílias hidrossanitárias: módulo não carregado (js/hidfamilias.js).</p></div>';
    var L = ix.itens.filter(function (i) {
      return (!E.lib.fab || i.fab === E.lib.fab) && (!E.lib.fam || i.fam === E.lib.fam) && (!E.lib.busca || (i.nome + " " + i.fab).toLowerCase().indexOf(E.lib.busca.toLowerCase()) >= 0);
    });
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:150px;flex:1"><span>Tipo</span><select class="inp" data-hid-campo="lib:fam"><option value="">todos (' + ix.familias.length + ")</option>" +
      ix.familias.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === E.lib.fam ? " selected" : "") + ">" + esc(f.nome) + "</option>"; }).join("") + "</select></label>" +
      '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:150px;flex:1"><span>Fabricante</span><select class="inp" data-hid-campo="lib:fab"><option value="">todos</option>' +
      ix.fabricantes.map(function (f) { return '<option value="' + esc(f) + '"' + (f === E.lib.fab ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + "</select></label>" +
      campo("Buscar", "lib:busca", E.lib.busca) + "</div>";
    var MAX = 30;   // hid:ok quantas linhas a lista mostra de uma vez (tela)
    h += '<p class="muted" style="font-size:11.5px;margin:2px 0">' + L.length + " tipo(s)" + (L.length > MAX ? " (mostrando os " + MAX + " primeiros: refine pelo filtro)" : "") + '. Cotas marcadas "a conferir" vêm do catálogo do fabricante; confira antes de emitir.</p>';
    /* QUALIDADE VISUAL 3 (17/10/2026): a forma 3D é desenho RA sobre as cotas do catálogo (nenhum objeto de fabricante
       é embutido: docs/hidro/PESQUISA-OBJETOS-BIM.md). O caminho para o objeto OFICIAL é o do próprio usuário. */
    h += '<p class="muted" data-hid-oficial style="font-size:11.5px;margin:2px 0">Forma 3D desenhada pelo OrçaPRO com as medidas do catálogo. Para usar o objeto oficial do fabricante: baixe-o no site dele e importe em <b>Biblioteca de famílias › Importar família</b> (arquivo .opfam convertido pelo plugin do OrçaPRO a partir do .rfa; o .rfa direto entra com os tipos e uma caixa até ser convertido) ou arraste o arquivo no 3D. A peça importada liga os tubos pelos conectores, mas ainda não conta como aparelho no cálculo (pesos e UHC): para dimensionar, use a família do OrçaPRO.</p>';
    h += '<table class="tbl" data-hid="lib-tab" style="font-size:12px"><tbody>' + L.slice(0, MAX).map(function (i) {
      return "<tr><td>" + esc(i.famNome) + "</td><td>" + esc(i.nome) + "</td><td>" + esc(i.fab) + (i.conferir ? ' <span class="muted">(a conferir)</span>' : "") + '</td><td><button class="btn sm" data-hid="colocar" data-fam="' + esc(i.fam) + '" data-tipo="' + esc(i.tipo) + '">Colocar</button></td></tr>';
    }).join("") + "</tbody></table></div>";
    return h;
  }
  function htmlTudo(m) {
    var h = '<details open data-hid="raiz" style="margin-top:14px;border-top:1px solid rgba(127,127,127,.35);padding-top:8px"><summary style="cursor:pointer;font-weight:600;font-size:13.5px">Dimensionar hidrossanitário</summary>';
    if (!m) return h + '<p class="muted">Abra o BIM para dimensionar.</p></details>';
    if (dep("HidKitUI") && dep("HidKitUI").htmlTopo) h += dep("HidKitUI").htmlTopo();   /* TRAÇAR AUTOMATICAMENTE: o botão principal, no topo */
    h += htmlMemorial(m);
    h += htmlTemplates() + htmlPrograma(m) + htmlAlimentacao(m) + htmlSistemas(m) + htmlSistemas2() + (dep("HidKitUI") ? dep("HidKitUI").html(m) : "") + (dep("HidPiscinaUI") ? dep("HidPiscinaUI").html(m) : "") + htmlRota(m);
    if (E.msg) h += '<div data-hid="msg" data-k="' + esc(E.msg.k) + '" style="border:1px solid ' + (E.msg.k === "erro" ? CORES.falha : (E.msg.k === "aviso" ? CORES.aviso : CORES.ok)) + ';border-radius:8px;padding:6px 10px;margin:8px 0;font-size:12px">' + esc(E.msg.t) + "</div>";
    var tem = !!E.resultado, nops = tem ? arr(E.resultado.ops).length : 0;
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button class="btn sm primary" data-hid="dimensionar">Dimensionar</button>' +
      '<button class="btn sm primary" data-hid="documentos"' + (tem ? "" : " disabled") + ' title="Memorial de cálculo único, memorial descritivo, manual de execução e uso, planilhas e pranchas — PDF, Word e HTML, num clique">Gerar documentos</button>' +
      '<button class="btn sm" data-hid="aplicar"' + (nops ? "" : " disabled") + ' title="Troca os diâmetros do modelo pelos calculados e põe as peças de incêndio propostas; Ctrl+Z desfaz tudo de uma vez">Aplicar diâmetros no modelo' + (nops ? " (" + nops + ")" : "") + "</button>" +
      '<button class="btn sm" data-hid="memorial"' + (tem ? "" : " disabled") + '>Memorial</button><button class="btn sm" data-hid="manual"' + (tem ? "" : " disabled") + ' title="Manual de execução e uso, com fonte e página; o que não tem fonte sai PENDENTE">Manual</button><button class="btn sm" data-hid="planilhas"' + (tem ? "" : " disabled") + '>Planilhas (.xlsx)</button><button class="btn sm" data-hid="pranchas"' + (tem ? "" : " disabled") + ' title="Gerar pranchas: plantas, cortes, isométricos, perspectivas 3D, esquema, detalhes e quadro (PDF, DXF e abas de folha)">Gerar pranchas</button>' +
      (tem ? '<button class="btn sm ghost" data-hid="limpar" title="Tira as cores do 3D e o resultado">Limpar</button>' : "") + "</div>";
    h += htmlResultado(m) + htmlListaMaterial(m) + htmlBiblioteca();
    return h + "</details>";
  }

  /* ------------------------------------------------------------------ montagem e eventos */
  /* tabela.tbl do app tem cabeçalho "sticky" com folga grande: dentro da gaveta ele grudava no meio da tabela e a 1ª linha
     aparecia ACIMA do cabeçalho. Aqui o cabeçalho é estático, a tabela cabe na gaveta e rola na horizontal se precisar. */
  function css() {
    if (!doc || !doc.head || doc.getElementById("hid-css")) return;
    var st = doc.createElement("style"); st.id = "hid-css";
    st.textContent = "#hid-calc table.tbl{width:100%;border-collapse:collapse} #hid-calc table.tbl th{position:static;padding:6px 8px;background:var(--surface-2);border-radius:0}" +
      "#hid-calc table.tbl td{padding:5px 8px;vertical-align:top} #hid-calc .hid-rola{overflow-x:auto;margin:4px 0 8px}" +
      "#hid-calc table.hid-lista{font-size:12px} #hid-calc table.hid-lista td{vertical-align:middle;padding:4px 6px} #hid-calc table.hid-lista th.n,#hid-calc table.hid-lista td.n{text-align:right;white-space:nowrap}" +
      "#hid-calc td.hid-ico{width:58px;padding:3px;background:#fff;border:1px solid rgba(127,127,127,.18);border-radius:8px} #hid-calc td.hid-ico img{width:52px;height:52px;object-fit:contain;display:block}" +
      "#hid-calc .hid-nome{font-weight:600;line-height:1.25} #hid-calc .hid-sub{font-size:11px;opacity:.75;line-height:1.3;margin-top:1px} #hid-calc .hid-pend{color:var(--amarelo,#b45309)}";
    doc.head.appendChild(st);
  }
  function redesenhar() { if (E._raiz && E._raiz.parentNode) desenhar(E._raiz); }
  function desenhar(raiz) {
    var m = modelo();
    css();
    garantirPadroes(m);
    if (E.resultado && m && E.opsNoCalculo != null && assinatura(m) !== E.opsNoCalculo && !E.obsoletoAvisado) { E.obsoletoAvisado = true; aplicarCores(null); }
    if (E.resultado && m && assinatura(m) === E.opsNoCalculo) E.obsoletoAvisado = false;
    raiz.innerHTML = htmlTudo(m).replace(/(<table class="tbl")/g, '<div class="hid-rola">$1').replace(/<\/table>/g, "</table></div>");
    if (dep("ProblemaCard")) {
      ProblemaCard.ligar(raiz, {
        corrigir: function (solId, k) {
          var msc = /^sc:(.+):([mt])$/.exec(String(solId));
          if (msc) { corrigirSemCalculo(msc[1], msc[2]); return; }
          var mr = /^r(\d+)_(\d+)$/.exec(String(solId)), md = /^d(\d+)$/.exec(String(solId));
          if (mr) { var op = E.rota.res && E.rota.res.opcoes[Number(mr[1])], pr = op && arr(op.problemas)[Number(mr[2])]; if (pr) corrigirRota(pr.acao, pr.elementos); return; }
          if (md) { var ds = E.rota.res && E.rota.res.descartadas[Number(md[1])]; if (ds) corrigirRota(ds.acao, ds.elementos); return; }
          var mpz = /^pz(\d+)_(\d+)$/.exec(String(solId));
          if (mpz && dep("HidPressaoUI")) { dep("HidPressaoUI").aplicar(Number(mpz[1]), Number(mpz[2])); return; }
          var md2 = /^dc(\d+)_(\d+)$/.exec(String(solId));
          if (md2) { var ad = E.resultado && E.resultado.avisos[Number(md2[1])], ac2 = ad && ad.corrigir && ad.corrigir.acao; if (ac2 && ac2.tipo === "destino") { E.destinosAP[ac2.area] = ac2.calhas[Number(md2[2])]; dimensionar(); } return; }
          var i = Number(String(solId).replace(/^c/, "")), a = E.resultado && E.resultado.avisos[i];
          if (a && a.corrigir && arr(a.corrigir.ops).length) aplicarOps(a.corrigir.ops, "Correção aplicada");
        }
      });
    }
  }
  function ligar(raiz) {
    raiz.onclick = function (ev) {
      var bt = ev.target && ev.target.closest ? ev.target.closest("[data-hid]") : null; if (!bt || bt.disabled) return;
      var a = bt.getAttribute("data-hid");
      if (/^kit-/.test(a) && dep("HidKitUI")) { dep("HidKitUI").clique(a, bt); return; }   /* PROJETO INTELIGENTE (js/hidkitui.js) */
      if (/^pisc-/.test(a) && dep("HidPiscinaUI")) { dep("HidPiscinaUI").clique(a, bt); return; }   /* PISCINA (js/hidpiscinaui.js) */
      if (a === "dimensionar") dimensionar();
      else if (a === "aplicar") aplicar();
      else if (a === "tr-aplicar") aplicarTratamento();
      else if (a === "tr-trocar") trocarTipo(bt.getAttribute("data-para"));
      else if (a === "inc-risco-conf") { var rk = E.resultado && E.resultado.sistemas.incendio && E.resultado.sistemas.incendio.chuveiros; if (rk && rk.risco) { E.inc.ch.risco = rk.risco; salvarLS(); E.msg = { k: "ok", t: "Risco confirmado: " + rotulo(rk.risco) + ". Dimensione de novo." }; redesenhar(); } }
      else if (a === "tpl-aplicar") aplicarTemplate();
      else if (a === "tpl-baixar") baixarTemplate();
      else if (a === "tpl-desfazer") desfazerTemplate();
      else if (a === "manual") comIcones(ICONE_DOC, manual);
      else if (a === "inc-conf-add") {
        var er = confAdicionar(E.inc);
        if (er) { E.msg = { k: "aviso", t: er }; redesenhar(); return; }
        E.msg = null; salvarLS(); redesenhar();
      }
      else if (a === "inc-conf-del") { E.inc.confirmacoes.splice(Number(bt.getAttribute("data-i")), 1); salvarLS(); redesenhar(); }
      else if (a === "documentos") { if (!exigeResultado()) return; if (dep("HidDocumentosUI")) dep("HidDocumentosUI").abrir(); else { E.msg = { k: "erro", t: "Gerar documentos: módulo não carregado (js/hiddocumentosui.js)." }; redesenhar(); } }
      else if (a === "memorial") comIcones(ICONE_DOC, memorial);
      else if (a === "planilhas") comIcones(ICONE_TELA, planilhas);
      else if (a === "pranchas") pranchas();
      else if (a === "limpar") { E.resultado = null; E.opsNoCalculo = null; E.msg = null; aplicarCores(null); redesenhar(); }
      else if (a === "rota-propor") propor();
      else if (a === "rota-aplicar") aplicarRota(Number(bt.getAttribute("data-i")));
      else if (a === "rota-previa") { E.rota.previaI = null; previaRota(Number(bt.getAttribute("data-i"))); }
      else if (a === "rota-sel-3d") usarSelecao("aparelhos");
      else if (a === "rota-dest-3d") usarSelecao("destino");
      else if (a === "colocar") colocar(bt.getAttribute("data-fam"), bt.getAttribute("data-tipo"));
      else if (a === "colocar-grupo") {
        var fid = FAMILIA_DO_GRUPO[bt.getAttribute("data-grupo")], F = dep("HidFamilias"), f = F && fid ? F.porId(fid) : null;
        if (f && f.tipos.length) colocar(fid, f.tipos[0].id); else { E.msg = { k: "erro", t: "Família para colocar não encontrada (js/hidfamilias.js)." }; redesenhar(); }
      }
    };
    raiz.onmouseover = function (ev) { var c = ev.target && ev.target.closest ? ev.target.closest("[data-rota-op]") : null; if (c) previaRota(Number(c.getAttribute("data-rota-op"))); };
    raiz.onmouseout = function (ev) { var rel = ev.relatedTarget; if (!rel || !rel.closest || !rel.closest("[data-rota-op]")) previaRota(null); };
    raiz.onchange = function (ev) {
      var el = ev.target, n = el && el.getAttribute ? el.getAttribute("data-hid-campo") : null; if (!n) return;
      var v = el.type === "checkbox" ? el.checked : el.value;
      if (n.indexOf("kit:") === 0 && dep("HidKitUI")) { dep("HidKitUI").campo(n, v); return; }   /* PROJETO INTELIGENTE (js/hidkitui.js) */
      if (n.indexOf("pisc:") === 0 && dep("HidPiscinaUI")) { dep("HidPiscinaUI").campo(n, v); redesenhar(); return; }   /* PISCINA (js/hidpiscinaui.js) */
      if (n === "memorial") { var HBi = dep("HidBiblioteca"); if (HBi && HBi.definirMemorial) HBi.definirMemorial(null, !!v); redesenhar(); return; }
      if (n === "uso") E.uso = v;
      else if (n === "populacao") E.populacao = v;
      else if (n.indexOf("v:") === 0) E.valores[n.slice(2)] = v;
      else if (n.indexOf("alim:") === 0) E.alim[n.split(":")[1]] = v;
      else if (n.indexOf("rec:") === 0) E.rec[n.split(":")[1]] = v;
      else if (n === "tpl:id") { E.tpl.id = v; salvarLS(); redesenhar(); return; }
      else if (n.indexOf("aq:") === 0) E.aq[n.split(":")[1]] = v;
      else if (n.indexOf("ap:") === 0) E.ap[n.split(":")[1]] = v;
      else if (n.indexOf("inc:ch:") === 0) E.inc.ch[n.split(":")[2]] = v;
      else if (n.indexOf("inc:d2:") === 0) E.inc.d2[n.split(":")[2]] = !!v;
      else if (n.indexOf("inc:") === 0) E.inc[n.split(":")[1]] = v;
      else if (n.indexOf("tr:") === 0) E.tr[n.split(":")[1]] = v;
      else if (n.indexOf("ind:") === 0) E.ind[n.split(":")[1]] = v;
      else if (n.indexOf("lib:") === 0) E.lib[n.split(":")[1]] = v;
      else if (n.indexOf("rota:sel:") === 0) { if (!E.rota.sel) { var m0 = modelo(), a0 = aparelhosRota(m0); E.rota.sel = {}; a0.aparelhos.concat(a0.pecas).forEach(function (x) { E.rota.sel[x.id] = true; }); } E.rota.sel[n.split(":").slice(2).join(":")] = !!v; return; }
      else if (n.indexOf("rota:dest:") === 0) { E.rota.dest[n.split(":")[2]] = v; return; }
      else if (n.indexOf("rota:geo:") === 0) { E.rota.params[n.split(":")[2]] = v; return; }
      else if (n === "rota:piso") { E.rota.piso = v; return; }
      else if (n === "rota:terreo") { E.rota.terreo = !!v; return; }
      else if (n === "rota:viga") { E.rota.atravessarViga = !!v; return; }
      salvarLS();
      if (n === "uso" || n === "alim:tipo" || n === "rec:ligado" || /^(aq|ap|inc|tr|ind):(ligado|tipo|cidade|fluido)$/.test(n) || n.indexOf("lib:") === 0) redesenhar();
      else { var q = raiz.querySelector('[data-hid="quadro"]'); if (q) redesenhar(); }
    };
  }

  var HidCalcUI = {
    VERSAO: 1, estado: E,
    /* o js/biminstui.js chama isto ao desenhar o painel Instalações (corpo = #bim-inst-corpo) */
    montar: function (corpo) {
      if (!corpo || !doc) return false;
      var raiz = doc.createElement("div"); raiz.id = "hid-calc"; corpo.appendChild(raiz);
      E._raiz = raiz; ligar(raiz); desenhar(raiz);
      return true;
    },
    dimensionar: dimensionar, aplicar: aplicar, memorial: memorial, planilhas: planilhas, pranchas: pranchas, redesenhar: redesenhar,
    /* a tela "Gerar documentos" (js/hiddocumentosui.js) monta a entrada com o que esta tela já sabe */
    dadosEmpresa: dadosEmpresa, pavimentos: pavimentos, materiaisProjeto: materiaisDoModelo, modeloAtual: function () { return modelo(); },
    listaMaterial: function () { return listaMaterialDoModelo(modelo()); }, comIcones: comIcones,
    entrada: function () { var m = modelo(); if (m) garantirPadroes(m); return m ? entrada(m) : null; },
    propor: propor, aplicarRota: aplicarRota, corrigirRota: corrigirRota, areasCobertura: areasCobertura, htmlConfirmacoes: htmlConfirmacoes, confAdicionar: confAdicionar, uniaoPoligonos: uniaoPoligonos, aplicarTratamento: aplicarTratamento, redeInd: redeInd, aplicarTemplate: aplicarTemplate, trocarTipo: trocarTipo, acaoTrocarTipo: acaoTrocarTipo, desfazerTemplate: desfazerTemplate, baixarTemplate: baixarTemplate, manual: manual, poligonosPorNivel: poligonosPorNivel, assinatura: assinatura, modeloMudou: modeloMudou, pecasExistentes: pecasExistentes, problemas: problemas, aplicarCores: aplicarCores, indiceBiblioteca: indiceBiblioteca
  };
  global.HidCalcUI = HidCalcUI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCalcUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
