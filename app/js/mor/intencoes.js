/* =====================================================================
 * mor/intencoes.js — O MOTOR DO DICIONÁRIO DE INTENÇÕES (F5 do MOR)
 *
 * O dicionário em si é DADO (js/mor/catalogo-dados/intencoes.js). Aqui só há o que o lê:
 *   · normaliza texto (sem acento, minúsculo, hífen/barra viram espaço) e tira plural simples;
 *   · monta o índice forma → entrada e acha, numa lista de palavras, as formas MAIS LONGAS
 *     primeiro, sem sobreposição («forro de gesso» ganha de «forro» e de «gesso»);
 *   · junta ao dicionário as chaves de Escopo.SINONIMOS que faltam (a etapa é inferida pela
 *     regra `ETAPA_DE` abaixo; sem regra, o termo é RECONHECIDO mas fica sem etapa);
 *   · valida o dicionário contra o catálogo (etapa existe, pergunta existe, valor vale).
 * Uma entrada: { id, formas:[…], etapa, resp:{…}, busca, tipo, origem:"dicionario"|"escopo" }.
 * Puro, ES5, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);
  function dados() {
    if (!global.MorDados || !global.MorDados.intencoes) {
      if (typeof require === "function") { try { require("./catalogo-dados/intencoes.js"); } catch (e) { /* o teste acusa */ } }
    }
    return (global.MorDados && global.MorDados.intencoes) || [];
  }
  function escopoSin() {
    var E = global.Escopo || (typeof require === "function" ? (function () { try { return require("../escopo.js"); } catch (e) { return null; } })() : null);
    return (E && E.SINONIMOS) || null;
  }

  function normalizar(s) {
    var t = String(s == null ? "" : s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.toLowerCase().replace(/[\-\/_]/g, " ").replace(/²/g, "2").replace(/³/g, "3").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  /* plural simples: «tomadas»→«tomada», «portões/portoes»→«portao»; só palavras com 4+ letras */
  function radical(t) {
    if (t.length > 4 && /oes$/.test(t)) return t.slice(0, -3) + "ao";
    if (t.length > 3 && /s$/.test(t) && !/ss$/.test(t)) return t.slice(0, -1);
    return t;
  }
  function frase(s) { return normalizar(s).split(" ").filter(Boolean).map(radical).join(" "); }

  /* Etapa inferida das chaves do Escopo que o dicionário ainda não traz (valor → etapa). Ordem importa. */
  var ETAPA_DE = [
    [/demoli|remoc|retirada|entulho|cacamba/, "demolicoes"],
    [/tapume|container|placa$|locacao|gabarito|andaime/, "preliminares"],
    [/escavac|vala|aterro|reaterro|terraplan|compactac|lastro|brita|areia/, "movterra"],
    [/sapata|baldrame|estaca|radier/, "infra"],
    [/concreto|armacao|forma|escoramento|graute|laje|viga|pilar/, "super"],
    [/bloco|alvenaria|tijolo|acartonado|divisoria|vedacao/, "alvenaria"],
    [/impermeabiliz|manta/, "imperm"],
    [/telha|trama|cumeeira|calha|rufo|cobertura/, "cobertura"],
    [/emboco|chapisco|ceramico|porcelanato|pastilha|textura|gesso/, "revestimento"],
    [/piso|contrapiso|cimentado|granilite|vinilico|laminado|rodape|soleira|peitoril|intertravado/, "pisos"],
    [/forro/, "forro"],
    [/janela|porta|portao|vidro|basculante|veneziana|fechadura|dobradica|corrimao|grade/, "esquadrias"],
    [/tinta|latex|acrilica|selador|verniz|esmalte|pintura/, "pintura"],
    [/cabo|tomada|interruptor|disjuntor|eletroduto|luminaria|lampada|quadro|haste|aterramento/, "eletrica"],
    [/tubo|pvc|esgoto|agua|joelho|conexoes|registro|torneira|chuveiro|ralo|sifao|bacia|mictorio|lavatorio|sanitario|tanque|reservatorio|hidrometro|cavalete/, "hidro"],
    [/dreno|sarjeta|passeio|alambrado|cerca/, "areasext"],
    [/limpeza/, "finais"]
  ];
  function etapaDe(valor, chave) {
    var v = normalizar(valor) + " " + normalizar(chave), i;
    for (i = 0; i < ETAPA_DE.length; i++) if (ETAPA_DE[i][0].test(v)) return ETAPA_DE[i][1];
    return "";
  }

  var _idx = null;
  function montar() {
    if (_idx) return _idx;
    var entradas = [], mapa = {}, max = 1, formas = 0;
    function por(e) {
      e.formas.forEach(function (f) {
        var k = frase(f); if (!k) return;
        if (mapa[k]) return;                       /* a primeira definição vence (dicionário antes do Escopo) */
        mapa[k] = e; formas++;
        var n = k.split(" ").length; if (n > max) max = n;
      });
    }
    dados().forEach(function (r) {
      var e = { id: String(r[0]).split("|")[0], formas: String(r[0]).split("|"), etapa: r[1] || "", resp: r[2] || {}, busca: r[3] || "", tipo: r[4] || "S", origem: "dicionario" };
      entradas.push(e); por(e);
    });
    var sin = escopoSin(), doEscopo = 0;
    if (sin) {
      Object.keys(sin).forEach(function (k) {
        if (mapa[frase(k)]) return;
        var e = { id: k, formas: [k], etapa: etapaDe(sin[k], k), resp: {}, busca: String(sin[k]), tipo: "S", origem: "escopo" };
        entradas.push(e); por(e); doEscopo++;
      });
    }
    _idx = { entradas: entradas, mapa: mapa, max: max, formas: formas, doEscopo: doEscopo };
    return _idx;
  }

  var MorInt = {
    normalizar: normalizar, radical: radical, frase: frase, etapaDe: etapaDe,
    _reiniciar: function () { _idx = null; },
    entradas: function () { return montar().entradas.slice(); },
    /* nº de formas distintas (dicionário + Escopo) */
    totalTermos: function () { return montar().formas; },
    totalDoDicionario: function () { var n = 0; dados().forEach(function (r) { n += String(r[0]).split("|").length; }); return n; },
    reconhece: function (termo) { return !!montar().mapa[frase(termo)]; },
    entradaDe: function (termo) { return montar().mapa[frase(termo)] || null; },

    /* Acha as entradas numa lista de palavras NORMALIZADAS (já sem plural? não: aplica radical aqui).
       Devolve [{ini, fim, forma, entrada}] (fim exclusivo), formas mais longas primeiro, sem sobreposição. */
    /* frases ENSINADAS pelo usuário (F6): [{ frase, entrada }] → índice extra, que vale ANTES do dicionário */
    indiceExtra: function (frases) {
      var mapa = {}, max = 1, n = 0;
      (frases || []).forEach(function (f) {
        var base = montar().mapa[frase(f.entrada)] || null;
        if (!base) return;
        var k = frase(f.frase); if (!k) return;
        var e = { id: base.id, formas: [f.frase], etapa: base.etapa, resp: base.resp, busca: base.busca, tipo: base.tipo, origem: "ensinada" };
        mapa[k] = e; n++;
        var c = k.split(" ").length; if (c > max) max = c;
      });
      return { mapa: mapa, max: max, n: n };
    },
    achar: function (palavras, extra) {
      var I = montar(), rad = palavras.map(function (p) { return /^[a-z]/.test(p) ? radical(p) : p; }), out = [], i = 0;
      while (i < rad.length) {
        var achou = null, n;
        if (extra && extra.n) {
          for (n = Math.min(extra.max, rad.length - i); n >= 1; n--) {
            var kx = rad.slice(i, i + n).join(" ");
            if (extra.mapa[kx]) { achou = { ini: i, fim: i + n, forma: kx, entrada: extra.mapa[kx] }; break; }
          }
        }
        for (n = Math.min(I.max, rad.length - i); !achou && n >= 1; n--) {
          var k = rad.slice(i, i + n).join(" ");
          if (I.mapa[k]) { achou = { ini: i, fim: i + n, forma: k, entrada: I.mapa[k] }; break; }
        }
        if (achou) { out.push(achou); i = achou.fim; } else i++;
      }
      return out;
    },

    /* O dicionário bate com o catálogo? { ok, erros[] } */
    validar: function () {
      var erros = [];
      dados().forEach(function (r) {
        var id = String(r[0]).split("|")[0], et = r[1], resp = r[2] || {}, k;
        if (et && !C.etapa(et)) erros.push(id + ": etapa «" + et + "» não existe no catálogo");
        if (!/^[STMANOW]$/.test(r[4] || "")) erros.push(id + ": tipo inválido");
        for (k in resp) if (Object.prototype.hasOwnProperty.call(resp, k)) {
          if (k === "_tipologia") { if (!C.tipologia(resp[k])) erros.push(id + ": tipologia «" + resp[k] + "» não existe"); continue; }
          var q = C.pergunta(k);
          if (!q) { erros.push(id + ": pergunta «" + k + "» não existe"); continue; }
          if (q.op && q.op.indexOf(resp[k]) < 0) erros.push(id + ": «" + resp[k] + "» não é opção de " + k);
          if (q.bool && typeof resp[k] !== "boolean") erros.push(id + ": " + k + " é sim/não");
        }
        if (/\d{4,}/.test(r[3] || "")) erros.push(id + ": a busca parece ter código (nunca código no dicionário)");
      });
      return { ok: erros.length === 0, erros: erros };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorInt;
  global.MorIntencoes = MorInt;
})(typeof window !== "undefined" ? window : globalThis);
