/* =====================================================================
 * hidligar.js — LIGAR A → B (modelagem pelos conectores, 17/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério: "clico numa conexão e ligo até a outra, e ele já liga, já entendendo a inclinação que precisa";
 * "clicar num tubo a uma altura e depois num tubo a outra altura gera a ligação completa".
 *
 *   HidLigar.ligar(estado, avaliarFam, A, B, opts) → { ok, erro, opcoes: [{ estrategia, nome, ops, comprimento,
 *        avisos[] }], pendencias[] }
 *
 * A e B são PONTOS DE LIGAÇÃO (os mesmos que a tela mostra com o "+"):
 *   { tipo: "conector", x, y, z, sistema, dn, famInst?, parede? }   ponto de louça/equipamento (BimInst.conectoresDoEstado)
 *   { tipo: "peca", id, x, y, z, sistema }                          caixa/ralo (a entrada/saída é a captura da peça)
 *   { tipo: "ponta", trecho, x, y, z, sistema, dn }                 ponta solta de um tubo
 *   { tipo: "meio", trecho, x, y, z, sistema, dn }                  o meio de um tubo (vira tê/junção: o tubo é DIVIDIDO)
 *   { tipo: "vertical", trecho, x, z, yBase, yTopo, sistema, dn }   tubo de queda/coluna (a cota sai da inclinação)
 * O MESMO motor do traçado automático (js/hidrota.js) faz a rota: ortogonal/45°, nunca atravessa família, esgoto com
 * a declividade mínima por DN (HidNormas) e o sentido do escoamento A → B (A a montante). Se faltar altura até B, a
 * opção é descartada com o motivo (a tela mostra). Várias estratégias (parede/piso/forro) = várias opções: a tela
 * mostra a prévia, Tab alterna, Enter confirma.
 * ⚠ NENHUM valor de norma aqui: o que é norma vem do HidRota/HidNormas.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok arredondamento a 0,1 mm (formatação)
  function txt(v) { return v == null ? "" : String(v); }
  var PREFIXO = "lg", SEQ = 0;   /* cada ligação com ids próprios (duas ligações no mesmo modelo não colidem) */

  /* o destino do HidRota a partir do ponto B */
  function destino(B, sis) {
    if (B.tipo === "vertical") return { tipo: sis === "esgoto" ? "tubo_queda" : "coluna", id: B.trecho, x: B.x, z: B.z, yBase: B.yBase, yTopo: B.yTopo, existente: true, ventilado: false };
    return { tipo: "ponto", id: B.trecho || B.id || "B", conector: { x: B.x, y: B.y, z: B.z, dn: num(B.dn, 0) } };
  }
  /* o tubo do meio é DIVIDIDO no ponto em que a ligação chega (a conexão — tê ou junção — fica no nó): js/biminst.js */
  function dividir(estado, idT, P) { var I = BI(); return I && I.dividirTrecho ? I.dividirTrecho(estado, idT, P) : []; }
  function ligar(estado, avaliarFam, A, B, opts) {
    opts = opts || {};
    var H = HR(), I = BI(); if (!H || !I) return { ok: false, erro: "Motor do traçado não carregado.", opcoes: [] };
    if (!A || !B) return { ok: false, erro: "Clique o ponto de partida e o de chegada.", opcoes: [] };
    var sis = A.sistema || B.sistema;
    if (A.sistema && B.sistema && A.sistema !== B.sistema) return { ok: false, erro: "Sistemas diferentes (" + I.SISTEMAS[A.sistema].nome + " × " + I.SISTEMAS[B.sistema].nome + "): não se ligam.", opcoes: [] };
    if (!I.SISTEMAS[sis] || (sis !== "esgoto" && sis !== "agua_fria" && sis !== "pluvial")) return { ok: false, erro: "Ligar A → B: esgoto e água fria (o sistema " + txt(sis) + " ainda não).", opcoes: [] };
    var sisRota = sis === "pluvial" ? "esgoto" : sis;
    var dnA = num(A.dn, 0) || num(B.dn, 0);
    var con = { id: "c", sistema: sisRota, dn: dnA, x: A.x, y: A.y, z: A.z };
    if (A.parede) con.parede = A.parede;
    var par = { estrategias: opts.estrategias || (sisRota === "esgoto" ? ["piso", "forro"] : ["parede", "piso", "forro"]), prefixo: PREFIXO + (opts.seq || (++SEQ) + "-"), dn: {}, terreo: opts.terreo !== false };
    /* o id do "aparelho" é o da FAMÍLIA do ponto: a conferência tubo × louça sabe que o toco que chega nele é dela */
    var apId = A.famInst != null ? String(A.famInst) : "A";
    if (dnA > 0) par.dn[apId + ":c"] = dnA;
    var dest = {}; dest[sisRota] = destino(B, sisRota);
    var piso = num(opts.piso, num(A.y, 0));
    var entrada = { aparelhos: [{ id: apId, aparelho: txt(A.aparelho), grupo: "1", conectores: [con] }], pecas: [], destinos: dest, grupos: [{ id: "1", piso: piso }], piso: piso,
                    obstaculos: H.obstaculosDoBim(estado, avaliarFam), parametros: par, opsModelo: arr(opts.opsModelo) };
    var r = H.propor(entrada);
    var div = B.tipo === "meio" ? null : null;
    var opcoes = r.opcoes.map(function (o) {
      var ops = o.ops.filter(function (x) { return x.op === "trecho" || x.op === "acessorio"; }).filter(function (x) { return !(x.op === "acessorio"); });
      if (sis === "pluvial") ops.forEach(function (x) { if (x.op === "trecho") { x.sistema = "pluvial"; x.material = I.SISTEMAS.pluvial.material; } });
      var antes = [];
      if (B.tipo === "meio" && B.trecho) {
        /* o ponto de chegada é o do trecho dividido: a última ponta da rota toca o meio dele */
        var fim = null; ops.forEach(function (x) { if (x.op === "trecho" && Math.hypot(x.p2.x - B.x, x.p2.z - B.z) < 0.05) fim = x.p2; });   // hid:ok tolerância de desenho (5 cm) para achar a ponta da rota no meio do trecho — não é valor de norma
        antes = dividir(estado, B.trecho, fim || B);
      }
      if (A.tipo === "meio" && A.trecho) antes = antes.concat(dividir(estado, A.trecho, A));
      return { estrategia: o.estrategia, nome: o.nome, ops: antes.concat(ops), comprimento: o.comprimento, avisos: o.avisos.slice() };
    });
    if (!opcoes.length) return { ok: false, erro: (r.descartadas[0] ? r.descartadas[0].motivo : (r.pendencias[0] ? r.pendencias[0].motivo : "nenhuma rota fechou")), opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };
    return { ok: true, opcoes: opcoes, descartadas: r.descartadas, pendencias: r.pendencias };
  }

  var HidLigar = { VERSAO: 1, ligar: ligar, destino: destino, dividir: dividir };
  global.HidLigar = HidLigar;
  if (typeof module !== "undefined" && module.exports) module.exports = HidLigar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
