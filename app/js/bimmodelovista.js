/* =====================================================================
 * bimmodelovista.js — A VISTA COMO OBJETO (prévia
 * `?previa=modelador`). Fase P6 do plano do BIM, Frente B
 * (seção 3.4) + a ligação dos estilos de objeto RA (Frente A, seção 3.3) e o
 * ramo das vistas no Navegador (Frente D).
 *
 * VISTA = { id, tipo: planta|forro|estrutural|corte|elevacao|desenho|chamada,
 *   nome, nivelId, escala, nivelDetalhe: baixo|medio|alto, disciplina,
 *   estiloVisual: linhasOcultas|aramado, faixa: {sup, corte, inf, prof}
 *   (relativa ao nível, só nas plantas), recorte: {ativo, visivel, x0,y0,x1,y1}
 *   (coordenadas do desenho), vg: {OST_x: {visivel, meioTom, penaProj,
 *   penaCorte, cor, padrao}}, filtros: {conjuntoId: {visivel, meioTom, cor}},
 *   modeloId, linha (corte/elevação), paiId + ret (chamada), linhas2d (desenho) }
 * MODELO DE VISTA = { id, nome, tipoVista, ra, campos: {escala: true, …},
 *   valores: {…} }. A vista LIGADA ao modelo herda os campos que ele controla
 *   (travados nas Propriedades); "Aplicar
 *   propriedades do modelo" copia uma vez e não liga.
 *
 * GRAVADO por obra em `orcapro:bim:vistas:<obra>`: só PARÂMETROS (o desenho é
 * refeito do modelo) e SEM LISTA DENTRO DE LISTA (a nuvem recusa — memória
 * "lista dentro de lista"): vistas, modelos, vg, filtros e linhas de desenho
 * são MAPAS por id.
 *
 * ESTILOS RA: data/estilos-objeto-ra.json (categoria → pena de projeção/corte,
 * cor, padrão de linha, preenchimento) e data/penas-ra.json (penas 1–16 em mm
 * por escala). Os valores são da RA (Padrão RA de detalhamento); o inventário
 * de parâmetros só dá os nomes. tools/test-estilos-ra.js confere os dois.
 *
 * PURO × TELA: o objeto vista, o modelo, o V/G, a classificação das linhas por
 * categoria, o recorte e o nome único são puros (tools/test-bimmodelovista.js).
 * A tela (fita, Propriedades, diálogos, Navegador) só chama o puro. Sem a
 * prévia, `ativo()` é falso e o desenho 2D de hoje não muda.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  /* Object.assign em ES5 (o motor roda no Node do gate e em navegador velho) */
  function assign(alvo) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s && typeof s === "object") for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) alvo[k] = s[k]; } return alvo; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function D2() { return dep("Desenho2D", "./desenho2d.js"); }
  function P2() { return global.Bim2D || null; }
  function NAV() { return dep("BimNavegador", "./bimnavegador.js"); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function escH(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CHAVE = "orcapro:bim:vistas:";
  var TIPOS = { planta: "Planta de piso", forro: "Planta de forro", estrutural: "Planta estrutural", corte: "Corte", elevacao: "Elevação", desenho: "Vista de desenho", chamada: "Vista de detalhe" };
  var PLANTAS = { planta: 1, forro: 1, estrutural: 1 };
  var NIVEIS_DETALHE = { baixo: "Baixo", medio: "Médio", alto: "Alto" };
  var DISCIPLINAS = { arquitetura: "Arquitetura", estrutural: "Estrutural", mecanica: "Mecânica", eletrica: "Elétrica", hidraulica: "Hidráulica", coordenacao: "Coordenação" };
  var ESTILOS_VISUAIS = { linhasOcultas: "Linhas ocultas", aramado: "Aramado" };
  var ESCALAS = [5, 10, 20, 25, 50, 75, 100, 125, 200, 500];
  /* os campos que um MODELO DE VISTA controla — nome PT-BR do parâmetro */
  var CAMPOS = {
    escala: { nome: "Escala da vista" },
    nivelDetalhe: { nome: "Nível de detalhe" },
    disciplina: { nome: "Disciplina" },
    estiloVisual: { nome: "Estilo visual" },
    faixa: { nome: "Faixa da vista", so: PLANTAS },
    vg: { nome: "Sobreposições V/G modelo" },
    filtros: { nome: "Filtros de sobreposição V/G" }
  };
  /* a faixa da vista (4 planos, relativos ao nível): Superior, Plano de corte,
     Inferior e Nível de profundidade. Planta: 1,20 é o corte de hoje do OrçaPRO */
  var FAIXA_PADRAO = {
    planta: { sup: 2.3, corte: 1.2, inf: 0, prof: -0.05 },
    estrutural: { sup: 2.3, corte: 1.2, inf: 0, prof: -0.05 },
    forro: { sup: 4.0, corte: 2.3, inf: 0, prof: 0 }
  };
  var ROT_FAIXA = { sup: "Superior", corte: "Plano de corte", inf: "Inferior", prof: "Nível de profundidade" };

  /* MODELOS DE VISTA RA — valores da RA (Padrão RA de detalhamento: fôrma/planta 1:50,
     detalhe 1:10–1:25), nomes de mercado para os 10 modelos */
  var OCULTA_ESTRUTURAL = { OST_Furniture: { visivel: false }, OST_FurnitureSystems: { visivel: false }, OST_Doors: { visivel: false }, OST_Windows: { visivel: false },
    OST_PlumbingFixtures: { visivel: false }, OST_PipeCurves: { visivel: false }, OST_PipeFitting: { visivel: false }, OST_PipeAccessory: { visivel: false },
    OST_LightingFixtures: { visivel: false }, OST_ElectricalFixtures: { visivel: false }, OST_Rooms: { visivel: false }, OST_Ceilings: { visivel: false },
    OST_Casework: { visivel: false }, OST_Roofs: { visivel: false }, OST_Walls: { meioTom: true } };
  /* decisão RA: o modelo de PLANTA ARQUITETÔNICA trava escala, detalhe e faixa, mas NÃO o
     V/G — cada planta (layout, pontos, acabamento) esconde o que precisa sem largar o
     modelo. Os de forro e estrutural travam o V/G: é para isso que eles existem. */
  var MODELOS_RA = {
    "ra-planta-arq": { id: "ra-planta-arq", nome: "Planta Arquitetônica RA", tipoVista: "planta", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, faixa: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "arquitetura", estiloVisual: "linhasOcultas", faixa: clone(FAIXA_PADRAO.planta), vg: {}, filtros: {} } },
    "ra-planta-forro": { id: "ra-planta-forro", nome: "Planta de Forro Refletido RA", tipoVista: "forro", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, faixa: true, vg: true, filtros: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "arquitetura", estiloVisual: "linhasOcultas", faixa: clone(FAIXA_PADRAO.forro),
        vg: { OST_Furniture: { visivel: false }, OST_PlumbingFixtures: { visivel: false }, OST_Rooms: { visivel: false } }, filtros: {} } },
    "ra-planta-estrutural": { id: "ra-planta-estrutural", nome: "Planta Estrutural RA (fôrma)", tipoVista: "estrutural", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, faixa: true, vg: true, filtros: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "estrutural", estiloVisual: "linhasOcultas", faixa: clone(FAIXA_PADRAO.estrutural), vg: clone(OCULTA_ESTRUTURAL), filtros: {} } },
    "ra-planta-fundacao": { id: "ra-planta-fundacao", nome: "Planta de Fundação RA", tipoVista: "estrutural", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, faixa: true, vg: true, filtros: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "estrutural", estiloVisual: "linhasOcultas", faixa: { sup: 1.0, corte: 0.1, inf: -3.0, prof: -3.0 }, vg: clone(OCULTA_ESTRUTURAL), filtros: {} } },
    "ra-elevacao": { id: "ra-elevacao", nome: "Elevação RA", tipoVista: "elevacao", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, vg: true, filtros: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "arquitetura", estiloVisual: "linhasOcultas", vg: {}, filtros: {} } },
    "ra-corte": { id: "ra-corte", nome: "Corte RA", tipoVista: "corte", ra: true,
      campos: { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, vg: true, filtros: true },
      valores: { escala: 50, nivelDetalhe: "medio", disciplina: "arquitetura", estiloVisual: "linhasOcultas", vg: {}, filtros: {} } },
    "ra-detalhe": { id: "ra-detalhe", nome: "Detalhe RA", tipoVista: "chamada", ra: true,
      campos: { escala: true, nivelDetalhe: true, estiloVisual: true },
      valores: { escala: 20, nivelDetalhe: "alto", estiloVisual: "linhasOcultas" } },
    "ra-desenho": { id: "ra-desenho", nome: "Vista de Desenho RA", tipoVista: "desenho", ra: true,
      campos: { escala: true, nivelDetalhe: true },
      valores: { escala: 10, nivelDetalhe: "alto" } }
  };

  /* --------------------------------------------- dados RA (JSON) */
  var DADOS = { estilos: null, penas: null, carregando: false, erro: "" };
  var RESERVA_PENAS = { escalas: [50], tabela: { "50": [0.09, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 0.85, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.4, 2.8] }, pxPorMm: 3.7795, pxMinimo: 0.5 };
  var RESERVA_ESTILOS = { categorias: {}, padroesLinha: { continua: { nome: "Contínua", mm: [] } }, preenchimentos: { vazio: { nome: "Sem preenchimento", tipo: "vazio" } }, meioTom: { cor: "#9aa0a6" } };

  var BimModeloVista = {
    CHAVE: CHAVE, TIPOS: TIPOS, NIVEIS_DETALHE: NIVEIS_DETALHE, DISCIPLINAS: DISCIPLINAS, ESTILOS_VISUAIS: ESTILOS_VISUAIS,
    ESCALAS: ESCALAS, CAMPOS: CAMPOS, FAIXA_PADRAO: FAIXA_PADRAO, MODELOS_RA: MODELOS_RA,

    /* ============================================================ DADOS */
    usarDados: function (estilos, penas) {
      DADOS.estilos = estilos || null; DADOS.penas = penas || null; this._idx = null;
      return !!(estilos && penas);
    },
    dados: function () { return { estilos: DADOS.estilos || RESERVA_ESTILOS, penas: DADOS.penas || RESERVA_PENAS, prontos: !!(DADOS.estilos && DADOS.penas) }; },
    /* Node: require; navegador: fetch dos dois JSON (uma vez); depois redesenha as vistas abertas */
    carregarDados: function (pronto) {
      var self = this;
      if (DADOS.estilos && DADOS.penas) { if (pronto) pronto(true); return true; }
      if (typeof window === "undefined" && typeof require === "function") {
        try { this.usarDados(require("../data/estilos-objeto-ra.json"), require("../data/penas-ra.json")); if (pronto) pronto(true); return true; } catch (e) { return false; }
      }
      if (DADOS.carregando || typeof fetch !== "function") return false;
      DADOS.carregando = true;
      Promise.all(["data/estilos-objeto-ra.json", "data/penas-ra.json"].map(function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }))
        .then(function (L) { DADOS.carregando = false; self.usarDados(L[0], L[1]); if (pronto) pronto(true); self._redesenharAbertas(true); })
        .catch(function (e) { DADOS.carregando = false; DADOS.erro = String(e && e.message || e); if (pronto) pronto(false); });
      return false;
    },

    /* ============================================================ PURO */
    vistaPadrao: function (tipo) {
      if (!TIPOS[tipo]) tipo = "planta";
      return {
        tipo: tipo, nome: "", nivelId: null,
        escala: tipo === "chamada" ? 20 : tipo === "desenho" ? 10 : 50,
        nivelDetalhe: tipo === "chamada" || tipo === "desenho" ? "alto" : "medio",
        disciplina: tipo === "estrutural" ? "estrutural" : "arquitetura",
        estiloVisual: "linhasOcultas",
        faixa: PLANTAS[tipo] ? clone(FAIXA_PADRAO[tipo]) : null,
        recorte: { ativo: false, visivel: false, x0: 0, y0: 0, x1: 0, y1: 0 },
        vg: {}, filtros: {}, modeloId: null
      };
    },
    normFaixa: function (f, tipo) {
      var p = FAIXA_PADRAO[tipo] || FAIXA_PADRAO.planta, o = {};
      ["sup", "corte", "inf", "prof"].forEach(function (k) { o[k] = r4(num(f && f[k], p[k])); });
      return o;
    },
    /* a ordem: Superior ≥ Plano de corte ≥ Inferior ≥ Nível de profundidade
       (no forro refletido só vale Superior ≥ Plano de corte) */
    validarFaixa: function (f, tipo) {
      var o = this.normFaixa(f, tipo);
      if (o.sup < o.corte) return { ok: false, erro: "O plano Superior tem de ficar acima do Plano de corte." };
      if (tipo !== "forro") {
        if (o.corte < o.inf) return { ok: false, erro: "O Plano de corte tem de ficar acima do Inferior." };
        if (o.inf < o.prof) return { ok: false, erro: "O Nível de profundidade não pode ficar acima do Inferior." };
      }
      return { ok: true, faixa: o };
    },
    normVista: function (v) {
      v = obj(v);
      var tipo = TIPOS[v.tipo] ? v.tipo : "planta", p = this.vistaPadrao(tipo), o = {};
      o.id = txt(v.id); o.tipo = tipo; o.nome = txt(v.nome).slice(0, 120);
      o.nivelId = v.nivelId == null ? null : txt(v.nivelId);
      o.escala = Math.max(1, Math.round(num(v.escala, p.escala)));
      o.nivelDetalhe = NIVEIS_DETALHE[v.nivelDetalhe] ? v.nivelDetalhe : p.nivelDetalhe;
      o.disciplina = DISCIPLINAS[v.disciplina] ? v.disciplina : p.disciplina;
      o.estiloVisual = ESTILOS_VISUAIS[v.estiloVisual] ? v.estiloVisual : p.estiloVisual;
      o.faixa = PLANTAS[tipo] ? (v.faixa ? this.normFaixa(v.faixa, tipo) : null) : null;
      var rc = obj(v.recorte);
      o.recorte = { ativo: !!rc.ativo, visivel: !!rc.visivel, x0: num(rc.x0, 0), y0: num(rc.y0, 0), x1: num(rc.x1, 0), y1: num(rc.y1, 0) };
      o.vg = {}; Object.keys(obj(v.vg)).forEach(function (k) { var ov = BimModeloVista.normOv(v.vg[k]); if (ov) o.vg[k] = ov; });
      o.filtros = {}; Object.keys(obj(v.filtros)).forEach(function (k) { var ov = BimModeloVista.normOv(v.filtros[k]); if (ov) o.filtros[k] = ov; });
      o.modeloId = v.modeloId ? txt(v.modeloId) : null;
      if (v.linha) { var l = obj(v.linha); o.linha = { ax: num(l.ax, 0), az: num(l.az, 0), bx: num(l.bx, 1), bz: num(l.bz, 0), inv: !!l.inv, prof: Math.max(0, num(l.prof, 0)) }; }
      if (v.marca) o.marca = txt(v.marca).slice(0, 8);
      if (v.interior) o.interior = true;
      if (v.ponto && isFinite(+v.ponto.x) && isFinite(+v.ponto.z)) o.ponto = { x: +v.ponto.x, z: +v.ponto.z };
      if (v.paiId) o.paiId = txt(v.paiId);
      if (v.ret) { var r = obj(v.ret); o.ret = { x0: num(r.x0, 0), y0: num(r.y0, 0), x1: num(r.x1, 1), y1: num(r.y1, 1) }; }
      if (v.numero) o.numero = txt(v.numero).slice(0, 8);
      if (v.linhas2d) { o.linhas2d = {}; Object.keys(obj(v.linhas2d)).forEach(function (k) { var q = obj(v.linhas2d[k]); if ([q.x1, q.y1, q.x2, q.y2].every(function (x) { return isFinite(+x); })) o.linhas2d[k] = { x1: +q.x1, y1: +q.y1, x2: +q.x2, y2: +q.y2, pena: Math.max(1, Math.min(16, Math.round(num(q.pena, 3)))) }; }); }
      return o;
    },
    /* sobreposição de V/G (categoria ou filtro): só o que foi mexido */
    normOv: function (ov) {
      ov = obj(ov); var o = {}, n = 0;
      if (ov.visivel === false || ov.visivel === true) { o.visivel = ov.visivel; n++; }
      if (ov.meioTom === true || ov.meioTom === false) { o.meioTom = ov.meioTom; n++; }
      ["penaProj", "penaCorte"].forEach(function (k) { var p = Math.round(num(ov[k], 0)); if (p >= 1 && p <= 16) { o[k] = p; n++; } });
      if (/^#[0-9a-fA-F]{6}$/.test(txt(ov.cor))) { o.cor = ov.cor; n++; }
      if (/^[a-z]{3,16}$/.test(txt(ov.padrao))) { o.padrao = ov.padrao; n++; }
      return n ? o : null;
    },
    normModelo: function (m) {
      m = obj(m); var self = this, tipo = TIPOS[m.tipoVista] ? m.tipoVista : "planta";
      var o = { id: txt(m.id), nome: txt(m.nome).slice(0, 80) || "Modelo de vista", tipoVista: tipo, ra: !!m.ra, campos: {}, valores: {} };
      var base = this.normVista(assign({ tipo: tipo }, obj(m.valores), { faixa: obj(m.valores).faixa || (PLANTAS[tipo] ? FAIXA_PADRAO[tipo] : null) }));
      Object.keys(CAMPOS).forEach(function (c) {
        if (!obj(m.campos)[c]) return;
        if (CAMPOS[c].so && !CAMPOS[c].so[tipo]) return;
        o.campos[c] = true; o.valores[c] = clone(base[c]);
      });
      return o;
    },
    /* os modelos que valem para um tipo de vista (os RA + os do usuário) */
    modelos: function (estado, tipo) {
      var L = Object.keys(MODELOS_RA).map(function (k) { return MODELOS_RA[k]; });
      var us = obj(estado && estado.modelos);
      Object.keys(us).forEach(function (k) { L.push(us[k]); });
      return L.filter(function (m) { return !tipo || m.tipoVista === tipo || (PLANTAS[tipo] && PLANTAS[m.tipoVista]) || (tipo === "elevacao" && m.tipoVista === "corte") || (tipo === "corte" && m.tipoVista === "elevacao"); });
    },
    modelo: function (estado, id) {
      if (!id) return null;
      if (MODELOS_RA[id]) return MODELOS_RA[id];
      return obj(estado && estado.modelos)[id] || null;
    },
    /* o que VALE na vista: os campos do modelo ligado mandam (travados) */
    efetivo: function (v, estado) {
      var o = clone(v), m = this.modelo(estado, v && v.modeloId), trav = {};
      if (m) Object.keys(m.campos).forEach(function (c) {
        if (!m.campos[c] || m.valores[c] === undefined) return;
        if (c === "faixa" && !PLANTAS[o.tipo]) return;
        o[c] = clone(m.valores[c]); trav[c] = m.nome;
      });
      o.travados = trav;
      return o;
    },
    /* "Aplicar propriedades do modelo à vista": copia UMA VEZ, não liga */
    aplicarModelo: function (v, m) {
      if (!v || !m) return v;
      Object.keys(m.campos).forEach(function (c) {
        if (!m.campos[c]) return;
        if (c === "faixa" && !PLANTAS[v.tipo]) return;
        v[c] = clone(m.valores[c]);
      });
      return v;
    },
    vincularModelo: function (v, modeloId) { if (v) v.modeloId = modeloId || null; return v; },
    /* "Criar modelo de vista da vista atual" */
    modeloDaVista: function (v, nome, id) {
      var campos = {}, valores = {};
      Object.keys(CAMPOS).forEach(function (c) { if (CAMPOS[c].so && !CAMPOS[c].so[v.tipo]) return; campos[c] = true; valores[c] = clone(v[c]); });
      if (PLANTAS[v.tipo] && !valores.faixa) valores.faixa = clone(FAIXA_PADRAO[v.tipo]);
      return this.normModelo({ id: id, nome: nome, tipoVista: v.tipo, campos: campos, valores: valores });
    },

    /* --------------------------------------------- categorias e estilos */
    _indiceIfc: function (estilos) {
      if (this._idx && this._idx.de === estilos) return this._idx.mapa;
      var mapa = {}, cats = obj(estilos && estilos.categorias);
      Object.keys(cats).forEach(function (id) { arr(cats[id].ifc).forEach(function (t) { if (!mapa[t]) mapa[t] = id; }); });
      this._idx = { de: estilos, mapa: mapa };
      return mapa;
    },
    /* tipo IFC da malha (userData.tipo) → categoria (código OST_*) */
    categoriaDe: function (tipoIfc, estilos) {
      var t = txt(tipoIfc).toUpperCase(), m = this._indiceIfc(estilos);
      return m[t] || (t === "IFCWALLSTANDARDCASE" ? m.IFCWALL : null) || "OST_GenericModel";
    },
    /* estilo final de uma categoria nesta vista: estilo RA ← V/G da vista ← filtro */
    estiloCategoria: function (catId, ef, estilos, ovFiltro) {
      var c = obj(obj(estilos && estilos.categorias)[catId]), ov = obj(obj(ef && ef.vg)[catId]), f = obj(ovFiltro);
      var s = { proj: c.penaProj || 2, corte: c.penaCorte || 3, cor: c.cor || "#000000", padrao: c.padraoLinha || "continua", preench: c.preenchimento || "vazio", meioTom: !!c.meioTom, visivel: true };
      if (ov.visivel === false) s.visivel = false;
      if (ov.meioTom != null) s.meioTom = !!ov.meioTom;
      if (ov.penaProj) s.proj = ov.penaProj; if (ov.penaCorte) s.corte = ov.penaCorte;
      if (ov.cor) s.cor = ov.cor; if (ov.padrao) s.padrao = ov.padrao;
      if (f.visivel === false) s.visivel = false;
      if (f.meioTom != null) s.meioTom = !!f.meioTom;
      if (f.penaProj) s.proj = f.penaProj; if (f.penaCorte) s.corte = f.penaCorte;
      if (f.cor) s.cor = f.cor; if (f.padrao) s.padrao = f.padrao;
      return s;
    },
    /* o que SAI do desenho (V/G): função sobre o userData da malha (tipo, mid, expressID) */
    ocultador: function (ef, estilos, filtroDe) {
      var self = this, vg = obj(ef && ef.vg), fl = obj(ef && ef.filtros), cache = {};
      return function (ud) {
        ud = ud || {};
        var t = txt(ud.tipo), cat = cache[t] || (cache[t] = self.categoriaDe(t, estilos));
        if (obj(vg[cat]).visivel === false) return true;
        if (filtroDe) {
          var uid = ud.expressID != null ? txt(ud.mid) + ":" + ud.expressID : "", f = uid ? filtroDe(uid) : null;
          if (f && obj(fl[f]).visivel === false) return true;
        }
        return false;
      };
    },
    /* MATERIAIS — GANCHO: uid da peça ("edit:<id>") → { id, preench, cor } do padrão de
       corte do material do projeto (js/bimmateriaisui.js grava aqui; null = o da categoria) */
    materialDe: null,
    /* põe a CHAVE de estilo em cada contorno (`k`) e aresta (`linhasK`) e devolve
       o mapa de estilos para o js/desenho2d.js (P6.corpo) */
    classificar: function (dados, ef, estilos, filtroDe) {
      var self = this, est = {}, cache = {}, matDe = typeof this.materialDe === "function" ? this.materialDe : null;
      function chave(ud) {
        ud = ud || {};
        var t = txt(ud.t), cat = cache[t] || (cache[t] = self.categoriaDe(t, estilos)), f = filtroDe && ud.u ? filtroDe(ud.u) : null;
        /* MATERIAIS (js/bimmateriais.js estiloCorte): o padrão de corte do material do projeto da peça */
        var mt = null; if (matDe && ud.u) { try { mt = matDe(ud.u); } catch (eM) { mt = null; } }
        var k = cat + (f ? "|" + f : "") + (mt ? "|mat:" + mt.id : "");
        if (!est[k]) {
          est[k] = self.estiloCategoria(cat, ef, estilos, f ? obj(ef.filtros)[f] : null);
          if (mt && mt.preench) { est[k].preench = mt.preench; if (mt.cor) est[k].corPreench = mt.cor; }
        }
        return k;
      }
      arr(dados && dados.cortes).forEach(function (c) { c.k = chave({ t: c.t, u: c.u }); });
      var lk = []; arr(dados && dados.linhas).forEach(function (l, i) { lk.push(chave(arr(dados.linhasUd)[i])); });
      if (dados) dados.linhasK = lk;
      arr(dados && dados.portas).forEach(function (p) { if (p) p.k = chave({ t: p.t || "IFCDOOR", u: p.u }); });   /* PORTA: o símbolo na pena da categoria Portas */
      if (!est._) est._ = this.estiloCategoria("OST_GenericModel", ef, estilos, null);
      return est;
    },
    /* o pacote que o js/desenho2d.js desenha (extra.p6) */
    pacoteDesenho: function (ef, estilosChave, dadosRA) {
      var d = dadosRA || this.dados();
      return { escala: ef.escala, nivelDetalhe: ef.nivelDetalhe, penas: d.penas, padroes: d.estilos.padroesLinha, preenchimentos: d.estilos.preenchimentos, estilos: estilosChave || {} };
    },

    /* --------------------------------------------- recorte (região de recorte) */
    /* corta o desenho na caixa {x0,y0,x1,y1}: arestas por Liang-Barsky; contorno
       cortado por Sutherland-Hodgman — o PREENCHIMENTO fica fechado (semContorno)
       e o traço só nas arestas que NÃO estão na borda do recorte */
    recortar: function (dados, cx) {
      if (!dados || !cx) return dados;
      var x0 = Math.min(cx.x0, cx.x1), x1 = Math.max(cx.x0, cx.x1), y0 = Math.min(cx.y0, cx.y1), y1 = Math.max(cx.y0, cx.y1);
      if (!(x1 - x0 > 1e-6) || !(y1 - y0 > 1e-6)) return dados;
      var linhas = [], lk = [], lud = [], cortes = [];
      arr(dados.linhas).forEach(function (l, i) {
        var r = BimModeloVista._clipSeg(l[0], l[1], l[2], l[3], x0, y0, x1, y1); if (!r) return;
        linhas.push(r); if (dados.linhasK) lk.push(dados.linhasK[i]); if (dados.linhasUd) lud.push(dados.linhasUd[i]);
      });
      var E = 1e-7;
      function naBorda(a, b) {
        return (Math.abs(a[0] - x0) < E && Math.abs(b[0] - x0) < E) || (Math.abs(a[0] - x1) < E && Math.abs(b[0] - x1) < E) ||
               (Math.abs(a[1] - y0) < E && Math.abs(b[1] - y0) < E) || (Math.abs(a[1] - y1) < E && Math.abs(b[1] - y1) < E);
      }
      arr(dados.cortes).forEach(function (c) {
        var pts = arr(c.pts);
        if (!c.fechado) {
          for (var i = 0; i + 1 < pts.length; i++) {
            var r = BimModeloVista._clipSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], x0, y0, x1, y1);
            if (r) cortes.push({ pts: [[r[0], r[1]], [r[2], r[3]]], fechado: false, k: c.k, t: c.t, u: c.u });
          }
          return;
        }
        var poly = BimModeloVista._clipPoly(pts, x0, y0, x1, y1);
        if (poly.length < 3) return;
        var dentro = pts.every(function (q) { return q[0] >= x0 - E && q[0] <= x1 + E && q[1] >= y0 - E && q[1] <= y1 + E; });
        if (dentro) { cortes.push(c); return; }
        cortes.push({ pts: poly, fechado: true, semContorno: true, k: c.k, t: c.t, u: c.u });
        var tr = null;
        for (var j = 0; j < poly.length; j++) {
          var a = poly[j], b = poly[(j + 1) % poly.length];
          if (naBorda(a, b)) { if (tr) { cortes.push({ pts: tr, fechado: false, k: c.k, t: c.t, u: c.u }); tr = null; } continue; }
          if (!tr) tr = [a.slice()];
          tr.push(b.slice());
        }
        if (tr) cortes.push({ pts: tr, fechado: false, k: c.k, t: c.t, u: c.u });
      });
      var out = {}; Object.keys(dados).forEach(function (k) { out[k] = dados[k]; });
      out.linhas = linhas; out.cortes = cortes;
      if (dados.linhasK) out.linhasK = lk; if (dados.linhasUd) out.linhasUd = lud;
      /* PORTA: o símbolo fica inteiro ou sai inteiro — fica a porta cuja dobradiça (centro do arco) está no recorte */
      if (dados.portas) out.portas = arr(dados.portas).filter(function (p) {
        var q = p && p.arcos && p.arcos[0] ? p.arcos[0].c : (p && p.folhas && p.folhas[0] ? p.folhas[0][0] : null);
        return !!q && q[0] >= x0 - E && q[0] <= x1 + E && q[1] >= y0 - E && q[1] <= y1 + E;
      });
      return out;
    },
    _clipSeg: function (ax, ay, bx, by, x0, y0, x1, y1) {
      var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
      for (var i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < 1e-15) { if (q[i] < 0) return null; continue; }
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
      }
      if (t1 - t0 < 1e-12) return null;
      return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
    },
    _clipPoly: function (pts, x0, y0, x1, y1) {
      var lados = [
        { dentro: function (p) { return p[0] >= x0; }, cruza: function (a, b) { var t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + (b[1] - a[1]) * t]; } },
        { dentro: function (p) { return p[0] <= x1; }, cruza: function (a, b) { var t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + (b[1] - a[1]) * t]; } },
        { dentro: function (p) { return p[1] >= y0; }, cruza: function (a, b) { var t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y0]; } },
        { dentro: function (p) { return p[1] <= y1; }, cruza: function (a, b) { var t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y1]; } }
      ];
      var out = pts.map(function (q) { return [q[0], q[1]]; });
      lados.forEach(function (L) {
        var ent = out; out = [];
        for (var i = 0; i < ent.length; i++) {
          var a = ent[(i - 1 + ent.length) % ent.length], b = ent[i];
          if (L.dentro(b)) { if (!L.dentro(a)) out.push(L.cruza(a, b)); out.push(b); }
          else if (L.dentro(a)) out.push(L.cruza(a, b));
        }
      });
      return out;
    },
    /* distância de um ponto ao primeiro contorno CORTADO numa direção (eixo da tela) —
       a elevação interior acha a parede de frente e as laterais com isto */
    raioAteCorte: function (cortes, p, dir) {
      var best = Infinity, dx = dir[0], dy = dir[1];
      arr(cortes).forEach(function (c) {
        var q = arr(c.pts), n = q.length, lim = c.fechado ? n : n - 1;
        for (var i = 0; i < lim; i++) {
          var a = q[i], b = q[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-12) continue;
          var t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den, s = ((a[0] - p[0]) * dy - (a[1] - p[1]) * dx) / den;
          if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
        }
      });
      return best;
    },

    /* --------------------------------------------- nomes */
    nomeUnico: function (estado, nome, excetoId, extras) {
      var usados = {};
      Object.keys(obj(estado && estado.vistas)).forEach(function (k) { if (k !== excetoId) usados[txt(estado.vistas[k].nome).toLowerCase()] = 1; });
      arr(extras).forEach(function (n) { usados[txt(n).toLowerCase()] = 1; });
      var base = txt(nome).trim() || "Vista", n = base, i = 1;
      while (usados[n.toLowerCase()]) n = base + " " + (++i);
      return n;
    },
    /* renomear: nome repetido entre vistas é recusado */
    renomear: function (estado, id, nome, extras) {
      var v = obj(estado && estado.vistas)[id], n = txt(nome).trim();
      if (!v) return { ok: false, erro: "Vista não encontrada." };
      if (!n) return { ok: false, erro: "O nome da vista não pode ficar vazio." };
      if (n.length > 120) n = n.slice(0, 120);
      var lc = n.toLowerCase(), rep = Object.keys(estado.vistas).some(function (k) { return k !== id && txt(estado.vistas[k].nome).toLowerCase() === lc; }) ||
        arr(extras).some(function (x) { return txt(x).toLowerCase() === lc; });
      if (rep) return { ok: false, erro: "Já existe uma vista chamada “" + n + "”. Os nomes das vistas não se repetem." };
      v.nome = n;
      return { ok: true, nome: n };
    },
    /* duplicar: mesmo tipo e parâmetros, nome "… Cópia 1" */
    duplicar: function (estado, origem, novoId, extras) {
      var o = this.normVista(clone(origem));
      o.id = novoId;
      var base = txt(origem.nome) || TIPOS[o.tipo], n = 1, nome = base + " Cópia " + n;
      var usados = {}; Object.keys(obj(estado.vistas)).forEach(function (k) { usados[txt(estado.vistas[k].nome).toLowerCase()] = 1; });
      arr(extras).forEach(function (x) { usados[txt(x).toLowerCase()] = 1; });
      while (usados[nome.toLowerCase()]) nome = base + " Cópia " + (++n);
      o.nome = nome;
      if (o.tipo === "corte") o.marca = null;
      return o;
    },
    novoId: function () { return "d2v-" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); },

    /* --------------------------------------------- Navegador (puro) */
    /* itens = [{ id, tipo, nome, disciplina, nivel, interior }] → nós por organização */
    GRUPOS: [
      { id: "g-plantas", tipos: { planta: 1 }, rotulo: "Plantas de piso", icone: "planta" },
      { id: "g-forros", tipos: { forro: 1 }, rotulo: "Plantas de forro", icone: "planta" },
      { id: "g-estruturais", tipos: { estrutural: 1 }, rotulo: "Plantas estruturais", icone: "estrutura" },
      { id: "g-elevacoes", tipos: { elevacao: 1 }, so: "exterior", rotulo: "Elevações (Elevação da construção)", icone: "casa" },
      { id: "g-elevacoes-int", tipos: { elevacao: 1 }, so: "interior", rotulo: "Elevações (Elevação interior)", icone: "casa" },
      { id: "g-cortes", tipos: { corte: 1 }, rotulo: "Cortes (Corte da construção)", icone: "corte" },
      { id: "g-detalhes", tipos: { chamada: 1 }, rotulo: "Vistas de detalhe (Detalhe)", icone: "alvo" },
      { id: "g-desenhos", tipos: { desenho: 1 }, rotulo: "Vistas de desenho (Detalhe)", icone: "regua" }
    ],
    arvoreVistas: function (itens, org) {
      var self = this;
      function cmp(a, b) { try { return txt(a.nome).localeCompare(txt(b.nome), "pt-BR", { numeric: true, sensitivity: "base" }); } catch (e) { return a.nome < b.nome ? -1 : 1; } }
      function folha(it) {
        var no = { id: "d2:" + it.id, rotulo: it.nome, icone: it.icone || "planta", vistaId: it.id };
        if (it.tipo === "planta" || it.tipo === "corte") no.arrastar = it.id;   /* P8: planta e corte vão para a folha arrastando (js/bimfolhaui.js) */
        return no;
      }
      function grupos(lista, prefixo) {
        var out = [];
        self.GRUPOS.forEach(function (g) {
          var fs = lista.filter(function (it) { return g.tipos[it.tipo] && (!g.so || (g.so === "interior") === !!it.interior); }).sort(cmp);
          if (!fs.length) return;
          var filhos;
          if (org === "nivel" && (g.tipos.planta || g.tipos.forro || g.tipos.estrutural)) {
            var porN = {}, ordemN = [];
            fs.forEach(function (it) { var n = it.nivel || "Sem nível"; if (!porN[n]) { porN[n] = []; ordemN.push(n); } porN[n].push(it); });
            filhos = ordemN.map(function (n) { return { id: prefixo + g.id + ":" + n, rotulo: n, icone: "niveis", n: porN[n].length, filhos: porN[n].map(folha) }; });
          } else filhos = fs.map(folha);
          out.push({ id: prefixo + g.id, rotulo: g.rotulo, icone: g.icone, n: fs.length, filhos: filhos });
        });
        return out;
      }
      if (org === "disciplina") {
        var porD = {}, ordem = [];
        itens.forEach(function (it) { var d = DISCIPLINAS[it.disciplina] ? it.disciplina : "arquitetura"; if (!porD[d]) { porD[d] = []; ordem.push(d); } porD[d].push(it); });
        ordem.sort(function (a, b) { return Object.keys(DISCIPLINAS).indexOf(a) - Object.keys(DISCIPLINAS).indexOf(b); });
        return ordem.map(function (d) { return { id: "disc:" + d, rotulo: DISCIPLINAS[d], icone: "pasta", n: porD[d].length, filhos: grupos(porD[d], d + ":") }; });
      }
      return grupos(itens, "");
    },

    /* ============================================================ ESTADO (por obra) */
    _obra: "geral", _local: null, _normDe: null, _G: null,
    configurar: function (cfg) {
      cfg = cfg || {};
      if (cfg.obraKey && String(cfg.obraKey) !== this._obra) { this._obra = String(cfg.obraKey); this._local = null; }
      if (cfg.G) this._G = cfg.G;
      if (typeof cfg.conjuntos === "function") this._conjuntos = cfg.conjuntos;
      if (typeof cfg.elementos === "function") this._elementos = cfg.elementos;
    },
    _chave: function () { return CHAVE + this._obra; },
    /* O estado mora DENTRO do estado das vistas 2D (Bim2D.estado().p6, chave
       `orcapro:bim:desenho2d:<obra>`): vai junto no arquivo da obra (.opbim) e no
       template sem mexer em quem salva. Sem o Bim2D (teste puro), chave própria. */
    _norm: function (e) {
      e = obj(e);
      var o = { v: 1, vistas: {}, modelos: {}, seq: obj(e.seq) }, self = this;
      Object.keys(obj(e.vistas)).forEach(function (k) { o.vistas[k] = self.normVista(assign({}, e.vistas[k], { id: k })); });
      Object.keys(obj(e.modelos)).forEach(function (k) { if (!MODELOS_RA[k]) o.modelos[k] = self.normModelo(assign({}, e.modelos[k], { id: k })); });
      return o;
    },
    estado: function () {
      var P = P2(), raiz;
      if (P && P.estado) raiz = P.estado();
      else {
        if (!this._local) { var e = null; try { e = JSON.parse((global.localStorage && global.localStorage.getItem(this._chave())) || "null"); } catch (x) { e = null; } this._local = { p6: e }; }
        raiz = this._local;
      }
      if (!raiz.p6 || raiz.p6 !== this._normDe) { raiz.p6 = this._norm(raiz.p6); this._normDe = raiz.p6; }
      return raiz.p6;
    },
    gravar: function () {
      var P = P2();
      if (P && P._gravar) { this.estado(); P._gravar(); return true; }
      try { if (global.localStorage) global.localStorage.setItem(this._chave(), JSON.stringify(this.estado())); return true; }
      catch (x) { toast("Não consegui guardar as vistas neste aparelho (armazenamento cheio).", "erro"); return false; }
    },
    /* a vista-objeto de um id do Bim2D: as nativas (d2p-/d2c-) ganham o objeto na 1ª vez */
    vistaObj: function (id, d) {
      var e = this.estado(), v = e.vistas[id];
      if (v) return v;
      if (!/^d2[pc]-/.test(txt(id))) return null;
      var tipo = /^d2p-/.test(id) ? "planta" : "corte", P = P2(), st = null;
      try { st = P && P.estado ? P.estado().estilos[id] : null; } catch (e1) { st = null; }
      v = this.normVista(assign(this.vistaPadrao(tipo), { id: id, nome: "", nivelId: d && d.nivel ? d.nivel.id : null, faixa: null }, st && st.escala ? { escala: st.escala } : {}));
      e.vistas[id] = v;
      return v;
    },
    _nomesNativos: function () {
      var P = P2(), out = [];
      try { if (P) { P.niveis().forEach(function (n) { out.push("Planta baixa — " + n.nome); }); P.cortes().forEach(function (c) { out.push("Corte " + c.letra); }); } } catch (e) {}
      return out;
    },

    /* ============================================================ TELA */
    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && D2() && P2()); } catch (e) { return false; } },

    /* --- ganchos do js/bim2dui.js ----------------------------------- */
    /* Bim2D.def: o nome dado pelo usuário vale (renomear) */
    nomear: function (id, d) {
      if (!d) return d;
      var v = this.estado().vistas[id];
      if (v && v.nome) d.nome = v.nome;
      return d;
    },
    /* Bim2D.estilo: escala da vista (ou do modelo ligado) manda no desenho */
    sobreporEstilo: function (id, e) {
      var v = this.estado().vistas[id]; if (!v) return e;
      var ef = this.efetivo(v, this.estado());
      e.escala = ef.escala;
      if (v.tipo === "desenho") { e.cotas = false; e.niveis = false; e.marcasCorte = false; }
      return e;
    },
    /* função de filtro (V/G por filtro): uid → id do conjunto que manda nele */
    _filtroDe: function (ef) {
      var ids = Object.keys(obj(ef.filtros)); if (!ids.length || !this._conjuntos) return null;
      var mapa = {}, conj = [];
      try { conj = arr(this._conjuntos()); } catch (e) { conj = []; }
      var els = []; try { els = this._elementos ? arr(this._elementos()) : []; } catch (e2) { els = []; }
      var BS = global.BimSet;
      ids.forEach(function (fid) {
        var c = conj.filter(function (x) { return x && x.id === fid; })[0]; if (!c || !BS || !BS.resolver) return;
        var r = null; try { r = BS.resolver(c, els); } catch (e3) { r = null; }
        var ch = {}; arr(r && r.chaves).forEach(function (k) { ch[k] = 1; });
        els.forEach(function (el) { if (el && ch[el.chave] && el.uid && !mapa[el.uid]) mapa[el.uid] = fid; });
      });
      return function (uid) { return mapa[uid] || null; };
    },
    /* o que o BIM.vista2d recebe a mais nesta vista (V/G, etiqueta, estilo visual) */
    defExtracao: function (id) {
      var v = this.estado().vistas[id] || this.vistaPadrao(/^d2c-/.test(txt(id)) ? "corte" : "planta");
      var ef = this.efetivo(v, this.estado()), D = this.dados();
      return { p6Tag: true, p6Ocultar: this.ocultador(ef, D.estilos, this._filtroDe(ef)), p6Aramado: ef.estiloVisual === "aramado" };
    },
    /* depois de extrair: classifica por categoria e aplica a região de recorte */
    posExtracao: function (id, r, recorteExtra) {
      if (!r || !r.ok) return r;
      var v = this.estado().vistas[id], ef = v ? this.efetivo(v, this.estado()) : this.vistaPadrao("planta"), D = this.dados();
      r.p6Estilos = this.classificar(r, ef, D.estilos, this._filtroDe(ef));
      var cx = recorteExtra || (ef.recorte && ef.recorte.ativo && Math.abs(ef.recorte.x1 - ef.recorte.x0) > 0.01 && Math.abs(ef.recorte.y1 - ef.recorte.y0) > 0.01 ? ef.recorte : null);
      if (cx) { var rr = this.recortar(r, cx); rr.p6Estilos = r.p6Estilos; rr.p6Recorte = { x0: cx.x0, y0: cx.y0, x1: cx.x1, y1: cx.y1 }; return rr; }
      return r;
    },
    /* Bim2D.redesenhar: o pacote `extra.p6` (só com os dados RA carregados) */
    extraSvg: function (id, dados, ex) {
      var v = this.estado().vistas[id], D = this.dados();
      if (!D.prontos) { this.carregarDados(); return ex; }
      var ef = v ? this.efetivo(v, this.estado()) : this.vistaPadrao("planta");
      ex.p6 = this.pacoteDesenho(ef, (dados && dados.p6Estilos) || {}, D);
      return ex;
    },

    /* --- Propriedades (estende as do Bim2D) ---------------------------- */
    estenderProps: function (id, d, out) {
      if (!out || !d) return out;
      var self = this, est = this.estado(), v = this.vistaObj(id, d); if (!v) return out;
      var ef = this.efetivo(v, est), T = ef.travados || {};
      function trav(c) { return T[c] ? "controlado pelo modelo de vista “" + T[c] + "”" : ""; }
      function op(o) { return Object.keys(o).map(function (k) { return { id: k, rotulo: o[k] }; }); }
      var secs = out.secoes || [];
      var graf = secs.filter(function (s) { return s.nome === "Gráficos"; })[0];
      if (graf) {
        graf.params = graf.params.filter(function (p) { return p.id !== "padraodet"; });
        graf.params.forEach(function (p) {
          if (p.id !== "escala") return;
          p.valor = String(ef.escala);
          p.opcoes = ESCALAS.map(function (s) { return { id: String(s), rotulo: "1:" + s }; });
          if (T.escala) { p.leitura = true; p.valor = "1:" + ef.escala; p.motivo = trav("escala"); }
        });
        var extra = [
          T.nivelDetalhe ? { id: "p6:nd", rotulo: "Nível de detalhe", leitura: true, valor: NIVEIS_DETALHE[ef.nivelDetalhe], motivo: trav("nivelDetalhe") }
                         : { id: "p6:nd", rotulo: "Nível de detalhe", tipo: "lista", valor: ef.nivelDetalhe, opcoes: op(NIVEIS_DETALHE) },
          T.disciplina ? { id: "p6:disc", rotulo: "Disciplina", leitura: true, valor: DISCIPLINAS[ef.disciplina], motivo: trav("disciplina") }
                       : { id: "p6:disc", rotulo: "Disciplina", tipo: "lista", valor: ef.disciplina, opcoes: op(DISCIPLINAS) },
          T.estiloVisual ? { id: "p6:ev", rotulo: "Estilo visual", leitura: true, valor: ESTILOS_VISUAIS[ef.estiloVisual], motivo: trav("estiloVisual") }
                         : { id: "p6:ev", rotulo: "Estilo visual", tipo: "lista", valor: ef.estiloVisual, opcoes: op(ESTILOS_VISUAIS) },
          { id: "p6:vg", rotulo: "Visibilidade/Sobreposição de gráficos", tipo: "botao", rotuloBotao: T.vg ? "Ver… (do modelo)" : "Editar…", fn: function () { self.abrirVG(id); } }
        ];
        graf.params = extra.concat(graf.params);
      }
      /* Extensões: a faixa da vista com os 4 planos (plantas) e a região de recorte */
      var ext = secs.filter(function (s) { return /^Extensões/.test(s.nome); })[0];
      if (ext && PLANTAS[v.tipo] !== undefined && d.tipo === "planta" && d.p6 !== "chamada") {
        var f = ef.faixa || this.normFaixa({ corte: d.altura, inf: -d.abaixo, prof: -d.abaixo, sup: 2.3 }, v.tipo);
        ext.nome = "Extensões (faixa da vista)";
        ext.params = ["sup", "corte", "inf", "prof"].map(function (k) {
          return T.faixa ? { id: "p6:faixa:" + k, rotulo: ROT_FAIXA[k], unidade: "m", leitura: true, valor: String(f[k]).replace(".", ","), motivo: trav("faixa") }
                         : { id: "p6:faixa:" + k, rotulo: ROT_FAIXA[k], unidade: "m", tipo: "numero", passo: 0.05, valor: f[k] };
        });
      }
      if (ext && d.p6 === "elevacao") ext.params = ext.params.filter(function (p) { return p.id !== "inv"; });
      if (ext && d.p6 === "chamada") {   /* a chamada segue a faixa/linha da vista-mãe */
        var pai = P2() && d.pai ? P2().def(d.pai) : null;
        ext.nome = "Extensões";
        ext.params = [{ id: "p6:pai", rotulo: "Vista-mãe", leitura: true, valor: pai ? pai.nome : "—" }];
      }
      var rc = ef.recorte || {}, rec = [
        { id: "p6:rec:ativo", rotulo: "Recortar vista", tipo: "sim-nao", valor: !!rc.ativo },
        { id: "p6:rec:visivel", rotulo: "Região de recorte visível", tipo: "sim-nao", valor: !!rc.visivel }
      ];
      if (rc.ativo) ["x0", "y0", "x1", "y1"].forEach(function (k) { rec.push({ id: "p6:rec:" + k, rotulo: "Recorte " + k.toUpperCase(), unidade: "m", tipo: "numero", passo: 0.1, valor: r4(rc[k]) }); });
      rec.push({ id: "p6:rec:desenhar", rotulo: "Região", tipo: "botao", rotuloBotao: "Desenhar região de recorte", fn: function () { self.armarPick(id, "recorte"); } });
      if (d.p6 !== "chamada") secs.push({ nome: "Região de recorte", params: rec });
      /* Identidade: nome editável, modelo de vista, duplicar, excluir */
      var ide = secs.filter(function (s) { return s.nome === "Identidade"; })[0];
      if (ide) {
        var mods = this.modelos(est, v.tipo);
        ide.params = ide.params.filter(function (p) { return p.id !== "nome" && !(v.tipo !== "planta" && v.tipo !== "corte" && p.id === "excluir") && !(/^d2v-/.test(id) && p.id === "excluir"); });
        ide.params.unshift(
          { id: "p6:nome", rotulo: "Nome da vista", tipo: "texto", valor: d.nome },
          { id: "p6:modelo", rotulo: "Modelo de vista", tipo: "lista", valor: v.modeloId || "", opcoes: [{ id: "", rotulo: "<Nenhum>" }].concat(mods.map(function (m) { return { id: m.id, rotulo: m.nome }; })) },
          { id: "p6:modelos", rotulo: "Modelos de vista", tipo: "botao", rotuloBotao: "Gerenciar modelos de vista…", fn: function () { self.abrirModelos(id); } },
          { id: "p6:duplicar", rotulo: "Vista", tipo: "botao", rotuloBotao: "Duplicar vista", fn: function () { self.duplicarVista(id); } }
        );
        if (/^d2v-/.test(id)) ide.params.push({ id: "p6:excluir", rotulo: "Vista", tipo: "botao", rotuloBotao: "Excluir esta vista", fn: function () { self.pedirExclusao(id); } });
      }
      out.titulo = d.nome;
      return out;
    },
    /* Propriedades da vista de DESENHO (não tem modelo: escala, detalhe, linhas) */
    propsDesenho: function (id, d) {
      var self = this, v = this.vistaObj(id, d), ef = this.efetivo(v, this.estado()), T = ef.travados || {};
      var n = Object.keys(obj(v.linhas2d)).length;
      var secoes = [
        { nome: "Gráficos", params: [
          T.escala ? { id: "escala", rotulo: "Escala", leitura: true, valor: "1:" + ef.escala }
                   : { id: "escala", rotulo: "Escala", tipo: "lista", valor: String(ef.escala), opcoes: ESCALAS.map(function (s) { return { id: String(s), rotulo: "1:" + s }; }) },
          { id: "p6:nd", rotulo: "Nível de detalhe", tipo: "lista", valor: ef.nivelDetalhe, opcoes: Object.keys(NIVEIS_DETALHE).map(function (k) { return { id: k, rotulo: NIVEIS_DETALHE[k] }; }) }
        ] },
        { nome: "Linhas de detalhe", params: [
          { id: "p6:linhas", rotulo: "Linhas", leitura: true, valor: n + (n === 1 ? " linha" : " linhas") },
          { id: "p6:desenhar", rotulo: "Linha", tipo: "botao", rotuloBotao: "Desenhar linhas (2 cliques)", fn: function () { self.armarPick(id, "linha"); } },
          { id: "p6:limpar", rotulo: "Limpar", tipo: "botao", rotuloBotao: "Apagar todas as linhas", fn: function () { v.linhas2d = {}; self.gravar(); self._redesenhar(id, true); self._repintarProps(); } }
        ] },
        { nome: "Identidade", params: [
          { id: "p6:nome", rotulo: "Nome da vista", tipo: "texto", valor: d.nome },
          { id: "p6:modelo", rotulo: "Modelo de vista", tipo: "lista", valor: v.modeloId || "", opcoes: [{ id: "", rotulo: "<Nenhum>" }].concat(this.modelos(this.estado(), "desenho").map(function (m) { return { id: m.id, rotulo: m.nome }; })) },
          { id: "p6:duplicar", rotulo: "Vista", tipo: "botao", rotuloBotao: "Duplicar vista", fn: function () { self.duplicarVista(id); } },
          { id: "p6:excluir", rotulo: "Vista", tipo: "botao", rotuloBotao: "Excluir esta vista", fn: function () { self.pedirExclusao(id); } }
        ] }
      ];
      var P = P2();
      return { daVista: true, semEditarTipo: true, titulo: d.nome, icone: "regua", secoes: secoes,
               onMudar: function (pid, valor) { if (P) P._mudar(id, pid, valor); return P ? P.props(id) : null; } };
    },
    /* Bim2D._mudar: devolve true quando a mudança é da P6 (e já foi aplicada) */
    mudar: function (id, pid, valor) {
      var P = P2(), d = P ? P.def(id) : null; if (!d) return false;
      var est = this.estado(), v = this.vistaObj(id, d); if (!v) return false;
      var ef = this.efetivo(v, est), T = ef.travados || {};
      function bloqueado(c) { if (!T[c]) return false; toast("Este parâmetro é controlado pelo modelo de vista “" + T[c] + "”. Tire o modelo (Modelo de vista: <Nenhum>) para mudar só nesta vista.", "aviso"); return true; }
      var m;
      if (pid === "escala") { if (bloqueado("escala")) return true; v.escala = Math.max(1, Math.round(num(valor, v.escala))); this.gravar(); this._redesenhar(id, false); return true; }
      if (pid === "p6:nd") { if (bloqueado("nivelDetalhe")) return true; if (NIVEIS_DETALHE[valor]) v.nivelDetalhe = valor; this.gravar(); this._redesenhar(id, false); return true; }
      if (pid === "p6:disc") { if (bloqueado("disciplina")) return true; if (DISCIPLINAS[valor]) v.disciplina = valor; this.gravar(); this._arvore(); return true; }
      if (pid === "p6:ev") { if (bloqueado("estiloVisual")) return true; if (ESTILOS_VISUAIS[valor]) v.estiloVisual = valor; this.gravar(); this._redesenhar(id, true); return true; }
      if (pid === "p6:modelo") {
        var mo = this.modelo(est, valor);
        this.vincularModelo(v, mo ? mo.id : null); this.gravar(); this._redesenhar(id, true);
        status(mo ? "Modelo de vista “" + mo.nome + "” ligado: os parâmetros dele ficam travados nesta vista." : "Vista sem modelo de vista: os parâmetros voltam a ser desta vista.");
        return true;
      }
      if (pid === "p6:nome") {
        var r = this.renomear(est, id, valor, this._nomesNativos().filter(function (n) { return n !== d.nome; }));
        if (!r.ok) { toast(r.erro, "aviso"); return true; }
        this.gravar(); this._renomearAba(id, r.nome); this._redesenhar(id, false); return true;
      }
      if ((m = /^p6:faixa:(sup|corte|inf|prof)$/.exec(pid))) {
        if (bloqueado("faixa")) return true;
        var f = clone(ef.faixa || this.normFaixa({ corte: d.altura, inf: -d.abaixo, prof: -d.abaixo, sup: 2.3 }, v.tipo));
        f[m[1]] = num(valor, f[m[1]]);
        var vf = this.validarFaixa(f, v.tipo);
        if (!vf.ok) { toast(vf.erro, "aviso"); return true; }
        v.faixa = vf.faixa; this.gravar(); this._redesenhar(id, true); return true;
      }
      if ((m = /^p6:rec:(ativo|visivel|x0|y0|x1|y1)$/.exec(pid))) {
        var rc = v.recorte || (v.recorte = { ativo: false, visivel: false, x0: 0, y0: 0, x1: 0, y1: 0 });
        if (m[1] === "ativo" || m[1] === "visivel") rc[m[1]] = !!valor; else rc[m[1]] = num(valor, rc[m[1]]);
        if (m[1] === "ativo" && rc.ativo && !(Math.abs(rc.x1 - rc.x0) > 0.01 && Math.abs(rc.y1 - rc.y0) > 0.01)) {
          var c = P._cache[id], cx = c && c.dados && D2() ? D2().caixa(c.dados) : null;
          if (cx) { var mg = 0.5; rc.x0 = r4(cx.x0 - mg); rc.y0 = r4(cx.y0 - mg); rc.x1 = r4(cx.x1 + mg); rc.y1 = r4(cx.y1 + mg); }
        }
        this.gravar(); this._redesenhar(id, true); return true;
      }
      /* parâmetros do Bim2D que, nas vistas P6, moram no objeto da vista */
      if (/^d2v-/.test(id)) {
        if ((pid === "prof" || pid === "inv") && v.linha) { v.linha[pid] = pid === "inv" ? !!valor : Math.max(0, num(valor, 0)); this.gravar(); this._redesenhar(id, true); this._redesenharPlantas(); return true; }
        if (pid === "altura" || pid === "abaixo") {
          var f2 = clone(ef.faixa || FAIXA_PADRAO[v.tipo] || FAIXA_PADRAO.planta);
          if (pid === "altura") f2.corte = num(valor, f2.corte); else { f2.inf = -Math.abs(num(valor, 0)); f2.prof = f2.inf; }
          v.faixa = this.normFaixa(f2, v.tipo); this.gravar(); this._redesenhar(id, true); return true;
        }
      }
      return false;
    },

    /* --- criar, duplicar, excluir ------------------------------------- */
    criar: function (tipo, campos) {
      var e = this.estado(), id = this.novoId(), v = this.normVista(assign(this.vistaPadrao(tipo), obj(campos), { id: id, tipo: tipo }));
      /* o modelo RA do tipo vem LIGADO (modelo aplicado às vistas novas) */
      if (!v.modeloId) { var mr = { forro: "ra-planta-forro", estrutural: "ra-planta-estrutural", elevacao: "ra-elevacao", chamada: "ra-detalhe", desenho: "ra-desenho" }[tipo]; if (mr && campos && campos.semModelo !== true) v.modeloId = mr; }
      v.nome = this.nomeUnico(e, v.nome || TIPOS[tipo], id, this._nomesNativos());
      e.vistas[id] = v;
      this.gravar();
      return v;
    },
    duplicarVista: function (id) {
      var P = P2(), d = P ? P.def(id) : null; if (!d) return null;
      var e = this.estado(), v = this.vistaObj(id, d), o = clone(v);
      if (/^d2p-/.test(id)) { o.tipo = "planta"; o.nivelId = d.nivel.id; if (!o.faixa) o.faixa = this.normFaixa({ corte: d.altura, inf: -d.abaixo, prof: -d.abaixo, sup: 2.3 }, "planta"); }
      if (/^d2c-/.test(id)) { o.tipo = "corte"; o.linha = { ax: d.corte.ax, az: d.corte.az, bx: d.corte.bx, bz: d.corte.bz, inv: !!d.corte.inv, prof: d.corte.prof || 0 }; }
      o.nome = d.nome;
      var nv = this.duplicar(e, o, this.novoId(), this._nomesNativos());
      if (nv.tipo === "corte" && P && D2()) nv.marca = this.proximaLetraCorte();
      e.vistas[nv.id] = nv; this.gravar();
      this._arvore();
      if (P) P.abrir(nv.id);
      status("Vista duplicada: “" + nv.nome + "”, com os mesmos parâmetros e V/G próprio.");
      return nv;
    },
    proximaLetraCorte: function () {
      var P = P2(), usadas = [];
      try { usadas = P.cortes().map(function (c) { return c.letra; }); } catch (e) { usadas = []; }
      var vs = this.estado().vistas; Object.keys(vs).forEach(function (k) { if (vs[k].tipo === "corte" && vs[k].marca) usadas.push(vs[k].marca); });
      return D2().proximaLetra(usadas);
    },
    excluir: function (id) {
      var e = this.estado(); if (!e.vistas[id]) return false;
      Object.keys(e.vistas).forEach(function (k) { if (e.vistas[k].paiId === id) delete e.vistas[k]; });
      delete e.vistas[id];
      this.gravar();
      return true;
    },
    pedirExclusao: function (id) {
      var self = this, v = this.estado().vistas[id]; if (!v) return;
      var fim = function () {
        try { if (self._G && self._G._bimVxAchar && self._G._bimVxAchar(id)) self._G._bimVxFechar(id); } catch (e) {}
        self.excluir(id); self._arvore(); self._redesenharPlantas(); toast("“" + v.nome + "” excluída.", "ok");
      };
      if (!global.UI || !global.UI.modal) { fim(); return; }
      global.UI.modal("Excluir a vista “" + escH(v.nome) + "”?", "<p>A vista e a marca dela saem. O modelo não muda.</p>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Excluir vista", classe: "danger", onClick: function () { global.UI.fecharModal(); fim(); } }
      ]);
    },

    /* --- V/G (Visibilidade/Sobreposição de gráficos) --------------------- */
    definirVG: function (id, catId, ov) {
      var P = P2(), d = P ? P.def(id) : null, v = this.vistaObj(id, d); if (!v) return false;
      var ef = this.efetivo(v, this.estado());
      if (ef.travados && ef.travados.vg) return false;
      var atual = obj(v.vg[catId]), novo = this.normOv(assign({}, atual, obj(ov)));
      if (novo) v.vg[catId] = novo; else delete v.vg[catId];
      this.gravar();
      this._redesenhar(id, true);
      return true;
    },
    definirFiltro: function (id, conjId, ov) {
      var P = P2(), d = P ? P.def(id) : null, v = this.vistaObj(id, d); if (!v) return false;
      var ef = this.efetivo(v, this.estado());
      if (ef.travados && ef.travados.filtros) return false;
      var novo = ov === null ? null : this.normOv(assign({}, obj(v.filtros[conjId]), obj(ov)));
      if (novo) v.filtros[conjId] = novo; else delete v.filtros[conjId];
      this.gravar(); this._redesenhar(id, true);
      return true;
    },
    /* as categorias que o diálogo mostra: as das peças abertas primeiro, depois as do OrçaPRO */
    categoriasVG: function (todas) {
      var D = this.dados(), cats = obj(D.estilos.categorias), self = this, presentes = {};
      try { arr(this._elementos ? this._elementos() : []).forEach(function (el) { presentes[self.categoriaDe(el && el.tipo, D.estilos)] = 1; }); } catch (e) {}
      return Object.keys(cats).filter(function (k) { return todas || presentes[k] || arr(cats[k].ifc).length; })
        .map(function (k) { return { id: k, nome: cats[k].nome, presente: !!presentes[k], estilo: cats[k] }; })
        .sort(function (a, b) { return (b.presente - a.presente) || a.nome.localeCompare(b.nome, "pt-BR"); });
    },
    abrirVG: function (id) {
      var self = this, P = P2(), d = P ? P.def(id) : null, v = this.vistaObj(id, d); if (!v || !global.UI || !global.UI.modal) return false;
      var ef = this.efetivo(v, this.estado()), trav = !!(ef.travados && ef.travados.vg), D = this.dados(), todas = !!this._vgTodas;
      var penas = '<option value="">Padrão</option>'; for (var i = 1; i <= 16; i++) penas += '<option value="' + i + '">' + i + "</option>";
      var pads = '<option value="">Padrão</option>' + Object.keys(obj(D.estilos.padroesLinha)).map(function (k) { return '<option value="' + k + '">' + escH(D.estilos.padroesLinha[k].nome) + "</option>"; }).join("");
      function sel(html, val) { return html.replace('value="' + val + '"', 'value="' + val + '" selected'); }
      var linhas = this.categoriasVG(todas).map(function (c) {
        var ov = obj(ef.vg[c.id]), vis = ov.visivel !== false, mt = ov.meioTom != null ? ov.meioTom : !!c.estilo.meioTom, dis = trav ? " disabled" : "";
        return '<tr data-vg-linha="' + c.id + '"><td>' + escH(c.nome) + (c.presente ? "" : ' <span class="muted">(sem peça)</span>') + "</td>" +
          '<td style="text-align:center"><input type="checkbox" data-vg-cat="' + c.id + '" data-vg="visivel"' + (vis ? " checked" : "") + dis + "></td>" +
          '<td style="text-align:center"><input type="checkbox" data-vg-cat="' + c.id + '" data-vg="meioTom"' + (mt ? " checked" : "") + dis + "></td>" +
          '<td><select data-vg-cat="' + c.id + '" data-vg="penaProj"' + dis + ">" + sel(penas, ov.penaProj || "") + "</select> <span class=\"muted\">(" + c.estilo.penaProj + ")</span></td>" +
          '<td><select data-vg-cat="' + c.id + '" data-vg="penaCorte"' + dis + ">" + sel(penas, ov.penaCorte || "") + "</select> <span class=\"muted\">(" + c.estilo.penaCorte + ")</span></td>" +
          '<td><select data-vg-cat="' + c.id + '" data-vg="padrao"' + dis + ">" + sel(pads, ov.padrao || "") + "</select></td></tr>";
      }).join("");
      var conj = []; try { conj = this._conjuntos ? arr(this._conjuntos()) : []; } catch (e) { conj = []; }
      var filtros = conj.length ? conj.map(function (c) {
        var ov = obj(ef.filtros[c.id]), dis = trav || (ef.travados && ef.travados.filtros) ? " disabled" : "";
        return '<tr><td>' + escH(c.nome) + '</td><td style="text-align:center"><input type="checkbox" data-vg-filtro="' + escH(c.id) + '" data-vg="usar"' + (ef.filtros[c.id] ? " checked" : "") + dis + '></td>' +
          '<td style="text-align:center"><input type="checkbox" data-vg-filtro="' + escH(c.id) + '" data-vg="visivel"' + (ov.visivel !== false ? " checked" : "") + dis + '></td>' +
          '<td style="text-align:center"><input type="checkbox" data-vg-filtro="' + escH(c.id) + '" data-vg="meioTom"' + (ov.meioTom ? " checked" : "") + dis + '></td>' +
          '<td><input type="color" data-vg-filtro="' + escH(c.id) + '" data-vg="cor" value="' + (ov.cor || c.cor || "#2563eb") + '"' + dis + "></td></tr>";
      }).join("") : '<tr><td colspan="5" class="muted">Nenhum conjunto de seleção nesta obra (Vista › Conjuntos). Filtro de vista usa um conjunto como regra.</td></tr>';
      var h = '<p class="muted" style="margin:0 0 8px">Vale <b>só para esta vista</b> (' + escH(d.nome) + "). Pena: índice da tabela RA (1 a 16, mm por escala); entre parênteses, a do estilo de objeto RA." +
        (trav ? " <b>Controlado pelo modelo de vista “" + escH(ef.travados.vg) + "”</b>: tire o modelo para mudar só aqui." : "") + "</p>" +
        '<div style="max-height:46vh;overflow:auto"><table class="tbl" data-vg-tabela="categorias" style="width:100%;font-size:12px"><thead><tr><th>Categoria do modelo</th><th>Visível</th><th>Meio-tom</th><th>Pena projeção</th><th>Pena corte</th><th>Padrão de linha</th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        '<label style="display:flex;gap:6px;align-items:center;margin:6px 0 10px;font-size:12px"><input type="checkbox" data-vg-todas' + (todas ? " checked" : "") + "> Mostrar todas as categorias (137)</label>" +
        '<h4 style="margin:6px 0">Filtros</h4><table class="tbl" data-vg-tabela="filtros" style="width:100%;font-size:12px"><thead><tr><th>Conjunto</th><th>Usar</th><th>Visível</th><th>Meio-tom</th><th>Cor</th></tr></thead><tbody>' + filtros + "</tbody></table>";
      var bg = global.UI.modal("Visibilidade/Sobreposição de gráficos — " + escH(d.nome), h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () { var box = document.querySelector("#modal-body") || document; if (!trav) self._lerVG(id, box); global.UI.fecharModal(); status("V/G desta vista aplicado."); } }
      ]);
      try {
        var t = (bg && bg.querySelector ? bg : document).querySelector("[data-vg-todas]");
        if (t) t.onchange = function () { self._vgTodas = this.checked; global.UI.fecharModal(); self.abrirVG(id); };
      } catch (e2) {}
      return true;
    },
    _lerVG: function (id, box) {
      var self = this, P = P2(), d = P ? P.def(id) : null, v = this.vistaObj(id, d); if (!v) return;
      var cats = {}, D = this.dados();
      [].forEach.call(box.querySelectorAll("[data-vg-cat]"), function (el) {
        var c = el.getAttribute("data-vg-cat"), k = el.getAttribute("data-vg"), o = cats[c] || (cats[c] = {});
        o[k] = el.type === "checkbox" ? el.checked : el.value;
      });
      Object.keys(cats).forEach(function (c) {
        var base = obj(obj(D.estilos.categorias)[c]), o = cats[c], ov = {};
        if (o.visivel === false) ov.visivel = false;
        if (o.meioTom !== undefined && !!o.meioTom !== !!base.meioTom) ov.meioTom = !!o.meioTom;
        if (o.penaProj) ov.penaProj = +o.penaProj; if (o.penaCorte) ov.penaCorte = +o.penaCorte; if (o.padrao) ov.padrao = o.padrao;
        var n = self.normOv(ov); if (n) v.vg[c] = n; else delete v.vg[c];
      });
      var fl = {};
      [].forEach.call(box.querySelectorAll("[data-vg-filtro]"), function (el) {
        var f = el.getAttribute("data-vg-filtro"), k = el.getAttribute("data-vg"), o = fl[f] || (fl[f] = {});
        o[k] = el.type === "checkbox" ? el.checked : el.value;
      });
      Object.keys(fl).forEach(function (f) {
        if (!fl[f].usar) { delete v.filtros[f]; return; }
        v.filtros[f] = self.normOv({ visivel: fl[f].visivel !== false, meioTom: !!fl[f].meioTom, cor: fl[f].cor }) || { visivel: true };
      });
      this.gravar();
      this._redesenhar(id, true);
    },

    /* --- modelos de vista (diálogo) ------------------------------------ */
    abrirModelos: function (id) {
      var self = this, est = this.estado(), P = P2(), d = id && P ? P.def(id) : null, v = d ? this.vistaObj(id, d) : null;
      if (!global.UI || !global.UI.modal) return false;
      var L = this.modelos(est, null);
      var linhas = L.map(function (m) {
        var campos = Object.keys(m.campos).filter(function (c) { return m.campos[c]; }).map(function (c) { return CAMPOS[c].nome; }).join(", ");
        var vals = [m.valores.escala ? "1:" + m.valores.escala : "", m.valores.nivelDetalhe ? NIVEIS_DETALHE[m.valores.nivelDetalhe] : ""].filter(Boolean).join(" · ");
        var serve = v && self.modelos(est, v.tipo).some(function (x) { return x.id === m.id; });
        return '<tr><td><b>' + escH(m.nome) + "</b>" + (m.ra ? ' <span class="muted">(RA)</span>' : "") + '<br><span class="muted" style="font-size:11px">' + escH(TIPOS[m.tipoVista]) + " · " + escH(vals) + "</span></td>" +
          '<td style="font-size:11px">' + escH(campos) + "</td><td style=\"white-space:nowrap\">" +
          (serve ? '<button class="btn btn-sm" data-mv-ligar="' + escH(m.id) + '">Ligar à vista</button> <button class="btn btn-sm" data-mv-aplicar="' + escH(m.id) + '">Aplicar uma vez</button>' : '<span class="muted" style="font-size:11px">outro tipo de vista</span>') +
          (m.ra ? "" : ' <button class="btn btn-sm" data-mv-excluir="' + escH(m.id) + '">Excluir</button>') + "</td></tr>";
      }).join("");
      var h = '<p class="muted" style="margin:0 0 8px"><b>Ligar</b> = os parâmetros do modelo ficam travados na vista (o "Modelo de vista"). <b>Aplicar uma vez</b> = copia e solta (o "Aplicar propriedades do modelo"). Os modelos RA seguem o Padrão RA de detalhamento.</p>' +
        '<div style="max-height:50vh;overflow:auto"><table class="tbl" style="width:100%;font-size:12px"><thead><tr><th>Modelo</th><th>Controla</th><th></th></tr></thead><tbody>' + linhas + "</tbody></table></div>";
      var botoes = [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }];
      if (v) botoes.push({ texto: "Criar modelo desta vista…", onClick: function () {
        var nome = global.prompt ? global.prompt("Nome do modelo de vista:", d.nome + " (modelo)") : d.nome + " (modelo)";
        if (!nome) return;
        var m = self.modeloDaVista(self.efetivo(v, est), nome, "mv-" + Date.now().toString(36));
        est.modelos[m.id] = m; self.gravar(); global.UI.fecharModal(); self.abrirModelos(id);
        toast("Modelo de vista “" + m.nome + "” criado a partir desta vista.", "ok");
      } });
      var bg = global.UI.modal("Modelos de vista", h, botoes);
      var raiz = bg && bg.querySelector ? bg : document;
      [].forEach.call(raiz.querySelectorAll("[data-mv-ligar],[data-mv-aplicar],[data-mv-excluir]"), function (b) {
        b.onclick = function () {
          var mid = b.getAttribute("data-mv-ligar") || b.getAttribute("data-mv-aplicar") || b.getAttribute("data-mv-excluir"), m = self.modelo(est, mid);
          if (b.hasAttribute("data-mv-excluir")) {
            delete est.modelos[mid];
            Object.keys(est.vistas).forEach(function (k) { if (est.vistas[k].modeloId === mid) est.vistas[k].modeloId = null; });
            self.gravar(); global.UI.fecharModal(); self.abrirModelos(id); return;
          }
          if (!m || !v) return;
          if (b.hasAttribute("data-mv-ligar")) self.vincularModelo(v, m.id); else { self.aplicarModelo(v, m); }
          self.gravar(); global.UI.fecharModal(); self._redesenhar(id, true); self._repintarProps();
          status(b.hasAttribute("data-mv-ligar") ? "Modelo “" + m.nome + "” ligado a " + d.nome + "." : "Propriedades de “" + m.nome + "” aplicadas a " + d.nome + " (sem ligar).");
        };
      });
      return true;
    },
    /* Gerenciar › Estilos de objeto (leitura da tabela RA) */
    abrirEstilos: function () {
      if (!global.UI || !global.UI.modal) return false;
      var D = this.dados(), cats = obj(D.estilos.categorias), mm = function (n) { var P = D2() && D2().P6; return P ? String(P.penaMm(D.penas, n, 50)).replace(".", ",") : ""; };
      var linhas = Object.keys(cats).map(function (k) {
        var c = cats[k];
        return "<tr><td>" + escH(c.nome) + "</td><td>" + c.penaProj + ' <span class="muted">(' + mm(c.penaProj) + " mm)</span></td><td>" + c.penaCorte + ' <span class="muted">(' + mm(c.penaCorte) + " mm)</span></td><td>" +
          escH(obj(obj(D.estilos.padroesLinha)[c.padraoLinha]).nome || c.padraoLinha) + "</td><td>" + escH(obj(obj(D.estilos.preenchimentos)[c.preenchimento]).nome || "") + "</td></tr>";
      }).join("");
      var penas = (D.penas.escalas || []).map(function (s) { return "<tr><td>1:" + s + "</td>" + arr(D.penas.tabela[String(s)]).map(function (x) { return "<td>" + String(x).replace(".", ",") + "</td>"; }).join("") + "</tr>"; }).join("");
      var cab = ""; for (var i = 1; i <= 16; i++) cab += "<th>" + i + "</th>";
      global.UI.modal("Estilos de objeto RA", '<p class="muted" style="margin:0 0 8px">Padrão RA de detalhamento (NBR 6492 e NBR 8403): pena de projeção e de corte por categoria (mm a 1:50 entre parênteses). Vale em todas as vistas; a Visibilidade/Sobreposição de cada vista muda só nela.</p>' +
        '<div style="max-height:36vh;overflow:auto"><table class="tbl" style="width:100%;font-size:12px"><thead><tr><th>Categoria</th><th>Projeção</th><th>Corte</th><th>Padrão de linha</th><th>Preenchimento</th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        '<h4 style="margin:10px 0 4px">Penas (mm de papel)</h4><div style="overflow:auto"><table class="tbl" style="font-size:11px"><thead><tr><th>Escala</th>' + cab + "</tr></thead><tbody>" + penas + "</tbody></table></div>",
        [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]);
      return true;
    },
    abrirOrganizacao: function () {
      var self = this, N = NAV(); if (!N || !global.UI || !global.UI.modal) return false;
      var at = N.organizacao();
      var h = '<p class="muted" style="margin:0 0 10px">Organização do navegador: agrupa as vistas do Navegador de projeto. Fica guardado neste aparelho.</p>' +
        Object.keys(N.ORGANIZACOES).map(function (k) { return '<label style="display:flex;gap:8px;align-items:center;padding:5px 0"><input type="radio" name="p6-org" value="' + k + '"' + (k === at ? " checked" : "") + "> " + escH(N.ORGANIZACOES[k]) + "</label>"; }).join("");
      global.UI.modal("Organização do navegador", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () { var r = document.querySelector('input[name="p6-org"]:checked'); global.UI.fecharModal(); if (r) { N.definirOrganizacao(r.value); self._arvore(); status("Navegador organizado: " + N.ORGANIZACOES[r.value] + "."); } } }
      ]);
      return true;
    },

    /* --- clique na vista 2D (ferramentas P6: recorte, chamada, linha de desenho, elevação interior) */
    _pick: null,
    armarPick: function (id, modo) {
      var P = P2(); if (!P || !P._cache[id] || !P._cache[id].el) { toast("Abra a vista primeiro.", "aviso"); return false; }
      this._pick = { id: id, modo: modo, pts: [] };
      P._cache[id].el.setAttribute("data-d2-pick", "1");
      var dica = { recorte: "Região de recorte: clique dois cantos.", chamada: "Chamada de detalhe: clique dois cantos da região.", linha: "Linha de detalhe: clique o início e o fim (Esc encerra).", interior: "Elevação interior: clique dentro do cômodo, perto da parede que quer ver." }[modo];
      status(dica + " Esc cancela.");
      var self = this;
      if (!this._esc && typeof document !== "undefined") {
        this._esc = function (ev) { if (ev.key === "Escape" && self._pick) { self.cancelarPick(); ev.stopPropagation(); } };
        document.addEventListener("keydown", this._esc, true);
      }
      return true;
    },
    cancelarPick: function () {
      var P = P2(), pk = this._pick; if (!pk) return;
      try { if (P && P._cache[pk.id] && P._cache[pk.id].el) P._cache[pk.id].el.removeAttribute("data-d2-pick"); } catch (e) {}
      this._pick = null; status("Ferramenta encerrada.");
    },
    /* gancho no pointerdown do Bim2D: true = o clique era da P6 */
    clique2d: function (id, ev, pt) {
      var pk = this._pick; if (!pk || pk.id !== id || !pt || (ev && ev.button !== 0)) return false;
      pk.pts.push(pt);
      var P = P2();
      if (pk.modo === "interior") { this.cancelarPick(); if (P && P.criarElevacaoInterior) P.criarElevacaoInterior(id, pt); return true; }
      if (pk.pts.length < 2) { status("Agora o segundo ponto."); return true; }
      var a = pk.pts[0], b = pk.pts[1];
      if (pk.modo === "linha") {
        var v = this.estado().vistas[id];
        if (v) { v.linhas2d = v.linhas2d || {}; v.linhas2d["l" + Date.now().toString(36) + Math.floor(Math.random() * 1e3)] = { x1: r4(a[0]), y1: r4(a[1]), x2: r4(b[0]), y2: r4(b[1]), pena: 3 }; this.gravar(); this._redesenhar(id, true); this._repintarProps(); }
        pk.pts = [b]; status("Linha gravada. Próximo ponto (Esc encerra)."); return true;
      }
      this.cancelarPick();
      if (Math.abs(b[0] - a[0]) < 0.1 || Math.abs(b[1] - a[1]) < 0.1) { toast("Região pequena demais: clique dois cantos mais afastados.", "aviso"); return true; }
      if (pk.modo === "recorte") {
        var vv = this.vistaObj(id, P.def(id));
        vv.recorte = { ativo: true, visivel: true, x0: r4(Math.min(a[0], b[0])), y0: r4(Math.min(a[1], b[1])), x1: r4(Math.max(a[0], b[0])), y1: r4(Math.max(a[1], b[1])) };
        this.gravar(); this._redesenhar(id, true); this._repintarProps(); status("Região de recorte definida."); return true;
      }
      if (pk.modo === "chamada" && P && P.criarChamada) P.criarChamada(id, { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });
      return true;
    },

    /* --- fita (prévia do modelador) --------------------------------------- */
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this, R = global.BimRibbon;
      this.carregarDados();
      R.acrescentar("vista", "Vista", "Criar", [
        { id: "elevacao-vista", rotulo: "Elevação", icone: "casa", grande: true, dica: "Elevação da construção (Norte, Sul, Leste, Oeste): a marca fica na planta, a vista abre numa aba e entra no Navegador › Elevações." },
        { id: "elevacao-interior", rotulo: "Elevação\ninterior", icone: "casa", dica: "Clique dentro do cômodo, perto da parede: a elevação interior olha para ela, recortada pelas paredes do cômodo." },
        { id: "planta-forro", rotulo: "Planta\nde forro", icone: "planta", dica: "Planta de forro refletido do nível de trabalho: corte a 2,30 m olhando para CIMA, desenhada como a planta (o forro, as vigas e a laje acima)." },
        { id: "planta-estrutural", rotulo: "Planta\nestrutural", icone: "estrutura", dica: "Planta estrutural (fôrma) do nível de trabalho, com o modelo de vista Planta Estrutural RA: sem mobiliário, portas e instalações; paredes em meio-tom." },
        { id: "chamada-detalhe", rotulo: "Chamada de\ndetalhe", icone: "alvo", dica: "Desenhe um retângulo na planta ou no corte: a região vira uma vista de detalhe em escala maior (1:20), com a marca na vista-mãe." },
        { id: "vista-desenho", rotulo: "Vista de\ndesenho", icone: "regua", dica: "Vista de desenho: um papel em branco em escala, para detalhe típico com linhas de detalhe (sem o modelo)." },
        { id: "duplicar-vista", rotulo: "Duplicar\nvista", icone: "copiar", dica: "Duplica a vista 2D ativa com os mesmos parâmetros e V/G próprio." }
      ]);
      R.acrescentar("vista", "Vista", "Gráficos", [
        { id: "modelos-vista", rotulo: "Modelos\nde vista", icone: "camadas", dica: "Modelos de vista RA (planta arquitetônica, forro, estrutural, fundação, elevação, corte, detalhe, desenho): ligar à vista trava os parâmetros." },
        { id: "vg-vista", rotulo: "Visibilidade/\nGráficos", icone: "olho", dica: "Visibilidade/Sobreposição de gráficos (VV): mostrar, meio-tom, pena e padrão por categoria e por filtro — só nesta vista." },
        { id: "estilos-objeto", rotulo: "Estilos de\nobjeto", icone: "pincel", dica: "Estilos de objeto RA: a pena de projeção e de corte de cada categoria, o padrão de linha e o preenchimento por material (Padrão RA de detalhamento)." },
        { id: "navegador-org", rotulo: "Organizar\nnavegador", icone: "lista", dica: "Organização do navegador: vistas por tipo, por disciplina ou por nível." }
      ]);
      function ativa2d() {
        var g = self._G, st = g && g._bimVxEst ? g._bimVxEst() : null, P = P2();
        return st && P && P.ehVista2d(st.ativa) ? st.ativa : null;
      }
      function plantaTrabalho() {
        var a = ativa2d(), P = P2(), d = a && P ? P.def(a) : null;
        if (d && d.tipo === "planta" && d.nivel) return d.nivel;
        try { var pid = self._G && self._G._d2PlantaPadrao ? self._G._d2PlantaPadrao() : null, dp = pid ? P.def(pid) : null; return dp ? dp.nivel : null; } catch (e) { return null; }
      }
      reg["elevacao-vista"] = function () { self.escolherElevacao(); return true; };
      reg["elevacao-interior"] = function () {
        var a = ativa2d(), P = P2(), d = a ? P.def(a) : null;
        if (!d || d.tipo !== "planta") { var pid = self._G && self._G._d2PlantaPadrao ? self._G._d2PlantaPadrao() : null; if (!pid) { toast("Abra um modelo primeiro.", "aviso"); return true; } self._G._d2Abrir(pid, (P.def(pid) || {}).nome || "Planta baixa"); a = pid; }
        self.armarPick(a, "interior"); return true;
      };
      reg["planta-forro"] = function () { var nv = plantaTrabalho(); if (!nv) { toast("Abra um modelo primeiro: a planta de forro é cortada dele.", "aviso"); return true; } P2().criarPlantaP6("forro", nv); return true; };
      reg["planta-estrutural"] = function () { var nv = plantaTrabalho(); if (!nv) { toast("Abra um modelo primeiro.", "aviso"); return true; } P2().criarPlantaP6("estrutural", nv); return true; };
      reg["chamada-detalhe"] = function () {
        var a = ativa2d(), P = P2(), d = a ? P.def(a) : null;
        if (!d || d.tipo === "desenho") { toast("Abra uma planta, corte ou elevação 2D e use a Chamada de detalhe nela.", "aviso"); return true; }
        self.armarPick(a, "chamada"); return true;
      };
      reg["vista-desenho"] = function () { P2().criarDesenhoP6(); return true; };
      reg["duplicar-vista"] = function () { var a = ativa2d(); if (!a) { toast("Ative uma vista 2D (planta, corte, elevação) para duplicar.", "aviso"); return true; } self.duplicarVista(a); return true; };
      reg["modelos-vista"] = function () { self.abrirModelos(ativa2d()); return true; };
      reg["vg-vista"] = function () { var a = ativa2d(); if (!a) { toast("A Visibilidade/Gráficos por vista vale nas vistas 2D: abra uma planta, corte ou elevação.", "aviso"); return true; } self.abrirVG(a); return true; };
      reg["estilos-objeto"] = function () { self.abrirEstilos(); return true; };
      reg["navegador-org"] = function () { self.abrirOrganizacao(); return true; };
      try { if (global.BimPrecisao && global.BimPrecisao.ATALHOS && !global.BimPrecisao.ATALHOS.VV) global.BimPrecisao.ATALHOS.VV = "vg-vista"; } catch (eA) {}
      this._registrarRamos();
      return true;
    },
    escolherElevacao: function () {
      var P = P2(); if (!P || !global.UI || !global.UI.modal) return false;
      var rot = { norte: "Norte", sul: "Sul", leste: "Leste", oeste: "Oeste" };
      function criar(lista) { global.UI.fecharModal(); var ult = null; lista.forEach(function (dir) { ult = P.criarElevacao(dir, { abrir: false }) || ult; }); if (ult) P.abrir(ult.id); }
      global.UI.modal("Elevação", '<p class="muted" style="margin:0">A marca fica fora do modelo, olhando para ele; a vista abre numa aba e entra em Navegador › Elevações. Norte = para cima na planta.</p>',
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }].concat(Object.keys(rot).map(function (k) { return { texto: rot[k], onClick: function () { criar([k]); } }; }))
          .concat([{ texto: "As quatro", classe: "primary", onClick: function () { criar(["norte", "leste", "oeste", "sul"]); } }]));
      return true;
    },

    /* --- Navegador: o ramo "Vistas" (registro de ramos) ---- */
    _registrarRamos: function () {
      var N = NAV(), self = this; if (!N || this._ramosOk) return;
      this._ramosOk = true;
      N.registrar({ id: "vistas", montar: function (ctx) { return self.ativo() ? self.ramoVistas(ctx) : null; } });
      N.registrar({ id: "legendas", depois: "vistas", montar: function () {
        return self.ativo() ? { id: "legendas", rotulo: "Legendas", icone: "lista", aberto: false, filhos: [{ id: "leg:vazio", rotulo: "Nenhuma — chegam com a anotação (P7); use uma vista de desenho", icone: "regua", fn: function () { var P = P2(); if (P) P.criarDesenhoP6(); } }] } : null;
      } });
      N.registrar({ id: "fam", montar: function () { return self.ativo() ? self.ramoFamilias() : null; } });
      N.registrar({ id: "grupos", depois: "fam", montar: function () {
        return self.ativo() ? { id: "grupos", rotulo: "Grupos", icone: "camadas", aberto: false, filhos: [{ id: "grp:vazio", rotulo: "Nenhum — grupos chegam na P10; conjuntos de seleção em Vista › Conjuntos", icone: "camadas", acao: "conjuntos" }] } : null;
      } });
    },
    /* itens de vista 2D desta obra (nativas + P6), com o que a organização usa */
    itensVistas: function () {
      var P = P2(), est = this.estado(), out = [], self = this; if (!P) return out;
      var NV = []; try { NV = P.niveis(); } catch (e) { NV = []; }
      NV.forEach(function (n) { var id = P.idPlanta(n.id), v = est.vistas[id]; out.push({ id: id, tipo: "planta", nome: (v && v.nome) || "Planta baixa — " + n.nome, disciplina: v ? v.disciplina : "arquitetura", nivel: n.nome, icone: "planta" }); });
      var CS = []; try { CS = P.cortes(); } catch (e2) { CS = []; }
      CS.forEach(function (c) { var id = P.idCorte(c.id), v = est.vistas[id]; out.push({ id: id, tipo: "corte", nome: (v && v.nome) || "Corte " + c.letra, disciplina: v ? v.disciplina : "arquitetura", icone: "corte" }); });
      Object.keys(est.vistas).forEach(function (k) {
        if (!/^d2v-/.test(k)) return;
        var v = est.vistas[k], nv = NV.filter(function (n) { return String(n.id) === String(v.nivelId); })[0];
        out.push({ id: k, tipo: v.tipo, nome: v.nome, disciplina: self.efetivo(v, est).disciplina, nivel: nv ? nv.nome : "", interior: !!v.interior,
                   icone: { forro: "planta", estrutural: "estrutura", elevacao: "casa", corte: "corte", chamada: "alvo", desenho: "regua" }[v.tipo] || "planta" });
      });
      return out;
    },
    ramoVistas: function (ctx) {
      var self = this, G = (ctx && ctx.G) || this._G, N = NAV(), org = N ? N.organizacao() : "tipo";
      var nos = this.arvoreVistas(this.itensVistas(), org);
      (function ligar(L) { L.forEach(function (n) { if (n.vistaId) { var vid = n.vistaId, nm = n.rotulo; n.fn = function () { if (G && G._d2Abrir) G._d2Abrir(vid, nm); }; } if (n.filhos) ligar(n.filhos); }); })(nos);
      /* as ações de criar, dentro do grupo de cada tipo (e um grupo "Criar vista" com todas) */
      var criar = { id: "p6:criar", rotulo: "+ Criar vista", icone: "mais", aberto: false, filhos: [
        { id: "p6:c:elev", rotulo: "+ Elevação (N, S, L, O)", icone: "casa", fn: function () { self.escolherElevacao(); } },
        { id: "p6:c:forro", rotulo: "+ Planta de forro", icone: "planta", fn: function () { try { global.BimShell.executar("planta-forro"); } catch (e) {} } },
        { id: "p6:c:estr", rotulo: "+ Planta estrutural", icone: "estrutura", fn: function () { try { global.BimShell.executar("planta-estrutural"); } catch (e) {} } },
        { id: "p6:c:corte", rotulo: "+ Corte (traçar na planta)", icone: "corte", fn: function () { try { global.BimShell.executar("corte-2d"); } catch (e) {} } },
        { id: "p6:c:des", rotulo: "+ Vista de desenho", icone: "regua", fn: function () { var P = P2(); if (P) P.criarDesenhoP6(); } }
      ] };
      var v3d = { id: "v3d", rotulo: "Vistas 3D", icone: "quadrado", filhos: arr(ctx && ctx.v3d) };
      var filhos = nos.concat([v3d]);
      if (ctx && ctx.pontosDeVista) filhos.push(ctx.pontosDeVista);
      filhos.push(criar);
      return { id: "vistas", rotulo: "Vistas (" + (N ? N.ORGANIZACOES[org] : "todas") + ")", icone: "planta", filhos: filhos };
    },
    ramoFamilias: function () {
      var lista = [], porCat = {}, ordem = [];
      try { var FR = global.FamiliasRA; lista = FR && FR.lista ? arr(FR.lista()) : []; } catch (e) { lista = []; }
      var F = global.Familia, nomes = (F && F.CATEGORIAS) || {};
      lista.forEach(function (f) { var c = f.categoria || "generico"; if (!porCat[c]) { porCat[c] = []; ordem.push(c); } porCat[c].push(f); });
      var filhos = ordem.sort().map(function (c) {
        var rot = typeof nomes[c] === "string" ? nomes[c] : (nomes[c] && nomes[c].rotulo) || (c.charAt(0).toUpperCase() + c.slice(1));
        return { id: "famc:" + c, rotulo: rot, icone: "familia", n: porCat[c].length, aberto: false,
                 filhos: porCat[c].map(function (f) { return { id: "fam:" + f.id, rotulo: f.nome, icone: "familia", acao: "familias-param" }; }) };
      });
      if (!filhos.length) return { id: "fam", rotulo: "Famílias", icone: "tabela", acao: "familias" };
      filhos.push({ id: "fam:bib", rotulo: "Abrir a biblioteca de famílias…", icone: "familia", acao: "familias-param" });
      return { id: "fam", rotulo: "Famílias", icone: "tabela", aberto: false, filhos: filhos };
    },

    /* --- utilidades da tela ---------------------------------------------- */
    _redesenhar: function (id, recalcular) { var P = P2(); if (!P || !P._cache[id]) return; try { if (recalcular) P.atualizar(id); else P.redesenhar(id, false); } catch (e) {} },
    _redesenharAbertas: function (recalcular) { var P = P2(), self = this; if (!P) return; Object.keys(P._cache || {}).forEach(function (k) { self._redesenhar(k, recalcular); }); },
    _redesenharPlantas: function () { var P = P2(); if (!P) return; Object.keys(P._cache || {}).forEach(function (k) { var d = P.def(k); if (d && d.tipo === "planta") { try { P.redesenhar(k, false); } catch (e) {} } }); },
    _arvore: function () { try { if (this._G && this._G._nivArvore) this._G._nivArvore(); } catch (e) {} },
    _repintarProps: function () { try { if (global.BimShell && global.BimShell.repintarVista) global.BimShell.repintarVista(); } catch (e) {} },
    _renomearAba: function (id, nome) {
      var G = this._G; if (!G) return;
      try {
        var v = G._bimVxAchar && G._bimVxAchar(id); if (v) v.nome = nome;
        var t = G._bimVxTela && G._bimVxTela(id), r = t ? t.querySelector(".bim-tela-rot") : null; if (r) r.textContent = nome;
        if (G._bimVxDocs) G._bimVxDocs();
      } catch (e) {}
      this._arvore();
    }
  };

  global.BimModeloVista = BimModeloVista;
  if (typeof module !== "undefined" && module.exports) module.exports = BimModeloVista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
