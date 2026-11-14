/* =====================================================================
 * hidcaixaficha.js — CAIXA SIFONADA: LEGADO × FICHA (14/11/2026, decisão da coordenação: "projeto salvo de cliente não pode soltar cano").
 * As 6 caixas sifonadas Amanco ganharam a geometria e as bocas da ficha p.8 (js/hidfamilias.js fichaSifonada) num TIPO NOVO
 * (<tipo antigo>-ficha). O tipo antigo continua EXATAMENTE como no master (legado: sai da lista, mas abre e desenha igual) — a
 * instância que um projeto salvo já tem não muda nada sozinha.
 *   HidCaixaFicha.ehLegada(famInst) → "<tipo -ficha>" | null
 *   HidCaixaFicha.atualizar(estado, avaliarFam, famInstId) → { ok, erro, ops[], movidos[] }
 *     troca o tipo pela versão da ficha (op "instancia") e LEVA a ponta de cada tubo ligado a uma boca antiga para a boca nova (a
 *     outra ponta fica; o arraste do js/biminstarr.js recusa mexer na ponta presa ao aparelho, então a ponta é regravada pela op
 *     "trecho" de mesmo id); RECUSA, com o motivo, se algum tubo de esgoto ficar abaixo da declividade mínima do DN
 *     (BimInst.declMinDn). Um lote só:
 *     a tela grava como UMA operação (um Ctrl+Z desfaz tudo).
 * ES5, sem DOM. Node-testável.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  /* revisão 14/11 (C1): também as caixas de gordura e de inspeção Tigre (o tipo antigo legado + o "-ficha") */
  var FAMS = { "hid-caixa-sifonada": 1, "hid-caixa-gordura": 1, "hid-caixa-inspecao": 1 }, FAM = "hid-caixa-sifonada", TOL = 0.02, SUF = "-ficha";

  function ehLegada(fi) {
    if (!fi || !FAMS[fi.famId] || /-ficha$/.test(String(fi.tipoId || ""))) return null;
    var f = HF() && HF().porId(fi.famId), novo = String(fi.tipoId || "") + SUF;
    return f && f.tipos.some(function (t) { return t.id === novo; }) ? novo : null;
  }
  function famDe(estado, id) { return arr(estado && estado.familias).filter(function (f) { return f.id === id; })[0] || null; }
  function bocasDe(estado, avaliarFam, id) { return arr(BI().conectoresDoEstado(estado, avaliarFam)).filter(function (k) { return k.famInst === id; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function atualizar(estado, avaliarFam, id) {
    var I = BI(); if (!I) return { ok: false, erro: "motor do hidro não carregou", ops: [] };
    var fi = famDe(estado, id), novo = ehLegada(fi);
    if (!novo) return { ok: false, erro: "esta caixa já está com as medidas da ficha (ou não tem versão da ficha)", ops: [] };
    var antes = bocasDe(estado, avaliarFam, id);
    var cur = clone(estado), fc = famDe(cur, id); fc.tipoId = novo;
    var depois = bocasDe(cur, avaliarFam, id), ops = [{ op: "instancia", id: id, tipoId: novo }], movidos = [];
    var TS = arr(cur.instalacoes && cur.instalacoes.trechos), PS = arr(cur.instalacoes && cur.instalacoes.pecas);
    function perto(p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= TOL; }
    function falha(m) { return { ok: false, erro: m + " — mantida a geometria antiga", ops: [] }; }
    /* a OUTRA ponta do tubo está presa (outro tubo, uma peça ou outra boca)? então a ponta mexida não pode tirar o tubo do eixo */
    function presa(t, pn, bocasCaixa) {
      var q = t[pn];
      return TS.some(function (u) { return u.id !== t.id && (perto(u.p1, q) || perto(u.p2, q)); }) || PS.some(function (k) { return perto(k, q); }) ||
        arr(I.conectoresDoEstado(cur, avaliarFam)).some(function (k) { return k.famInst !== id && perto(k, q); });
    }
    function dir(a, b) { var v = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; }
    for (var i = 0; i < antes.length; i++) {
      var a = antes[i], b = depois.filter(function (k) { return k.id === a.id; })[0];
      var ligados = [], pecas = [];
      TS.forEach(function (t) { ["p1", "p2"].forEach(function (pn) { if (perto(t[pn], a)) ligados.push({ t: t, ponta: pn }); }); });
      PS.forEach(function (k) { if (perto(k, a)) pecas.push(k); });   /* revisão 14/11 (M1): a peça (joelho, luva…) encaixada direto na boca */
      if (!ligados.length && !pecas.length) continue;
      if (!b) return falha("a boca " + a.id + " tem tubo ou peça ligada e não existe na geometria da ficha");
      /* revisão 14/11 (M3): a peça encaixada na boca com TUBO do outro lado (que não é um dos tubos desta boca) não é levada */
      for (var pk = 0; pk < pecas.length; pk++) {
        var kp = pecas[pk], outroTubo = TS.some(function (t) { return !ligados.some(function (L) { return L.t.id === t.id; }) && (Math.hypot(t.p1.x - kp.x, t.p1.y - kp.y, t.p1.z - kp.z) <= 0.3 || Math.hypot(t.p2.x - kp.x, t.p2.y - kp.y, t.p2.z - kp.z) <= 0.3) && Math.hypot((t.p1.x + t.p2.x) / 2 - a.x, (t.p1.z + t.p2.z) / 2 - a.z) > TOL; });
        if (outroTubo) return { ok: false, erro: "a peça na boca tem tubo do outro lado; ajuste à mão", ops: [] };
      }
      var d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; if (Math.hypot(d.x, d.y, d.z) < 1e-4) continue;
      for (var j = 0; j < ligados.length; j++) {
        var L = ligados[j], outra = L.ponta === "p1" ? "p2" : "p1", tn = clone(L.t), d0 = dir(tn[outra], tn[L.ponta]);
        tn[L.ponta] = { x: tn[L.ponta].x + d.x, y: tn[L.ponta].y + d.y, z: tn[L.ponta].z + d.z };
        var d1 = dir(tn[outra], tn[L.ponta]), cosA = d0.x * d1.x + d0.y * d1.y + d0.z * d1.z;
        /* revisão 14/11 (M1): com a outra ponta presa (conexão, outro tubo, aparelho), girar o tubo o tira do eixo da conexão de lá */
        if (cosA < 0.99985 && presa(L.t, outra)) return falha("o tubo " + L.t.id + " está preso na outra ponta e sairia do eixo da conexão (" + (Math.acos(Math.min(1, cosA)) * 180 / Math.PI).toFixed(1).replace(".", ",") + "°); refaça a ligação desta boca");
        var Lh0 = Math.hypot(L.t.p2.x - L.t.p1.x, L.t.p2.z - L.t.p1.z), Lh1 = Math.hypot(tn.p2.x - tn.p1.x, tn.p2.z - tn.p1.z);
        if (Lh0 < 1e-3 && Lh1 >= 1e-3) return falha("o tubo vertical " + L.t.id + " ficaria inclinado");
        /* declividade de TODO tubo horizontal de esgoto/pluvial mexido, pelo sentido REAL do fluxo: o lado da boca de ENTRADA chega à caixa
           (a caixa é jusante: a ponta da caixa é a mais baixa); o da SAÍDA sai dela (a caixa é montante: a ponta da caixa é a mais alta) */
        if (/^(esgoto|pluvial)$/.test(tn.sistema) && Lh1 >= 1e-3 && Math.abs(tn.p2.y - tn.p1.y) / Lh1 < 1) {
          var pc = tn[L.ponta], po = tn[outra], ehSaida = /saida/.test(a.id) && !/entrada/.test(a.id), queda = ehSaida ? pc.y - po.y : po.y - pc.y;
          var dec = queda / Lh1 * 100, min = I.declMinDn ? I.declMinDn(tn.sistema, tn.dn) : 0;
          if (dec + 1e-6 < min) return falha("o tubo " + tn.id + " (DN " + tn.dn + ") ficaria com " + dec.toFixed(2).replace(".", ",") + " % de declividade no sentido do fluxo, abaixo da mínima de " + String(min).replace(".", ",") + " %");
        }
        var op = I.opDoTrecho ? I.opDoTrecho(tn) : null; if (!op) { op = { op: "trecho" }; Object.keys(tn).forEach(function (k) { if (k !== "comprimento" && k !== "uid") op[k] = tn[k]; }); }
        ops.push(op); L.t[L.ponta] = tn[L.ponta];
        movidos.push({ trecho: tn.id, boca: a.id, d: d });
      }
      pecas.forEach(function (k) {
        var o = { op: "peca" }; Object.keys(k).forEach(function (c) { if (c !== "uid") o[c] = k[c]; });
        o.x = k.x + d.x; o.y = k.y + d.y; o.z = k.z + d.z; ops.push(o); k.x = o.x; k.y = o.y; k.z = o.z;
        movidos.push({ peca: k.id, boca: a.id, d: d });
      });
    }
    return { ok: true, ops: ops, movidos: movidos };
  }
  /* A TELA (só no navegador): nas Propriedades da caixa LEGADA, o botão "Atualizar para as medidas da ficha" — um lote só (um Ctrl+Z) */
  function secaoPaleta(ids) {
    if (arr(ids).length !== 1 || !global.BIM || !global.BIM.editarEstado) return null;
    var id = String(ids[0]).replace(/^edit:/, ""), est = null; try { est = global.BIM.editarEstado().estado; } catch (e) { return null; }
    var fi = famDe(est, id); if (!ehLegada(fi)) return null;
    return { nome: "Medidas da ficha", params: [
      { id: "hcf:info", rotulo: "Geometria", leitura: true, valor: "a de antes (projeto salvo): bocas e corpo antigos" },
      { id: "hcf:atualizar", rotulo: "Caixa", tipo: "botao", rotuloBotao: "Atualizar para as medidas da ficha", fn: function () {
        var r; try { var es0 = global.BIM.editarEstado(); r = es0 && es0.estado ? atualizar(es0.estado, global.BIM.familiaAvaliar, id) : { ok: false, erro: "o editor não está aberto" }; } catch (eA) { r = { ok: false, erro: "falha ao ler o modelo (" + eA.message + ")" }; }   /* revisão 14/11 (B2) */
        var msg = r.ok ? "Caixa atualizada para as medidas da ficha (" + r.movidos.length + " tubo(s) levados para as bocas novas). Ctrl+Z desfaz." : "Não atualizei: " + r.erro;
        if (r.ok && global.BimPropsUI && global.BimPropsUI.despachar && !global.BimPropsUI.despachar(r.ops, "Atualizar caixa para a ficha")) msg = "O editor recusou a atualização.";
        try { if (global.BimShell && global.BimShell.status) global.BimShell.status(msg); else if (global.alert) global.alert(msg); } catch (e) {}
      } }] };
  }
  var HidCaixaFicha = { FAM: FAM, SUF: SUF, ehLegada: ehLegada, atualizar: atualizar, secaoPaleta: secaoPaleta };
  global.HidCaixaFicha = HidCaixaFicha;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCaixaFicha;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
