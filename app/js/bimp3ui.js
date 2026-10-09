/* =====================================================================
 * bimp3ui.js — a TELA da P3 (telhado, bordas do telhado e fundação), só
 * com a prévia `?previa=modelador`.
 *
 * Os motores são o js/bimtelhado.js e o js/bimfundacao.js (puros). Aqui:
 *   · a FITA: "Cobertura" (Arquitetura) e "Fundação" (Estrutura) saem do
 *     "em breve" com a prévia (Ribbon.SOBRE_MODELADOR, gravado quando este
 *     arquivo carrega — antes do `reorganizar`); o painel "Telhado" ganha
 *     "Bordas do telhado" e "Unir telhado";
 *   · as Propriedades da FERRAMENTA (tipo, inclinação, águas, beiral; tipo de
 *     fundação e medidas; tipo de borda) e as OPS que a ferramenta manda;
 *   · o 3D (montar3d): os cliques (retângulo, contorno, extrusão; ponto,
 *     dois pontos, contorno; aresta do telhado; telhado A → telhado B), a
 *     linha de prévia e o DESENHO das peças (prismas INDEXADOS — a malha
 *     mesclada só leva malha com índice). Quem chama é o js/bim.js (ganchos
 *     "P3"); a planta e o corte 2D saem do desenho (BIM.vista2d corta as
 *     malhas — nada a fazer aqui).
 * As Propriedades da PEÇA vêm do registro (js/bimparam.js, categorias
 * telhado, borda e fundacao) pela paleta da P1-C (js/bimpropsui.js).
 *
 * Sem a prévia NADA daqui roda: `registrar` e `montar3d` saem na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function TM() { return global.BimTelhado || null; }
  function FM() { return global.BimFundacao || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }

  var cfg = {
    telhado: { modo: "retangulo", aguas: 4, inclinacao: 30, beiral: 0.5, tipoId: "generico-8", deslocBase: null, comprimentoExtrusao: null },
    fundacao: { tipoFundacao: "sapata", largura: 1.2, comprimento: 1.2, altura: 0.4, alturaBase: null, larguraTopo: null, comprimentoTopo: null,
                nEstacas: 2, diametro: 0.3, comprimentoEstaca: 6, espacamento: 0.9, deslocTopo: 0, taxaAco: null, lastro: 0.05, folga: 0, terreno: 0, radierModo: "retangulo" },
    borda: { tipoBorda: "calha" }
  };
  var ROT_FUND = { sapata: "Sapata isolada", bloco: "Bloco sobre estacas", estaca: "Estaca", baldrame: "Baldrame (viga de fundação)", radier: "Radier" };

  /* a fita: com a prévia, Cobertura e Fundação deixam o "em breve" (o
     reorganizar da Gestao lê isto; por isso é na CARGA do arquivo) */
  (function () {
    var R = global.BimRibbon; if (!R) return;
    R.SOBRE_MODELADOR = R.SOBRE_MODELADOR || {};
    R.SOBRE_MODELADOR.cobertura = { emBreve: false, tipo: "alterna", rotulo: "Telhado", dica: "Telhado por PERÍMETRO (retângulo ou contorno qualquer — L, T, U), 1, 2 ou 4 águas, inclinação POR ARESTA (a aresta que não define vira oitão), beiral; ou por EXTRUSÃO. Espigão, rincão e cumeeira saem sozinhos; área inclinada, projeção e as linhas no quantitativo. As paredes com \"anexar topo\" sobem até ele." };
    R.SOBRE_MODELADOR.fundacao = { emBreve: false, tipo: "alterna", dica: "Fundação: sapata (reta ou chanfrada), bloco sobre 1 a 6 estacas, estaca, baldrame e radier. Volume, fôrma, lastro, escavação, reaterro e o aço pela taxa (kg/m³) no quantitativo e no Orçamento do modelo." };
  })();

  var BimP3UI = {
    ativo: previa,
    cfg: function (k) { return JSON.parse(JSON.stringify(k ? cfg[k] : cfg)); },
    ROT_FUND: ROT_FUND,

    /* ---------------------------------------------------------- a fita */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !TM() || !FM() || !reg) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Telhado", [
        { id: "telhado-borda", rotulo: "Bordas do\ntelhado", icone: "regua", grande: true, tipo: "alterna",
          dica: "Calha, rufo, testeira e intradorso (forro do beiral): escolha em Propriedades e clique perto da aresta do telhado. O comprimento (inclinado na empena) e a área vão para o quantitativo." },
        { id: "telhado-unir", rotulo: "Unir\ntelhado", icone: "mais", grande: true, tipo: "alterna",
          dica: "Unir/desunir telhado: clique o telhado que ENTRA e depois o telhado em que ele encosta — a parte que fica por baixo sai e o rincão do encontro é medido. Clicar de novo o mesmo par desune." }
      ]);
      ["telhado-borda", "telhado-unir", "cobertura", "fundacao"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      function armar(sub) {
        return function (e) {
          if (e && e.ligado === false) { var b = global.BIM; if (b && b.editarArmar) b.editarArmar(null); return true; }
          return arqui && arqui.armar ? arqui.armar(sub) : false;
        };
      }
      reg.cobertura = armar("telhado"); reg.fundacao = armar("fundacao");
      reg["telhado-borda"] = armar("telhado-borda"); reg["telhado-unir"] = armar("telhado-unir");
      return true;
    },

    /* ---------------------------------------------- Propriedades da ferramenta */
    esquema: function (sub, arqui) {
      var self = this, secs = [], T = TM(), F = FM();
      if (!T || !F) return null;
      if (arqui && arqui._secNivel && (sub === "telhado" || sub === "fundacao")) secs.push(arqui._secNivel());
      var titulo = "Ferramenta";
      if (sub === "telhado") {
        var c = cfg.telhado, t = T.tipo(c.tipoId);
        titulo = "Ferramenta: Telhado";
        secs.push({ nome: "Telhado", params: [
          { id: "b2f:te:tipoId", rotulo: "Tipo", tipo: "lista", valor: t.id, opcoes: T.TIPOS.map(function (x) { return { id: x.id, rotulo: x.rotulo }; }) },
          { id: "b2f:te:modo", rotulo: "Desenho", tipo: "lista", valor: c.modo, opcoes: [{ id: "retangulo", rotulo: "Retângulo — dois cantos" }, { id: "contorno", rotulo: "Perímetro — clique os cantos" }, { id: "extrusao", rotulo: "Extrusão — base e comprimento" }] },
          { id: "b2f:te:aguas", rotulo: "Águas (retângulo)", tipo: "lista", valor: String(c.aguas), opcoes: [{ id: "4", rotulo: "4 águas" }, { id: "2", rotulo: "2 águas (cumeeira no lado maior)" }, { id: "1", rotulo: "1 água (cai para a 1ª aresta)" }] },
          { id: "b2f:te:inclinacao", rotulo: "Inclinação", unidade: "%", tipo: "numero", passo: "1", valor: c.inclinacao },
          { id: "b2f:te:beiral", rotulo: "Beiral (projeção na parede)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.beiral },
          { id: "b2f:te:deslocBase", rotulo: "Deslocamento da base do nível (vazio = pé-direito)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.deslocBase == null ? "" : c.deslocBase },
          ro("b2f:te:esp", "Espessura (soma das camadas)", n2(t.espessura * 1000, 0) + " mm")
        ] });
      } else if (sub === "fundacao") {
        var f = cfg.fundacao, tf = f.tipoFundacao;
        titulo = "Ferramenta: Fundação";
        var ps = [{ id: "b2f:fu:tipoFundacao", rotulo: "Tipo", tipo: "lista", valor: tf, opcoes: Object.keys(ROT_FUND).map(function (k) { return { id: k, rotulo: ROT_FUND[k] }; }) }];
        function nm(k, rot, un, passo) { ps.push({ id: "b2f:fu:" + k, rotulo: rot, unidade: un || "m", tipo: "numero", passo: passo || "0.05", valor: f[k] == null ? "" : f[k] }); }
        if (tf === "sapata" || tf === "bloco") { nm("largura", "Largura (B)"); nm("comprimento", "Comprimento (L)"); nm("altura", "Altura"); }
        if (tf === "sapata") { nm("alturaBase", "Altura do rodapé (vazio = reta)"); nm("larguraTopo", "Largura do topo (chanfrada)"); nm("comprimentoTopo", "Comprimento do topo (chanfrada)"); }
        if (tf === "baldrame") { nm("largura", "Largura (b)"); nm("altura", "Altura (h)"); }
        if (tf === "radier") { nm("altura", "Espessura"); ps.push({ id: "b2f:fu:radierModo", rotulo: "Desenho", tipo: "lista", valor: f.radierModo, opcoes: [{ id: "retangulo", rotulo: "Retângulo — dois cantos" }, { id: "contorno", rotulo: "Contorno — clique os cantos" }] }); }
        if (tf === "bloco") { nm("nEstacas", "Número de estacas (1 a 6)", "", "1"); nm("espacamento", "Espaçamento entre estacas"); }
        if (tf === "bloco" || tf === "estaca") { nm("diametro", "Diâmetro da estaca"); nm("comprimentoEstaca", "Comprimento da estaca"); }
        nm("deslocTopo", "Deslocamento do topo (em relação ao nível)");
        nm("taxaAco", "Taxa de aço (vazio = a informar)", "kg/m³", "5");
        if (tf !== "estaca") { nm("lastro", "Lastro (espessura)", "m", "0.01"); nm("folga", "Folga da escavação (cada lado)"); }
        nm("terreno", "Cota do terreno (em relação ao nível)");
        secs.push({ nome: ROT_FUND[tf], params: ps });
      } else if (sub === "telhado-borda") {
        titulo = "Ferramenta: Bordas do telhado";
        secs.push({ nome: "Borda", params: [
          { id: "b2f:bo:tipoBorda", rotulo: "Tipo", tipo: "lista", valor: cfg.borda.tipoBorda, opcoes: Object.keys(T.BORDAS).map(function (k) { return { id: k, rotulo: T.BORDAS[k].rotulo }; }) },
          ro("b2f:bo:onde", "Onde vai", T.BORDAS[cfg.borda.tipoBorda].onde === "beiral" ? "nas arestas que definem inclinação (beiral)" : "em qualquer aresta (beiral ou empena)")
        ] });
      } else if (sub === "telhado-unir") {
        titulo = "Ferramenta: Unir telhado";
        secs.push({ nome: "Unir", params: [ro("b2f:un:como", "Como", "clique o telhado que entra e depois aquele em que ele encosta")] });
      } else return null;
      return { titulo: titulo, icone: sub === "fundacao" ? "laje" : "telhado", semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudar(sub, pid, valor, arqui); } };
    },
    mudar: function (sub, pid, valor, arqui) {
      var k = String(pid).replace(/^b2f:/, ""), T = TM();
      if (k === "nivel" && arqui && arqui.mudarFerramenta) return arqui.mudarFerramenta(sub, pid, valor);
      var m = /^(te|fu|bo):(\w+)$/.exec(k); if (!m) return this.esquema(sub, arqui);
      var alvo = m[1] === "te" ? cfg.telhado : (m[1] === "fu" ? cfg.fundacao : cfg.borda), c = m[2];
      if (c === "tipoId") { if (T && T.tipo(valor).id === String(valor)) alvo.tipoId = String(valor); }
      else if (c === "modo") alvo.modo = valor === "contorno" || valor === "extrusao" ? valor : "retangulo";
      else if (c === "aguas") alvo.aguas = valor === "1" || valor === 1 ? 1 : (valor === "2" || valor === 2 ? 2 : 4);
      else if (c === "tipoFundacao") { if (ROT_FUND[valor]) alvo.tipoFundacao = valor; }
      else if (c === "radierModo") alvo.radierModo = valor === "contorno" ? "contorno" : "retangulo";
      else if (c === "tipoBorda") { if (T && T.BORDAS[valor]) alvo.tipoBorda = valor; }
      else if (temCampo(alvo, c)) alvo[c] = valor === "" || valor == null ? null : num(valor, alvo[c]);
      return this.esquema(sub, arqui);
    },

    /* --------------------------------------------- as ops (puras, testáveis) */
    novoId: function (estado, pre) {
      var usados = {};
      ["caixas", "coberturas", "familias", "volumes", "forros", "ambientes", "telhados", "bordas", "fundacoes", "separadores", "eixos"].forEach(function (k) { arr(estado && estado[k]).forEach(function (x) { if (x && x.id != null) usados[String(x.id)] = 1; }); });
      var n = 1; while (usados[pre + n]) n++;
      return pre + n;
    },
    /* o telhado novo: retângulo (p1, p2), contorno [{x,z}] ou extrusão (p1, p2 = a base; p3 = até onde vai).
       nivel = {id, elevacao, peDireito} | null; base = a cota do plano de trabalho */
    opTelhado: function (estado, dados, nivel, base) {
      var T = TM(); if (!T) return { ok: false, motivo: "O motor do telhado (js/bimtelhado.js) não carregou." };
      var c = cfg.telhado, d = { inclinacao: c.inclinacao, beiral: c.beiral, tipoId: c.tipoId };
      d.deslocBase = c.deslocBase != null ? c.deslocBase : (nivel && +nivel.peDireito > 0 ? +nivel.peDireito : 2.8);
      if (nivel && nivel.id != null) { d.nivelId = String(nivel.id); d.base = +nivel.elevacao || 0; } else d.base = +base || 0;
      if (dados.contorno) d.contorno = dados.contorno;
      else if (dados.p1 && dados.p2 && !dados.p3) {
        var x0 = Math.min(dados.p1.x, dados.p2.x), x1 = Math.max(dados.p1.x, dados.p2.x), z0 = Math.min(dados.p1.z, dados.p2.z), z1 = Math.max(dados.p1.z, dados.p2.z);
        if (!(x1 - x0 > 0.3 && z1 - z0 > 0.3)) return { ok: false, motivo: "Retângulo pequeno demais para o telhado." };
        d.contorno = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]; d.aguas = c.aguas;
      } else if (dados.p1 && dados.p2 && dados.p3) {
        /* extrusão: a base vai de p1 a p2 (o perfil de 2 águas com a inclinação); p3 diz o comprimento */
        var dx = dados.p2.x - dados.p1.x, dz = dados.p2.z - dados.p1.z, L = Math.sqrt(dx * dx + dz * dz);
        if (!(L > 0.3)) return { ok: false, motivo: "Base da extrusão curta demais." };
        var ux = dx / L, uz = dz / L, w = (dados.p3.x - dados.p1.x) * (-uz) + (dados.p3.z - dados.p1.z) * ux;
        if (!(Math.abs(w) > 0.3)) return { ok: false, motivo: "Clique mais longe da base: a extrusão precisa de comprimento." };
        var i = c.inclinacao / 100;
        d.modo = "extrusao"; d.perfil = [{ u: 0, y: 0 }, { u: L / 2, y: L / 2 * i }, { u: L, y: 0 }];
        d.origem = { x: dados.p1.x, z: dados.p1.z }; d.ang = Math.atan2(uz, ux) * 180 / Math.PI; d.inicio = Math.min(0, w); d.fim = Math.max(0, w);
      } else return { ok: false, motivo: "Clique os cantos do telhado." };
      var id = this.novoId(estado, "te"), op = T.op(id, d);
      if (!op) return { ok: false, motivo: "Telhado inválido: confira o contorno e as Propriedades." };
      var t = T.calcular(op, nivel ? [{ id: nivel.id, elevacao: +nivel.elevacao || 0 }] : []);
      if (!t.ok) return { ok: false, motivo: (t.avisos || []).join(" ") || "Não deu para montar o telhado." };
      return { ok: true, op: op, telhado: t, resumo: "Telhado (" + t.tipoTelhado.rotulo + "): " + t.nAguas + " água" + (t.nAguas > 1 ? "s" : "") + ", " + n2(t.area) + " m² inclinados (" + n2(t.areaProjecao) + " m² em projeção)" +
        (t.cumeeira > 0 ? ", cumeeira " + n2(t.cumeeira) + " m" : "") + (t.espigao > 0 ? ", espigões " + n2(t.espigao) + " m" : "") + (t.rincao > 0 ? ", rincões " + n2(t.rincao) + " m" : "") + "." };
    },
    opFundacao: function (estado, dados, nivel, base) {
      var F = FM(); if (!F) return { ok: false, motivo: "O motor da fundação (js/bimfundacao.js) não carregou." };
      var c = cfg.fundacao, d = {}, tf = c.tipoFundacao;
      Object.keys(c).forEach(function (k) { if (k !== "radierModo" && c[k] != null) d[k] = c[k]; });
      if (tf !== "sapata") { delete d.alturaBase; delete d.larguraTopo; delete d.comprimentoTopo; }
      if (tf !== "bloco") { delete d.nEstacas; delete d.espacamento; }
      if (tf !== "bloco" && tf !== "estaca") { delete d.diametro; delete d.comprimentoEstaca; }
      if (tf === "estaca") { delete d.largura; delete d.comprimento; delete d.altura; delete d.lastro; delete d.folga; }
      if (tf === "baldrame" || tf === "radier") delete d.comprimento;
      if (tf === "radier") delete d.largura;
      if (nivel && nivel.id != null) { d.nivelId = String(nivel.id); d.base = +nivel.elevacao || 0; } else d.base = +base || 0;
      if (tf === "baldrame") { if (!dados.p1 || !dados.p2) return { ok: false, motivo: "Baldrame: clique o início e o fim." }; d.x = dados.p1.x; d.z = dados.p1.z; d.x1 = dados.p2.x; d.z1 = dados.p2.z; }
      else if (tf === "radier") {
        if (dados.contorno) d.contorno = dados.contorno;
        else if (dados.p1 && dados.p2) { var x0 = Math.min(dados.p1.x, dados.p2.x), x1 = Math.max(dados.p1.x, dados.p2.x), z0 = Math.min(dados.p1.z, dados.p2.z), z1 = Math.max(dados.p1.z, dados.p2.z); d.contorno = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]; }
        else return { ok: false, motivo: "Radier: clique os cantos." };
      } else { if (!dados.p1) return { ok: false, motivo: "Clique onde a fundação fica." }; d.x = dados.p1.x; d.z = dados.p1.z; }
      var id = this.novoId(estado, "fu"), op = F.op(id, d);
      if (!op) return { ok: false, motivo: "Fundação inválida: confira as medidas em Propriedades." };
      var f = F.calcular(op, nivel ? [{ id: nivel.id, elevacao: +nivel.elevacao || 0 }] : []);
      if (!f.ok) return { ok: false, motivo: (f.avisos || []).join(" ") || "Não deu para montar a fundação." };
      return { ok: true, op: op, fundacao: f, resumo: ROT_FUND[tf] + ": " + n2(f.volume, 3) + " m³ de concreto" + (f.volumeEstacas > 0 && tf === "bloco" ? " + " + n2(f.volumeEstacas, 3) + " m³ de estacas (" + n2(f.comprimentoEstacas) + " m)" : "") +
        (f.escavacao > 0 ? ", escavação " + n2(f.escavacao, 3) + " m³" : "") + (f.aco != null ? ", aço " + n2(f.aco, 1) + " kg" : ", aço a informar (taxa kg/m³)") + "." };
    },
    /* a borda: a aresta do telhado mais perto do ponto (planta, até 1 m da linha do beiral) */
    opBorda: function (estado, ponto, telhadoId) {
      var T = TM(); if (!T) return { ok: false, motivo: "O motor do telhado (js/bimtelhado.js) não carregou." };
      var melhor = null, tb = cfg.borda.tipoBorda;
      arr(estado && estado.telhados).forEach(function (t) {
        if (!t || !t.ok || t.modo !== "perimetro" || (telhadoId != null && String(t.id) !== String(telhadoId))) return;
        arr(t.arestasCalc).forEach(function (e) {
          var a = [e.beiral.a.x, e.beiral.a.z], b = [e.beiral.b.x, e.beiral.b.z], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
          var s = L2 > 0 ? Math.max(0, Math.min(1, ((ponto.x - a[0]) * dx + (ponto.z - a[1]) * dz) / L2)) : 0;
          var dd = Math.sqrt(Math.pow(a[0] + s * dx - ponto.x, 2) + Math.pow(a[1] + s * dz - ponto.z, 2));
          if (dd <= 1.0 && (!melhor || dd < melhor.d)) melhor = { d: dd, t: t, e: e };
        });
      });
      if (!melhor) return { ok: false, motivo: "Clique perto de uma aresta de um telhado por perímetro (até 1 m da borda do beiral)." };
      if (T.BORDAS[tb].onde === "beiral" && !melhor.e.define) return { ok: false, motivo: T.BORDAS[tb].rotulo + " vai no beiral: esta aresta é empena (não define inclinação)." };
      var ja = arr(estado && estado.bordas).filter(function (b) { return b && String(b.telhado) === String(melhor.t.id) && b.tipoBorda === tb; })[0];
      if (ja) {
        var l = arr(ja.arestas).map(Number);
        if (l.indexOf(melhor.e.orig) >= 0) return { ok: false, motivo: T.BORDAS[tb].rotulo + " já está na aresta " + (melhor.e.orig + 1) + "." };
        return { ok: true, op: { op: "borda", id: ja.id, arestas: l.concat([melhor.e.orig]) }, resumo: T.BORDAS[tb].rotulo + ": + aresta " + (melhor.e.orig + 1) + " (" + n2(melhor.e.comprimento) + " m)." };
      }
      var op = T.opBorda(this.novoId(estado, "bt"), { telhado: melhor.t.id, tipoBorda: tb, arestas: [melhor.e.orig] });
      return op ? { ok: true, op: op, resumo: T.BORDAS[tb].rotulo + " na aresta " + (melhor.e.orig + 1) + " do telhado " + melhor.t.id + ": " + n2(melhor.e.comprimento) + " m." } : { ok: false, motivo: "Borda inválida." };
    },
    /* unir A a B (B já unido a A no mesmo sentido = desunir) */
    opUnir: function (estado, idA, idB) {
      var ts = arr(estado && estado.telhados), A = ts.filter(function (t) { return String(t.id) === String(idA); })[0], B = ts.filter(function (t) { return String(t.id) === String(idB); })[0];
      if (!A || !B) return { ok: false, motivo: "Clique em dois telhados criados aqui." };
      if (String(idA) === String(idB)) return { ok: false, motivo: "Escolha um telhado diferente do primeiro." };
      if (A.unir != null && String(A.unir) === String(idB)) return { ok: true, op: { op: "telhado", id: A.id, unir: null }, resumo: "Telhado " + A.id + " desunido de " + B.id + "." };
      return { ok: true, op: { op: "telhado", id: A.id, unir: String(B.id) }, resumo: "Telhado " + A.id + " unido a " + B.id + ": a parte de baixo sai e o encontro vira rincão." };
    },

    /* ======================================================= o 3D (bim.js) */
    montar3d: function (api) {
      if (!this.ativo() || !api || !api.THREE || !api.scene || !TM() || !FM()) return null;
      var self = this, THREE = api.THREE, edit = api.edit, grp = new THREE.Group(), pts = [], marcas = [], unirA = null;
      grp.name = "p3-previa"; api.scene.add(grp);
      var SUBS = { telhado: 1, fundacao: 1, "telhado-borda": 1, "telhado-unir": 1 };
      function nivel() { return edit && edit.b2 && edit.b2.nivel ? edit.b2.nivel : null; }
      function limparPrevia() { grp.children.slice().forEach(function (o) { grp.remove(o); if (o.geometry) o.geometry.dispose(); }); }
      function cancelar() { pts = []; unirA = null; marcas.forEach(function (m) { if (api.limparMarca) api.limparMarca(m); }); marcas = []; limparPrevia(); }
      function marca(p) { if (!api.marca) return; var m = api.marca(new THREE.Vector3(p.x, edit.base, p.z)); api.scene.add(m); if (api.reescalar) api.reescalar(m); marcas.push(m); }
      var matLinha = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false });
      function linha(lst) {
        limparPrevia(); if (lst.length < 2) return;
        var g = new THREE.BufferGeometry().setFromPoints(lst.map(function (q) { return new THREE.Vector3(q.x, edit.base + 0.02, q.z); }));
        var l = new THREE.Line(g, matLinha); l.renderOrder = 998; l.raycast = function () {}; grp.add(l);
      }
      function feito(r) {
        if (!r.ok) { api.hint(r.motivo); return true; }
        cancelar(); api.op(r.op); if (api.fechou) api.fechou();
        api.hint(r.resumo + " Clique para outro, ou Esc."); status(r.resumo);
        return true;
      }
      function perto1(e) {
        if (pts.length < 3 || !e || !isFinite(e.clientX) || !api.telaDe) return false;
        var t0 = api.telaDe(pts[0].x, edit.base, pts[0].z);
        return t0 && Math.abs(t0.x - e.clientX) <= 12 && Math.abs(t0.y - e.clientY) <= 12;
      }
      function modoPts(sub) {
        if (sub === "telhado") return cfg.telhado.modo;
        if (sub === "fundacao") { var t = cfg.fundacao.tipoFundacao; return t === "baldrame" ? "dois" : (t === "radier" ? cfg.fundacao.radierModo : "um"); }
        return "um";
      }
      var m3d = {
        contar: function (st) { return arr(st && st.telhados).length + arr(st && st.bordas).length + arr(st && st.fundacoes).length; },
        dica: function (sub) {
          if (sub === "telhado") { var m = cfg.telhado.modo; return m === "contorno" ? "Telhado por perímetro: clique os cantos (pela linha da parede); feche no primeiro ponto ou com Enter. O beiral sai para fora." : (m === "extrusao" ? "Telhado por extrusão: clique o início e o fim da base e depois até onde ele vai." : "Telhado: clique dois cantos OPOSTOS (pela linha da parede, sem o beiral)."); }
          if (sub === "fundacao") { var tf = cfg.fundacao.tipoFundacao; return tf === "baldrame" ? "Baldrame: clique o início e o fim." : (tf === "radier" ? (cfg.fundacao.radierModo === "contorno" ? "Radier: clique os cantos; feche no primeiro ponto ou com Enter." : "Radier: clique dois cantos opostos.") : ROT_FUND[tf] + ": clique o centro."); }
          if (sub === "telhado-borda") return TM().BORDAS[cfg.borda.tipoBorda].rotulo + ": clique perto da aresta do telhado (a borda do beiral).";
          if (sub === "telhado-unir") return unirA ? "Agora clique o telhado em que o " + unirA + " encosta." : "Unir telhado: clique o telhado que ENTRA no outro.";
          return "";
        },
        aoSub: function (sub) { cancelar(); void sub; },
        cancelar: cancelar,
        fechar: function () {
          var sub = edit && edit.sub; if (!SUBS[sub] || pts.length < 3) return false;
          var C = pts.map(function (q) { return { x: q.x, z: q.z }; });
          if (sub === "telhado" && cfg.telhado.modo === "contorno") return feito(self.opTelhado(edit.estado, { contorno: C }, nivel(), edit.base));
          if (sub === "fundacao" && cfg.fundacao.tipoFundacao === "radier" && cfg.fundacao.radierModo === "contorno") return feito(self.opFundacao(edit.estado, { contorno: C }, nivel(), edit.base));
          return false;
        },
        mover: function (e) {
          var sub = edit && edit.on ? edit.sub : null; if (!SUBS[sub] || !pts.length || !api.planoPonto) return false;
          var p = api.planoPonto(e.clientX, e.clientY); if (!p) return false;
          var mo = modoPts(sub), a = pts[0];
          if (mo === "retangulo" && pts.length === 1) linha([a, { x: p.x, z: a.z }, { x: p.x, z: p.z }, { x: a.x, z: p.z }, a]);
          else linha(pts.concat([{ x: p.x, z: p.z }]));
          return false;
        },
        clique: function (sub, e, hit, p) {
          if (!SUBS[sub]) return false;
          if (!p) { api.hint("Não achei o ponto no plano de trabalho: clique no chão do nível."); return true; }
          var q = { x: p.x, z: p.z };
          if (sub === "telhado-unir") {
            var id = api.alvo ? api.alvo() : null, ehTel = id != null && arr(edit.estado && edit.estado.telhados).some(function (t) { return String(t.id) === String(id); });
            if (!ehTel) { api.hint("Clique EM CIMA de um telhado criado aqui."); return true; }
            if (!unirA) { unirA = String(id); api.hint(m3d.dica(sub)); return true; }
            var r = self.opUnir(edit.estado, unirA, id); unirA = null; return feito(r);
          }
          if (sub === "telhado-borda") return feito(self.opBorda(edit.estado, q, null));
          var mo = modoPts(sub);
          if (mo === "um") return feito(self.opFundacao(edit.estado, { p1: q }, nivel(), edit.base));
          if (mo === "contorno" && perto1(e)) return m3d.fechar();
          pts.push(q); marca(q);
          if (mo === "dois" && pts.length === 2) return feito(self.opFundacao(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base));
          if (mo === "retangulo" && pts.length === 2) return feito(sub === "telhado" ? self.opTelhado(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base) : self.opFundacao(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base));
          if (mo === "extrusao" && pts.length === 3) return feito(self.opTelhado(edit.estado, { p1: pts[0], p2: pts[1], p3: pts[2] }, nivel(), edit.base));
          api.hint(mo === "contorno" ? pts.length + " ponto(s)" + (pts.length >= 3 ? " — clique no primeiro ponto ou Enter para fechar." : " — siga clicando os cantos.") : (mo === "extrusao" ? (pts.length === 1 ? "Agora o fim da base." : "Agora até onde a extrusão vai.") : "Agora o outro ponto."));
          return true;
        },
        /* o DESENHO (chamado no editRebuild, dentro do modelo "Criados no OrçaPRO") */
        malhas: function (st, mo, addMesh) { self.desenhar(THREE, st, mo, addMesh); }
      };
      /* Enter fecha o contorno (captura: o Enter da casca repetiria o comando da fita) */
      if (typeof window !== "undefined") window.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" || !edit || !edit.on || !SUBS[edit.sub] || pts.length < 3) return;
        var t3 = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t3.tagName || "") || t3.isContentEditable) return;
        if (m3d.fechar()) { ev.preventDefault(); ev.stopPropagation(); }
      }, true);
      this._m3d = m3d;
      return m3d;
    },

    /* --------------------------------------------- desenho (prismas indexados) */
    _mats: null,
    _mat: function (THREE, k) {
      var M = this._mats || (this._mats = {});
      if (M[k]) return M[k];
      var cores = { ceramica: 0xa65a3a, fibrocimento: 0xb9bcbe, metalica: 0x8f9aa6, concreto: 0xa9b0b8, chapa: 0x8a8f96, intradorso: 0xe8e2d4 };
      M[k] = new THREE.MeshStandardMaterial({ color: cores[k] || 0xa9b0b8, metalness: k === "chapa" || k === "metalica" ? 0.4 : 0.03, roughness: 0.85, side: THREE.DoubleSide });
      return M[k];
    },
    /* polígono da planta Q [[x,z]] (anti-horário) com o fundo yb(i) e o topo yt(i) por vértice */
    _prisma: function (THREE, Q, yb, yt) {
      var V2 = function (q) { return new THREE.Vector2(q[0], q[1]); }, pos = [], tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(Q.map(V2), []); } catch (e) { tris = []; }
      function v(i, top) { pos.push(Q[i][0], top ? yt(i) : yb(i), Q[i][1]); }
      tris.forEach(function (t) { v(t[0], 0); v(t[2], 0); v(t[1], 0); v(t[0], 1); v(t[1], 1); v(t[2], 1); });
      for (var i = 0; i < Q.length; i++) { var j = (i + 1) % Q.length; v(i, 0); v(j, 0); v(j, 1); v(i, 0); v(j, 1); v(i, 1); }
      return this._geo(THREE, pos);
    },
    _faces: function (THREE, faces) {
      var pos = [];
      faces.forEach(function (f) { for (var k = 1; k + 1 < f.length; k++) [f[0], f[k], f[k + 1]].forEach(function (p) { pos.push(p[0], p[1], p[2]); }); });
      return this._geo(THREE, pos);
    },
    _geo: function (THREE, pos) {
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      var idx = []; for (var q = 0; q < pos.length / 3; q++) idx.push(q);
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox(); return g;
    },
    desenhar: function (THREE, st, mo, addMesh) {
      var self = this;
      function reg(id, ifc, nome, qto, disc) {
        mo.tipos[ifc] = (mo.tipos[ifc] || 0) + 1; mo.qto[id] = qto;
        mo.elementos.push({ id: id, uid: "edit:" + id, mid: "edit", arquivo: mo.nome, tipo: ifc, nome: nome, etapa: null, codOrc: null, qto: qto, disciplina: disc || "arquitetura" });
        mo.nEl++;
      }
      arr(st.telhados).forEach(function (t) {
        if (!t || !t.ok) return;
        var cam = t.tipoTelhado && t.tipoTelhado.camadas && t.tipoTelhado.camadas[0], mn = String(cam && cam.material || "").toLowerCase();
        var mat = self._mat(THREE, /fibro/.test(mn) ? "fibrocimento" : (/aço|aco|metal|eps/.test(mn) ? "metalica" : "ceramica")), esp = +t.espessura || 0.08;
        arr(t.aguasCalc).forEach(function (ag) {
          ag.pecas.forEach(function (pc) {
            var Q = pc.pts.map(function (q) { return [q.x, q.z]; }), Y = pc.pts.map(function (q) { return q.y; }), dy = esp * ag.fator;
            addMesh(new THREE.Mesh(self._prisma(THREE, Q, function (i) { return Y[i]; }, function (i) { return Y[i] + dy; }), mat), t.id, "IFCROOF", mat);
          });
        });
        reg(t.id, "IFCROOF", "Telhado " + (t.tipoTelhado ? t.tipoTelhado.rotulo : "") + " — " + t.nAguas + " água(s) (sintético " + t.id + ")", { area: t.area, areaProjecao: t.areaProjecao, volume: t.volume, comprimento: t.cumeeira, contagem: 1 });
      });
      arr(st.bordas).forEach(function (b) {
        if (!b || !b.ok) return;
        var mat = self._mat(THREE, b.tipoBorda === "intradorso" ? "intradorso" : "chapa"), lg = +b.larguraEf || 0.1, al = +b.alturaEf || 0.1, n = 0;
        if (b.tipoBorda === "intradorso") arr(b.placas).forEach(function (pq) {
          var Q = pq.pts.map(function (q) { return [q.x, q.z]; }), y = +pq.y || 0;
          if (THREE.ShapeUtils.area(Q.map(function (q) { return new THREE.Vector2(q[0], q[1]); })) < 0) Q.reverse();
          addMesh(new THREE.Mesh(self._prisma(THREE, Q, function () { return y - lg; }, function () { return y; }), mat), b.id, b.ifc, mat); n++;
        });
        else arr(b.segs).forEach(function (sg) {
          var A = new THREE.Vector3(sg.a.x, sg.a.y - al / 2, sg.a.z), B = new THREE.Vector3(sg.b.x, sg.b.y - al / 2, sg.b.z), L = A.distanceTo(B);
          if (!(L > 1e-4)) return;
          var m = new THREE.Mesh(new THREE.BoxGeometry(L, al, lg), mat);
          m.position.copy(A).add(B).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), B.clone().sub(A).normalize());
          addMesh(m, b.id, b.ifc, mat); n++;
        });
        if (n) reg(b.id, b.ifc, ({ calha: "Calha", rufo: "Rufo", testeira: "Testeira", intradorso: "Intradorso" })[b.tipoBorda] + " (sintético " + b.id + ")", { comprimento: b.comprimento, area: b.area, contagem: 1 });
      });
      arr(st.fundacoes).forEach(function (f) {
        if (!f || !f.ok) return;
        var mat = self._mat(THREE, "concreto"), y0 = +f.cotaFundo, y1 = +f.cotaTopo;
        if (f.tipoFundacao === "estaca") {
          var c = new THREE.Mesh(new THREE.CylinderGeometry(f.diametroEf / 2, f.diametroEf / 2, y1 - y0, 24), mat);
          c.position.set(+f.x || 0, (y0 + y1) / 2, +f.z || 0); addMesh(c, f.id, f.ifc, mat);
        } else if (f.tipoFundacao === "sapata" && f.chanfrada) {
          var g = (+f.giro || 0) * Math.PI / 180, cu = Math.cos(g), su = Math.sin(g), cx = +f.x || 0, cz = +f.z || 0, yr = y0 + f.alturaBaseEf;
          var cant = function (u, w, y) { return [cx + u * cu - w * su, y, cz + u * su + w * cu]; };
          var S4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]], Bh = f.largura / 2, Lh = f.comprimento / 2, bh = f.larguraTopoEf / 2, lh = f.comprimentoTopoEf / 2;
          var Bk = S4.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, y0); }), Rk = S4.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, yr); }), Tk = S4.map(function (s) { return cant(s[0] * bh, s[1] * lh, y1); });
          var faces = [Bk.slice(), Tk.slice().reverse()];
          for (var k = 0; k < 4; k++) { var j = (k + 1) % 4; faces.push([Bk[k], Rk[k], Rk[j], Bk[j]]); faces.push([Rk[k], Tk[k], Tk[j], Rk[j]]); }
          addMesh(new THREE.Mesh(self._faces(THREE, faces), mat), f.id, f.ifc, mat);
        } else if (arr(f.planta).length >= 3) {
          var Q = f.planta.map(function (q) { return [q.x, q.z]; });
          if (THREE.ShapeUtils.area(Q.map(function (q) { return new THREE.Vector2(q[0], q[1]); })) < 0) Q.reverse();
          addMesh(new THREE.Mesh(self._prisma(THREE, Q, function () { return y0; }, function () { return y1; }), mat), f.id, f.ifc, mat);
        }
        if (f.tipoFundacao === "bloco") arr(f.estacas).forEach(function (e) {
          var L = f.comprimentoEstacaEf, c2 = new THREE.Mesh(new THREE.CylinderGeometry(f.diametroEf / 2, f.diametroEf / 2, L, 24), mat);
          c2.position.set(e.x, y0 - L / 2, e.z); addMesh(c2, f.id, f.ifc, mat);
        });
        reg(f.id, f.ifc, (f.rotuloTipo || "Fundação") + " (sintética " + f.id + ")", { volume: f.volume, area: f.areaBase, comprimento: f.comprimentoPeca || f.comprimentoEstacas || 0, contagem: 1 }, "estrutura");
      });
    }
  };
  function temCampo(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  global.BimP3UI = BimP3UI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimP3UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
