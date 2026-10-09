/* =====================================================================
 * bimgerenciar.js — UTILIDADES DE GERENCIAR (motor puro, ES5, Node-testável).
 *
 * Fase P10, Frente D do plano do BIM — os comandos
 * que o Anexo A marca FALTA/PARCIAL em Gerenciar e Modificar:
 *   · SELECIONAR POR ID (SelectById): o id da peça ("w3", "edit:w3"), a
 *     MARCA ("P01", "PA03") ou o IfcGUID — vários separados por vírgula;
 *   · LOCALIZAR/SUBSTITUIR (texto dos parâmetros): nos parâmetros de TEXTO
 *     que a tela grava (Comentários, Marca, parâmetros do projeto, valores
 *     de texto do tipo, nome/número/acabamentos do ambiente) — vira UMA op
 *     (lote): um Ctrl+Z desfaz a troca inteira. Marca repetida é recusada;
 *   · LIMPAR NÃO UTILIZADOS (PurgeUnused): tipos do projeto sem instância e
 *     grupos sem peça — a op que tira cada um;
 *   · REVISAR ADVERTÊNCIAS (ReviewWarnings): a LISTA GERAL que faltava — os
 *     avisos que o replay já gera, num lugar só: canto sem união, ambiente
 *     redundante ou não delimitado, forro sem contorno, nível que sumiu,
 *     porta/janela sobreposta ou sem parede, marca repetida, fase inválida,
 *     furo ignorado, escada fora da regra, grupo vazio, op que não valeu.
 *   · VISTA INICIAL (StartingView): a chave do aparelho (a tela guarda).
 * Nada daqui mexe no estado: devolve a op (a tela manda pelo editor, e o
 * desfazer de sempre volta).
 *
 * Teste: node tools/test-bimgerenciar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  var NOME_CAT = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", escada: "Escada", guarda: "Guarda-corpo", cobertura: "Cobertura", forro: "Forro", volume: "Volume", ambiente: "Ambiente", familia: "Família" };
  /* todas as peças do estado: { id, categoria, el } */
  function todas(estado) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: c.tipo || "caixa", el: c }); });
    arr(estado && estado.coberturas).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: "cobertura", el: c }); });
    arr(estado && estado.forros).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: "forro", el: c }); });
    arr(estado && estado.volumes).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: "volume", el: c }); });
    arr(estado && estado.familias).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: "familia", el: c }); });
    arr(estado && estado.ambientes).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), categoria: "ambiente", el: c }); });
    return out;
  }
  function rotulo(p) { return (NOME_CAT[p.categoria] || "Peça") + " " + p.id; }

  /* as escritas de TEXTO que viram op aqui (a mesma régua do js/bimpropsui.js) */
  var RE_ESCRITA = /^(marcar\.(marca|comentarios|imagem)|marcar\.params\.[A-Za-zÀ-ÿ0-9_]+|ajustarTipo\.valores\.[A-Za-zÀ-ÿ0-9_:]+|ajustarAmbiente\.(nome|numero|acabPiso|acabBase|acabParede|acabForro|ocupacao|ocupante|departamento|comentarios))$/;

  var BimGerenciar = {
    NOME_CAT: NOME_CAT,

    /* ------------------------------------------------ SELECIONAR POR ID */
    selecionarPorId: function (estado, texto, deps) {
      var toks = txt(texto).split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!toks.length) return { ok: false, motivo: "Digite um ou mais IDs (o id da peça, a Marca ou o IfcGUID), separados por vírgula.", ids: [], naoAchados: [] };
      var ps = todas(estado), porId = {}, porMarca = {}, porGuid = {};
      ps.forEach(function (p) { porId[p.id] = p; });
      var BP = dep("BimParam", "./bimparam.js");
      if (BP && BP.resolver) {
        try {
          var res = BP.resolver(estado, deps || {});
          res.pecas.forEach(function (pc) {
            if (pc.marca) (porMarca[String(pc.marca).toLowerCase()] = porMarca[String(pc.marca).toLowerCase()] || []).push(pc.hospedeiro || pc.id);
            var g = BP.valor(pc, "IFC_GUID"); if (g) porGuid[String(g)] = pc.hospedeiro || pc.id;
          });
        } catch (e) {}
      }
      var ids = [], nao = [], porToken = {};
      toks.forEach(function (t) {
        var s = t.replace(/^edit:/i, ""), achou = [];
        if (porId[s]) achou = [s];
        else if (porGuid[t]) achou = [porGuid[t]];
        else if (porMarca[s.toLowerCase()]) achou = porMarca[s.toLowerCase()].slice();
        porToken[t] = achou;
        if (!achou.length) nao.push(t);
        achou.forEach(function (i) { if (ids.indexOf(i) < 0) ids.push(i); });
      });
      return { ok: ids.length > 0, ids: ids, naoAchados: nao, porToken: porToken,
               motivo: ids.length ? "" : "Nenhuma peça com " + (toks.length > 1 ? "esses IDs" : "esse ID") + ": " + toks.join(", ") + "." };
    },

    /* ------------------------------------------------ LOCALIZAR / SUBSTITUIR
     * o = { procurar, substituir, maiusculas (diferencia), inteira (palavra
     *       inteira), params:[defId…] (só esses), ids:[…] (só essas peças) }
     * → { ok, achados:[{id, categoria, param, nome, antes, depois, lado}],
     *     pulados:[{id, param, motivo}], op } — op só quando há substituir. */
    localizarSubstituir: function (estado, deps, o) {
      o = o || {};
      var BP = dep("BimParam", "./bimparam.js");
      if (!BP || !BP.resolver) return { ok: false, motivo: "O registro de parâmetros (js/bimparam.js) não carregou.", achados: [], pulados: [] };
      var q = txt(o.procurar);
      if (!q) return { ok: false, motivo: "Digite o texto a procurar.", achados: [], pulados: [] };
      var flags = o.maiusculas ? "g" : "gi", re = new RegExp(o.inteira ? "(^|[^A-Za-zÀ-ÿ0-9_])(" + escRe(q) + ")(?=$|[^A-Za-zÀ-ÿ0-9_])" : escRe(q), flags);
      var trocar = o.substituir != null, sub = txt(o.substituir);
      function novo(s) { return o.inteira ? s.replace(re, function (m0, a) { return a + sub; }) : s.replace(re, function () { return sub; }); }
      var res = BP.resolver(estado, deps || {}), achados = [], pulados = [], soIds = o.ids ? arr(o.ids).map(String) : null;
      var porTipo = {}, opsMarcar = {}, opsAmb = {}, novasMarcas = {};
      res.pecas.forEach(function (pc) {
        if (pc.hospedeiro) return;                                   /* lance/patamar: o texto é da escada */
        if (soIds && soIds.indexOf(pc.id) < 0) return;
        pc.params.forEach(function (it) {
          var d = it.def, v = it.valor;
          if (typeof v !== "string" || !v || (d.dado !== "texto")) return;
          if (o.params && arr(o.params).indexOf(d.id) < 0) return;
          re.lastIndex = 0;
          if (!re.test(v)) return;
          re.lastIndex = 0;
          var e = txt(d.escrita), depois = trocar ? novo(v) : v;
          var a = { id: pc.id, categoria: pc.categoria, param: d.id, nome: d.nome, antes: v, depois: depois, lado: d.lado };
          if (!RE_ESCRITA.test(e) || d.leitura) { if (trocar) pulados.push({ id: pc.id, param: d.id, motivo: d.nome + " é calculado (ou de leitura): não se troca" }); a.leitura = true; achados.push(a); return; }
          achados.push(a);
          if (!trocar || depois === v) return;
          var m;
          if ((m = /^marcar\.(marca|comentarios|imagem)$/.exec(e))) {
            if (m[1] === "marca") novasMarcas[pc.id] = { cat: pc.categoria, marca: depois.trim().slice(0, 24) };
            (opsMarcar[pc.id] = opsMarcar[pc.id] || { op: "marcar", id: pc.id })[m[1]] = depois;
          } else if ((m = /^marcar\.params\.(.+)$/.exec(e))) {
            var om = opsMarcar[pc.id] = opsMarcar[pc.id] || { op: "marcar", id: pc.id };
            (om.params = om.params || {})[m[1]] = depois;
          } else if ((m = /^ajustarTipo\.valores\.(.+)$/.exec(e))) {
            var kt = pc.categoria + "|" + pc.tipoId, t = porTipo[kt] = porTipo[kt] || { cat: pc.categoria, tipoId: pc.tipoId, valores: {} };
            t.valores[m[1]] = depois;
          } else if ((m = /^ajustarAmbiente\.(.+)$/.exec(e))) {
            var oa = opsAmb[pc.id] = opsAmb[pc.id] || { op: "ajustarAmbiente", id: pc.id, campos: {} };
            oa.campos[m[1]] = depois;
          }
        });
      });
      /* a marca não repete na categoria (a régua da P1-A) */
      Object.keys(novasMarcas).forEach(function (id) {
        var nm = novasMarcas[id], dono = res.pecas.filter(function (p) {
          if (p.id === id || p.categoria !== nm.cat) return false;
          var mk = novasMarcas[p.id] ? novasMarcas[p.id].marca : p.marca;
          return mk === nm.marca;
        })[0];
        if (nm.marca && dono) {
          pulados.push({ id: id, param: "ALL_MODEL_MARK", motivo: "a marca \"" + nm.marca + "\" ficaria repetida (" + dono.id + ")" });
          delete opsMarcar[id].marca;
          if (Object.keys(opsMarcar[id]).length <= 2) delete opsMarcar[id];
        }
      });
      var ops = Object.keys(opsMarcar).map(function (k) { return opsMarcar[k]; }).concat(Object.keys(opsAmb).map(function (k) { return opsAmb[k]; }));
      Object.keys(porTipo).forEach(function (k) {
        var t = porTipo[k], r = BP.editarTipo(estado, t.cat, t.tipoId, t.valores, null, deps || {});
        if (r.ok) ops.push(r.op); else pulados.push({ id: t.tipoId, param: "tipo", motivo: r.motivo });
      });
      var op = !ops.length ? null : (ops.length === 1 ? ops[0] : { op: "lote", id: (deps && typeof deps.novoId === "function" ? String(deps.novoId()) : "subst-" + Date.now().toString(36)), origem: "localizar", ops: ops });
      return { ok: achados.length > 0, achados: achados, pulados: pulados, op: op, n: achados.filter(function (a) { return !a.leitura; }).length,
               motivo: achados.length ? "" : "Nenhum parâmetro de texto com \"" + q + "\"." };
    },

    /* ------------------------------------------------ LIMPAR NÃO UTILIZADOS */
    limparNaoUtilizados: function (estado, deps) {
      var BP = dep("BimParam", "./bimparam.js"), itens = [], ops = [];
      if (BP && BP.tipos) {
        var tipos = (estado && estado.projeto && estado.projeto.tipos) || {};
        Object.keys(tipos).forEach(function (cat) {
          BP.tipos(estado, cat, deps || {}).forEach(function (t) {
            if (!t.projeto || t.instancias.length) return;
            itens.push({ tipo: "tipo", categoria: cat, id: t.id, nome: t.nome });
            ops.push({ op: "ajustarTipo", categoria: cat, tipoId: String(t.id), apagar: true });
          });
        });
      }
      arr(estado && estado.grupos).forEach(function (g) {
        if (arr(g.membros).length) return;
        itens.push({ tipo: "grupo", id: g.id, nome: g.nome });
        ops.push({ op: "grupo", acao: "apagar", id: g.id });
      });
      var op = !ops.length ? null : (ops.length === 1 ? ops[0] : { op: "lote", id: (deps && typeof deps.novoId === "function" ? String(deps.novoId()) : "limpar-" + ops.length), origem: "limpar", ops: ops });
      return { itens: itens, op: op };
    },

    /* ------------------------------------------------ REVISAR ADVERTÊNCIAS
     * [{ origem, texto, ids:[…] }] — a lista geral (Gerenciar › Revisar
     * advertências), na ordem: modelo, paredes, vãos, ambientes, forros,
     * restrições, marcas, fases, grupos. deps = { avaliarFam, categoriaFam } */
    advertencias: function (estado, deps) {
      deps = deps || {};
      var out = [];
      function av(origem, texto, ids) { out.push({ origem: origem, texto: texto, ids: arr(ids).map(String) }); }
      if (!estado) return out;
      if (estado.invalidas > 0) av("Modelo", estado.invalidas + " operação(ões) da lista não valeram (peça que não existe mais, ou módulo que não carregou nesta tela).", []);
      if (estado.orfas > 0) av("Vãos", estado.orfas + " porta(s)/janela(s) sem parede: a parede onde estavam foi apagada.", []);
      /* CANTO SEM UNIÃO: duas paredes que se tocam na ponta e não se uniram */
      var E = dep("BimEdit", "./bimedit.js"), par = arr(estado.caixas).filter(function (c) { return c && c.tipo === "parede"; });
      if (E && E.eixoDaCaixa) {
        var pts = par.map(function (c) { return E.eixoDaCaixa(c); });
        for (var i = 0; i < par.length; i++) for (var j = i + 1; j < par.length; j++) {
          var a = par[i], b = par[j];
          var toca = pts[i].some(function (p) { return pts[j].some(function (q) { return Math.abs(p.x - q.x) < 0.03 && Math.abs(p.z - q.z) < 0.03; }); });
          if (!toca) continue;
          var unidas = arr(a.juntas).some(function (x) { return String(x.com) === String(b.id); });
          if (unidas) continue;
          if (a.unir === false || b.unir === false) av("Paredes", "Canto sem união entre " + a.id + " e " + b.id + ": \"Unir nos cantos\" está desligado numa delas (o volume conta o canto duas vezes ou deixa vazio).", [a.id, b.id]);
          else if (a.juntas || b.juntas) av("Paredes", "Canto sem união entre " + a.id + " e " + b.id + ": as paredes se tocam na ponta mas não se uniram (ângulo muito fechado, alturas que não se cruzam ou ponta curta demais).", [a.id, b.id]);
        }
      }
      /* avisos das peças (furo ignorado, perfil, escada fora da regra, nível que sumiu) */
      arr(estado.caixas).forEach(function (c) {
        if (!c) return;
        arr(c.avisos).forEach(function (t) { av(NOME_CAT[c.tipo] ? NOME_CAT[c.tipo] + "s" : "Peças", (NOME_CAT[c.tipo] || "Peça") + " " + c.id + ": " + t, [c.id]); });
        if (c.avisoNivel) av("Restrições", (NOME_CAT[c.tipo] || "Peça") + " " + c.id + ": " + c.avisoNivel, [c.id]);
        if (c.escada && c.escada.calc) arr(c.escada.calc.avisos).forEach(function (t) { av("Escadas", "Escada " + c.id + ": " + t, [c.id]); });
      });
      arr(estado.coberturas).forEach(function (c) { if (c && c.avisoNivel) av("Restrições", "Cobertura " + c.id + ": " + c.avisoNivel, [c.id]); });
      /* vãos que se sobrepõem na mesma parede */
      if (E && E.vaosDasParedes && typeof deps.avaliarFam === "function") {
        var vz = E.vaosDasParedes(estado, deps.avaliarFam);
        Object.keys(vz).forEach(function (pid) { if (arr(vz[pid].conflitos).length) av("Vãos", "Parede " + pid + ": " + vz[pid].conflitos.length + " porta(s)/janela(s) sobreposta(s) a outro vão — o vão que encavala não abre (" + vz[pid].conflitos.join(", ") + ").", [pid].concat(vz[pid].conflitos)); });
      }
      /* ambientes (P2-A): redundante, não delimitado, número repetido */
      arr(estado.ambientes).forEach(function (a) { if (a && a.calc) arr(a.calc.avisos).forEach(function (t) { av("Ambientes", "Ambiente " + (a.nome ? a.nome + " " : "") + a.id + ": " + t, [a.id]); }); });
      arr(estado.ambientesAvisos).forEach(function (t) { av("Ambientes", t, []); });
      /* forros (P2-B) */
      arr(estado.forros).forEach(function (f) { if (f) arr(f.avisos).forEach(function (t) { av("Forros", "Forro " + f.id + ": " + t, [f.id]); }); });
      /* marcas repetidas (registro) */
      var BP = dep("BimParam", "./bimparam.js");
      if (BP && BP.marcasAuto) { try { arr(BP.marcasAuto(estado, deps).avisos).forEach(function (t) { av("Marcas", t, []); }); } catch (eM) {} }
      /* fases (P10) */
      var BF = dep("BimFases", "./bimfases.js");
      if (BF && BF.faseado && BF.faseado(estado)) arr(BF.classificar(estado, null, deps).avisos).forEach(function (t) { av("Fases", t, []); });
      /* grupos (P10) */
      arr(estado.gruposAvisos).forEach(function (t) { av("Grupos", t, []); });
      return out;
    },

    /* ------------------------------------------------ VISTA INICIAL (chave do aparelho) */
    chaveVistaInicial: function (obraId) { return "orcapro:bim:vista-inicial:" + txt(obraId || "sem-obra"); }
  };

  global.BimGerenciar = BimGerenciar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimGerenciar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
