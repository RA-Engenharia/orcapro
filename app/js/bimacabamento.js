/* =====================================================================
 * bimacabamento.js — ACABAMENTO POR AMBIENTE, motor PURO (ES5).
 *
 * Fase P2, Frente C do plano do BIM (fase P2). O ambiente
 * (js/bimambiente.js, o ambiente) já sabe o contorno, a área, a altura
 * e os LADOS da fronteira com a peça dona de cada um. Aqui saem as
 * QUANTIDADES do acabamento — o que vira linha de orçamento no
 * js/orcmodelo.js (doModelo → daAmbiente):
 *
 *   areaPiso   (m²) piso e contrapiso = a área do ambiente NA FACE da
 *              parede (o piso vai de face a face, qualquer que seja a regra
 *              de "Cálculos de área e volume" do projeto), menos as ilhas
 *              (pilar solto).
 *   rodape     (m)  o perímetro na face dos lados de PAREDE e de PILAR −
 *              a largura de cada vão que chega ao piso naquele lado (porta,
 *              porta-janela). Lado de SEPARADOR de ambiente não conta: lá
 *              não há parede. A largura descontada é a do VÃO DA ALVENARIA
 *              (abertura da família): na porta de giro RA "0,80 × 2,10" o
 *              vão é 0,80 + 2 × 0,05 de batente = 0,90 — o rodapé para no
 *              batente, que fica DENTRO do vão (nada a mais a descontar).
 *              Janela (peitoril acima do piso) não corta o rodapé.
 *   areaParede (m²) por LADO da fronteira (a face da parede voltada para o
 *              ambiente): comprimento × altura − os vãos daquele lado. A
 *              altura é a do ambiente (Altura não delimitada) recortada pela
 *              parede: min(topo do ambiente, topo da parede) − max(base do
 *              ambiente, base da parede) — no caso comum (parede e ambiente
 *              de 2,80) é a altura do ambiente. O vão desconta a parte dele
 *              que cai dentro dessa faixa. Guardado também POR FACE
 *              (parede:<id>:fora|dentro|ponta, pilar:<id>): cada face é de
 *              um lado só — se dois ambientes reclamarem o mesmo trecho de
 *              face (não acontece numa fronteira bem formada), o segundo
 *              NÃO conta o trecho e ganha aviso.
 *   areaTeto   (m²) pintura de teto / forro = a área na face — ou a do
 *              FORRO do ambiente quando houver (gancho da Frente B:
 *              opts.forroDe(amb) ou estado.forros[] com ambienteId; sem
 *              forro, vale a área do ambiente).
 *
 * Ambiente "não delimitado" ou "redundante" não tem quantidade (null): o
 * orçamento diz "pendente" com o motivo — nunca zero calado.
 *
 * Teste: node tools/test-p2-acabamento.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function txt(v) { return v == null ? "" : String(v); }
  function sobre(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  /* a porta "chega ao piso": a base do vão até 5 cm acima da base do ambiente */
  var TOL_PISO = 0.05;

  /* as medidas (a unidade é a do js/bimedit.js MEDIDAS_AMBIENTE) */
  var MEDIDAS = {
    areaPiso: { un: "m2", rotulo: "Área de piso (face a face)" },
    rodape: { un: "m", rotulo: "Rodapé (perímetro − portas)" },
    areaParede: { un: "m2", rotulo: "Área de parede (por face, − vãos)" },
    areaTeto: { un: "m2", rotulo: "Área de teto (ou do forro)" }
  };
  /* os acabamentos do ambiente: o parâmetro (campo), a medida e as
     classes do mapa SINAPI (data/sinapi-familias-mapa.json) que oferecem
     composição. Um acabamento pode ter mais de um serviço (piso +
     contrapiso; reboco + pintura). */
  var ITENS = [
    { id: "piso", acab: "piso", campo: "acabPiso", rotulo: "Piso", medida: "areaPiso", classes: ["piso", "piso_externo", "pintura_piso"] },
    { id: "contrapiso", acab: "piso", campo: null, rotulo: "Contrapiso", medida: "areaPiso", classes: ["contrapiso"] },
    { id: "rodape", acab: "base", campo: "acabBase", rotulo: "Rodapé", medida: "rodape", classes: ["rodape"] },
    { id: "parede", acab: "parede", campo: "acabParede", rotulo: "Parede", medida: "areaParede", classes: ["revestimento_parede", "pintura_parede", "massa_unica", "chapisco", "gesso", "estucamento"] },
    { id: "teto", acab: "forro", campo: "acabForro", rotulo: "Teto", medida: "areaTeto", classes: ["pintura_teto", "forro", "gesso"] }
  ];
  var ACABS = [
    { id: "piso", campo: "acabPiso", nome: "Acabamento do piso", medida: "areaPiso" },
    { id: "base", campo: "acabBase", nome: "Acabamento base", medida: "rodape" },
    { id: "parede", campo: "acabParede", nome: "Acabamento da parede", medida: "areaParede" },
    { id: "forro", campo: "acabForro", nome: "Acabamento do forro", medida: "areaTeto" }
  ];
  function itemPorId(id) { for (var i = 0; i < ITENS.length; i++) if (ITENS[i].id === id) return ITENS[i]; return null; }
  /* o item de um serviço gravado: pelo rótulo (Piso × Contrapiso), senão pela medida */
  function itemDoServico(s) {
    if (!s) return null;
    for (var i = 0; i < ITENS.length; i++) if (ITENS[i].rotulo === s.rotulo && ITENS[i].medida === s.medida) return ITENS[i];
    for (var j = 0; j < ITENS.length; j++) if (ITENS[j].medida === s.medida && (!s.acab || ITENS[j].acab === s.acab)) return ITENS[j];
    return null;
  }

  /* a faixa vertical de uma peça que delimita (parede, pilar) */
  function faixaPeca(c, A) {
    if (!c) return null;
    if (c.tipo === "pilar") { var y0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2; return { y0: y0, y1: y0 + num(c.altura, 0) }; }
    var f = A && A.frameDe ? A.frameDe(c) : null;
    return f ? { y0: f.y0, y1: f.y1 } : null;
  }

  /* o forro do ambiente (Frente B): o gancho opts.forroDe(amb) ou estado.forros[] com ambienteId.
     P2 integração: o ambienteId é DERIVADO no replay (BimForro.ligarAmbientes — o forro
     automático pelo ponto, o por contorno por um ponto de dentro dele, no mesmo nível).
     Dois forros no mesmo ambiente (gesso numa parte, PVC na outra): o teto é a SOMA. */
  function areaForro(f) { return fin(f.area) ? f.area : (f.calc && fin(f.calc.area) ? f.calc.area : null); }
  function forroDe(estado, a, opts) {
    var f = null;
    if (opts && typeof opts.forroDe === "function") { try { f = opts.forroDe(a); } catch (e) { f = null; } }
    if (f) { var a1 = areaForro(f); return a1 != null && a1 > 0 ? { id: f.id != null ? String(f.id) : null, ids: f.id != null ? [String(f.id)] : [], area: a1 } : null; }
    var ls = arr(estado && estado.forros).filter(function (x) { return x && x.ok !== false && x.ambienteId != null && String(x.ambienteId) === String(a.id) && areaForro(x) > 0; });
    if (!ls.length) return null;
    return { id: ls[0].id != null ? String(ls[0].id) : null, ids: ls.map(function (x) { return String(x.id); }), area: ls.reduce(function (s, x) { return s + areaForro(x); }, 0) };
  }

  /* projeção de um ponto na reta do lado (para conferir sobreposição de faces) */
  function intervaloNaReta(l, ref) {
    var dx = ref.x1 - ref.x0, dz = ref.z1 - ref.z0, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0)) return null;
    var ux = dx / L, uz = dz / L;
    /* fora da reta (mais de 1 mm): não sobrepõe */
    function dist(x, z) { return Math.abs((x - ref.x0) * uz - (z - ref.z0) * ux); }
    if (dist(l.x0, l.z0) > 1e-3 || dist(l.x1, l.z1) > 1e-3) return null;
    var a = (l.x0 - ref.x0) * ux + (l.z0 - ref.z0) * uz, b = (l.x1 - ref.x0) * ux + (l.z1 - ref.z0) * uz;
    return [Math.min(a, b), Math.max(a, b)];
  }

  /* ------------------------------------------------------------------
   * quantidades(estado, opts) — o estado do replay (BimEdit.aplicar), com
   * estado.ambientes[].calc já calculado. opts: { avaliarFam, vaos
   * (BimEdit.vaosDasParedes já pronto), forroDe }.
   * → { porId: {ambId: Q}, porFace: {chave: {chave, tipo, id, face,
   *      area, comprimento, ambientes:[ids]}}, avisos }
   * Q = { id, estado, areaPiso, rodape, areaParede, areaTeto, tetoFonte,
   *       perimetroParedes, portas:[{id, parede, largura}], areaParedeBruta,
   *       areaVaos, altura, lados:[…], avisos? }
   * ------------------------------------------------------------------ */
  function quantidades(estado, opts) {
    opts = opts || {};
    var A = dep("BimArq", "./bimarq.js"), E = dep("BimEdit", "./bimedit.js");
    var vaos = opts.vaos || (E && E.vaosDasParedes && typeof opts.avaliarFam === "function" ? E.vaosDasParedes(estado, opts.avaliarFam) : {});
    var caixas = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) caixas[String(c.id)] = c; });
    var porId = {}, porFace = {}, avisos = [];
    arr(estado && estado.ambientes).forEach(function (a) {
      if (!a || a.id == null) return;
      var k = a.calc || {}, Q = { id: String(a.id), nome: txt(a.nome) || "Ambiente", estado: k.estado || "naoDelimitado", areaPiso: null, rodape: null, areaParede: null, areaTeto: null,
        tetoFonte: null, perimetroParedes: null, portas: [], areaParedeBruta: null, areaVaos: null, altura: fin(k.altura) ? k.altura : null, lados: [], avisos: [] };
      porId[Q.id] = Q;
      if (Q.estado !== "delimitado" || !fin(k.areaFace)) {
        Q.avisos.push(Q.estado === "redundante" ? "ambiente redundante: a região já é de outro ambiente — sem quantidade (nada é contado duas vezes)"
          : "ambiente não delimitado: sem quantidade (feche a região com paredes, pilares ou separador de ambiente)");
        return;
      }
      var base = num(k.base, 0), topo = num(k.topo, base);
      Q.areaPiso = r4(k.areaFace);
      var fo = forroDe(estado, a, opts);
      Q.areaTeto = r4(fo ? fo.area : k.areaFace); Q.tetoFonte = fo ? "forro" : "ambiente"; if (fo) { Q.forroId = fo.id; if (fo.ids.length > 1) Q.forroIds = fo.ids; }
      var perim = 0, rod = 0, parBruta = 0, parLiq = 0, aVaos = 0;
      arr(k.lados).forEach(function (ld) {
        var fonte = ld.fonte || {}, L = num(ld.comprimento, 0);
        var lado = { tipo: fonte.tipo || "?", id: fonte.id != null ? String(fonte.id) : null, face: fonte.face || null, x0: ld.x0, z0: ld.z0, x1: ld.x1, z1: ld.z1,
          comprimento: r4(L), altura: 0, areaBruta: 0, vaos: [], area: 0, rodape: 0 };
        Q.lados.push(lado);
        if (lado.tipo !== "parede" && lado.tipo !== "pilar") return;   /* separador: sem parede, sem rodapé, sem revestimento */
        lado.chave = lado.tipo === "parede" ? "parede:" + lado.id + ":" + (lado.face || "?") : "pilar:" + lado.id;
        var c = caixas[lado.id], fx = faixaPeca(c, A);
        var H = fx ? sobre(base, topo, fx.y0, fx.y1) : Math.max(0, topo - base);
        /* o mesmo trecho de face já foi de outro ambiente? (não acontece numa fronteira bem formada) */
        var ja = porFace[lado.chave], dup = 0;
        if (ja) ja.trechos.forEach(function (t) { var iv = intervaloNaReta(lado, t); var i0 = intervaloNaReta(t, t); if (iv && i0) dup += sobre(iv[0], iv[1], i0[0], i0[1]); });
        if (dup > 1e-3) {
          lado.duplicado = r4(dup);
          Q.avisos.push("a face " + lado.chave + " já é de outro ambiente (" + ja.ambientes.join(", ") + "): o trecho repetido não conta de novo");
          return;
        }
        var portaL = 0, vaoA = 0;
        if (lado.tipo === "parede" && c && A && A.frameDe && vaos[lado.id] && arr(vaos[lado.id].aceitos).length) {
          var f = A.frameDe(c), u0 = A.aLocal(f, lado.x0, lado.z0)[0], u1 = A.aLocal(f, lado.x1, lado.z1)[0], ua = Math.min(u0, u1), ub = Math.max(u0, u1);
          /* CURVA: na parede curva o lado é um arco da FACE — o u é o do eixo (js/bimcurva.js) e o vão reto
             corta nesta face o arco de meia abertura asen(c/ρ): a largura que sai é a do arco DESTA face */
          var BCa = c.arco ? dep("BimCurva", "./bimcurva.js") : null, Wa = BCa ? BCa.modelo(c) : null, rhoF = null;
          if (Wa && Wa.ok && Wa.arco) {
            var qa = Wa.local([lado.x0, lado.z0])[0], qb = Wa.local([lado.x1, lado.z1])[0];
            ua = Math.min(qa, qb); ub = Math.max(qa, qb);
            rhoF = Wa.rho(((lado.face === "fora") !== !!c.inverterFaces ? -1 : 1) * Wa.t / 2);
          }
          /* só a FACE de comprido (fora/dentro): a ponta da parede não tem vão */
          if (lado.face === "fora" || lado.face === "dentro") vaos[lado.id].aceitos.forEach(function (v) {
            var du;
            if (rhoF) { var hw = Wa.R * Math.asin(Math.min(1, num(v.largura, v.x1 - v.x0) / 2 / rhoF)); du = sobre(ua, ub, num(v.t, 0) - hw, num(v.t, 0) + hw) * rhoF / Wa.R; }
            else du = sobre(ua, ub, v.x0, v.x1);
            if (!(du > 1e-6)) return;
            var y0 = f.y0 + num(v.y0, 0), y1 = f.y0 + num(v.y1, 0), dy = sobre(base, topo, y0, y1);
            var noPiso = y0 <= base + TOL_PISO && y1 > base + TOL_PISO;
            lado.vaos.push({ id: v.id, largura: r4(du), altura: r4(dy), area: r4(du * dy), piso: noPiso });
            vaoA += du * dy;
            if (noPiso) { portaL += du; Q.portas.push({ id: v.id, parede: lado.id, largura: r4(du) }); }
          });
        }
        lado.altura = r4(H); lado.areaBruta = r4(L * H); lado.area = r4(Math.max(0, L * H - vaoA)); lado.rodape = r4(Math.max(0, L - portaL));
        perim += L; rod += Math.max(0, L - portaL); parBruta += L * H; parLiq += Math.max(0, L * H - vaoA); aVaos += vaoA;
        var pf = porFace[lado.chave] || (porFace[lado.chave] = { chave: lado.chave, tipo: lado.tipo, id: lado.id, face: lado.face, area: 0, comprimento: 0, ambientes: [], trechos: [] });
        pf.area += Math.max(0, L * H - vaoA); pf.comprimento += L; if (pf.ambientes.indexOf(Q.id) < 0) pf.ambientes.push(Q.id);
        pf.trechos.push({ x0: lado.x0, z0: lado.z0, x1: lado.x1, z1: lado.z1 });
      });
      Q.perimetroParedes = r4(perim); Q.rodape = r4(rod); Q.areaParedeBruta = r4(parBruta); Q.areaParede = r4(parLiq); Q.areaVaos = r4(aVaos);
    });
    Object.keys(porFace).forEach(function (ch) { var p = porFace[ch]; p.area = r4(p.area); p.comprimento = r4(p.comprimento); delete p.trechos; });
    Object.keys(porId).forEach(function (id) { if (!porId[id].avisos.length) delete porId[id].avisos; });
    return { porId: porId, porFace: porFace, avisos: avisos };
  }

  /* o texto curto das quantidades (Propriedades do ambiente) */
  function resumoTexto(Q, fmt) {
    if (!Q || Q.estado !== "delimitado") return "sem quantidade (" + (Q && Q.estado === "redundante" ? "redundante" : "não delimitado") + ")";
    var f = typeof fmt === "function" ? fmt : function (v) { return String(Math.round(v * 100) / 100).replace(".", ","); };
    return "Piso " + f(Q.areaPiso) + " m² · Rodapé " + f(Q.rodape) + " m · Parede " + f(Q.areaParede) + " m² · Teto " + f(Q.areaTeto) + " m²" + (Q.tetoFonte === "forro" ? " (forro)" : "");
  }

  var BimAcabamento = {
    MEDIDAS: MEDIDAS, ITENS: ITENS, ACABS: ACABS, TOL_PISO: TOL_PISO,
    itemPorId: itemPorId, itemDoServico: itemDoServico,
    quantidades: quantidades,
    /* um ambiente só (o mesmo cálculo) */
    doAmbiente: function (estado, id, opts) { return quantidades(estado, opts).porId[String(id)] || null; },
    resumoTexto: resumoTexto,
    /* o ambiente DELIMITADO cuja região contém o ponto {x, z} (fora das ilhas) — ou null */
    ambienteNoPonto: function (estado, p) {
      if (!p || !fin(Number(p.x)) || !fin(Number(p.z))) return null;
      function dentro(P) {
        var x = Number(p.x), z = Number(p.z), d = false;
        for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
          var a = P[i], b = P[j];
          if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) d = !d;
        }
        return d;
      }
      var achou = null;
      arr(estado && estado.ambientes).some(function (a) {
        var k = a && a.calc; if (!k || k.estado !== "delimitado" || arr(k.contorno).length < 3) return false;
        if (!dentro(k.contorno) || arr(k.furos).some(function (f) { return arr(f).length >= 3 && dentro(f); })) return false;
        achou = a; return true;
      });
      return achou;
    },
    /* a op que GRAVA a escolha no ambiente: os serviços + os textos dos
       acabamentos (null apaga). Uma op só: Ctrl+Z desfaz tudo. */
    opAplicar: function (ambId, servicos, textos) {
      var E = dep("BimEdit", "./bimedit.js");
      if (ambId == null || ambId === "") return { ok: false, motivo: "Escolha um ambiente." };
      var campos = { servicos: E && E.limparServicosAmbiente ? E.limparServicosAmbiente(servicos) : [] };
      Object.keys(textos || {}).forEach(function (k) {
        if (!ACABS.some(function (x) { return x.campo === k; })) return;
        var v = textos[k]; campos[k] = v == null || String(v).trim() === "" ? null : String(v).trim().slice(0, 120);
      });
      var o = { op: "ajustarAmbiente", id: ambId, campos: campos };
      if (E && E.opAmbienteValida && !E.opAmbienteValida(o)) return { ok: false, motivo: "Serviço do ambiente com formato inválido." };
      return { ok: true, op: o };
    }
  };

  global.BimAcabamento = BimAcabamento;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAcabamento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
