/* =====================================================================
 * busca.js — Motor da BUSCA UNIVERSAL / Ctrl+K (PURO, sem DOM).
 * O usuário digita e pula para qualquer obra, orçamento, cliente,
 * módulo ou ação. Este arquivo é SÓ o motor de indexação + ranking:
 * recebe dados, devolve resultados. O overlay (UI) mora em outro lugar.
 *
 * API:
 *   Busca.normalizar(s)               → minúsculo, sem acento (mapa manual
 *                                       PT-BR, não depende de String.normalize),
 *                                       trim, espaços colapsados.
 *   Busca.indexar(fontes)             → fontes [{tipo,id,titulo,subtitulo?,palavras?}]
 *                                       → índice com campos pré-normalizados.
 *   Busca.buscar(indice, consulta, limite?) → [{tipo,id,titulo,subtitulo,score}]
 *                                       limite default 12; consulta vazia/1-char → [].
 *
 * RANKING (pontos por termo — vale o MELHOR campo de cada termo):
 *   100  match exato do título
 *    80  título começa com o termo
 *    60  alguma palavra do título começa com o termo
 *    40  termo é substring do título
 *    20  termo é substring do subtítulo ou das palavras extras
 * Consulta multi-termo: TODOS os termos precisam casar em algum campo
 * (AND); score = soma dos melhores pontos por termo. Bônus de consulta
 * inteira contra o título: +50 se título == consulta, +25 se título
 * começa com a consulta (garante "exato > começa-com" também em
 * consultas de várias palavras).
 * Desempate (score igual): tipo primeiro (acao > modulo > orcamento >
 * obra > cliente > resto — ações e módulos são navegação, vêm antes),
 * depois título mais curto, depois ordem de indexação (estável).
 *
 * TOLERÂNCIA LEVE A ERRO (não é fuzzy completo): se um termo com 4+
 * chars não casa em campo nenhum do item, tenta de novo com 1 char
 * removido do FIM (plural/typo simples: "obras" acha "Obra"), com
 * penalidade de −5 pontos. Sem Levenshtein, sem transposição — só a
 * poda do último caractere.
 *
 * Node-testável: node tools/test-busca.js
 * ===================================================================== */
(function (global) {
  "use strict";

  // mapa manual de acentos PT-BR (minúsculos — normalizar baixa a caixa antes)
  var MAPA_ACENTOS = {
    "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", // á à â ã ä
    "é": "e", "è": "e", "ê": "e", "ë": "e",               // é è ê ë
    "í": "i", "ì": "i", "î": "i", "ï": "i",               // í ì î ï
    "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", // ó ò ô õ ö
    "ú": "u", "ù": "u", "û": "u", "ü": "u",               // ú ù û ü
    "ç": "c", "ñ": "n"                                              // ç ñ
  };

  // prioridade de tipo no desempate (menor = aparece antes)
  var PRIO_TIPO = { acao: 0, modulo: 1, orcamento: 2, obra: 3, cliente: 4 };

  function prioridadeTipo(tipo) {
    var p = PRIO_TIPO[tipo];
    return p == null ? 5 : p;
  }

  function textoDe(v) {
    if (v == null) return "";
    if (v.join) return v.join(" "); // aceita array de palavras por robustez
    return String(v);
  }

  // pontua UM termo contra UM item do índice; 0 = não casou
  function pontuarTermo(item, termo) {
    if (item._t === termo) return 100;                 // exato no título
    if (item._t.indexOf(termo) === 0) return 80;       // título começa com
    var pw = item._pt;
    for (var i = 0; i < pw.length; i++) {
      if (pw[i].indexOf(termo) === 0) return 60;       // palavra do título começa com
    }
    if (item._t.indexOf(termo) >= 0) return 40;        // substring no título
    if (item._s.indexOf(termo) >= 0 || item._x.indexOf(termo) >= 0) return 20; // subtítulo/palavras
    return 0;
  }

  var Busca = {

    // minúsculo, sem acento (mapa manual), trim, espaços colapsados
    normalizar: function (s) {
      var t = textoDe(s).toLowerCase();
      var out = "";
      for (var i = 0; i < t.length; i++) {
        var ch = t.charAt(i);
        out += MAPA_ACENTOS[ch] || ch;
      }
      return out.replace(/\s+/g, " ").replace(/^ +| +$/g, "");
    },

    // fontes [{tipo,id,titulo,subtitulo?,palavras?}] → índice pré-normalizado
    indexar: function (fontes) {
      var itens = [];
      (fontes || []).forEach(function (f, i) {
        if (!f) return;
        var tituloN = Busca.normalizar(f.titulo);
        itens.push({
          tipo: f.tipo == null ? "" : String(f.tipo),
          id: f.id,
          titulo: textoDe(f.titulo),
          subtitulo: textoDe(f.subtitulo),
          _t: tituloN,                                  // título normalizado
          _pt: tituloN ? tituloN.split(" ") : [],       // palavras do título
          _s: Busca.normalizar(f.subtitulo),            // subtítulo normalizado
          _x: Busca.normalizar(f.palavras),             // palavras extras pesquisáveis
          _ordem: i                                     // desempate final estável
        });
      });
      return { itens: itens };
    },

    // consulta → resultados rankeados [{tipo,id,titulo,subtitulo,score}]
    buscar: function (indice, consulta, limite) {
      limite = +limite;
      if (!(limite > 0)) limite = 12;
      var q = Busca.normalizar(consulta);
      if (q.length < 2) return []; // vazia ou 1 char → nada

      var termos = q.split(" ");
      var itens = (indice && indice.itens) || [];
      var res = [];

      for (var i = 0; i < itens.length; i++) {
        var it = itens[i];
        var score = 0, casouTudo = true;
        for (var t = 0; t < termos.length; t++) {
          var termo = termos[t];
          var s = pontuarTermo(it, termo);
          if (!s && termo.length >= 4) {
            // tolerância leve: poda 1 char do fim (plural/typo), com penalidade
            var enc = pontuarTermo(it, termo.substring(0, termo.length - 1));
            if (enc) s = enc - 5;
          }
          if (!s) { casouTudo = false; break; } // AND: todo termo precisa casar
          score += s; // soma dos melhores por termo
        }
        if (!casouTudo) continue;
        // bônus da consulta inteira contra o título (exato > começa-com)
        if (it._t === q) score += 50;
        else if (it._t.indexOf(q) === 0) score += 25;
        res.push({
          tipo: it.tipo, id: it.id, titulo: it.titulo, subtitulo: it.subtitulo,
          score: score, _prio: prioridadeTipo(it.tipo), _len: it._t.length, _ordem: it._ordem
        });
      }

      res.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score; // maior score primeiro
        if (a._prio !== b._prio) return a._prio - b._prio; // acao > modulo > orcamento > obra > cliente > resto
        if (a._len !== b._len) return a._len - b._len;     // título mais curto primeiro
        return a._ordem - b._ordem;                        // estável
      });

      // corta no limite e devolve só os campos públicos
      var fin = [];
      for (var k = 0; k < res.length && fin.length < limite; k++) {
        fin.push({ tipo: res[k].tipo, id: res[k].id, titulo: res[k].titulo, subtitulo: res[k].subtitulo, score: res[k].score });
      }
      return fin;
    }
  };

  global.Busca = Busca;
  if (typeof module !== "undefined" && module.exports) module.exports = Busca;
  // global = window no browser; no Node (teste) usa o global real.
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
