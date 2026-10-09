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
  /* INSTALAÇÕES (B5): tubos e peças moram no js/biminst.js — o BimEdit só
     repassa as ops que não são dele (e mover/apagar de id que não é dele) */
  function instMotor() {
    if (global.BimInst) return global.BimInst;
    if (typeof require === "function") { try { return require("./biminst.js"); } catch (e) {} }
    return null;
  }
  /* o motor do volume livre (B4, js/bimvolume.js) — opcional: sem ele, as ops
     de volume continuam válidas no replay, só não se conferem a fundo */
  function depVolume() {
    if (global.BimVolume) return global.BimVolume;
    if (typeof require === "function") { try { return require("./bimvolume.js"); } catch (e) {} }
    return null;
  }
  /* P1-A (registro de parâmetros, js/bimparam.js): tipos nomeados e a marca
     da peça — as ops ajustarTipo e marcar são aplicadas por ele */
  function depParam() {
    if (global.BimParam) return global.BimParam;
    if (typeof require === "function") { try { return require("./bimparam.js"); } catch (e) {} }
    return null;
  }
  /* P2-A (ambiente, js/bimambiente.js): ambiente por ponto, separador de
     ambiente, "Delimitação de ambientes" e a regra de cálculo da área — as
     ops são aplicadas por ele e o contorno sai depois do derivar da B2 */
  function depAmbiente() {
    if (global.BimAmbiente) return global.BimAmbiente;
    if (typeof require === "function") { try { return require("./bimambiente.js"); } catch (e) {} }
    return null;
  }
  /* P2-B (forro, js/bimforro.js): a op forro e o mover/apagar/orcar de um
     forro são aplicados por ele; o forro automático é refeito no fim do
     replay, com as paredes já prontas */
  /* P9 — GANCHO: o motor da estrutura (js/bimestrut.js — "Move com eixos") */
  function depEstrut() {
    if (global.BimEstrut) return global.BimEstrut;
    if (typeof require === "function") { try { return require("./bimestrut.js"); } catch (e) {} }
    return null;
  }
  /* CURVA — GANCHO: a parede curva (js/bimcurva.js): caixa, vãos e a
     família hospedada na tangente */
  function depCurva() {
    if (global.BimCurva) return global.BimCurva;
    if (typeof require === "function") { try { return require("./bimcurva.js"); } catch (e) {} }
    return null;
  }
  function depForro() {
    if (global.BimForro) return global.BimForro;
    if (typeof require === "function") { try { return require("./bimforro.js"); } catch (e) {} }
    return null;
  }
  /* P3 — GANCHOS (telhado e bordas: js/bimtelhado.js; fundação:
     js/bimfundacao.js). As ops telhado, borda e fundacao e o
     mover/apagar/orcar de um id deles são aplicados por eles; o estado sai
     ANTES do derivar da B2 (a parede "anexar topo" lê os telhados prontos). */
  function depP3(qual) {
    var nome = qual === "f" ? "BimFundacao" : "BimTelhado", arq = qual === "f" ? "./bimfundacao.js" : "./bimtelhado.js";
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  var P3_OPS = { telhado: "t", borda: "t", fundacao: "f" };
  /* VOLUME LIVRE (B4, 08/10/2026): categoria → entidade IFC (o que o volume
     vira no quantitativo, no orçamento e no IFC de saída) */
  var VOL_IFC = { generico: "IFCBUILDINGELEMENTPROXY", parede: "IFCWALL", laje: "IFCSLAB", pilar: "IFCCOLUMN", viga: "IFCBEAM", cobertura: "IFCROOF" };
  var VOL_NOME = { generico: "Genérico", parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", cobertura: "Cobertura" };

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

    /* CURVA: parede CURVA de p1 a p2 passando por m (o arco do eixo). Mesma
       caixa da parede reta (a da CORDA) + arco: { m } — js/bimcurva.js.
       null se o arco não serve (BimCurva.motivoArco diz por quê). */
    paredeCurva: function (p1, p2, m, espessura, altura, base) {
      var BC = depCurva(); return BC ? BC.parede(p1, p2, m, espessura, altura, base) : null;
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
       dada (a viga "pendura" do nível de cima). Mesma caixa da
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
      var BCh = parede && parede.arco ? depCurva() : null; if (BCh) { var ph = BCh.posicaoHospedada(parede, t); if (ph) return ph; }   /* CURVA: na tangente */
      var c = Math.cos(parede.rotY), s = Math.sin(parede.rotY);
      return { x: r4(parede.cx + t * c), y: r4(parede.cy - parede.altura / 2), z: r4(parede.cz - t * s), rotY: parede.rotY };
    },
    /* projeta um ponto do mundo no eixo da parede → t (distância ao centro, com sinal) */
    tNaParede: function (parede, p) {
      var BCt = parede && parede.arco ? depCurva() : null; if (BCt) return BCt.tNaParede(parede, p);   /* CURVA: ao longo do arco */
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
      var BCv = parede && parede.arco ? depCurva() : null; if (BCv) return BCv.vaosNaParede(parede, vaos);   /* CURVA: o vão reto na parede curva */
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
      /* aceitos: os vãos que valeram (local) — o modelador B2 (js/bimarq.js) fatia a parede unida por eles */
      return { pedacos: pedacos, areaVaos: r4(areaVaos), areaLiquida: r4(L * H - areaVaos), conflitos: conflitos, aceitos: ok };
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
       - volume (B4): {op:'volume', id, volume:{ receita, categoria, material, nome }}
       - volBool:     {op:'volBool', id (alvo), ferramenta, tipo:'uniao'|'subtracao'|'intersecao'}
       - volEmpurrar: {op:'volEmpurrar', id, ponto:[x,y,z], normal:[x,y,z], dist}
       - volProps:    {op:'volProps', id, categoria?, material?, nome?}
       - mover de volume: {op:'mover', id, dx, dz} (deslocamento)
       B2 (js/bimarq.js, prévia do modelador):
       - eixo: {op:'eixo', id, eixo:{x0,z0,x1,z1,nome}}   renomear: {op:'renomear', id, nome}
       - furo: {op:'furo', id (laje por contorno), furo:[{x,z}…]}
       - ajustar: {op:'ajustar', id, campos:{anexarTopo|unir|inverterFaces|juntaCanto|tipoParede|tipoLaje|perfil|material|escada|guarda|restricoes}}
       P1-B (restrições por nível, js/bimarq.js): a caixa da op `criar` (e a
       `cobertura`) em v:2 leva nivelBase, deslocBase, restricaoSuperior,
       deslocSuperior, alturaNaoConectada; `aplicar(ops, {niveis})` põe cada
       peça na altura dos níveis (sem `niveis`, os da fonteNiveis registrada).
       P1-A (js/bimparam.js): ajustarTipo (tipo nomeado) e marcar (Marca, Comentários, fases) — ver opParamValida
       P2-A (js/bimambiente.js): ambiente (por ponto), ajustarAmbiente, separador, delimitar, ambienteRegra — ver opAmbienteValida;
       o estado ganha ambientes/separadores/ambienteRegra só quando há op de ambiente
       P2-B (js/bimforro.js): forro por contorno ou automático (ponto) — ver opForroValida; a saída ganha `forros`
       P10 (extensões: js/bimfases.js, js/bimgrupos.js, js/bimopcoes.js): fases, grupo, opcoes — ver opP10Valida;
       a saída ganha `fases`, `grupos`, `opcoes` só quando há op delas
       P4 (js/bimarq.js): unirGeometria / desunirGeometria / alternarUniao {op, a, b}; ajustar ganha linhaLoc,
       virar e uniao. P4 (js/bimprecisao.js, extensão): fixar, dividir, escala; peça fixada não anda nem sai.
       P4 (js/bimpintar.js, extensão): pintar, removerPintura, dividirFace — a saída ganha `pinturas`
       Ordem importa; op sobre id inexistente é ignorada (contada). */
    /* EXTENSÕES do replay (B3, 08/10/2026): uma fase nova do modelador (ex.:
       js/bimprecisao.js — copiar, espelhar, girar, matriz, esticar, cota)
       registra as ops dela aqui, em vez de cada fase mexer neste switch.
       x = { nome, aplicar(o, ctx) → true se a op é dela e valeu,
             fim(ctx, out) (acrescenta ao estado), valida(o) → true/false
             para as ops dela, undefined para as dos outros }.
       ctx dá acesso aos mapas do replay (caixas, fams, cobs, anot e ordens). */
    _ext: [],
    estender: function (x) {
      if (!x || !x.nome) return false;
      BimEdit._ext = BimEdit._ext.filter(function (y) { return y.nome !== x.nome; }).concat([x]);
      return true;
    },
    /* P1-B — NÍVEIS DA OBRA no replay: quem tem a obra aberta (js/bimarqui.js)
       registra de onde eles vêm; o teste passa `opcoes.niveis` direto. Sem
       níveis, nada muda: cada peça fica na cota em que nasceu. */
    _fonteNiveis: null,
    fonteNiveis: function (fn) { BimEdit._fonteNiveis = typeof fn === "function" ? fn : null; return true; },
    niveisAtuais: function () {
      if (!BimEdit._fonteNiveis) return null;
      try { var L = BimEdit._fonteNiveis(); return Array.isArray(L) ? L : null; } catch (eN) { return null; }
    },
    aplicar: function (ops, opcoes) {
      ops = BimEdit.achatar(ops);   /* LOTE (B8): as ops de dentro valem como se estivessem soltas, na ordem */
      var NIV = opcoes && Array.isArray(opcoes.niveis) ? opcoes.niveis : BimEdit.niveisAtuais();
      var caixas = {}, ordem = [], anot = {}, ordemA = [], removidos = {}, invalidas = 0;
      var fams = {}, ordemF = [], cobs = {}, ordemC = [], vols = {}, ordemV = [];
      var eixos = {}, ordemE = [], ARQ = global.BimArq || null;   /* B2 (js/bimarq.js): eixos e o que se deriva */
      var ctx = { caixas: caixas, ordem: ordem, fams: fams, ordemF: ordemF, cobs: cobs, ordemC: ordemC, anot: anot, ordemA: ordemA, vols: vols, ordemV: ordemV, eixos: eixos, ordemE: ordemE, ext: {}, niveis: NIV };   /* P10: os níveis (o desagrupar do js/bimgrupos.js põe a cópia no nível dela) */
      var BI = instMotor(), inst = BI ? BI.novoEstado() : null;
      var BAm = depAmbiente();   /* P2-A */
      (ops || []).forEach(function (o) {
        if (!o || !o.op) { invalidas++; return; }
        /* P4 — GANCHOS (plano do BIM, fase P4): peça FIXADA (op fixar,
           js/bimprecisao.js) não anda nem é apagada; e as ops de
           UNIR GEOMETRIA (js/bimarq.js: unirGeometria, desunirGeometria, alternarUniao) */
        if ((o.op === "mover" || o.op === "apagar") && o.id != null && [caixas, fams, cobs, eixos].some(function (m) { return m[o.id] && m[o.id].fixo; })) { invalidas++; return; }
        if (ARQ && ARQ.OPS_UNIAO && ARQ.OPS_UNIAO.indexOf(o.op) >= 0) { if (!ARQ.aplicarOpUniao(o, ctx)) invalidas++; return; }
        if (o.op === "eixo" && o.id != null && o.eixo) {
          /* EIXO da grade (B2): criar ou substituir; não tem quantitativo */
          eixos[o.id] = { id: o.id, x0: num(o.eixo.x0, 0), z0: num(o.eixo.z0, 0), x1: num(o.eixo.x1, 0), z1: num(o.eixo.z1, 0), nome: String(o.eixo.nome || "?").slice(0, 12) };
          if (ordemE.indexOf(o.id) < 0) ordemE.push(o.id);
          return;
        }
        if (o.op === "renomear" && eixos[o.id]) { eixos[o.id].nome = String(o.nome || "").trim().slice(0, 12) || eixos[o.id].nome; return; }
        if (o.op === "mover" && eixos[o.id]) {
          var e0 = eixos[o.id], ddx = num(o.cx, 0) - (e0.x0 + e0.x1) / 2, ddz = num(o.cz, 0) - (e0.z0 + e0.z1) / 2;
          /* P9 — GANCHO "Move com eixos": o pilar que está sobre o eixo anda com ele (na ordem das ops) */
          var BE9 = depEstrut(); if (BE9) BE9.eixoMoveu(e0, ddx, ddz, caixas, ordem);
          e0.x0 = r4(e0.x0 + ddx); e0.x1 = r4(e0.x1 + ddx); e0.z0 = r4(e0.z0 + ddz); e0.z1 = r4(e0.z1 + ddz); return;
        }
        if (o.op === "apagar" && eixos[o.id]) { delete eixos[o.id]; ordemE.splice(ordemE.indexOf(o.id), 1); return; }
        if (o.op === "furo" && caixas[o.id] && caixas[o.id].contorno && Array.isArray(o.furo)) {
          /* FURO na laje por contorno (B2): a validação e a área saem no derivar */
          (caixas[o.id].furos = caixas[o.id].furos || []).push({ pts: JSON.parse(JSON.stringify(o.furo)) }); return;
        }
        if (o.op === "ajustar" && caixas[o.id] && o.campos) { if (ARQ) ARQ.ajustar(caixas[o.id], o.campos); return; }
        /* P1-B: a cobertura também se prende a nível (Nível da base + Deslocamento da base) */
        if (o.op === "ajustar" && cobs[o.id] && o.campos && o.campos.restricoes) { if (ARQ) ARQ.ajustar(cobs[o.id], { restricoes: o.campos.restricoes }); return; }
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
        } else if (o.op === "volume" && o.id != null && o.volume && o.volume.receita) {
          /* VOLUME LIVRE (B4): a RECEITA (extrusão, revolução, varredura) — a
             malha é refeita no replay por js/bimvolume.js, nunca guardada */
          var vd = o.volume, cat = VOL_IFC[vd.categoria] ? vd.categoria : "generico";
          vols[o.id] = { id: o.id, tipo: "volume", categoria: cat, ifc: VOL_IFC[cat], material: String(vd.material || "Concreto").slice(0, 60),
                         nome: String(vd.nome || "").slice(0, 80), receita: JSON.parse(JSON.stringify(vd.receita)) };
          if (ordemV.indexOf(o.id) < 0) ordemV.push(o.id);
        } else if (o.op === "volBool" && vols[o.id] && vols[o.ferramenta] && o.ferramenta !== o.id && (o.tipo === "uniao" || o.tipo === "subtracao" || o.tipo === "intersecao")) {
          /* união/subtração: o ALVO fica com a receita combinada e a FERRAMENTA
             é consumida (o recorte não sobra) */
          vols[o.id].receita = { forma: "bool", tipo: o.tipo, a: vols[o.id].receita, b: vols[o.ferramenta].receita };
          delete vols[o.ferramenta]; ordemV.splice(ordemV.indexOf(o.ferramenta), 1);
        } else if (o.op === "volEmpurrar" && vols[o.id]) {
          vols[o.id].receita = { forma: "empurrar", base: vols[o.id].receita, ponto: o.ponto, normal: o.normal, dist: num(o.dist, 0) };
        } else if (o.op === "volProps" && vols[o.id]) {
          if (o.categoria && VOL_IFC[o.categoria]) { vols[o.id].categoria = o.categoria; vols[o.id].ifc = VOL_IFC[o.categoria]; }
          if (o.material != null) vols[o.id].material = String(o.material).slice(0, 60);
          if (o.nome != null) vols[o.id].nome = String(o.nome).slice(0, 80);
        } else if (o.op === "mover" && vols[o.id]) {
          /* volume anda por DESLOCAMENTO (dx, dz): o centro dele só se sabe
             depois de refazer a malha, e o replay aqui é puro */
          var dxv = num(o.dx, 0), dzv = num(o.dz, 0);
          if (dxv || dzv) vols[o.id].receita = { forma: "mover", base: vols[o.id].receita, dx: r4(dxv), dy: 0, dz: r4(dzv) };
        } else if (o.op === "apagar" && vols[o.id]) {
          delete vols[o.id]; ordemV.splice(ordemV.indexOf(o.id), 1);
        } else if (o.op === "orcar" && o.id != null && (caixas[o.id] || cobs[o.id] || fams[o.id] || vols[o.id])) {
          /* ORÇAMENTO do elemento (F1, 07/10/2026): a lista de serviços dele
             SUBSTITUI a anterior — o que o modelo vira no orçamento. Só código e
             a medida de onde sai a quantidade; o preço vem da base vigente. */
          (caixas[o.id] || cobs[o.id] || fams[o.id] || vols[o.id]).servicos = BimEdit.limparServicos(o.servicos);
        } else if (o.op === "cobertura" && o.id != null && o.cobertura) {
          cobs[o.id] = JSON.parse(JSON.stringify(o.cobertura)); cobs[o.id].id = o.id;
          if (ordemC.indexOf(o.id) < 0) ordemC.push(o.id);
        } else if (o.op === "mover" && caixas[o.id]) {
          var cm0 = caixas[o.id], mx0 = cm0.cx, mz0 = cm0.cz;
          caixas[o.id].cx = r4(num(o.cx, caixas[o.id].cx));
          caixas[o.id].cz = r4(num(o.cz, caixas[o.id].cz));
          /* B2: contorno, escada e caminho andam junto com a caixa */
          if (cm0.b2 && ARQ) ARQ.transladar(cm0, cm0.cx - mx0, cm0.cz - mz0);
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
        } else if (o.op === "forro" || (ctx.forros && ctx.forros[o.id] && (o.op === "mover" || o.op === "apagar" || o.op === "orcar"))) {
          /* P2-B: forro (js/bimforro.js) — criar/alterar, mover, apagar, orçar */
          var BFo = depForro(); if (!BFo || !BFo.aplicarOp(o, ctx)) invalidas++;
        } else if (P3_OPS[o.op] || (ctx.p3 && ctx.p3[o.id] && (o.op === "mover" || o.op === "apagar" || o.op === "orcar"))) {
          /* P3: telhado, borda e fundação — criar/alterar, mover, apagar, orçar */
          var M3 = depP3(P3_OPS[o.op] || (ctx.p3[o.id] === "fundacao" ? "f" : "t")); if (!M3 || !M3.aplicarOp(o, ctx)) invalidas++;
        } else if (BAm && (BAm.ehOp(o.op) || o.op === "mover" || o.op === "apagar") && BAm.aplicarOp(o, ctx)) {
          /* P2-A: ambiente, ajustarAmbiente, separador, delimitar, ambienteRegra
             e o mover/apagar de ambiente e de separador (js/bimambiente.js) */
        } else if (BimEdit.opAmbiente(o.op)) {
          invalidas++;   /* P2-A: op de ambiente sem o motor carregado (ou sobre id que não existe) */
        } else if (o.op === "ajustarTipo" || o.op === "marcar") {
          /* P1-A: tipo nomeado e identidade da peça (js/bimparam.js) */
          var BPo = depParam(); if (BPo && !BPo.aplicarOp(o, ctx)) invalidas++;
        } else if (inst && BI.aplicarOp(inst, o)) {
          /* B5: trecho, peça, instAlterar e o mover/apagar delas */
        } else if (!BimEdit._ext.some(function (x) { try { return !!(x.aplicar && x.aplicar(o, ctx)); } catch (eX) { return false; } })) {
          invalidas++;
        }
      });
      /* P10 (js/bimgrupos.js): as CÓPIAS das instâncias de grupo entram aqui,
         ANTES dos níveis — a cópia colada no pavimento 2 vai para a altura
         dele pelas restrições, como as outras peças */
      BimEdit._ext.forEach(function (x) { try { if (x.antesNiveis) x.antesNiveis(ctx, NIV); } catch (eAN) {} });
      /* P1-B: cada peça presa a nível vai para a altura dos níveis de AGORA
         (op v:1 com nivelId migra aqui, sem mudar nada) — antes das
         hospedadas, que pegam a base da parede, e do derivar da B2 */
      var restr = (ARQ && ARQ.resolverNiveis) ? ARQ.resolverNiveis({ caixas: ordem.map(function (id) { return caixas[id]; }), coberturas: ordemC.map(function (id) { return cobs[id]; }) }, NIV) : null;
      /* hospedadas: a posição vem da parede (que pode ter sido movida); parede
         apagada leva junto o que estava nela */
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
      var saida = {
        caixas: ordem.map(function (id) { return caixas[id]; }),
        familias: familias, orfas: orfas,
        coberturas: ordemC.map(function (id) { return cobs[id]; }),
        volumes: ordemV.map(function (id) { return vols[id]; }),
        eixos: ordemE.map(function (id) { return eixos[id]; }),
        anotacoes: ordemA.map(function (id) { return anot[id]; }),
        removidosIfc: Object.keys(removidos),
        removidosIfcInfo: Object.keys(removidos).map(function (k) { return removidos[k]; }),
        instalacoes: inst ? BI.fechar(inst) : { trechos: [], pecas: [] },
        invalidas: invalidas
      };
      /* P1-B: quantas peças estão presas a nível e com que níveis o replay rodou */
      /* (só quando há peça presa a nível: o estado das ops antigas fica byte a byte o mesmo) */
      if (restr && (restr.n || restr.avisos)) { saida.restricoes = restr; saida.niveisAssinatura = ARQ.assinaturaNiveis(NIV); }
      /* B2: uniões de parede, topo recortado, lajes com furo, escadas — tudo
         derivado da fonte a cada replay (só mexe no que nasceu no modelador) */
      /* P1-A: os valores do TIPO valem para todas as instâncias (antes do derivar) */
      var BPd = ctx.param ? depParam() : null; if (BPd) BPd.antesDerivar(ctx, saida);
      /* P3: telhados (e as bordas deles) e fundações — antes do derivar: o topo da parede anexa ao telhado */
      if (ctx.telhados || ctx.bordas) { var T3 = depP3("t"); if (T3) T3.fim(ctx, saida, NIV); }
      if (ctx.fundacoes) { var F3 = depP3("f"); if (F3) F3.fim(ctx, saida, NIV); }
      if (ARQ && ARQ.derivar) ARQ.derivar(saida);
      /* P2-B: os forros (só quando houve op de forro: o estado das ops antigas fica igual) */
      if (ctx.forros) { var BFf = depForro(); if (BFf) BFf.fim(ctx, saida, NIV); }
      /* P2-A: o contorno de cada ambiente sai das paredes JÁ unidas (depois do
         derivar) — só quando há op de ambiente: o estado das antigas não muda */
      if (BAm && ctx.amb) BAm.fim(ctx, saida, NIV);
      /* P2 integração: em que ambiente cada forro está (derivado — nunca vai para a op) */
      if (saida.forros && saida.ambientes) { var BFa = depForro(); if (BFa && BFa.ligarAmbientes) BFa.ligarAmbientes(saida); }
      BimEdit._ext.forEach(function (x) { try { if (x.fim) x.fim(ctx, saida, NIV); } catch (eF) {} });   /* P11: e os níveis do replay (o terreno: plataforma presa a nível) */
      return saida;
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
        /* FAMIMPORT (js/familiamalha.js): vão fora do centro da família (deslocX, medido no recorte real da família importada) */
        (porParede[f.host.id] = porParede[f.host.id] || []).push({ id: f.id, t: f.host.t + (Number(av.abertura.deslocX) || 0), largura: av.abertura.largura, altura: av.abertura.altura, peitoril: av.abertura.peitoril });
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
    MEDIDAS_ORC: { area: "m2", areaBruta: "m2", areaForma: "m2", areaProjecao: "m2", volume: "m3", comprimento: "m", un: "un", kgPorM3: "kg", quantidade: null,
                   /* B2 (js/bimarq.js): a área de CADA face da parede unida (o canto
                      externo é mais comprido que o interno) e a massa do perfil de aço */
                   areaFora: "m2", areaDentro: "m2", massa: "kg",
                   /* P11 (js/bimterreno.js): o corte e o aterro da plataforma (terraplenagem) */
                   corte: "m3", aterro: "m3",
                   /* P9: revestimento do espelho da escada e os corrimãos do guarda-corpo */
                   areaEspelho: "m2", comprimentoCorrimao: "m",
                   /* P3 (js/bimtelhado.js, js/bimfundacao.js): as linhas do telhado e o que a fundação deriva */
                   espigao: "m", rincao: "m", beiral: "m", empena: "m",
                   escavacao: "m3", reaterro: "m3", lastro: "m3", lastroArea: "m2", aco: "kg", estacas: "m", volumeEstacas: "m3", acoEstacas: "kg" },
    MEDIDAS_ROTULO: { area: "área (líquida de vãos)", areaBruta: "área bruta", areaForma: "área de fôrma", areaProjecao: "área em projeção", volume: "volume",
                      comprimento: "comprimento", un: "unidade", kgPorM3: "volume × taxa (kg/m³)", quantidade: "quantidade da família",
                      areaFora: "área da face de fora", areaDentro: "área da face de dentro", massa: "massa do perfil",
                      corte: "corte (escavação)", aterro: "aterro (preenchimento)",
                      areaEspelho: "área de espelho", comprimentoCorrimao: "comprimento dos corrimãos",
                      espigao: "espigões", rincao: "rincões", beiral: "beiral (bordas que definem inclinação)", empena: "empenas (bordas sem inclinação)",
                      escavacao: "escavação", reaterro: "reaterro", lastro: "lastro (volume)", lastroArea: "lastro (área)", aco: "aço pela taxa (kg/m³)",
                      estacas: "estacas (comprimento)", volumeEstacas: "estacas (volume)", acoEstacas: "aço das estacas pela taxa" },   /* P11, P9 */
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
       dos vãos das portas/janelas. areaVaos = o que as hospedadas abriram.
       P1-acab (09/10/2026) — exato:
         falso (padrão) = a RÉGUA DO ORÇAMENTO de sempre: 4 casas, cada passo
           arredondado como antes (o orçamento multiplica quantidade × preço:
           mudar esta régua mudaria o total de orçamentos existentes);
         true = a medida SEM arredondar — a do REGISTRO (js/bimparam.js) e a
           dos Qto do IFC. Por quê: na ida e volta real no Revit 2027 o pilar
           ORC_edit_c5 mediu 0,004748 m³ e o IFC dizia 0,0047 (−1 %). O Revit
           grava 6 casas; a régua de 4 casas é só de EXIBIÇÃO/orçamento.
       De onde vem o exato: (1) el._exato — a medida que o BimArq calculou no
       replay ANTES de arredondar (propriedade NÃO enumerável: não entra em
       op, JSON nem nuvem; quem clona a peça perde e cai no item 3);
       (2) a fórmula da caixa, quando o número gravado é ela com 4 casas;
       (3) o número gravado. */
    medidasDe: function (el, areaVaos, exato) {
      var m = {}, av = num(areaVaos, 0), R = exato ? function (v) { return v; } : r4;
      if (!el) return m;
      var X = exato && el._exato ? el._exato : null;
      /* o valor de origem da medida k: o exato do replay, a fórmula (se o
         gravado é ela arredondada) ou o gravado — sem `exato`, o de sempre */
      function src(k, formula) {
        if (X && typeof X[k] === "number" && isFinite(X[k])) return X[k];
        var g = el[k];
        if (exato && formula != null && isFinite(formula) && (g == null || Math.abs(r4(formula) - Number(g)) < 1e-9)) return formula;
        return num(g, formula);
      }
      if (el.tipo === "volume") {
        /* volume livre (B4): as medidas vêm da MALHA (BimEdit.medirVolumes),
           não de fórmula de caixa. Sem malha avaliada, nenhuma medida — e o
           orçamento diz "a medida não existe", em vez de orçar zero calado */
        var mv = el.medidas; if (!mv) return m;
        m.un = 1; m.volume = R(num(mv.volume, 0)); m.area = R(num(mv.area, 0)); m.areaBruta = m.area;
        if (mv.areaProjecao != null) m.areaProjecao = R(mv.areaProjecao);
        if (mv.comprimento != null) m.comprimento = R(mv.comprimento); else if (mv.altura != null) m.comprimento = R(mv.altura);
        return m;
      }
      if (el.tipo === "forro") {   /* P2-B (js/bimforro.js): área líquida dos furos, área bruta, perímetro (tabica), volume */
        m.un = 1; m.area = r4(num(el.area, 0)); m.areaBruta = r4(num(el.areaBruta, 0)); m.comprimento = r4(num(el.perimetro, 0)); m.volume = r4(num(el.volume, 0));
        return m;
      }
      if (el.tipo === "telhado" || el.tipo === "borda" || el.tipo === "fundacao") {   /* P3 (js/bimtelhado.js, js/bimfundacao.js) */
        var M3m = depP3(el.tipo === "fundacao" ? "f" : "t"); return M3m ? M3m.medidas(el, exato) : m;
      }
      if (el.planos) {  /* cobertura */
        m.area = R(num(el.area, 0)); m.areaProjecao = R(num(el.areaProjecao, 0)); m.volume = R(num(el.volume, 0));
        m.comprimento = R(num(el.comprimentoCumeeira, 0)); m.un = 1;
        return m;
      }
      var L = num(el.comprimento, 0), H = num(el.altura, 0), E = num(el.espessura, 0);
      /* B2: escada e guarda-corpo trazem as medidas prontas (js/bimarq.js) */
      if (el.medidas && (el.tipo === "escada" || el.tipo === "guarda" || el.tipo === "rampa")) {   /* P9: rampa */
        var XM = X && X.medidas ? X.medidas : {};
        Object.keys(el.medidas).forEach(function (k) { if (typeof el.medidas[k] === "number") m[k] = R(typeof XM[k] === "number" && isFinite(XM[k]) ? XM[k] : el.medidas[k]); });
        if (m.area != null) m.areaBruta = m.area;
        return m;
      }
      m.un = 1;
      if (el.tipo === "parede") {
        m.areaBruta = R(src("area", L * H)); m.area = R(m.areaBruta - av); m.volume = R(m.area * E);
        m.comprimento = R(el.comprimentoLiq != null ? src("comprimentoLiq", L) : L); m.areaForma = R(2 * m.area);   /* parede de concreto: as duas faces */
        if (el.faces) {
          var fx = X && X.faces ? X.faces : el.faces;
          /* CURVA: na parede curva cada face perde o arco DELA na faixa do vão (js/bimcurva.js) */
          var vc = el.arco && el._vaosCurva && Math.abs(el._vaosCurva.areaVaos - av) < 1e-9 ? el._vaosCurva : null;
          m.areaFora = R(Math.max(0, num(fx.fora, 0) - (vc ? vc.fora : av))); m.areaDentro = R(Math.max(0, num(fx.dentro, 0) - (vc ? vc.dentro : av)));
        }
      } else if (el.tipo === "laje") {
        m.area = R(src("area", L * E)); m.areaBruta = m.area; m.volume = R(src("volume", L * E * H));
        m.comprimento = R(el.perimetro != null ? src("perimetro", 0) : 2 * (L + E));   /* perímetro (borda; B2: + bordas dos furos) */
        m.areaForma = m.area;                                            /* fôrma de laje = área do fundo */
      } else if (el.tipo === "pilar") {
        m.volume = R(src("volume", L * E * H)); m.comprimento = R(src("comprimentoPilar", H));
        /* B2: o perímetro da SEÇÃO (circular, I…) — não o da caixa */
        m.areaForma = R((el.perimetroSecao != null ? src("perimetroSecao", 0) : 2 * (L + E)) * m.comprimento); m.area = m.areaForma; m.areaBruta = m.areaForma;
        if (el.massa != null) m.massa = R(src("massa", 0));
      } else if (el.tipo === "viga") {
        m.volume = R(src("volume", L * E * H)); m.comprimento = R(src("comprimentoViga", L));
        m.areaForma = R(src("area", m.comprimento * (2 * H + E))); m.area = m.areaForma; m.areaBruta = m.areaForma;
        if (el.massa != null) m.massa = R(src("massa", 0));
      } else {
        m.volume = R(L * E * H); m.comprimento = R(L); m.area = R(L * H); m.areaBruta = m.area;
      }
      return m;
    },

    qto: function (estado, avaliarFam) {
      var out = { parede: { n: 0, area: 0, volume: 0, comprimento: 0, areaVaos: 0 },
                  laje: { n: 0, area: 0, volume: 0 },
                  pilar: { n: 0, volume: 0, comprimento: 0 },
                  viga: { n: 0, volume: 0, comprimento: 0, areaForma: 0 },
                  cobertura: { n: 0, area: 0, areaProjecao: 0, volume: 0, cumeeira: 0 },
                  volume: { n: 0, volume: 0, area: 0, semMedida: 0, porCategoria: {} },
                  familias: {},
                  /* B2 (js/bimarq.js): escada, guarda-corpo, perfis (madeira/aço por
                     seção) e as camadas das paredes por tipo */
                  escada: { n: 0, volume: 0, espelhos: 0, pisos: 0, areaPiso: 0 },
                  guarda: { n: 0, comprimento: 0, montantes: 0 },
                  perfis: {}, camadas: {} };
      function nf(v) { v = Number(v); return isFinite(v) ? v : 0; } // NaN de caixa velha não contamina o agregado
      var vaos = BimEdit.vaosDasParedes(estado, avaliarFam), ARQ = global.BimArq || null;
      /* madeira e aço não somam no volume de CONCRETO de pilar e viga: vão para `perfis` */
      function perfil(c) {
        if (!c.perfil || !c.material || c.material === "concreto") return false;
        var k = c.material + "|" + (c.perfilRotulo || c.perfil.forma), g = out.perfis[k] || (out.perfis[k] = { material: c.material, perfil: c.perfilRotulo || c.perfil.forma, tipo: c.tipo, n: 0, comprimento: 0, volume: 0, massa: 0 });
        g.n++; g.comprimento = r4(g.comprimento + nf(c.tipo === "pilar" ? c.comprimentoPilar : c.comprimentoViga)); g.volume = r4(g.volume + nf(c.volume)); g.massa = r4(g.massa + nf(c.massa));
        return true;
      }
      ((estado && estado.caixas) || []).forEach(function (c) {
        if (c.tipo === "parede") {
          /* a parede DESCONTA os vãos das portas e janelas hospedadas nela */
          var dv = vaos[c.id] ? vaos[c.id].areaVaos : 0;
          out.parede.n++; out.parede.area = r4(out.parede.area + nf(c.area) - dv);
          out.parede.areaVaos = r4(out.parede.areaVaos + dv);
          out.parede.volume = r4(out.parede.volume + nf(c.volume) - dv * nf(c.espessura));
          /* B2: a parede unida mede o eixo LÍQUIDO (o canto não conta duas vezes) */
          out.parede.comprimento = r4(out.parede.comprimento + nf(c.comprimentoLiq != null ? c.comprimentoLiq : c.comprimento));
          if (c.tipoParede && ARQ) ARQ.camadasDe(c, dv, vaos[c.id] ? vaos[c.id].aceitos : null).forEach(function (k) {   /* P4: os vãos aceitos (virar camadas no requadro) */
            var ch = k.face + "|" + k.rotulo, g = out.camadas[ch] || (out.camadas[ch] = { rotulo: k.rotulo, face: k.face, servico: k.servico, area: 0, volume: 0 });
            g.area = r4(g.area + k.area); g.volume = r4(g.volume + k.volume);
          });
        } else if (c.tipo === "escada") {
          var me = c.medidas || {};
          out.escada.n++; out.escada.volume = r4(out.escada.volume + nf(me.volume)); out.escada.espelhos += nf(me.espelhos);
          out.escada.pisos += nf(me.pisos); out.escada.areaPiso = r4(out.escada.areaPiso + nf(me.area));
        } else if (c.tipo === "guarda") {
          var mg = c.medidas || {};
          out.guarda.n++; out.guarda.comprimento = r4(out.guarda.comprimento + nf(mg.comprimento)); out.guarda.montantes += nf(mg.montantes);
        } else if (c.tipo === "viga") {
          out.viga.n++;
          if (perfil(c)) { out.viga.comprimento = r4(out.viga.comprimento + nf(c.comprimentoViga)); return; }
          out.viga.volume = r4(out.viga.volume + nf(c.volume));
          out.viga.comprimento = r4(out.viga.comprimento + nf(c.comprimentoViga != null ? c.comprimentoViga : c.comprimento));
          out.viga.areaForma = r4(out.viga.areaForma + nf(c.area));
        } else if (c.tipo === "laje") {
          out.laje.n++; out.laje.area = r4(out.laje.area + nf(c.area));
          out.laje.volume = r4(out.laje.volume + nf(c.volume));
        } else if (c.tipo === "pilar") {
          out.pilar.n++;
          if (perfil(c)) { out.pilar.comprimento = r4(out.pilar.comprimento + nf(c.comprimentoPilar)); return; }
          out.pilar.volume = r4(out.pilar.volume + nf(c.volume));
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
      /* VOLUME LIVRE (B4): volume e área pela MALHA (medidas anotadas por
         BimEdit.medirVolumes). Entra também como FAMÍLIA GENÉRICA "Volume —
         <categoria>" por material, em m³ — é a linha que o orçamento lê. O
         volume cuja malha ainda não saiu (CSG carregando) é contado à parte,
         nunca somado como zero. */
      ((estado && estado.volumes) || []).forEach(function (v) {
        out.volume.n++;
        var cat = out.volume.porCategoria[v.categoria] || (out.volume.porCategoria[v.categoria] = { n: 0, volume: 0, area: 0 });
        cat.n++;
        if (!v.medidas) { out.volume.semMedida++; return; }
        out.volume.volume = r4(out.volume.volume + nf(v.medidas.volume)); out.volume.area = r4(out.volume.area + nf(v.medidas.area));
        cat.volume = r4(cat.volume + nf(v.medidas.volume)); cat.area = r4(cat.area + nf(v.medidas.area));
        var k = "volume:" + v.categoria + "|" + v.material;
        var g = out.familias[k] || (out.familias[k] = { famId: "volume:" + v.categoria, tipoId: v.material, tipoNome: v.material,
          descricao: "Volume modelado — " + (VOL_NOME[v.categoria] || v.categoria) + " (" + v.material + ")", unidade: "m3",
          codigo: (v.servicos && v.servicos[0] && v.servicos[0].codigo) || "", n: 0, quantidade: 0, semFamilia: false, volumeLivre: true });
        g.n++; g.quantidade = r4(g.quantidade + nf(v.medidas.volume));
      });
      return out;
    },

    /* anota em cada volume do estado a MALHA e as MEDIDAS (B4). `csg` = a
       função de BimVolume.csgCom (null enquanto o three-bvh-csg não carregou:
       aí o volume que precisa dele volta `pendente`). `cache` = objeto que o
       chamador guarda entre rodadas. Devolve { pendentes, erros:[{id,erro}] }. */
    medirVolumes: function (estado, csg, cache) {
      var BV = depVolume(), res = { pendentes: 0, erros: [] };
      ((estado && estado.volumes) || []).forEach(function (v) {
        v.malha = null; v.medidas = null; v.pendente = false; v.erro = null;
        if (!BV) { v.erro = "motor de volume não carregado"; res.erros.push({ id: v.id, erro: v.erro }); return; }
        var a = BV.avaliar(v.receita, csg, cache);
        if (a.ok) { v.malha = a.malha; v.medidas = BV.medir(a.malha, v.receita, a.meta); return; }
        if (a.pendente) { v.pendente = true; res.pendentes++; return; }
        v.erro = a.erro; res.erros.push({ id: v.id, erro: a.erro });
      });
      return res;
    },

    /* LOTE (B8, 08/10/2026 — modelagem por comando): {op:'lote', id, origem,
       pedido, ops:[...]} guarda VÁRIAS operações como UMA na lista. Por quê:
       a casa que a IA modela tem dezenas de paredes, portas e janelas, e o
       "desfazer" tira a última op da lista (js/bim.js) — sem o lote, desfazer
       a casa seria apertar Ctrl+Z quarenta vezes. As ops de dentro são as
       MESMAS do editor (o mesmo JSON); lote dentro de lote não existe.
       achatar() devolve a lista com os lotes abertos, para quem varre ops
       (ex.: as famílias usadas no .opbim). */
    achatar: function (ops) {
      var out = [];
      (Array.isArray(ops) ? ops : []).forEach(function (o) {
        if (o && o.op === "lote") { if (Array.isArray(o.ops)) o.ops.forEach(function (x) { if (!(x && x.op === "lote")) out.push(x); }); }
        else out.push(o);
      });
      return out;
    },

    /* P1-A (js/bimparam.js) — a FORMA das ops do registro de parâmetros, aqui
       para o sanear nunca jogar fora um tipo ou uma marca numa tela que não
       carregou o registro. Sem lista dentro de lista (a nuvem recusa):
       valores/marcas/params são mapas de valor simples; ids, lista de ids.
       {op:'ajustarTipo', categoria, tipoId, nome?, valores?, ids?}
       {op:'marcar', id, marca?|comentarios?|imagem?|faseCriada?|faseDemolida?|materialProj?|params?}
       {op:'marcar', marcas:{id: marca}} */
    opParamValida: function (o) {
      function esc(v) { return v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && isFinite(v)); }
      function mapa(m) { return !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length > 0 && Object.keys(m).every(function (k) { return esc(m[k]); }); }
      function idOk(v) { return (typeof v === "string" && v.length > 0) || (typeof v === "number" && isFinite(v)); }
      if (!o) return false;
      if (o.op === "ajustarTipo") {
        if (typeof o.categoria !== "string" || !o.categoria || !idOk(o.tipoId)) return false;
        if (o.nome != null && typeof o.nome !== "string") return false;
        if (o.valores != null && !mapa(o.valores)) return false;
        if (o.ids != null && !(Array.isArray(o.ids) && o.ids.length > 0 && o.ids.every(idOk))) return false;
        /* P10 (Limpar não utilizados): {op:'ajustarTipo', categoria, tipoId, apagar:true} tira o tipo SEM instância */
        if (o.apagar != null) return o.apagar === true && o.nome == null && o.valores == null && o.ids == null;
        return o.nome != null || o.valores != null || o.ids != null;
      }
      if (o.op === "marcar") {
        if (o.marcas != null) return o.id == null && mapa(o.marcas) && Object.keys(o.marcas).every(function (k) { return typeof o.marcas[k] === "string"; });
        if (!idOk(o.id)) return false;
        var algum = false;
        for (var i = 0, ks = ["marca", "comentarios", "imagem", "faseCriada", "faseDemolida", "materialProj"]; i < ks.length; i++) {   /* MATERIAIS: materialProj = id do material do projeto (js/bimmateriais.js) */
          if (o[ks[i]] == null) continue;
          if (typeof o[ks[i]] !== "string") return false;
          algum = true;
        }
        if (o.params != null) { if (!mapa(o.params)) return false; algum = true; }
        return algum;
      }
      return false;
    },

    /* P2-A (js/bimambiente.js) — a FORMA das ops do ambiente, aqui para o
       sanear nunca jogar fora um ambiente numa tela que não carregou o motor.
       Campo → [formato, limite]: texto (tamanho), medida (|valor| em m),
       nivel (id de nível ou null), ponto ({x, z}), mapa (valores simples).
       Sem lista dentro de lista (a nuvem recusa).
       {op:'ambiente', id, ponto:{x,z}, <campos>}
       {op:'ajustarAmbiente', id, campos:{<campos>}}   (null apaga o campo)
       {op:'separador', id, x0, z0, x1, z1, nivelId?}
       {op:'delimitar', id, delimita: true|false}
       {op:'ambienteRegra', regra: 'face'|'centro'|'nucleo'|'centroNucleo'} */
    CAMPOS_AMBIENTE: {
      nome: ["texto", 80], numero: ["texto", 24], acabPiso: ["texto", 120], acabBase: ["texto", 120], acabParede: ["texto", 120],
      acabForro: ["texto", 120], ocupacao: ["texto", 80], ocupante: ["texto", 80], departamento: ["texto", 80], comentarios: ["texto", 300],
      imagem: ["texto", 300], nivelId: ["nivel"], limiteSuperior: ["nivel"], deslocLimite: ["medida", 100], deslocBase: ["medida", 100],
      ponto: ["ponto"], params: ["mapa"],
      /* P2-C (acabamento por ambiente, js/bimacabamento.js): os SERVIÇOS do
         ambiente — [{codigo, medida, fator, acab?, rotulo?}], como a op
         "orcar" das peças. Lista de OBJETOS simples (nunca lista dentro de
         lista: a nuvem recusa). Até 16 serviços por ambiente. */
      servicos: ["servicos", 16]
    },
    /* P2-C: de onde sai a quantidade de cada serviço do ambiente, e em que
       unidade (a composição tem de ser a mesma — regra 2 do js/orcmodelo.js) */
    MEDIDAS_AMBIENTE: { areaPiso: "m2", rodape: "m", areaParede: "m2", areaTeto: "m2" },
    /* P2 integração: as medidas do PRÓPRIO ambiente, pelo REGISTRO (js/bimparam.js:
       Área = ROOM_AREA, Perímetro = ROOM_PERIMETER, Volume = ROOM_VOLUME — na
       regra de "Cálculos de área e volume" do projeto). A unidade da composição
       tem de ser a do parâmetro (js/orcmodelo.js daAmbiente). */
    MEDIDAS_AMBIENTE_REG: { area: "m2", comprimento: "m", volume: "m3" },
    medidaAmbienteValida: function (m) {
      return typeof m === "string" && (Object.prototype.hasOwnProperty.call(BimEdit.MEDIDAS_AMBIENTE, m) || Object.prototype.hasOwnProperty.call(BimEdit.MEDIDAS_AMBIENTE_REG, m));
    },
    ACABS_AMBIENTE: ["piso", "base", "parede", "forro"],
    /* a lista de serviços do ambiente, limpa (o que não tem forma some) */
    limparServicosAmbiente: function (lista) {
      return (Array.isArray(lista) ? lista : []).filter(function (s) {
        return s && typeof s === "object" && !Array.isArray(s) && (typeof s.codigo === "string" || typeof s.codigo === "number") &&
          BimEdit.medidaAmbienteValida(s.medida);
      }).slice(0, 16).map(function (s) {
        var f = Number(s.fator), o = { codigo: String(s.codigo).trim().slice(0, 24), medida: s.medida, fator: isFinite(f) && f > 0 ? Math.round(f * 1e6) / 1e6 : 1 };
        if (BimEdit.ACABS_AMBIENTE.indexOf(s.acab) >= 0) o.acab = s.acab;
        if (s.rotulo) o.rotulo = String(s.rotulo).slice(0, 80);
        return o;
      }).filter(function (s) { return s.codigo.length > 0; });
    },
    REGRAS_AMBIENTE: ["face", "centro", "nucleo", "centroNucleo"],
    opAmbiente: function (op) { return op === "ambiente" || op === "ajustarAmbiente" || op === "separador" || op === "delimitar" || op === "ambienteRegra"; },
    opAmbienteValida: function (o) {
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function esc(v) { return v === null || typeof v === "string" || typeof v === "boolean" || fin(v); }
      function idOk(v) { return (typeof v === "string" && v.length > 0) || fin(v); }
      function campoOk(k, v) {
        var d = BimEdit.CAMPOS_AMBIENTE[k]; if (!d) return false;
        if (v === null) return k !== "ponto";
        if (d[0] === "texto") return typeof v === "string" && v.length <= 2000;
        if (d[0] === "medida") return fin(v) && Math.abs(v) <= d[1];
        if (d[0] === "nivel") return typeof v === "string" || fin(v);
        if (d[0] === "ponto") return !!v && typeof v === "object" && !Array.isArray(v) && fin(v.x) && fin(v.z);
        if (d[0] === "mapa") return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(function (q) { return esc(v[q]); });
        /* P2-C: lista de objetos simples, cada campo escalar (nada de lista dentro de lista) */
        if (d[0] === "servicos") return Array.isArray(v) && v.length <= d[1] && v.every(function (s) {
          return !!s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).every(function (q) { return esc(s[q]); }) &&
            (typeof s.codigo === "string" || fin(s.codigo)) && String(s.codigo).length <= 24 &&
            BimEdit.medidaAmbienteValida(s.medida) && (s.fator == null || (fin(s.fator) && s.fator > 0)) &&
            (s.acab == null || BimEdit.ACABS_AMBIENTE.indexOf(s.acab) >= 0);
        });
        return false;
      }
      if (!o || !BimEdit.opAmbiente(o.op)) return false;
      if (o.op === "ambienteRegra") return BimEdit.REGRAS_AMBIENTE.indexOf(o.regra) >= 0;
      if (!idOk(o.id)) return false;
      if (o.op === "delimitar") return typeof o.delimita === "boolean";
      if (o.op === "separador") return fin(o.x0) && fin(o.z0) && fin(o.x1) && fin(o.z1) && Math.sqrt(Math.pow(o.x1 - o.x0, 2) + Math.pow(o.z1 - o.z0, 2)) > 0.05 &&
        (o.nivelId == null || typeof o.nivelId === "string" || fin(o.nivelId));
      if (o.op === "ambiente") {
        if (!campoOk("ponto", o.ponto)) return false;
        return Object.keys(o).every(function (k) { return k === "op" || k === "id" || (k !== "params" && campoOk(k, o[k])); });
      }
      /* ajustarAmbiente */
      var c = o.campos;
      if (!c || typeof c !== "object" || Array.isArray(c) || !Object.keys(c).length) return false;
      return Object.keys(c).every(function (k) { return campoOk(k, c[k]); });
    },

    /* P11 (js/bimterreno.js) — a FORMA das ops do terreno, aqui para o sanear
       nunca jogar fora um terreno numa tela que não carregou o motor. Sem
       lista dentro de lista: ponto {x, z, y}, contorno [{x, z}], a/b {x, z}.
       null apaga o campo; o que falta para nascer o motor confere. */
    opTerrenoValida: function (o) {
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
      function p2(p) { return obj(p) && fin(p.x) && fin(p.z) && Math.abs(p.x) <= 1e6 && Math.abs(p.z) <= 1e6; }
      function p3(p) { return p2(p) && fin(p.y) && Math.abs(p.y) <= 1e4; }
      function txt(v, n) { return typeof v === "string" && v.length <= (n || 80); }
      var CAMPOS = { topossolido: { pontos: function (v) { return Array.isArray(v) && v.length >= 3 && v.length <= 5000 && v.every(p3); }, nome: txt, material: txt,
                       espessura: function (v) { return fin(v) && v >= 0.05 && v <= 100; }, passoCurvas: function (v) { return fin(v) && v >= 0.05 && v <= 50; },
                       rotularMestras: function (v) { return typeof v === "boolean"; }, origem: function (v) { return v === "pontos" || v === "dxf" || v === "csv"; } },
                     subregiao: { topoId: function (v) { return txt(v, 120) || fin(v); }, contorno: function (v) { return Array.isArray(v) && v.length >= 3 && v.length <= 500 && v.every(p2); }, material: txt, nome: txt },
                     plataforma: { topoId: function (v) { return txt(v, 120) || fin(v); }, contorno: function (v) { return Array.isArray(v) && v.length >= 3 && v.length <= 500 && v.every(p2); },
                       nivelId: function (v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }, base: function (v) { return fin(v) && Math.abs(v) <= 1e4; },
                       deslocNivel: function (v) { return fin(v) && Math.abs(v) <= 1000; }, nome: txt },
                     divisa: { contorno: function (v) { return Array.isArray(v) && v.length >= 3 && v.length <= 500 && v.every(p2); }, nome: txt },
                     implantacao: { anguloNorte: function (v) { return fin(v) && Math.abs(v) <= 3600; }, lat: function (v) { return fin(v) && Math.abs(v) <= 90; }, lon: function (v) { return fin(v) && Math.abs(v) <= 180; },
                       elevacao: function (v) { return fin(v) && Math.abs(v) <= 1e4; }, local: function (v) { return txt(v, 200); } },
                     compTerreno: { tipoComp: function (v) { return txt(v, 40); }, x: function (v) { return fin(v) && Math.abs(v) <= 1e6; }, z: function (v) { return fin(v) && Math.abs(v) <= 1e6; },
                       rotY: fin, altura: function (v) { return fin(v) && v > 0 && v <= 100; } },
                     rotuloCurvas: { topoId: function (v) { return txt(v, 120) || fin(v); }, a: p2, b: p2 } };
      if (!o || !CAMPOS[o.op] || o.id == null || (typeof o.id !== "string" && !fin(o.id))) return false;
      var C = CAMPOS[o.op];
      for (var k in o) {
        if (!o.hasOwnProperty(k) || k === "op" || k === "id") continue;
        if (!C.hasOwnProperty(k)) return false;
        if (o[k] !== null && !C[k](o[k])) return false;
      }
      return true;
    },

    /* P2-B (js/bimforro.js) — a FORMA da op forro, aqui para o sanear nunca
       jogar fora um forro numa tela que não carregou o motor. Sem lista
       dentro de lista (a nuvem recusa): pontos {x, z}, furo {pts:[…]},
       camada {rotulo, material, e}.
       {op:'forro', id, nivelId?, base?, contorno?:[{x,z}] | ponto?:{x,z},
        furos?:[{pts}], tipoId?, tipoForro?:{id, rotulo, camadas}, deslocNivel?,
        inclinacao? (0–60°), dirInclinacao?}  (null apaga o campo) */
    opForroValida: function (o) {
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
      function ponto(p) { return obj(p) && fin(p.x) && fin(p.z); }
      function lista(l) { return Array.isArray(l) && l.length >= 3 && l.length <= 500 && l.every(ponto); }
      if (!o || o.op !== "forro" || o.id == null || (typeof o.id !== "string" && !fin(o.id))) return false;
      if (o.contorno != null && o.ponto != null) return false;   /* um modo só */
      var algum = false, LIMS = { base: [-10000, 10000], deslocNivel: [-200, 200], inclinacao: [0, 60], dirInclinacao: [-3600, 3600] };
      if (o.contorno !== undefined) { if (o.contorno !== null && !lista(o.contorno)) return false; algum = true; }
      if (o.ponto !== undefined) { if (o.ponto !== null && !ponto(o.ponto)) return false; algum = true; }
      if (o.furos !== undefined) {
        if (o.furos !== null && !(Array.isArray(o.furos) && o.furos.length <= 100 && o.furos.every(function (f) { return obj(f) && lista(f.pts); }))) return false;
        algum = true;
      }
      if (o.nivelId !== undefined) { if (o.nivelId !== null && !(typeof o.nivelId === "string" && o.nivelId.length > 0 && o.nivelId.length <= 120) && !fin(o.nivelId)) return false; algum = true; }
      for (var k in LIMS) {
        if (!LIMS.hasOwnProperty(k) || o[k] === undefined) continue;
        if (o[k] !== null && !(fin(o[k]) && o[k] >= LIMS[k][0] && o[k] <= LIMS[k][1])) return false;
        algum = true;
      }
      if (o.tipoId !== undefined) { if (o.tipoId !== null && !(typeof o.tipoId === "string" && o.tipoId.length > 0 && o.tipoId.length <= 60)) return false; algum = true; }
      /* "Delimitação de ambientes" do forro (corta o volume do ambiente): booleano ou null (volta ao padrão Sim) */
      if (o.delimitaAmbiente !== undefined) { if (o.delimitaAmbiente !== null && typeof o.delimitaAmbiente !== "boolean") return false; algum = true; }
      if (o.tipoForro !== undefined) {
        if (o.tipoForro !== null) {
          if (!obj(o.tipoForro) || !Array.isArray(o.tipoForro.camadas) || !o.tipoForro.camadas.length || o.tipoForro.camadas.length > 12) return false;
          var soma = 0;
          for (var i = 0; i < o.tipoForro.camadas.length; i++) {
            var c = o.tipoForro.camadas[i];
            if (!obj(c) || !fin(c.e) || !(c.e > 0 && c.e <= 0.5)) return false;
            if ((c.rotulo != null && typeof c.rotulo !== "string") || (c.material != null && typeof c.material !== "string")) return false;
            soma += c.e;
          }
          if (!(soma <= 0.6)) return false;
          if ((o.tipoForro.id != null && typeof o.tipoForro.id !== "string") || (o.tipoForro.rotulo != null && typeof o.tipoForro.rotulo !== "string")) return false;
        }
        algum = true;
      }
      return algum;
    },

    /* P10 — a FORMA das ops de fases (js/bimfases.js), grupos (js/bimgrupos.js)
       e opções de projeto (js/bimopcoes.js), aqui para o sanear nunca jogar
       fora uma delas numa tela que não carregou o motor. Sem lista dentro de
       lista (a nuvem recusa): lista de textos, lista de ids, mapas simples.
       {op:'fases', lista:[nome…], renomear?:{de: para}, demolicao?:{categoria: código|null}}
       {op:'grupo', acao:'criar', id, nome, membros:[id…], nivelId?}
       {op:'grupo', acao:'colar', id, inst, dx?, dz?, dy?, nivelId?}
       {op:'grupo', acao:'editar', id, nome?, membros?}  {op:'grupo', acao:'moverInst', id, inst, dx, dz}
       {op:'grupo', acao:'desagrupar'|'apagarInst'|'apagar', id, inst?}
       {op:'opcoes', acao:'conjunto', id, nome} {op:'opcoes', acao:'opcao', id, conjunto, nome, principal?}
       {op:'opcoes', acao:'principal'|'apagar'|'aceitar', id} {op:'opcoes', acao:'incluir', id, ids} {op:'opcoes', acao:'retirar', ids} */
    opP10Valida: function (o) {
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }
      function nome(v, max) { return typeof v === "string" && v.trim().length > 0 && v.length <= (max || 80); }
      function ids(l) { return Array.isArray(l) && l.length > 0 && l.length <= 2000 && l.every(idOk); }
      function mapa(m, valOk) { return !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).every(function (k) { return k.length > 0 && valOk(m[k]); }); }
      if (!o) return false;
      if (o.op === "fases") {
        if (!Array.isArray(o.lista) || !o.lista.length || o.lista.length > 20) return false;
        var vistos = {};
        for (var i = 0; i < o.lista.length; i++) {
          var f = o.lista[i];
          if (!nome(f, 40) || f.trim() === "Nenhum" || vistos[f.trim()]) return false;
          vistos[f.trim()] = 1;
        }
        if (o.renomear != null && !mapa(o.renomear, function (v) { return nome(v, 40); })) return false;
        if (o.demolicao != null && !mapa(o.demolicao, function (v) { return v === null || (typeof v === "string" && v.length <= 24); })) return false;
        return true;
      }
      if (o.op === "grupo") {
        if (!idOk(o.id)) return false;
        var a = o.acao, inst = o.inst == null || idOk(o.inst);
        if (["dx", "dz", "dy"].some(function (k) { return o[k] != null && !fin(o[k]); })) return false;
        if (o.nivelId != null && !idOk(o.nivelId)) return false;
        if (a === "criar") return nome(o.nome) && ids(o.membros);
        if (a === "colar") return idOk(o.inst);
        if (a === "editar") return (o.nome == null || nome(o.nome)) && (o.membros == null || ids(o.membros)) && (o.nome != null || o.membros != null);
        if (a === "moverInst") return idOk(o.inst) && fin(o.dx) && fin(o.dz);
        if (a === "apagarInst") return idOk(o.inst);
        if (a === "desagrupar" || a === "apagar") return inst;
        return false;
      }
      if (o.op === "opcoes") {
        var b = o.acao;
        if (b === "retirar") return ids(o.ids);
        if (!idOk(o.id)) return false;
        if (b === "conjunto") return nome(o.nome);
        if (b === "opcao") return idOk(o.conjunto) && nome(o.nome) && (o.principal == null || typeof o.principal === "boolean");
        if (b === "incluir") return ids(o.ids);
        return b === "principal" || b === "apagar" || b === "aceitar";
      }
      return false;
    },

    /* P3 — a FORMA das ops telhado, borda e fundacao: com o motor carregado,
       a dele (js/bimtelhado.js, js/bimfundacao.js); sem o motor, só o id e
       NADA de lista dentro de lista (a nuvem recusa) — a op não se perde numa
       tela que não carregou o motor. */
    opP3Valida: function (o) {
      if (!o || !P3_OPS[o.op] || o.id == null || (typeof o.id !== "string" && !(typeof o.id === "number" && isFinite(o.id)))) return false;
      var M = depP3(P3_OPS[o.op]);
      if (M && M.opValida) return M.opValida(o);
      function plano(v, prof) { if (Array.isArray(v)) return prof < 1 && v.every(function (x) { return !Array.isArray(x) && plano(x, prof + 1); }); if (v && typeof v === "object") return Object.keys(v).every(function (k) { return plano(v[k], prof); }); return true; }
      return Object.keys(o).every(function (k) { return plano(o[k], 0); });
    },

    /* sanea uma lista vinda do storage: só ops conhecidas E com shape válido —
       storage corrompido não pode derrubar aplicar() nem sujar o QTO (NaN). */
    sanear: function (ops) {
      /* lote: as de dentro passam pela MESMA peneira; lote vazio (ou só com lixo) cai inteiro */
      ops = (Array.isArray(ops) ? ops : []).map(function (o) {
        if (!o || o.op !== "lote") return o;
        if (o.id == null || !Array.isArray(o.ops)) return null;
        var dentro = BimEdit.sanear(o.ops.filter(function (x) { return !(x && x.op === "lote"); }));
        if (!dentro.length) return null;
        var l = { op: "lote", id: o.id, ops: dentro };
        if (o.origem) l.origem = String(o.origem).slice(0, 20);
        if (o.pedido) l.pedido = String(o.pedido).slice(0, 300);
        return l;
      });
      function fin(v) { return typeof v === "number" && isFinite(v); }
      function caixaOk(c) {
        return !!c && typeof c === "object" && typeof c.tipo === "string" &&
          fin(c.cx) && fin(c.cy) && fin(c.cz) &&
          fin(c.comprimento) && c.comprimento > 0 &&
          fin(c.altura) && c.altura > 0 &&
          fin(c.espessura) && c.espessura > 0 &&
          fin(c.rotY) &&
          /* CURVA: a parede curva precisa do meio do arco (e de um arco que exista) */
          (c.arco == null || (!!c.arco.m && fin(c.arco.m.x) && fin(c.arco.m.z) && (!depCurva() || depCurva().validar(c).ok)));
      }
      var BI = instMotor();
      return (Array.isArray(ops) ? ops : []).filter(function (o) {
        if (!o) return false;
        if (o.op === "lote") return true;   /* já peneirado acima */
        if (BI && BI.ehOp(o.op)) return BI.opValida(o);   /* B5: tubo e peça */
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
        /* volume livre (B4): receita conferida pelo motor quando ele está
           carregado; sem ele, só a forma (o replay recusa o resto calado) */
        if (o.op === "volume") {
          if (o.id == null || !o.volume || typeof o.volume !== "object" || !o.volume.receita) return false;
          var BV = depVolume();
          return BV ? BV.receitaValida(o.volume.receita) : typeof o.volume.receita.forma === "string";
        }
        if (o.op === "volBool") return o.id != null && o.ferramenta != null && o.ferramenta !== o.id && (o.tipo === "uniao" || o.tipo === "subtracao" || o.tipo === "intersecao");
        if (o.op === "volEmpurrar") return o.id != null && Array.isArray(o.ponto) && o.ponto.length === 3 && o.ponto.every(fin) &&
          Array.isArray(o.normal) && o.normal.length === 3 && o.normal.every(fin) && fin(o.dist) && o.dist !== 0;
        if (o.op === "volProps") return o.id != null && (o.categoria != null || o.material != null || o.nome != null);
        /* B2 (js/bimarq.js): eixo, nome do eixo, furo na laje e ajuste de propriedade */
        if (o.op === "eixo") return o.id != null && !!o.eixo && fin(o.eixo.x0) && fin(o.eixo.z0) && fin(o.eixo.x1) && fin(o.eixo.z1) &&
          Math.sqrt(Math.pow(o.eixo.x1 - o.eixo.x0, 2) + Math.pow(o.eixo.z1 - o.eixo.z0, 2)) > 0.05;
        if (o.op === "renomear") return o.id != null && typeof o.nome === "string" && o.nome.trim().length > 0;
        if (o.op === "furo") return o.id != null && Array.isArray(o.furo) && o.furo.length >= 3 && o.furo.every(function (p) { return !!p && fin(p.x) && fin(p.z); });
        if (o.op === "ajustar") return o.id != null && !!o.campos && typeof o.campos === "object" && !Array.isArray(o.campos) && Object.keys(o.campos).length > 0 &&
          Object.keys(o.campos).every(function (k) { return ["anexarTopo", "unir", "inverterFaces", "juntaCanto", "tipoParede", "tipoLaje", "perfil", "material", "escada", "guarda", "restricoes",
            "linhaLoc", "virar", "uniao", "estrut", "rampa"].indexOf(k) >= 0; }) &&   /* P4: linha de localização, virar camadas, o canto com outra parede (js/bimarq.js); P9: estrut, rampa */
          /* P1-B: restrições por nível — um objeto (nível = texto/null, medida = número/null) */
          (o.campos.restricoes == null || (typeof o.campos.restricoes === "object" && !Array.isArray(o.campos.restricoes)));
        if (o.op === "ajustarTipo" || o.op === "marcar") return BimEdit.opParamValida(o);   /* P1-A */
        /* P4: unir/desunir/alternar ordem de união de geometria — duas peças diferentes (a forma fica aqui: o sanear não perde a op sem o js/bimarq.js) */
        if (o.op === "unirGeometria" || o.op === "desunirGeometria" || o.op === "alternarUniao") return ["a", "b"].every(function (k) { return (typeof o[k] === "string" && o[k].length > 0) || fin(o[k]); }) && String(o.a) !== String(o.b);
        if (BimEdit.opAmbiente(o.op)) return BimEdit.opAmbienteValida(o);   /* P2-A */
        if (o.op === "forro") return BimEdit.opForroValida(o);   /* P2-B */
        if (o.op === "fases" || o.op === "grupo" || o.op === "opcoes") return BimEdit.opP10Valida(o);   /* P10 */
        if (/^(topossolido|subregiao|plataforma|divisa|implantacao|compTerreno|rotuloCurvas)$/.test(o.op)) return BimEdit.opTerrenoValida(o);   /* P11 */
        if (P3_OPS[o.op]) return BimEdit.opP3Valida(o);   /* P3 */
        if (o.op === "cobertura") return o.id != null && !!o.cobertura && Array.isArray(o.cobertura.planos) && o.cobertura.planos.length > 0 &&
          o.cobertura.planos.every(function (p) { return fin(p.cx) && fin(p.cy) && fin(p.cz) && p.comprimento > 0 && p.largura > 0 && p.espessura > 0 && fin(p.rotX) && fin(p.rotY); });
        /* ops das extensões: quem registrou diz se a op é válida */
        for (var xi = 0; xi < BimEdit._ext.length; xi++) {
          var vx; try { vx = BimEdit._ext[xi].valida ? BimEdit._ext[xi].valida(o) : undefined; } catch (eV) { vx = false; }
          if (vx !== undefined) return !!vx;
        }
        return false;
      });
    }
  };

  global.BimEdit = BimEdit;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEdit;
})(typeof window !== "undefined" ? window : globalThis);
