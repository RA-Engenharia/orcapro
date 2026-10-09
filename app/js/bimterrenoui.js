/* =====================================================================
 * bimterrenoui.js — a TELA do TERRENO E IMPLANTAÇÃO (P11, prévia
 * `?previa=modelador`). O motor é o js/bimterreno.js (puro).
 *
 * O QUE ESTÁ AQUI
 *   · A FITA: aba "Massa e terreno" (Ribbon.acrescentar — só com a prévia),
 *     painéis "Modelar terreno" (Topossólido por pontos, Curvas do DXF,
 *     Pontos CSV, Sub-região, Rotular curvas), "Terraplenagem"
 *     (Plataforma) e "Implantação" (Linha de divisa, Norte e local,
 *     Componente de terreno). Quem chama `registrar` e `esquema` é o
 *     js/bimarqui.js (ganchos "P11").
 *   · AS FERRAMENTAS (cliques no 3D; quem entrega o clique é o js/bim.js,
 *     gancho "P11" → S._p11 = montar3d(...)): pontos cotados (Enter cria o
 *     topossólido), contornos (plataforma, sub-região, divisa — fecha no 1º
 *     ponto ou Enter), a linha que rotula as curvas (dois cliques) e o
 *     componente (um clique, pousa no terreno). Esc cancela.
 *   · O DESENHO: o topossólido (malha indexada — a malha mesclada só leva
 *     malha com índice), as sub-regiões por cima, a plataforma (placa na cota
 *     e as "saias" de corte/aterro na borda), a divisa e os componentes;
 *     as curvas de nível em linha (sobreposição, fora do modelo).
 *   · A PLANTA 2D (js/bim2dui.js, gancho "P11"): curvas (mestras e
 *     intermediárias), rótulos, divisa com rumos, plataforma, sub-regiões e
 *     a seta do norte verdadeiro — no menor nível da obra.
 *   · AS PROPRIEDADES: as da peça vêm do REGISTRO (js/bimparam.js, P1-C);
 *     aqui o bloco extra da plataforma (composição de corte e de aterro —
 *     SINAPI de movimento de terra pela regra do mapa, NUNCA escolhida
 *     sozinha) e a IMPLANTAÇÃO (norte verdadeiro, latitude/longitude ligadas
 *     ao LOCAL DA OBRA do içamento).
 *   · A SONDAGEM da obra (Gestao, bim_sondagens) vai para o motor pela
 *     `BimTerreno.fonteSondagem` — o corte se reparte pelas camadas.
 *
 * Sem a prévia NADA daqui roda: `registrar` e `montar3d` saem na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function M() { return global.BimTerreno || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function num(v, d) { var x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; }
  function ro(id, rot, v, dica) { var o = { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; if (dica) o.dica = dica; return o; }
  function B() { return global.BIM || null; }
  function estado() { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; }
  function toast(m, t) { try { if (global.UI && UI.toast) UI.toast(m, t || "ok"); } catch (e) {} }

  var SUBS = { "p11-topo": 1, "p11-plataforma": 1, "p11-subregiao": 1, "p11-divisa": 1, "p11-rotular": 1, "p11-comp": 1 };
  var CONTORNO = { "p11-plataforma": 1, "p11-subregiao": 1, "p11-divisa": 1 };
  var ROT = { "p11-topo": "Topossólido por pontos", "p11-plataforma": "Plataforma", "p11-subregiao": "Sub-região", "p11-divisa": "Linha de divisa", "p11-rotular": "Rotular curvas", "p11-comp": "Componente de terreno" };
  /* a ferramenta: cota do próximo ponto, deslocamento da plataforma, material… */
  var cfg = { cota: 0, espessura: 1, passo: 1, desloc: 0, material: "Grama", comp: "arvore", alturaComp: null };
  /* cor do material (desenho; não é dado de projeto) */
  var COR = { terra: 0x9c8461, grama: 0x6f9a48, brita: 0x9aa0a6, asfalto: 0x4b4f55, concreto: 0xb9b9b4, areia: 0xd9c48d, agua: 0x5d93c4 };
  function corDe(mat) { var k = txt(mat).toLowerCase().normalize ? txt(mat).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : txt(mat).toLowerCase(); for (var c in COR) if (k.indexOf(c) >= 0) return COR[c]; return COR.terra; }

  var BimTerrenoUI = {
    ativo: previa,
    SUBS: SUBS,
    cfg: function () { return JSON.parse(JSON.stringify(cfg)); },
    _api: null, _arqui: null,

    /* ============================================================ FITA */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !M() || !reg) return false;
      this._arqui = arqui || null;
      var self = this;
      R.acrescentar("massa-terreno", "Massa e terreno", "Modelar terreno", [
        { id: "p11-topo", rotulo: "Topossólido", icone: "planta", grande: true, tipo: "alterna", dica: "Sólido topográfico por PONTOS cotados: clique cada ponto (a cota está em Propriedades) e Enter. Triangulação de Delaunay, curvas de nível, área projetada, área da superfície e volume." },
        { id: "p11-dxf", rotulo: "Curvas do\nDXF", icone: "importar", grande: true, dica: "Topossólido a partir da importação: as curvas de nível (ou pontos cotados) de um DXF de levantamento viram o terreno — cada vértice com a cota (z) do arquivo." },
        { id: "p11-csv", rotulo: "Pontos do\nlevantamento", icone: "tabela", grande: true, dica: "Pontos cotados em CSV/TXT (P N E Z, N E Z…), o mesmo leitor do relevo do içamento." },
        { id: "p11-subregiao", rotulo: "Sub-região", icone: "area", grande: true, tipo: "alterna", dica: "Sub-região do terreno (grama, brita, pavimento): clique o contorno e Enter — área projetada e área da superfície no quantitativo." },
        { id: "p11-rotular", rotulo: "Rotular\ncurvas", icone: "nota", grande: true, tipo: "alterna", dica: "Dois cliques traçam a linha; cada curva de nível que ela cruza ganha a cota." }
      ], "anotar");
      R.acrescentar("massa-terreno", "Massa e terreno", "Terraplenagem", [
        { id: "p11-plataforma", rotulo: "Plataforma", icone: "corte", grande: true, tipo: "alterna", dica: "Plataforma (região classificada): o contorno na cota do nível + deslocamento. CORTE e ATERRO exatos pelos prismas da triangulação, no quantitativo e no Orçamento do modelo (a composição de movimento de terra você escolhe; sem ela, a linha fica pendente com o volume)." }
      ]);
      R.acrescentar("massa-terreno", "Massa e terreno", "Implantação", [
        { id: "p11-divisa", rotulo: "Linha de\ndivisa", icone: "regua", grande: true, tipo: "alterna", dica: "Linha de propriedade (o lote): clique os vértices e Enter — área do lote, perímetro e a tabela de rumos e distâncias pelo norte verdadeiro." },
        { id: "p11-norte", rotulo: "Norte e\nlocal", icone: "sol", grande: true, dica: "Norte do projeto × norte verdadeiro e as coordenadas (latitude, longitude, elevação) — ligado ao local da obra do Içamento. Vai para o IFC (IfcSite e TrueNorth)." },
        { id: "p11-comp", rotulo: "Componente\nde terreno", icone: "alvo", grande: true, tipo: "alterna", dica: "Árvore, arbusto, poste, banco, carro, lixeira — pousa na superfície do terreno." }
      ]);
      ["p11-topo", "p11-subregiao", "p11-rotular", "p11-plataforma", "p11-divisa", "p11-comp"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      function ferr(sub) {
        return function (e) {
          if (e && e.ligado === false) { var b = B(); if (b && b.editarArmar) b.editarArmar(null); return true; }
          return arqui && arqui.armar ? arqui.armar(sub) : (B() && B().editarArmar ? B().editarArmar(sub) : false);
        };
      }
      Object.keys(SUBS).forEach(function (k) { reg[k] = ferr(k); });
      reg["p11-dxf"] = function () { self.escolherArquivo("dxf"); return true; };
      reg["p11-csv"] = function () { self.escolherArquivo("csv"); return true; };
      reg["p11-norte"] = function () { try { if (global.BimShell) BimShell.pintarProps(self.esquemaImplantacao()); } catch (e) {} return true; };
      /* a sondagem da obra (Gestao) para o motor: o corte reparte pelas camadas */
      M().fonteSondagem(function () {
        var G = global.Gestao; if (!G || typeof G._sdAtual !== "function") return null;
        try { return G._sdAtual(); } catch (e) { return null; }
      });
      return true;
    },

    /* ================================================ FERRAMENTA (props) */
    esquema: function (sub, arqui) {
      if (!M()) return null;
      arqui = arqui || this._arqui;
      var self = this, secs = [], ps = [];
      if (sub === "p11-plataforma" && arqui && arqui._secNivel) secs.push(arqui._secNivel());
      var c = this._col || { pts: [] };
      if (sub === "p11-topo") {
        ps.push({ id: "b2f:p11:cota", rotulo: "Cota do próximo ponto", unidade: "m", tipo: "numero", passo: "0.01", valor: cfg.cota });
        ps.push({ id: "b2f:p11:espessura", rotulo: "Espessura do sólido", unidade: "m", tipo: "numero", passo: "0.1", valor: cfg.espessura });
        ps.push({ id: "b2f:p11:passo", rotulo: "Intervalo das curvas de nível", unidade: "m", tipo: "numero", passo: "0.25", valor: cfg.passo });
        ps.push(ro("b2f:p11:n", "Pontos clicados", String(c.sub === sub ? c.pts.length : 0)));
        ps.push({ id: "b2f:p11:dxf", rotulo: "DXF de levantamento", tipo: "botao", rotuloBotao: "Curvas de nível do DXF…", fn: function () { self.escolherArquivo("dxf"); } });
        ps.push({ id: "b2f:p11:csv", rotulo: "Pontos (CSV/TXT)", tipo: "botao", rotuloBotao: "Pontos do levantamento…", fn: function () { self.escolherArquivo("csv"); } });
      } else if (sub === "p11-plataforma") {
        ps.push({ id: "b2f:p11:desloc", rotulo: "Altura do deslocamento do nível", unidade: "m", tipo: "numero", passo: "0.05", valor: cfg.desloc });
        ps.push(ro("b2f:p11:metodo", "Corte e aterro", "prismas sobre a triangulação, integrados exatamente"));
      } else if (sub === "p11-subregiao") {
        ps.push({ id: "b2f:p11:material", rotulo: "Material", tipo: "texto", valor: cfg.material });
      } else if (sub === "p11-comp") {
        ps.push({ id: "b2f:p11:comp", rotulo: "Componente", tipo: "lista", valor: cfg.comp, opcoes: Object.keys(M().TIPOS_COMP).map(function (k) { return { id: k, rotulo: M().TIPOS_COMP[k].rotulo }; }) });
        ps.push({ id: "b2f:p11:alturaComp", rotulo: "Altura (vazio = a do componente)", unidade: "m", tipo: "numero", passo: "0.1", valor: cfg.alturaComp == null ? "" : cfg.alturaComp });
      } else if (sub === "p11-rotular") {
        ps.push(ro("b2f:p11:rot", "Como", "dois cliques: cada curva que a linha cruza ganha a cota"));
      } else if (sub === "p11-divisa") {
        ps.push(ro("b2f:p11:div", "Como", "clique os vértices do lote; Enter ou o 1º ponto fecha"));
      }
      secs.push({ nome: ROT[sub] || "Terreno", params: ps });
      return { titulo: "Ferramenta: " + (ROT[sub] || "Terreno"), icone: "planta", semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudar(sub, pid, valor, arqui); } };
    },
    mudar: function (sub, pid, valor, arqui) {
      var k = String(pid).replace(/^b2f:/, "");
      if (k === "nivel" && arqui && arqui.mudarFerramenta) return arqui.mudarFerramenta(sub, pid, valor);
      if (k === "p11:cota") cfg.cota = num(valor, cfg.cota);
      else if (k === "p11:espessura") { var e = num(valor, cfg.espessura); if (e >= 0.05 && e <= 100) cfg.espessura = e; }
      else if (k === "p11:passo") { var p = num(valor, cfg.passo); if (p >= 0.05 && p <= 50) cfg.passo = p; }
      else if (k === "p11:desloc") { var d = num(valor, cfg.desloc); if (Math.abs(d) <= 1000) cfg.desloc = d; }
      else if (k === "p11:material") cfg.material = txt(valor).trim().slice(0, 80) || cfg.material;
      else if (k === "p11:comp" && M().TIPOS_COMP[valor]) cfg.comp = String(valor);
      else if (k === "p11:alturaComp") { var h = num(valor, NaN); cfg.alturaComp = h > 0 && h <= 100 ? h : null; }
      return this.esquema(sub, arqui);
    },
    /* armar pela API (o e2e e a fita): o mesmo que o clique no botão */
    armar: function (sub, par) {
      if (!SUBS[sub]) return false;
      if (par) Object.keys(par).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(cfg, k)) cfg[k] = par[k]; });
      var a = this._arqui; if (a && a.armar) return a.armar(sub);
      return B() && B().editarArmar ? B().editarArmar(sub) : false;
    },

    /* ======================================================= IMPORTAR */
    escolherArquivo: function (tipo) {
      var self = this, doc = global.document; if (!doc) return false;
      var inp = doc.createElement("input"); inp.type = "file"; inp.accept = tipo === "dxf" ? ".dxf" : ".csv,.txt,.xyz";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { var r = tipo === "dxf" ? self.importarDxfTexto(String(rd.result || ""), { nome: f.name }) : self.importarCsvTexto(String(rd.result || ""), { nome: f.name }); toast(r.ok ? r.resumo : r.motivo, r.ok ? "ok" : "erro"); };
        rd.readAsText(f);
      };
      inp.click();
      return true;
    },
    _enviar: function (o) {
      var api = this._api;
      if (api && api.op) { api.op(o); return true; }
      var b = B(); return !!(b && b.instOp && b.instOp(o));
    },
    _novoId: function () {
      var api = this._api, ed = api && api.edit;
      if (ed && typeof ed.seq === "number") return "e" + (++ed.seq);
      return "t" + Date.now().toString(36);
    },
    /* o DXF de levantamento → op topossolido (origem dxf). opts: layers, zRef, espacamento, nome */
    importarDxfTexto: function (texto, opts) {
      opts = opts || {};
      var D = global.DXF, T = M();
      if (!D || !T) return { ok: false, motivo: "O leitor de DXF (js/dxf.js) ou o motor do terreno não carregou." };
      var res;
      try { res = D.parse(texto, opts.fatorUnidade ? { fatorUnidade: opts.fatorUnidade } : {}); } catch (e) { return { ok: false, motivo: "DXF ilegível: " + (e && e.message) }; }
      var r = T.dxfParaPontos(res, { layers: opts.layers, zRef: opts.zRef, espacamento: opts.espacamento, origem: opts.origem });
      if (r.pontos.length < 3) return { ok: false, motivo: "O DXF não tem curvas com cota (z): " + (r.avisos.join(" ") || "nenhuma linha com elevação.") + " Exporte as curvas de nível em 3D (LWPOLYLINE com elevação ou POLYLINE 3D)." };
      var S = T.superficie(r.pontos);
      if (!S.ok) return { ok: false, motivo: S.motivo };
      var id = this._novoId();
      var o = T.op("topossolido", id, { pontos: r.pontos, origem: "dxf", nome: txt(opts.nome).replace(/\.dxf$/i, "").slice(0, 80) || "Terreno do levantamento", espessura: cfg.espessura, passoCurvas: cfg.passo });
      if (!o) return { ok: false, motivo: "Terreno inválido (pontos demais ou fora da faixa)." };
      this._enviar(o);
      return { ok: true, id: id, op: o, pontos: r.pontos.length, layers: r.layers, avisos: r.avisos,
               resumo: "Topossólido do DXF: " + r.pontos.length + " pontos, " + S.T.length + " triângulos, " + n2(S.areaProjetada) + " m² projetados, cotas " + n2(S.zmin) + " a " + n2(S.zmax) + " m." + (r.avisos.length ? " " + r.avisos.join(" ") : "") };
    },
    importarCsvTexto: function (texto, opts) {
      opts = opts || {};
      var T = M(); if (!T) return { ok: false, motivo: "O motor do terreno não carregou." };
      var r = T.csvParaPontos(texto, { ordem: opts.ordem, zRef: opts.zRef, origem: opts.origem });
      if (!r.ok) return { ok: false, motivo: r.motivo };
      var S = T.superficie(r.pontos); if (!S.ok) return { ok: false, motivo: S.motivo };
      var id = this._novoId(), o = T.op("topossolido", id, { pontos: r.pontos, origem: "csv", nome: txt(opts.nome).replace(/\.(csv|txt|xyz)$/i, "").slice(0, 80) || "Terreno do levantamento", espessura: cfg.espessura, passoCurvas: cfg.passo });
      if (!o) return { ok: false, motivo: "Terreno inválido." };
      this._enviar(o);
      return { ok: true, id: id, op: o, resumo: "Topossólido dos pontos (" + r.ordem + "): " + r.pontos.length + " pontos, " + n2(S.areaProjetada) + " m²." + (r.avisos.length ? " " + r.avisos.join(" ") : "") };
    },

    /* ==================================================== IMPLANTAÇÃO */
    /* o local da obra que o içamento já tem (Gestao._icarGeo): {lat, lon, norte, x0, y0} → a origem (0, 0) do modelo */
    localObra: function () {
      var G = global.Gestao, IG = global.IcarGeo;
      if (!G || typeof G._icarPlano !== "function" || typeof G._icarGeo !== "function") return null;
      var g = null; try { g = G._icarGeo(G._icarPlano()); } catch (e) { g = null; }
      if (!g) return null;
      var o = IG && IG.deMotor ? IG.deMotor({ lat: +g.lat, lon: +g.lon, x0: +g.x0 || 0, y0: +g.y0 || 0, norte: +g.norte || 0 }, 0, 0) : { lat: +g.lat, lon: +g.lon };
      return { lat: o.lat, lon: o.lon, anguloNorte: +g.norte || 0, endereco: txt(g.endereco || g.nome || "") };
    },
    usarLocalObra: function () {
      var L = this.localObra(); if (!L) { toast("A obra não tem local marcado no Içamento (Plano de içamento › Local).", "aviso"); return false; }
      var o = M().op("implantacao", "implantacao", { lat: +L.lat.toFixed(8), lon: +L.lon.toFixed(8), anguloNorte: +Number(L.anguloNorte).toFixed(4), local: L.endereco ? L.endereco.slice(0, 200) : undefined });
      if (!o) return false;
      this._enviar(o); return true;
    },
    esquemaImplantacao: function () {
      var self = this, st = estado(), I = st && st.terreno && st.terreno.implantacao, L = this.localObra();
      var ps = [
        { id: "p11i:anguloNorte", rotulo: "Ângulo para norte verdadeiro (anti-horário)", unidade: "°", tipo: "numero", passo: "0.5", valor: I ? I.anguloNorte : 0 },
        { id: "p11i:lat", rotulo: "Latitude da origem (0, 0)", unidade: "°", tipo: "numero", passo: "0.000001", valor: I && I.lat != null ? I.lat : "" },
        { id: "p11i:lon", rotulo: "Longitude da origem (0, 0)", unidade: "°", tipo: "numero", passo: "0.000001", valor: I && I.lon != null ? I.lon : "" },
        { id: "p11i:elevacao", rotulo: "Elevação da origem", unidade: "m", tipo: "numero", passo: "0.01", valor: I && I.elevacao != null ? I.elevacao : "" },
        ro("p11i:obra", "Local da obra (Içamento)", L ? n2(L.lat, 6) + ", " + n2(L.lon, 6) + " · norte " + n2(L.anguloNorte, 1) + "°" : "sem local marcado"),
        { id: "p11i:usar", rotulo: "Ligar", tipo: "botao", rotuloBotao: "Usar o local da obra", fn: function () { self.usarLocalObra(); try { BimShell.pintarProps(self.esquemaImplantacao()); } catch (e) {} } }
      ];
      return { titulo: "Implantação: norte e coordenadas", icone: "sol", semEditarTipo: true, secoes: [{ nome: "Implantação", params: ps }],
               onMudar: function (pid, valor) {
                 var k = String(pid).replace(/^p11i:/, ""), v = valor === "" || valor == null ? null : num(valor, NaN), d = {};
                 if (["anguloNorte", "lat", "lon", "elevacao"].indexOf(k) < 0) return self.esquemaImplantacao();
                 if (v !== null && !isFinite(v)) return self.esquemaImplantacao();
                 d[k] = v;
                 var o = M().op("implantacao", "implantacao", d); if (o) self._enviar(o);
                 return self.esquemaImplantacao();
               } };
    },

    /* ============================================ PROPRIEDADES DA PEÇA */
    _peca: function (uid) {
      var id = String(uid || "").replace(/^edit:/, ""), st = estado(), T = M();
      if (!st || !st.terreno || !T) return null;
      var e = T.pecas(st).filter(function (x) { return String(x.id) === id; })[0];
      return e ? { el: e, estado: st, id: id } : null;
    },
    /* candidatos de corte/aterro na base SINAPI carregada (a regra do mapa) */
    candidatos: function (medida) {
      var A = global.Analitico; if (!A || !A.carregado || !A._porCodigo) return [];
      var l = Object.keys(A._porCodigo).map(function (k) { return A._porCodigo[k]; });
      return M().candidatos(l, medida);
    },
    secoesPaleta: function (info) {
      var x = this._peca(info && info.uid); if (!x) return null;
      var self = this, e = x.el, secs = [];
      if (e.tipo === "plataforma") {
        var OMU = global.OrcModeloUI, base = OMU && OMU.base ? OMU.base() : null, ps = [];
        ps.push(ro("b2:p11:vol", "Corte / aterro", n2(e.corte, 3) + " m³ / " + n2(e.aterro, 3) + " m³ (líquido " + n2(e.liquido, 3) + " m³)"));
        if (!base && OMU && OMU._botaoBase) ps.push(OMU._botaoBase());
        ["corte", "aterro"].forEach(function (med) {
          var s = arr(e.servicos).filter(function (q) { return q.medida === med; })[0], cands = self.candidatos(med);
          var op = [{ id: "", rotulo: "— sem composição (pendente) —" }].concat(cands.slice(0, 300).map(function (c) { return { id: c.codigo, rotulo: c.codigo + " — " + c.descricao.slice(0, 90) }; }));
          if (s && !cands.some(function (c) { return c.codigo === s.codigo; })) op.splice(1, 0, { id: s.codigo, rotulo: s.codigo });
          ps.push({ id: "b2:p11:cod:" + med, rotulo: med === "corte" ? "Composição do corte (escavação)" : "Composição do aterro", tipo: "lista", valor: s ? s.codigo : "", opcoes: op });
          if (s) ps.push({ id: "b2:p11:fat:" + med, rotulo: (med === "corte" ? "Corte" : "Aterro") + " — fator (empolamento/compactação)", tipo: "numero", passo: "0.05", valor: s.fator || 1 });
        });
        ps.push(ro("b2:p11:regra", "De onde vêm as composições", "SINAPI, grupo de movimento de terra (escavação horizontal/vertical; aterro e reaterro) — a escolha é sua"));
        secs.push({ nome: "Orçamento (terraplenagem)", params: ps });
        if (e.solo && e.solo.furo) secs.push({ nome: "Sondagem embaixo", params: [ro("b2:p11:furo", "Furo", e.solo.furo.id + " (a " + n2(e.solo.furo.distancia, 1) + " m)" + (e.solo.furo.na != null ? " · NA na cota " + n2(e.solo.furo.na) : ""))]
          .concat(arr(e.solo.camadas).map(function (c, i) { return ro("b2:p11:cam" + i, c.nome + " (" + n2(c.cotaTopo) + " a " + n2(c.cotaBase) + ")", n2(c.volume, 3) + " m³ de corte"); })) });
        if (arr(e.avisos).length) secs.push({ nome: "Avisos", params: e.avisos.map(function (a, i) { return ro("b2:p11:av" + i, "Aviso", a); }) });
      } else if (e.tipo === "divisa" && arr(e.segmentos).length) {
        secs.push({ nome: "Dados da linha de propriedade", params: e.segmentos.map(function (g, i) { return ro("b2:p11:seg" + i, "Lado " + g.de + "–" + g.para, g.rumo + " · " + n2(g.distancia) + " m"); }) });
      } else if (e.tipo === "topossolido") {
        var S = M().superficieDe(x.estado, e.id), cs = S && S.ok ? M().curvas(S, e.passoCurvas) : [];
        secs.push({ nome: "Curvas de nível", params: [ro("b2:p11:cv", "Curvas", cs.length + " (" + cs.filter(function (c) { return c.mestra; }).length + " mestras) a cada " + n2(e.passoCurvas) + " m")]
          .concat(arr(e.avisos).map(function (a, i) { return ro("b2:p11:av" + i, "Aviso", a); })) });
      }
      return secs.length ? secs : [];
    },
    mudarPaleta: function (info, pid, valor) {
      var x = this._peca(info && info.uid), b = B(); if (!x || !b || !b.elementoOrcar) return false;
      var m, lista = JSON.parse(JSON.stringify(x.el.servicos || []));
      if ((m = /^b2:p11:cod:(corte|aterro)$/.exec(pid))) {
        lista = lista.filter(function (q) { return q.medida !== m[1]; });
        var cod = txt(valor).trim(); if (cod) lista.push({ codigo: cod, medida: m[1], fator: 1, rotulo: m[1] === "corte" ? "Corte (escavação)" : "Aterro" });
      } else if ((m = /^b2:p11:fat:(corte|aterro)$/.exec(pid))) {
        var f = num(valor, NaN); if (!(f > 0)) return false;
        lista.forEach(function (q) { if (q.medida === m[1]) q.fator = f; });
      } else return false;
      return b.elementoOrcar(x.id, lista);
    },

    /* ======================================================= PLANTA 2D
     * entradas no formato do vínculo CAD (desenho2d: { seg:[x1,y1,x2,y2…],
     * tx:[[x,y,texto]] }) em coordenadas da planta (= (x, z) da cena). Só no
     * MENOR nível da obra (o terreno é do térreo). */
    anotarPlanta: function (d, niveis) {
      var st = estado(), T = M(); if (!st || !st.terreno || !T) return [];
      var L = arr(niveis); if (d && d.nivel && L.length && L.some(function (n) { return Number(n.y) < Number(d.nivel.y) - 1e-6; })) return [];
      var out = [], tr = st.terreno;
      function laco(P) { var s = []; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s.push(a.x, a.z, b.x, b.z); } return s; }
      tr.topos.forEach(function (t) {
        var S = T.superficieDe(st, t.id); if (!S || !S.ok) return;
        var cs = T.curvas(S, t.passoCurvas), sm = [], si = [];
        cs.forEach(function (c) { var P = c.pts, n = P.length, m = c.fechada ? n : n - 1, s = c.mestra ? sm : si; for (var i = 0; i < m; i++) { var a = P[i], b = P[(i + 1) % n]; s.push(a[0], a[1], b[0], b[1]); } });
        var tx = T.rotulos(st, t.id).map(function (r) { return [r.x, r.z, r.texto]; });
        var bd = S.borda.map(function (k) { return { x: S.P[k][0], z: S.P[k][1] }; });
        out.push({ id: "p11-curvas-mestras-" + t.id, seg: sm, tx: tx });
        out.push({ id: "p11-curvas-" + t.id, seg: si.concat(laco(bd)), tx: [] });
      });
      tr.subregioes.forEach(function (s) { if (s.ok) out.push({ id: "p11-sub-" + s.id, seg: laco(s.contorno), tx: [[s.contorno[0].x, s.contorno[0].z, txt(s.material)]] }); });
      tr.plataformas.forEach(function (p) {
        if (!arr(p.contorno).length) return;
        out.push({ id: "p11-plat-" + p.id, seg: laco(p.contorno), tx: [[p.cx, p.cz, "PLAT. " + n2(p.cota) + " · corte " + n2(p.corte, 1) + " m³ · aterro " + n2(p.aterro, 1) + " m³"]] });
      });
      tr.divisas.forEach(function (dv) {
        if (!dv.ok) return;
        var tx = arr(dv.segmentos).map(function (g, i) { var a = dv.contorno[i], b = dv.contorno[(i + 1) % dv.contorno.length]; return [(a.x + b.x) / 2, (a.z + b.z) / 2, g.rumo + " " + n2(g.distancia) + " m"]; });
        tx.push([dv.contorno[0].x, dv.contorno[0].z, "LOTE " + n2(dv.area) + " m²"]);
        out.push({ id: "p11-divisa-" + dv.id, seg: laco(dv.contorno), tx: tx });
      });
      /* a seta do norte verdadeiro (perto do canto do terreno) */
      var pts = []; tr.topos.forEach(function (t) { arr(t.pontos).forEach(function (q) { pts.push([q.x, q.z]); }); }); tr.divisas.forEach(function (dv) { arr(dv.contorno).forEach(function (q) { pts.push([q.x, q.z]); }); });
      if (pts.length) {
        var x1 = Math.max.apply(null, pts.map(function (q) { return q[0]; })), z0 = Math.min.apply(null, pts.map(function (q) { return q[1]; }));
        var an = (tr.implantacao ? Number(tr.implantacao.anguloNorte) || 0 : 0) * Math.PI / 180, c = [x1 + 3, z0 + 2], Lg = 2.5;
        /* o norte verdadeiro na planta: (−sen θ, −cos θ) em (x, z) (z da cena aponta para o sul) */
        var dx = -Math.sin(an), dz = -Math.cos(an), p = [c[0] + dx * Lg, c[1] + dz * Lg], q = [c[0] - dx * Lg * 0.4, c[1] - dz * Lg * 0.4];
        var lx = -dz, lz = dx, w = 0.6;
        out.push({ id: "p11-norte", seg: [q[0], q[1], p[0], p[1], p[0], p[1], c[0] + lx * w, c[1] + lz * w, p[0], p[1], c[0] - lx * w, c[1] - lz * w], tx: [[p[0] + dx * 0.8, p[1] + dz * 0.8, "N"]] });
      }
      return out;
    },

    /* ============================================================ 3D
     * api = { THREE, S, edit, scene, op, planoPonto, hint, fechou, telaDe } */
    montar3d: function (api) {
      if (!this.ativo() || !api || !api.THREE || !api.scene || !M()) return null;
      var self = this, T3 = api.THREE, edit = api.edit;
      this._api = api;
      var grpC = new T3.Group(); grpC.name = "p11-curvas"; api.scene.add(grpC);
      var grpP = new T3.Group(); grpP.name = "p11-previa"; api.scene.add(grpP);
      var mats = {};
      function mat(k, cor) {
        var ch = k + (cor != null ? ":" + cor : "");
        if (mats[ch]) return mats[ch];
        var F = {
          terreno: function () { return new T3.MeshStandardMaterial({ color: cor, metalness: 0, roughness: 0.97, side: T3.DoubleSide, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); },
          sub: function () { return new T3.MeshStandardMaterial({ color: cor, metalness: 0, roughness: 0.95, side: T3.DoubleSide }); },
          plat: function () { return new T3.MeshStandardMaterial({ color: 0xc9b38a, metalness: 0, roughness: 0.9, side: T3.DoubleSide }); },
          corte: function () { return new T3.MeshStandardMaterial({ color: 0xb4572f, metalness: 0, roughness: 0.9, side: T3.DoubleSide }); },
          aterro: function () { return new T3.MeshStandardMaterial({ color: 0x5f8f3e, metalness: 0, roughness: 0.9, side: T3.DoubleSide }); },
          divisa: function () { return new T3.MeshBasicMaterial({ color: 0xc0392b, side: T3.DoubleSide }); },
          comp: function () { return new T3.MeshStandardMaterial({ color: cor, metalness: 0.05, roughness: 0.85 }); },
          curva: function () { return new T3.LineBasicMaterial({ color: 0x5a4a32, transparent: true, opacity: 0.55 }); },
          mestra: function () { return new T3.LineBasicMaterial({ color: 0x3b2f1e, transparent: true, opacity: 0.9 }); },
          previa: function () { return new T3.LineBasicMaterial({ color: 0xd97706, depthTest: false }); },
          ponto: function () { return new T3.MeshBasicMaterial({ color: 0xd97706, depthTest: false }); }
        };
        mats[ch] = F[k](); return mats[ch];
      }
      function limpar(g) { g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); }); }
      function semRaio(o) { o.raycast = function () {}; return o; }
      function geo(pos, idx) { var g = new T3.BufferGeometry(); g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox(); return g; }
      /* tiras verticais (saia) ao longo de um laço: de y0(p) a y1(p) */
      function saia(P, y0, y1, passo) {
        var pos = [], idx = [], n = 0;
        for (var i = 0; i < P.length; i++) {
          var a = P[i], b = P[(i + 1) % P.length], L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), k = Math.max(1, Math.min(60, Math.ceil(L / passo)));
          for (var j = 0; j < k; j++) {
            var u0 = j / k, u1 = (j + 1) / k, p0 = [a[0] + u0 * (b[0] - a[0]), a[1] + u0 * (b[1] - a[1])], p1 = [a[0] + u1 * (b[0] - a[0]), a[1] + u1 * (b[1] - a[1])];
            var b0 = y0(p0), b1 = y0(p1), t0 = y1(p0), t1 = y1(p1); if (b0 == null || b1 == null || t0 == null || t1 == null) continue;
            pos.push(p0[0], b0, p0[1], p1[0], b1, p1[1], p1[0], t1, p1[1], p0[0], t0, p0[1]);
            idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
          }
        }
        return n ? geo(pos, idx) : null;
      }
      /* polígono (x, z) plano na cota y, triangulado (ShapeUtils) */
      function placa(P, y) {
        var tris = []; try { tris = T3.ShapeUtils.triangulateShape(P.map(function (q) { return new T3.Vector2(q[0], q[1]); }), []); } catch (e) { tris = []; }
        var pos = [], idx = []; P.forEach(function (q) { pos.push(q[0], y, q[1]); }); tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
        return idx.length ? geo(pos, idx) : null;
      }
      var api3 = {
        contar: function (st) { var tr = st && st.terreno; return tr ? tr.topos.length + tr.subregioes.length + tr.plataformas.length + tr.divisas.length + tr.componentes.length : 0; },
        /* chamado no meio do refazer do editor (js/bim.js, gancho "P11") */
        desenhar: function (st, mo, addMesh) {
          var tr = st && st.terreno, T = M(); if (!tr || !T) return;
          function registrar(id, tipo, nome, qto) {
            mo.tipos[tipo] = (mo.tipos[tipo] || 0) + 1; mo.qto[id] = qto;
            mo.elementos.push({ id: id, uid: "edit:" + id, mid: "edit", arquivo: mo.nome, tipo: tipo, nome: nome, etapa: null, codOrc: null, qto: qto, disciplina: "arquitetura" });
            mo.nEl++;
          }
          var plats = tr.plataformas.filter(function (p) { return p.ok; }).map(function (p) { return p.contorno.map(function (q) { return [q.x, q.z]; }); });
          function naPlat(x, z) { for (var i = 0; i < plats.length; i++) { var P = plats[i], d = false; for (var a = 0, b = P.length - 1; a < P.length; b = a++) { if (((P[a][1] > z) !== (P[b][1] > z)) && (x < (P[b][0] - P[a][0]) * (z - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0])) d = !d; } if (d) return true; } return false; }
          tr.topos.forEach(function (t) {
            var S = T.superficieDe(st, t.id); if (!S || !S.ok) return;
            var pos = [], idx = [];
            S.P.forEach(function (q) { pos.push(q[0], q[2], q[1]); });
            /* o triângulo com o centro dentro de uma plataforma sai: ali vale a plataforma (terraplenado) */
            S.T.forEach(function (k) { var a = S.P[k[0]], b = S.P[k[1]], c = S.P[k[2]]; if (naPlat((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) return; idx.push(k[0], k[2], k[1]); });
            var g = geo(pos, idx), m = mat("terreno", corDe(t.material));
            addMesh(new T3.Mesh(g, m), t.id, "IFCGEOGRAPHICELEMENT", m);
            registrar(t.id, "IFCGEOGRAPHICELEMENT", (t.nome || "Sólido topográfico") + " (" + t.id + ")", { area: t.areaSuperficie, areaProjecao: t.areaProjetada, volume: t.volume, contagem: 1 });
          });
          tr.subregioes.forEach(function (s) {
            if (!s.ok) return;
            var S = T.superficieDe(st, s.topoHost); if (!S || !S.ok) return;
            var P = s.contorno.map(function (q) { return [q.x, q.z]; }), pos = [], idx = [], n = 0;
            S.T.forEach(function (k, ik) {
              var T2 = [S.P[k[0]], S.P[k[1]], S.P[k[2]]].map(function (q) { return [q[0], q[1]]; });
              var Q = T.cortarConvexo(P, T2); if (Q.length < 3 || !(T.momentos(Q).a > 1e-9)) return;
              var pl = T.plano(S, ik), tris = [];
              try { tris = T3.ShapeUtils.triangulateShape(Q.map(function (q) { return new T3.Vector2(q[0], q[1]); }), []); } catch (e) { tris = []; }
              Q.forEach(function (q) { pos.push(q[0], pl.a + pl.b * q[0] + pl.c * q[1] + 0.03, q[1]); });
              tris.forEach(function (tt) { idx.push(n + tt[0], n + tt[1], n + tt[2]); }); n += Q.length;
            });
            if (!idx.length) return;
            var m = mat("sub", corDe(s.material));
            addMesh(new T3.Mesh(geo(pos, idx), m), s.id, "IFCGEOGRAPHICELEMENT", m);
            registrar(s.id, "IFCGEOGRAPHICELEMENT", "Sub-região " + txt(s.material) + " (" + s.id + ")", { area: s.areaSuperficie, areaProjecao: s.areaProjetada, contagem: 1 });
          });
          tr.plataformas.forEach(function (p) {
            if (!arr(p.contorno).length) return;
            var P = p.contorno.map(function (q) { return [q.x, q.z]; }), S = p.topoHost != null ? T.superficieDe(st, p.topoHost) : null;
            var g = placa(P, p.cota); if (!g) return;
            var m = mat("plat"); addMesh(new T3.Mesh(g, m), p.id, "IFCGEOGRAPHICELEMENT", m);
            if (S && S.ok) {
              /* as saias: CORTE (terreno acima da plataforma) e ATERRO (abaixo) na borda */
              var yT = function (q) { return T.cota(S, q[0], q[1]); };
              var gc = saia(P, function (q) { var y = yT(q); return y == null ? null : p.cota; }, function (q) { var y = yT(q); return y == null ? null : Math.max(p.cota, y); }, 0.5);
              var ga = saia(P, function (q) { var y = yT(q); return y == null ? null : Math.min(p.cota, y); }, function (q) { var y = yT(q); return y == null ? null : p.cota; }, 0.5);
              if (gc) { var mc = mat("corte"); addMesh(new T3.Mesh(gc, mc), p.id, "IFCGEOGRAPHICELEMENT", mc); }
              if (ga) { var ma = mat("aterro"); addMesh(new T3.Mesh(ga, ma), p.id, "IFCGEOGRAPHICELEMENT", ma); }
            }
            registrar(p.id, "IFCGEOGRAPHICELEMENT", "Plataforma " + n2(p.cota) + " (" + p.id + ")", { area: p.areaProjetada, areaProjecao: p.areaProjetada, comprimento: p.perimetro, volume: p.corte, corte: p.corte, aterro: p.aterro, contagem: 1 });
          });
          tr.divisas.forEach(function (dv) {
            if (!dv.ok) return;
            var P = dv.contorno.map(function (q) { return [q.x, q.z]; }), S0 = null;
            for (var i = 0; i < tr.topos.length && !S0; i++) { var Si = T.superficieDe(st, tr.topos[i].id); if (Si && Si.ok) S0 = Si; }
            var yb = function (q) { var y = S0 ? T.cota(S0, q[0], q[1]) : null; return y == null ? 0 : y; };
            var g = saia(P, function (q) { return yb(q) + 0.02; }, function (q) { return yb(q) + 0.35; }, 1.0); if (!g) return;
            var m = mat("divisa"); addMesh(new T3.Mesh(g, m), dv.id, "IFCBUILDINGELEMENTPROXY", m);
            registrar(dv.id, "IFCBUILDINGELEMENTPROXY", "Linha de divisa " + n2(dv.area) + " m² (" + dv.id + ")", { area: dv.area, comprimento: dv.perimetro, contagem: 1 });
          });
          tr.componentes.forEach(function (c) {
            var TC = T.TIPOS_COMP[c.tipoComp] || T.TIPOS_COMP.arvore, H = Number(c.alturaEf) || TC.altura, ms = [];
            if (c.tipoComp === "arvore" || c.tipoComp === "arbusto") {
              var tronco = new T3.Mesh(new T3.CylinderGeometry(TC.raio * 0.08, TC.raio * 0.1, H * 0.45, 8), mat("comp", 0x6b4f2e)); tronco.position.set(c.x, c.y + H * 0.225, c.z); ms.push(tronco);
              var copa = new T3.Mesh(new T3.SphereGeometry(TC.raio, 12, 8), mat("comp", 0x4f8a3a)); copa.position.set(c.x, c.y + H - TC.raio, c.z); ms.push(copa);
            } else {
              var cx = new T3.Mesh(new T3.BoxGeometry(TC.raio * 2, H, c.tipoComp === "carro" ? TC.raio * 0.85 : TC.raio * (c.tipoComp === "banco" ? 0.5 : 2)), mat("comp", c.tipoComp === "carro" ? 0x3d5a80 : 0x7b8794));
              cx.position.set(c.x, c.y + H / 2, c.z); cx.rotation.y = Number(c.rotY) || 0; ms.push(cx);
            }
            ms.forEach(function (mm) { addMesh(mm, c.id, "IFCBUILDINGELEMENTPROXY", mm.material); });
            registrar(c.id, "IFCBUILDINGELEMENTPROXY", txt(c.rotulo) + " (" + c.id + ")", { contagem: 1 });
          });
        },
        /* depois do refazer: as CURVAS DE NÍVEL em linha (sobreposição) */
        aposRebuild: function (st) {
          limpar(grpC);
          var tr = st && st.terreno, T = M(); if (!tr || !T) return;
          tr.topos.forEach(function (t) {
            var S = T.superficieDe(st, t.id); if (!S || !S.ok) return;
            var pm = [], pi = [];
            T.curvas(S, t.passoCurvas).forEach(function (c) {
              var P = c.pts, n = P.length, m = c.fechada ? n : n - 1, alvo = c.mestra ? pm : pi;
              for (var i = 0; i < m; i++) { var a = P[i], b = P[(i + 1) % n]; alvo.push(a[0], c.y + 0.02, a[1], b[0], c.y + 0.02, b[1]); }
            });
            [[pm, "mestra"], [pi, "curva"]].forEach(function (x) {
              if (!x[0].length) return;
              var g = new T3.BufferGeometry(); g.setAttribute("position", new T3.Float32BufferAttribute(x[0], 3));
              grpC.add(semRaio(new T3.LineSegments(g, mat(x[1]))));
            });
          });
        },
        dica: function (sub) {
          if (!SUBS[sub]) return "";
          var H = {
            "p11-topo": "Topossólido: clique os pontos (cota " + n2(cfg.cota) + " m — muda em Propriedades); Enter cria (3 pontos ou mais). Esc cancela.",
            "p11-plataforma": "Plataforma: clique os cantos; feche no 1º ponto ou Enter. Cota = nível + " + n2(cfg.desloc) + " m.",
            "p11-subregiao": "Sub-região (" + cfg.material + "): clique os cantos sobre o terreno; feche no 1º ponto ou Enter.",
            "p11-divisa": "Linha de divisa: clique os vértices do lote; feche no 1º ponto ou Enter.",
            "p11-rotular": "Rotular curvas: clique as duas pontas da linha; cada curva que ela cruzar ganha a cota.",
            "p11-comp": "Componente de terreno (" + M().TIPOS_COMP[cfg.comp].rotulo + "): clique onde pousar."
          };
          return H[sub] || "";
        },
        aoSub: function (sub) { if (!self._col || self._col.sub !== sub) self._limparCol(); },
        clique: function (sub, e, hit, p) {
          if (!SUBS[sub]) return false;
          /* o ponto NO TERRENO (o raio que bateu na malha); sem ele, o do plano de trabalho */
          var q = hit && hit.point ? hit.point : p;
          if (!q) return true;
          return self._clique(sub, e, q);
        },
        fechar: function () { return self._fechar(); }
      };
      this._grpP = grpP; this._mat = mat; this._T3 = T3;
      /* Enter fecha; Esc cancela (captura: a casca usa o Enter para repetir comando) */
      if (global.addEventListener && !this._teclas) {
        this._teclas = true;
        global.addEventListener("keydown", function (ev) {
          var a = self._api, ed = a && a.edit; if (!ed || !ed.on || !SUBS[ed.sub]) return;
          var t = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
          if (ev.key === "Enter" && self._col && self._col.pts.length) { if (self._fechar()) { ev.preventDefault(); ev.stopPropagation(); } }
          else if (ev.key === "Escape" && self._col && self._col.pts.length) { self._limparCol(); }
        }, true);
      }
      return api3;
    },

    /* ------------------------------------------------ coleta de cliques */
    _col: null,
    _limparCol: function () {
      this._col = null;
      if (this._grpP) this._grpP.children.slice().forEach(function (o) { this._grpP.remove(o); if (o.geometry) o.geometry.dispose(); }, this);
    },
    _desenharCol: function () {
      var g = this._grpP, T3 = this._T3, c = this._col; if (!g || !T3) return;
      g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); });
      if (!c || !c.pts.length) return;
      var self = this;
      c.pts.forEach(function (q) { var s = new T3.Mesh(new T3.SphereGeometry(0.12, 8, 6), self._mat("ponto")); s.position.set(q.x, q.y, q.z); s.raycast = function () {}; s.renderOrder = 998; g.add(s); });
      if (c.pts.length > 1) {
        var pos = []; c.pts.forEach(function (q) { pos.push(q.x, q.y + 0.01, q.z); });
        if (CONTORNO[c.sub] && c.pts.length > 2) pos.push(c.pts[0].x, c.pts[0].y + 0.01, c.pts[0].z);
        var ge = new T3.BufferGeometry(); ge.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
        var ln = new T3.Line(ge, this._mat("previa")); ln.raycast = function () {}; ln.renderOrder = 999; g.add(ln);
      }
    },
    _hint: function (t) { var a = this._api; if (a && a.hint) a.hint(t); },
    _yTerreno: function (x, z) {
      var st = estado(), T = M(); if (!st || !st.terreno) return null;
      for (var i = 0; i < st.terreno.topos.length; i++) { var S = T.superficieDe(st, st.terreno.topos[i].id); var y = S && S.ok ? T.cota(S, x, z) : null; if (y != null) return { y: y, topo: st.terreno.topos[i].id }; }
      return null;
    },
    _clique: function (sub, e, p) {
      var a = this._api, T = M();
      if (sub === "p11-comp") {
        var o = T.op("compTerreno", this._novoId(), { tipoComp: cfg.comp, x: p.x, z: p.z, altura: cfg.alturaComp != null ? cfg.alturaComp : undefined });
        if (o) { this._enviar(o); this._hint(T.TIPOS_COMP[cfg.comp].rotulo + " colocado. Clique para outro, ou Esc."); if (a && a.fechou) a.fechou(); }
        return true;
      }
      if (!this._col || this._col.sub !== sub) this._col = { sub: sub, pts: [] };
      var c = this._col, yt = this._yTerreno(p.x, p.z), y = sub === "p11-topo" ? cfg.cota : (yt ? yt.y : (a && a.edit ? Number(a.edit.base) || 0 : 0));
      /* contorno: o clique perto do 1º ponto (12 px) fecha */
      if (CONTORNO[sub] && c.pts.length >= 3 && e && isFinite(e.clientX) && a && a.S && a.S._telaDe) {
        var t0 = a.S._telaDe(c.pts[0].x, c.pts[0].y, c.pts[0].z);
        if (t0 && Math.abs(t0.x - e.clientX) <= 12 && Math.abs(t0.y - e.clientY) <= 12) { this._fechar(); return true; }
      }
      c.pts.push({ x: Math.round(p.x * 1e4) / 1e4, z: Math.round(p.z * 1e4) / 1e4, y: y });
      if (sub === "p11-rotular" && c.pts.length === 2) { this._fechar(); return true; }
      this._desenharCol();
      if (sub === "p11-topo") this._hint(c.pts.length + " ponto(s). Clique o próximo (cota " + n2(cfg.cota) + " m) ou Enter para criar o terreno.");
      else if (sub === "p11-rotular") this._hint("Agora a outra ponta da linha.");
      else this._hint(c.pts.length + " ponto(s). Feche no 1º ponto ou Enter.");
      return true;
    },
    /* Enter: vira a op da ferramenta */
    _fechar: function () {
      var c = this._col, T = M(), a = this._api; if (!c || !T) return false;
      var pts = c.pts, o = null, msg = "";
      var nv = this._arqui && this._arqui.nivelAtivo ? this._arqui.nivelAtivo() : null;
      if (c.sub === "p11-topo") {
        if (pts.length < 3) { this._hint("O terreno precisa de 3 pontos ou mais."); return false; }
        var S = T.superficie(pts); if (!S.ok) { this._hint(S.motivo); return false; }
        o = T.op("topossolido", this._novoId(), { pontos: pts, origem: "pontos", espessura: cfg.espessura, passoCurvas: cfg.passo });
        msg = "Topossólido: " + pts.length + " pontos, " + n2(S.areaProjetada) + " m² projetados.";
      } else if (c.sub === "p11-rotular") {
        if (pts.length < 2) return false;
        var yt = this._yTerreno(pts[0].x, pts[0].z);
        o = T.op("rotuloCurvas", this._novoId(), { a: pts[0], b: pts[1], topoId: yt ? yt.topo : undefined });
        msg = "Curvas rotuladas ao longo da linha.";
      } else if (CONTORNO[c.sub]) {
        if (pts.length < 3) { this._hint("Clique 3 cantos ou mais."); return false; }
        var v = T.validarContorno(pts); if (!v.ok) { this._hint(v.motivo); return false; }
        if (c.sub === "p11-plataforma") {
          o = T.op("plataforma", this._novoId(), { contorno: pts, deslocNivel: cfg.desloc, nivelId: nv && nv.id != null ? String(nv.id) : undefined, base: nv ? Number(nv.elevacao) || 0 : 0 });
          msg = "Plataforma criada: " + n2(v.area) + " m² na cota " + n2((nv ? Number(nv.elevacao) || 0 : 0) + cfg.desloc) + " m.";
        } else if (c.sub === "p11-subregiao") { o = T.op("subregiao", this._novoId(), { contorno: pts, material: cfg.material }); msg = "Sub-região de " + cfg.material + ": " + n2(v.area) + " m² projetados."; }
        else { o = T.op("divisa", this._novoId(), { contorno: pts }); msg = "Linha de divisa: lote de " + n2(v.area) + " m²."; }
      }
      if (!o) { this._hint("Não deu para criar: confira os pontos."); return false; }
      this._limparCol();
      this._enviar(o);
      var st = estado();
      if (o.op === "plataforma" && st && st.terreno) {
        var pl = st.terreno.plataformas.filter(function (x) { return x.id === o.id; })[0];
        if (pl) msg += pl.ok ? " Corte " + n2(pl.corte, 2) + " m³, aterro " + n2(pl.aterro, 2) + " m³." : " " + arr(pl.avisos).join(" ");
      }
      this._hint(msg + " Clique para outro, ou Esc.");
      if (a && a.fechou) a.fechou();
      return true;
    }
  };

  global.BimTerrenoUI = BimTerrenoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTerrenoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
