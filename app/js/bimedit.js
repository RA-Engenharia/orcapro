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

    /* VIGA de p1 a p2 (07/10/2026): seção base × altura, com o TOPO na cota
       dada (como no Revit, a viga "pendura" do nível de cima). Mesma caixa da
       parede: comprimento no eixo, altura em Y, espessura = base. */
    viga: function (p1, p2, base, altura, topo) {
      var dx = p2.x - p1.x, dz = p2.z - p1.z;
      var L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 0.05)) return null;
      base = num(base, 0.14); altura = num(altura, 0.40); topo = num(topo, 2.8);
      if (!(base > 0.02) || !(altura > 0.02)) return null;
      return {
        tipo: "viga", ifc: "IFCBEAM",
        cx: r4((p1.x + p2.x) / 2), cy: r4(topo - altura / 2), cz: r4((p1.z + p2.z) / 2),
        comprimento: r4(L), altura: r4(altura), espessura: r4(base),
        rotY: r4(Math.atan2(-dz, dx)),
        area: r4(L * (2 * altura + base)),          /* forma: dois lados + fundo */
        volume: r4(L * altura * base),
        comprimentoViga: r4(L)
      };
    },

    /* COBERTURA pelo retângulo da diagonal p1-p2 (alinhado aos eixos), uma ou
       duas águas. o = { base: cota do apoio (topo da parede), inclinacao: %,
       aguas: 1|2, beiral: m, espessura: m, cumeeira: 'x'|'z'|'auto' }.
       Devolve os PLANOS como caixas inclinadas (rotX em torno do eixo da
       cumeeira, rotY do eixo) — o viewer usa rotation.order 'YXZ' — e a área
       INCLINADA exata (o que se compra de telha), a de projeção e o volume.
       Duas águas: a cumeeira corre no lado MAIOR (auto). Uma água: a parte
       alta fica no lado de −Z local. */
    cobertura: function (p1, p2, o) {
      o = o || {};
      var x0 = Math.min(p1.x, p2.x), x1 = Math.max(p1.x, p2.x), z0 = Math.min(p1.z, p2.z), z1 = Math.max(p1.z, p2.z);
      var lx = x1 - x0, lz = z1 - z0;
      if (!(lx > 0.3) || !(lz > 0.3)) return null;
      var aguas = o.aguas === 1 ? 1 : 2, i = num(o.inclinacao, 30) / 100, b = Math.max(0, num(o.beiral, 0.5)), t = num(o.espessura, 0.08), base = num(o.base, 2.8);
      if (!(i > 0) || i > 3 || !(t > 0)) return null;
      var eixo = o.cumeeira === "x" || o.cumeeira === "z" ? o.cumeeira : (lx >= lz ? "x" : "z");
      var L = eixo === "x" ? lx : lz, W = eixo === "x" ? lz : lx, rotY = eixo === "x" ? 0 : Math.PI / 2;
      var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = Math.atan(i), planos = [];
      function plano(dzLocal, yC, run, lado) {
        var s = run / Math.cos(a);
        /* centro local (0, yC, dzLocal) levado ao mundo por R_y(rotY): x' = z·sin, z' = z·cos */
        planos.push({ cx: r4(cx + dzLocal * Math.sin(rotY)), cy: r4(yC), cz: r4(cz + dzLocal * Math.cos(rotY)),
                      comprimento: r4(L + 2 * b), largura: r4(s), espessura: r4(t), rotY: r4(rotY), rotX: r4(lado * a), area: r4((L + 2 * b) * s) });
      }
      var cumeeira;
      if (aguas === 2) {
        var run = W / 2 + b; cumeeira = base + (W / 2) * i;
        plano(+run / 2, cumeeira - (run / 2) * i, run, +1);
        plano(-run / 2, cumeeira - (run / 2) * i, run, -1);
      } else {
        var run1 = W + 2 * b; cumeeira = base + W * i;
        plano(0, base + (W / 2) * i, run1, +1);
      }
      var area = 0; planos.forEach(function (p) { area += p.area; });
      return { tipo: "cobertura", ifc: "IFCROOF", aguas: aguas, inclinacao: r4(i * 100), beiral: r4(b), espessura: r4(t), base: r4(base),
               eixo: eixo, x0: r4(x0), x1: r4(x1), z0: r4(z0), z1: r4(z1), cumeeira: r4(cumeeira), planos: planos,
               area: r4(area), areaProjecao: r4((lx + 2 * b) * (lz + 2 * b)), volume: r4(area * t), comprimentoCumeeira: r4(aguas === 2 ? L + 2 * b : 0) };
    },

    /* onde fica uma família HOSPEDADA: o meio do vão a `t` metros do centro da
       parede, ao longo do eixo dela, no pé da parede, girada como ela */
    posicaoHospedada: function (parede, t) {
      var c = Math.cos(parede.rotY), s = Math.sin(parede.rotY);
      return { x: r4(parede.cx + t * c), y: r4(parede.cy - parede.altura / 2), z: r4(parede.cz - t * s), rotY: parede.rotY };
    },
    /* projeta um ponto do mundo no eixo da parede → t (distância ao centro, com sinal) */
    tNaParede: function (parede, p) {
      var c = Math.cos(parede.rotY), s = Math.sin(parede.rotY);
      return r4((p.x - parede.cx) * c - (p.z - parede.cz) * s);
    },

    /* A PAREDE COM OS VÃOS: os pedaços de parede que sobram em volta das portas
       e janelas, no sistema LOCAL da parede (x de −L/2 a +L/2 ao longo do eixo,
       y de 0 à altura). Sem CSG: a parede é caixa, os vãos são retângulos, e o
       que sobra é faixa vertical entre vãos + peitoril + verga. vaos = [{ id, t,
       largura, altura, peitoril }]. Vão que sai da parede é cortado no limite;
       vão que encavala em outro é recusado (fica em `conflitos`). */
    vaosNaParede: function (parede, vaos) {
      var L = parede.comprimento, H = parede.altura, h2 = L / 2, ok = [], conflitos = [];
      (vaos || []).map(function (v) {
        return { id: v.id, x0: Math.max(-h2, v.t - v.largura / 2), x1: Math.min(h2, v.t + v.largura / 2),
                 y0: Math.max(0, num(v.peitoril, 0)), y1: Math.min(H, num(v.peitoril, 0) + v.altura) };
      }).filter(function (v) { return v.x1 - v.x0 > 0.01 && v.y1 - v.y0 > 0.01; })
        .sort(function (a, b) { return a.x0 - b.x0; })
        .forEach(function (v) {
          var ult = ok[ok.length - 1];
          if (ult && v.x0 < ult.x1 - 1e-6) { conflitos.push(v.id); return; }
          ok.push(v);
        });
      var pedacos = [], cursor = -h2, areaVaos = 0;
      ok.forEach(function (v) {
        if (v.x0 - cursor > 1e-6) pedacos.push({ x0: r4(cursor), x1: r4(v.x0), y0: 0, y1: r4(H) });
        if (v.y0 > 1e-6) pedacos.push({ x0: r4(v.x0), x1: r4(v.x1), y0: 0, y1: r4(v.y0) });
        if (H - v.y1 > 1e-6) pedacos.push({ x0: r4(v.x0), x1: r4(v.x1), y0: r4(v.y1), y1: r4(H) });
        areaVaos += (v.x1 - v.x0) * (v.y1 - v.y0);
        cursor = v.x1;
      });
      if (h2 - cursor > 1e-6) pedacos.push({ x0: r4(cursor), x1: r4(h2), y0: 0, y1: r4(H) });
      return { pedacos: pedacos, areaVaos: r4(areaVaos), areaLiquida: r4(L * H - areaVaos), conflitos: conflitos };
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
      var fams = {}, ordemF = [], cobs = {}, ordemC = [];
      (ops || []).forEach(function (o) {
        if (!o || !o.op) { invalidas++; return; }
        if (o.op === "criar" && o.caixa && o.id != null) {
          caixas[o.id] = JSON.parse(JSON.stringify(o.caixa));
          caixas[o.id].id = o.id;
          if (ordem.indexOf(o.id) < 0) ordem.push(o.id);
        } else if (o.op === "familia" && o.id != null && o.famId) {
          /* instância de família: livre (x, y, z, rotY) ou HOSPEDADA ({ host: { id, t } }) */
          fams[o.id] = { id: o.id, famId: String(o.famId), tipoId: o.tipoId != null ? String(o.tipoId) : "",
                         x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), rotY: num(o.rotY, 0),
                         inst: JSON.parse(JSON.stringify(o.inst || {})), host: o.host && o.host.id != null ? { id: o.host.id, t: num(o.host.t, 0) } : null };
          if (ordemF.indexOf(o.id) < 0) ordemF.push(o.id);
        } else if (o.op === "instancia" && fams[o.id]) {
          /* troca de tipo / parâmetros de instância / giro — o resto fica */
          if (o.tipoId != null) fams[o.id].tipoId = String(o.tipoId);
          if (o.inst) Object.keys(o.inst).forEach(function (k) { fams[o.id].inst[k] = o.inst[k]; });
          if (o.rotY != null) fams[o.id].rotY = num(o.rotY, fams[o.id].rotY);
          if (o.y != null) fams[o.id].y = num(o.y, fams[o.id].y);
        } else if (o.op === "orcar" && o.id != null && (caixas[o.id] || cobs[o.id] || fams[o.id])) {
          /* ORÇAMENTO do elemento (F1, 07/10/2026): a lista de serviços dele
             SUBSTITUI a anterior — o que o modelo vira no orçamento. Só código e
             a medida de onde sai a quantidade; o preço vem da base vigente. */
          (caixas[o.id] || cobs[o.id] || fams[o.id]).servicos = BimEdit.limparServicos(o.servicos);
        } else if (o.op === "cobertura" && o.id != null && o.cobertura) {
          cobs[o.id] = JSON.parse(JSON.stringify(o.cobertura)); cobs[o.id].id = o.id;
          if (ordemC.indexOf(o.id) < 0) ordemC.push(o.id);
        } else if (o.op === "mover" && caixas[o.id]) {
          caixas[o.id].cx = r4(num(o.cx, caixas[o.id].cx));
          caixas[o.id].cz = r4(num(o.cz, caixas[o.id].cz));
        } else if (o.op === "mover" && fams[o.id]) {
          var f0 = fams[o.id];
          if (f0.host && caixas[f0.host.id]) f0.host.t = BimEdit.tNaParede(caixas[f0.host.id], { x: num(o.cx, 0), z: num(o.cz, 0) });
          else { f0.x = r4(num(o.cx, f0.x)); f0.z = r4(num(o.cz, f0.z)); }
        } else if (o.op === "mover" && cobs[o.id]) {
          var c0 = cobs[o.id], mx = (c0.x0 + c0.x1) / 2, mz = (c0.z0 + c0.z1) / 2, dxm = num(o.cx, mx) - mx, dzm = num(o.cz, mz) - mz;
          c0.x0 = r4(c0.x0 + dxm); c0.x1 = r4(c0.x1 + dxm); c0.z0 = r4(c0.z0 + dzm); c0.z1 = r4(c0.z1 + dzm);
          (c0.planos || []).forEach(function (p) { p.cx = r4(p.cx + dxm); p.cz = r4(p.cz + dzm); });
        } else if (o.op === "apagar" && caixas[o.id]) {
          delete caixas[o.id];
          ordem.splice(ordem.indexOf(o.id), 1);
        } else if (o.op === "apagar" && fams[o.id]) {
          delete fams[o.id]; ordemF.splice(ordemF.indexOf(o.id), 1);
        } else if (o.op === "apagar" && cobs[o.id]) {
          delete cobs[o.id]; ordemC.splice(ordemC.indexOf(o.id), 1);
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
      /* hospedadas: a posição vem da parede (que pode ter sido movida); parede
         apagada leva junto o que estava nela — como no Revit */
      var orfas = 0, familias = [];
      ordemF.forEach(function (id) {
        var f = fams[id];
        if (f.host) {
          var par = caixas[f.host.id];
          if (!par || par.tipo !== "parede") { orfas++; return; }
          var ps = BimEdit.posicaoHospedada(par, f.host.t);
          f.x = ps.x; f.y = ps.y; f.z = ps.z; f.rotY = ps.rotY;
          f.inst.Espessura_parede = par.espessura;
        }
        familias.push(f);
      });
      return {
        caixas: ordem.map(function (id) { return caixas[id]; }),
        familias: familias, orfas: orfas,
        coberturas: ordemC.map(function (id) { return cobs[id]; }),
        anotacoes: ordemA.map(function (id) { return anot[id]; }),
        removidosIfc: Object.keys(removidos),
        removidosIfcInfo: Object.keys(removidos).map(function (k) { return removidos[k]; }),
        invalidas: invalidas
      };
    },

    /* resumo de QTO do estado (o que o painel/orçamento consomem):
       por tipo: n, area, volume + metros de parede. Nada estimado. */
    /* vãos de cada parede, a partir das famílias HOSPEDADAS (porta/janela).
       avaliarFam(famId, tipoId, inst) → resultado de Familia.avaliar (ou null).
       → { <paredeId>: resultado de vaosNaParede } (só paredes com vão) */
    vaosDasParedes: function (estado, avaliarFam) {
      var porParede = {}, out = {};
      if (typeof avaliarFam !== "function") return out;
      ((estado && estado.familias) || []).forEach(function (f) {
        if (!f.host) return;
        var av = avaliarFam(f.famId, f.tipoId, f.inst);
        if (!av || !av.abertura) return;
        (porParede[f.host.id] = porParede[f.host.id] || []).push({ id: f.id, t: f.host.t, largura: av.abertura.largura, altura: av.abertura.altura, peitoril: av.abertura.peitoril });
      });
      ((estado && estado.caixas) || []).forEach(function (c) {
        if (c.tipo === "parede" && porParede[c.id]) out[c.id] = BimEdit.vaosNaParede(c, porParede[c.id]);
      });
      return out;
    },

    /* ===== ORÇAMENTO PELO MODELO (F1, 07/10/2026) =====
       De ONDE sai a quantidade de cada serviço de um elemento, e em que
       unidade. A unidade é a da MEDIDA, e o motor (js/orcmodelo.js) exige que
       a composição tenha a mesma — m² de parede nunca vira m³ calado.
       `kgPorM3`: armação = volume × taxa (kg/m³) — a taxa é o `fator`, quem
       informa é o engenheiro (o modelo não sabe a armadura).
       `quantidade`: a do quantitativo da FAMÍLIA (só família colocada). */
    MEDIDAS_ORC: { area: "m2", areaBruta: "m2", areaForma: "m2", areaProjecao: "m2", volume: "m3", comprimento: "m", un: "un", kgPorM3: "kg", quantidade: null },
    MEDIDAS_ROTULO: { area: "área (líquida de vãos)", areaBruta: "área bruta", areaForma: "área de fôrma", areaProjecao: "área em projeção", volume: "volume",
                      comprimento: "comprimento", un: "unidade", kgPorM3: "volume × taxa (kg/m³)", quantidade: "quantidade da família" },
    /* medida conhecida, ou "servico:<id>" = a quantidade de um SERVIÇO da
       família (a fôrma do pilar, que a família calcula e a peça orça) */
    medidaValida: function (m) {
      return typeof m === "string" && (Object.prototype.hasOwnProperty.call(BimEdit.MEDIDAS_ORC, m) || /^servico:[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*$/.test(m));
    },
    limparServicos: function (lista) {
      return (Array.isArray(lista) ? lista : []).filter(function (s) {
        return s && BimEdit.medidaValida(s.medida) && (typeof s.codigo === "string" || typeof s.codigo === "number");
      }).map(function (s) {
        var f = Number(s.fator), o = { codigo: String(s.codigo).trim().slice(0, 24), medida: s.medida, fator: isFinite(f) && f > 0 ? f : 1 };
        if (s.rotulo) o.rotulo = String(s.rotulo).slice(0, 80);
        return o;
      });
    },
    /* as medidas de um elemento criado aqui (caixa ou cobertura), já LÍQUIDAS
       dos vãos das portas/janelas. areaVaos = o que as hospedadas abriram. */
    medidasDe: function (el, areaVaos) {
      var m = {}, av = num(areaVaos, 0);
      if (!el) return m;
      if (el.planos) {  /* cobertura */
        m.area = r4(num(el.area, 0)); m.areaProjecao = r4(num(el.areaProjecao, 0)); m.volume = r4(num(el.volume, 0));
        m.comprimento = r4(num(el.comprimentoCumeeira, 0)); m.un = 1;
        return m;
      }
      var L = num(el.comprimento, 0), H = num(el.altura, 0), E = num(el.espessura, 0);
      m.un = 1;
      if (el.tipo === "parede") {
        m.areaBruta = r4(num(el.area, L * H)); m.area = r4(m.areaBruta - av); m.volume = r4(m.area * E);
        m.comprimento = r4(L); m.areaForma = r4(2 * m.area);           /* parede de concreto: as duas faces */
      } else if (el.tipo === "laje") {
        m.area = r4(num(el.area, L * E)); m.areaBruta = m.area; m.volume = r4(num(el.volume, L * E * H));
        m.comprimento = r4(2 * (L + E));                                 /* perímetro (borda) */
        m.areaForma = m.area;                                            /* fôrma de laje = área do fundo */
      } else if (el.tipo === "pilar") {
        m.volume = r4(num(el.volume, L * E * H)); m.comprimento = r4(num(el.comprimentoPilar, H));
        m.areaForma = r4(2 * (L + E) * m.comprimento); m.area = m.areaForma; m.areaBruta = m.areaForma;
      } else if (el.tipo === "viga") {
        m.volume = r4(num(el.volume, L * E * H)); m.comprimento = r4(num(el.comprimentoViga, L));
        m.areaForma = r4(num(el.area, m.comprimento * (2 * H + E))); m.area = m.areaForma; m.areaBruta = m.areaForma;
      } else {
        m.volume = r4(L * E * H); m.comprimento = r4(L); m.area = r4(L * H); m.areaBruta = m.area;
      }
      return m;
    },

    qto: function (estado, avaliarFam) {
      var out = { parede: { n: 0, area: 0, volume: 0, comprimento: 0, areaVaos: 0 },
                  laje: { n: 0, area: 0, volume: 0 },
                  pilar: { n: 0, volume: 0, comprimento: 0 },
                  viga: { n: 0, volume: 0, comprimento: 0, areaForma: 0 },
                  cobertura: { n: 0, area: 0, areaProjecao: 0, volume: 0, cumeeira: 0 },
                  familias: {} };
      function nf(v) { v = Number(v); return isFinite(v) ? v : 0; } // NaN de caixa velha não contamina o agregado
      var vaos = BimEdit.vaosDasParedes(estado, avaliarFam);
      ((estado && estado.caixas) || []).forEach(function (c) {
        if (c.tipo === "parede") {
          /* a parede DESCONTA os vãos das portas e janelas hospedadas nela */
          var dv = vaos[c.id] ? vaos[c.id].areaVaos : 0;
          out.parede.n++; out.parede.area = r4(out.parede.area + nf(c.area) - dv);
          out.parede.areaVaos = r4(out.parede.areaVaos + dv);
          out.parede.volume = r4(out.parede.volume + nf(c.volume) - dv * nf(c.espessura));
          out.parede.comprimento = r4(out.parede.comprimento + nf(c.comprimento));
        } else if (c.tipo === "viga") {
          out.viga.n++; out.viga.volume = r4(out.viga.volume + nf(c.volume));
          out.viga.comprimento = r4(out.viga.comprimento + nf(c.comprimentoViga != null ? c.comprimentoViga : c.comprimento));
          out.viga.areaForma = r4(out.viga.areaForma + nf(c.area));
        } else if (c.tipo === "laje") {
          out.laje.n++; out.laje.area = r4(out.laje.area + nf(c.area));
          out.laje.volume = r4(out.laje.volume + nf(c.volume));
        } else if (c.tipo === "pilar") {
          out.pilar.n++; out.pilar.volume = r4(out.pilar.volume + nf(c.volume));
          out.pilar.comprimento = r4(out.pilar.comprimento + nf(c.comprimentoPilar != null ? c.comprimentoPilar : c.altura));
        }
      });
      ((estado && estado.coberturas) || []).forEach(function (c) {
        out.cobertura.n++; out.cobertura.area = r4(out.cobertura.area + nf(c.area));
        out.cobertura.areaProjecao = r4(out.cobertura.areaProjecao + nf(c.areaProjecao));
        out.cobertura.volume = r4(out.cobertura.volume + nf(c.volume));
        out.cobertura.cumeeira = r4(out.cobertura.cumeeira + nf(c.comprimentoCumeeira));
      });
      /* famílias: a quantidade é a do QUANTITATIVO da família (un, m, m², m³, kg),
         somada por família + tipo — é o que vira linha de orçamento */
      ((estado && estado.familias) || []).forEach(function (f) {
        var av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null;
        var k = f.famId + "|" + (av && av.tipo ? av.tipo.id : f.tipoId);
        var g = out.familias[k] || (out.familias[k] = { famId: f.famId, tipoId: av && av.tipo ? av.tipo.id : f.tipoId, tipoNome: av && av.tipo ? av.tipo.nome : "",
          descricao: av && av.quantitativo ? av.quantitativo.descricao : f.famId, unidade: av && av.quantitativo ? av.quantitativo.unidade : "un",
          codigo: av && av.quantitativo ? av.quantitativo.codigo : "", n: 0, quantidade: 0, semFamilia: !av });
        g.n++; g.quantidade = r4(g.quantidade + (av && av.quantitativo ? nf(av.quantitativo.quantidade) : 1));
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
        if (o.op === "familia") return o.id != null && typeof o.famId === "string" && o.famId.length > 0 &&
          (o.host ? (o.host.id != null && fin(o.host.t)) : (fin(o.x) && fin(o.z))) && (o.inst == null || typeof o.inst === "object");
        if (o.op === "instancia") return o.id != null && (o.tipoId != null || (o.inst && typeof o.inst === "object") || fin(o.rotY) || fin(o.y));
        if (o.op === "orcar") return o.id != null && Array.isArray(o.servicos) && o.servicos.every(function (s) {
          return !!s && (typeof s.codigo === "string" || typeof s.codigo === "number") && BimEdit.medidaValida(s.medida) &&
            (s.fator == null || (fin(s.fator) && s.fator > 0));
        });
        if (o.op === "cobertura") return o.id != null && !!o.cobertura && Array.isArray(o.cobertura.planos) && o.cobertura.planos.length > 0 &&
          o.cobertura.planos.every(function (p) { return fin(p.cx) && fin(p.cy) && fin(p.cz) && p.comprimento > 0 && p.largura > 0 && p.espessura > 0 && fin(p.rotX) && fin(p.rotY); });
        return false;
      });
    }
  };

  global.BimEdit = BimEdit;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEdit;
})(typeof window !== "undefined" ? window : globalThis);
