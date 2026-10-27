/* =====================================================================
 * bimarqtipos.js (BimArqTipos) — SELETOR FINO de Porta, Janela e Componente (27/10/2026).
 *
 * Pedido do Rogério (print): ao clicar em Porta, Janela ou Componente na fita do BIM abria a tela grande
 * "Famílias" (chips, filtro, "Só as que entram no cálculo"). Ele quer o seletor das instalações, rápido:
 * no topo de Propriedades a MINIATURA do tipo + a categoria + o nome do tipo; o clique abre a lista com
 * "Pesquisar", cada tipo com miniatura e nome, e "Tipos mais recentemente utilizados" no rodapé. Escolheu,
 * a ferramenta já fica armada: clicar na parede (porta e janela) ou no lugar (componente).
 *
 * NÃO duplica o seletor: usa o de js/biminsttipos.js (BimInstTipos) — decorar, abrirLista, recentes por
 * usuário, pesquisa — registrando aqui só o que muda: o CATÁLOGO (as famílias da biblioteca), o CONTEXTO
 * (qual ferramenta está armada) e o APLICAR (armar a família escolhida).
 *
 * A tela grande de Famílias continua, aberta pelo botão próprio (Biblioteca › Famílias) e pelo botão
 * "Abrir a biblioteca de famílias" de Propriedades; só saiu do caminho do clique em Porta/Janela/Componente.
 *
 * COMPONENTE cobre mobiliário, louças, cozinha, banho, lazer, luminária, paisagismo, equipamento,
 * genérico, guarda-corpo e o armário planejado (ids ra-plan-*), com o subgrupo da categoria na lista.
 *
 *   PURO (Node-testável): catalogo(cat), grupoDe(fam), atual(cat), esquema(cat)
 *   TELA: abrir(cat) (a fita), aplicar(tipo) (armar a família), configurar(host)
 * Teste: node tools/test-bimarqtipos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function BIT() { return dep("BimInstTipos", "./biminsttipos.js"); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }

  /* categorias do seletor → categorias de FAMÍLIA que entram (js/familia.js CATEGORIAS) */
  var CATS = {
    porta: { rotulo: "Porta", familias: ["porta"], dica: "clique numa parede criada aqui: o vão abre sozinho." },
    janela: { rotulo: "Janela", familias: ["janela"], dica: "clique numa parede criada aqui: o vão abre sozinho, com o peitoril." },
    componente: { rotulo: "Componente", familias: ["mobiliario", "loucas", "cozinha", "banho", "lazer", "luminaria", "paisagismo", "equipamento", "generico", "guarda_corpo"],
                  dica: "clique no lugar no modelo; a barra de espaço gira 90°." }
  };
  var ORDEM = ["porta", "janela", "componente"];
  /* subgrupos da lista do Componente (a ordem em que aparecem) */
  var GRUPOS = [["mobiliario", "Mobiliário"], ["planejado", "Planejado"], ["cozinha", "Cozinha"], ["banho", "Banho"], ["loucas", "Louças e metais"],
                ["lazer", "Lazer e área gourmet"], ["luminaria", "Luminária"], ["paisagismo", "Paisagismo"], ["equipamento", "Equipamento"],
                ["guarda_corpo", "Guarda-corpo"], ["generico", "Genérico"]];
  var ROT_GRUPO = {}, ORDEM_GRUPO = GRUPOS.map(function (g) { return g[0]; }); GRUPOS.forEach(function (g) { ROT_GRUPO[g[0]] = g[1]; });

  /* ícone de reserva (SVG embutido: nada de arquivo, nada de rede) para quem não tem miniatura desenhada da própria peça */
  function svg(corpo) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 52"><rect width="64" height="52" fill="#fff"/>' + corpo + "</svg>"); }
  var ICONES = {
    porta: svg('<rect x="20" y="6" width="24" height="42" fill="none" stroke="#5b6573" stroke-width="2.5"/><rect x="24" y="10" width="16" height="38" fill="#d9c3a3" stroke="#8a6d45" stroke-width="1.5"/><circle cx="37" cy="30" r="1.6" fill="#5b6573"/>'),
    janela: svg('<rect x="14" y="10" width="36" height="32" fill="#dcecf7" stroke="#5b6573" stroke-width="2.5"/><line x1="32" y1="10" x2="32" y2="42" stroke="#5b6573" stroke-width="2"/><line x1="14" y1="26" x2="50" y2="26" stroke="#5b6573" stroke-width="2"/>'),
    componente: svg('<rect x="12" y="20" width="40" height="18" rx="2" fill="#c9b79c" stroke="#7a6446" stroke-width="2"/><rect x="16" y="38" width="4" height="8" fill="#7a6446"/><rect x="44" y="38" width="4" height="8" fill="#7a6446"/><rect x="16" y="10" width="32" height="10" rx="2" fill="#dccdb6" stroke="#7a6446" stroke-width="2"/>')
  };

  var BimArqTipos = {
    CATS: CATS, ORDEM: ORDEM, GRUPOS: GRUPOS, _atual: {},
    /* o que fala com o resto da tela: os testes trocam (host.fontes, host.colocar, host.preparar, host.biblioteca) */
    host: null,

    configurar: function (host) { this.host = host || null; this.esquecer(); return this; },

    /* as famílias da biblioteca (RA + da empresa + importadas): a mesma que a tela grande mostra */
    fontes: function () {
      if (this.host && this.host.fontes) return this.host.fontes();
      try { if (global.FamiliaUI && global.FamiliaUI.biblioteca) return global.FamiliaUI.biblioteca(); } catch (e) {}
      var RA = dep("FamiliasRA", "./familiasra.js");
      return RA ? RA.lista() : [];
    },
    /* o subgrupo (só no Componente): o armário planejado tem categoria "mobiliario" e id ra-plan-* */
    grupoDe: function (f) {
      if (/^ra-plan-/.test(txt(f && f.id))) return "planejado";
      return txt(f && f.categoria);
    },

    /* ------------------------------------------------------------ catálogo (guardado por 2 s: a lista é consultada a cada tecla) */
    _cache: {},
    esquecer: function () { this._cache = {}; },
    catalogo: function (cat) {
      var def = CATS[cat]; if (!def) return [];
      var agora = Date.now(), c = this._cache[cat];
      if (c && agora - c.t < 2000) return c.lista;
      var self = this, FM = global.FamiliasMob, out = [];
      arr(this.fontes()).forEach(function (f) {
        if (!f || !f.id || def.familias.indexOf(f.categoria) < 0) return;
        var gk = self.grupoDe(f); if (!ROT_GRUPO[gk]) gk = "generico";
        var grupo = cat === "componente" ? ROT_GRUPO[gk] : null, ordemG = cat === "componente" ? ORDEM_GRUPO.indexOf(gk) : 0;
        var tipos = arr(f.tipos).length ? f.tipos : [{ id: "", nome: "Padrão" }];
        tipos.forEach(function (t) {
          var it = { id: cat + ":" + f.id + ":" + txt(t.id), cat: cat, nome: txt(f.nome) + " : " + txt(t.nome || t.id), familia: txt(f.nome), famId: f.id, tipoId: txt(t.id),
                     origem: "familia", grupo: grupo, ordemGrupo: ordemG, daRA: /^ra-/.test(f.id) ? 0 : 1, icone: ICONES[cat] };
          /* a miniatura desenhada da própria peça (mobiliário do catálogo, js/familiasmob.js): só no navegador, aos poucos */
          if (FM && FM.miniatura && f.geometria === "mob" && global.document) it.miniatura = function () { return FM.miniatura(f.id, txt(t.id)); };
          out.push(it);
        });
      });
      /* as famílias RA (ra-*) primeiro: a 1ª de cada lista é o padrão que a fita arma; as orçáveis (orc-*, SINAPI), da empresa e importadas vêm depois */
      out.sort(function (a, b) { return (a.ordemGrupo - b.ordemGrupo) || (a.daRA - b.daRA) || a.nome.localeCompare(b.nome); });
      this._cache[cat] = { t: agora, lista: out };
      return out;
    },

    /* o tipo atual da categoria: o último aplicado; sem ele, null */
    atual: function (cat) {
      var id = this._atual[cat], B = BIT(), t = id && B ? B.tipo(id) : null;
      if (t && t.miniatura) { try { var m = t.miniatura(); if (m) { var c = {}; Object.keys(t).forEach(function (k) { c[k] = t[k]; }); c.icone = m; return c; } } catch (e) {} }
      return t || null;
    },

    /* o esquema de Propriedades enquanto a ferramenta está armada: o seletor entra no topo (BimInstTipos.decorar) */
    esquema: function (cat) {
      var def = CATS[cat], self = this; if (!def) return null;
      var at = this.atual(cat);
      return { titulo: def.rotulo, icone: "familia", arqCat: cat, semEditarTipo: true,
        secoes: [{ nome: "Colocação", params: [
          { id: "arq:como", rotulo: "Como", leitura: true, valor: at ? "Está armado: " + def.dica : "Escolha o tipo acima; depois, " + def.dica },
          { id: "arq:bib", rotulo: "Biblioteca", tipo: "botao", rotuloBotao: "Abrir a biblioteca de famílias", fn: function () { self.abrirBiblioteca(); } }
        ] }] };
    },
    abrirBiblioteca: function () {
      if (this.host && this.host.biblioteca) return this.host.biblioteca();
      try { if (global.Gestao && global.Gestao._famSync && global.Gestao._famAbrir) { global.Gestao._famSync(); global.Gestao._famAbrir("biblioteca"); return true; } } catch (e) {}
      return false;
    },
    contexto: function (esquema) {
      var cat = esquema && esquema.arqCat; if (!CATS[cat]) return null;
      return { cat: cat, atual: this.atual(cat), alvo: { arq: true } };
    },
    _pintar: function (cat) { try { if (global.BimShell && global.BimShell.pintarProps) global.BimShell.pintarProps(this.esquema(cat)); } catch (e) {} },

    /* ARMAR a família do tipo escolhido: o próximo clique coloca (parede ou lugar). Devolve true se armou. */
    aplicar: function (t) {
      if (!t || !CATS[t.cat]) return false;
      var f = null; arr(this.fontes()).forEach(function (x) { if (x && x.id === t.famId) f = x; });
      if (!f) { toast("Família não encontrada na biblioteca: " + txt(t.familia), "aviso"); return false; }
      var ok = false;
      try {
        if (this.host && this.host.colocar) ok = this.host.colocar(f, t.tipoId) !== false;
        else if (global.FamiliaUI && global.FamiliaUI._ctx && global.FamiliaUI._ctx.colocar) { global.FamiliaUI._ctx.colocar(f, t.tipoId); ok = true; }
      } catch (e) { ok = false; }
      if (!ok) { toast("Não consegui armar " + txt(t.nome) + ".", "aviso"); return false; }
      this._atual[t.cat] = t.id;
      this._pintar(t.cat);   /* depois de armar: o editor repinta Propriedades ao trocar de ferramenta */
      return true;
    },

    /* o clique na FITA (Porta, Janela, Componente): arma o último tipo usado (ou o primeiro de Porta/Janela) e mostra o seletor.
       Componente sem recente não tem um "primeiro" que faça sentido: abre a lista para escolher. */
    abrir: function (cat) {
      var def = CATS[cat], B = BIT(); if (!def || !B) return false;
      try { if (this.host && this.host.preparar) this.host.preparar(); else if (global.Gestao && global.Gestao._famSync) global.Gestao._famSync(); } catch (e) {}
      this.esquecer(); if (B.esquecerFonte) B.esquecerFonte();
      var L = this.catalogo(cat);
      if (!L.length) { toast("Não há família de " + def.rotulo.toLowerCase() + " na biblioteca.", "aviso"); return false; }
      var rec = B.recentes(cat)[0] || null;
      if (!rec && cat === "componente") {
        this._pintar(cat);
        status("Componente: escolha o tipo em Propriedades.");
        try {
          var d = global.document, anc = d && d.querySelector ? d.querySelector(".rv-props .rv-tsel") : null;
          if (anc && B.abrirLista) B.abrirLista(anc, { cat: cat, atual: null, alvo: { arq: true } });
        } catch (e2) {}
        return true;
      }
      return this.aplicar(rec || L[0]);
    }
  };

  /* registra as três categorias no seletor das instalações */
  BimArqTipos.registrar = function () {
    var B = BIT(); if (!B || !B.registrarCategoria) return false;
    ORDEM.forEach(function (cat) {
      B.registrarCategoria(cat, {
        rotulo: CATS[cat].rotulo,
        catalogo: function () { return BimArqTipos.catalogo(cat); },
        contexto: function (esq) { return BimArqTipos.contexto(esq); },
        aplicar: function (t) { return BimArqTipos.aplicar(t); },
        esquecer: function () { BimArqTipos.esquecer(); }
      });
    });
    return true;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = BimArqTipos;
  global.BimArqTipos = BimArqTipos;
  try { BimArqTipos.registrar(); } catch (e) {}
})(typeof window !== "undefined" ? window : globalThis);
