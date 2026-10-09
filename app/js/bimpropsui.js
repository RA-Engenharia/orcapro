/* =====================================================================
 * bimpropsui.js — a PALETA DE PROPRIEDADES (prévia
 * `?previa=modelador`). Fase P1, Frente C do plano do BIM
 * (seções 3.1 e 6.1).
 *
 * O defeito que ela fecha (1.3, item 1): cada módulo montava as
 * Propriedades à mão (js/bimarqui.js secoesProps, js/biminstui.js…), cada
 * um com os seus nomes e o seu jeito de gravar. Aqui a paleta PEDE TUDO AO
 * REGISTRO (js/bimparam.js): os grupos e a ordem, o rótulo PT-BR,
 * o tipo de dado, a faixa, se é de leitura e — o principal — QUAL OP GRAVA
 * cada parâmetro (`def.escrita`). A tela não sabe o que é uma parede.
 *
 * O QUE APARECE
 *   · Topo: o TIPO (família : tipo) num seletor com busca, e
 *     "Editar tipo" — o diálogo de Propriedades de tipo (parâmetros de tipo
 *     por grupo, "Duplicar…", "Renomear…", "afeta N instâncias"), que grava
 *     UMA op `ajustarTipo`.
 *   · Grupos na ordem de BimParam.GRUPOS, recolhíveis; o estado de
 *     cada grupo fica guardado por usuário.
 *   · Cada linha: rótulo PT-BR, valor editável conforme o dado; leitura
 *     em cinza. UMA op por mudança (Ctrl+Z desfaz a mudança).
 *   · Seleção múltipla: valor igual aparece, diferente mostra "‹vários›";
 *     editar aplica a todas num `lote` (B8) — um Ctrl+Z desfaz tudo. Com
 *     categorias misturadas, o filtro "Comum (N)" mostra o que todas têm.
 *   · Marca: não repete na categoria (erro na linha); "Renumerar" no menu.
 *
 * COMO GRAVA (def.escrita → op):
 *   ajustar.restricoes.<campo>  {op:"ajustar", id, campos:{restricoes:{…}}}
 *                               — as restrições COMPLETAS da peça, montadas
 *                               pelo BimArqUI._restrPeca (P1-B)
 *   ajustar.escada.<k>          {op:"ajustar", id, campos:{escada:{k}}} (presa
 *                               a nível: desnível e base viram restrições)
 *   marcar.<campo> / marcar.params.<id>   {op:"marcar", id, …}
 *   ajustarTipo.valores.<k> / ajustarTipo.nome   BimParam.editarTipo
 *   instancia.inst.<Nome>       {op:"instancia", id, inst:{Nome: v}}
 *   ajustarAmbiente.<campo>     {op:"ajustarAmbiente", id, campos:{campo: v}} (P2-C)
 *   ajustar.linhaLoc            {op:"ajustar", id, campos:{linhaLoc: "<nome da linha de localização>"}} (P4)
 *   graute.<campo>              {op:"graute", id, campos:{campo: v}} (EMBREVE, js/bimgraute.js)
 *   marcar.materialProj         {op:"marcar", id, materialProj:"<id>"} (MATERIAIS, js/bimmateriais.js)
 * Uma op vai pelo BIM.b2Op (ou instanciaAlterar); várias, num BIM.editarLote.
 *
 * PURO × TELA: tudo o que decide (modelo da paleta, ‹vários›, leitura do
 * valor digitado, a op de cada edição, a marca) são funções puras deste
 * objeto, testadas em Node (tools/test-bimpropsui.js). A tela só desenha e
 * repassa. Sem a prévia, `ativo()` é falso e as Propriedades de antes ficam.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------ utilidades */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function igual(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function BPm() { return global.BimParam || null; }
  function Am() { return global.BimArq || null; }
  var VARIOS = "‹vários›";
  var NUMERICOS = { comprimento: 1, area: 1, volume: 1, angulo: 1, inclinacao: 1, massa: 1, secao: 1, inteiro: 1, numero: 1 };

  /* a peça do estado (caixa, cobertura ou família) pelo id */
  function elDe(estado, id) {
    var s = String(id), l = arr(estado && estado.caixas).concat(arr(estado && estado.coberturas)).concat(arr(estado && estado.familias)).concat(arr(estado && estado.forros)).concat(arr(estado && estado.ambientes));   /* P2-B: forros; P2-C: ambientes */
    var T11 = estado && estado.terreno; if (T11) l = l.concat(arr(T11.topos), arr(T11.subregioes), arr(T11.plataformas), arr(T11.divisas), arr(T11.componentes));   /* P11: terreno */
    l = l.concat(arr(estado && estado.telhados)).concat(arr(estado && estado.bordas)).concat(arr(estado && estado.fundacoes));   /* P3 */
    for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === s) return l[i];
    return null;
  }
  /* presa a nível (op v:2 ou migrada no replay): tem nível base e deslocamento */
  function presa(c) { return !!c && (c.nivelBase != null || c.nivelId != null) && c.deslocBase != null; }

  /* --------------------------------------------------- valor digitado */
  /* "2,80" · "2.80" · "2,80 m" · "280 cm" · "2800 mm" · "1.234,5" → número
     na unidade do parâmetro (m). Devolve { ok, valor } ou { ok:false, erro }. */
  function lerNumero(bruto, un) {
    var s = txt(bruto).trim().replace(/\s+/g, " ");
    if (!s) return { ok: false, erro: "Digite um valor." };
    var m = /^(-?[\d.,]+)\s*(mm|cm|m|m²|m2|m³|m3|°|%|kg|kg\/m|cm²|cm⁴|cm³|cm⁶|m²\/m)?$/i.exec(s);
    if (!m) return { ok: false, erro: "Número inválido: \"" + s + "\"." };
    var n = m[1];
    if (n.indexOf(",") >= 0) n = n.replace(/\./g, "").replace(",", ".");
    else if ((n.match(/\./g) || []).length > 1) n = n.replace(/\./g, "");
    var v = parseFloat(n);
    if (!isFinite(v)) return { ok: false, erro: "Número inválido: \"" + s + "\"." };
    var u = (m[2] || "").toLowerCase();
    if (un === "m" && u === "cm") v = v / 100;
    else if (un === "m" && u === "mm") v = v / 1000;
    else if (u && un && u !== un.toLowerCase() && !(u === "m2" && un === "m²") && !(u === "m3" && un === "m³")) return { ok: false, erro: "Unidade \"" + m[2] + "\" não serve aqui (o parâmetro é em " + un + ")." };
    return { ok: true, valor: Math.round(v * 1e6) / 1e6 };
  }
  function br(v, casas) {
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split(".");
    return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  /* o número no campo, sem a unidade (ela fica ao lado) */
  function numCampo(v, def) {
    if (!fin(Number(v))) return "";
    var BP = BPm(), t = BP ? BP.formatar(Number(v), def) : String(v), un = def && def.un;
    if (un && t.slice(-(un.length + 1)) === " " + un) t = t.slice(0, -(un.length + 1));
    else if (un && t.slice(-un.length) === un) t = t.slice(0, -un.length);
    return t;
  }

  var BimPropsUI = {
    VARIOS: VARIOS,

    /* ================================================================ PURO */

    /* o contexto que as funções puras usam: o estado do editor, o resolvido
       do registro e o que cada categoria oferece de tipo. Na tela vem de
       `contextoTela`; no teste, montado à mão. */
    contexto: function (estado, deps, extra) {
      var BP = BPm(); extra = extra || {};
      deps = deps || {};
      return {
        estado: estado, deps: deps, niveis: arr(deps.niveis),
        res: BP ? BP.resolver(estado, deps) : { pecas: [], porId: {}, avisos: [] },
        catalogos: extra.catalogos || {},
        restr: extra.restr || (global.BimArqUI && global.BimArqUI._restrPeca ? function (c, campo, v) { return global.BimArqUI._restrPeca(c, campo, v); } : null)
      };
    },

    /* o que pode ser editado e como: { tipo: numero|lista|simnao|texto,
       opcoes, un, faixa, leitura, motivo, tipoAfeta } — por definição e
       pelo estado das peças (ex.: "Deslocamento superior" só com a
       Restrição superior presa a um nível). */
    editor: function (ctx, def, pecas, opts) {
      var lado = (opts && opts.lado) || "instancia";
      var e = txt(def.escrita), ed = { tipo: "texto", opcoes: null, un: def.un || "", faixa: def.faixa || null, leitura: false, motivo: "" };
      if (NUMERICOS[def.dado]) ed.tipo = "numero";
      else if (def.dado === "simnao") ed.tipo = "simnao";
      else if (def.dado === "lista" || def.dado === "fase") { ed.tipo = "lista"; ed.opcoes = arr(def.opcoes).map(function (o) { return { id: String(o), rotulo: String(o) }; }); }
      /* P10 (js/bimfases.js): as fases do PROJETO (op fases), não só as do template */
      if (def.dado === "fase" && global.BimFases && global.BimFases.opcoesProps && ctx && ctx.estado) ed.opcoes = global.BimFases.opcoesProps(ctx.estado, def.id);
      else if (def.dado === "material") {
        var A = Am(); ed.tipo = "lista";
        ed.opcoes = A ? Object.keys(A.MATERIAIS).map(function (k) { return { id: k, rotulo: A.MATERIAIS[k].rotulo }; }) : [];
      } else if (def.dado === "materialProjeto") {
        /* MATERIAIS (js/bimmateriais.js): os materiais DO PROJETO desta obra; "" = o da categoria */
        var MU = global.BimMateriaisUI; ed.tipo = "lista";
        try { ed.opcoes = MU && MU.opcoesProps ? MU.opcoesProps() : null; } catch (eM) { ed.opcoes = null; }
        if (!ed.opcoes || !ed.opcoes.length) ed.opcoes = [{ id: "", rotulo: "<Por categoria>" }];
      } else if (def.dado === "nivel") {
        ed.tipo = "lista";
        ed.opcoes = (/restricaoSuperior$/.test(e) ? [{ id: "", rotulo: "Não conectada" }] : []).concat(ctx.niveis.map(function (n) { return { id: String(n.id), rotulo: txt(n.nome) }; }));
      }
      function so(m) { ed.leitura = true; ed.motivo = m; return ed; }
      if (def.leitura || !e) return so(def.fonte === "derivado" ? "Calculado pelo modelo." : "Somente leitura.");
      var virtual = pecas.some(function (p) { var R = BPm() && BPm().REGISTRO[p.categoria]; return R && R.virtual; });
      if (virtual) return so("Lance e patamar seguem a escada: edite a escada.");
      if (e === "ajustarTipo.ids") return so("Troque o tipo no seletor do topo.");
      if (e === "ajustarTipo.nome") return so("Use \"Renomear…\" em Editar tipo.");
      if (e === "família (tipo)") return so("É do tipo da família: troque o tipo ou use Editar família.");
      if (e === "ajustar.tipoParede") return so("As camadas vêm do tipo de parede: troque o tipo no seletor do topo.");
      if (e === "ajustar.anexarTopo") return so("Use o comando Anexar topo.");
      if (/^ajustarTipo\.valores\.perfil$/.test(e)) {
        if (lado !== "tipo") return so("É do tipo: use Editar tipo.");
        var semMapa = pecas.some(function (p) { var c = elDe(ctx.estado, p.id); return !(c && c.perfil && BimPropsUI.chavePerfil(def.id, c.perfil.forma)); });
        if (semMapa) return so("Esta medida não existe nesta forma de seção.");
        ed.tipo = "numero"; return ed;
      }
      if (/^ajustarTipo\.valores\./.test(e) && lado === "instancia") ed.tipoAfeta = true;
      var mr = /^ajustar\.restricoes\.(\w+)$/.exec(e) || (/^ajustar\.escada\.(desnivel|base)$/.test(e) && pecas.every(function (p) { return presa(elDe(ctx.estado, p.id)); }) ? [0, /desnivel$/.test(e) ? "alturaNaoConectada" : "deslocBase"] : null);
      if (mr) {
        var campo = mr[1];
        if (!ctx.niveis.length) return so("A obra não tem níveis: crie os níveis para prender a peça.");
        for (var i = 0; i < pecas.length; i++) {
          var c = elDe(ctx.estado, pecas[i].id);
          if (!c) return so("Peça não encontrada.");
          if (campo !== "nivelBase" && !presa(c)) return so("Prenda a peça a um nível (restrição da base) para editar.");
          if (campo === "deslocSuperior" && c.restricaoSuperior == null) return so("Restrição superior: não conectada.");
          if (campo === "alturaNaoConectada" && c.restricaoSuperior != null) return so("A altura vem dos níveis (restrição superior).");
        }
        ed.restricao = campo;
        /* as mesmas travas do BimArq.normRestr (o que passar disso a op perderia calada) */
        if (campo === "alturaNaoConectada" && !ed.faixa) ed.faixa = { min: 0.1, max: 60 };
        if ((campo === "deslocBase" || campo === "deslocSuperior") && !ed.faixa) ed.faixa = { min: -200, max: 200 };
      }
      return ed;
    },

    /* o valor CRU de uma linha numa peça (o que se compara para o ‹vários› e
       o que o campo edita): o id do nível, a chave do material, o número */
    bruto: function (ctx, def, peca, it) {
      var e = txt(def.escrita), c = elDe(ctx.estado, peca.id);
      if (def.dado === "nivel" && c) {
        if (/restricaoSuperior$/.test(e)) return c.restricaoSuperior != null ? String(c.restricaoSuperior) : "";
        if (/nivelBase$/.test(e)) return c.nivelBase != null ? String(c.nivelBase) : (c.nivelId != null ? String(c.nivelId) : "");
        if (e === "forro.nivelId" || e === "telhado.nivelId" || e === "fundacao.nivelId") return c.nivelId != null ? String(c.nivelId) : "";   /* P2-B */
        if (e === "p11.plataforma.nivelId") return c.nivelId != null ? String(c.nivelId) : "";   /* P11 */
        /* P2-C: o limite superior do ambiente (vazio = o próprio nível) */
        if (/^ajustarAmbiente\.limiteSuperior$/.test(e)) return c.limiteSuperior != null ? String(c.limiteSuperior) : (c.nivelId != null ? String(c.nivelId) : "");
      }
      if (def.dado === "material" && c && c.material) return String(c.material);
      if (def.dado === "materialProjeto") return c && c.materialProj ? String(c.materialProj) : "";   /* MATERIAIS: o id (o select mostra o nome) */
      return it ? it.valor : null;
    },

    /* --------------------------------------------- o modelo da paleta
     * ids: a seleção; filtro: null (automático) | "comum" | categoria.
     * Devolve { pecas, cats:[{cat, nome, n}], filtro, secoes:[{grupo, linhas}],
     *           tipo:{cat, tipoId, nome, familia, varios, n} } */
    modelo: function (ctx, ids, filtro) {
      var BP = BPm(), res = ctx.res, todas = arr(ids).map(function (id) { return res.porId[String(id)]; }).filter(Boolean);
      var cats = [], porCat = {};
      todas.forEach(function (p) { if (!porCat[p.categoria]) { porCat[p.categoria] = { cat: p.categoria, nome: p.nomeCategoria, n: 0 }; cats.push(porCat[p.categoria]); } porCat[p.categoria].n++; });
      if (!filtro || (filtro !== "comum" && !porCat[filtro])) filtro = cats.length === 1 ? cats[0].cat : "comum";
      if (filtro === "comum" && cats.length === 1) filtro = cats[0].cat;
      var pecas = filtro === "comum" ? todas : todas.filter(function (p) { return p.categoria === filtro; });
      var out = { pecas: pecas, ids: pecas.map(function (p) { return p.id; }), cats: cats, filtro: filtro, secoes: [], tipo: null, marcaCat: null };
      if (!pecas.length || !BP) return out;
      /* as linhas: as da 1ª peça, na ordem dos grupos; no "Comum", só as que
         TODAS têm (pelo id do parâmetro) */
      var base = BP.secoes(pecas[0], { lado: "instancia" });
      base.forEach(function (sec) {
        var linhas = [];
        sec.itens.forEach(function (it0) {
          var def = it0.def;
          if (pecas.some(function (p) { return !p.porId[def.id] || p.porId[def.id].def.lado !== "instancia"; })) return;
          var defs = pecas.map(function (p) { return p.porId[def.id].def; });
          /* mesma id com escrita diferente entre categorias (ex.: Altura do pilar × parede): fica de leitura */
          var ed = defs.every(function (d) { return d.escrita === def.escrita && d.dado === def.dado; }) ? BimPropsUI.editor(ctx, def, pecas) : { tipo: "texto", leitura: true, motivo: "Categorias diferentes: edite uma de cada vez." };
          var brutos = pecas.map(function (p) { return BimPropsUI.bruto(ctx, def, p, p.porId[def.id]); });
          var varios = brutos.some(function (b) { return !igual(b, brutos[0]); });
          var it = pecas[0].porId[def.id];
          linhas.push({ id: def.id, nome: def.nome, grupo: def.grupo, def: def, dado: def.dado, un: def.un || "", orc: def.orc || null,
                        valor: varios ? null : it.valor, bruto: varios ? null : brutos[0], texto: varios ? VARIOS : it.texto, varios: varios, editor: ed });
        });
        if (linhas.length) out.secoes.push({ grupo: sec.grupo, linhas: linhas });
      });
      /* o tipo: só com uma categoria */
      if (filtro !== "comum") {
        var t0 = pecas[0], mesmo = pecas.every(function (p) { return p.tipoId === t0.tipoId; });
        var famTxt = t0.porId.ELEM_FAMILY_PARAM ? t0.porId.ELEM_FAMILY_PARAM.valor : (BP.REGISTRO[t0.categoria] ? BP.REGISTRO[t0.categoria].familia : null);
        out.tipo = { cat: t0.categoria, tipoId: mesmo ? t0.tipoId : null, nome: mesmo ? t0.tipoNome : VARIOS, familia: famTxt || t0.nomeCategoria, varios: !mesmo, n: pecas.length,
                     editavel: mesmo && !(BP.REGISTRO[t0.categoria] && BP.REGISTRO[t0.categoria].virtual) };
        var R = BP.REGISTRO[t0.categoria]; if (R && R.prefixo && !R.virtual) out.marcaCat = t0.categoria;
      }
      return out;
    },

    /* ------------------------------------------------ a leitura do valor */
    lerValor: function (ed, def, bruto) {
      if (ed.tipo === "numero") {
        var r = lerNumero(bruto, def.un || "");
        if (!r.ok) return r;
        if (def.dado === "inteiro") { if (Math.abs(r.valor - Math.round(r.valor)) > 1e-9) return { ok: false, erro: "Use um número inteiro." }; r.valor = Math.round(r.valor); }
        var fx = ed.faixa;
        if (fx && ((fx.min != null && r.valor < fx.min - 1e-9) || (fx.max != null && r.valor > fx.max + 1e-9))) {
          var cas = def.dado === "comprimento" ? 2 : 2;
          return { ok: false, erro: "Fora da faixa: de " + br(fx.min, cas) + " a " + br(fx.max, cas) + (def.un ? " " + def.un : "") + "." };
        }
        return r;
      }
      if (ed.tipo === "simnao") return { ok: true, valor: bruto === true || bruto === "true" || bruto === "Sim" || bruto === 1 };
      if (ed.tipo === "lista") {
        var s = txt(bruto);
        if (!arr(ed.opcoes).some(function (o) { return o.id === s; })) return { ok: false, erro: "Opção que não existe: \"" + s + "\"." };
        return { ok: true, valor: s };
      }
      return { ok: true, valor: txt(bruto).trim() };
    },

    /* ------------------------------------------------ marca */
    /* a marca não repete na categoria (a automática nunca repete; a digitada
       é conferida aqui, com a seleção inteira) */
    validarMarca: function (ctx, ids, marca) {
      var BP = BPm(), mk = txt(marca).trim();
      if (mk.length > 24) return { ok: false, erro: "A marca tem no máximo 24 caracteres." };
      if (!mk) return { ok: true };
      var porCat = {};
      ids.forEach(function (id) { var p = ctx.res.porId[id]; if (p) porCat[p.categoria] = (porCat[p.categoria] || 0) + 1; });
      var rep = Object.keys(porCat).filter(function (k) { return porCat[k] > 1; })[0];
      if (rep) return { ok: false, erro: "A marca \"" + mk + "\" ficaria repetida em " + porCat[rep] + " peças de " + BP.REGISTRO[rep].nome + ". Deixe vazio para a automática ou use Renumerar." };
      for (var i = 0; i < ids.length; i++) {
        var r = BP.opMarcar(ctx.res, ids[i], mk);
        /* sem o id interno da peça na mensagem: quem lê é o engenheiro */
        if (!r.ok) { var p = ctx.res.porId[ids[i]]; return { ok: false, erro: /já é de outra/.test(r.motivo) && p ? "A marca \"" + mk + "\" já está em outra peça de " + p.nomeCategoria + ": a marca não repete na categoria." : r.motivo }; }
      }
      return { ok: true };
    },
    opRenumerar: function (ctx, cat) { var BP = BPm(); return BP ? BP.opRenumerar(ctx.res, cat) : { ok: false, motivo: "Registro não carregado." }; },

    /* ------------------------------------------------ perfil do tipo */
    /* a medida do perfil (BimArq.PERFIS) que cada parâmetro de seção
       edita, por forma */
    SECAO: {
      STRUCTURAL_SECTION_COMMON_HEIGHT: { ret: "h", circ: "d", I: "d", U: "d", L: "a", "tubo-ret": "h", "tubo-circ": "D" },
      STRUCTURAL_SECTION_COMMON_WIDTH: { ret: "b", circ: "d", I: "bf", U: "bf", L: "b", "tubo-ret": "b", "tubo-circ": "D" },
      STRUCTURAL_SECTION_ISHAPE_WEBTHICKNESS: { I: "tw", U: "tw" },
      STRUCTURAL_SECTION_ISHAPE_FLANGETHICKNESS: { I: "tf", U: "tf" }
    },
    chavePerfil: function (defId, forma) { var m = BimPropsUI.SECAO[defId]; return m && m[forma] ? m[forma] : null; },
    /* os valores de TIPO que descrevem o perfil de uma peça (forma + medidas
       + material); `perfil: null` tira o nome do catálogo (a medida mudou) */
    valoresPerfil: function (c) {
      var A = Am(); if (!c || !c.perfil || !A || !A.PERFIS[c.perfil.forma]) return null;
      var v = { forma: c.perfil.forma, perfil: null };
      A.PERFIS[c.perfil.forma].campos.forEach(function (k) { if (fin(Number(c.perfil[k[0]]))) v[k[0]] = Number(c.perfil[k[0]]); });
      if (c.material) v.material = c.material;
      return v;
    },

    /* ------------------------------------------------ edição → op
     * ids: as peças (já do filtro); def; valor (já lido).
     * Devolve { ok, ops:[…] } ou { ok:false, erro }. */
    opsEdicao: function (ctx, ids, def, valor) {
      var BP = BPm(), e = txt(def.escrita), ops = [], erro = null;
      function falha(m) { erro = erro || m; }
      var m;
      if ((m = /^ajustar\.restricoes\.(\w+)$/.exec(e)) || (m = /^ajustar\.escada\.(desnivel|base)$/.exec(e))) {
        var campoR = m[1] === "desnivel" ? "alturaNaoConectada" : (m[1] === "base" ? "deslocBase" : m[1]);
        ids.forEach(function (id) {
          var c = elDe(ctx.estado, id); if (!c) return falha("Peça não encontrada: " + id + ".");
          if (/^ajustar\.escada\./.test(e) && !presa(c)) {   /* escada solta: a altura/base da própria escada */
            var esc = {}; esc[m[1]] = valor; ops.push({ op: "ajustar", id: c.id, campos: { escada: esc } }); return;
          }
          var rs = ctx.restr ? ctx.restr(c, campoR, campoR === "nivelBase" || campoR === "restricaoSuperior" ? valor : String(valor)) : null;
          if (!rs) return falha("Esta restrição não se aplica a esta peça agora.");
          ops.push({ op: "ajustar", id: c.id, campos: { restricoes: rs } });
        });
      } else if ((m = /^ajustar\.escada\.(\w+)$/.exec(e))) {
        ids.forEach(function (id) { var o = {}; o[m[1]] = valor; ops.push({ op: "ajustar", id: id, campos: { escada: o } }); });
      } else if (e === "marcar.marca") {
        var v = BimPropsUI.validarMarca(ctx, ids, valor);
        if (!v.ok) return { ok: false, erro: v.erro };
        ids.forEach(function (id) { ops.push({ op: "marcar", id: id, marca: txt(valor).trim() }); });
      } else if ((m = /^marcar\.params\.(.+)$/.exec(e))) {
        ids.forEach(function (id) { var pr = {}; pr[m[1]] = valor === "" ? null : valor; ops.push({ op: "marcar", id: id, params: pr }); });
      } else if ((m = /^marcar\.(\w+)$/.exec(e))) {
        ids.forEach(function (id) { var o = { op: "marcar", id: id }; o[m[1]] = txt(valor); ops.push(o); });
      } else if ((m = /^ajustarTipo\.valores\.(.+)$/.exec(e))) {
        /* parâmetro do TIPO: uma op por tipo (todas as instâncias dele mudam) */
        var vistos = {};
        ids.forEach(function (id) {
          var p = ctx.res.porId[id]; if (!p) return;
          var k = p.categoria + "|" + p.tipoId; if (vistos[k]) return; vistos[k] = 1;
          var val = {}; val[m[1]] = valor;
          var r = BP.editarTipo(ctx.estado, p.categoria, p.tipoId, val, null, ctx.deps);
          if (r.ok) ops.push(r.op); else falha(r.motivo);
        });
      } else if (e === "forro.delimitaAmbiente") {
        /* "Delimitação de ambientes" do forro: Não fica gravado; Sim volta ao padrão (null) */
        ids.forEach(function (id) { ops.push({ op: "forro", id: id, delimitaAmbiente: valor === false ? false : null }); });
      } else if ((m = /^forro\.(nivelId|deslocNivel|inclinacao|dirInclinacao)$/.exec(e))) {
        /* P2-B: o forro (js/bimforro.js) se altera pela própria op, campo a campo */
        ids.forEach(function (id) { var o = { op: "forro", id: id }; o[m[1]] = m[1] === "nivelId" ? (valor === "" || valor == null ? null : String(valor)) : (valor === "" || valor == null ? null : Number(valor)); ops.push(o); });
      } else if ((m = /^p11\.(topossolido|subregiao|plataforma|divisa|compTerreno)\.(\w+)$/.exec(e))) {
        /* P11 (js/bimterreno.js): o terreno se altera pela própria op, campo a campo; vazio = null (volta ao padrão) */
        ids.forEach(function (id) {
          var o = { op: m[1], id: id }, v = valor === "" || valor == null ? null : valor;
          if (v !== null && (m[2] === "nivelId" || m[2] === "nome" || m[2] === "material")) v = String(v);
          else if (v !== null && m[2] !== "rotularMestras") v = Number(v);
          o[m[2]] = v; ops.push(o);
        });
      } else if ((m = /^(telhado|borda|fundacao)\.(\w+)$/.exec(e))) {
        /* P3: telhado, borda e fundação (js/bimtelhado.js, js/bimfundacao.js) se alteram pela própria op, campo a campo;
           vazio volta ao padrão (null). Texto: o nível, o telhado unido e a inclinação por aresta. */
        var TXT3 = { nivelId: 1, unir: 1, inclinacoes: 1 };
        ids.forEach(function (id) {
          var o = { op: m[1], id: id };
          o[m[2]] = valor === "" || valor == null ? null : (TXT3[m[2]] ? String(valor) : (m[2] === "nEstacas" ? Math.round(Number(valor)) : Number(valor)));
          ops.push(o);
        });
      } else if ((m = /^ajustarAmbiente\.(\w+)$/.exec(e))) {
        /* P2-C: os parâmetros do AMBIENTE (nome, número, acabamentos, limites) — op ajustarAmbiente; vazio volta ao automático */
        ids.forEach(function (id) { var cp = {}; cp[m[1]] = valor === "" || valor == null ? null : valor; ops.push({ op: "ajustarAmbiente", id: id, campos: cp }); });
      } else if (e === "ajustar.linhaLoc") {
        /* P4: a Linha de localização da parede (muda a referência; a parede não anda) */
        ids.forEach(function (id) { ops.push({ op: "ajustar", id: id, campos: { linhaLoc: valor } }); });
      } else if (e === "instSistema.nome") {
        /* P12: o nome do sistema (js/biminst.js) — gravado no trecho; vale para o sistema inteiro dele */
        ids.forEach(function (id) { ops.push({ op: "instSistema", id: id, nome: txt(valor).trim() }); });
      } else if ((m = /^instAlterar\.(dn)$/.exec(e))) {
        /* P12: o DN do trecho (fora da lista comercial = aviso e pendente na SINAPI, como na B5) */
        var dnv = Number(valor); if (!(dnv > 0)) return { ok: false, erro: "DN inválido." };
        ids.forEach(function (id) { ops.push({ op: "instAlterar", id: id, dn: dnv }); });
      } else if ((m = /^ajustar\.(estrut|rampa|guarda)\.(\w+)$/.exec(e))) {
        /* P9 — GANCHO: viga e pilar (justificação, deslocamentos, extensões, estilo de coluna —
           js/bimestrut.js), rampa e guarda-corpo, campo a campo. "Deslocamento do nível
           inicial/final" é o do nível de referência MAIS o da ponta: grava só a parte da ponta. */
        ids.forEach(function (id) {
          var c = elDe(ctx.estado, id); if (!c) return falha("Peça não encontrada: " + id + ".");
          var k = m[2], v = valor, cp = {}, campos = {};
          if (m[1] === "estrut" && (k === "deslocNivelIni" || k === "deslocNivelFim")) {
            var dk = k === "deslocNivelIni" ? "dIni" : "dFim", atual = BP.valor(ctx.res.porId[id], k === "deslocNivelIni" ? "STRUCTURAL_BEAM_END0_ELEVATION" : "STRUCTURAL_BEAM_END1_ELEVATION");
            if (!fin(Number(atual)) || !fin(Number(v))) return falha("Deslocamento inválido.");
            v = Math.round((Number(v) - (Number(atual) - (Number(c[dk]) || 0))) * 1e6) / 1e6; k = dk;
          }
          cp[k] = v === "" || v == null ? null : v; campos[m[1]] = cp;
          ops.push({ op: "ajustar", id: id, campos: campos });
        });
      } else if ((m = /^graute\.(\w+)$/.exec(e))) {
        /* EMBREVE: graute e armadura da parede (js/bimgraute.js) — op graute, campo a campo;
           o texto da tela ("10,0 mm", "20 MPa") vira o número da op; vazio volta ao padrão */
        var BG = global.BimGraute, vg = BG && BG.normalizar ? BG.normalizar(m[1], valor) : valor;
        if (vg === undefined) return { ok: false, erro: "Valor que não vale para este parâmetro." };
        ids.forEach(function (id) { var cg = {}; cg[m[1]] = vg; ops.push({ op: "graute", id: id, campos: cg }); });
      } else if ((m = /^instancia\.inst\.(.+)$/.exec(e))) {
        ids.forEach(function (id) { var o = {}; o[m[1]] = valor; ops.push({ op: "instancia", id: id, inst: o }); });
      } else if ((m = /^ajustarAmbiente\.(\w+)$/.exec(e))) {
        /* P2-D: Nome, Número, acabamentos, limite e deslocamentos do AMBIENTE (js/bimambiente.js);
           texto vazio = null (volta ao automático: número automático, nome "Ambiente") */
        ids.forEach(function (id) {
          if (!elDe(ctx.estado, id)) return falha("Ambiente não encontrado: " + id + ".");
          var cp = {}; cp[m[1]] = (valor === "" || valor == null) ? null : valor;
          ops.push({ op: "ajustarAmbiente", id: id, campos: cp });
        });
      } else return { ok: false, erro: "Este parâmetro não se edita aqui." };
      if (erro) return { ok: false, erro: erro };
      if (!ops.length) return { ok: false, erro: "Nada para mudar." };
      return { ok: true, ops: ops };
    },
    /* várias ops = UM lote (um Ctrl+Z desfaz tudo, B8) */
    empacotar: function (ops, rotulo, seq) {
      if (!ops || !ops.length) return null;
      if (ops.length === 1) return ops[0];
      return { op: "lote", id: "props-" + (seq != null ? seq : Date.now().toString(36)), origem: "propriedades", pedido: txt(rotulo).slice(0, 300), ops: ops };
    },

    /* ------------------------------------------------ tipos */
    /* os tipos que a categoria oferece no seletor do topo:
       [{ id, nome, familia, origem: "projeto"|"uso"|"catalogo", campos?, valores? }] */
    tiposDisponiveis: function (ctx, cat, famId) {
      var BP = BPm(), out = [], vistos = {};
      function add(t) { if (vistos[t.id]) return; vistos[t.id] = 1; out.push(t); }
      var R = BP && BP.REGISTRO[cat], fam = R && R.familia ? R.familia : null;
      var cg = ctx.catalogos || {};
      if (cat === "porta" || cat === "janela" || cat === "generico") {
        arr(typeof cg.familia === "function" ? cg.familia(famId) : []).forEach(function (t) { add({ id: String(famId) + "|" + t.id, nome: t.nome, familia: t.familia || fam || "", origem: "familia", tipoFam: t.id }); });
        return out;
      }
      if (cg[cat] && cg[cat].length) cg[cat].forEach(function (t) { add({ id: String(t.id), nome: t.nome, familia: fam, origem: "catalogo", campos: t.campos }); });
      arr(BP ? BP.tipos(ctx.estado, cat, ctx.deps) : []).forEach(function (t) {
        if (vistos[t.id]) return;
        add({ id: String(t.id), nome: t.nome, familia: fam, origem: t.projeto ? "projeto" : "uso", valores: t.valores, instancias: t.instancias });
      });
      return out;
    },
    /* trocar o tipo das peças selecionadas pelo item do seletor → ops */
    opsTrocarTipo: function (ctx, ids, cat, item) {
      var BP = BPm(), ops = [];
      if (!item) return { ok: false, erro: "Tipo não encontrado." };
      ids = ids.filter(function (id) { var p = ctx.res.porId[id]; return p && p.categoria === cat && p.tipoId !== item.id; });
      if (!ids.length) return { ok: false, erro: "As peças já são deste tipo." };
      if (item.origem === "familia") { ids.forEach(function (id) { ops.push({ op: "instancia", id: id, tipoId: String(item.tipoFam) }); }); return { ok: true, ops: ops }; }
      if (cat === "forro" && item.origem !== "projeto") {   /* P2-B: o tipo do forro vai na op forro (catálogo pelo id, ou a foto das camadas); tipo do projeto = ajustarTipo, abaixo */
        var BFt = global.BimForro;
        ids.forEach(function (id) { var o = BFt ? BFt.opTrocarTipo(ctx.estado, id, item.campos && item.campos.forroTipoId ? item.campos.forroTipoId : item.id) : null; if (o) ops.push(o); });
        return ops.length ? { ok: true, ops: ops } : { ok: false, erro: "Tipo de forro não encontrado." };
      }
      if (cat === "telhado" && global.BimTelhado) {   /* P3: o tipo do telhado vai na op telhado (catálogo pelo id, ou a foto das camadas) */
        ids.forEach(function (id) { var o = global.BimTelhado.opTrocarTipo(ctx.estado, id, item.campos && item.campos.telhadoTipoId ? item.campos.telhadoTipoId : item.id); if (o) ops.push(o); });
        return ops.length ? { ok: true, ops: ops } : { ok: false, erro: "Tipo de telhado não encontrado." };
      }
      if (item.campos) { ids.forEach(function (id) { ops.push({ op: "ajustar", id: id, campos: clone(item.campos) }); }); return { ok: true, ops: ops }; }
      if (item.origem === "projeto") return { ok: true, ops: [{ op: "ajustarTipo", categoria: cat, tipoId: String(item.id), ids: ids.map(String) }] };
      if (item.perfilCatalogo) {
        /* perfil do catálogo (AISC): o tipo do projeto com esse perfil, ou um novo */
        var ja = arr(BP.tipos(ctx.estado, cat, ctx.deps)).filter(function (t) { return t.projeto && t.valores && t.valores.perfil === item.perfilCatalogo; })[0];
        if (ja) return { ok: true, ops: [{ op: "ajustarTipo", categoria: cat, tipoId: String(ja.id), ids: ids.map(String) }] };
        var nv = BP.criarTipo(ctx.estado, cat, item.perfilCatalogo, { perfil: item.perfilCatalogo, material: "aco" }, ids);
        return nv.ok ? { ok: true, ops: [nv.op] } : { ok: false, erro: nv.motivo };
      }
      /* tipo implícito em uso: vira tipo do projeto com o perfil de quem já é dele */
      if (cat === "pilar" || cat === "viga") {
        var amostra = elDe(ctx.estado, arr(item.instancias)[0]), val = BimPropsUI.valoresPerfil(amostra);
        if (!val) return { ok: false, erro: "Não achei o perfil deste tipo." };
        var r = BP.editarTipo(ctx.estado, cat, item.id, val, item.nome, ctx.deps);
        if (!r.ok) return { ok: false, erro: r.motivo };
        var op = r.op; op.ids = arr(op.ids).concat(ids.map(String)).filter(function (x, i, a) { return a.indexOf(x) === i; });
        return { ok: true, ops: [op] };
      }
      return { ok: false, erro: "Este tipo não se troca por aqui." };
    },

    /* ------------------------------------------------ Editar tipo */
    /* o diálogo de Propriedades de tipo: { cat, tipoId, nome, n, projeto,
       secoes:[{grupo, linhas}], rep } */
    modeloTipo: function (ctx, cat, tipoId) {
      var BP = BPm(); if (!BP) return null;
      var t = arr(BP.tipos(ctx.estado, cat, ctx.deps)).filter(function (q) { return String(q.id) === String(tipoId); })[0];
      if (!t || !t.instancias.length) return null;
      var rep = ctx.res.porId[t.instancias[0]]; if (!rep) return null;
      var secoes = BP.secoes(rep, { lado: "tipo" }).map(function (s) {
        return { grupo: s.grupo, linhas: s.itens.map(function (it) {
          var ed = BimPropsUI.editor(ctx, it.def, [rep], { lado: "tipo" });
          return { id: it.def.id, nome: it.def.nome, def: it.def, dado: it.def.dado, un: it.def.un || "", valor: it.valor, bruto: it.valor, texto: it.texto, editor: ed };
        }) };
      });
      return { cat: cat, tipoId: String(t.id), nome: t.nome, projeto: !!t.projeto, n: t.instancias.length, instancias: t.instancias.slice(), secoes: secoes, rep: rep.id,
               familia: rep.porId.ELEM_FAMILY_PARAM ? rep.porId.ELEM_FAMILY_PARAM.valor : "" };
    },
    /* as mudanças do diálogo ({defId: valor lido}) → UMA op ajustarTipo */
    opTipo: function (ctx, mt, mudancas, nome) {
      var BP = BPm(), valores = {}, erro = null, perfil = null;
      Object.keys(mudancas || {}).forEach(function (defId) {
        var lin = null;
        mt.secoes.forEach(function (s) { s.linhas.forEach(function (l) { if (l.id === defId) lin = l; }); });
        if (!lin || lin.editor.leitura) { erro = erro || "\"" + (lin ? lin.nome : defId) + "\" não se edita aqui."; return; }
        var k = /^ajustarTipo\.valores\.(.+)$/.exec(txt(lin.def.escrita));
        if (!k) { erro = erro || "\"" + lin.nome + "\" não é do tipo."; return; }
        if (k[1] === "perfil") {
          var c = elDe(ctx.estado, mt.rep);
          perfil = perfil || BimPropsUI.valoresPerfil(c);
          var ch = perfil && BimPropsUI.chavePerfil(defId, perfil.forma);
          if (!ch) { erro = erro || "Medida que não existe nesta seção."; return; }
          perfil[ch] = mudancas[defId];
          if (perfil.forma === "circ" || perfil.forma === "tubo-circ") { /* altura = largura = diâmetro */ }
        } else valores[k[1]] = mudancas[defId];
      });
      if (erro) return { ok: false, erro: erro };
      if (perfil) Object.keys(perfil).forEach(function (q) { valores[q] = perfil[q]; });
      if (!Object.keys(valores).length && !nome) return { ok: false, erro: "Nada mudou." };
      var r = BP.editarTipo(ctx.estado, mt.cat, mt.tipoId, valores, nome || null, ctx.deps);
      return r.ok ? { ok: true, op: r.op, instancias: r.instancias } : { ok: false, erro: r.motivo };
    },
    /* "Duplicar…": tipo novo com os valores deste; as peças selecionadas passam para ele */
    opDuplicar: function (ctx, mt, nome, ids) {
      var BP = BPm(), nm = txt(nome).trim();
      if (!nm) return { ok: false, erro: "Dê um nome ao tipo novo." };
      if (arr(BP.tipos(ctx.estado, mt.cat, ctx.deps)).some(function (t) { return txt(t.nome).toLowerCase() === nm.toLowerCase(); })) return { ok: false, erro: "Já existe um tipo \"" + nm + "\" nesta categoria." };
      var t = arr(BP.tipos(ctx.estado, mt.cat, ctx.deps)).filter(function (q) { return String(q.id) === mt.tipoId; })[0];
      var val = t && t.projeto ? clone(t.valores) : {};
      if ((mt.cat === "pilar" || mt.cat === "viga") && !Object.keys(val).length) val = BimPropsUI.valoresPerfil(elDe(ctx.estado, mt.rep)) || {};
      Object.keys(val).forEach(function (k) { if (val[k] === null) delete val[k]; });
      var r = BP.criarTipo(ctx.estado, mt.cat, nm, val, ids);
      return r.ok ? { ok: true, op: r.op } : { ok: false, erro: r.motivo };
    },
    opRenomear: function (ctx, mt, nome) {
      var BP = BPm(), nm = txt(nome).trim();
      if (!nm) return { ok: false, erro: "O tipo precisa de nome." };
      if (arr(BP.tipos(ctx.estado, mt.cat, ctx.deps)).some(function (t) { return String(t.id) !== mt.tipoId && txt(t.nome).toLowerCase() === nm.toLowerCase(); })) return { ok: false, erro: "Já existe um tipo \"" + nm + "\" nesta categoria." };
      var r = BP.editarTipo(ctx.estado, mt.cat, mt.tipoId, {}, nm, ctx.deps);
      return r.ok ? { ok: true, op: r.op } : { ok: false, erro: r.motivo };
    },

    /* ================================================================ TELA */
    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && BPm() && global.BIM && global.BIM.editarEstado); } catch (e) { return false; } },
    _seq: 0,
    _G: null,
    _tela: null,   /* { uid, ids, filtro, extras, aoMudarExtra } da paleta na tela */

    /* o contexto da tela: o estado do editor e as dependências do registro */
    contextoTela: function () {
      var B = global.BIM, G = this._G, est = B && B.editarEstado ? B.editarEstado() : null;
      if (!est) return null;
      try { if (G && G._famConfig) G._famConfig(); } catch (eF) {}
      var FU = global.FamiliaUI, A = Am(), AT = global.AlvTipos, RU = global.BimArqUI;
      function fam(id) { try { return FU && FU.obter ? FU.obter(id) : null; } catch (e) { return null; } }
      var deps = {
        avaliarFam: function (f, t, i) { return B.familiaAvaliar ? B.familiaAvaliar(f, t, i) : null; },
        categoriaFam: function (id) { var f = fam(id); return f ? f.categoria : null; },
        familia: fam, nomeFam: function (id) { var f = fam(id); return f ? f.nome : null; },
        niveis: RU && RU.niveis ? RU.niveis().map(function (n) { return { id: n.id, nome: n.nome, elevacao: +n.elevacao || 0 }; }) : [],
        /* P1-acab: os parâmetros do projeto da tela (BIM.parametrosProjeto) — os mesmos que o IFC leva */
        projeto: B.parametrosProjeto ? B.parametrosProjeto() : null,
        mep: true   /* P12: tubos, conexões, acessórios, eletrodutos e eletrocalhas entram na paleta */
      };
      var cat = {};
      try {
        if (AT && A) cat.parede = AT.listar().map(function (t) { var tp = A.tipoParede(AT.tipo(t.id)); return tp ? { id: t.id, nome: t.rotulo, campos: { tipoParede: tp } } : null; }).filter(Boolean);
      } catch (eP) {}
      if (A) {
        cat.laje = A.TIPOS_LAJE.map(function (t) { return { id: t.id, nome: t.rotulo, campos: { tipoLaje: t } }; });
        cat.escada = A.TIPOS_ESCADA.map(function (t) { return { id: t.id, nome: t.rotulo, campos: { escada: { tipoId: t.id, emax: t.emax, pmin: t.pmin, piso: t.piso, larguraMin: t.larguraMin } } }; });
      }
      if (global.BimForro) cat.forro = global.BimForro.TIPOS.map(function (t) { return { id: t.id, nome: t.rotulo, campos: { forroTipoId: t.id } }; });   /* P2-B */
      if (global.BimTelhado) cat.telhado = global.BimTelhado.TIPOS.map(function (t) { return { id: t.id, nome: t.rotulo, campos: { telhadoTipoId: t.id } }; });   /* P3 */
      cat.familia = function (famId) { var f = fam(famId); return f ? arr(f.tipos).map(function (t) { return { id: t.id, nome: t.nome, familia: f.nome }; }) : []; };
      return this.contexto(est.estado, deps, { catalogos: cat });
    },
    /* a seleção atual: a do desenho de precisão (Ctrl+clique soma) quando ela
       contém a peça clicada; senão só a peça */
    _idsSelecao: function (id) {
      var ids = [String(id)];
      try {
        var pr = global.BIM && global.BIM.precisao ? global.BIM.precisao() : null, sel = pr && pr.selecao ? pr.selecao().map(String) : [];
        if (sel.length > 1 && sel.indexOf(String(id)) >= 0) ids = sel;
      } catch (e) {}
      return ids;
    },

    /* o esquema que vai para o BimShell.pintarProps: ele desenha com `render`.
       null = esta peça não é do registro (IFC importado, instalação) — fica a
       tela de antes. opts.extras = seções no formato antigo (orçamento,
       estilo, abertura…), opts.aoMudarExtra = quem trata a mudança delas. */
    esquema: function (info, G, opts) {
      if (!this.ativo() || !info || !/^edit:/.test(String(info.uid || ""))) return null;
      this._G = G || this._G;
      var id = String(info.uid).slice(5), ctx = this.contextoTela();
      if (!ctx || !ctx.res.porId[id]) return null;
      var self = this, ids = this._idsSelecao(id).filter(function (x) { return !!ctx.res.porId[x]; });
      var antes = this._tela && this._tela.uid === info.uid && igual(this._tela.idsTodos, ids) ? this._tela.filtro : null;
      this._tela = { uid: info.uid, info: info, idsTodos: ids, filtro: antes, extras: (opts && opts.extras) || [], aoMudarExtra: opts && opts.aoMudarExtra };
      var p0 = ctx.res.porId[id];
      return { bp1: true, daPeca: true, uid: info.uid, semEditarTipo: true, titulo: p0.nomeCategoria, icone: p0.categoria === "parede" ? "parede" : (p0.categoria === "pilar" ? "pilar" : (p0.categoria === "ambiente" ? "ambiente" : "quadrado")), secoes: [],
               render: function (corpo) { self.render(corpo); },
               onMudar: function (pid, valor) { if (self._tela && typeof self._tela.aoMudarExtra === "function") self._tela.aoMudarExtra(pid, valor); } };
    },
    /* o modelo mudou (op nova, desfazer, refazer, níveis): a paleta na tela se refaz */
    aoMudarModelo: function () {
      var self = this;
      if (this._agendado) return;
      this._agendado = true;
      setTimeout(function () { self._agendado = false; self.repintar(); }, 0);
    },
    repintar: function () {
      var S = global.BimShell, pr = S && S._estado ? S._estado.props : null;
      if (!pr || !pr.bp1 || !this._tela) return;
      var corpo = S._raiz ? S._raiz.querySelector(".rv-props .rv-doca-corpo") : null;
      if (!corpo) return;
      var ctx = this.contextoTela(), id = String(this._tela.uid).slice(5);
      if (!ctx || !ctx.res.porId[id]) { try { S.pintarProps(null); } catch (e) {} return; }
      this.render(corpo);
    },
    _status: function (t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} },
    /* manda as ops para o editor: uma → b2Op/instanciaAlterar; várias → lote */
    despachar: function (ops, rotulo) {
      var B = global.BIM; if (!B || !ops || !ops.length) return false;
      if (ops.length === 1) {
        var o = ops[0];
        if (o.op === "instancia") return B.instanciaAlterar ? B.instanciaAlterar(o.id, { tipoId: o.tipoId, inst: o.inst }) : false;
        if (o.op === "instAlterar" || o.op === "instSistema") return B.instOp ? B.instOp(o) : false;   /* P12: instalações */
        return B.b2Op ? B.b2Op(o) : false;
      }
      return B.editarLote ? B.editarLote(this.empacotar(ops, rotulo, ++this._seq + "-" + Date.now().toString(36))) : false;
    },

    /* --------------------------------------------- grupos recolhidos */
    _chaveGrupos: function () {
      var u = null;
      try { u = global.Auth && global.Auth.usuario ? global.Auth.usuario() : null; } catch (e) { u = null; }
      return "orcapro:bim:props-grupos:v1:" + (u ? (u._usuarioId || u.email || "local") : "local");
    },
    _recolhidos: function () {
      try { var o = JSON.parse(global.localStorage.getItem(this._chaveGrupos()) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
    },
    _recolher: function (grupo, sim) {
      try { var o = this._recolhidos(); if (sim) o[grupo] = 1; else delete o[grupo]; global.localStorage.setItem(this._chaveGrupos(), JSON.stringify(o)); } catch (e) {}
    },

    /* --------------------------------------------- desenho */
    render: function (corpo) {
      var self = this, ctx = this.contextoTela(); if (!ctx || !this._tela) return;
      var doc = corpo.ownerDocument || document;
      /* o foco volta para o mesmo campo depois de refazer (Tab segue) */
      var ae = doc.activeElement, focoId = ae && corpo.contains(ae) ? ae.getAttribute("data-bp1-foco") : null;
      var md = this.modelo(ctx, this._tela.idsTodos, this._tela.filtro);
      this._tela.filtro = md.filtro; this._ctx = ctx; this._md = md;
      /* a rolagem fica onde estava (refazer a paleta não a joga para o topo) */
      var mesma = corpo.getAttribute("data-bp1-uid") === String(this._tela.uid), rolagem = mesma ? corpo.scrollTop : 0;
      corpo.setAttribute("data-bp1-uid", String(this._tela.uid));
      corpo.innerHTML = "";
      var raiz = el(doc, "div", "bp1-paleta"); raiz.setAttribute("data-bp1", "paleta");
      corpo.appendChild(raiz);
      raiz.appendChild(this._topo(doc, ctx, md));
      raiz.appendChild(this._linhaFiltro(doc, ctx, md));
      var tb = el(doc, "table", "rv-params bp1-params"), rec = this._recolhidos();
      md.secoes.forEach(function (s) { tb.appendChild(self._grupo(doc, ctx, md, s, !!rec[s.grupo])); });
      /* as seções de fora do registro (orçamento, estilo, abertura…), só com uma peça */
      if (md.ids.length === 1 && md.pecas[0].id === String(this._tela.uid).slice(5)) arr(typeof this._tela.extras === "function" ? this._tela.extras() : this._tela.extras).forEach(function (s) {   /* P2-C: extras pode ser função (fresca a cada pintura) */ tb.appendChild(self._grupoExtra(doc, s, !!rec["extra:" + s.nome])); });
      raiz.appendChild(tb);
      if (ctx.res.avisos && ctx.res.avisos.length) {
        var av = ctx.res.avisos.filter(function (a) { return md.pecas.some(function (p) { return a.indexOf(p.id) >= 0; }); });
        if (av.length) raiz.appendChild(el(doc, "div", "rv-p-aviso", av.join(" ")));
      }
      corpo.scrollTop = rolagem;
      if (focoId) { var f = raiz.querySelector('[data-bp1-foco="' + focoId + '"]'); if (f) try { f.focus({ preventScroll: true }); } catch (eF) {} }
    },
    _topo: function (doc, ctx, md) {
      var self = this, topo = el(doc, "div", "rv-tipo bp1-topo"), mini = el(doc, "div", "rv-tipo-mini");
      try { mini.innerHTML = global.Icones ? global.Icones.get(md.tipo && md.tipo.cat === "parede" ? "parede" : (md.tipo && md.tipo.cat === "pilar" ? "pilar" : "quadrado"), 26) : ""; } catch (e) {}
      topo.appendChild(mini);
      var sel = el(doc, "div", "rv-tipo-sel bp1-tipo-sel");
      if (!md.tipo) {
        sel.appendChild(el(doc, "div", "bp1-tipo-fam", "Várias categorias"));
        sel.appendChild(el(doc, "div", "bp1-tipo-nome", "Comum (" + md.pecas.length + ")"));
      } else {
        var bt = el(doc, "button", "bp1-tipo"); bt.type = "button";
        bt.setAttribute("aria-haspopup", "listbox"); bt.setAttribute("aria-expanded", "false"); bt.setAttribute("data-bp1-foco", "tipo");
        bt.setAttribute("data-bp1", "tipo");
        bt.appendChild(el(doc, "span", "bp1-tipo-fam", md.tipo.familia || ""));
        bt.appendChild(el(doc, "span", "bp1-tipo-nome", md.tipo.nome || ""));
        bt.title = "Trocar o tipo" + (md.pecas.length > 1 ? " das " + md.pecas.length + " peças" : "");
        if (!md.tipo.editavel && !md.tipo.varios) bt.disabled = true;
        bt.onclick = function () { self._abrirTipos(doc, sel, bt, ctx, md); };
        sel.appendChild(bt);
      }
      topo.appendChild(sel);
      return topo;
    },
    _linhaFiltro: function (doc, ctx, md) {
      var self = this, lin = el(doc, "div", "rv-tipo-linha bp1-linha");
      if (md.cats.length > 1) {
        var s = el(doc, "select", "bp1-filtro"); s.setAttribute("aria-label", "Categoria das propriedades"); s.setAttribute("data-bp1-foco", "filtro");
        var oc = el(doc, "option", null, "Comum (" + md.cats.reduce(function (a, c) { return a + c.n; }, 0) + ")"); oc.value = "comum"; s.appendChild(oc);
        md.cats.forEach(function (c) { var o = el(doc, "option", null, c.nome + " (" + c.n + ")"); o.value = c.cat; s.appendChild(o); });
        s.value = md.filtro;
        s.onchange = function () { self._tela.filtro = s.value; self.repintar(); };
        lin.appendChild(s);
      } else lin.appendChild(el(doc, "b", null, md.cats.length ? md.cats[0].nome + " (" + md.cats[0].n + ")" : ""));
      var et = el(doc, "button", "rv-btn-tipo", "Editar tipo"); et.type = "button"; et.setAttribute("data-bp1", "editar-tipo"); et.setAttribute("data-bp1-foco", "editar-tipo");
      et.disabled = !(md.tipo && md.tipo.tipoId && md.tipo.editavel);
      if (et.disabled) et.title = md.tipo && md.tipo.varios ? "As peças são de tipos diferentes" : "Esta peça não tem tipo editável";
      et.onclick = function () { self.abrirEditarTipo(md.tipo.cat, md.tipo.tipoId); };
      lin.appendChild(et);
      /* o menu: Renumerar as marcas da categoria */
      var mb = el(doc, "button", "rv-btn-tipo bp1-menu-btn", "Menu"); mb.type = "button"; mb.setAttribute("aria-haspopup", "menu"); mb.setAttribute("aria-expanded", "false");
      mb.setAttribute("data-bp1", "menu"); mb.setAttribute("data-bp1-foco", "menu");
      var menu = el(doc, "div", "bp1-menu"); menu.setAttribute("role", "menu"); menu.hidden = true;
      var cats = md.filtro === "comum" ? md.cats.map(function (c) { return c.cat; }) : [md.filtro];
      cats.forEach(function (cat) {
        var R = BPm().REGISTRO[cat]; if (!R || !R.prefixo || R.virtual) return;
        var it = el(doc, "button", "bp1-menu-item", "Renumerar marcas de " + R.nome); it.type = "button"; it.setAttribute("role", "menuitem"); it.setAttribute("data-bp1", "renumerar:" + cat);
        it.onclick = function () { fechar(); self.renumerar(cat); };
        menu.appendChild(it);
      });
      if (!menu.childNodes.length) mb.disabled = true;
      function fechar() { menu.hidden = true; mb.setAttribute("aria-expanded", "false"); }
      mb.onclick = function () { var abre = menu.hidden; menu.hidden = !abre; mb.setAttribute("aria-expanded", abre ? "true" : "false"); if (abre && menu.firstChild) menu.firstChild.focus(); };
      menu.onkeydown = function (ev) { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fechar(); mb.focus(); } };
      var caixa = el(doc, "span", "bp1-menu-caixa"); caixa.appendChild(mb); caixa.appendChild(menu);
      lin.appendChild(caixa);
      return lin;
    },
    _cabGrupo: function (doc, nome, fechado, chave) {
      var self = this, tr = el(doc, "tr", "bp1-g"), th = el(doc, "th"); th.colSpan = 2;
      var b = el(doc, "button", "bp1-g-btn"); b.type = "button"; b.setAttribute("aria-expanded", fechado ? "false" : "true"); b.setAttribute("data-bp1-foco", "g:" + chave);
      b.appendChild(el(doc, "span", "rv-seta", fechado ? "►" : "▼")); b.appendChild(doc.createTextNode(nome));
      b.onclick = function () {
        var tb = tr.parentNode, ab = b.getAttribute("aria-expanded") === "true";
        b.setAttribute("aria-expanded", ab ? "false" : "true"); b.firstChild.textContent = ab ? "►" : "▼";
        if (tb) tb.classList.toggle("bp1-fechado", ab);
        self._recolher(chave, ab);
      };
      th.appendChild(b); tr.appendChild(th);
      return tr;
    },
    _grupo: function (doc, ctx, md, s, fechado) {
      var self = this, tb = el(doc, "tbody", fechado ? "bp1-fechado" : null); tb.setAttribute("data-bp1-grupo", s.grupo);
      tb.appendChild(this._cabGrupo(doc, s.grupo, fechado, s.grupo));
      s.linhas.forEach(function (l) { tb.appendChild(self._linha(doc, ctx, md, l)); });
      return tb;
    },
    _grupoExtra: function (doc, s, fechado) {
      var self = this, tb = el(doc, "tbody", "bp1-extra" + (fechado ? " bp1-fechado" : "")); tb.setAttribute("data-bp1-grupo", "extra:" + s.nome);
      tb.appendChild(this._cabGrupo(doc, s.nome, fechado, "extra:" + s.nome));
      arr(s.params).forEach(function (p) {
        var tr = el(doc, "tr", "bp1-p" + (p.leitura ? " rv-p-off" : ""));
        tr.appendChild(el(doc, "td", "rv-p-nome", p.rotulo + (p.unidade ? " (" + p.unidade + ")" : "")));
        var td = el(doc, "td", "rv-p-val");
        try { td.appendChild(global.BimShell._campo(p)); } catch (e) { td.appendChild(el(doc, "span", "rv-p-ro", txt(p.valor))); }
        tr.appendChild(td); tb.appendChild(tr);
      });
      return tb;
    },
    _linha: function (doc, ctx, md, l) {
      var self = this, ed = l.editor, tr = el(doc, "tr", "bp1-p" + (ed.leitura ? " rv-p-off" : ""));
      tr.setAttribute("data-bp1-param", l.id);
      var nome = el(doc, "td", "rv-p-nome"); nome.appendChild(doc.createTextNode(l.nome));
      if (l.orc && l.orc.quantidade) { var cif = el(doc, "span", "bp1-orc", "$"); cif.title = "Entra no orçamento como " + (l.un || "quantidade"); nome.appendChild(cif); }
      tr.appendChild(nome);
      var td = el(doc, "td", "rv-p-val"), idCampo = "bp1-c-" + l.id.replace(/[^A-Za-z0-9_-]/g, "_");
      nome.id = idCampo + "-r";
      if (ed.leitura) {
        var ro = el(doc, "span", "rv-p-ro", l.varios ? VARIOS : (l.texto || "")); ro.title = ed.motivo || ""; td.appendChild(ro);
      } else {
        var campo = this._campo(doc, ctx, md, l, idCampo);
        td.appendChild(campo);
      }
      var er = el(doc, "div", "bp1-erro"); er.setAttribute("role", "alert"); er.hidden = true; er.id = idCampo + "-e";
      td.appendChild(er);
      tr.appendChild(td);
      return tr;
    },
    _campo: function (doc, ctx, md, l, idCampo) {
      var self = this, ed = l.editor, c;
      function erro(tr, m) {
        var er = tr.querySelector(".bp1-erro"), inp = tr.querySelector("[data-bp1-foco]");
        if (er) { er.textContent = m || ""; er.hidden = !m; }
        if (inp) { if (m) { inp.setAttribute("aria-invalid", "true"); inp.setAttribute("aria-describedby", er.id); } else { inp.removeAttribute("aria-invalid"); inp.removeAttribute("aria-describedby"); } }
      }
      function gravar(bruto, alvo) {
        var tr = alvo.closest ? alvo.closest("tr") : null;
        var r = self.editar(l.id, bruto);
        if (!r.ok) { if (tr) erro(tr, r.erro); return false; }
        if (tr) erro(tr, null);
        return true;
      }
      if (ed.tipo === "lista") {
        c = el(doc, "select");
        if (l.varios) { var ov = el(doc, "option", null, VARIOS); ov.value = "\u0000"; ov.disabled = true; ov.selected = true; c.appendChild(ov); }
        arr(ed.opcoes).forEach(function (o) { var op = el(doc, "option", null, o.rotulo); op.value = o.id; if (!l.varios && String(l.bruto == null ? "" : l.bruto) === o.id) op.selected = true; c.appendChild(op); });
        c.onchange = function () { gravar(c.value, c); };
      } else if (ed.tipo === "simnao") {
        c = el(doc, "input"); c.type = "checkbox"; c.checked = !l.varios && !!l.bruto; c.indeterminate = !!l.varios;
        c.onchange = function () { gravar(c.checked, c); };
      } else {
        c = el(doc, "input"); c.type = "text";
        if (ed.tipo === "numero") c.setAttribute("inputmode", "decimal");
        var orig = l.varios ? "" : (ed.tipo === "numero" ? numCampo(l.bruto, l.def) : txt(l.bruto));
        c.value = orig;
        if (l.varios) c.placeholder = VARIOS;
        c.setAttribute("data-bp1-orig", orig);
        /* ⚠ Enter grava e o `change` do blur NÃO pode gravar de novo: o
           navegador dispara o change quando o campo perde o foco (inclusive
           ao ser trocado pela paleta refeita) — era uma op em dobro, e o
           Ctrl+Z parecia não desfazer. Gravou, o valor vira o "original". */
        function confirmar() {
          if (c.value === c.getAttribute("data-bp1-orig")) return;
          if (gravar(c.value, c)) c.setAttribute("data-bp1-orig", c.value);
        }
        c.onkeydown = function (ev) {
          if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); if (c.value !== c.getAttribute("data-bp1-orig")) confirmar(); else c.blur(); }
          else if (ev.key === "Escape") {   /* Esc cancela: volta o valor e tira o erro */
            ev.preventDefault(); ev.stopPropagation();
            c.value = c.getAttribute("data-bp1-orig"); var tr = c.closest ? c.closest("tr") : null; if (tr) erro(tr, null); c.blur();
          }
        };
        c.onchange = confirmar;
      }
      c.id = idCampo; c.setAttribute("aria-labelledby", idCampo + "-r");
      c.setAttribute("data-bp1-foco", "p:" + l.id); c.setAttribute("data-rv-p", "bp1:" + l.id);
      if (ed.tipoAfeta) c.title = "Parâmetro do tipo: muda todas as peças deste tipo.";
      if (ed.tipo === "numero" && l.un) {
        var w = el(doc, "span", "bp1-num"); w.appendChild(c); w.appendChild(el(doc, "span", "bp1-un", l.un)); return w;
      }
      return c;
    },

    /* uma edição na paleta (também é a porta do e2e): lê, valida, faz as
       ops e manda. → { ok, erro?, ops? } */
    editar: function (defId, bruto) {
      var ctx = this.contextoTela(), md = ctx && this._tela ? this.modelo(ctx, this._tela.idsTodos, this._tela.filtro) : null;
      if (!md) return { ok: false, erro: "Nada selecionado." };
      var lin = null; md.secoes.forEach(function (s) { s.linhas.forEach(function (l) { if (l.id === defId) lin = l; }); });
      if (!lin) return { ok: false, erro: "Parâmetro não está na paleta: " + defId + "." };
      if (lin.editor.leitura) return { ok: false, erro: lin.editor.motivo || "Somente leitura." };
      var v = this.lerValor(lin.editor, lin.def, bruto);
      if (!v.ok) return v;
      var r = this.opsEdicao(ctx, md.ids, lin.def, v.valor);
      if (!r.ok) return r;
      if (!this.despachar(r.ops, lin.nome)) return { ok: false, erro: "O editor recusou a mudança." };
      this._status(lin.nome + ": " + (lin.editor.tipoAfeta ? "o tipo mudou (todas as peças dele)." : (md.ids.length > 1 ? md.ids.length + " peças mudaram (um Ctrl+Z desfaz tudo)." : "mudou.")));
      return { ok: true, ops: r.ops };
    },
    renumerar: function (cat) {
      var ctx = this.contextoTela(); if (!ctx) return false;
      var r = this.opRenumerar(ctx, cat);
      if (!r.ok) { this._status(r.motivo); return false; }
      var ok = this.despachar([r.op], "Renumerar");
      if (ok) this._status("Marcas renumeradas em " + BPm().REGISTRO[cat].nome + ".");
      return ok;
    },
    trocarTipo: function (itemId, busca) {
      var ctx = this.contextoTela(), md = ctx && this._tela ? this.modelo(ctx, this._tela.idsTodos, this._tela.filtro) : null;
      if (!md || !md.tipo) return { ok: false, erro: "Escolha uma categoria." };
      var lista = this._listaTipos(ctx, md, busca || ""), item = lista.filter(function (t) { return t.id === itemId; })[0];
      var r = this.opsTrocarTipo(ctx, md.ids, md.tipo.cat, item);
      if (!r.ok) { this._status(r.erro); return r; }
      if (!this.despachar(r.ops, "Trocar tipo")) return { ok: false, erro: "O editor recusou a troca." };
      this._status("Tipo: " + item.nome + (md.ids.length > 1 ? " (" + md.ids.length + " peças)" : "") + ".");
      return { ok: true, ops: r.ops };
    },
    _listaTipos: function (ctx, md, busca) {
      var famId = null, c0 = elDe(ctx.estado, md.ids[0]); if (c0 && c0.famId) famId = c0.famId;
      var l = this.tiposDisponiveis(ctx, md.tipo.cat, famId), q = txt(busca).trim().toLowerCase();
      if (q) l = l.filter(function (t) { return (txt(t.familia) + " " + txt(t.nome)).toLowerCase().indexOf(q) >= 0; });
      /* pilar e viga: o catálogo de perfis (AISC, js/perfisaco.js) entra na busca */
      var PA = global.PerfisAco;
      if (q && PA && PA.buscar && (md.tipo.cat === "pilar" || md.tipo.cat === "viga")) {
        arr(PA.buscar(busca, 8)).forEach(function (nm) { if (!l.some(function (t) { return t.nome === nm; })) l.push({ id: "aisc:" + nm, nome: nm, familia: "Catálogo AISC", origem: "aisc", perfilCatalogo: nm }); });
      }
      return l;
    },
    _abrirTipos: function (doc, sel, bt, ctx, md) {
      var self = this, ja = sel.querySelector(".bp1-tipos");
      if (ja) { ja.parentNode.removeChild(ja); bt.setAttribute("aria-expanded", "false"); return; }
      var cx = el(doc, "div", "bp1-tipos"), bus = el(doc, "input", "bp1-tipos-busca"), ul = el(doc, "ul", "bp1-tipos-lista");
      bus.type = "search"; bus.placeholder = "Buscar tipo"; bus.setAttribute("aria-label", "Buscar tipo"); bus.setAttribute("aria-controls", "bp1-tipos-lista");
      ul.id = "bp1-tipos-lista"; ul.setAttribute("role", "listbox"); ul.setAttribute("aria-label", "Tipos de " + md.tipo.familia);
      cx.appendChild(bus); cx.appendChild(ul); sel.appendChild(cx); bt.setAttribute("aria-expanded", "true");
      var ativo = 0, itens = [];
      function fechar(foco) { if (cx.parentNode) cx.parentNode.removeChild(cx); bt.setAttribute("aria-expanded", "false"); if (foco) bt.focus(); }
      function escolher(t) { fechar(false); var r = self.trocarTipo(t.id, bus.value); if (!r.ok) self._status(r.erro); }
      function pintar() {
        itens = self._listaTipos(ctx, md, bus.value); ul.innerHTML = "";
        var grupo = null;
        itens.forEach(function (t, i) {
          if (t.familia !== grupo) { grupo = t.familia; var gh = el(doc, "li", "bp1-tipos-grupo", grupo || ""); gh.setAttribute("role", "presentation"); ul.appendChild(gh); }
          var li = el(doc, "li", "bp1-tipos-item" + (t.id === md.tipo.tipoId ? " bp1-atual" : "") + (i === ativo ? " bp1-ativo" : ""), t.nome);
          li.setAttribute("role", "option"); li.setAttribute("aria-selected", t.id === md.tipo.tipoId ? "true" : "false"); li.id = "bp1-t-" + i;
          li.setAttribute("data-bp1-tipo", t.id);
          li.onmousedown = function (ev) { ev.preventDefault(); escolher(t); };
          ul.appendChild(li);
        });
        if (!itens.length) { var v = el(doc, "li", "bp1-tipos-vazio", "Nenhum tipo com \"" + bus.value + "\"."); v.setAttribute("role", "presentation"); ul.appendChild(v); }
        if (itens[ativo]) bus.setAttribute("aria-activedescendant", "bp1-t-" + ativo);
      }
      bus.oninput = function () { ativo = 0; pintar(); };
      bus.onkeydown = function (ev) {
        if (ev.key === "ArrowDown") { ev.preventDefault(); ativo = Math.min(itens.length - 1, ativo + 1); pintar(); }
        else if (ev.key === "ArrowUp") { ev.preventDefault(); ativo = Math.max(0, ativo - 1); pintar(); }
        else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); if (itens[ativo]) escolher(itens[ativo]); }
        else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fechar(true); }
      };
      bus.onblur = function () { setTimeout(function () { if (cx.parentNode && !cx.contains(doc.activeElement)) fechar(false); }, 150); };
      var at = 0; this._listaTipos(ctx, md, "").forEach(function (t, i) { if (t.id === md.tipo.tipoId) at = i; }); ativo = at;
      pintar(); bus.focus();
    },

    /* --------------------------------------------- Editar tipo (diálogo) */
    abrirEditarTipo: function (cat, tipoId) {
      var self = this, ctx = this.contextoTela(), S = global.BimShell, raizS = S && S._raiz;
      if (!ctx || !raizS) return false;
      var mt = this.modeloTipo(ctx, cat, tipoId); if (!mt) { this._status("Tipo não encontrado."); return false; }
      var doc = raizS.ownerDocument || document, velho = raizS.querySelector(".bp1-dlg-fundo");
      if (velho) velho.parentNode.removeChild(velho);
      var volta = doc.activeElement, mud = {};
      var fundo = el(doc, "div", "bp1-dlg-fundo"), dlg = el(doc, "div", "bp1-dlg");
      dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "bp1-dlg-tit"); dlg.setAttribute("data-bp1", "dialogo-tipo");
      fundo.appendChild(dlg); raizS.appendChild(fundo);
      function fechar() { if (fundo.parentNode) fundo.parentNode.removeChild(fundo); try { if (volta && volta.focus) volta.focus(); } catch (e) {} }
      function pintar() {
        dlg.innerHTML = "";
        var tit = el(doc, "div", "bp1-dlg-tit", "Propriedades de tipo"); tit.id = "bp1-dlg-tit"; dlg.appendChild(tit);
        var cab = el(doc, "div", "bp1-dlg-cab");
        cab.appendChild(el(doc, "div", null, "Família: " + (mt.familia || "")));
        var lt = el(doc, "div", "bp1-dlg-tipo"); lt.appendChild(el(doc, "span", null, "Tipo: ")); lt.appendChild(el(doc, "b", null, mt.nome));
        var bd = el(doc, "button", "rv-btn-tipo", "Duplicar…"); bd.type = "button"; bd.setAttribute("data-bp1", "duplicar");
        var br2 = el(doc, "button", "rv-btn-tipo", "Renomear…"); br2.type = "button"; br2.setAttribute("data-bp1", "renomear");
        lt.appendChild(bd); lt.appendChild(br2); cab.appendChild(lt);
        var aviso = el(doc, "div", "bp1-dlg-afeta", "Afeta " + mt.n + (mt.n === 1 ? " instância" : " instâncias") + " deste tipo no modelo."); aviso.setAttribute("data-bp1", "afeta");
        cab.appendChild(aviso);
        var nomeBox = el(doc, "div", "bp1-dlg-nome"); nomeBox.hidden = true; cab.appendChild(nomeBox);
        dlg.appendChild(cab);
        var corpo = el(doc, "div", "bp1-dlg-corpo"), tb = el(doc, "table", "rv-params bp1-params");
        mt.secoes.forEach(function (s) {
          var tbo = el(doc, "tbody"); tbo.appendChild(self._cabGrupo(doc, s.grupo, false, "tipo:" + s.grupo));
          s.linhas.forEach(function (l) {
            var ed = l.editor, tr = el(doc, "tr", "bp1-p" + (ed.leitura ? " rv-p-off" : "")); tr.setAttribute("data-bp1-param", l.id);
            var idc = "bp1-dt-" + l.id.replace(/[^A-Za-z0-9_-]/g, "_");
            var tdN = el(doc, "td", "rv-p-nome", l.nome); tdN.id = idc + "-r"; tr.appendChild(tdN);
            var td = el(doc, "td", "rv-p-val");
            if (ed.leitura) { var ro = el(doc, "span", "rv-p-ro", l.texto || ""); ro.title = ed.motivo || ""; td.appendChild(ro); }
            else {
              var c;
              if (ed.tipo === "lista") {
                c = el(doc, "select");
                arr(ed.opcoes).forEach(function (o) { var op = el(doc, "option", null, o.rotulo); op.value = o.id; if (String(mud[l.id] != null ? mud[l.id] : l.bruto) === o.id) op.selected = true; c.appendChild(op); });
              } else if (ed.tipo === "simnao") { c = el(doc, "input"); c.type = "checkbox"; c.checked = !!(mud[l.id] != null ? mud[l.id] : l.bruto); }
              else { c = el(doc, "input"); c.type = "text"; c.value = mud[l.id] != null ? (ed.tipo === "numero" ? numCampo(mud[l.id], l.def) : txt(mud[l.id])) : (ed.tipo === "numero" ? numCampo(l.bruto, l.def) : txt(l.bruto)); if (ed.tipo === "numero") c.setAttribute("inputmode", "decimal"); }
              c.id = idc; c.setAttribute("aria-labelledby", idc + "-r"); c.setAttribute("data-bp1-tp", l.id);
              var er = el(doc, "div", "bp1-erro"); er.setAttribute("role", "alert"); er.hidden = true; er.id = idc + "-e";
              (function (c, l, ed, er) {
                c.onchange = function () {
                  var v = self.lerValor(ed, l.def, c.type === "checkbox" ? c.checked : c.value);
                  if (!v.ok) { er.textContent = v.erro; er.hidden = false; c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", er.id); delete mud[l.id]; return; }
                  er.hidden = true; c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby");
                  if (igual(v.valor, l.bruto)) delete mud[l.id]; else mud[l.id] = v.valor;
                };
              })(c, l, ed, er);
              if (ed.tipo === "numero" && l.un) { var w = el(doc, "span", "bp1-num"); w.appendChild(c); w.appendChild(el(doc, "span", "bp1-un", l.un)); td.appendChild(w); } else td.appendChild(c);
              td.appendChild(er);
            }
            tr.appendChild(td); tbo.appendChild(tr);
          });
          tb.appendChild(tbo);
        });
        corpo.appendChild(tb); dlg.appendChild(corpo);
        var errG = el(doc, "div", "bp1-erro bp1-dlg-erro"); errG.setAttribute("role", "alert"); errG.hidden = true; dlg.appendChild(errG);
        var pe = el(doc, "div", "bp1-dlg-pe");
        var ok = el(doc, "button", "rv-btn-tipo bp1-primario", "OK"); ok.type = "button"; ok.setAttribute("data-bp1", "ok");
        var ap = el(doc, "button", "rv-btn-tipo", "Aplicar"); ap.type = "button"; ap.setAttribute("data-bp1", "aplicar");
        var cn = el(doc, "button", "rv-btn-tipo", "Cancelar"); cn.type = "button"; cn.setAttribute("data-bp1", "cancelar");
        pe.appendChild(ok); pe.appendChild(cn); pe.appendChild(ap); dlg.appendChild(pe);
        function mostrarErro(m) { errG.textContent = m || ""; errG.hidden = !m; }
        function aplicar() {
          /* o campo com foco ainda não disparou o change */
          var ae = doc.activeElement; if (ae && dlg.contains(ae) && ae.onchange && ae.getAttribute("data-bp1-tp")) ae.onchange();
          if (dlg.querySelector("[aria-invalid=true]")) { mostrarErro("Corrija o valor marcado."); return false; }
          if (!Object.keys(mud).length) return true;
          var c2 = self.contextoTela(), r = self.opTipo(c2, mt, mud);
          if (!r.ok) { mostrarErro(r.erro); return false; }
          if (!self.despachar([r.op], "Editar tipo")) { mostrarErro("O editor recusou a mudança."); return false; }
          self._status("Tipo " + mt.nome + ": " + mt.n + (mt.n === 1 ? " peça mudou." : " peças mudaram."));
          /* o tipo implícito virou tipo do projeto: o diálogo segue nele */
          var nt = self.modeloTipo(self.contextoTela(), mt.cat, r.op.tipoId); if (nt) mt = nt;
          mud = {}; return true;
        }
        function pedirNome(rot, inicial, fn) {
          nomeBox.innerHTML = ""; nomeBox.hidden = false;
          var lb = el(doc, "label", null, rot + " "), inp = el(doc, "input"); inp.type = "text"; inp.value = inicial; inp.setAttribute("data-bp1", "nome-tipo");
          var bok = el(doc, "button", "rv-btn-tipo", "OK"); bok.type = "button"; bok.setAttribute("data-bp1", "nome-ok");
          lb.appendChild(inp); nomeBox.appendChild(lb); nomeBox.appendChild(bok);
          function vai() { var r = fn(inp.value); if (!r.ok) { mostrarErro(r.erro); inp.focus(); return; } mostrarErro(null); nomeBox.hidden = true; pintar(); }
          bok.onclick = vai;
          inp.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); vai(); } else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); nomeBox.hidden = true; bd.focus(); } };
          inp.focus(); inp.select();
        }
        bd.onclick = function () {
          pedirNome("Nome do tipo novo:", mt.nome + " 2", function (nm) {
            var c2 = self.contextoTela(), ids = self._tela ? self.modelo(c2, self._tela.idsTodos, self._tela.filtro).ids : [];
            var r = self.opDuplicar(c2, mt, nm, ids.length ? ids : null);
            if (!r.ok) return r;
            if (!self.despachar([r.op], "Duplicar tipo")) return { ok: false, erro: "O editor recusou o tipo novo." };
            var nt = self.modeloTipo(self.contextoTela(), mt.cat, r.op.tipoId);
            if (nt) mt = nt; else { mt.nome = nm; mt.tipoId = r.op.tipoId; }
            return { ok: true };
          });
        };
        br2.onclick = function () {
          pedirNome("Novo nome:", mt.nome, function (nm) {
            var r = self.opRenomear(self.contextoTela(), mt, nm);
            if (!r.ok) return r;
            if (!self.despachar([r.op], "Renomear tipo")) return { ok: false, erro: "O editor recusou o nome." };
            var nt = self.modeloTipo(self.contextoTela(), mt.cat, r.op.tipoId); if (nt) mt = nt; else mt.nome = nm;
            return { ok: true };
          });
        };
        ok.onclick = function () { if (aplicar()) fechar(); };
        ap.onclick = function () { if (aplicar()) pintar(); };
        cn.onclick = fechar;
      }
      dlg.onkeydown = function (ev) {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fechar(); }
        else if (ev.key === "Enter" && ev.target && ev.target.tagName !== "BUTTON" && ev.target.getAttribute("data-bp1") !== "nome-tipo") { ev.preventDefault(); ev.stopPropagation(); var okb = dlg.querySelector('[data-bp1="ok"]'); if (okb) okb.click(); }
        else if (ev.key === "Tab") {   /* o foco fica dentro do diálogo */
          var f = Array.prototype.filter.call(dlg.querySelectorAll("button, input, select"), function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!f.length) return;
          if (ev.shiftKey && doc.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
          else if (!ev.shiftKey && doc.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
        }
      };
      pintar();
      var pri = dlg.querySelector("[data-bp1-tp]") || dlg.querySelector('[data-bp1="ok"]'); if (pri) pri.focus();
      return true;
    }
  };

  function el(doc, tag, cls, texto) { var e = doc.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; }

  BimPropsUI.lerNumero = lerNumero;
  BimPropsUI.numCampo = numCampo;
  BimPropsUI.elDe = elDe;
  global.BimPropsUI = BimPropsUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPropsUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
