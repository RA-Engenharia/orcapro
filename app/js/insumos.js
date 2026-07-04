/* =====================================================================
 * insumos.js — Banco de Insumos de Obras (para solicitações de compra)
 * Reaproveita os dados que o app JÁ tem: agrega os INSUMOS únicos que
 * aparecem nas composições do SINAPI analítico (data/sinapi-<UF>-analitico.json)
 * + os insumos das bases extras carregadas (SUDECAP/SEINFRA/SETOP via Bases).
 * Cada insumo: { codigo, descricao, unidade, custoUnitario, categoria, fonte }.
 * Busca por código/descrição. Preço = referência (base do estado ativo).
 * Lógica de agregação/busca é pura/testável (Node).
 * ===================================================================== */
(function (global) {
  "use strict";

  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }

  var Insumos = {
    carregado: false,
    carregando: false,
    uf: null,
    _idx: [],          // catálogo plano: [{codigo, descricao, unidade, custoUnitario, categoria, fonte}]
    _tokens: [],       // string normalizada paralela a _idx (código + descrição) p/ busca
    _porChave: {},     // "FONTE:codigo" -> item
    _promise: null,
    _promiseUf: null,  // UF do fetch em voo (evita reaproveitar promise de outro estado)

    /* Agrega o catálogo a partir do Analitico já carregado (+ opcionalmente marca a UF). */
    construir: function () {
      var idx = [], toks = [], porChave = {}, seen = {};
      // 1) SINAPI: insumos-folha que aparecem nas composições do analítico
      if (typeof Analitico !== "undefined" && Analitico.carregado && Analitico._porCodigo) {
        var porCod = Analitico._porCodigo;
        for (var k in porCod) {
          if (!porCod.hasOwnProperty(k)) continue;
          var comp = porCod[k], ins = (comp && comp.insumos) || [];
          for (var i = 0; i < ins.length; i++) {
            var it = ins[i];
            // todo item-folha entra: INSUMO (material) + MO/EQ que o SINAPI modela como "composição com encargos"
            // (ex.: 88316 SERVENTE, 88309 PEDREIRO vêm com tipo=COMPOSICAO mas categoria=MO). Dedupe por código resolve repetições.
            if (!it || it.codigo == null) continue;
            var cat0 = it.categoria || "";
            if (cat0 !== "MO" && cat0 !== "MAT" && cat0 !== "EQ") continue; // ignora entradas sem categoria de custo
            var chave = "SINAPI:" + it.codigo;
            if (seen[chave]) continue;
            seen[chave] = 1;
            var reg = {
              codigo: String(it.codigo),
              descricao: it.descricao || "",
              unidade: it.unidade || "",
              custoUnitario: Number(it.custoUnitario) || 0,
              categoria: it.categoria || "MAT",
              fonte: "SINAPI"
            };
            idx.push(reg); toks.push(norm(reg.codigo + " " + reg.descricao)); porChave[chave] = reg;
          }
        }
        this.uf = Analitico.uf || this.uf;
      }
      // 2) Bases extras já carregadas (SUDECAP/SEINFRA/SETOP): itens marcados como insumo
      if (typeof Bases !== "undefined" && Bases.lista) {
        try {
          Bases.lista().forEach(function (b) {
            if (!b || !b.ativa || b.fonte === "SINAPI") return;
            var itens = (typeof Bases.itensDe === "function") ? Bases.itensDe(b.fonte) : null;
            if (!itens) return; // sem acesso direto aos itens → ignora (a busca ainda os inclui via Bases.buscar)
            for (var i = 0; i < itens.length; i++) {
              var it = itens[i];
              if (!it || it.codigo == null) continue;
              var ehInsumo = (it.tipoItem === "insumo") || (typeof Bases.tipoDe === "function" && Bases.tipoDe(it) === "insumo");
              if (!ehInsumo) continue;
              var chave = b.fonte + ":" + it.codigo;
              if (seen[chave]) continue;
              seen[chave] = 1;
              var reg = { codigo: String(it.codigo), descricao: it.descricao || "", unidade: it.unidade || "", custoUnitario: Number(it.custoUnitario) || 0, categoria: it.categoria || "MAT", fonte: b.fonte };
              idx.push(reg); toks.push(norm(reg.codigo + " " + reg.descricao)); porChave[chave] = reg;
            }
          });
        } catch (e) { /* bases sem itensDe: tudo bem, buscar() ainda mescla via Bases.buscar */ }
      }
      this._idx = idx; this._tokens = toks; this._porChave = porChave;
      this.carregado = idx.length > 0;
      this.carregando = false;
      return idx.length;
    },

    /* Lazy-load: garante o analítico do estado ativo carregado e então agrega. */
    carregar: function (analiticoUrl, ufAtivo) {
      var self = this;
      // já construído p/ o UF certo → reaproveita
      if (this.carregado && (!ufAtivo || !this.uf || this.uf === ufAtivo)) return Promise.resolve(this._idx.length);
      // fetch EM VOO para o MESMO UF → reaproveita a promise
      if (this._promise && (!ufAtivo || !this._promiseUf || this._promiseUf === ufAtivo)) return this._promise;
      // fetch em voo para UF DIFERENTE → cancela o anterior (epoch do Analitico) e recomeça
      if (this._promise && typeof Analitico !== "undefined" && Analitico.reset) Analitico.reset();
      this.carregando = true;
      // Analítico já carregado para o UF certo → só (re)agrega
      if (typeof Analitico !== "undefined" && Analitico.carregado && (!ufAtivo || !Analitico.uf || Analitico.uf === ufAtivo)) {
        this._promise = null; this._promiseUf = null; this.construir();
        return Promise.resolve(this._idx.length);
      }
      if (typeof Analitico === "undefined") { this.carregando = false; return Promise.reject(new Error("Analitico indisponível")); }
      // troca de UF → descarta o analítico anterior antes de recarregar
      if (Analitico.reset && Analitico.uf && ufAtivo && Analitico.uf !== ufAtivo) Analitico.reset();
      this._reset(); // limpa o catálogo do UF anterior
      this._promiseUf = ufAtivo || null;
      this._promise = Analitico.carregarArquivo(analiticoUrl).then(function () {
        self._promise = null; self._promiseUf = null;
        return self.construir();
      }).catch(function (e) { self.carregando = false; self._promise = null; self._promiseUf = null; throw e; });
      return this._promise;
    },

    _reset: function () { this.carregado = false; this._idx = []; this._tokens = []; this._porChave = {}; },

    /* Busca por código/descrição. opts: {max, categoria, incluirBases}. */
    buscar: function (texto, opts) {
      if (typeof opts === "number") opts = { max: opts };
      opts = opts || {};
      var max = opts.max || 40, cat = opts.categoria || null;
      var alvo = norm(texto), termos = alvo.split(" ").filter(Boolean);
      if (!termos.length) return [];
      var q = String(texto).trim();
      var ordena = function (a, b) {
        var ea = (a.codigo === q) ? 0 : 1, eb = (b.codigo === q) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return (a.descricao || "").length - (b.descricao || "").length;
      };
      // PRIMÁRIO: catálogo agregado (SINAPI + bases já indexadas) — tem prioridade nas vagas
      var prim = [];
      for (var i = 0; i < this._idx.length; i++) {
        var hay = this._tokens[i], ok = true;
        for (var t = 0; t < termos.length; t++) { if (hay.indexOf(termos[t]) === -1) { ok = false; break; } }
        if (!ok) continue;
        var reg = this._idx[i];
        if (cat && reg.categoria !== cat) continue;
        prim.push(reg);
      }
      prim.sort(ordena);
      var out = prim.slice(0, max);
      // SECUNDÁRIO: insumos de bases extras NÃO indexadas — só completam as vagas restantes (não expulsam o SINAPI)
      if (out.length < max && opts.incluirBases !== false && typeof Bases !== "undefined" && Bases.buscar) {
        try {
          var vistos = {}; out.forEach(function (x) { vistos[x.fonte + ":" + x.codigo] = 1; });
          var sec = [];
          Bases.buscar(texto, { max: max, tipo: "insumo" }).forEach(function (r) {
            var it = r.item || {}; var chave = (r.fonte || "") + ":" + it.codigo;
            if (!it.codigo || Insumos._porChave[chave] || vistos[chave]) return; // já no índice ou já listado
            if (cat && (it.categoria || "MAT") !== cat) return;
            sec.push({ codigo: String(it.codigo), descricao: it.descricao || "", unidade: it.unidade || "", custoUnitario: Number(it.custoUnitario) || 0, categoria: it.categoria || "MAT", fonte: r.fonte || "" });
          });
          sec.sort(ordena);
          out = out.concat(sec).slice(0, max);
        } catch (e) { /* ignora */ }
      }
      return out;
    },

    obter: function (fonte, codigo) {
      if (codigo === undefined) { codigo = fonte; fonte = null; }
      if (fonte) return this._porChave[String(fonte).toUpperCase() + ":" + codigo] || null;
      for (var k in this._porChave) { if (this._porChave.hasOwnProperty(k) && k.split(":")[1] === String(codigo)) return this._porChave[k]; }
      return null;
    },

    resumo: function () {
      var mo = 0, mat = 0, eq = 0;
      for (var i = 0; i < this._idx.length; i++) {
        var c = this._idx[i].categoria;
        if (c === "MO") mo++; else if (c === "EQ") eq++; else mat++;
      }
      return { carregado: this.carregado, total: this._idx.length, uf: this.uf, mo: mo, mat: mat, eq: eq };
    }
  };

  if (global) global.Insumos = Insumos;
  if (typeof module !== "undefined" && module.exports) module.exports = Insumos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
