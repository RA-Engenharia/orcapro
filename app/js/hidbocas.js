/* =====================================================================
 * hidbocas.js — AS BOCAS DE CATÁLOGO das peças de esgoto (caixa sifonada, ralo, caixa de inspeção…). Motor PURO, ES5, Node-testável.
 * Global: HidBocas.
 *
 * POR QUE (13/11/2026, Rogério testando a 1.2.286): ao ligar a pia na caixa sifonada o tubo chegava NA CAIXA mas não NA ENTRADA dela. A peça
 * tem bocas de verdade — entradas e saída com DN e quantidade da ficha do fabricante — e a ligação tem de terminar EXATAMENTE numa boca livre.
 *
 * FONTE DE CADA DADO (a MESMA do 3D e do orçamento: js/biminstgeo.js cotasPeca, ficha Amanco "caixas sifonadas e ralos", pág. 8/9):
 *   · altura do corpo (alt), Ø do corpo (diam), DN e altura da saída (dnSaida, hSaida), DN e Nº de entradas;
 *   · sem cotasPeca (Node sem o HidGeo): o item do js/hidcatalogo.js pela chave C × A × DN (DN e Nº de entradas).
 *   · posição em planta: a ficha NÃO cota onde cada boca fica: a distribuição da família hid-caixa-sifonada (js/hidfamilias.js: a 1ª entrada
 *     oposta à saída, depois ±90°, ±135°, ±45°) no raio do corpo, a saída no sentido do giro — marcada `aConferir`.
 *   · altura da entrada: a ficha não cota; vale do topo do corpo até a geratriz de baixo dela no nível da geratriz de baixo da saída (acima
 *     disso a entrada furaria o fecho hídrico — NUNCA abaixo).
 *   · REBAIXO (pk.rebaixo, m): o corpo desce com o PROLONGADOR e a grelha fica no piso acabado. Quem desenha o corpo rebaixado e o prolongador é o
 *     js/biminstgeo.js corpoPeca (lê o rebaixo); quem orça é BimInst.prolongadorDe (insumo SINAPI 11735/11738); o limite é BimInst.limiteRebaixo.
 *   Peça sem boca de catálogo (ralo sem entrada lateral, caixa de inspeção): lista SEM_BOCA; a ligação vai ao centro, com aviso.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HG() { return dep("HidGeo", "./biminstgeo.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok arredondamento a 0,1 mm (formatação)
  function txt(v) { return v == null ? "" : String(v); }
  var MM = 0.001;   // hid:ok mm → m

  /* as faces das entradas em relação à saída (graus, sentido anti-horário em planta) — a ordem da família hid-caixa-sifonada */
  var ANG_ENTRADAS = [180, 90, -90, 135, -135, 45, -45];   // hid:ok geometria do desenho (distribuição das bocas), não norma

  var _cache = {};
  function itens() { var C = CAT(); try { return C && C.itens ? arr(C.itens()) : []; } catch (e) { return []; } }
  function dnPapel(it, papel) { var c = arr(it.conectores).filter(function (k) { return txt(k.papel).indexOf(papel) === 0 && typeof k.dn === "number"; })[0]; return c ? c.dn : null; }
  /* as cotas da peça: { fonte, entradas, dnEntrada, dnSaida, alt (mm), diam (mm), hSaida (mm|null) } | null */
  function catalogo(peca, dnChave) {
    var k = txt(peca) + "|" + txt(dnChave); if (_cache[k] !== undefined) return _cache[k];
    var res = null, G = HG();
    if (/^(caixa_sifonada|ralo_)/.test(txt(peca)) && G && G.cotasPeca) {
      var ct = null; try { ct = G.cotasPeca({ peca: peca, dn: dnChave }); } catch (eC) { ct = null; }
      if (ct && ct.fontes && ct.fontes.length && ct.dnS > 0) res = { fonte: ct.fontes.join("; "), entradas: num(ct.nE, 0), dnEntrada: ct.nE ? ct.dnE : null, dnSaida: ct.dnS, alt: ct.alt, diam: ct.diam, hSaida: ct.hS };
    }
    var ds = txt(dnChave).split("x").map(Number);
    if (!res && peca === "caixa_sifonada" && ds.length === 3) {
      var it = itens().filter(function (i) {
        if (i.tipo !== "caixa_sifonada" || !arr(i.conectores).length) return false;
        var m = /(\d+)\s*X\s*(\d+)\s*X\s*DN\s*(\d+)/i.exec(txt(i.descricao)); return m && +m[1] === ds[0] && +m[2] === ds[1] && +m[3] === ds[2];
      })[0];
      if (it && dnPapel(it, "entrada") && dnPapel(it, "saida") && num(it.dados && it.dados.entradas, 0) > 0)
        res = { fonte: (it.fabricante || "") + " " + it.codigo + " — " + it.descricao, entradas: num(it.dados.entradas, 0), dnEntrada: dnPapel(it, "entrada"), dnSaida: dnPapel(it, "saida"), alt: ds[1], diam: ds[0], hSaida: null };
    }
    _cache[k] = res; return res;
  }
  /* o que o catálogo NÃO dá (a ligação vai ao centro, com aviso) */
  function semBoca() {
    var I = BI(), out = []; if (!I) return out;
    Object.keys(I.PECAS).forEach(function (p) {
      var P = I.PECAS[p]; if (!arr(P.sistemas).some(function (s) { return s === "esgoto" || s === "pluvial"; }) || p === "terminal_ventilacao") return;
      arr(P.dns).forEach(function (dn) {
        var c = catalogo(p, dn);
        if (!c) out.push({ peca: p, dn: dn, falta: "entradas e saída", nome: P.nome });
        else if (!c.entradas) out.push({ peca: p, dn: dn, falta: "entradas (o catálogo só dá a saída DN " + c.dnSaida + ")", nome: P.nome });
      });
    });
    return out;
  }
  function limiteRebaixo(pk) { var I = BI(); return I && I.limiteRebaixo ? I.limiteRebaixo(pk) : 0; }

  /* as bocas da peça no mundo: [{ id, papel, x, y, z, dir, dn, ocupada, aConferir }] ([] = sem boca de catálogo) */
  function bocas(estado, pk) {
    var I = BI(); if (!I || !pk) return [];
    var P = I.PECAS[pk.peca] || {}, c = catalogo(pk.peca, pk.dn); if (!c) return [];
    var rot = num(pk.rotY, 0), r = num(c.diam, 100) / 2 * MM, out = [];   // hid:ok Ø de reserva do desenho
    var rbx = Math.max(0, num(pk.rebaixo, 0)), base = num(pk.y, 0) - num(c.alt, 100) * MM - rbx, topo = num(pk.y, 0) - rbx;   // hid:ok altura de reserva
    function boca(id, papel, angGr, y, dn) {
      var a = rot + angGr * Math.PI / 180, d = { x: r4(Math.cos(a)), y: 0, z: r4(-Math.sin(a)) };
      out.push({ id: id, papel: papel, x: r4(pk.x + d.x * r), y: r4(y), z: r4(pk.z + d.z * r), dir: d, dn: dn, aConferir: "posição da boca não cotada na ficha (" + c.fonte + ")" });
    }
    /* a saída na altura da ficha (hSaida); sem ela, meio DN + 2 mm do fundo (a mesma conta do corpoPeca) */
    var hS = c.hSaida != null ? c.hSaida : c.dnSaida / 2 + 2;   // hid:ok 2 mm: a do corpoPeca
    boca("saida", "saida", 0, base + hS * MM, c.dnSaida);
    var yE = topo - c.dnEntrada / 2 * MM - 0.005;   // hid:ok 5 mm abaixo do topo do corpo (a geratriz de cima da entrada)
    for (var i = 0; i < c.entradas && i < ANG_ENTRADAS.length; i++) boca("entrada" + (i + 1), "entrada", ANG_ENTRADAS[i], yE, c.dnEntrada);
    /* ocupada: um tubo termina na boca, ou (projeto antigo, tubo até o centro) sai da caixa na direção dela — a faixa do hub desce com o rebaixo */
    var TS = arr(estado && estado.instalacoes && estado.instalacoes.trechos), hub0 = pk.hub || { r: num(P.captura, 0.1), yTop: pk.y + 0.02, yBot: pk.y - num(P.prof, 0.3) };
    var hub = { r: Math.max(num(hub0.r, 0.1), r), yTop: hub0.yTop, yBot: hub0.yBot - rbx };
    out.forEach(function (b) {
      b.ocupada = TS.some(function (t) {
        return [["p1", "p2"], ["p2", "p1"]].some(function (e) {
          var a = t[e[0]], o = t[e[1]];
          if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= b.dn / 2000 + 0.005) return true;   // hid:ok o raio da boca + 5 mm
          var dc = Math.hypot(a.x - pk.x, a.z - pk.z); if (dc > hub.r + 0.01 || a.y > hub.yTop + 0.01 || a.y < hub.yBot - 0.01) return false;
          var hx = o.x - a.x, hz = o.z - a.z, L = Math.hypot(hx, hz); if (L < 0.01) return false;
          return (hx * b.dir.x + hz * b.dir.z) / L > 0.92 && (b.papel === "saida" ? e[0] === "p1" : e[0] === "p2");   // hid:ok ~23° de folga de direção
        });
      });
    });
    return out;
  }
  /* a entrada livre mais adequada para um tubo DN `dn` que vem de `de` (a mais alinhada com a chegada) */
  function entradasLivres(estado, pk, de, dn) {
    var bs = bocas(estado, pk).filter(function (b) { return b.papel === "entrada"; }), nome = txt((BI().PECAS[pk.peca] || {}).nome).toLowerCase() + " " + pk.id;
    if (!bs.length) return { ok: false, semBoca: true, bocas: [] };
    var dnOk = bs.filter(function (b) { return num(b.dn, 0) === num(dn, 0); });
    if (!dnOk.length) return { ok: false, dnDiferente: true, dnBoca: bs[0].dn, erro: "a " + nome + " tem entradas DN " + bs[0].dn + " e o ramal que chega é DN " + dn + " (nenhuma redução é posta na caixa)", bocas: [] };
    var liv = dnOk.filter(function (b) { return !b.ocupada; });
    if (!liv.length) return { ok: false, erro: "a " + nome + " não tem entrada livre (" + dnOk.length + " de " + dnOk.length + " entradas DN " + dn + " ocupadas) — use uma caixa com mais entradas ou ligue no tubo de saída dela", bocas: [] };
    var vx = num(de && de.x, pk.x) - pk.x, vz = num(de && de.z, pk.z) - pk.z, Lv = Math.hypot(vx, vz) || 1;
    liv.sort(function (a, b) { return -((a.dir.x * vx + a.dir.z * vz) - (b.dir.x * vx + b.dir.z * vz)) / Lv; });
    return { ok: true, bocas: liv };
  }
  /* a cota mais baixa do EIXO de uma entrada DN `dn`: a geratriz de baixo dela no nível da geratriz de baixo da saída (o fecho hídrico) */
  function yMinEntrada(estado, pk, dn) {
    var s = bocas(estado, pk).filter(function (b) { return b.papel === "saida"; })[0];
    return s ? r4(s.y - s.dn / 2000 + num(dn, 40) / 2000) : -Infinity;   // hid:ok meio-DN (mm → m), geometria
  }
  var HidBocas = { VERSAO: 2, yMinEntrada: yMinEntrada, catalogo: catalogo, bocas: bocas, entradasLivres: entradasLivres, semBoca: semBoca, limiteRebaixo: limiteRebaixo, ANG_ENTRADAS: ANG_ENTRADAS };
  global.HidBocas = HidBocas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBocas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
