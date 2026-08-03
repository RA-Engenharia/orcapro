/* OrçaPRO — BIM Editor (motor puro, Node-testável)
 *
 * Criação e edição de volumetria SINTÉTICA dentro do viewer BIM: parede
 * (2 cliques), laje (retângulo), pilar (1 clique), anotações, apagar e
 * mover (pick & place) — como uma LISTA DE OPERAÇÕES serializável.
 *
 * Honestidade RA: tudo que nasce aqui é "sintético (criado no OrçaPRO)",
 * com QTO exato das primitivas (nada estimado). Elemento de IFC importado
 * NUNCA é alterado — "apagar" um IFC é ocultá-lo marcado como removido na
 * edição (o arquivo original não muda), e isso fica declarado na UI.
 *
 * Convenção geométrica = a do viewer (three.js Y-up) e do Planta3D.extrudar:
 * caixa {cx,cy,cz, comprimento (eixo X local), altura (Y), espessura (Z),
 * rotY} com rotY tal que R_y(rotY) leva o eixo X local à direção p1→p2 no
 * plano XZ do mundo: rotY = atan2(-(z2-z1), x2-x1)  [three: (1,0,0) →
 * (cos θ, 0, −sin θ)] — provado por teste (endpoints da caixa == cliques).
 */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  var BimEdit = {

    // ---------------- geometria das primitivas (cliques em MUNDO x/z) ----

    /* parede de p1 a p2 (plano XZ), base = Y do piso. Retorna caixa ou null
       (cliques coincidentes). area = 1 face (o que a Parede-Cebola consome). */
    parede: function (p1, p2, espessura, altura, base) {
      var dx = p2.x - p1.x, dz = p2.z - p1.z;
      var L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 0.01)) return null;
      espessura = num(espessura, 0.15); altura = num(altura, 2.8); base = num(base, 0);
      if (!(espessura > 0) || !(altura > 0)) return null; // dimensão negativa/zero não vira QTO silencioso
      return {
        tipo: "parede", ifc: "IFCWALL",
        cx: r4((p1.x + p2.x) / 2), cy: r4(base + altura / 2), cz: r4((p1.z + p2.z) / 2),
        comprimento: r4(L), altura: r4(altura), espessura: r4(espessura),
        rotY: r4(Math.atan2(-dz, dx)),
        area: r4(L * altura),
        volume: r4(L * altura * espessura)
      };
    },

    /* laje pelo retângulo da diagonal p1-p2 (alinhada aos eixos), espessura
       p/ baixo a partir de base (topo da laje = base). */
    laje: function (p1, p2, espessura, base) {
      var dx = Math.abs(p2.x - p1.x), dz = Math.abs(p2.z - p1.z);
      if (!(dx > 0.05) || !(dz > 0.05)) return null;
      espessura = num(espessura, 0.10); base = num(base, 0);
      if (!(espessura > 0)) return null;
      return {
        tipo: "laje", ifc: "IFCSLAB",
        cx: r4((p1.x + p2.x) / 2), cy: r4(base - espessura / 2), cz: r4((p1.z + p2.z) / 2),
        comprimento: r4(dx), altura: r4(espessura), espessura: r4(dz),
        rotY: 0,
        area: r4(dx * dz),
        volume: r4(dx * dz * espessura)
      };
    },

    /* pilar no ponto p, seção quadrada (m), da base ao topo. */
    pilar: function (p, secao, altura, base) {
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.z))) return null; // parede/laje já barram por L; pilar precisa barrar o ponto
      secao = num(secao, 0.20); altura = num(altura, 2.8); base = num(base, 0);
      if (!(secao > 0.02) || !(altura > 0)) return null;
      return {
        tipo: "pilar", ifc: "IFCCOLUMN",
        cx: r4(p.x), cy: r4(base + altura / 2), cz: r4(p.z),
        comprimento: r4(secao), altura: r4(altura), espessura: r4(secao),
        rotY: 0,
        area: r4(secao * secao),
        volume: r4(secao * secao * altura),
        comprimentoPilar: r4(altura)
      };
    },

    /* endpoints do eixo da caixa no mundo (prova da convenção + gizmos):
       centro ± R_y(rotY)·(L/2, 0, 0), com R_y do three: x'=x·cosθ+z·sinθ,
       z'=−x·sinθ+z·cosθ. */
    eixoDaCaixa: function (cx) {
      var c = Math.cos(cx.rotY), s = Math.sin(cx.rotY), h = cx.comprimento / 2;
      return [
        { x: r4(cx.cx - h * c), z: r4(cx.cz + h * s) },
        { x: r4(cx.cx + h * c), z: r4(cx.cz - h * s) }
      ];
    },

    // ---------------- operações (serializáveis; replay determinístico) --

    /* aplica a lista de ops e devolve o ESTADO FINAL:
       { caixas: [{...caixa, id}], anotacoes: [{id,x,y,z,texto}],
         removidosIfc: [uid...], invalidas: n }
       - criar:  {op:'criar', id, caixa}
       - mover:  {op:'mover', id, cx, cz}          (só sintéticos)
       - apagar: {op:'apagar', id}                 (sintético)
       - apagarIfc: {op:'apagarIfc', uid}          (IFC: oculta, não altera)
       - anotar: {op:'anotar', id, x, y, z, texto}
       - desanotar: {op:'desanotar', id}
       Ordem importa; op sobre id inexistente é ignorada (contada). */
    aplicar: function (ops) {
      var caixas = {}, ordem = [], anot = {}, ordemA = [], removidos = {}, invalidas = 0;
      (ops || []).forEach(function (o) {
        if (!o || !o.op) { invalidas++; return; }
        if (o.op === "criar" && o.caixa && o.id != null) {
          caixas[o.id] = JSON.parse(JSON.stringify(o.caixa));
          caixas[o.id].id = o.id;
          if (ordem.indexOf(o.id) < 0) ordem.push(o.id);
        } else if (o.op === "mover" && caixas[o.id]) {
          caixas[o.id].cx = r4(num(o.cx, caixas[o.id].cx));
          caixas[o.id].cz = r4(num(o.cz, caixas[o.id].cz));
        } else if (o.op === "apagar" && caixas[o.id]) {
          delete caixas[o.id];
          ordem.splice(ordem.indexOf(o.id), 1);
        } else if (o.op === "apagarIfc" && o.uid) {
          // arq+eid = identidade estável (o mid do uid muda com a ordem de abertura da sessão)
          removidos[o.uid] = { uid: o.uid, arq: o.arq != null ? o.arq : null, eid: o.eid != null ? o.eid : null };
        } else if (o.op === "anotar" && o.id != null && o.texto) {
          anot[o.id] = { id: o.id, x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0),
                         texto: String(o.texto).slice(0, 200) };
          if (ordemA.indexOf(o.id) < 0) ordemA.push(o.id);
        } else if (o.op === "desanotar" && anot[o.id]) {
          delete anot[o.id];
          ordemA.splice(ordemA.indexOf(o.id), 1);
        } else {
          invalidas++;
        }
      });
      return {
        caixas: ordem.map(function (id) { return caixas[id]; }),
        anotacoes: ordemA.map(function (id) { return anot[id]; }),
        removidosIfc: Object.keys(removidos),
        removidosIfcInfo: Object.keys(removidos).map(function (k) { return removidos[k]; }),
        invalidas: invalidas
      };
    },

    /* resumo de QTO do estado (o que o painel/orçamento consomem):
       por tipo: n, area, volume + metros de parede. Nada estimado. */
    qto: function (estado) {
      var out = { parede: { n: 0, area: 0, volume: 0, comprimento: 0 },
                  laje: { n: 0, area: 0, volume: 0 },
                  pilar: { n: 0, volume: 0, comprimento: 0 } };
      function nf(v) { v = Number(v); return isFinite(v) ? v : 0; } // NaN de caixa velha não contamina o agregado
      ((estado && estado.caixas) || []).forEach(function (c) {
        if (c.tipo === "parede") {
          out.parede.n++; out.parede.area = r4(out.parede.area + nf(c.area));
          out.parede.volume = r4(out.parede.volume + nf(c.volume));
          out.parede.comprimento = r4(out.parede.comprimento + nf(c.comprimento));
        } else if (c.tipo === "laje") {
          out.laje.n++; out.laje.area = r4(out.laje.area + nf(c.area));
          out.laje.volume = r4(out.laje.volume + nf(c.volume));
        } else if (c.tipo === "pilar") {
          out.pilar.n++; out.pilar.volume = r4(out.pilar.volume + nf(c.volume));
          out.pilar.comprimento = r4(out.pilar.comprimento + nf(c.comprimentoPilar != null ? c.comprimentoPilar : c.altura));
        }
      });
      return out;
    },

    /* sanea uma lista vinda do storage: só ops conhecidas E com shape válido —
       storage corrompido não pode derrubar aplicar() nem sujar o QTO (NaN). */
    sanear: function (ops) {
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function caixaOk(c) {
        return !!c && typeof c === "object" && typeof c.tipo === "string" &&
          fin(c.cx) && fin(c.cy) && fin(c.cz) &&
          fin(c.comprimento) && c.comprimento > 0 &&
          fin(c.altura) && c.altura > 0 &&
          fin(c.espessura) && c.espessura > 0 &&
          fin(c.rotY);
      }
      return (Array.isArray(ops) ? ops : []).filter(function (o) {
        if (!o) return false;
        if (o.op === "criar") return o.id != null && caixaOk(o.caixa);
        if (o.op === "mover" || o.op === "apagar" || o.op === "desanotar") return o.id != null;
        if (o.op === "apagarIfc") return typeof o.uid === "string" && o.uid.length > 0;
        if (o.op === "anotar") return o.id != null && o.texto != null && String(o.texto).length > 0;
        return false;
      });
    }
  };

  global.BimEdit = BimEdit;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEdit;
})(typeof window !== "undefined" ? window : globalThis);
