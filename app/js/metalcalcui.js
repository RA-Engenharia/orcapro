/* =====================================================================
 * metalcalcui.js — a TELA DO CÁLCULO DO GALPÃO DE AÇO (disciplina Metálica
 * do BIM, prévia do modelador). Fina: quem calcula são os motores puros
 *   js/acoisopletas.js + js/acovento.js   vento (V0 pelo endereço, S1, S2, S3)
 *   js/acofechamentos.js                  telhas e paredes dos catálogos
 *   js/acodimensionar.js (+ acomodelo, acoanalise, acodim8800…)  o cálculo
 *   js/acocalcworker.js                   o cálculo num Web Worker
 *   js/aconormas.js · js/metaldicas.js · js/dicarica.js
 * e, quando existirem, js/acomemorial.js, js/acopranchas.js, js/acocype.js e
 * js/metalcalcvista.js (cada um chamado só se window.X existir).
 *
 * O QUE A TELA FAZ (o pedido do Rogério, 12/10/2026):
 *   1. Local e vento — o ENDEREÇO (ou coordenadas / link do mapa) dá o V0
 *      pelo mapa de isopletas, com a obra marcada e o porquê; topografia
 *      (S1), rugosidade (categorias I–V) e uso (S3) com desenho de cada um;
 *   2. Geometria — vão, comprimento, espaçamento, pé-direito, inclinação,
 *      uma/duas águas, base rotulada/engastada, com o pórtico desenhado ao
 *      vivo;
 *   3. Fechamentos — as 4 faces numa planta clicável: aberta, telha,
 *      alvenaria (bloco), misto (alvenaria até h + telha), pré-moldado;
 *      portões (abertura dominante);
 *   4. Cobertura — a telha (fabricante, peso, cores, vão máximo NA CARGA
 *      DESTA OBRA: a maior entre a sobrecarga da NBR 6120 e a sucção local
 *      do vento) e as instalações/forro;
 *   5. Perfis e aços — automático (o sistema escolhe o mais leve que passa)
 *      ou o usuário escolhe;
 *   6. Revisão e calcular (Worker com progresso).
 *   Modelos prontos (6), resultado (aprovado/reprovado, peso, kg/m², λcr,
 *   deslocabilidade, aproveitamento por grupo, DECISÕES do sistema com o
 *   motivo, problemas com os botões das soluções), painel de NORMAS.
 *   Exportar para o CYPE 3D (.zip) e o painel "COMO USAR NO CYPE 3D" (o guia do
 *   AcoCype.comoUsarHTML: 14 passos com os números deste cálculo, o que é
 *   manual e por quê, problemas comuns), aberto pelo botão ao lado da exportação
 *   e pelo atalho "Ver como usar" do aviso do download; Esc volta.
 * O SISTEMA É O CONHECIMENTO: a tela não pede flambagem nem travamento.
 *   Faltou estabilidade → o motor devolve `problemas[].solucoes` e a tela
 *   oferece "calcular com esta solução"; o usuário que insiste calcula com a
 *   sugestão do sistema registrada nas decisões.
 * Os parâmetros ficam na OBRA (localStorage `orcapro:metal:calc:<obra>`).
 * ⚠ Sem backdrop-filter: a janela fica por cima do BIM (z 49, abaixo do
 *   modal do app, z 50) e não é ancestral dele.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;

  /* ================================================================ UTIL */
  /* mesma regra do Util.parseNum (js/util.js): "1,5"→1.5 · "0.12"→0.12 · "1.5"→1.5 · "1.234,56"→1234.56 · "1.000"→1000 (milhar BR; zero à esquerda NÃO é milhar) */
  function _brNorm(s) {
    var v = s.indexOf(",") > -1, np = (s.match(/\./g) || []).length, i;
    if (v && np) return s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    if (v) return (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    if (np > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return s.replace(/\./g, "");
      i = s.lastIndexOf("."); return s.slice(0, i).replace(/\./g, "") + "." + s.slice(i + 1);
    }
    if (np === 1 && /^-?\d{1,3}\.\d{3}$/.test(s) && !/^-?0\./.test(s)) return s.replace(/\./g, "");
    return s;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(_brNorm(String(v).replace(/\s/g, ""))); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function fmt(v, c) {
    if (v == null || !isFinite(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s.join(".")) !== 0 ? "−" : "") + i + (c ? "," + s[1] : "");
  }
  function fmtIn(v) { if (v == null || v === "" || !isFinite(v)) return ""; return String(Math.round(v * 1000) / 1000).replace(".", ","); }
  function pct(v) { return fmt(v * 100, 0) + " %"; }
  function mesclar(a, b) {
    if (b == null || typeof b !== "object" || Array.isArray(b)) return b === undefined ? a : b;
    var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b).forEach(function (k) { o[k] = (a && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) ? mesclar(a[k], b[k]) : b[k]; });
    return o;
  }
  function pegar(o, cam) { var p = cam.split("."); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
  function por(o, cam, v) { var p = cam.split("."), x = o; for (var i = 0; i < p.length - 1; i++) { if (x[p[i]] == null || typeof x[p[i]] !== "object") x[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {}; x = x[p[i]]; } x[p[p.length - 1]] = v; }
  function toast(t, tipo, ms) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function Ges() { return global.Gestao; }
  function obraId() { var g = Ges(); return String((g && g._bimSel) || "geral"); }
  function obra() { var g = Ges(), o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o; }
  function ico(nome, t) { try { if (global.Icones && Icones.get) return Icones.get(nome, t || 16) || ""; } catch (e) {} return ""; }
  function F() { return global.AcoFechamentos; }
  function V() { return global.AcoVento; }
  function I() { return global.AcoIsopletas; }
  function P() { return global.PerfisAco; }
  function MAT() { return global.AcoMateriais; }

  /* ================================================================ DADOS DA TELA */
  var PASSOS = [
    { n: 1, id: "local", titulo: "Local e vento", sub: "Endereço → V0, topografia, terreno, uso" },
    { n: 2, id: "geometria", titulo: "Geometria", sub: "Vão, comprimento, pé-direito, telhado" },
    { n: 3, id: "fechamentos", titulo: "Fechamentos", sub: "As quatro faces e os portões" },
    { n: 4, id: "cobertura", titulo: "Cobertura", sub: "Telha, cores, instalações" },
    { n: 5, id: "perfis", titulo: "Perfis e aços", sub: "Automático ou escolhidos" },
    { n: 6, id: "revisao", titulo: "Revisão e cálculo", sub: "Conferir e calcular" }
  ];
  var FACES = [
    { id: "frente", nome: "Frente", desc: "oitão da frente" }, { id: "fundo", nome: "Fundo", desc: "oitão do fundo" },
    { id: "esquerda", nome: "Lateral esquerda", desc: "parede ao longo do comprimento" }, { id: "direita", nome: "Lateral direita", desc: "parede ao longo do comprimento" }
  ];
  var TIPOS_FACE = [
    { id: "aberto", nome: "Aberta", desc: "Sem parede: só os pilares", dica: null },
    { id: "telha", nome: "Telha metálica", desc: "Telha nas travessas, de cima a baixo", dica: "telha-trapezoidal" },
    { id: "alvenaria", nome: "Alvenaria", desc: "Bloco em toda a altura", dica: "fechamento-alvenaria" },
    { id: "misto", nome: "Misto", desc: "Alvenaria até h + telha acima", dica: "fechamento-misto" },
    { id: "premoldado", nome: "Pré-moldado", desc: "Painel de concreto", dica: "pre-moldado" }
  ];
  var BLOCOS = [
    { id: "vedacao-ceramico", nome: "Bloco cerâmico de vedação" },
    { id: "vedacao-concreto", nome: "Bloco de concreto de vedação" },
    { id: "estrutural-concreto", nome: "Bloco de concreto estrutural" }
  ];
  var S1S = [
    { id: "plano", nome: "Plano", desc: "Terreno plano ou pouco acidentado — S1 = 1,0" },
    { id: "talude", nome: "Talude", desc: "No alto de um talude — S1 pela inclinação e altura" },
    { id: "morro", nome: "Morro", desc: "No alto de um morro — S1 pela inclinação e altura" },
    { id: "vale", nome: "Vale", desc: "Vale profundo, protegido — S1 = 0,9" }
  ];
  /* categorias de rugosidade (NBR 6123, 5.3.1) — o texto do motor de vento resumido */
  var RUGOS = [
    { id: "I", nome: "Categoria I", desc: "Mar calmo, lagos, rios, pântanos sem vegetação" },
    { id: "II", nome: "Categoria II", desc: "Campo aberto em nível, poucos obstáculos isolados (até 1 m)" },
    { id: "III", nome: "Categoria III", desc: "Plano ou ondulado com sebes, muros e casas esparsas (3 m)" },
    { id: "IV", nome: "Categoria IV", desc: "Muitos obstáculos próximos: bairro, zona industrial ou mata (10 m)" },
    { id: "V", nome: "Categoria V", desc: "Centro de grande cidade, prédios altos e próximos (25 m ou mais)" }
  ];
  var USOS_PADRAO = [
    { g: 1, s3: 1.10, curto: "Essencial após tempestade", desc: "hospitais, bombeiros, segurança, centrais de comunicação" },
    { g: 2, s3: 1.00, curto: "Comércio, indústria, moradia", desc: "comércio e indústria com alto fator de ocupação; hotéis e residências" },
    { g: 3, s3: 0.95, curto: "Depósito, baixa ocupação", desc: "instalações industriais com baixo fator de ocupação: depósitos, silos, rurais" },
    { g: 4, s3: 0.88, curto: "Vedações", desc: "telhas, vidros, painéis de vedação" },
    { g: 5, s3: 0.83, curto: "Temporária", desc: "edificações temporárias; estruturas durante a construção" }
  ];
  var FAMILIAS = [
    { id: "GERDAU", nome: "Laminado W — Gerdau", desc: "Perfil I de abas paralelas: o mais usado em galpões, pronto no estoque.", viga: "GERDAU", pilar: "GERDAU", filtro: /^W /, dica: "secao-w" },
    { id: "AM-W", nome: "Laminado — ArcelorMittal", desc: "Perfis I e H laminados da ArcelorMittal Brasil.", viga: "AM-W", pilar: "AM-W", dica: "secao-w" },
    { id: "VS", nome: "Soldado VS e CVS", desc: "Chapas soldadas (NBR 5884): altura livre para vãos grandes.", viga: "VS", pilar: "CVS", dica: "secao-soldado" }
  ];
  var CONTRAVENTOS = [
    { id: "auto", nome: "Automático", desc: "O sistema decide (X de barra redonda nos vãos extremos)", dica: "contraventamento-cobertura" },
    { id: "X-barra", nome: "X de barra redonda", desc: "Só tração, o mais leve", dica: "contraventamento-parede" },
    { id: "X-cantoneira", nome: "X de cantoneira", desc: "Mais rígido, mais pesado", dica: "contraventamento-parede" },
    { id: "portico", nome: "Pórtico de travamento", desc: "Libera o vão para portão", dica: "portico-alma-cheia" },
    { id: "nenhum", nome: "Nenhum", desc: "O sistema avisa e propõe a solução", dica: null }
  ];
  var MAOS = [
    { id: "auto", nome: "Automático", desc: "Só onde a mesa de baixo fica comprimida" },
    { id: "sempre", nome: "Em todas", desc: "Em toda terça/travessa da região" },
    { id: "nunca", nome: "Nunca", desc: "A barra trabalha destravada" }
  ];
  var GRUPOS = { pilar: "Pilares dos pórticos", viga: "Vigas de cobertura", tapamento: "Colunas de tapamento", contravento: "Contraventamento" };

  function face(tipo, portoes) { return { tipo: tipo, bloco: "vedacao-concreto", paredeId: "", alturaAlvenaria: 3, premoldadoId: "", telhaId: "", portoes: portoes || [] }; }
  var PADRAO = {
    v: 1, modelo: "fechado-15x30",
    local: { texto: "", lat: null, lon: null, fonte: "", endereco: "", v0Manual: null, usarV0: false },
    vento: { s1: { tipo: "plano", theta: 10, d: 20 }, categoria: "III", grupoS3: 2 },
    geometria: { vao: 15, comprimento: 30, espacamento: 6, peDireito: 6, inclinacaoPct: 10, aguas: 2, base: "engastada" },
    fechamentos: { frente: face("telha", [{ largura: 4, altura: 4.5, dominante: true }]), fundo: face("telha"), esquerda: face("telha"), direita: face("telha") },
    cobertura: { telhaId: "isoeste-standard-tp40-0,50", extra: 0.10, empocamento: false, filtro: "" },
    perfis: { modo: "auto", familia: "GERDAU", pilar: "", viga: "", tapamento: "", partida: {} },
    acos: { perfil: "ASTM A572 Gr.50", frio: "NBR 6650 CF-26", barra: "ASTM A36" },
    fundacao: { fck: "", A2_A1: 1 },   /* revisão 1.2.149: o fck começa VAZIO ("— informe —"); sem ele a placa fica A CONFIRMAR */
    contraventamento: "auto", maoFrancesa: "auto"
  };
  /* MODELOS PRONTOS — o cliente escolhe e só ajusta */
  function modelo(id, nome, desc, tags, g, faces, extra) { return { id: id, nome: nome, desc: desc, tags: tags, geometria: g, fechamentos: faces, extra: extra || {} }; }
  /* ⚠ (1.2.149, revisão) As BARRAS de todo modelo pronto saem aprovadas; a PLACA DE BASE fica A CONFIRMAR até o
     usuário informar o fck da fundação (o seletor começa vazio — fck "do exemplo" seria valor adotado e liberaria a
     emissão sem o fck real; regra da 1.2.148).
     ⚠ (12/10/2026) Todo modelo pronto precisa SAIR APROVADO com o motor desta versão: um exemplo
     reprovado na primeira tela tira a confiança no resto. Conferidos em Uberlândia (V0 = 34 m/s):
     · uma água 10 × 20 com base ROTULADA reprovava (deslocamento H/300 = 1,11): o otimizador
       alternava a rigidez entre pilar e viga a cada rodada e parava sem fechar. Engastada: 2,7 t;
     · logístico 30 × 60 com pórticos a cada 7,5 m reprovava SÓ na placa de base (1,19 com 50 mm —
       o motor tenta 4 chumbadores, nunca 6 ou 8). A cada 6 m passa (55,9 t, 26 kg/m²). As docas
       ficam no MEIO dos vãos (9, 27 e 45 m): com 7,5 m, as de 15, 30 e 45 m caíam nos pilares.
       Com elas, o X de barra redonda parava na chapa de apoio da porca (1,01 com 50 mm, barra
       Ø 25): o modelo vem com X de cantoneira e a decisão diz o porquê (extra.cvMotivo).
     Quando o motor fechar esses dois casos, os modelos podem voltar a 7,5 m e à base rotulada. */
  var MODELOS = [
    modelo("aberto-12x24", "Cobertura aberta 12 × 24 m", "Pátio coberto, estacionamento ou área de carga: a cobertura sobre pórticos, sem paredes.", ["aberto", "duas águas"],
      { vao: 12, comprimento: 24, espacamento: 6, peDireito: 5, inclinacaoPct: 10, aguas: 2, base: "rotulada" },
      { frente: face("aberto"), fundo: face("aberto"), esquerda: face("aberto"), direita: face("aberto") }),
    modelo("fechado-15x30", "Galpão fechado 15 × 30 m", "O galpão mais comum: telha trapezoidal na cobertura e nas quatro faces, portão de 4 × 4,5 m na frente e bases engastadas.", ["telha", "portão"],
      { vao: 15, comprimento: 30, espacamento: 6, peDireito: 6, inclinacaoPct: 10, aguas: 2, base: "engastada" },
      { frente: face("telha", [{ largura: 4, altura: 4.5, dominante: true }]), fundo: face("telha"), esquerda: face("telha"), direita: face("telha") }),
    modelo("misto-20x40", "Galpão 20 × 40 m — alvenaria + telha", "Comércio e indústria leve: bloco de concreto até 3 m e telha acima, portão de 5 × 5 m na frente, bases engastadas.", ["misto", "bloco"],
      { vao: 20, comprimento: 40, espacamento: 6, peDireito: 7, inclinacaoPct: 10, aguas: 2, base: "engastada" },
      { frente: face("misto", [{ largura: 5, altura: 5, dominante: true }]), fundo: face("misto"), esquerda: face("misto"), direita: face("misto") }),
    modelo("logistico-30x60", "Centro logístico 30 × 60 m", "Pé-direito de 10 m para porta-paletes, pórticos a cada 6 m, base engastada, 3 docas na lateral e portão de 6 × 6 m.", ["logística", "docas"],
      { vao: 30, comprimento: 60, espacamento: 6, peDireito: 10, inclinacaoPct: 8, aguas: 2, base: "engastada" },
      { frente: face("telha", [{ largura: 6, altura: 6, dominante: true }]), fundo: face("telha"),
        esquerda: face("telha", [9, 27, 45].map(function (s) { return { largura: 3, altura: 3.5, posicao: s, dominante: true }; })), direita: face("telha") },
      { grupoS3: 3, contraventamento: "X-cantoneira",
        cvMotivo: "com barra redonda o cálculo chega a Ø 25 mm e a chapa de apoio da porca não passa nem com 50 mm; em cantoneira o contraventamento fecha" }),
    modelo("uma-agua-10x20", "Cobertura de uma água 10 × 20 m", "Telheiro ou garagem de máquinas: uma água com 10 % de caimento, aberta nos quatro lados, bases engastadas.", ["uma água", "aberto"],
      { vao: 10, comprimento: 20, espacamento: 5, peDireito: 4, inclinacaoPct: 10, aguas: 1, base: "engastada" },
      { frente: face("aberto"), fundo: face("aberto"), esquerda: face("aberto"), direita: face("aberto") }),
    modelo("oficina-18x36", "Oficina 18 × 36 m em bloco", "Paredes de bloco de concreto estrutural em toda a altura; o aço leva a cobertura. Portão de 5 × 4,5 m.", ["alvenaria", "oficina"],
      { vao: 18, comprimento: 36, espacamento: 6, peDireito: 6, inclinacaoPct: 10, aguas: 2, base: "engastada" },
      { frente: (function () { var f = face("alvenaria", [{ largura: 5, altura: 4.5, dominante: true }]); f.bloco = "estrutural-concreto"; return f; })(),
        fundo: (function () { var f = face("alvenaria"); f.bloco = "estrutural-concreto"; return f; })(),
        esquerda: (function () { var f = face("alvenaria"); f.bloco = "estrutural-concreto"; return f; })(),
        direita: (function () { var f = face("alvenaria"); f.bloco = "estrutural-concreto"; return f; })() })
  ];

  /* ================================================================ ESTADO (por obra) */
  function chave() { return "orcapro:metal:calc:" + obraId(); }
  function ler() {
    var s = null;
    try { s = JSON.parse(global.localStorage.getItem(chave()) || "null"); } catch (e) { s = null; }
    return s && s.estado ? s : null;
  }
  var tSalvar = null;
  function salvar(imediato) {
    clearTimeout(tSalvar);
    function grava() {
      try {
        var r = UIC.r, ult = r && r.ok ? { aprovado: !!r.aprovado, peso: r.peso, taxa: r.taxa, falhas: r.falhas, perfis: perfisFinais(r), data: new Date().toISOString() } : (UIC.salvo && UIC.salvo.ultimo) || null;
        var o = { v: 1, estado: UIC.est, atualizado: new Date().toISOString(), ultimo: ult };
        global.localStorage.setItem(chave(), JSON.stringify(o));
        UIC.salvo = o; UIC.salvoEm = Date.now();
        var el = doc && doc.querySelector("[data-mc='salvo']"); if (el) el.innerHTML = ico("check", 13) + " Salvo na obra";
      } catch (e) { var el2 = doc && doc.querySelector("[data-mc='salvo']"); if (el2) el2.textContent = "Não gravou no navegador (" + (e && e.name || "erro") + ")"; }
    }
    if (imediato) grava(); else tSalvar = setTimeout(grava, 350);
  }
  function estadoNovo() {
    var e = copia(PADRAO), o = obra();
    if (o && o.local) e.local.texto = String(o.local).slice(0, 160);
    return e;
  }
  function perfisFinais(r) { var g = (r && r.grupos) || {}, o = {}; Object.keys(g).forEach(function (k) { o[k] = g[k].perfil; }); return o; }

  /* ================================================================ PONTE COM OS MOTORES */
  /* o perfil de PARTIDA da família (o otimizador do motor sobe ou desce a partir dele):
     o mais leve da série com altura ≥ vão/50, nunca abaixo de 310 mm.
     ⚠ POR QUE NÃO COMEÇAR MAIS LEVE (medido em 12/10/2026, galpão aberto 12 × 24
       com vento): partindo de W 200 × 15, a 2ª ordem não converge ("estrutura
       instável") e o motor PARA com erro em vez de subir o perfil; partindo de
       W 310 × 32,7 ele fecha em 3 rodadas (5 s) no mais leve que passa. */
  function partida(est) {
    var C = P(), fam = FAMILIAS.filter(function (f) { return f.id === est.perfis.familia; })[0] || FAMILIAS[0];
    if (!C) return {};
    var alvo = Math.max(310, num(est.geometria.vao, 15) * 1000 / 50);
    function leve(serie, dmin, filtro) {
      var l = C.listar(serie).map(function (n) { return C.obter(n); }).filter(function (x) { return x && x.massa > 0 && (!filtro || filtro.test(x.nome)) && (x.forma === "I"); });
      var ok = l.filter(function (x) { return x.d >= dmin; });
      if (!ok.length) { l.sort(function (a, b) { return b.d - a.d || a.massa - b.massa; }); return l[0] ? l[0].nome : null; }
      ok.sort(function (a, b) { return a.massa - b.massa; });
      return ok[0].nome;
    }
    var o = { viga: leve(fam.viga, alvo, fam.filtro), pilar: leve(fam.pilar, alvo, fam.filtro), tapamento: leve("GERDAU", 200, /^W /) };
    var pp = est.perfis.partida || {};
    Object.keys(pp).forEach(function (k) { if (pp[k]) o[k] = pp[k]; });
    return o;
  }
  function perfisDoCalculo(est) {
    if (est.perfis.modo === "manual") return { pilar: est.perfis.pilar || partida(est).pilar, viga: est.perfis.viga || partida(est).viga, tapamento: est.perfis.tapamento || partida(est).tapamento };
    return partida(est);
  }
  function paredeDe(fc) {
    var A = F(); if (!A) return null;
    if (fc.tipo === "premoldado") return A.obter(fc.premoldadoId || A.PADRAO_PAREDE.premoldado);
    if (fc.tipo === "alvenaria" || fc.tipo === "misto") return A.obter(fc.paredeId || A.PADRAO_PAREDE[fc.bloco] || A.PADRAO_PAREDE["vedacao-concreto"]);
    return null;
  }
  function telhaParede(est, fc) { var A = F(); return A ? A.obter(fc.telhaId || est.cobertura.telhaId) : null; }
  function todasAbertas(est) { return FACES.every(function (f) { return (est.fechamentos[f.id] || {}).tipo === "aberto"; }); }

  /* o vento da obra (cache pelo que influi nele) — para mostrar V0, q e a sucção na telha.
     par.vento do contrato: { lat, lon, endereco, categoria, grupoS3, s1 { tipo, theta, d }, v0 } */
  var cacheVento = { k: null, r: null };
  function ventoEntrada(est) {
    var l = est.local, v = est.vento, temLoc = isFinite(num(l.lat, NaN)) && isFinite(num(l.lon, NaN));
    var o = { categoria: v.categoria || "III", grupoS3: num(v.grupoS3, 2), s1: v.s1.tipo === "talude" || v.s1.tipo === "morro" ? { tipo: v.s1.tipo, theta: num(v.s1.theta, 10), d: num(v.s1.d, 20) } : { tipo: v.s1.tipo || "plano" }, endereco: l.endereco || l.texto || "" };
    if (temLoc) { o.lat = num(l.lat); o.lon = num(l.lon); }
    if (l.usarV0 && num(l.v0Manual, 0) > 0) o.v0 = num(l.v0Manual);
    return (temLoc || o.v0) ? o : null;
  }
  function ventoPrevia(est) {
    var W = global.AcoCalcWorker, ve = ventoEntrada(est);
    if (!ve || !W || !V()) return null;
    var par = { geometria: est.geometria, fechamentos: fechamentosMotor(est), vento: ve };
    var k = JSON.stringify(par);
    if (cacheVento.k === k) return cacheVento.r;
    var r = null; try { r = W.calcularVento(par); } catch (e) { r = { ok: false, erros: [e.message] }; }
    cacheVento = { k: k, r: r };
    return r;
  }
  /* as faces no formato do contrato: { tipo, alturaAlvenaria, aberturas: [{ largura, altura, s0, s1, dominante }] }.
     ⚠ A ALVENARIA VAI COMO tipo "alvenaria" (o bloco vai em `bloco`): é o tipo que TODOS os
       motores conhecem — as pranchas só desenham parede de alvenaria com tipo === "alvenaria"
       (js/acopranchas.js) e o memorial só traduz os tipos básicos. O vento trata bloco e
       alvenaria igual (vedação impermeável). */
  var BLOCO_MOTOR = { "vedacao-ceramico": "bloco-ceramico", "vedacao-concreto": "bloco-concreto", "estrutural-concreto": "bloco-concreto" };
  function fechamentosMotor(est) {
    var o = {}, g = est.geometria;
    FACES.forEach(function (f) {
      var x = est.fechamentos[f.id] || face("telha"), oit = f.id === "frente" || f.id === "fundo", comp = oit ? num(g.vao, 15) : num(g.comprimento, 30);
      var fc = { tipo: x.tipo };
      if (x.tipo === "misto") fc.alturaAlvenaria = num(x.alturaAlvenaria, 3);
      if (x.tipo === "alvenaria" || x.tipo === "misto") {
        var pa = paredeDe(x); fc.bloco = BLOCO_MOTOR[x.bloco] || "bloco-concreto"; fc.blocoEstrutural = x.bloco === "estrutural-concreto";
        if (pa) { fc.parede = F().nome(pa); fc.paredePeso = pa.peso; }
      }
      if (x.tipo === "premoldado") { var pm = paredeDe(x); if (pm) { fc.parede = F().nome(pm); fc.paredePeso = pm.peso; } }
      if (x.tipo !== "aberto") fc.aberturas = arr(x.portoes).map(function (p) {
        var L = num(p.largura, 0), A = num(p.altura, 0); if (!(L > 0 && A > 0)) return null;
        var c = p.posicao == null || p.posicao === "" ? comp / 2 : num(p.posicao, comp / 2);
        return { largura: L, altura: A, s0: Math.max(0, c - L / 2), s1: Math.min(comp, c + L / 2), dominante: !!p.dominante };
      }).filter(Boolean);
      o[f.id] = fc;
    });
    return o;
  }
  /* a carga de SERVIÇO na telha e o vão máximo dela na tabela do fabricante */
  function sobrecarga(est) {
    var C = global.AcoCargas; if (!C || !C.sobrecargaCobertura) return { q: 0.25, texto: "NBR 6120:2019, 6.4" };
    try { var s = C.sobrecargaCobertura(num(est.geometria.inclinacaoPct, 10), { empocamentoVerificado: !!est.cobertura.empocamento }); return s && s.ok !== false ? s : { q: 0.5, texto: s && s.motivo || "" }; } catch (e) { return { q: 0.25, texto: "" }; }
  }
  function succaoTelha(Vr) {
    if (!Vr || !Vr.ok) return null;
    var zs = arr(Vr.zonas && Vr.zonas.locais && Vr.zonas.locais.cobertura), m = null;
    zs.forEach(function (z) { var p = num(z.pVedacao, NaN); if (isFinite(p) && (!m || Math.abs(p) > Math.abs(m.p))) m = { p: p, zona: z.zona }; });
    if (!m) { var v = Vr.zonas && Vr.zonas.locais && Vr.zonas.locais.vedacao; if (v && isFinite(num(v.p, NaN))) m = { p: -Math.abs(num(v.p)), zona: "vedação (±2,0)" }; }
    return m;
  }
  /* as zonas de borda do telhado (NBR 6123, Tabela 5) com nome de gente */
  function nomeZona(z) { var m = { oitao: "na faixa do oitão", beiral1: "na faixa do beiral, junto ao oitão", beiral2: "na faixa do beiral", cumeeira: "na faixa da cumeeira" }; return m[z] || (z ? "na zona " + z : ""); }
  function telhaInfo(est) {
    var A = F(), t = A ? A.obter(est.cobertura.telhaId) : null, s = sobrecarga(est), Vr = ventoPrevia(est), sc = succaoTelha(Vr);
    var carga = Math.max(num(s.q, 0.25), sc ? Math.abs(sc.p) : 0), gov = sc && Math.abs(sc.p) > num(s.q, 0.25) ? "vento" : "sobrecarga";
    var vm = t && A ? A.vaoMax(t.id, carga, { uso: "cobertura" }) : null, peso = t && A ? A.peso(t.id) : null;
    var lim = 2.5, vao = vm && vm.vao ? Math.min(vm.vao, lim) : null;
    var incl = num(est.geometria.inclinacaoPct, 10), inclOk = !t || t.inclMin == null || incl + 1e-9 >= t.inclMin;
    return { telha: t, sobrecarga: s, succao: sc, carga: carga, governa: gov, vm: vm, vaoTercas: vao || lim, limite: lim, peso: peso, inclOk: inclOk, semVento: !Vr || !Vr.ok, vento: Vr };
  }
  /* os parâmetros do AcoDimensionar.calcular (contrato em docs/metalica/CONTRATO.md) */
  function parametros(est) {
    var g = est.geometria, ti = telhaInfo(est), t = ti.telha, A = F();
    var pesoFech = 0;
    FACES.forEach(function (f) { var x = est.fechamentos[f.id]; if (x && (x.tipo === "telha" || x.tipo === "misto")) { var tp = telhaParede(est, x), pw = tp && A ? A.peso(tp.id) : null; pesoFech = Math.max(pesoFech, pw && pw.valor ? pw.valor : 0.06); } });
    var par = {
      /* ladoAlto: na uma água o AcoModelo sobe o pilar da DIREITA (x = vão); sem dizer, o AcoVento
         adota o beiral alto à esquerda e o vento sai espelhado em relação ao pórtico */
      geometria: { vao: num(g.vao), comprimento: num(g.comprimento), espacamento: num(g.espacamento), peDireito: num(g.peDireito), inclinacaoPct: num(g.inclinacaoPct), aguas: num(g.aguas, 2) === 1 ? 1 : 2, base: g.base === "engastada" ? "engastada" : "rotulada", tipoPortico: "alma-cheia",
                   ladoAlto: num(g.aguas, 2) === 1 ? "direita" : undefined },
      perfis: perfisDoCalculo(est),
      acos: { perfil: est.acos.perfil, frio: est.acos.frio, barra: est.acos.barra },
      cobertura: { telhaVaoMax: ti.vm && ti.vm.vao ? ti.vm.vao : null, telhaNome: t ? A.nome(t) : "telha", permanenteExtra: num(est.cobertura.extra, 0.1), empocamentoVerificado: !!est.cobertura.empocamento },
      fechamentos: fechamentosMotor(est),
      contraventamento: est.contraventamento || "auto", maoFrancesa: est.maoFrancesa || "auto",
      cargas: { telhaPeso: ti.peso && ti.peso.valor != null ? ti.peso.valor : 0.06, permanenteExtra: num(est.cobertura.extra, 0.1) },
      fundacao: { fck: num(est.fundacao && est.fundacao.fck, null), A2_A1: num(est.fundacao && est.fundacao.A2_A1, 1) }
    };
    if (pesoFech) par.cargas.fechamentoPeso = pesoFech;
    var ve = ventoEntrada(est); if (ve) par.vento = ve;
    return par;
  }
  /* o que falta para calcular (bloqueia) e o que merece atenção (não bloqueia) */
  function validar(est) {
    var g = est.geometria, falta = [], atencao = [];
    function faixa(v, a, b, nome, un) { v = num(v, NaN); if (!(v >= a && v <= b)) falta.push({ passo: 2, texto: nome + " entre " + fmt(a, a % 1 ? 1 : 0) + " e " + fmt(b, 0) + " " + un + "." }); }
    if (!ventoEntrada(est)) falta.push({ passo: 1, texto: "Falta o local da obra: o vento (V0) depende dele." });
    faixa(g.vao, 4, 60, "Vão", "m"); faixa(g.comprimento, 3, 300, "Comprimento", "m"); faixa(g.espacamento, 2, 15, "Espaçamento dos pórticos", "m");
    faixa(g.peDireito, 2.5, 25, "Pé-direito", "m"); faixa(g.inclinacaoPct, 1, 60, "Inclinação do telhado", "%");
    FACES.forEach(function (f) {
      var x = est.fechamentos[f.id];
      if (x && x.tipo === "misto" && !(num(x.alturaAlvenaria, 0) > 0 && num(x.alturaAlvenaria, 0) < num(g.peDireito, 6))) falta.push({ passo: 3, texto: f.nome + ": a alvenaria do misto precisa ficar entre 0 e o pé-direito." });
    });
    var ti = telhaInfo(est);
    if (!ti.telha) falta.push({ passo: 4, texto: "Escolha a telha da cobertura." });
    else {
      if (!ti.inclOk) atencao.push({ passo: 4, texto: "A " + F().nome(ti.telha) + " pede inclinação mínima de " + fmt(ti.telha.inclMin, 1) + " % (o telhado tem " + fmt(num(g.inclinacaoPct), 1) + " %)." });
      if (ti.vm && !ti.vm.vao) atencao.push({ passo: 4, texto: "Telha: " + ti.vm.motivo + ". O sistema limita as terças a " + fmt(ti.limite, 2) + " m." });
      if (ti.semVento) atencao.push({ passo: 1, texto: "Vão da telha escolhido só pela sobrecarga: a sucção do vento entra quando o local estiver definido." });
    }
    if (est.perfis.modo === "manual" && (!est.perfis.pilar || !est.perfis.viga)) atencao.push({ passo: 5, texto: "Sem pilar ou viga escolhidos: o sistema usa os de partida da família." });
    return { falta: falta, atencao: atencao, ok: !falta.length };
  }

  /* ================================================================ DESENHOS (SVG) */
  var nSvg = 0;
  var C = { tinta: "#1d2733", aco: "#c5d0dc", acoL: "#4f6275", dst: "#e9a23b", dstL: "#a86a10", aux: "#8a94a3", cota: "#3f5163", chao: "#d6d1c7", telha: "#a9bccf", telhaL: "#6f86a0", alv: "#dcb592", alvL: "#a97c57", pre: "#c7cbd0", preL: "#8d949c", ceu: "#eef4fa" };
  function abre(w, h, rot, extra) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(rot || "") + '" font-family="Segoe UI, Arial, sans-serif"' + (extra || "") + ">"; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function ln(x1, y1, x2, y2, c, w, d, extra) { return '<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '" stroke="' + (c || C.tinta) + '" stroke-width="' + (w || 1.4) + '"' + (d ? ' stroke-dasharray="' + d + '"' : "") + (extra || "") + "/>"; }
  function tx(x, y, s, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + (o.t || 11) + '" fill="' + (o.c || C.tinta) + '" text-anchor="' + (o.a || "middle") + '"' + (o.p ? ' font-weight="' + o.p + '"' : "") +
      (o.halo !== false ? ' stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"' : "") + (o.rot ? ' transform="rotate(' + o.rot + " " + r1(x) + " " + r1(y) + ')"' : "") + ">" + esc(s) + "</text>";
  }
  function poly(pts, f, s, w, extra) { return '<polygon points="' + pts.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" ") + '" fill="' + f + '" stroke="' + (s || "none") + '" stroke-width="' + (w || 1) + '" stroke-linejoin="round"' + (extra || "") + "/>"; }
  function cotaH(x1, x2, y, t, cor) { cor = cor || C.cota; return ln(x1, y, x2, y, cor, 1) + ln(x1, y - 5, x1, y + 5, cor, 1) + ln(x2, y - 5, x2, y + 5, cor, 1) + ln(x1 - 3, y + 3, x1 + 3, y - 3, cor, 1.4) + ln(x2 - 3, y + 3, x2 + 3, y - 3, cor, 1.4) + tx((x1 + x2) / 2, y - 6, t, { c: cor, t: 13, p: 600 }); }
  function cotaV(x, y1, y2, t, cor, lado) { cor = cor || C.cota; var dx = lado === "d" ? 8 : -8; return ln(x, y1, x, y2, cor, 1) + ln(x - 5, y1, x + 5, y1, cor, 1) + ln(x - 5, y2, x + 5, y2, cor, 1) + ln(x - 3, y1 + 3, x + 3, y1 - 3, cor, 1.4) + ln(x - 3, y2 + 3, x + 3, y2 - 3, cor, 1.4) + tx(x + dx, (y1 + y2) / 2 + 4, t, { c: cor, t: 13, p: 600, a: lado === "d" ? "start" : "end" }); }
  function padroes(p) {
    return "<defs>" +
      '<pattern id="' + p + 'te" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="' + C.telha + '"/><line x1="0" y1="0" x2="0" y2="7" stroke="' + C.telhaL + '" stroke-width="1.2"/></pattern>' +
      '<pattern id="' + p + 'al" width="12" height="8" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="' + C.alv + '"/><path d="M0 4H12M6 0V4M0 4V8M12 4V8" stroke="' + C.alvL + '" stroke-width=".8" fill="none"/></pattern>' +
      '<pattern id="' + p + 'pm" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="' + C.pre + '"/><path d="M0 0V22M0 0H22" stroke="' + C.preL + '" stroke-width="1" fill="none"/><circle cx="7" cy="9" r=".8" fill="' + C.preL + '"/><circle cx="15" cy="15" r=".7" fill="' + C.preL + '"/></pattern>' +
      '<pattern id="' + p + 'ch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="' + C.chao + '"/><line x1="0" y1="0" x2="0" y2="8" stroke="#a89f8f" stroke-width="1"/></pattern>' +
      "</defs>";
  }
  function preenche(p, tipo) { return tipo === "telha" ? "url(#" + p + "te)" : (tipo === "alvenaria" ? "url(#" + p + "al)" : (tipo === "premoldado" ? "url(#" + p + "pm)" : "none")); }

  /* PÓRTICO TÍPICO ao vivo (elevação) — o campo em foco fica âmbar */
  function svgPortico(est, foco) {
    var g = est.geometria, vao = clamp(num(g.vao, 15), 1, 200), H = clamp(num(g.peDireito, 6), 0.5, 80), i = clamp(num(g.inclinacaoPct, 10), 0, 100) / 100, um = num(g.aguas, 2) === 1;
    var hc = um ? H + i * vao : H + i * vao / 2, W = 540, Hs = 300, mx = 86, topo = 30, base = 238;
    var s = Math.min((W - 2 * mx) / vao, (base - topo) / hc), x0 = (W - vao * s) / 2;
    function X(x) { return x0 + x * s; } function Y(y) { return base - y * s; }
    var p = "po" + (++nSvg), o = [abre(W, Hs, "Pórtico típico: vão " + fmt(vao, 2) + " m, pé-direito " + fmt(H, 2) + " m"), padroes(p)];
    var cf = function (k) { return foco === k ? C.dst : C.cota; };
    o.push('<rect x="' + r1(X(0) - 46) + '" y="' + base + '" width="' + r1(vao * s + 92) + '" height="12" fill="url(#' + p + 'ch)"/>' + ln(X(0) - 46, base, X(vao) + 46, base, C.tinta, 1.6));
    var hR = um ? hc : H, tw = 9;
    /* telha (linha clara por cima da viga) */
    var tl = um ? [[X(0) - 6, Y(H) - 9], [X(vao) + 6, Y(hc) - 9]] : [[X(0) - 6, Y(H) - 9], [X(vao / 2), Y(hc) - 9], [X(vao) + 6, Y(H) - 9]];
    o.push('<polyline points="' + tl.map(function (q) { return r1(q[0]) + "," + r1(q[1]); }).join(" ") + '" fill="none" stroke="' + C.telhaL + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 3"/>');
    /* pilares */
    o.push('<rect x="' + r1(X(0) - tw / 2) + '" y="' + r1(Y(H)) + '" width="' + tw + '" height="' + r1(H * s) + '" fill="' + C.aco + '" stroke="' + C.acoL + '" stroke-width="1.4"/>');
    o.push('<rect x="' + r1(X(vao) - tw / 2) + '" y="' + r1(Y(hR)) + '" width="' + tw + '" height="' + r1(hR * s) + '" fill="' + C.aco + '" stroke="' + C.acoL + '" stroke-width="1.4"/>');
    /* vigas de cobertura */
    var vp = um ? [[X(0), Y(H)], [X(vao), Y(hc)]] : [[X(0), Y(H)], [X(vao / 2), Y(hc)], [X(vao), Y(H)]];
    o.push('<polyline points="' + vp.map(function (q) { return r1(q[0]) + "," + r1(q[1]); }).join(" ") + '" fill="none" stroke="' + C.acoL + '" stroke-width="9" stroke-linejoin="round"/>');
    o.push('<polyline points="' + vp.map(function (q) { return r1(q[0]) + "," + r1(q[1]); }).join(" ") + '" fill="none" stroke="' + C.aco + '" stroke-width="6" stroke-linejoin="round"/>');
    /* bases */
    [X(0), X(vao)].forEach(function (xb) {
      if (g.base === "engastada") o.push('<rect x="' + r1(xb - 14) + '" y="' + (base - 4) + '" width="28" height="8" fill="' + C.dst + '" stroke="' + C.dstL + '" stroke-width="1"/>' + ln(xb - 14, base + 4, xb + 14, base + 4, C.dstL, 1.6));
      else o.push(poly([[xb, base - 2], [xb - 9, base + 10], [xb + 9, base + 10]], C.dst, C.dstL, 1.1) + '<circle cx="' + r1(xb) + '" cy="' + (base - 2) + '" r="2.6" fill="#fff" stroke="' + C.dstL + '" stroke-width="1"/>');
    });
    /* cotas */
    o.push(cotaH(X(0), X(vao), base + 34, "vão " + fmt(vao, 2) + " m", cf("geometria.vao")));
    o.push(cotaV(X(0) - 30, Y(H), Y(0), fmt(H, 2) + " m", cf("geometria.peDireito")));
    o.push(ln(um ? X(vao) : X(vao / 2), Y(hc), X(vao) + 30, Y(hc), C.aux, 1, "4 3"));
    o.push(cotaV(X(vao) + 30, Y(hc), Y(0), fmt(hc, 2) + " m", foco === "geometria.inclinacaoPct" ? C.dst : C.cota, "d"));
    o.push(tx(X(vao) + 38, Y(hc) - 6, um ? "beiral alto" : "cumeeira", { a: "start", t: 11, c: "#5d6b7a" }));
    /* inclinação: triângulo de caimento */
    var xi = um ? X(vao * 0.32) : X(vao * 0.22), yi = um ? Y(H + i * vao * 0.32) : Y(H + i * vao * 0.22), di = 34;
    var ci = foco === "geometria.inclinacaoPct" ? C.dst : C.cota;
    o.push('<path d="M' + r1(xi) + " " + r1(yi - 16) + " h" + di + " v" + r1(-di * i) + '" fill="none" stroke="' + ci + '" stroke-width="1"/>' + tx(xi + di / 2, yi - 22, fmt(num(g.inclinacaoPct), 1) + " %", { c: ci, t: 13, p: 700 }));
    o.push(tx(14, 20, "PÓRTICO TÍPICO", { a: "start", t: 12, c: "#5d6b7a", p: 700 }));
    o.push(tx(W - 14, 20, (g.base === "engastada" ? "base engastada" : "base rotulada") + " · " + (um ? "uma água" : "duas águas"), { a: "end", t: 12, c: g.base === "engastada" || foco === "geometria.base" ? C.dstL : "#5d6b7a", p: 600 }));
    o.push("</svg>");
    return o.join("");
  }
  /* PLANTA com os pórticos (o espaçamento real é o que divide o comprimento) */
  function svgPlantaPorticos(est, foco) {
    var g = est.geometria, vao = clamp(num(g.vao, 15), 1, 200), Lt = clamp(num(g.comprimento, 30), 1, 600), e = clamp(num(g.espacamento, 6), 0.5, 50);
    var nV = Math.max(1, Math.round(Lt / e)), esp = Lt / nV, W = 540, Hs = 196, mx = 70, topo = 46, base = 44;
    var s = Math.min((W - 2 * mx) / Lt, (Hs - topo - base) / vao), w = Lt * s, h = vao * s, x0 = (W - w) / 2, y0 = topo + (Hs - topo - base - h) / 2;
    var o = [abre(W, Hs, "Planta: " + (nV + 1) + " pórticos a cada " + fmt(esp, 2) + " m")];
    o.push('<rect x="' + r1(x0) + '" y="' + r1(y0) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="#f3f6f9" stroke="' + C.tinta + '" stroke-width="1.2"/>');
    if (num(g.aguas, 2) !== 1) o.push(ln(x0, y0 + h / 2, x0 + w, y0 + h / 2, C.aux, 1, "10 3 2 3"));
    var passo = nV <= 16 ? 1 : (nV <= 32 ? 2 : 4);
    for (var k = 0; k <= nV; k++) {
      var x = x0 + k * esp * s;
      o.push(ln(x, y0 - 3, x, y0 + h + 3, foco === "geometria.espacamento" ? C.dst : C.acoL, 3));
      if (k % passo === 0 || k === nV) o.push('<circle cx="' + r1(x) + '" cy="' + r1(y0 - 13) + '" r="7.5" fill="#fff" stroke="#8a94a3" stroke-width="1"/>' + tx(x, y0 - 9, String(k + 1), { t: 10, c: "#3f5163", p: 700, halo: false }));
    }
    o.push(cotaH(x0, x0 + w, y0 + h + 26, "comprimento " + fmt(Lt, 2) + " m", foco === "geometria.comprimento" ? C.dst : C.cota));
    o.push(tx(x0 - 10, y0 + h / 2 + 4, fmt(vao, 1) + " m", { a: "end", t: 13, c: foco === "geometria.vao" ? C.dst : C.cota, p: 600 }));
    o.push(tx(14, 16, "PLANTA · " + (nV + 1) + " PÓRTICOS A CADA " + fmt(esp, 2) + " M", { a: "start", t: 12, c: "#5d6b7a", p: 700 }));
    o.push("</svg>");
    return o.join("");
  }
  /* PLANTA DAS FACES (clicável): frente/fundo = oitões; esquerda/direita = laterais */
  function svgPlantaFaces(est, sel) {
    var g = est.geometria, vao = clamp(num(g.vao, 15), 1, 200), Lt = clamp(num(g.comprimento, 30), 1, 600), W = 500, Hs = 330, mx = 70, my = 62;
    var s = Math.min((W - 2 * mx) / Lt, (Hs - 2 * my) / vao), w = Lt * s, h = vao * s, x0 = (W - w) / 2, y0 = (Hs - h) / 2, b = 15;
    var p = "pf" + (++nSvg), o = [abre(W, Hs, "Planta das faces do galpão — clique numa face"), padroes(p)];
    o.push('<rect x="' + r1(x0) + '" y="' + r1(y0) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="#f6f8fb" stroke="#c9d3de" stroke-width="1"/>');
    var nV = Math.max(1, Math.round(Lt / clamp(num(g.espacamento, 6), 0.5, 50)));
    for (var k = 1; k < nV; k++) o.push(ln(x0 + k * w / nV, y0, x0 + k * w / nV, y0 + h, "#c9d3de", 1, "4 4"));
    if (num(g.aguas, 2) !== 1) o.push(ln(x0, y0 + h / 2, x0 + w, y0 + h / 2, C.aux, 1, "10 3 2 3") + tx(x0 + w / 2, y0 + h / 2 - 6, "cumeeira", { t: 10, c: "#7a8696" }));
    else o.push(tx(x0 + w / 2, y0 + h / 2, "caimento ↓ (uma água)", { t: 10.5, c: "#7a8696" }));
    var geo = {
      esquerda: { x: x0, y: y0 - b, w: w, h: b, lx: x0 + w / 2, ly: y0 - b - 9, rot: 0, comp: Lt, eixo: "x", inv: false },
      direita: { x: x0, y: y0 + h, w: w, h: b, lx: x0 + w / 2, ly: y0 + h + b + 18, rot: 0, comp: Lt, eixo: "x", inv: false },
      frente: { x: x0 - b, y: y0, w: b, h: h, lx: x0 - b - 12, ly: y0 + h / 2, rot: -90, comp: vao, eixo: "y", inv: false },
      fundo: { x: x0 + w, y: y0, w: b, h: h, lx: x0 + w + b + 14, ly: y0 + h / 2, rot: 90, comp: vao, eixo: "y", inv: false }
    };
    FACES.forEach(function (f) {
      var q = geo[f.id], x = est.fechamentos[f.id] || face("telha"), on = sel === f.id;
      o.push('<g data-mc-acao="face" data-mc-v="' + f.id + '" style="cursor:pointer" tabindex="0" role="button" aria-pressed="' + on + '" aria-label="' + esc(f.nome + ": " + nomeTipo(x.tipo)) + '">');
      o.push('<rect x="' + r1(q.x - 4) + '" y="' + r1(q.y - 4) + '" width="' + r1(q.w + 8) + '" height="' + r1(q.h + 8) + '" fill="' + (on ? "rgba(233,162,59,.22)" : "transparent") + '" stroke="' + (on ? C.dst : "none") + '" stroke-width="2" rx="5"/>');
      if (x.tipo === "misto") {
        if (q.eixo === "x") o.push('<rect x="' + r1(q.x) + '" y="' + r1(q.y) + '" width="' + r1(q.w) + '" height="' + r1(q.h / 2) + '" fill="url(#' + p + 'te)"/><rect x="' + r1(q.x) + '" y="' + r1(q.y + q.h / 2) + '" width="' + r1(q.w) + '" height="' + r1(q.h / 2) + '" fill="url(#' + p + 'al)"/>');
        else o.push('<rect x="' + r1(q.x) + '" y="' + r1(q.y) + '" width="' + r1(q.w / 2) + '" height="' + r1(q.h) + '" fill="url(#' + p + 'te)"/><rect x="' + r1(q.x + q.w / 2) + '" y="' + r1(q.y) + '" width="' + r1(q.w / 2) + '" height="' + r1(q.h) + '" fill="url(#' + p + 'al)"/>');
        o.push('<rect x="' + r1(q.x) + '" y="' + r1(q.y) + '" width="' + r1(q.w) + '" height="' + r1(q.h) + '" fill="none" stroke="' + C.tinta + '" stroke-width="1.1"/>');
      } else if (x.tipo === "aberto") o.push('<rect x="' + r1(q.x) + '" y="' + r1(q.y) + '" width="' + r1(q.w) + '" height="' + r1(q.h) + '" fill="#fff" stroke="' + C.aux + '" stroke-width="1.2" stroke-dasharray="5 4"/>');
      else o.push('<rect x="' + r1(q.x) + '" y="' + r1(q.y) + '" width="' + r1(q.w) + '" height="' + r1(q.h) + '" fill="' + preenche(p, x.tipo) + '" stroke="' + C.tinta + '" stroke-width="1.1"/>');
      /* portões: vão branco na faixa */
      if (x.tipo !== "aberto") arr(x.portoes).forEach(function (pt) {
        var L = num(pt.largura, 0); if (!(L > 0)) return;
        var c = pt.posicao == null || pt.posicao === "" ? q.comp / 2 : num(pt.posicao, q.comp / 2), a = clamp(c - L / 2, 0, q.comp), z = clamp(c + L / 2, 0, q.comp);
        if (q.eixo === "x") o.push('<rect x="' + r1(q.x + a * s) + '" y="' + r1(q.y - 1) + '" width="' + r1((z - a) * s) + '" height="' + r1(q.h + 2) + '" fill="#fff" stroke="' + (pt.dominante ? C.dstL : C.tinta) + '" stroke-width="1.2"/>');
        else o.push('<rect x="' + r1(q.x - 1) + '" y="' + r1(q.y + a * s) + '" width="' + r1(q.w + 2) + '" height="' + r1((z - a) * s) + '" fill="#fff" stroke="' + (pt.dominante ? C.dstL : C.tinta) + '" stroke-width="1.2"/>');
      });
      o.push(tx(q.lx, q.ly + (q.rot ? 0 : 0), f.nome.toUpperCase() + " · " + nomeTipo(x.tipo).toLowerCase(), { t: 11, p: 700, c: on ? C.dstL : "#3f5163", rot: q.rot || 0 }));
      o.push("</g>");
    });
    o.push(cotaH(x0, x0 + w, Hs - 8, fmt(Lt, 1) + " m", "#7a8696"));
    o.push("</svg>");
    return o.join("");
  }
  function nomeTipo(t) { var x = TIPOS_FACE.filter(function (k) { return k.id === t; })[0]; return x ? x.nome : t; }
  /* ELEVAÇÃO da face escolhida (alvenaria/telha/portões na altura real) */
  function svgFace(est, fid) {
    var g = est.geometria, x = est.fechamentos[fid] || face("telha"), vao = clamp(num(g.vao, 15), 1, 200), Lt = clamp(num(g.comprimento, 30), 1, 600);
    var H = clamp(num(g.peDireito, 6), 0.5, 80), i = clamp(num(g.inclinacaoPct, 10), 0, 100) / 100, um = num(g.aguas, 2) === 1, oit = fid === "frente" || fid === "fundo";
    var comp = oit ? vao : Lt, hMax = oit ? (um ? H + i * vao : H + i * vao / 2) : (um && fid === "direita" ? H + i * vao : H);
    var W = 500, Hs = 220, mx = 34, my = 28, s = Math.min((W - 2 * mx) / comp, (Hs - my - 40) / hMax), x0 = (W - comp * s) / 2, base = Hs - 34;
    function X(u) { return x0 + u * s; } function Y(y) { return base - y * s; }
    var p = "fe" + (++nSvg), o = [abre(W, Hs, "Elevação: " + fid), padroes(p)];
    var contorno = oit ? (um ? [[0, 0], [comp, 0], [comp, H + i * vao], [0, H]] : [[0, 0], [comp, 0], [comp, H], [comp / 2, H + i * vao / 2], [0, H]]) : [[0, 0], [comp, 0], [comp, hMax], [0, hMax]];
    var pts = contorno.map(function (q) { return [X(q[0]), Y(q[1])]; });
    if (x.tipo === "aberto") o.push(poly(pts, "#fff", C.aux, 1.2, ' stroke-dasharray="6 4"'));
    else if (x.tipo === "misto") {
      var ha = clamp(num(x.alturaAlvenaria, 3), 0, H);
      o.push(poly(pts, "url(#" + p + "te)", C.tinta, 1.2));
      o.push('<rect x="' + r1(X(0)) + '" y="' + r1(Y(ha)) + '" width="' + r1(comp * s) + '" height="' + r1(ha * s) + '" fill="url(#' + p + 'al)" stroke="' + C.tinta + '" stroke-width="1.2"/>');
      o.push(cotaV(X(comp) + 16, Y(ha), Y(0), "h = " + fmt(ha, 2) + " m", C.dstL, "d"));
    } else o.push(poly(pts, preenche(p, x.tipo), C.tinta, 1.2));
    /* pilares (lateral: pórticos; oitão: os dois cantos) */
    var nV = Math.max(1, Math.round(Lt / clamp(num(g.espacamento, 6), 0.5, 50)));
    var cols = oit ? [0, comp] : (function () { var c = []; for (var k = 0; k <= nV; k++) c.push(k * Lt / nV); return c; })();
    cols.forEach(function (u) { o.push(ln(X(u), Y(0), X(u), Y(oit ? (u > 0 && um ? H + i * vao : H) : hMax), C.acoL, x.tipo === "aberto" ? 3.2 : 1.6, x.tipo === "aberto" ? null : "3 3")); });
    if (x.tipo !== "aberto") arr(x.portoes).forEach(function (pt, j) {
      var L = num(pt.largura, 0), A = num(pt.altura, 0); if (!(L > 0 && A > 0)) return;
      var c = pt.posicao == null || pt.posicao === "" ? comp / 2 : num(pt.posicao, comp / 2), a = clamp(c - L / 2, 0, comp), z = clamp(c + L / 2, 0, comp);
      o.push('<rect x="' + r1(X(a)) + '" y="' + r1(Y(Math.min(A, hMax))) + '" width="' + r1((z - a) * s) + '" height="' + r1(Math.min(A, hMax) * s) + '" fill="#fff" stroke="' + (pt.dominante ? C.dstL : C.tinta) + '" stroke-width="1.4"/>');
      o.push(tx(X((a + z) / 2), Y(Math.min(A, hMax) / 2) + 4, fmt(L, 1) + " × " + fmt(A, 1), { t: 10.5, p: 700, c: pt.dominante ? C.dstL : C.cota }));
    });
    o.push(ln(X(0) - 20, base, X(comp) + 20, base, C.tinta, 1.6));
    o.push(cotaH(X(0), X(comp), base + 22, fmt(comp, 2) + " m"));
    o.push(tx(12, 16, "ELEVAÇÃO — " + (FACES.filter(function (f) { return f.id === fid; })[0] || {}).nome.toUpperCase(), { a: "start", t: 10.5, c: "#5d6b7a", p: 700 }));
    o.push("</svg>");
    return o.join("");
  }
  /* GALPÃO EM 3D (axonometria simples, pintor por profundidade) — modelos prontos e revisão.
     Cada polígono leva o seu acabamento (nervuras da telha, fiadas da alvenaria, juntas do
     pré-moldado) desenhado logo depois dele; os pórticos só aparecem onde a face é ABERTA
     (dentro do galpão fechado eles ficam escondidos, e a viga sob a telha nunca aparece). */
  function svgGalpao3D(est, W, Hs, rot) {
    var g = est.geometria, vao = clamp(num(g.vao, 15), 1, 200), Lt = clamp(num(g.comprimento, 30), 1, 600), H = clamp(num(g.peDireito, 6), 0.5, 80);
    var i = clamp(num(g.inclinacaoPct, 10), 0, 100) / 100, um = num(g.aguas, 2) === 1, hc = um ? H + i * vao : H + i * vao / 2;
    var vv = [-0.78, 0.62, -1.0], nv = Math.sqrt(vv[0] * vv[0] + vv[1] * vv[1] + vv[2] * vv[2]); vv = vv.map(function (a) { return a / nv; });
    var f = [-vv[0], -vv[1], -vv[2]], r = [-f[2], 0, f[0]], nr = Math.sqrt(r[0] * r[0] + r[2] * r[2]); r = [r[0] / nr, 0, r[2] / nr];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    function pr(X, Y, Z) { var q = [X - vao / 2, Y, Z - Lt / 2]; return [q[0] * r[0] + q[2] * r[2], -(q[0] * u[0] + q[1] * u[1] + q[2] * u[2]), q[0] * f[0] + q[1] * f[1] + q[2] * f[2]]; }
    function yTop(x) { return um ? H + i * x : H + i * Math.min(x, vao - x); }
    var itens = [];
    function add(pts3, fill, stroke, deco, decoCor) {
      var p2 = pts3.map(function (q) { return pr(q[0], q[1], q[2]); }), d = 0; p2.forEach(function (q) { d += q[2]; });
      itens.push({ t: "p", p: p2, d: d / p2.length, f: fill, s: stroke || "rgba(29,39,51,.55)", deco: (deco || []).map(function (sg) { return [pr(sg[0][0], sg[0][1], sg[0][2]), pr(sg[1][0], sg[1][1], sg[1][2])]; }), dc: decoCor });
    }
    function linha(a3, b3) { var a = pr(a3[0], a3[1], a3[2]), b = pr(b3[0], b3[1], b3[2]); itens.push({ t: "l", a: a, b: b, d: (a[2] + b[2]) / 2 }); }
    function passos(L, alvo) { var n = Math.max(2, Math.round(L / alvo)), o = []; for (var k = 1; k < n; k++) o.push(L * k / n); return o; }
    var COR = { telha: ["#b9cadb", "#9db2c7"], alvenaria: ["#dfbb97", "#c9a07b"], premoldado: ["#cfd3d8", "#b6bbc1"] };
    var nerv = "rgba(64,86,110,.35)", fiada = "rgba(122,80,46,.33)", junta = "rgba(90,98,108,.45)";
    function painel(tipo, lado, pts, eixo, y0, y1, comp, gable) {
      /* tipo: telha | alvenaria | premoldado; eixo: "x" (oitão) ou "z" (lateral) */
      var c = COR[tipo] || COR.telha, cor = c[lado], deco = [], dc = nerv;
      if (tipo === "telha") passos(comp, 0.9).forEach(function (s) { var yt = gable ? Math.max(y0, Math.min(y1, gable(s))) : y1; if (yt > y0 + 0.05) deco.push(eixo === "x" ? [[s, y0, pts.Z], [s, yt, pts.Z]] : [[pts.X, y0, s], [pts.X, yt, s]]); });
      else if (tipo === "alvenaria") {
        dc = fiada;
        for (var y = y0 + 0.4; y < y1 - 0.05; y += 0.4) {
          if (eixo !== "x") { deco.push([[pts.X, y, 0], [pts.X, y, comp]]); continue; }
          /* no oitão, acima do beiral a fiada vai só até a linha do telhado */
          var xa = 0, xb = comp;
          if (y > H) { var dx = (y - H) / (i || 1e-9); if (um) xa = dx; else { xa = dx; xb = comp - dx; } }
          if (xb - xa > 0.05) deco.push([[xa, y, pts.Z], [xb, y, pts.Z]]);
        }
      }
      else if (tipo === "premoldado") { dc = junta; passos(comp, 2.5).forEach(function (s) { var yt = gable ? Math.max(y0, Math.min(y1, gable(s))) : y1; deco.push(eixo === "x" ? [[s, y0, pts.Z], [s, yt, pts.Z]] : [[pts.X, y0, s], [pts.X, yt, s]]); }); }
      add(pts.poly, cor, null, deco, dc);
    }
    FACES.forEach(function (fc) {
      var x = est.fechamentos[fc.id] || face("telha"), t = x.tipo; if (t === "aberto") return;
      var ha = t === "misto" ? clamp(num(x.alturaAlvenaria, 3), 0, H) : 0, lado = fc.id === "frente" || fc.id === "fundo" ? 0 : 1;
      if (fc.id === "frente" || fc.id === "fundo") {
        var Z = fc.id === "frente" ? 0 : Lt, topo = um ? [[vao, H + i * vao, Z], [0, H, Z]] : [[vao, H, Z], [vao / 2, hc, Z], [0, H, Z]];
        var gab = function (s) { return yTop(s); };
        if (t === "misto") { painel("alvenaria", 0, { Z: Z, poly: [[0, 0, Z], [vao, 0, Z], [vao, ha, Z], [0, ha, Z]] }, "x", 0, ha, vao); painel("telha", 0, { Z: Z, poly: [[0, ha, Z], [vao, ha, Z]].concat(topo) }, "x", ha, hc, vao, gab); }
        else painel(t, 0, { Z: Z, poly: [[0, 0, Z], [vao, 0, Z]].concat(topo) }, "x", 0, hc, vao, gab);
      } else {
        var X = fc.id === "esquerda" ? 0 : vao, ht = yTop(X);
        if (t === "misto") { painel("alvenaria", 1, { X: X, poly: [[X, 0, 0], [X, 0, Lt], [X, ha, Lt], [X, ha, 0]] }, "z", 0, ha, Lt); painel("telha", 1, { X: X, poly: [[X, ha, 0], [X, ha, Lt], [X, ht, Lt], [X, ht, 0]] }, "z", ha, ht, Lt); }
        else painel(t, lado, { X: X, poly: [[X, 0, 0], [X, 0, Lt], [X, ht, Lt], [X, ht, 0]] }, "z", 0, ht, Lt);
      }
    });
    /* cobertura: nervuras da telha descendo a água (do beiral à cumeeira) */
    var rib = passos(Lt, 0.8);
    if (um) add([[0, H, 0], [vao, hc, 0], [vao, hc, Lt], [0, H, Lt]], "#7f97b0", "rgba(29,39,51,.6)", rib.map(function (z) { return [[0, H, z], [vao, hc, z]]; }), "rgba(255,255,255,.22)");
    else {
      add([[0, H, 0], [vao / 2, hc, 0], [vao / 2, hc, Lt], [0, H, Lt]], "#8ba2b9", "rgba(29,39,51,.6)", rib.map(function (z) { return [[0, H, z], [vao / 2, hc, z]]; }), "rgba(255,255,255,.24)");
      add([[vao / 2, hc, 0], [vao, H, 0], [vao, H, Lt], [vao / 2, hc, Lt]], "#6f879f", "rgba(29,39,51,.6)", rib.map(function (z) { return [[vao / 2, hc, z], [vao, H, z]]; }), "rgba(255,255,255,.16)");
    }
    /* pórticos onde a face é aberta: pilares das laterais abertas; o pórtico inteiro no oitão aberto */
    var nV = Math.max(1, Math.round(Lt / clamp(num(g.espacamento, 6), 0.5, 50)));
    var ab = {}; FACES.forEach(function (fc) { ab[fc.id] = (est.fechamentos[fc.id] || {}).tipo === "aberto"; });
    for (var k = 0; k <= nV; k++) {
      var z = k * Lt / nV;
      if (ab.esquerda || (k === 0 && ab.frente) || (k === nV && ab.fundo)) linha([0, 0, z], [0, yTop(0), z]);
      if (ab.direita || (k === 0 && ab.frente) || (k === nV && ab.fundo)) linha([vao, 0, z], [vao, yTop(vao), z]);
    }
    itens.sort(function (a, b) { return b.d - a.d; });
    var xs = [], ys = [];
    itens.forEach(function (q) { if (q.t === "p") q.p.forEach(function (t) { xs.push(t[0]); ys.push(t[1]); }); else { xs.push(q.a[0], q.b[0]); ys.push(q.a[1], q.b[1]); } });
    var g0 = pr(0, 0, 0), g1 = pr(vao, 0, 0), g2 = pr(vao, 0, Lt), g3 = pr(0, 0, Lt);
    [g0, g1, g2, g3].forEach(function (t) { xs.push(t[0]); ys.push(t[1]); });
    var mnx = Math.min.apply(null, xs), mxx = Math.max.apply(null, xs), mny = Math.min.apply(null, ys), mxy = Math.max.apply(null, ys), pad = 14;
    var s = Math.min((W - 2 * pad) / (mxx - mnx || 1), (Hs - 2 * pad) / (mxy - mny || 1)), ox = (W - (mxx - mnx) * s) / 2 - mnx * s, oy = (Hs - (mxy - mny) * s) / 2 - mny * s;
    function P2(t) { return r1(ox + t[0] * s) + "," + r1(oy + t[1] * s); }
    var o = [abre(W, Hs, rot || "Galpão em perspectiva")];
    o.push('<polygon points="' + [g0, g1, g2, g3].map(function (t) { return r1(ox + t[0] * s + 7) + "," + r1(oy + t[1] * s + 6); }).join(" ") + '" fill="rgba(15,39,64,.10)"/>');
    o.push('<polygon points="' + [g0, g1, g2, g3].map(P2).join(" ") + '" fill="#e8ecf0" stroke="#c9d1da" stroke-width="1"/>');
    itens.forEach(function (q) {
      if (q.t === "p") {
        o.push('<polygon points="' + q.p.map(P2).join(" ") + '" fill="' + q.f + '" stroke="' + q.s + '" stroke-width=".9" stroke-linejoin="round"/>');
        if (q.deco.length) o.push('<path d="' + q.deco.map(function (sg) { return "M" + P2(sg[0]).replace(",", " ") + "L" + P2(sg[1]).replace(",", " "); }).join("") + '" stroke="' + q.dc + '" stroke-width=".8" fill="none"/>');
      } else o.push('<line x1="' + r1(ox + q.a[0] * s) + '" y1="' + r1(oy + q.a[1] * s) + '" x2="' + r1(ox + q.b[0] * s) + '" y2="' + r1(oy + q.b[1] * s) + '" stroke="#4f6275" stroke-width="2.2" stroke-linecap="round"/>');
    });
    o.push("</svg>");
    return o.join("");
  }
  /* ícones das escolhas (S1, rugosidade, uso, telha) */
  function vento3(y0) { var s = ""; [0, 12, 24].forEach(function (d, k) { s += '<path d="M8 ' + (y0 + d) + " h" + (26 - k * 3) + '" stroke="#0d6ebd" stroke-width="1.6" fill="none" marker-end="url(#mcSeta)"/>'; }); return s; }
  var SETA = '<defs><marker id="mcSeta" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6z" fill="#0d6ebd"/></marker></defs>';
  function casinha(x, y, w, h, cor) { return '<rect x="' + x + '" y="' + (y - h) + '" width="' + w + '" height="' + h + '" fill="' + (cor || "#c5d0dc") + '" stroke="#4f6275" stroke-width="1"/><path d="M' + (x - 2) + " " + (y - h) + " L" + (x + w / 2) + " " + (y - h - w * 0.35) + " L" + (x + w + 2) + " " + (y - h) + '" fill="#e9a23b" stroke="#a86a10" stroke-width="1"/>'; }
  function svgS1(t) {
    var o = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 76" role="img" aria-label="' + t + '">' + SETA + '<rect width="140" height="76" fill="#f1f6fb"/>';
    if (t === "plano") o += '<path d="M0 60 H140 V76 H0Z" fill="#cfe0c3"/>' + casinha(78, 60, 26, 14) + vento3(18);
    else if (t === "talude") o += '<path d="M0 66 L48 66 L82 36 L140 36 V76 H0Z" fill="#cfe0c3" stroke="#7f9a6a"/>' + casinha(96, 36, 22, 12) + vento3(10);
    else if (t === "morro") o += '<path d="M0 68 C30 66 46 30 76 30 C104 30 118 66 140 68 V76 H0Z" fill="#cfe0c3" stroke="#7f9a6a"/>' + casinha(66, 31, 20, 11) + vento3(6);
    else o += '<path d="M0 22 C30 24 42 62 70 62 C98 62 110 24 140 22 V76 H0Z" fill="#cfe0c3" stroke="#7f9a6a"/>' + casinha(60, 62, 20, 11) + '<path d="M8 12 h40" stroke="#0d6ebd" stroke-width="1.6" marker-end="url(#mcSeta)"/><path d="M60 8 h44" stroke="#0d6ebd" stroke-width="1.6" marker-end="url(#mcSeta)"/>';
    return o + "</svg>";
  }
  function svgRug(c) {
    var o = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 70" role="img" aria-label="Categoria ' + c + '"><rect width="140" height="70" fill="#f1f6fb"/>', y = 56;
    if (c === "I") { o += '<rect y="50" width="140" height="20" fill="#bcd7ee"/>'; for (var k = 0; k < 6; k++) o += '<path d="M' + (6 + k * 23) + " " + (58 + (k % 2) * 5) + ' q5 -4 10 0 t10 0" fill="none" stroke="#5b8fbf" stroke-width="1.2"/>'; }
    else {
      o += '<rect y="' + y + '" width="140" height="' + (70 - y) + '" fill="#d8e5cc"/>';
      if (c === "II") { [20, 70, 112].forEach(function (x) { o += '<circle cx="' + x + '" cy="' + (y - 3) + '" r="3.2" fill="#7fa36a"/>'; }); }
      if (c === "III") { o += casinha(14, y, 16, 9) + casinha(62, y, 18, 10) + casinha(108, y, 14, 8) + '<rect x="38" y="' + (y - 5) + '" width="16" height="5" fill="#9cba84"/>' + '<rect x="88" y="' + (y - 4) + '" width="12" height="4" fill="#9cba84"/>'; }
      if (c === "IV") { for (var j = 0; j < 9; j++) o += j % 3 === 2 ? '<circle cx="' + (8 + j * 15) + '" cy="' + (y - 9) + '" r="7" fill="#7fa36a"/>' : casinha(2 + j * 15, y, 12, 10 + (j % 2) * 6, "#cdd6df"); }
      if (c === "V") { [[4, 34], [20, 46], [36, 28], [52, 50], [70, 40], [88, 52], [104, 30], [120, 44]].forEach(function (b) { o += '<rect x="' + b[0] + '" y="' + (y - b[1]) + '" width="14" height="' + b[1] + '" fill="#b9c6d3" stroke="#4f6275" stroke-width="1"/>'; for (var w = y - b[1] + 5; w < y - 4; w += 7) o += '<rect x="' + (b[0] + 3) + '" y="' + w + '" width="8" height="2.4" fill="#eef3f8"/>'; }); }
    }
    return o + "</svg>";
  }
  function svgUso(g) {
    var o = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44" role="img" aria-label="Grupo ' + g + '"><rect width="64" height="44" rx="6" fill="#f1f6fb"/>';
    if (g === 1) o += '<rect x="14" y="12" width="36" height="26" fill="#fff" stroke="#4f6275"/><rect x="29" y="16" width="6" height="16" fill="#d61f26"/><rect x="24" y="21" width="16" height="6" fill="#d61f26"/>';
    if (g === 2) o += casinha(8, 38, 18, 13) + '<rect x="32" y="20" width="26" height="18" fill="#c5d0dc" stroke="#4f6275"/><rect x="50" y="10" width="5" height="10" fill="#4f6275"/>';
    if (g === 3) o += '<path d="M8 38 V22 L24 14 L40 22 V38Z" fill="#c5d0dc" stroke="#4f6275"/><rect x="44" y="14" width="12" height="24" rx="5" fill="#dfe6ee" stroke="#4f6275"/>';
    if (g === 4) o += '<path d="M10 34 l6 -18 l8 0 l6 18 l8 -18 l8 0 l6 18" fill="none" stroke="#4f6275" stroke-width="2"/>';
    if (g === 5) o += '<path d="M14 38 V12 H46" fill="none" stroke="#e9a23b" stroke-width="2.4"/><path d="M46 12 V22" stroke="#4f6275" stroke-width="1.2"/><rect x="22" y="26" width="14" height="12" fill="#c5d0dc" stroke="#4f6275" stroke-dasharray="3 2"/>';
    return o + "</svg>";
  }
  function svgTelha(gr) {
    var o = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 54" role="img" aria-label="Perfil da telha"><rect width="180" height="54" fill="#f6f9fc"/>', d = "";
    if (gr === "trapezoidal" || gr === "generica") { d = "M6 38"; for (var x = 6; x < 170; x += 33) d += " h9 l6 -16 h12 l6 16"; o += '<path d="' + d + '" fill="none" stroke="#4f6275" stroke-width="2.4" stroke-linejoin="round"/>'; }
    else if (gr === "ondulada" || gr === "fibrocimento") { d = "M6 32"; for (var x2 = 6; x2 < 170; x2 += 24) d += " q6 -14 12 0 t12 0"; o += '<path d="' + d + '" fill="none" stroke="' + (gr === "fibrocimento" ? "#8d949c" : "#4f6275") + '" stroke-width="' + (gr === "fibrocimento" ? 5 : 2.4) + '" stroke-linecap="round"/>'; }
    else if (gr === "sanduiche") { d = "M6 24"; for (var x3 = 6; x3 < 170; x3 += 33) d += " h9 l6 -12 h12 l6 12"; o += '<path d="M6 24 H174 V44 H6Z" fill="#f7e7c4"/><path d="' + d + '" fill="none" stroke="#4f6275" stroke-width="2.2"/><path d="M6 44 H174" stroke="#4f6275" stroke-width="2.2"/><text x="90" y="39" font-size="9" text-anchor="middle" fill="#a86a10">núcleo isolante</text>'; }
    else if (gr === "zipada") { o += '<path d="M6 38 H40 v-18 h4 v18 H84 v-18 h4 v18 H128 v-18 h4 v18 H174" fill="none" stroke="#4f6275" stroke-width="2.4" stroke-linejoin="round"/>'; }
    return o + "</svg>";
  }
  /* desenho do carregamento (animado) enquanto calcula */
  function svgCalculando() {
    return '<svg class="mc-anim" viewBox="0 0 260 130" role="img" aria-label="Calculando"><path d="M20 112 H240" stroke="#c9d3de" stroke-width="2"/>' +
      '<path class="mc-tr" d="M50 112 V60 L130 30 L210 60 V112" fill="none" stroke="#0d6ebd" stroke-width="5" stroke-linejoin="round"/>' +
      '<path class="mc-tr2" d="M50 112 V64 L130 36 L210 64 V112" fill="none" stroke="#e9a23b" stroke-width="2" stroke-dasharray="4 5" stroke-linejoin="round"/>' +
      '<circle cx="130" cy="30" r="5" fill="#e9a23b"/></svg>';
  }

  /* ================================================================ ESTILO */
  function estilo() {
    if (!doc || doc.getElementById("mc-css")) return;
    var st = doc.createElement("style"); st.id = "mc-css";
    st.textContent = [
      ".mc-veu{position:fixed;inset:0;z-index:49;background:rgba(9,20,33,.5);display:flex;align-items:center;justify-content:center;padding:18px;animation:mcIn .16s ease}",
      "@keyframes mcIn{from{opacity:0}to{opacity:1}}",
      ".mc-jan{--mc-bg:#f3f6fa;--mc-sup:#fff;--mc-sup2:#eef3f8;--mc-linha:#d8e1ea;--mc-linha2:#bfccd9;--mc-tx:#13202e;--mc-tx2:#55677a;--mc-navy:#0f2740;--mc-aco:#0d6ebd;--mc-ambar:#e9a23b;--mc-ambar2:#a86a10;--mc-ok:#15803d;--mc-aviso:#aa6200;--mc-erro:#c81e25;",
      "width:min(1240px,100%);height:min(840px,100%);display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--mc-bg);border-radius:16px;overflow:hidden;color:var(--mc-tx);",
      "font-family:var(--fonte,'Segoe UI',system-ui,sans-serif);font-size:13.5px;line-height:1.45;box-shadow:0 30px 90px rgba(4,12,24,.5),0 0 0 1px rgba(255,255,255,.05);animation:mcPop .2s cubic-bezier(.16,1,.3,1)}",
      "@keyframes mcPop{from{transform:translateY(8px) scale(.99);opacity:.6}to{transform:none;opacity:1}}",
      "[data-tema='dark'] .mc-jan{--mc-bg:#0e1824;--mc-sup:#142130;--mc-sup2:#1b2b3c;--mc-linha:#28394b;--mc-linha2:#3a4f65;--mc-tx:#e3ecf5;--mc-tx2:#9db0c4}",
      ".mc-jan *{box-sizing:border-box} .mc-jan:focus{outline:none}",
      ".mc-cab{display:flex;align-items:center;gap:14px;padding:13px 18px 13px 20px;background:linear-gradient(120deg,#0f2740 0%,#173a5e 62%,#1d4a74 100%);color:#fff;position:relative}",
      ".mc-cab::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#e9a23b,#f3c26f 40%,transparent 75%)}",
      ".mc-logo{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.1);display:grid;place-items:center;flex:none}",
      ".mc-cab h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.2px;color:#fff}",
      ".mc-cab p{margin:1px 0 0;font-size:12px;color:#a9c3dc}",
      ".mc-cab .mc-esp{flex:1}",
      ".mc-cb{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#e6eff8;font:600 12.5px inherit;cursor:pointer}",
      ".mc-cb:hover{background:rgba(255,255,255,.14)} .mc-cb svg{stroke:currentColor} .mc-cb.x{width:34px;padding:0;justify-content:center}",
      ".mc-corpo{display:grid;grid-template-columns:244px minmax(0,1fr);min-height:0}",
      ".mc-corpo.cheio{grid-template-columns:minmax(0,1fr)}",
      ".mc-trilho{background:var(--mc-sup);border-right:1px solid var(--mc-linha);padding:14px 10px;overflow:auto;display:flex;flex-direction:column;gap:2px}",
      ".mc-trilho .mc-tt{font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--mc-tx2);padding:4px 10px 8px}",
      ".mc-passo{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start;width:100%;text-align:left;background:none;border:0;border-radius:10px;padding:9px 10px;cursor:pointer;color:inherit;font:inherit;position:relative}",
      ".mc-passo:hover{background:var(--mc-sup2)}",
      ".mc-passo .mc-n{width:28px;height:28px;border-radius:50%;border:2px solid var(--mc-linha2);display:grid;place-items:center;font-weight:700;font-size:12.5px;color:var(--mc-tx2);background:var(--mc-sup)}",
      ".mc-passo.feito .mc-n{border-color:var(--mc-ok);color:var(--mc-ok);background:#e9f6ee}",
      ".mc-passo.ativo{background:#e7f0f9} [data-tema='dark'] .mc-passo.ativo{background:#1d3248}",
      ".mc-passo.ativo .mc-n{border-color:var(--mc-navy);background:var(--mc-navy);color:#fff}",
      ".mc-passo.ativo::before{content:'';position:absolute;left:-10px;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--mc-ambar)}",
      ".mc-passo b{display:block;font-size:13.5px;font-weight:650;color:var(--mc-tx)} .mc-passo small{display:block;font-size:11.5px;color:var(--mc-tx2);margin-top:1px;line-height:1.35}",
      ".mc-passo.falta small{color:var(--mc-aviso)}",
      ".mc-trilho .mc-rodape{margin-top:auto;padding:12px 10px 4px;font-size:11.5px;color:var(--mc-tx2);border-top:1px dashed var(--mc-linha)}",
      ".mc-palco{overflow:auto;padding:22px 26px 34px;min-height:0;scroll-behavior:smooth}",
      ".mc-ph{display:flex;align-items:flex-end;gap:16px;margin:0 0 16px}",
      ".mc-ph h3{margin:0;font-size:21px;font-weight:700;letter-spacing:-.3px} .mc-ph p{margin:3px 0 0;color:var(--mc-tx2);font-size:13px;max-width:760px}",
      ".mc-ph .mc-cont{margin-left:auto;font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mc-tx2);white-space:nowrap}",
      ".mc-duas{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);gap:18px;align-items:start}",
      ".mc-vivo{position:sticky;top:0}",
      ".mc-card{background:var(--mc-sup);border:1px solid var(--mc-linha);border-radius:13px;padding:15px 17px;margin:0 0 14px;box-shadow:0 1px 2px rgba(16,32,48,.04)}",
      ".mc-card>h4{margin:0 0 3px;font-size:14.5px;font-weight:700;display:flex;align-items:center;gap:8px}",
      ".mc-card>h4 .mc-tag{margin-left:auto}",
      ".mc-exp{margin:0 0 12px;font-size:12.5px;color:var(--mc-tx2)}",
      ".mc-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px 14px}",
      ".mc-campo{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".mc-campo>label{font-size:12px;font-weight:650;color:var(--mc-tx2);display:flex;align-items:center;gap:6px}",
      ".mc-in{display:flex;align-items:stretch;border:1px solid var(--mc-linha2);border-radius:9px;background:var(--mc-sup);overflow:hidden;transition:border-color .12s,box-shadow .12s}",
      ".mc-in:focus-within{border-color:var(--mc-aco);box-shadow:0 0 0 3px rgba(13,110,189,.16)}",
      ".mc-in input,.mc-in select{border:0;outline:0;padding:8px 10px;font:inherit;font-size:14.5px;font-variant-numeric:tabular-nums;width:100%;min-width:0;background:transparent;color:var(--mc-tx)}",
      ".mc-in select{font-size:13.5px;cursor:pointer}",
      ".mc-un{padding:0 10px;display:grid;place-items:center;background:var(--mc-sup2);color:var(--mc-tx2);font-size:12px;border-left:1px solid var(--mc-linha);white-space:nowrap}",
      ".mc-campo small{font-size:11.5px;color:var(--mc-tx2)} .mc-campo em.mc-erro{font-style:normal;font-size:11.5px;color:var(--mc-erro);min-height:0}",
      ".mc-campo.invalido .mc-in{border-color:var(--mc-erro);box-shadow:0 0 0 3px rgba(200,30,37,.12)}",
      ".mc-i{width:17px;height:17px;border-radius:50%;border:1px solid var(--mc-linha2);background:var(--mc-sup);color:var(--mc-aco);font:700 10.5px/15px Georgia,serif;display:inline-grid;place-items:center;cursor:help;padding:0;flex:none}",
      ".mc-i:hover,.mc-i:focus-visible{background:var(--mc-aco);color:#fff;border-color:var(--mc-aco)}",
      ".mc-seg{display:inline-flex;background:var(--mc-sup2);border-radius:10px;padding:3px;gap:3px;flex-wrap:wrap}",
      ".mc-seg button{border:0;background:transparent;padding:7px 13px;border-radius:8px;font:600 13px inherit;color:var(--mc-tx2);cursor:pointer}",
      ".mc-seg button[aria-pressed='true']{background:var(--mc-sup);color:var(--mc-navy);box-shadow:0 1px 3px rgba(0,0,0,.14)} [data-tema='dark'] .mc-seg button[aria-pressed='true']{color:#fff}",
      ".mc-ops{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:10px}",
      ".mc-ops.larg{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}",
      ".mc-op{border:1.5px solid var(--mc-linha);border-radius:12px;background:var(--mc-sup);padding:7px 7px 9px;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:5px;font:inherit;color:inherit;transition:border-color .12s,box-shadow .12s,transform .12s}",
      ".mc-op:hover{border-color:var(--mc-linha2);transform:translateY(-1px)}",
      ".mc-op[aria-pressed='true']{border-color:var(--mc-aco);box-shadow:0 0 0 3px rgba(13,110,189,.15);background:#f6faff} [data-tema='dark'] .mc-op[aria-pressed='true']{background:#18324a}",
      ".mc-op svg{width:100%;height:auto;display:block;border-radius:8px}",
      ".mc-op b{font-size:12.8px;padding:0 3px} .mc-op span{font-size:11.3px;color:var(--mc-tx2);line-height:1.35;padding:0 3px}",
      ".mc-op .mc-val{font-variant-numeric:tabular-nums;font-weight:700;color:var(--mc-aco)}",
      ".mc-ops.q4{grid-template-columns:repeat(4,minmax(0,1fr))} .mc-ops.q3{grid-template-columns:repeat(3,minmax(0,1fr))}",
      ".mc-ops.q3 .mc-op svg{max-height:96px;object-fit:contain}",
      ".mc-lista{display:flex;flex-direction:column;gap:8px}",
      ".mc-li{display:grid;grid-template-columns:88px 1fr auto;gap:12px;align-items:center;border:1.5px solid var(--mc-linha);border-radius:12px;padding:7px 12px 7px 7px;background:var(--mc-sup);cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%;transition:border-color .12s,box-shadow .12s}",
      ".mc-li.mc-li-larga{grid-template-columns:118px 1fr 20px}",
      ".mc-li svg{width:100%;height:auto;display:block;border-radius:8px}",
      ".mc-li:hover{border-color:var(--mc-linha2)} .mc-li[aria-pressed='true']{border-color:var(--mc-aco);box-shadow:0 0 0 3px rgba(13,110,189,.15);background:#f6faff} [data-tema='dark'] .mc-li[aria-pressed='true']{background:#18324a}",
      ".mc-li b{display:block;font-size:13px;color:var(--mc-tx)} .mc-li span{font-size:11.8px;color:var(--mc-tx2)}",
      ".mc-li .mc-val{font-weight:800;color:var(--mc-aco);font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".mc-marca{width:18px;height:18px;border-radius:50%;border:2px solid var(--mc-linha2);display:inline-block;box-sizing:border-box}",
      ".mc-li[aria-pressed='true'] .mc-marca{border:5px solid var(--mc-aco)}",
      ".mc-campos.um{grid-template-columns:1fr}",
      ".mc-papel{background:#fff;border:1px solid var(--mc-linha);border-radius:13px;padding:10px 12px 8px;margin-bottom:12px;background-image:linear-gradient(#f1f4f8 1px,transparent 1px),linear-gradient(90deg,#f1f4f8 1px,transparent 1px);background-size:18px 18px;color:#1d2733}",
      ".mc-papel svg{display:block;width:100%;height:auto}",
      ".mc-papel .mc-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:#4b5b6b;padding:6px 2px 2px}",
      ".mc-papel .mc-leg i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;border:1px solid rgba(0,0,0,.25)}",
      ".mc-num{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px}",
      ".mc-numero{flex:1 1 110px;background:var(--mc-sup2);border-radius:10px;padding:9px 11px}",
      ".mc-numero small{display:block;font-size:11px;font-weight:700;letter-spacing:.3px;color:var(--mc-tx2)}",
      ".mc-numero b{font-size:17px;font-variant-numeric:tabular-nums}",
      ".mc-v0{display:flex;align-items:center;gap:14px}",
      ".mc-v0 .mc-gr{font-size:40px;font-weight:800;letter-spacing:-1px;color:var(--mc-navy);line-height:1} [data-tema='dark'] .mc-v0 .mc-gr{color:#fff}",
      ".mc-v0 .mc-gr small{font-size:15px;font-weight:700;margin-left:3px;color:var(--mc-tx2)}",
      ".mc-cadeia{font-size:12.5px;color:var(--mc-tx2);background:var(--mc-sup2);border-radius:9px;padding:9px 11px;margin-top:10px;font-variant-numeric:tabular-nums}",
      ".mc-cadeia b{color:var(--mc-tx)}",
      ".mc-busca{display:flex;gap:8px}",
      ".mc-busca .mc-in{flex:1}",
      ".mc-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:11.5px;font-weight:650;background:var(--mc-sup2);color:var(--mc-tx2);white-space:nowrap}",
      ".mc-chip.ok{background:#e6f5ec;color:#126b33} .mc-chip.aviso{background:#fdf1dc;color:#8a5200} .mc-chip.erro{background:#fde6e6;color:#a3181e} .mc-chip.info{background:#e5f0fa;color:#0b5a99}",
      "[data-tema='dark'] .mc-chip.ok{background:#173b27;color:#8fe0b0} [data-tema='dark'] .mc-chip.aviso{background:#3d2e12;color:#f5cf86} [data-tema='dark'] .mc-chip.erro{background:#43191c;color:#ffaaaa} [data-tema='dark'] .mc-chip.info{background:#16324d;color:#9fd0ff}",
      ".mc-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}",
      ".mc-chips button{border:1px solid var(--mc-linha);background:var(--mc-sup);border-radius:99px;padding:5px 11px;font:600 12px inherit;color:var(--mc-tx2);cursor:pointer}",
      ".mc-chips button[aria-pressed='true']{background:var(--mc-navy);border-color:var(--mc-navy);color:#fff}",
      ".mc-res{display:flex;flex-direction:column;gap:6px;margin-top:10px}",
      ".mc-res button{text-align:left;border:1px solid var(--mc-linha);background:var(--mc-sup);border-radius:9px;padding:8px 10px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit}",
      ".mc-res button:hover{border-color:var(--mc-aco)}",
      ".mc-bt{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--mc-linha2);background:var(--mc-sup);color:var(--mc-tx);padding:9px 15px;border-radius:10px;font:650 13.5px inherit;cursor:pointer;white-space:nowrap}",
      ".mc-bt:hover{background:var(--mc-sup2)} .mc-bt svg{stroke:currentColor}",
      ".mc-bt.pri{background:var(--mc-aco);border-color:var(--mc-aco);color:#fff} .mc-bt.pri:hover{background:#0b5fa3}",
      ".mc-bt.cta{background:linear-gradient(135deg,#0d6ebd,#0a58a0);border:0;color:#fff;padding:12px 24px;font-size:15px;border-radius:12px;box-shadow:0 6px 18px rgba(13,110,189,.35)}",
      ".mc-bt.ghost{background:transparent;border-color:transparent;color:var(--mc-aco)} .mc-bt.ghost:hover{background:var(--mc-sup2)}",
      ".mc-bt[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}",
      ".mc-bt:focus-visible,.mc-op:focus-visible,.mc-passo:focus-visible,.mc-li:focus-visible,.mc-cb:focus-visible{outline:3px solid rgba(13,110,189,.5);outline-offset:2px}",
      ".mc-rod{display:flex;align-items:center;gap:10px;padding:11px 18px;border-top:1px solid var(--mc-linha);background:var(--mc-sup)}",
      ".mc-rod .mc-msg{flex:1;font-size:12.5px;color:var(--mc-tx2);min-width:0}",
      ".mc-rod .mc-msg.erro{color:var(--mc-erro)}",
      ".mc-faces{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}",
      ".mc-faces .mc-op{padding:9px 8px;align-items:center;text-align:center}",
      ".mc-mini{width:46px;height:32px;border-radius:6px;border:1px solid rgba(0,0,0,.18)}",
      ".mc-portao{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:8px;align-items:start;background:var(--mc-sup2);border-radius:10px;padding:9px;margin-top:8px}",
      ".mc-portao label.mc-ck{grid-column:1/-1;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mc-tx)}",
      ".mc-cores{display:flex;flex-wrap:wrap;gap:6px}",
      ".mc-cor{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--mc-linha);border-radius:99px;padding:3px 9px 3px 4px;font-size:11.5px;background:var(--mc-sup)}",
      ".mc-cor i{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.2);display:inline-block}",
      ".mc-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".mc-links a{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:650;color:var(--mc-aco);text-decoration:none;border:1px solid var(--mc-linha);border-radius:9px;padding:6px 10px;background:var(--mc-sup)}",
      ".mc-links a:hover{border-color:var(--mc-aco)}",
      ".mc-grande{font-size:30px;font-weight:800;letter-spacing:-.6px;font-variant-numeric:tabular-nums;color:var(--mc-navy)} [data-tema='dark'] .mc-grande{color:#fff}",
      ".mc-grande small{font-size:14px;font-weight:700;color:var(--mc-tx2);margin-left:4px}",
      ".mc-rev{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;margin-top:14px}",
      ".mc-topo-rev{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:14px;align-items:stretch}",
      ".mc-topo-rev>.mc-papel{margin:0;display:flex;align-items:center}",
      ".mc-cta{display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 2px}",
      ".mc-rev .mc-card{margin:0} .mc-rev dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:8px 0 0;font-size:12.8px} .mc-rev dt{color:var(--mc-tx2)} .mc-rev dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}",
      ".mc-ed{margin-left:auto;font-size:12px;font-weight:650;color:var(--mc-aco);background:none;border:0;cursor:pointer;padding:2px 6px;border-radius:6px} .mc-ed:hover{background:var(--mc-sup2)}",
      ".mc-decide{columns:2;column-gap:22px;margin:6px 0 0;padding:0;list-style:none;font-size:12.6px}",
      ".mc-decide li{break-inside:avoid;padding:5px 0 5px 22px;position:relative;color:var(--mc-tx)}",
      ".mc-decide li::before{content:'';position:absolute;left:3px;top:10px;width:9px;height:9px;border-radius:50%;background:var(--mc-ambar);box-shadow:0 0 0 3px #fdf1dc}",
      ".mc-avisos{margin:0;padding:0;list-style:none}",
      ".mc-avisos li{display:flex;gap:9px;align-items:flex-start;padding:7px 10px;border-radius:9px;background:#fdf6e9;color:#6f4500;font-size:12.6px;margin-bottom:6px} [data-tema='dark'] .mc-avisos li{background:#3a2c12;color:#f5d9a6}",
      ".mc-avisos li.erro{background:#fdeceb;color:#8f1c1f}",
      ".mc-prog{max-width:660px;margin:4px auto 0;text-align:center}",
      ".mc-prog h3{font-size:21px;margin:2px 0 4px} .mc-prog p{color:var(--mc-tx2);margin:0}",
      ".mc-anim{width:220px;max-width:70%;height:auto}",
      ".mc-anim .mc-tr{stroke-dasharray:420;stroke-dashoffset:420;animation:mcDesenha 2.2s ease-in-out infinite}",
      ".mc-anim .mc-tr2{animation:mcPisca 1.1s ease-in-out infinite alternate}",
      "@keyframes mcDesenha{0%{stroke-dashoffset:420}55%{stroke-dashoffset:0}100%{stroke-dashoffset:-420}}",
      "@keyframes mcPisca{from{opacity:.25}to{opacity:1}}",
      ".mc-barra{height:9px;border-radius:99px;background:var(--mc-sup2);overflow:hidden;position:relative}",
      ".mc-barra>i{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg,#2fb36a,#15803d);transition:width .4s ease}",
      ".mc-barra.aviso>i{background:linear-gradient(90deg,#f0b55a,#c98418)} .mc-barra.erro>i{background:linear-gradient(90deg,#ef5350,#c81e25)}",
      ".mc-barra.corre>i{width:38%;animation:mcCorre 1.3s ease-in-out infinite;background:linear-gradient(90deg,transparent,#0d6ebd,transparent)}",
      "@keyframes mcCorre{from{left:-40%}to{left:100%}}",
      ".mc-etapas{list-style:none;margin:14px auto 0;padding:0;max-width:560px;text-align:left}",
      ".mc-etapas li{display:flex;gap:11px;align-items:center;padding:6px 12px;border-radius:10px;color:var(--mc-tx2);font-size:13px}",
      ".mc-etapas li i{width:20px;height:20px;border-radius:50%;border:2px solid var(--mc-linha2);flex:none;display:grid;place-items:center}",
      ".mc-etapas li.feito{color:var(--mc-tx)} .mc-etapas li.feito i{border-color:var(--mc-ok);background:var(--mc-ok)}",
      ".mc-etapas li.feito i::after{content:'';width:6px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}",
      ".mc-etapas li.agora{background:#e7f0f9;color:var(--mc-tx);font-weight:650} [data-tema='dark'] .mc-etapas li.agora{background:#1d3248}",
      ".mc-etapas li.agora i{border-color:var(--mc-aco);border-top-color:transparent;animation:mcGira .8s linear infinite}",
      "@keyframes mcGira{to{transform:rotate(360deg)}}",
      ".mc-heroi{display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:15px;background:linear-gradient(120deg,#0f2740,#1a4672);color:#fff;margin-bottom:14px;position:relative;overflow:hidden}",
      ".mc-heroi::after{content:'';position:absolute;right:-60px;top:-80px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(233,162,59,.22),transparent 70%)}",
      ".mc-heroi h3{margin:0;font-size:20px;letter-spacing:-.3px} .mc-heroi p{margin:3px 0 0;color:#b9cfe4;font-size:12.8px}",
      ".mc-selo{flex:none;display:inline-flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.9px;font-size:13px;padding:9px 15px;border-radius:99px;background:#1e9b55;color:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.08)}",
      ".mc-selo.erro{background:#d23a3a} .mc-selo.aviso{background:#c98418}",
      ".mc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}",
      ".mc-kpi{background:var(--mc-sup);border:1px solid var(--mc-linha);border-radius:13px;padding:12px 14px;position:relative}",
      ".mc-kpi small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mc-tx2)}",
      ".mc-kpi b{display:block;font-size:23px;font-weight:800;letter-spacing:-.4px;font-variant-numeric:tabular-nums;margin-top:3px}",
      ".mc-kpi span{font-size:11.8px;color:var(--mc-tx2)}",
      ".mc-tab{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}",
      ".mc-tab th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mc-tx2);padding:8px 10px;border-bottom:1px solid var(--mc-linha)}",
      ".mc-tab td{padding:10px;border-bottom:1px solid var(--mc-linha);vertical-align:middle}",
      ".mc-tab tr:last-child td{border-bottom:0} .mc-tab td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} .mc-tab th.n{text-align:right}",
      ".mc-tab .mc-perfil{font-weight:700}",
      ".mc-ap{display:grid;grid-template-columns:1fr 54px;gap:10px;align-items:center;min-width:170px}",
      ".mc-ap b{font-variant-numeric:tabular-nums;text-align:right;font-size:13px}",
      ".mc-dec{display:grid;grid-template-columns:34px 1fr;gap:12px;padding:11px 2px;border-bottom:1px dashed var(--mc-linha)}",
      ".mc-dec:last-child{border-bottom:0}",
      ".mc-dec .mc-di{width:32px;height:32px;border-radius:9px;background:#fdf1dc;color:#a86a10;display:grid;place-items:center;font-weight:800;font-size:13px}",
      ".mc-dec b{font-size:12px;letter-spacing:.4px;text-transform:uppercase;color:var(--mc-tx2)} .mc-dec p{margin:1px 0 0;font-size:13.2px}",
      ".mc-dec .mc-pq{display:block;margin-top:3px;font-size:12.3px;color:var(--mc-tx2)} .mc-dec .mc-pq::before{content:'Por quê: ';font-weight:700;color:var(--mc-ambar2)}",
      ".mc-prob{border:1px solid #f0c7c7;background:#fff7f7;border-radius:13px;padding:14px 16px;margin-bottom:12px} [data-tema='dark'] .mc-prob{background:#2e1719;border-color:#5b2a2d}",
      ".mc-prob h5{margin:0 0 4px;font-size:14px;color:#a3181e;display:flex;gap:8px;align-items:center} [data-tema='dark'] .mc-prob h5{color:#ff9d9d}",
      ".mc-prob p{margin:0;font-size:13px}",
      ".mc-sols{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}",
      ".mc-acoes{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;width:100%}",
      ".mc-modelos{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}",
      ".mc-mod{border:1px solid var(--mc-linha);border-radius:14px;background:var(--mc-sup);overflow:hidden;display:flex;flex-direction:column;cursor:pointer;text-align:left;padding:0;font:inherit;color:inherit;transition:transform .14s,box-shadow .14s,border-color .14s}",
      ".mc-mod:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(15,39,64,.14);border-color:var(--mc-linha2)}",
      ".mc-mod .mc-fig{background:linear-gradient(180deg,#eaf1f8,#f8fbfd);padding:8px 10px 2px;border-bottom:1px solid var(--mc-linha)}",
      ".mc-mod .mc-fig svg{display:block;width:100%;height:auto}",
      ".mc-mod .mc-mc{padding:11px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}",
      ".mc-mod b{font-size:14.5px} .mc-mod p{margin:0;font-size:12.3px;color:var(--mc-tx2);flex:1}",
      ".mc-mod .mc-ds{display:flex;flex-wrap:wrap;gap:6px}",
      ".mc-mod .mc-usar{margin-top:4px;font-weight:700;font-size:12.5px;color:var(--mc-aco)}",
      ".mc-mod.atual{border-color:var(--mc-ambar);box-shadow:0 0 0 3px rgba(233,162,59,.2)}",
      ".mc-normas{display:grid;gap:12px}",
      ".mc-norma{display:grid;grid-template-columns:180px 1fr 200px;gap:16px;align-items:start;background:var(--mc-sup);border:1px solid var(--mc-linha);border-radius:13px;padding:14px 16px}",
      ".mc-norma .mc-cod{font-size:16px;font-weight:800;letter-spacing:-.2px;color:var(--mc-navy)} [data-tema='dark'] .mc-norma .mc-cod{color:#fff}",
      ".mc-norma .mc-cod small{display:block;font-size:11.5px;font-weight:600;color:var(--mc-tx2);letter-spacing:0;margin-top:3px}",
      ".mc-norma h5{margin:0 0 3px;font-size:13.5px} .mc-norma p{margin:0;font-size:12.3px;color:var(--mc-tx2)}",
      ".mc-norma dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0 0;font-size:12.3px} .mc-norma dt{color:var(--mc-tx2)} .mc-norma dd{margin:0;font-weight:600}",
      ".mc-norma .mc-sit{display:flex;flex-direction:column;gap:6px;align-items:flex-start}",
      ".mc-pend{display:flex;gap:12px;align-items:flex-start;background:#fff8ea;border:1px solid #f1d9a8;border-radius:13px;padding:13px 15px;color:#6b4200;font-size:13px;margin-bottom:12px} [data-tema='dark'] .mc-pend{background:#33260f;border-color:#5a4520;color:#f3d9a5}",
      ".mc-vazio{text-align:center;padding:50px 20px;color:var(--mc-tx2)}",
      /* COMO USAR NO CYPE 3D: o fragmento do motor (section.acg) traz só tamanhos e bordas neutras;
         as cores são as da janela (claro e escuro). Passos numerados em cartões, "Confira" destacado. */
      ".mc-ph .mc-bt{margin-left:auto;flex:none}",
      ".mc-guia{max-width:980px}",
      ".mc-guia .acg{font-size:13.4px;line-height:1.55;color:var(--mc-tx)} .mc-guia .acg>h3:first-of-type{display:none}",
      ".mc-guia .acg>p{color:var(--mc-tx2);margin:0 0 4px} .mc-guia .acg h3{font-size:15px;margin:22px 0 8px;color:var(--mc-tx)}",
      ".mc-guia .acg .guia{list-style:none;counter-reset:mcp;padding:0;margin:12px 0 0}",
      ".mc-guia .acg .guia>li{counter-increment:mcp;position:relative;margin:0 0 10px;padding:11px 14px 11px 54px;border:1px solid var(--mc-linha);border-radius:11px;background:var(--mc-sup2)}",
      ".mc-guia .acg .guia>li::before{content:counter(mcp);position:absolute;left:14px;top:10px;width:28px;height:28px;border-radius:50%;background:var(--mc-aco);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}",
      ".mc-guia .acg .tit{font-size:14.2px;margin:3px 0 6px} .mc-guia .acg .onde{color:var(--mc-tx2);opacity:1}",
      ".mc-guia .acg .conf{margin-top:6px;padding:6px 10px;border-left:3px solid var(--mc-ok);background:rgba(21,128,61,.07);border-radius:0 7px 7px 0}",
      ".mc-guia .acg .acf{color:var(--mc-aviso)} .mc-guia .acg code{background:var(--mc-sup);border:1px solid var(--mc-linha);border-radius:5px;padding:0 4px}",
      ".mc-guia .acg table{background:var(--mc-sup);font-size:12.4px} .mc-guia .acg th{background:var(--mc-sup2);color:var(--mc-tx2);font-weight:600} .mc-guia .acg th,.mc-guia .acg td{border-color:var(--mc-linha);padding:5px 7px}",
      ".mc-guia .acg .probs{padding-left:20px} .mc-guia .acg .probs li{margin:6px 0}",
      "[data-tema='dark'] .mc-guia .acg .conf{background:rgba(34,197,94,.1)} [data-tema='dark'] .mc-guia .acg .acf{color:#f3c26f}",
      /* o botão do aviso (toast): o contêiner dos avisos não pega clique (css/app.css) — só o botão pega */
      ".mc-toast-acao{margin-left:10px;padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.16);color:#fff;font:inherit;font-weight:700;cursor:pointer;pointer-events:auto;white-space:nowrap}",
      ".mc-toast-acao:hover{background:rgba(255,255,255,.28)} .mc-toast-acao:focus-visible{outline:2px solid #fff;outline-offset:2px}",
      ".mc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      "@media (max-width:980px){.mc-topo-rev{grid-template-columns:1fr}.mc-ops.q4{grid-template-columns:repeat(2,minmax(0,1fr))}.mc-corpo{grid-template-columns:1fr}.mc-trilho{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--mc-linha);padding:8px}.mc-trilho .mc-tt,.mc-trilho .mc-rodape{display:none}.mc-passo{min-width:170px}.mc-duas,.mc-rev{grid-template-columns:1fr}.mc-vivo{position:static}.mc-norma{grid-template-columns:1fr}.mc-faces{grid-template-columns:repeat(3,minmax(0,1fr))}.mc-decide{columns:1}}",
      "@media (max-width:640px){.mc-veu{padding:0}.mc-jan{border-radius:0;height:100%}.mc-palco{padding:16px}.mc-cab p{display:none}}",
      "@media (prefers-reduced-motion:reduce){.mc-veu,.mc-jan,.mc-anim .mc-tr,.mc-anim .mc-tr2,.mc-barra.corre>i,.mc-etapas li.agora i{animation:none}}"
    ].join("\n");
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ================================================================ JANELA */
  var UIC = {
    est: null, passo: 1, modo: "assistente", face: "frente", r: null, rTempo: 0, salvo: null, salvoEm: 0, busca: null, buscando: false,
    calc: null, modo_calc: null, foco: null, msgErro: "", raiz: null
  };
  function raiz() { return doc ? doc.getElementById("mc-veu") : null; }
  function garantir() {
    estilo();
    if (!UIC.est) {
      var s = ler();
      UIC.salvo = s;
      UIC.est = s ? mesclar(copia(PADRAO), s.estado) : estadoNovo();
    }
    var v = raiz();
    if (v) return v;
    v = doc.createElement("div");
    v.id = "mc-veu"; v.className = "mc-veu";
    v.innerHTML = '<div class="mc-jan" role="dialog" aria-modal="true" aria-labelledby="mc-tit" tabindex="-1"></div>';
    doc.body.appendChild(v);
    ligar(v); ligarEscDocumento();
    return v;
  }
  function fechar() {
    var v = raiz(); if (!v) return;
    if (UIC.calc && UIC.calc.rodando) { if (!global.confirm("O cálculo está rodando. Fechar e cancelar?")) return; cancelar(); }
    salvar(true);
    soltarVista();
    if (global.DicaRica) DicaRica.esconder();
    v.remove();
  }
  /* a obra trocou: o estado guardado é outro */
  function conferirObra() { if (UIC.obra !== obraId()) { UIC.obra = obraId(); UIC.est = null; UIC.r = null; UIC.busca = null; } }

  function cabecalho(sub, semBotoes) {
    var o = obra();
    return '<header class="mc-cab"><div class="mc-logo">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f3c26f" stroke-width="2" stroke-linejoin="round"><path d="M3 20V9l9-5 9 5v11"/><path d="M3 9h18" stroke="#9fc2e4"/><path d="M8 20v-6h8v6" stroke="#9fc2e4"/></svg></div>' +
      '<div><h2 id="mc-tit">Cálculo do galpão de aço</h2><p>' + esc((o && o.nome ? o.nome + " · " : "") + (sub || "NBR 8800 · NBR 6123 · NBR 6120 · NBR 8681 · NBR 14762")) + "</p></div>" +
      '<span class="mc-esp"></span>' + (semBotoes ? "" :
      (global.MetalCalcLivreUI ? '<button class="mc-cb" data-mc-acao="livre" title="Calcular a estrutura desenhada no modelo (mezanino, passarela, pórtico avulso, cobertura simples)">' + ico("estrutura", 15) + " Estrutura desenhada</button>" : "") +
      '<button class="mc-cb" data-mc-acao="modelos" title="Galpões prontos para ajustar">' + ico("camadas", 15) + " Modelos prontos</button>" +
      '<button class="mc-cb" data-mc-acao="normas" title="As normas e edições que o cálculo usa">' + ico("livro", 15) + " Normas</button>" +
      (UIC.r ? '<button class="mc-cb" data-mc-acao="resultados" title="O último cálculo desta obra">' + ico("grafico", 15) + " Resultado</button>" : "")) +
      '<button class="mc-cb x" data-mc-acao="fechar" aria-label="Fechar" title="Fechar (Esc) — os dados ficam salvos na obra">' + (ico("fechar", 16) || "✕") + "</button></header>";
  }
  function trilho() {
    var val = validar(UIC.est), faltaPor = {};
    val.falta.forEach(function (f) { faltaPor[f.passo] = true; });
    return '<nav class="mc-trilho" aria-label="Passos"><div class="mc-tt">Passos do assistente</div>' + PASSOS.map(function (p) {
      var cls = p.n === UIC.passo ? " ativo" : (p.n < UIC.passo && !faltaPor[p.n] ? " feito" : "") + (faltaPor[p.n] && p.n !== UIC.passo ? " falta" : "");
      return '<button class="mc-passo' + cls + '" data-mc-acao="passo" data-mc-v="' + p.n + '"' + (p.n === UIC.passo ? ' aria-current="step"' : "") + '><span class="mc-n">' + (cls.indexOf("feito") >= 0 ? "✓" : p.n) + '</span><span><b>' + esc(p.titulo) + '</b><small data-mc-vivo="rt' + p.n + '">' + esc(resumoPasso(p.n)) + "</small></span></button>";
    }).join("") + '<div class="mc-rodape"><span data-mc="salvo">' + (UIC.salvoEm ? ico("check", 13) + " Salvo na obra" : "Os dados ficam salvos na obra") + "</span></div></nav>";
  }
  function resumoPasso(n) {
    var e = UIC.est, g = e.geometria;
    if (n === 1) {
      var v = ventoPrevia(e);
      if (!ventoEntrada(e)) return "Falta o local da obra";
      return (e.local.endereco ? e.local.endereco.split(",")[0] + " · " : "") + "V0 " + (v && v.ok ? fmt(v.v0, 0) : "—") + " m/s · cat. " + e.vento.categoria + " · S3 " + fmt(s3De(e.vento.grupoS3), 2);
    }
    if (n === 2) return fmt(num(g.vao), 1) + " × " + fmt(num(g.comprimento), 1) + " m · pé-direito " + fmt(num(g.peDireito), 1) + " m · " + fmt(num(g.inclinacaoPct), 0) + " %";
    if (n === 3) { var c = {}; FACES.forEach(function (f) { var t = (e.fechamentos[f.id] || {}).tipo; c[t] = (c[t] || 0) + 1; }); var ks = Object.keys(c); if (ks.length === 1) return (ks[0] === "aberto" ? "Aberto" : nomeTipo(ks[0])) + " nas 4 faces"; return ks.map(function (k) { return nomeTipo(k) + ": " + c[k]; }).join(" · "); }
    if (n === 4) { var ti = telhaInfo(e); return ti.telha ? (ti.telha.modelo || "").replace(/^Telha /, "").slice(0, 34) + " · terças ≤ " + fmt(ti.vaoTercas, 2) + " m" : "Escolha a telha"; }
    if (n === 5) { var fam = FAMILIAS.filter(function (f) { return f.id === e.perfis.familia; })[0]; return (e.perfis.modo === "manual" ? "Escolhidos" : "Automático") + " · " + (fam ? fam.nome.split(" — ")[0] : "") + " · " + e.acos.perfil; }
    var val = validar(e); return val.ok ? (val.atencao.length ? val.atencao.length + " ponto(s) de atenção" : "Pronto para calcular") : "Falta: " + val.falta.length + " item(ns)";
  }
  function s3De(g) { var V0 = V(), t = V0 && V0.TABELAS && V0.TABELAS.TAB3 && V0.TABELAS.TAB3[g]; if (t) return t.s3; var u = USOS_PADRAO.filter(function (x) { return x.g === Number(g); })[0]; return u ? u.s3 : 1; }

  function render() {
    var v = garantir(), jan = v.querySelector(".mc-jan");
    var foco = doc.activeElement && v.contains(doc.activeElement) ? seletorDe(doc.activeElement) : null;
    var top = (v.querySelector(".mc-palco") || {}).scrollTop || 0;
    var h = "";
    if (UIC.modo !== "vista") soltarVista();
    if (UIC.modo === "assistente") h = cabecalho() + '<div class="mc-corpo">' + trilho() + '<main class="mc-palco" data-mc-passo="' + UIC.passo + '">' + passoHtml() + "</main></div>" + rodapeAssistente();
    else if (UIC.modo === "modelos") h = cabecalho("Modelos prontos — escolha e ajuste") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="modelos">' + modelosHtml() + "</main></div>" + rodapeSimples('<button class="mc-bt" data-mc-acao="voltar-assistente">Voltar ao assistente</button>');
    else if (UIC.modo === "calculando") h = cabecalho("Calculando", true) + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="calculando">' + calculandoHtml() + "</main></div>" + rodapeSimples('<button class="mc-bt" data-mc-acao="cancelar">Cancelar o cálculo</button>');
    else if (UIC.modo === "resultado") h = cabecalho("Resultado do cálculo") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="resultado">' + resultadoHtml(UIC.r) + "</main></div>" + rodapeResultado();
    else if (UIC.modo === "normas") h = cabecalho("Normas configuradas") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="normas">' + normasHtml() + "</main></div>" + rodapeSimples('<button class="mc-bt" data-mc-acao="voltar-assistente">Voltar ao assistente</button>' + (UIC.r ? '<button class="mc-bt" data-mc-acao="resultados">Ver o resultado</button>' : ""));
    else if (UIC.modo === "cypeguia") h = cabecalho("Como usar no CYPE 3D") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="cypeguia">' + guiaCypeHtml() + "</main></div>" +
      rodapeSimples('<button class="mc-bt" data-mc-acao="cype-guia-voltar">' + (UIC.cypeVolta === "fechar" ? "Fechar" : (voltaDoGuia() === "resultado" ? "Voltar ao resultado" : "Voltar")) + "</button>");
    else if (UIC.modo === "pranchas") h = cabecalho("Pranchas do projeto executivo") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="pranchas">' + pranchasHtml() + "</main></div>" + rodapeSimples('<button class="mc-bt" data-mc-acao="resultados">Voltar ao resultado</button><button class="mc-bt" data-mc-acao="pranchas-zip">Baixar todas (.zip)</button><button class="mc-bt" data-mc-acao="pranchas-dxf" title="Uma folha por DXF, no Padrão RA, com o carimbo RA: abre no AutoCAD e salva em DWG">DXF (.zip)</button><button class="mc-bt pri" data-mc-acao="pranchas-imprimir">Imprimir / salvar em PDF</button>');
    else if (UIC.modo === "folha") h = cabecalho("Pranchas do projeto executivo") + '<div class="mc-corpo cheio"><main class="mc-palco" data-mc-modo="folha">' + folhaHtml() + "</main></div>" + rodapeSimples('<button class="mc-bt" data-mc-acao="pranchas-voltar">Todas as folhas</button><button class="mc-bt" data-mc-acao="folha-nav" data-mc-v="-1">← Anterior</button><button class="mc-bt pri" data-mc-acao="folha-nav" data-mc-v="1">Próxima →</button>');
    else if (UIC.modo === "vista") h = cabecalho("Resultado em 3D") + '<div class="mc-corpo cheio"><main class="mc-palco" style="padding:0" data-mc-modo="vista"><div data-mc="vista3d" style="position:relative;width:100%;height:100%;min-height:420px"></div></main></div>' + rodapeSimples('<button class="mc-bt" data-mc-acao="resultados">Voltar ao resultado</button>');
    jan.innerHTML = h;
    jan.setAttribute("data-mc-modo", UIC.modo);
    var pal = v.querySelector(".mc-palco"); if (pal && UIC.manterRolagem) pal.scrollTop = top;
    UIC.manterRolagem = false;
    if (foco) { var el = v.querySelector(foco); if (el && el.focus) try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    /* o foco do teclado fica DENTRO da janela (diálogo modal): Esc e Tab chegam nela */
    if (!v.contains(doc.activeElement)) { try { jan.focus({ preventScroll: true }); } catch (e2) { try { jan.focus(); } catch (e3) {} } }
  }
  function seletorDe(el) {
    if (el.getAttribute("data-mc-campo")) return '[data-mc-campo="' + el.getAttribute("data-mc-campo") + '"]';
    if (el.getAttribute("data-mc-acao")) return '[data-mc-acao="' + el.getAttribute("data-mc-acao") + '"]' + (el.getAttribute("data-mc-v") != null ? '[data-mc-v="' + el.getAttribute("data-mc-v") + '"]' : "");
    return null;
  }
  function rodapeSimples(botoes) { return '<footer class="mc-rod"><span class="mc-msg"></span>' + botoes + "</footer>"; }
  function rodapeAssistente() {
    var val = validar(UIC.est), ult = UIC.passo === PASSOS.length, msg = "";
    if (ult) msg = val.ok ? (val.atencao.length ? val.atencao.length + " ponto(s) de atenção — o cálculo segue com eles registrados." : "Tudo pronto: o sistema decide o resto e mostra o porquê de cada decisão.") : val.falta[0].texto;
    else { var f = val.falta.filter(function (x) { return x.passo === UIC.passo; })[0]; msg = f ? f.texto : "As decisões de norma (flambagem, travamentos, terças) ficam com o sistema."; }
    return '<footer class="mc-rod"><span class="mc-msg' + (ult && !val.ok ? " erro" : "") + '" data-mc="msg">' + esc(msg) + "</span>" +
      (UIC.passo > 1 ? '<button class="mc-bt" data-mc-acao="voltar">' + (ico("voltar", 15)) + " Voltar</button>" : "") +
      (ult ? '<button class="mc-bt cta" data-mc-acao="calcular"' + (val.ok ? "" : " disabled") + ">" + (ico("raio", 16)) + " Calcular o galpão</button>"
           : '<button class="mc-bt pri" data-mc-acao="proximo">Próximo ' + (ico("avancar", 15)) + "</button>") + "</footer>";
  }

  /* ---------------------------------------------------------------- campos */
  var nCampo = 0;
  var GRANDEZA_UN = { "kN": "forca", "kN·m": "momento", "kN/m": "linear", "kN/m²": "superficie" };   /* campo com seletor de unidade (js/unidadesui.js) */
  function campo(cam, rot, un, op) {
    op = op || {};
    var v = pegar(UIC.est, cam), id = "mc-c" + (++nCampo);
    return '<div class="mc-campo" data-mc-box="' + cam + '"><label for="' + id + '">' + esc(rot) + (op.dica ? ' <button type="button" class="mc-i" data-dica="' + op.dica + '" data-dica-lado="direita" aria-label="Exemplo ilustrado: ' + esc(rot) + '">i</button>' : "") + "</label>" +
      '<div class="mc-in"><input id="' + id + '" data-mc-campo="' + cam + '" data-mc-tipo="' + (op.texto ? "txt" : "num") + '"' + (GRANDEZA_UN[un] ? ' data-grandeza="' + GRANDEZA_UN[un] + '"' : "") + (op.texto ? "" : ' inputmode="decimal"') + ' value="' + esc(op.texto ? (v || "") : fmtIn(num(v, NaN))) + '"' +
      (op.min != null ? ' data-mc-min="' + op.min + '"' : "") + (op.max != null ? ' data-mc-max="' + op.max + '"' : "") + (op.ph ? ' placeholder="' + esc(op.ph) + '"' : "") + ' autocomplete="off">' + (un ? '<span class="mc-un">' + un + "</span>" : "") + "</div>" +
      (op.exp ? "<small>" + op.exp + "</small>" : "") + '<em class="mc-erro" data-mc-erro="' + cam + '"></em></div>';
  }
  function seletor(cam, rot, opcoes, op) {
    op = op || {};
    var v = pegar(UIC.est, cam), id = "mc-c" + (++nCampo);
    return '<div class="mc-campo"><label for="' + id + '">' + esc(rot) + (op.dica ? ' <button type="button" class="mc-i" data-dica="' + op.dica + '" data-dica-lado="direita" aria-label="Exemplo ilustrado">i</button>' : "") + "</label>" +
      '<div class="mc-in"><select id="' + id + '" data-mc-campo="' + cam + '" data-mc-tipo="txt">' + opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>" +
      (op.exp ? "<small>" + op.exp + "</small>" : "") + "</div>";
  }
  function seg(acao, atual, ops) { return '<div class="mc-seg" role="group">' + ops.map(function (o) { return '<button type="button" data-mc-acao="' + acao + '" data-mc-v="' + o[0] + '" aria-pressed="' + (String(atual) === String(o[0])) + '"' + (o[2] ? ' data-dica="' + o[2] + '"' : "") + ">" + esc(o[1]) + "</button>"; }).join("") + "</div>"; }
  function cab(passo, titulo, desc) { return '<div class="mc-ph"><div><h3>' + esc(titulo) + "</h3><p>" + desc + '</p></div><span class="mc-cont">Passo ' + passo + " de " + PASSOS.length + "</span></div>"; }

  function passoHtml() {
    nCampo = 0;
    if (UIC.passo === 1) return passoLocal();
    if (UIC.passo === 2) return passoGeometria();
    if (UIC.passo === 3) return passoFechamentos();
    if (UIC.passo === 4) return passoCobertura();
    if (UIC.passo === 5) return passoPerfis();
    return passoRevisao();
  }

  /* ---------------------------------------------------------------- 1. LOCAL E VENTO */
  function passoLocal() {
    var e = UIC.est, l = e.local, v = e.vento, temLoc = isFinite(num(l.lat, NaN)) && isFinite(num(l.lon, NaN));
    var h = cab(1, "Local e vento", "Diga onde é a obra: o sistema acha a velocidade básica do vento (V0) no mapa de isopletas da NBR 6123 e mostra o porquê. Depois, três escolhas com desenho.");
    h += '<div class="mc-duas"><div>';
    h += '<section class="mc-card"><h4>' + (ico("alvo", 16)) + " Onde é a obra</h4>" +
      '<p class="mc-exp">Endereço com cidade e estado, o link do Google Maps ou as coordenadas (ex.: −18,92, −48,28).</p>' +
      '<div class="mc-busca"><div class="mc-in"><input data-mc-campo="local.texto" data-mc-tipo="txt" value="' + esc(l.texto || "") + '" placeholder="Rua, número, cidade/UF · link do mapa · coordenadas" aria-label="Endereço da obra" autocomplete="off"></div>' +
      '<button class="mc-bt pri" data-mc-acao="localizar"' + (UIC.buscando ? " disabled" : "") + ">" + (ico("buscar", 15)) + (UIC.buscando ? " Procurando…" : " Localizar") + "</button></div>";
    if (UIC.busca && UIC.busca.erro) h += '<p class="mc-exp" style="color:var(--mc-erro);margin:10px 0 0">' + esc(UIC.busca.erro) + "</p>";
    if (UIC.busca && arr(UIC.busca.lista).length) h += '<div class="mc-res">' + UIC.busca.lista.map(function (x, i) { return '<button data-mc-acao="usar-endereco" data-mc-v="' + i + '">' + esc(x.nome) + "</button>"; }).join("") + (UIC.busca.atrib ? '<small class="mc-exp" style="margin:0">' + esc(UIC.busca.atrib) + "</small>" : "") + "</div>";
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px">' + (temLoc ? '<span class="mc-chip ok">' + ico("check", 12) + " Obra em " + fmt(num(l.lat), 4) + "°; " + fmt(num(l.lon), 4) + "°" + (l.fonte ? " · " + esc(l.fonte) : "") + "</span>" : '<span class="mc-chip aviso">Ainda sem local</span>') +
      (l.endereco ? '<span class="mc-chip">' + esc(l.endereco.slice(0, 70)) + "</span>" : "") + "</div>";
    h += '<details style="margin-top:10px"' + (temLoc ? "" : " open") + '><summary style="cursor:pointer;font-size:12.5px;color:var(--mc-tx2)">Coordenadas e V0 informado</summary><div class="mc-campos" style="margin-top:10px">' +
      campo("local.lat", "Latitude", "°", { min: -35, max: 6, exp: "Sul é negativo" }) + campo("local.lon", "Longitude", "°", { min: -75, max: -32, exp: "Oeste é negativo" }) +
      campo("local.v0Manual", "V0 de estudo específico", "m/s", { min: 25, max: 60, exp: '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-mc-campo="local.usarV0" data-mc-tipo="bool"' + (l.usarV0 ? " checked" : "") + "> usar este V0 (NBR 6123, 5.1.2)</label>" }) + "</div></details></section>";
    /* S1 — quatro desenhos numa linha */
    h += '<section class="mc-card"><h4>Topografia do terreno <span class="mc-chip">fator S1</span></h4><p class="mc-exp">O vento acelera no alto de morros e taludes e perde força no fundo de vales.</p><div class="mc-ops q4">' +
      S1S.map(function (s) { return '<button class="mc-op" data-mc-acao="s1" data-mc-v="' + s.id + '" aria-pressed="' + (v.s1.tipo === s.id) + '">' + svgS1(s.id) + "<b>" + s.nome + "</b><span>" + s.desc + "</span></button>"; }).join("") + "</div>";
    if (v.s1.tipo === "talude" || v.s1.tipo === "morro") h += '<div class="mc-campos" style="margin-top:12px">' + campo("vento.s1.theta", "Inclinação média da encosta", "°", { min: 0, max: 60, exp: "Ângulo θ do talude/morro" }) + campo("vento.s1.d", "Desnível base–topo", "m", { min: 1, max: 500, exp: "Diferença d entre o pé e o topo" }) + "</div>";
    h += "</section>";
    /* rugosidade — lista com o desenho de cada categoria */
    h += '<section class="mc-card"><h4>Rugosidade em volta <span class="mc-chip">fator S2</span></h4><p class="mc-exp">O que há em volta da obra, na direção de onde vem o vento: quanto mais obstáculos, mais o vento perde força perto do chão.</p><div class="mc-lista">' +
      RUGOS.map(function (c) { return '<button class="mc-li mc-li-larga" data-mc-acao="cat" data-mc-v="' + c.id + '" aria-pressed="' + (v.categoria === c.id) + '">' + svgRug(c.id) + "<span><b>" + c.nome + "</b><span>" + c.desc + '</span></span><span class="mc-marca" aria-hidden="true"></span></button>'; }).join("") + "</div></section>";
    /* S3 — lista com o pictograma e o valor */
    var usos = usosS3();
    h += '<section class="mc-card"><h4>Uso da edificação <span class="mc-chip">fator S3</span></h4><p class="mc-exp">A segurança exigida depende do que acontece se o galpão cair numa tempestade.</p><div class="mc-lista">' +
      usos.map(function (u) { return '<button class="mc-li" data-mc-acao="s3" data-mc-v="' + u.g + '" aria-pressed="' + (Number(v.grupoS3) === u.g) + '" title="NBR 6123, Tabela 3: ' + esc(u.norma) + '">' + svgUso(u.g) + "<span><b>Grupo " + u.g + " — " + esc(u.curto) + "</b><span>" + esc(u.desc) + '</span></span><span class="mc-val">S3 = ' + fmt(u.s3, 2) + "</span></button>"; }).join("") + "</div></section>";
    h += '</div><aside class="mc-vivo" data-mc-vivo="vento">' + painelVento() + "</aside></div>";
    return h;
  }
  function usosS3() {
    var V0 = V(), T = V0 && V0.TABELAS && V0.TABELAS.TAB3;
    return USOS_PADRAO.map(function (u) { var t = T && T[u.g]; return { g: u.g, s3: t ? t.s3 : u.s3, curto: u.curto, desc: u.desc, norma: t ? t.desc : u.desc }; });
  }
  var cacheMapa = { k: null, svg: "" };
  /* o painel da direita: V0 (o porquê), a pressão (a cadeia S1·S2·S3 → q) e o mapa com a obra */
  function painelVento() {
    var e = UIC.est, l = e.local, temLoc = isFinite(num(l.lat, NaN)) && isFinite(num(l.lon, NaN)), Vr = ventoPrevia(e), Iso = I(), h = "", mapa = "";
    if (temLoc && Iso && Iso.v0) {
      var r0 = Iso.v0(num(l.lat), num(l.lon));
      var k = fmt(num(l.lat), 4) + "|" + fmt(num(l.lon), 4) + "|" + (l.endereco || "");
      if (cacheMapa.k !== k) { try { cacheMapa = { k: k, svg: Iso.svgMapa(num(l.lat), num(l.lon), { largura: 520, rotulo: (l.endereco || "Obra").split(",")[0].slice(0, 28) }) }; } catch (eM) { cacheMapa = { k: k, svg: "" }; } }
      h += '<div class="mc-card"><div class="mc-v0"><div class="mc-gr" data-mc="v0">' + (Vr && Vr.ok ? fmt(Vr.v0, 0) : fmt(r0.v0Adotado, 0)) + "<small>m/s</small></div><div><b>Velocidade básica do vento V0</b><br><span class=\"mc-exp\" style=\"margin:0\">" +
        (l.usarV0 && num(l.v0Manual, 0) > 0 ? "informada pelo estudo específico (o mapa dá " + fmt(r0.v0Adotado, 0) + " m/s)" : "mapa de isopletas da NBR 6123, com a obra marcada") + "</span></div></div>" +
        '<p class="mc-exp" style="margin:10px 0 0" data-mc="v0-texto">' + esc(r0.texto || "") + "</p></div>";
      mapa = '<div class="mc-papel" data-mc="mapa">' + cacheMapa.svg + "</div>";
    } else {
      h += '<div class="mc-card mc-vazio" style="padding:34px 20px"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9fb2c6" stroke-width="1.4"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>' +
        '<p style="margin:8px 0 0"><b>Informe o local da obra</b></p><p class="mc-exp" style="margin:4px auto 0;max-width:320px">O mapa de isopletas aparece aqui, com a obra marcada, as duas isopletas vizinhas e o V0 adotado.</p></div>';
    }
    if (Vr && Vr.ok) {
      var s2 = Vr.s2 || {};
      h += '<div class="mc-card"><h4>Pressão do vento nesta obra <button type="button" class="mc-i" data-dica="coef-pressao" aria-label="Coeficientes de pressão">i</button></h4><div class="mc-num">' +
        '<div class="mc-numero"><small>S1</small><b>' + fmt(Vr.s1 && Vr.s1.valor, 2) + "</b></div>" +
        '<div class="mc-numero"><small>S2 · ' + esc((s2.categoria || "") + " " + (s2.classe || "")) + "</small><b>" + fmt(s2.valor, 2) + "</b></div>" +
        '<div class="mc-numero"><small>S3</small><b>' + fmt(Vr.s3, 2) + "</b></div>" +
        '<div class="mc-numero"><small>q (kN/m²)</small><b>' + fmt(Vr.q, 3) + "</b></div></div>" +
        '<div class="mc-cadeia">V<sub>k</sub> = V0·S1·S2·S3 = ' + fmt(Vr.v0, 0) + " × " + fmt(Vr.s1 && Vr.s1.valor, 2) + " × " + fmt(s2.valor, 3) + " × " + fmt(Vr.s3, 2) + " = <b>" + fmt(Vr.vk, 1) + " m/s</b> → q = 0,613·V<sub>k</sub>² = <b>" + fmt(Vr.q, 3) + " kN/m²</b> · " + arr(Vr.casos).length + " casos de vento · altura de referência " + fmt(Vr.geometria && Vr.geometria.zRef, 2) + " m</div></div>";
    } else if (Vr && !Vr.ok) h += '<ul class="mc-avisos"><li class="erro">' + esc(arr(Vr.erros).join("; ") || "O vento não foi calculado.") + "</li></ul>";
    return h + mapa;
  }

  /* ---------------------------------------------------------------- 2. GEOMETRIA */
  function passoGeometria() {
    var e = UIC.est, g = e.geometria;
    var h = cab(2, "Geometria", "As medidas principais. O desenho acompanha cada número; o espaçamento real dos pórticos é o que divide o comprimento em partes iguais.");
    h += '<div class="mc-duas"><div><section class="mc-card"><h4>Medidas do galpão <button type="button" class="mc-i" data-dica="portico-alma-cheia" aria-label="Pórtico de alma cheia">i</button></h4><p class="mc-exp">Eixo a eixo dos pilares; pé-direito até o beiral (topo do pilar).</p><div class="mc-campos">' +
      campo("geometria.vao", "Vão", "m", { min: 4, max: 60, exp: "Largura entre eixos dos pilares" }) +
      campo("geometria.comprimento", "Comprimento", "m", { min: 3, max: 300, exp: "Entre os oitões" }) +
      campo("geometria.espacamento", "Espaçamento dos pórticos", "m", { min: 2, max: 15, exp: "Alvo — o sistema ajusta ao comprimento" }) +
      campo("geometria.peDireito", "Pé-direito", "m", { min: 2.5, max: 25, exp: "Da base ao beiral" }) +
      campo("geometria.inclinacaoPct", "Inclinação do telhado", "%", { min: 1, max: 60, exp: '<span data-mc-vivo="graus">' + grausTxt() + "</span>" }) + "</div></section>" +
      '<section class="mc-card"><h4>Telhado</h4><p class="mc-exp">Duas águas com cumeeira no meio, ou uma água caindo de um lado para o outro.</p>' + seg("aguas", g.aguas, [[2, "Duas águas"], [1, "Uma água"]]) + "</section>" +
      '<section class="mc-card"><h4>Base dos pilares</h4><p class="mc-exp">Rotulada é mais simples e barata na fundação; engastada deixa o galpão mais rígido (pilares mais leves, fundação com momento).</p>' +
      seg("base", g.base, [["rotulada", "Rotulada", "placa-base-rotulada"], ["engastada", "Engastada", "placa-base-engastada"]]) + "</section></div>" +
      '<aside class="mc-vivo"><div class="mc-papel" data-mc-vivo="portico">' + svgPortico(e, UIC.foco) + '</div><div class="mc-papel" data-mc-vivo="planta">' + svgPlantaPorticos(e, UIC.foco) + '</div><div data-mc-vivo="geo-num">' + geoNumeros() + "</div></aside></div>";
    return h;
  }
  function grausTxt() { var i = num(UIC.est.geometria.inclinacaoPct, 10); return "≈ " + fmt(Math.atan(i / 100) * 180 / Math.PI, 1) + "°"; }
  function geoNumeros() {
    var g = UIC.est.geometria, vao = num(g.vao, 0), Lt = num(g.comprimento, 0), e = num(g.espacamento, 6), H = num(g.peDireito, 0), i = num(g.inclinacaoPct, 0) / 100;
    var nV = Math.max(1, Math.round(Lt / (e || 1))), hc = num(g.aguas, 2) === 1 ? H + i * vao : H + i * vao / 2;
    return '<div class="mc-num"><div class="mc-numero"><small>Área coberta</small><b>' + fmt(vao * Lt, 0) + ' m²</b></div><div class="mc-numero"><small>Pórticos</small><b>' + (nV + 1) + ' <span style="font-size:13px;font-weight:600">a cada</span> ' + fmt(Lt / nV, 2) + ' m</b></div><div class="mc-numero"><small>' + (num(g.aguas, 2) === 1 ? "Beiral alto" : "Cumeeira") + "</small><b>" + fmt(hc, 2) + " m</b></div></div>";
  }

  /* ---------------------------------------------------------------- 3. FECHAMENTOS */
  function passoFechamentos() {
    var e = UIC.est, fid = UIC.face, x = e.fechamentos[fid] || face("telha"), fNome = (FACES.filter(function (f) { return f.id === fid; })[0] || {}).nome;
    var h = cab(3, "Fechamentos", "Clique numa face na planta e diga se ela é aberta ou fechada, e com o quê. Portões que podem ficar abertos num temporal mudam a pressão interna — o sistema calcula.");
    h += '<div class="mc-duas"><div><div class="mc-papel" data-mc-vivo="planta-faces">' + svgPlantaFaces(e, fid) + legendaFaces() + "</div>" +
      '<section class="mc-card"><h4>Aplicar a todas as faces</h4><p class="mc-exp">Um clique para começar; depois ajuste cada face.</p><div style="display:flex;flex-wrap:wrap;gap:8px">' +
      TIPOS_FACE.map(function (t) { return '<button class="mc-bt" data-mc-acao="todas" data-mc-v="' + t.id + '">' + esc(t.nome) + "</button>"; }).join("") + "</div></section></div>";
    h += '<aside class="mc-vivo"><section class="mc-card"><h4>' + esc(fNome) + ' <span class="mc-chip info">' + esc((FACES.filter(function (f) { return f.id === fid; })[0] || {}).desc) + "</span></h4>" +
      '<div class="mc-faces" style="margin-top:10px">' + TIPOS_FACE.map(function (t) {
        return '<button class="mc-op" data-mc-acao="face-tipo" data-mc-v="' + t.id + '" aria-pressed="' + (x.tipo === t.id) + '"' + (t.dica ? ' data-dica="' + t.dica + '"' : "") + ">" + miniTipo(t.id) + "<b>" + esc(t.nome) + "</b></button>";
      }).join("") + '</div><p class="mc-exp" style="margin:10px 0 0">' + esc((TIPOS_FACE.filter(function (t) { return t.id === x.tipo; })[0] || {}).desc || "") + "</p>";
    if (x.tipo === "alvenaria" || x.tipo === "misto") {
      var A = F(), grupo = x.bloco || "vedacao-concreto", lista = A ? A.paredes(grupo) : [];
      h += '<div class="mc-campos" style="margin-top:12px">' + seletor("fechamentos." + fid + ".bloco", "Bloco", BLOCOS.map(function (b) { return [b.id, b.nome]; }), { dica: x.tipo === "misto" ? "fechamento-misto" : "fechamento-alvenaria" }) +
        seletor("fechamentos." + fid + ".paredeId", "Espessura (peso NBR 6120)", [["", "Padrão (14 cm)"]].concat(lista.map(function (p) { return [p.id, fmt(p.espessura / 10, p.espessura % 10 ? 1 : 0) + " cm · " + fmt(p.peso, 2) + " kN/m²"]; }))) +
        (x.tipo === "misto" ? campo("fechamentos." + fid + ".alturaAlvenaria", "Altura da alvenaria", "m", { min: 0.3, max: 20, exp: "Telha acima desta altura" }) : "") + "</div>";
    }
    if (x.tipo === "premoldado") {
      var A2 = F(), lp = A2 ? A2.paredes("premoldado") : [];
      h += '<div class="mc-campos" style="margin-top:12px">' + seletor("fechamentos." + fid + ".premoldadoId", "Painel", [["", "Padrão (concreto armado 10 cm)"]].concat(lp.map(function (p) { return [p.id, A2.nome(p) + " · " + fmt(p.peso, 2) + " kN/m²"]; })), { dica: "pre-moldado" }) + "</div>";
    }
    if (x.tipo === "telha" || x.tipo === "misto") {
      var A3 = F(), lt = A3 ? A3.telhas().filter(function (t) { return t.grupo !== "generica"; }) : [];
      h += '<div class="mc-campos" style="margin-top:12px">' + seletor("fechamentos." + fid + ".telhaId", "Telha da parede", [["", "A mesma da cobertura"]].concat(lt.map(function (t) { return [t.id, A3.nome(t)]; })), { dica: "travessa-fechamento", exp: "Presa nas travessas de fechamento (o sistema espaça)" }) + "</div>";
    }
    if (x.tipo !== "aberto") {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-top:14px"><b style="font-size:13px">Portões e aberturas</b> <button type="button" class="mc-i" data-dica="abertura-dominante" aria-label="Abertura dominante">i</button><span style="flex:1"></span><button class="mc-bt" data-mc-acao="portao-mais">+ Portão</button></div>';
      if (!arr(x.portoes).length) h += '<p class="mc-exp" style="margin:6px 0 0">Nenhum portão nesta face.</p>';
      arr(x.portoes).forEach(function (pt, j) {
        var base = "fechamentos." + fid + ".portoes." + j;
        h += '<div class="mc-portao">' + campo(base + ".largura", "Largura", "m", { min: 0.5, max: 60 }) + campo(base + ".altura", "Altura", "m", { min: 0.5, max: 25 }) + campo(base + ".posicao", "Centro do portão", "m", { min: 0, max: 300, ph: "no meio", exp: fid === "frente" || fid === "fundo" ? "Medido da lateral esquerda" : "Medido do oitão da frente" }) +
          '<button class="mc-bt ghost" data-mc-acao="portao-menos" data-mc-v="' + j + '" aria-label="Remover portão" title="Remover">✕</button>' +
          '<label class="mc-ck"><input type="checkbox" data-mc-campo="' + base + '.dominante" data-mc-tipo="bool"' + (pt.dominante ? " checked" : "") + "> Pode ficar aberto num temporal (abertura dominante)</label></div>";
      });
    }
    h += '<div class="mc-papel" style="margin-top:14px" data-mc-vivo="face-elev">' + svgFace(e, fid) + "</div></section></aside></div>";
    return h;
  }
  function miniTipo(t) {
    var f = t === "aberto" ? "#fff" : (t === "telha" ? "repeating-linear-gradient(90deg,#a9bccf 0 5px,#6f86a0 5px 6.5px)" : (t === "alvenaria" ? "repeating-linear-gradient(0deg,#dcb592 0 6px,#a97c57 6px 7px)" : (t === "premoldado" ? "#c7cbd0" : "linear-gradient(180deg,#a9bccf 0 50%,#dcb592 50% 100%)")));
    return '<span class="mc-mini" style="background:' + f + (t === "aberto" ? ";border-style:dashed" : "") + '"></span>';
  }
  function legendaFaces() {
    return '<div class="mc-leg"><span><i style="background:repeating-linear-gradient(90deg,#a9bccf 0 4px,#6f86a0 4px 5px)"></i>telha</span><span><i style="background:#dcb592"></i>alvenaria</span><span><i style="background:linear-gradient(90deg,#a9bccf 50%,#dcb592 50%)"></i>misto</span><span><i style="background:#c7cbd0"></i>pré-moldado</span><span><i style="background:#fff;border-style:dashed"></i>aberta</span><span><i style="background:#fff;border-color:#a86a10"></i>portão que pode ficar aberto</span></div>';
  }

  /* ---------------------------------------------------------------- 4. COBERTURA */
  var ORDEM_GR = ["trapezoidal", "ondulada", "sanduiche", "zipada", "fibrocimento", "generica"];
  function passoCobertura() {
    var e = UIC.est, A = F(), ti = telhaInfo(e), filtro = e.cobertura.filtro || "";
    var h = cab(4, "Cobertura", "A telha decide o espaçamento das terças: o sistema lê a tabela do fabricante NA CARGA DESTA OBRA — a maior entre a sobrecarga da NBR 6120 e a sucção do vento na borda do telhado.");
    if (!A) return h + '<div class="mc-vazio">A lista de telhas (js/acofechamentos.js) não carregou.</div>';
    var lista = A.telhas().filter(function (t) { return !filtro || t.grupo === filtro; });
    lista.sort(function (a, b) { if (a.id === A.PADRAO_TELHA) return -1; if (b.id === A.PADRAO_TELHA) return 1; var d = ORDEM_GR.indexOf(a.grupo) - ORDEM_GR.indexOf(b.grupo); if (d) return d; return String(a.fabricante).localeCompare(String(b.fabricante)) || (a.espessura || 0) - (b.espessura || 0); });
    h += '<div class="mc-duas"><div><section class="mc-card"><h4>Telha da cobertura <span class="mc-chip">' + A.TELHAS.length + " de 5 fabricantes e NBR 6120</span></h4>" +
      '<div class="mc-chips" role="group">' + [["", "Todas"]].concat(ORDEM_GR.map(function (g) { return [g, A.TIPOS_TELHA[g]]; })).map(function (c) { return '<button data-mc-acao="telha-filtro" data-mc-v="' + c[0] + '" aria-pressed="' + (filtro === c[0]) + '">' + esc(c[1]) + "</button>"; }).join("") + "</div>" +
      '<div class="mc-lista" style="max-height:560px;overflow:auto;padding:2px">' + lista.map(function (t) {
        var vm = A.vaoMax(t.id, ti.carga, { uso: "cobertura" }), pz = A.peso(t.id), sel = t.id === e.cobertura.telhaId, incOk = t.inclMin == null || num(e.geometria.inclinacaoPct, 10) + 1e-9 >= t.inclMin;
        return '<button class="mc-li" data-mc-acao="telha" data-mc-v="' + esc(t.id) + '" aria-pressed="' + sel + '"' + (t.grupo === "trapezoidal" ? ' data-dica="telha-trapezoidal"' : (t.grupo === "sanduiche" ? ' data-dica="telha-sanduiche"' : "")) + ' data-dica-lado="direita">' + svgTelha(t.grupo) +
          "<span><b>" + esc(A.nome(t)) + (t.id === A.PADRAO_TELHA ? ' <span class="mc-chip info" style="margin-left:4px">padrão · a mais comum</span>' : "") + "</b><span>" + esc(A.TIPOS_TELHA[t.grupo] || "") + " · " + (pz && pz.valor != null ? fmt(pz.valor, 3) + " kN/m²" + (pz.origem !== "fabricante" ? " (" + (pz.origem === "nbr6120" ? "NBR 6120" : "equivalente") + ")" : "") : "peso a informar") + (t.inclMin != null ? " · incl. mín. " + fmt(t.inclMin, 1) + " %" : "") + "</span></span>" +
          '<span style="text-align:right">' + (vm && vm.vao ? '<b style="font-size:15px">' + fmt(vm.vao, 2) + ' m</b><span style="display:block">vão nesta carga</span>' : (vm && /passa da maior/.test(vm.motivo || "") ? '<span class="mc-chip erro" title="' + esc(vm.motivo) + '">carga acima da tabela</span>' : '<span class="mc-chip aviso">sem tabela de vão</span>')) + (!incOk ? '<span class="mc-chip aviso" style="display:inline-flex;margin-top:4px">inclinação</span>' : "") + "</span></button>";
      }).join("") + "</div></section></div>";
    h += '<aside class="mc-vivo" data-mc-vivo="telha">' + painelTelha() + "</aside></div>";
    return h;
  }
  function painelTelha() {
    var e = UIC.est, A = F(), ti = telhaInfo(e), t = ti.telha, h = "";
    if (!t) return '<div class="mc-card mc-vazio">Escolha uma telha na lista.</div>';
    h += '<section class="mc-card"><h4>' + esc(A.nome(t)) + "</h4>" + '<div class="mc-papel" style="margin:8px 0 10px">' + svgTelha(t.grupo) + "</div>";
    h += '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="mc-grande" data-mc="vao-telha">' + fmt(ti.vaoTercas, 2) + "<small>m</small></span><span class=\"mc-exp\" style=\"margin:0\">entre terças (o menor entre o vão da telha" + (ti.vm && ti.vm.vao ? " — " + fmt(ti.vm.vao, 2) + " m —" : "") + " e o limite de " + fmt(ti.limite, 2) + " m)</span></div>";
    h += '<div class="mc-cadeia">Carga na telha (serviço) = maior entre a sobrecarga <b>' + fmt(num(ti.sobrecarga.q), 2) + " kN/m²</b> (NBR 6120:2019, 6.4) e a sucção local do vento " +
      (ti.succao ? "<b>" + fmt(Math.abs(ti.succao.p), 2) + " kN/m²</b> (" + esc(nomeZona(ti.succao.zona)) + ", S3 = 0,88 das vedações)" : "<b>—</b> (falta o local)") + " → <b>" + fmt(ti.carga, 2) + " kN/m²</b> · governa: " + (ti.governa === "vento" ? "o vento" : "a sobrecarga") + "</div>";
    if (ti.vm && ti.vm.vao) h += '<p class="mc-exp" style="margin:8px 0 0">Tabela do fabricante: ' + esc(ti.vm.condicao) + " — " + esc(ti.vm.fonte || "") + "</p>";
    else if (ti.vm) h += '<ul class="mc-avisos" style="margin-top:8px"><li>' + esc(ti.vm.motivo) + "</li></ul>";
    if (!ti.inclOk) h += '<ul class="mc-avisos" style="margin-top:8px"><li>A telha pede inclinação mínima de ' + fmt(t.inclMin, 1) + " % e o telhado tem " + fmt(num(e.geometria.inclinacaoPct), 1) + " %." + (t.inclObs ? " " + esc(t.inclObs) : "") + "</li></ul>";
    var pz = ti.peso;
    h += '<dl style="display:grid;grid-template-columns:auto 1fr;gap:5px 12px;margin:12px 0 0;font-size:12.8px"><dt style="color:var(--mc-tx2)">Peso</dt><dd style="margin:0">' + (pz && pz.valor != null ? "<b>" + fmt(pz.valor, 3) + " kN/m²</b>" + (t.pesoKg ? " (" + fmt(t.pesoKg, 2) + " kg/m²)" : "") + " — " + esc(pz.texto) : "a informar") + "</dd>" +
      (t.larguraUtil ? '<dt style="color:var(--mc-tx2)">Largura útil</dt><dd style="margin:0">' + fmt(t.larguraUtil, 3) + " m" + (t.alturaOnda ? " · onda " + fmt(t.alturaOnda, 0) + " mm" : "") + "</dd>" : "") +
      (t.isolante ? '<dt style="color:var(--mc-tx2)">Isolante</dt><dd style="margin:0">' + fmt(t.isolante, 0) + " mm" + (t.U ? " · U = " + fmt(t.U, 2) + " W/m²K" : "") + "</dd>" : "") +
      (t.acabamento ? '<dt style="color:var(--mc-tx2)">Acabamento</dt><dd style="margin:0">' + esc(t.acabamento) + "</dd>" : "") + "</dl>";
    var cg = (t.cores && t.cores.grupos) || [];
    if (cg.length) h += '<div style="margin-top:12px"><b style="font-size:12.5px">Cores do catálogo</b><div class="mc-cores" style="margin-top:6px">' + cg.map(function (g0) { return g0.itens.map(function (c) { return '<span class="mc-cor" title="' + esc(g0.grupo) + '"><i style="background:' + corAprox(c) + '"></i>' + esc((c.nome || "") + (c.codigo ? " " + c.codigo : "")) + "</span>"; }).join(""); }).join("") + "</div>" + (t.cores.obs ? '<p class="mc-exp" style="margin:6px 0 0">' + esc(t.cores.obs) + " Cor na tela aproximada.</p>" : '<p class="mc-exp" style="margin:6px 0 0">Cor na tela aproximada; vale a do catálogo.</p>') + "</div>";
    var ls = arr(t.links);
    if (ls.length) h += '<div class="mc-links">' + ls.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + (l.tipo === "video" ? "▶ Vídeo oficial" : "Manual de instalação") + "</a>"; }).join("") + "</div>";
    h += "</section>";
    h += '<section class="mc-card"><h4>Instalações e forro <button type="button" class="mc-i" data-dica="terca" aria-label="Terça">i</button></h4><p class="mc-exp">Luminárias, eletrocalhas, sprinklers, forro e painéis solares pendurados na estrutura: são cargas PERMANENTES (NBR 6120:2019, 6.4).</p><div class="mc-campos">' +
      campo("cobertura.extra", "Permanente extra", "kN/m²", { min: 0, max: 3, exp: "Em projeção horizontal · partida 0,10" }) + "</div>" +
      (num(e.geometria.inclinacaoPct, 10) < 5 ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.8px"><input type="checkbox" data-mc-campo="cobertura.empocamento" data-mc-tipo="bool"' + (e.cobertura.empocamento ? " checked" : "") + "> Empoçamento verificado (NBR 6120, Anexo D) — sobrecarga de 0,25 kN/m²</label>" : "") +
      '<p class="mc-exp" style="margin:10px 0 0">' + esc(ti.sobrecarga.texto || "") + "</p></section>";
    return h;
  }
  var RAL = { "RAL 9003": "#ecece7", "RAL 7035": "#cbd0cc", "RAL 1015": "#e6d2b5", "RAL 5010": "#13447c", "RAL 9006": "#a1a1a0", "RAL 3000": "#a72920", "RAL 9002": "#e7ebda", "RAL 9010": "#f1ece1" };
  var NOMES_COR = { amarelo: "#e8b923", azul: "#2f6db3", verde: "#3f8f4a", vermelho: "#b8352e", branco: "#f4f4f2", bege: "#d9c7a3", marrom: "#7a5136", cinza: "#9aa0a6", galvalume: "#c3c7c9" };
  function corAprox(c) { var k = String(c.codigo || "").trim(); if (RAL[k]) return RAL[k]; var n = String(c.nome || "").toLowerCase(); for (var x in NOMES_COR) if (n.indexOf(x) >= 0) return NOMES_COR[x]; return "linear-gradient(135deg,#ddd,#bbb)"; }

  /* ---------------------------------------------------------------- 5. PERFIS E AÇOS */
  function passoPerfis() {
    var e = UIC.est, pa = partida(e), M = MAT();
    var h = cab(5, "Perfis e aços", "No automático, o sistema parte de um perfil da família e troca pelo MAIS LEVE que passa em todas as verificações — e diz o porquê. Se preferir, escolha você e o sistema só verifica.");
    h += '<div class="mc-duas"><div><section class="mc-card"><h4>Quem escolhe os perfis</h4><div class="mc-ops larg" style="margin-top:8px">' +
      '<button class="mc-op" data-mc-acao="perfis-modo" data-mc-v="auto" aria-pressed="' + (e.perfis.modo !== "manual") + '"><b>Automático</b><span>O sistema escolhe o mais leve que passa (recomendado).</span></button>' +
      '<button class="mc-op" data-mc-acao="perfis-modo" data-mc-v="manual" aria-pressed="' + (e.perfis.modo === "manual") + '"><b>Eu escolho</b><span>O sistema só verifica e mostra o que não passa, com a troca sugerida.</span></button></div></section>';
    h += '<section class="mc-card"><h4>Família de perfis</h4><p class="mc-exp">O otimizador anda dentro da família, do mais leve para o mais pesado.</p><div class="mc-ops q3">' +
      FAMILIAS.map(function (f) { var d = global.MetalDicas && MetalDicas.obter(f.dica); return '<button class="mc-op" data-mc-acao="familia" data-mc-v="' + f.id + '" aria-pressed="' + (e.perfis.familia === f.id) + '" data-dica="' + f.dica + '">' + (d ? '<span style="display:block;background:#f6f9fc;border-radius:8px">' + d.svg + "</span>" : "") + "<b>" + esc(f.nome) + "</b><span>" + esc(f.desc) + "</span></button>"; }).join("") + "</div>" +
      '<p class="mc-exp" style="margin:10px 0 0">Partida: pilar <b>' + esc(pa.pilar || "—") + "</b> · viga <b>" + esc(pa.viga || "—") + "</b> · tapamento <b>" + esc(pa.tapamento || "—") + "</b></p></section>";
    if (e.perfis.modo === "manual") {
      var C0 = P(), fam = FAMILIAS.filter(function (f) { return f.id === e.perfis.familia; })[0] || FAMILIAS[0];
      function lista(serie) { return C0 ? C0.listar(serie).filter(function (n) { return !fam.filtro || fam.filtro.test(n) || serie !== "GERDAU"; }) : []; }
      h += '<section class="mc-card"><h4>Perfis escolhidos</h4><div class="mc-campos">' +
        seletor("perfis.pilar", "Pilar", [["", "Partida: " + (pa.pilar || "—")]].concat(lista(fam.pilar).map(function (n) { return [n, n]; })), { dica: "pilar" }) +
        seletor("perfis.viga", "Viga de cobertura", [["", "Partida: " + (pa.viga || "—")]].concat(lista(fam.viga).map(function (n) { return [n, n]; })), { dica: "viga-cobertura" }) +
        seletor("perfis.tapamento", "Coluna de tapamento", [["", "Partida: " + (pa.tapamento || "—")]].concat(lista("GERDAU").filter(function (n) { return /^W /.test(n); }).map(function (n) { return [n, n]; })), { dica: "coluna-tapamento" }) + "</div></section>";
    }
    h += '</div><aside class="mc-vivo"><section class="mc-card"><h4>Aços</h4><p class="mc-exp">Limites de escoamento e ruptura dos catálogos dos fabricantes (mínimos especificados).</p><div class="mc-campos um">';
    function opAcos(tipos) { return M ? M.ACOS.filter(function (a) { return tipos.indexOf(a.tipo) >= 0; }).map(function (a) { return [a.id, a.id + " — fy " + a.fy + " / fu " + a.fu + " MPa"]; }) : []; }
    h += seletor("acos.perfil", "Perfis laminados e soldados", opAcos(["perfil", "chapa"])) + seletor("acos.frio", "Formados a frio (terças)", opAcos(["frio"])) + seletor("acos.barra", "Barras e tirantes", opAcos(["chapa", "perfil"]));
    h += '</div></section><section class="mc-card"><h4>Estabilidade</h4><p class="mc-exp">O sistema reconhece os travamentos e os comprimentos de flambagem sozinho. Aqui só a preferência — se faltar estabilidade, ele propõe a solução.</p>' +
      '<b style="font-size:12.5px">Contraventamento</b><div class="mc-ops" style="margin:6px 0 12px">' + CONTRAVENTOS.map(function (c) { return '<button class="mc-op" data-mc-acao="contravento" data-mc-v="' + c.id + '" aria-pressed="' + (e.contraventamento === c.id) + '"' + (c.dica ? ' data-dica="' + c.dica + '"' : "") + "><b>" + esc(c.nome) + "</b><span>" + esc(c.desc) + "</span></button>"; }).join("") + "</div>" +
      '<b style="font-size:12.5px">Mãos-francesas</b> <button type="button" class="mc-i" data-dica="mao-francesa" aria-label="Mão-francesa">i</button><div style="margin-top:6px">' + seg("maofrancesa", e.maoFrancesa, MAOS.map(function (m) { return [m.id, m.nome]; })) + "</div></section>" +
      '<section class="mc-card"><h4>Fundação <button type="button" class="mc-i" data-dica="' + (e.geometria.base === "engastada" ? "placa-base-engastada" : "placa-base-rotulada") + '" aria-label="Placa de base">i</button></h4><p class="mc-exp">O concreto do bloco onde a placa de base apoia: entra na pressão sob a placa e na ancoragem dos chumbadores (as ligações saem calculadas).</p><div class="mc-campos">' +
      seletor("fundacao.fck", "Concreto do bloco (fck)", [["", "— informe —"], [20, "C20 — 20 MPa"], [25, "C25 — 25 MPa"], [30, "C30 — 30 MPa"], [35, "C35 — 35 MPa"], [40, "C40 — 40 MPa"]]) +
      /* #57 (3) (16/10/2026): sem fck a placa de base fica A CONFIRMAR — a tela CHAMA para informar (antes só o seletor vazio) */
      (num(e.fundacao && e.fundacao.fck, 0) > 0 ? "" : '<p class="mc-exp" data-mc="fck-chamada" style="color:#b45309;font-weight:600;margin:6px 0">Informe o fck para liberar a placa de base — sem ele a placa fica A CONFIRMAR (não sai aprovada).</p>') +
      campo("fundacao.A2_A1", "Relação de áreas A2/A1", "", { min: 1, max: 4, exp: "Bloco ÷ placa; 1 é o mais conservador" }) + "</div></section></aside></div>";
    return h;
  }

  /* ---------------------------------------------------------------- 6. REVISÃO */
  function passoRevisao() {
    var e = UIC.est, g = e.geometria, val = validar(e), ti = telhaInfo(e), Vr = ventoPrevia(e), A = F(), pa = perfisDoCalculo(e);
    var h = cab(6, "Revisão e cálculo", "Confira o que vai para o cálculo. O que é de norma o sistema decide sozinho — e mostra cada decisão com o motivo no resultado.");
    if (val.falta.length) h += '<ul class="mc-avisos">' + val.falta.map(function (f) { return '<li class="erro">' + esc(f.texto) + ' <button class="mc-ed" data-mc-acao="passo" data-mc-v="' + f.passo + '">Resolver</button></li>'; }).join("") + "</ul>";
    if (val.atencao.length) h += '<ul class="mc-avisos">' + val.atencao.map(function (f) { return "<li>" + esc(f.texto) + ' <button class="mc-ed" data-mc-acao="passo" data-mc-v="' + f.passo + '">Ver</button></li>'; }).join("") + "</ul>";
    /* em cima: o galpão desenhado e o que o sistema decide; embaixo, os cinco cartões na largura toda */
    h += '<div class="mc-topo-rev"><div class="mc-papel">' + svgGalpao3D(e, 640, 300, "O galpão que vai ser calculado") + "</div>" +
      '<div><section class="mc-card"><h4>O sistema decide sozinho</h4><ul class="mc-decide"><li>Terças pelo vão da telha</li><li>Travessas de fechamento</li><li>Colunas de tapamento dos oitões</li><li>Contraventamento e caminho do vento</li><li>Mãos-francesas onde a mesa comprime</li><li>Flambagem e travamentos</li><li>2ª ordem e deslocabilidade</li><li>Combinações (NBR 8681/8800)</li><li>O perfil mais leve que passa</li><li>Reações para a fundação</li></ul></section>' +
      '<div class="mc-cta"><button class="mc-bt cta" data-mc-acao="calcular"' + (val.ok ? "" : " disabled") + ">" + ico("raio", 17) + ' Calcular o galpão</button><span class="mc-exp" style="margin:0">Roda em paralelo: a tela continua livre.</span></div></div></div>';
    h += '<div class="mc-rev">';
    function cartao(n, tit, linhas) { return '<section class="mc-card"><h4>' + esc(tit) + '<button class="mc-ed" data-mc-acao="passo" data-mc-v="' + n + '">Editar</button></h4><dl>' + linhas.map(function (l) { return "<dt>" + esc(l[0]) + "</dt><dd>" + l[1] + "</dd>"; }).join("") + "</dl></section>"; }
    var nV = Math.max(1, Math.round(num(g.comprimento) / num(g.espacamento, 6)));
    h += cartao(1, "Local e vento", [["Local", esc(e.local.endereco ? e.local.endereco.split(",").slice(0, 2).join(",") : (isFinite(num(e.local.lat, NaN)) ? fmt(num(e.local.lat), 4) + "°; " + fmt(num(e.local.lon), 4) + "°" : "—"))], ["V0", Vr && Vr.ok ? fmt(Vr.v0, 0) + " m/s" : "—"], ["Topografia", esc((S1S.filter(function (s) { return s.id === e.vento.s1.tipo; })[0] || {}).nome || "")], ["Rugosidade", "Categoria " + esc(e.vento.categoria)], ["Uso (S3)", "Grupo " + e.vento.grupoS3 + " · " + fmt(s3De(e.vento.grupoS3), 2)], ["q", Vr && Vr.ok ? fmt(Vr.q, 3) + " kN/m²" : "—"]]);
    h += cartao(2, "Geometria", [["Vão × comprimento", fmt(num(g.vao), 2) + " × " + fmt(num(g.comprimento), 2) + " m"], ["Pórticos", (nV + 1) + " a cada " + fmt(num(g.comprimento) / nV, 2) + " m"], ["Pé-direito", fmt(num(g.peDireito), 2) + " m"], ["Telhado", (num(g.aguas, 2) === 1 ? "uma água" : "duas águas") + ", " + fmt(num(g.inclinacaoPct), 1) + " %"], ["Base", g.base === "engastada" ? "engastada" : "rotulada"]]);
    h += cartao(3, "Fechamentos", FACES.map(function (f) { var x = e.fechamentos[f.id] || {}; return [f.nome, esc(nomeTipo(x.tipo)) + (x.tipo === "misto" ? " até " + fmt(num(x.alturaAlvenaria), 2) + " m" : "") + (x.tipo !== "aberto" && arr(x.portoes).length ? " · " + arr(x.portoes).length + (arr(x.portoes).length > 1 ? " portões" : " portão") : "")]; }));
    h += cartao(4, "Cobertura", [["Telha", esc(ti.telha ? (ti.telha.modelo || "") + (ti.telha.espessura != null && ti.telha.espessura < 2 ? " " + fmt(ti.telha.espessura, 2) + " mm" : "") : "—")], ["Fabricante", esc(ti.telha ? ti.telha.fabricante || "—" : "—")], ["Carga na telha", fmt(ti.carga, 2) + " kN/m² (" + (ti.governa === "vento" ? "vento" : "sobrecarga") + ")"], ["Terças", "a cada até " + fmt(ti.vaoTercas, 2) + " m"], ["Permanente extra", fmt(num(e.cobertura.extra), 2) + " kN/m²"]]);
    h += cartao(5, "Perfis e aços", [["Modo", e.perfis.modo === "manual" ? "escolhidos (verificar)" : "automático"], ["Pilar", esc(pa.pilar || "—")], ["Viga", esc(pa.viga || "—")], ["Aço dos perfis", esc(e.acos.perfil)], ["Contraventamento", esc((CONTRAVENTOS.filter(function (c) { return c.id === e.contraventamento; })[0] || {}).nome || "")]]);
    return h + "</div>";
  }

  /* ================================================================ MODELOS PRONTOS */
  function modelosHtml() {
    var e = UIC.est;
    var h = '<div class="mc-ph"><div><h3>Modelos prontos</h3><p>Escolha o mais parecido com a obra e ajuste no assistente. O local e o vento que você já informou continuam.</p></div></div><div class="mc-modelos">';
    MODELOS.forEach(function (m) {
      var est = copia(e); est.geometria = copia(m.geometria); est.fechamentos = copia(m.fechamentos);
      h += '<button class="mc-mod' + (e.modelo === m.id ? " atual" : "") + '" data-mc-acao="usar-modelo" data-mc-v="' + m.id + '"><div class="mc-fig">' + svgGalpao3D(est, 300, 170, m.nome) + '</div><div class="mc-mc"><b>' + esc(m.nome) + "</b><p>" + esc(m.desc) + '</p><div class="mc-ds">' +
        '<span class="mc-chip">' + fmt(m.geometria.vao, 0) + " × " + fmt(m.geometria.comprimento, 0) + " m</span>" + '<span class="mc-chip">pé-direito ' + fmt(m.geometria.peDireito, 1) + " m</span>" + m.tags.map(function (t) { return '<span class="mc-chip info">' + esc(t) + "</span>"; }).join("") +
        '</div><span class="mc-usar">' + (e.modelo === m.id ? "Em uso — ajustar" : "Usar este modelo") + " →</span></div></button>";
    });
    return h + "</div>";
  }
  function usarModelo(id) {
    var m = MODELOS.filter(function (x) { return x.id === id; })[0]; if (!m) return false;
    var e = UIC.est;
    e.modelo = m.id; e.geometria = copia(m.geometria); e.fechamentos = copia(m.fechamentos);
    /* o modelo é um começo LIMPO: o que ele não define volta ao padrão (antes, o grupo S3 = 3 do
       logístico e um contraventamento escolhido à mão ficavam no modelo seguinte) */
    e.vento.grupoS3 = m.extra.grupoS3 || PADRAO.vento.grupoS3;
    e.contraventamento = m.extra.contraventamento || "auto"; e.maoFrancesa = "auto";
    e.cvModelo = m.extra.contraventamento ? { id: m.extra.contraventamento, modelo: m.nome, motivo: m.extra.cvMotivo || "" } : null;
    e.perfis.partida = {};
    salvar(true);
    UIC.modo = "assistente"; UIC.passo = ventoEntrada(e) ? 2 : 1; UIC.face = "frente";
    render();
    toast("Modelo \"" + m.nome + "\" carregado — ajuste o que for diferente na obra.", "ok", 5000);
    return true;
  }

  /* ================================================================ LOCALIZAR (endereço → coordenadas) */
  function lerCoord(txt) {
    var G0 = global.IcarGeo;
    if (G0 && G0.lerCoordenada) { try { var c = G0.lerCoordenada(txt); if (c) return c; } catch (e) {} }
    var m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(String(txt || "").replace(/[−–]/g, "-"));
    if (m) { var la = num(m[1]), lo = num(m[2]); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lon: lo, fonte: "coordenadas" }; }
    return null;
  }
  function usarLocal(lat, lon, fonte, endereco) {
    var l = UIC.est.local;
    l.lat = Math.round(lat * 1e6) / 1e6; l.lon = Math.round(lon * 1e6) / 1e6; l.fonte = fonte || ""; l.endereco = endereco || "";
    UIC.busca = null; salvar(); UIC.manterRolagem = true; render();
  }
  function localizar() {
    var txt = String(UIC.est.local.texto || "").replace(/[−–]/g, "-").trim(), c = lerCoord(txt);
    if (c) { usarLocal(c.lat, c.lon, c.fonte || "coordenadas", ""); toast("Obra localizada pelas " + (c.fonte || "coordenadas") + ".", "ok", 4000); return; }
    if (txt.length < 4) { UIC.busca = { erro: "Escreva o endereço (rua, número, cidade/UF), cole o link do mapa ou as coordenadas." }; render(); return; }
    var g = Ges();
    if (!g || !g._icarGeoPost) { UIC.busca = { erro: "A busca de endereço não está disponível nesta tela: digite as coordenadas." }; render(); return; }
    UIC.buscando = true; UIC.busca = null; UIC.manterRolagem = true; render();
    g._icarGeoPost("/ia/geo/busca", { q: txt }).then(function (x) {
      UIC.buscando = false;
      if (!x || x.s !== 200 || !x.j || !x.j.ok) { UIC.busca = { erro: (g._icarGeoErro ? g._icarGeoErro(x, "Endereço") : "A busca não respondeu.") + " Digite as coordenadas ou cole o link do mapa." }; }
      else {
        var L = arr(x.j.resultados).slice(0, 5);
        if (!L.length) UIC.busca = { erro: "Não achei esse endereço. Tente com cidade e estado, ou cole o link do Google Maps." };
        else if (L.length === 1) { usarLocal(+L[0].lat, +L[0].lon, "endereço (OpenStreetMap)", L[0].nome); return; }
        else UIC.busca = { lista: L, atrib: x.j.atribuicao || "" };
      }
      UIC.manterRolagem = true; if (raiz()) render();
    }, function () { UIC.buscando = false; UIC.busca = { erro: "Sem conexão com a busca de endereço: digite as coordenadas." }; if (raiz()) render(); });
  }

  /* ================================================================ CÁLCULO (Worker) */
  /* as etapas na ordem em que o orquestrador as faz; as de "rodada" se repetem a cada
     rodada da otimização (o Worker avisa a rodada quando o montador de cargas é chamado) */
  var ETAPAS = [
    { id: "motores", nome: "Carregando os motores do cálculo (catálogo de perfis, vento, análise, NBR 8800)" },
    { id: "vento", nome: "Vento da obra (NBR 6123): pressões por face e casos" },
    { id: "secundarias", nome: "Terças e travessas (NBR 14762): o perfil Ue mais leve e as correntes" },
    { id: "modelo", nome: "Modelo e cargas do pórtico: travamentos e comprimentos de flambagem", rodada: true },
    { id: "analise", nome: "Análise de 2ª ordem de todas as combinações", rodada: true },
    { id: "analise80", nome: "Deslocabilidade: rigidez reduzida a 80 %", rodada: true },
    { id: "verificacao", nome: "Mãos-francesas e verificações da NBR 8800, barra a barra", rodada: true },
    { id: "flambagem", nome: "Flambagem global (fator de carga crítica)", rodada: true },
    { id: "ligacoes", nome: "Ligações: placas de base, joelho, cumeeira, clip e contraventamento" }
  ];
  function versao() { try { return (global.CONFIG && CONFIG.versao) || ""; } catch (e) { return ""; } }
  function calcular(op) {
    if (!lic("calcular a estrutura")) return false;
    var e = UIC.est, val = validar(e);
    if (!val.ok) { UIC.modo = "assistente"; UIC.passo = val.falta[0].passo; render(); toast(val.falta[0].texto, "aviso", 6000); return false; }
    salvar(true);
    var par = parametros(e);
    op = op || {};
    var opc = {};   /* quantas rodadas de otimização: decisão do motor (2 a 4 em geral) */
    if (e.perfis.modo === "manual") opc.semOtimizar = true;
    if (op.aplicarSugestao) opc.aplicarSugestao = true;
    UIC.calc = { rodando: true, t0: Date.now(), etapa: "motores", rodada: 0, feitas: {}, comb: 0, n: 0, par: par, op: opc, modo: null, decisoesTela: decisoesTela(e) };
    UIC.modo = "calculando"; render();
    /* o relógio e as etapas andam mesmo sem mensagem nova do Worker */
    var relogio = setInterval(function () { if (!UIC.calc || UIC.modo !== "calculando") { clearInterval(relogio); return; } var el = doc && doc.querySelector("[data-mc='progresso']"); if (el) el.innerHTML = progressoHtml(); }, 500);
    var id = "c" + Date.now();
    UIC.calc.id = id;
    var w = null;
    try { w = new global.Worker("js/acocalcworker.js" + (versao() ? "?v=" + encodeURIComponent(versao()) : "")); } catch (eW) { w = null; }
    if (!w) { naPagina(par, opc, "o navegador não abriu o processo paralelo"); return true; }
    UIC.calc.worker = w; UIC.calc.modo = "worker"; UIC.modo_calc = "worker";
    w.onmessage = function (ev) {
      var m = ev.data || {}; if (!UIC.calc || m.id !== UIC.calc.id) return;
      if (m.tipo === "progresso") progresso(m);
      else if (m.tipo === "motores") { UIC.calc.motores = m; UIC.calc.feitas.motores = true; if (UIC.calc.etapa === "motores") UIC.calc.etapa = null; }
      else if (m.tipo === "fim") { var r = null; try { r = m.texto ? JSON.parse(m.texto) : m.r; } catch (eP) { r = { ok: false, motivo: "resultado ilegível: " + eP.message }; } terminar(r, m.ms); }
      else if (m.tipo === "erro") { try { w.terminate(); } catch (eT) {} if (/Não carregou/.test(m.mensagem || "")) naPagina(par, opc, m.mensagem); else falhou(m.mensagem, m.pilha); }
    };
    w.onerror = function (ev) { if (!UIC.calc || UIC.calc.id !== id) return; try { w.terminate(); } catch (eT) {} if (ev && ev.preventDefault) ev.preventDefault(); naPagina(par, opc, "o processo paralelo falhou (" + ((ev && ev.message) || "erro") + ")"); };
    w.postMessage({ tipo: "calcular", id: id, par: par, op: opc });
    return true;
  }
  /* sem Worker: roda na página (a tela para enquanto calcula — avisado) */
  function naPagina(par, opc, motivo) {
    var W = global.AcoCalcWorker, c = UIC.calc;
    if (!c) return;
    c.modo = "pagina"; UIC.modo_calc = "pagina"; c.worker = null; c.motivo = motivo;
    if (!W) { falhou("O cálculo não carregou nesta tela (js/acocalcworker.js)."); return; }
    render();
    setTimeout(function () {
      if (!UIC.calc || UIC.calc !== c) return;
      var t0 = Date.now(), r;
      try { r = W.limpo(W.rodar(par, opc, function (p) { c.etapa = p.etapa; })); } catch (e) { falhou(e && e.message ? e.message : String(e), e && e.stack); return; }
      terminar(r, Date.now() - t0);
    }, 60);
  }
  function progresso(m) {
    var c = UIC.calc; if (!c) return;
    /* rodada nova: as etapas de rodada voltam a "a fazer"; as de antes (motores, vento, terças) ficam feitas */
    if (m.rodada && m.rodada !== c.rodada) { c.rodada = m.rodada; ETAPAS.forEach(function (et) { if (et.rodada) delete c.feitas[et.id]; else if (et.id !== "ligacoes") c.feitas[et.id] = true; }); }
    if (c.etapa && c.etapa !== m.etapa) c.feitas[c.etapa] = true;
    if (m.etapa === "ligacoes") ETAPAS.forEach(function (et) { if (et.id !== "ligacoes") c.feitas[et.id] = true; });
    c.etapa = m.etapa; if (m.combinacoes) c.comb = m.combinacoes; if (m.n) c.n = m.n;
    var el = doc && doc.querySelector("[data-mc='progresso']");
    if (el) el.innerHTML = progressoHtml();
  }
  function cancelar() {
    var c = UIC.calc; if (!c) return;
    if (c.worker) { try { c.worker.terminate(); } catch (e) {} }
    UIC.calc = null; UIC.modo = "assistente"; UIC.passo = PASSOS.length; render();
    toast("Cálculo cancelado.", "aviso", 3000);
  }
  function falhou(msg, pilha) {
    var c = UIC.calc; UIC.calc = null;
    UIC.r = { ok: false, motivo: "Erro no cálculo: " + (msg || "desconhecido"), pilha: pilha || "", erroInterno: true, decisoesTela: c && c.decisoesTela };
    UIC.modo = "resultado"; render();
  }
  function terminar(r, ms) {
    var c = UIC.calc; UIC.calc = null;
    if (c && c.worker) { try { c.worker.terminate(); } catch (e) {} }
    r = r || { ok: false, motivo: "O motor não devolveu resultado." };
    r.decisoesTela = c ? c.decisoesTela : [];
    r.tempoTela = ms || (c ? Date.now() - c.t0 : 0); r.modoCalculo = c ? c.modo : null;
    if (UIC.alt && UIC.alt.worker) { try { UIC.alt.worker.terminate(); } catch (eA) {} }
    UIC.r = r; UIC.rTempo = Date.now(); UIC.rPar = c ? c.par : null; UIC.alt = null;
    salvar(true);
    UIC.modo = "resultado"; render();
    /* o mesmo número do card "Aço total" (pórticos + terças + travessas); a taxa é a dos pórticos */
    status(r.ok ? ("Cálculo do galpão: " + (r.aprovado ? "APROVADO" : "REPROVADO (" + r.falhas + " falha(s))") + " — " + fmt(num(r.pesoTotal, num(r.peso, 0)), 0) + " kg de aço" +
      (num(r.pesoTotal, 0) > num(r.peso, 0) + 0.5 ? " (pórticos " + fmt(r.peso, 0) + " kg, " + fmt(r.taxa, 1) + " kg/m²)." : ", " + fmt(r.taxa, 1) + " kg/m².")) : ("Cálculo do galpão: " + (r.motivo || "não calculou")));
  }
  function calculandoHtml() {
    var c = UIC.calc || {};
    return '<div class="mc-prog">' + svgCalculando() + "<h3>Calculando o galpão</h3><p>" + (c.modo === "pagina" ? "Rodando na própria página (" + esc(c.motivo || "") + ") — a tela fica parada até terminar." : "O motor trabalha em paralelo; esta janela continua respondendo.") + '</p><div data-mc="progresso">' + progressoHtml() + "</div></div>";
  }
  function progressoHtml() {
    var c = UIC.calc || {}, seg = Math.round((Date.now() - (c.t0 || Date.now())) / 1000);
    var h = '<div style="display:flex;justify-content:center;gap:10px;margin:16px 0 8px;flex-wrap:wrap"><span class="mc-chip info">' + (c.rodada ? "Rodada " + c.rodada + " do pórtico — otimizando os perfis" : (c.etapa === "vento" ? "Vento" : (c.etapa === "secundarias" ? "Terças e travessas" : "Preparando"))) + '</span><span class="mc-chip">' + seg + " s</span>" + (c.comb ? '<span class="mc-chip">' + c.comb + " combinações</span>" : "") + "</div>";
    h += '<div class="mc-barra corre" style="max-width:460px;margin:0 auto"><i></i></div><ul class="mc-etapas">';
    ETAPAS.forEach(function (et) {
      if (et.id === "vento" && !(c.par && c.par.vento)) return;
      if (et.id === "motores" && c.modo === "pagina") return;
      var cls = c.etapa === et.id ? "agora" : (c.feitas && c.feitas[et.id] ? "feito" : "");
      h += '<li class="' + cls + '"><i></i>' + esc(et.nome) + (et.id === "verificacao" && c.etapa === et.id && c.n ? " · " + c.n + " verificações" : "") + "</li>";
    });
    return h + "</ul>";
  }
  /* as decisões que a TELA tomou (telha, vento) — entram no resultado junto com as do motor */
  function decisoesTela(e) {
    var o = [], ti = telhaInfo(e), A = F(), Vr = ti.vento;
    if (Vr && Vr.ok) o.push({ tema: "Vento", decisao: "V0 = " + fmt(Vr.v0, 0) + " m/s; S1 = " + fmt(Vr.s1 && Vr.s1.valor, 2) + "; S2 = " + fmt(Vr.s2 && Vr.s2.valor, 3) + " (categoria " + e.vento.categoria + ", classe " + (Vr.s2 && Vr.s2.classe) + "); S3 = " + fmt(Vr.s3, 2) + " → q = " + fmt(Vr.q, 3) + " kN/m²; " + arr(Vr.casos).length + " casos de vento", motivo: (Vr.v0Info && Vr.v0Info.mapa && Vr.v0Info.mapa.texto) || "NBR 6123" });
    if (ti.telha) o.push({ tema: "Telha e terças", decisao: "terças a cada até " + fmt(ti.vaoTercas, 2) + " m (" + A.nome(ti.telha) + ")", motivo: "carga de serviço na telha " + fmt(ti.carga, 2) + " kN/m² (" + (ti.governa === "vento" ? "sucção local do vento " + nomeZona(ti.succao && ti.succao.zona) : "sobrecarga NBR 6120") + "); " + (ti.vm && ti.vm.vao ? ti.vm.texto : "sem tabela de vão: limite de " + fmt(ti.limite, 2) + " m") });
    var pa = perfisDoCalculo(e);
    if (e.contraventamento && e.contraventamento !== "auto") {
      var cvN = (CONTRAVENTOS.filter(function (c) { return c.id === e.contraventamento; })[0] || {}).nome || e.contraventamento, sol = UIC.solucao && UIC.solucao.id === e.contraventamento;
      var doModelo = !sol && e.cvModelo && e.cvModelo.id === e.contraventamento;
      o.push({ tema: "Estabilidade", decisao: "contraventamento: " + cvN + (sol ? " — solução proposta pelo sistema, escolhida pelo usuário" : (doModelo ? " — do modelo pronto “" + e.cvModelo.modelo + "”" : " — preferência do usuário")),
               motivo: sol ? "o cálculo anterior parou: " + UIC.solucao.problema : (doModelo ? e.cvModelo.motivo : "escolhido no assistente (passo Perfis e aços); no automático o sistema decide") });
    }
    if (e.perfis.modo !== "manual") o.push({ tema: "Perfis de partida", decisao: "pilar " + pa.pilar + ", viga " + pa.viga + " (família " + ((FAMILIAS.filter(function (f) { return f.id === e.perfis.familia; })[0] || {}).nome || "") + ")", motivo: "o mais leve da família com altura ≥ vão/50 (mínimo 310 mm) — partida que a 2ª ordem aceita; o otimizador sobe ou desce até o mais leve que passa" });
    return o;
  }

  /* ================================================================ COMPARAR A BASE (rotulada × engastada)
     O motor calcula o MESMO galpão com a outra condição de base (AcoDimensionar.alternativaBase) e
     devolve o texto da comparação e o resultado completo — que a pessoa pode adotar com um clique.
     Roda num Worker próprio: o resultado atual continua na tela enquanto a alternativa calcula. */
  function resumoAtual(r) {
    var o = { ok: r.ok, aprovado: r.aprovado, peso: r.peso, pesoTotal: r.pesoTotal, taxa: r.taxa, grupos: {}, ligacoes: null, reacoes: {} };
    ["pilar", "viga"].forEach(function (k) { if (r.grupos && r.grupos[k]) o.grupos[k] = { perfil: r.grupos[k].perfil }; });
    if (r.ligacoes && r.ligacoes.base) o.ligacoes = { base: { resumo: r.ligacoes.base.resumo } };
    Object.keys(r.reacoes || {}).forEach(function (k) { o.reacoes[k] = { envELU: r.reacoes[k].envELU }; });
    return o;
  }
  function baseDe(r) { return (r && r.parametros && r.parametros.geometria && r.parametros.geometria.base) || (UIC.rPar && UIC.rPar.geometria && UIC.rPar.geometria.base) || "rotulada"; }
  /* ⚠ a comparação CALCULA o galpão de novo (no Worker) e "Usar a base engastada" troca o resultado: é cálculo, não consulta
     (revisão adversarial 21/10/2026 — com o teste vencido e a janela aberta, saía um dimensionamento novo sem licença) */
  function compararBase() {
    var r = UIC.r; if (!r || !r.ok || (UIC.alt && UIC.alt.estado === "rodando")) return;
    if (!lic("comparar a base dos pilares")) return;
    var par = JSON.parse(JSON.stringify(UIC.rPar || parametros(UIC.est))), atual = resumoAtual(r);
    par.geometria.base = baseDe(r);
    var A = UIC.alt = { estado: "rodando", base: par.geometria.base === "engastada" ? "rotulada" : "engastada", t0: Date.now(), id: "a" + Date.now(), etapa: "", rodada: 0 };
    redesenharAlt();
    var tick = setInterval(function () { if (UIC.alt !== A || A.estado !== "rodando") { clearInterval(tick); return; } redesenharAlt(); }, 700);
    function fim(res) {
      clearInterval(tick); if (UIC.alt !== A) return;
      if (A.worker) { try { A.worker.terminate(); } catch (e) {} A.worker = null; }
      if (!res || !res.ok) { A.estado = "erro"; A.motivo = (res && (res.motivo || (arr(res.problemas)[0] || {}).texto)) || "a alternativa não fechou"; }
      else { A.estado = "pronto"; A.res = res; }
      A.ms = Date.now() - A.t0; redesenharAlt();
    }
    var w = null; try { w = new global.Worker("js/acocalcworker.js" + (versao() ? "?v=" + encodeURIComponent(versao()) : "")); } catch (e) { w = null; }
    if (!w) { setTimeout(function () { var W = global.AcoCalcWorker, res = null; try { res = W ? W.limpo(W.rodarAlternativa(par, {}, atual)) : null; } catch (e) { res = { ok: false, motivo: e.message }; } fim(res); }, 60); return; }
    A.worker = w;
    w.onmessage = function (ev) {
      var m = ev.data || {}; if (m.id !== A.id) return;
      if (m.tipo === "progresso") { A.etapa = m.etapa; if (m.rodada) A.rodada = m.rodada; }
      else if (m.tipo === "fim") { var res = null; try { res = JSON.parse(m.texto); } catch (e) { res = { ok: false, motivo: e.message }; } fim(res); }
      else if (m.tipo === "erro") fim({ ok: false, motivo: m.mensagem });
    };
    w.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); fim({ ok: false, motivo: "o processo paralelo falhou" }); };
    w.postMessage({ tipo: "alternativaBase", id: A.id, par: par, op: {}, atual: atual });
  }
  function redesenharAlt() { var el = doc && doc.querySelector("[data-mc='alternativa']"); if (el && UIC.modo === "resultado") el.outerHTML = alternativaHtml(UIC.r); }
  function alternativaHtml(r) {
    if (!r || !r.ok) return "";
    var base = baseDe(r), outra = base === "engastada" ? "rotulada" : "engastada", A = UIC.alt;
    var h = '<section class="mc-card" data-mc="alternativa"><h4>Base ' + base + " ou " + outra + '? <button type="button" class="mc-i" data-dica="placa-base-' + outra + '" aria-label="Placa de base ' + outra + '">i</button></h4>';
    if (!A) return h + '<p class="mc-exp">O sistema calcula o mesmo galpão com a base ' + outra + " e mostra a diferença de aço e o que muda na fundação. Leva o tempo de mais um cálculo; este resultado continua na tela.</p>" +
      '<button class="mc-bt" data-mc-acao="comparar-base">' + ico("balanca", 15) + " Comparar com base " + outra + "</button></section>";
    if (A.estado === "rodando") {
      var seg = Math.round((Date.now() - A.t0) / 1000), et = (ETAPAS.filter(function (x) { return x.id === A.etapa; })[0] || {}).nome || "preparando";
      return h + '<p class="mc-exp" style="margin:0 0 8px">Calculando com base ' + A.base + " — " + seg + " s" + (A.rodada ? " · rodada " + A.rodada : "") + " · " + esc(et) + '</p><div class="mc-barra corre" style="max-width:420px"><i></i></div>' +
        '<div class="mc-sols"><button class="mc-bt ghost" data-mc-acao="cancelar-alternativa">Cancelar a comparação</button></div></section>';
    }
    if (A.estado === "erro") return h + '<ul class="mc-avisos"><li class="erro">Com base ' + esc(A.base) + ": " + esc(A.motivo) + '</li></ul><button class="mc-bt" data-mc-acao="comparar-base">Tentar de novo</button></section>';
    var x = A.res, a = x.atual || {}, b = x.alternativa || {};
    function lin(rot, va, vb) { return "<tr><td>" + esc(rot) + '</td><td class="n">' + va + '</td><td class="n" style="font-weight:700">' + vb + "</td></tr>"; }
    h += '<p style="margin:0 0 10px;font-size:13.2px" data-mc="alternativa-texto">' + esc(x.texto || "") + "</p>" +
      '<table class="mc-tab"><thead><tr><th></th><th class="n">Agora · base ' + esc(base) + '</th><th class="n">Com base ' + esc(A.base) + "</th></tr></thead><tbody>" +
      lin("Aço total", fmt(a.pesoTotal, 0) + " kg", fmt(b.pesoTotal, 0) + " kg") +
      lin("Taxa da estrutura principal", fmt(a.taxa, 1) + " kg/m²", fmt(b.taxa, 1) + " kg/m²") +
      lin("Pilar", esc(a.perfis && a.perfis.pilar || "—"), esc(b.perfis && b.perfis.pilar || "—")) +
      lin("Viga", esc(a.perfis && a.perfis.viga || "—"), esc(b.perfis && b.perfis.viga || "—")) +
      lin("Momento máximo na fundação", fmt(a.momentoBaseMax, 1) + " kN·m", fmt(b.momentoBaseMax, 1) + " kN·m") +
      lin("Situação", a.aprovado ? "aprovado" : "reprovado", b.aprovado ? "aprovado" : "reprovado") + "</tbody></table>" +
      (b.baseLig ? '<p class="mc-exp" style="margin:8px 0 0"><b>Placa de base com base ' + esc(A.base) + ":</b> " + esc(b.baseLig) + "</p>" : "") +
      '<div class="mc-sols"><button class="mc-bt pri" data-mc-acao="usar-alternativa">Usar a base ' + esc(A.base) + '</button><button class="mc-bt" data-mc-acao="manter-atual">Manter a ' + esc(base) + "</button></div>";
    return h + "</section>";
  }
  function usarAlternativa() {
    var A = UIC.alt; if (!A || A.estado !== "pronto" || !A.res || !A.res.resultado) return;
    var r2 = A.res.resultado, e = UIC.est;
    e.geometria.base = A.base; e.perfis.partida = {};
    var dt = decisoesTela(e); dt.push({ tema: "Base dos pilares", decisao: A.base + " — escolhida na comparação feita pelo sistema", motivo: A.res.texto || "as duas condições de base calculadas" });
    r2.decisoesTela = dt; r2.tempoTela = A.ms; r2.modoCalculo = UIC.r && UIC.r.modoCalculo;
    UIC.rPar = JSON.parse(JSON.stringify(UIC.rPar || parametros(e))); UIC.rPar.geometria.base = A.base;
    UIC.r = r2; UIC.alt = null; salvar(true); render();
    toast("Resultado trocado pelo da base " + A.base + ".", "ok", 5000);
  }

  /* ================================================================ RESULTADO */
  function resultadoHtml(r) {
    if (!r) return '<div class="mc-vazio"><p><b>Nenhum cálculo nesta sessão.</b></p><p>Monte o galpão no assistente e clique em Calcular.</p><button class="mc-bt pri" data-mc-acao="voltar-assistente">Abrir o assistente</button></div>';
    var g = (r.parametros && r.parametros.geometria) || UIC.est.geometria, h = "";
    if (!r.ok) {
      var P0 = arr(r.problemas), comSol = P0.filter(function (p) { return arr(p.solucoes).length; }).length;
      h += '<div class="mc-heroi" data-mc="resultado"><span class="mc-selo aviso" data-mc="status">NÃO CALCULOU</span><div><h3>' + esc(comSol ? "Falta uma decisão para calcular" : (P0.length ? "Um dado impede o cálculo" : "O cálculo parou")) + "</h3><p>" +
        esc(comSol ? "O sistema encontrou o problema e propõe " + arr(P0[0].solucoes).length + " soluções: escolha uma — ou calcule com a sugestão do sistema, que fica registrada nas decisões." : (P0.length ? "Veja abaixo o que corrigir; o resto do galpão está pronto." : (r.motivo || ""))) + "</p></div></div>";
      P0.forEach(function (p) {
        var sols = arr(p.solucoes), estab = p.tipo === "estabilidade-longitudinal", bts = "";
        if (sols.length && estab) bts = sols.map(function (s) { return '<button class="mc-bt pri" data-mc-acao="solucao" data-mc-v="' + esc(s.id) + '">Calcular com: ' + esc(s.texto) + "</button>"; }).join("") + '<button class="mc-bt" data-mc-acao="sugestao" title="Calcula com a primeira solução e registra nas decisões que foi pedido">Calcular com a sugestão do sistema</button>';
        else if (sols.length) bts = '<ul class="mc-exp" style="margin:0 0 4px;width:100%">' + sols.map(function (s) { return "<li>" + esc(s.texto) + "</li>"; }).join("") + '</ul><button class="mc-bt pri" data-mc-acao="sugestao">Calcular com a sugestão do sistema</button>';
        else if (p.tipo === "vento") bts = '<button class="mc-bt pri" data-mc-acao="passo-assistente" data-mc-v="2">Revisar a geometria</button><button class="mc-bt" data-mc-acao="passo-assistente" data-mc-v="1">Revisar o local e o vento</button>';
        else bts = '<button class="mc-bt pri" data-mc-acao="voltar-assistente">Revisar os dados</button>';
        h += '<div class="mc-prob" data-mc="problema"><h5>' + ico("alerta", 16) + " " + esc(tituloProblema(p.tipo)) + "</h5><p>" + esc(p.texto) + '</p><div class="mc-sols">' + bts + "</div></div>";
      });
      if (!P0.length) h += '<div class="mc-prob"><h5>' + ico("alerta", 16) + " O motor não fechou o cálculo</h5><p>" + esc(r.motivo || "") + '</p><div class="mc-sols"><button class="mc-bt pri" data-mc-acao="voltar-assistente">Revisar os dados</button>' + (UIC.est.contraventamento !== "auto" ? '<button class="mc-bt" data-mc-acao="solucao" data-mc-v="auto">Tentar com o contraventamento automático</button>' : "") + "</div>" + (r.pilha ? '<details style="margin-top:8px"><summary class="mc-exp">Detalhe técnico</summary><pre style="white-space:pre-wrap;font-size:11px">' + esc(r.pilha) + "</pre></details>" : "") + "</div>";
      if (arr(r.decisoes).length || arr(r.decisoesTela).length) h += decisoesHtml(r);
      return h;
    }
    var grupos = r.grupos || {}, sec = secundarias(r), maxRaz = 0;
    Object.keys(grupos).forEach(function (k) { maxRaz = Math.max(maxRaz, num(grupos[k].razao, 0)); });
    sec.forEach(function (s) { maxRaz = Math.max(maxRaz, num(s.x.razao, 0)); });
    arr(r.ligacoes && r.ligacoes.lista).forEach(function (l) { maxRaz = Math.max(maxRaz, num(l.razao, 0)); });
    var lmin = null; arr(r.flambagem).forEach(function (f) { if (f.lambda > 0 && (lmin == null || f.lambda < lmin)) lmin = f.lambda; });
    var nV = r.modelo && r.modelo.layout ? r.modelo.layout.nV + 1 : null, ventoOk = r.vento && r.vento.ok, area = num(g.vao) * num(g.comprimento);
    var total = num(r.pesoTotal, num(r.peso, 0)), semVento = arr(r.avisos).filter(function (a) { return /SEM vento|VENTO NÃO CONSIDERADO/i.test(a); })[0];
    h += '<div class="mc-heroi" data-mc="resultado"><span class="mc-selo' + (r.aprovado ? "" : " erro") + '" data-mc="status">' + (r.aprovado ? ico("check", 15) + " APROVADO" : ico("alerta", 15) + " REPROVADO") + "</span><div><h3>Galpão " + fmt(num(g.vao), 2) + " × " + fmt(num(g.comprimento), 2) + " m" + (nV ? " · " + nV + " pórticos" : "") + "</h3><p>" +
      (r.aprovado ? verificadas(r, sec) : r.falhas + " verificação(ões) não passa(m) — veja os problemas e as trocas sugeridas abaixo.") + " · " + fmt((r.tempoTela || r.tempoMs || 0) / 1000, 1) + " s" + (r.modoCalculo === "worker" ? " em paralelo" : "") + (r.otimizacao ? " · " + r.otimizacao.iteracoes + " rodada" + (r.otimizacao.iteracoes > 1 ? "s" : "") : "") + "</p></div></div>";
    if (semVento) h += '<ul class="mc-avisos"><li class="erro">' + esc(semVento) + "</li></ul>";
    h += '<div class="mc-kpis">' +
      kpi("Aço total", fmt(total, 0) + " kg", r.pesoTotal != null ? "pórticos " + fmt(r.peso, 0) + " kg + terças e travessas " + fmt(r.pesoSecundarias, 0) + " kg" : "pórticos, tapamentos e contraventamento", "peso") +
      kpi("Taxa de aço", fmt(total / (area || 1), 1) + " kg/m²", "sobre " + fmt(area, 0) + " m² cobertos" + (r.pesoTotal != null ? " · pórticos " + fmt(r.taxa, 1) + " kg/m²" : ""), "taxa") +
      kpi("Maior aproveitamento", fmt(maxRaz * 100, 0) + " %", maxRaz <= 1 ? "barras, secundárias e ligações até 100 %" : "acima de 100 % não passa", "aprov") +
      kpi("Flambagem global <span style='text-transform:none'>λ<sub>cr</sub></span>", lmin != null ? fmt(lmin, 2) : "—", lmin == null ? "não calculado" : (lmin >= 10 ? "≥ 10: 2ª ordem global pequena" : (lmin >= 3 ? "entre 3 e 10: 2ª ordem considerada" : "< 3: estrutura flexível demais")), "lcr") +
      kpi("Deslocabilidade", r.deslocabilidade ? esc(r.deslocabilidade.classe) : "—", r.deslocabilidade ? "Δ2/Δ1 = " + fmt(r.deslocabilidade.razao, 2) + " (NBR 8800)" : "", "desl") +
      (ventoOk ? kpi("Vento", fmt(r.vento.v0, 0) + " m/s", "q = " + fmt(r.vento.q, 3) + " kN/m² · " + arr(r.ventoCasos).length + " casos", "vento") : "") + "</div>";
    /* tabela por grupo: pórticos, tapamentos, contraventamento, terças e travessas */
    h += '<section class="mc-card"><h4>Perfis finais e aproveitamento</h4><p class="mc-exp">Aproveitamento = solicitação ÷ resistência de cálculo na pior combinação e no pior ponto da barra (ou deslocamento ÷ limite, quando o serviço governa).</p><table class="mc-tab"><thead><tr><th>Grupo</th><th>Perfil</th><th>Aproveitamento</th><th>O que governa</th><th class="n">Aço</th></tr></thead><tbody>';
    function linha(k, nome, perfil, rz, gov, kg, extra) {
      var cls = rz > 1 ? "erro" : (rz > 0.9 ? "aviso" : "");
      return '<tr data-mc="grupo" data-mc-grupo="' + k + '"><td><b>' + esc(nome) + "</b>" + (extra ? '<br><span class="mc-exp" style="margin:0">' + esc(extra) + "</span>" : "") + '</td><td class="mc-perfil">' + esc(perfil) + "</td>" +
        '<td><div class="mc-ap"><div class="mc-barra ' + cls + '"><i style="width:' + Math.min(100, rz * 100).toFixed(1) + '%"></i></div><b style="color:' + (rz > 1 ? "var(--mc-erro)" : "inherit") + '">' + fmt(rz * 100, 0) + " %</b></div></td>" +
        "<td>" + esc(gov) + '</td><td class="n">' + (kg != null ? fmt(kg, 0) + " kg" : "—") + "</td></tr>";
    }
    ["pilar", "viga", "tapamento", "contravento"].forEach(function (k) {
      var gr = grupos[k]; if (!gr || !gr.perfil) return;
      h += linha(k, GRUPOS[k] || k, gr.perfil, num(gr.razao, 0), governa(r, k, gr), r.pesoGrupos && r.pesoGrupos[k] != null ? r.pesoGrupos[k] : null);
    });
    sec.forEach(function (s) { h += linha(s.k, s.nome, s.x.perfil || "—", num(s.x.razao, 0), s.x.governante || "—", s.x.pesoTotal, s.extra); });
    h += "</tbody></table>";
    if (r.otimizacao && arr(r.otimizacao.log).length) h += '<details style="margin-top:10px"><summary class="mc-exp" style="cursor:pointer;margin:0">Como o otimizador chegou nesses perfis (' + r.otimizacao.log.length + " passo" + (r.otimizacao.log.length > 1 ? "s" : "") + ')</summary><ul class="mc-exp" style="margin:6px 0 0">' + r.otimizacao.log.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul></details>";
    h += "</section>";
    h += alternativaHtml(r);
    /* ligações */
    var LL = arr(r.ligacoes && r.ligacoes.lista);
    if (LL.length) {
      h += '<section class="mc-card" data-mc="ligacoes"><h4>Ligações <span class="mc-chip ' + (r.ligacoes.aprovado ? "ok" : "erro") + '">' + (r.ligacoes.aprovado ? "todas passam" : r.ligacoes.falhas + " não passa(m)") + '</span></h4><p class="mc-exp">Dimensionadas com os esforços de todas as combinações últimas (NBR 8800: parafusos, soldas, chapas, placa de base e chumbadores; ' + (num(r.parametros && r.parametros.fundacao && r.parametros.fundacao.fck, null) != null ? "concreto C" + fmt(num(r.parametros.fundacao.fck, 0), 0) : "fck da fundação NÃO informado: placas de base A CONFIRMAR") + ").</p><table class=\"mc-tab\"><thead><tr><th>Ligação</th><th>O que sai no detalhe</th><th>Aproveitamento</th><th>O que governa</th></tr></thead><tbody>" +
        LL.map(function (l) { var rz = num(l.razao, 0), cls = rz > 1 ? "erro" : (rz > 0.9 ? "aviso" : ""), dk = DICA_LIG[l.id];
          return '<tr data-mc="ligacao"' + (dk ? ' data-dica="' + dk + '" data-dica-lado="esquerda"' : "") + "><td><b>" + esc(l.nome) + "</b></td><td style=\"max-width:380px\">" + esc(l.resumo || "") + (l.sugestao ? '<br><span style="color:var(--mc-erro)">' + esc(l.sugestao) + "</span>" : "") + (l.decisao ? '<br><span class="mc-exp" style="margin:0">' + esc(l.decisao) + "</span>" : "") +
            '</td><td><div class="mc-ap"><div class="mc-barra ' + cls + '"><i style="width:' + Math.min(100, rz * 100).toFixed(1) + '%"></i></div><b>' + fmt(rz * 100, 0) + " %</b></div></td><td>" + esc(l.governante || "—") + "</td></tr>"; }).join("") + "</tbody></table></section>";
    }
    /* problemas */
    var probs = problemasDe(r);
    if (probs.length) {
      h += '<section class="mc-card"><h4>' + ico("alerta", 16) + " Problemas e soluções</h4>";
      /* BACKLOG #59/#53: todo problema do resultado tem "Mostrar no 3D" (a vista dos resultados: a barra que não passa em destaque,
         ou a deformada / o modo de flambagem quando o problema é de deslocamento); a ação (Calcular com…) segue como estava */
      probs.forEach(function (p) {
        var m3 = global.MetalCalcVista && p.modo3d ? '<button class="mc-bt" data-mc-acao="mostrar3d" data-mc-modo="' + esc(p.modo3d) + '"' + (p.foco ? ' data-mc-foco="' + esc(p.foco) + '"' : "") + ' title="Abre o resultado em 3D' + (p.foco ? " com a barra " + esc(p.foco) + " em destaque" : "") + '">Mostrar no 3D</button>' : "";
        h += '<div class="mc-prob" data-mc="problema"><h5>' + esc(p.titulo) + "</h5><p>" + esc(p.texto) + "</p>" + (p.botoes.length || m3 ? '<div class="mc-sols">' + m3 + p.botoes.join("") + "</div>" : "") + "</div>";
      });
      h += "</section>";
    }
    h += '<div class="mc-duas" style="align-items:start"><div>' + decisoesHtml(r) + "</div><div>" + servicoHtml(r) + reacoesHtml(r) + avisosHtml(r) + "</div></div>";
    return h;
  }
  var DICA_LIG = { base: "placa-base-rotulada", baseTapamento: "placa-base-rotulada", joelho: "joelho", cumeeira: "cumeeira", clip: "clip-terca", contravento: "contraventamento-cobertura" };
  /* terças e travessas (AcoSecundarias, NBR 14762) como linhas da tabela */
  function secundarias(r) {
    var o = [], t = r.tercas, tv = r.travessas || {};
    if (t && t.perfil) o.push({ k: "terca", nome: "Terças", x: t, extra: (t.linhas ? t.linhas + " linha(s) de correntes por vão" : "sem correntes") + (t.vao ? " · vão " + fmt(t.vao, 2) + " m" : "") });
    if (tv.lateral && tv.lateral.perfil) o.push({ k: "travessaLateral", nome: "Travessas laterais", x: tv.lateral, extra: (tv.lateral.linhas ? tv.lateral.linhas + " linha(s) de tirantes por vão" : "sem tirantes") });
    if (tv.oitao && tv.oitao.perfil) o.push({ k: "travessaOitao", nome: "Travessas dos oitões", x: tv.oitao, extra: (tv.oitao.linhas ? tv.oitao.linhas + " linha(s) de tirantes por vão" : "sem tirantes") });
    return o;
  }
  /* a frase do aprovado cita só o que este galpão tem (galpão aberto não tem travessa) */
  function verificadas(r, sec) {
    var it = ["barras dos pórticos"], tem = function (k) { return sec.some(function (s) { return s.k.indexOf(k) === 0; }); };
    if (tem("terca")) it.push("terças"); if (tem("travessa")) it.push("travessas");
    if (arr(r.ligacoes && r.ligacoes.lista).length) it.push("ligações");
    it.push("deslocamentos");
    var t = it.slice(0, -1).join(", ") + " e " + it[it.length - 1];
    return t.charAt(0).toUpperCase() + t.slice(1) + " passam nas verificações (NBR 8800" + (sec.length ? " e NBR 14762" : "") + ").";
  }
  function kpi(t, v, s, id) { return '<div class="mc-kpi" data-mc-kpi="' + id + '"><small>' + t + "</small><b>" + v + "</b><span>" + s + "</span></div>"; }
  function tituloProblema(t) { return t === "estabilidade-longitudinal" ? "Estabilidade na direção do comprimento" : (t === "analise" ? "A análise não fechou" : (t === "vento" ? "Vento (NBR 6123)" : "Problema")); }
  function governa(r, k, gr) {
    if (gr.governaELS) { var s = arr(r.servico).filter(function (x) { return x.membro === gr.membro; }).sort(function (a, b) { return b.razao - a.razao; })[0]; return s ? "deslocamento: " + s.texto : "deslocamento (serviço)"; }
    if (k === "contravento") { var cv = r.contravento && r.contravento.verificacao; return cv && cv.governante ? cv.governante : "tração na barra"; }
    var m = r.membros && r.membros[gr.membro]; if (!m) return "—";
    var gv = m.governante; if (gv && typeof gv === "object") gv = gv.nome || gv.item;
    if (!gv) { var w = arr(m.verificacoes).slice().sort(function (a, b) { return num(b.razao, 0) - num(a.razao, 0); })[0]; gv = w ? w.nome + (w.item ? " (" + w.item + ")" : "") : "—"; }
    return String(gv);
  }
  function problemasDe(r) {
    var o = [], porGrupo = {}, base = (r.parametros && r.parametros.geometria && r.parametros.geometria.base) || "rotulada";
    Object.keys(r.membros || {}).forEach(function (id) {
      var m = r.membros[id]; if (!m || m.ok) return;
      var mod = arr(r.modelo && r.modelo.membros).filter(function (x) { return x.id === id; })[0], g = mod ? mod.grupo : "?";
      if (!porGrupo[g] || m.razao > porGrupo[g].razao) porGrupo[g] = { id: id, razao: m.razao, sugestao: m.sugestao, perfil: mod && mod.secao ? mod.secao.nome : "", gov: m.governante };
    });
    Object.keys(porGrupo).forEach(function (g) {
      var p = porGrupo[g], bts = [], mt = /Trocar (.+?) por (.+?) \(/.exec(p.sugestao || "");
      if (mt) bts.push('<button class="mc-bt pri" data-mc-acao="troca" data-mc-v="' + esc(g + "|" + mt[2]) + '">Calcular com ' + esc(mt[2]) + "</button>");
      bts.push('<button class="mc-bt" data-mc-acao="continuar">Mais rodadas de otimização</button>');
      o.push({ titulo: (GRUPOS[g] || g) + " — " + p.perfil + " com aproveitamento de " + fmt(p.razao * 100, 0) + " %", texto: (p.sugestao || "A barra não passa.") + (typeof p.gov === "string" ? " Governa: " + p.gov + "." : ""), botoes: bts, foco: p.id, modo3d: "aproveitamento" });
    });
    secundarias(r).forEach(function (s) { if (s.x.ok === false) o.push({ titulo: s.nome + " — " + (s.x.perfil || "sem perfil") + " não passa", texto: (s.x.governante ? "Governa: " + s.x.governante + ". " : "") + (arr(s.x.alternativas).length ? "O catálogo tem alternativas: perfil mais alto ou mais espesso, ou mais linhas de correntes/tirantes." : "Nenhum Ue do catálogo resolve: aproxime os pórticos ou use perfil laminado."), botoes: ['<button class="mc-bt" data-mc-acao="passo-assistente" data-mc-v="2">Revisar o espaçamento dos pórticos</button>'], modo3d: "aproveitamento" }); });
    arr(r.ligacoes && r.ligacoes.lista).forEach(function (l) { if (!l.ok) o.push({ titulo: l.nome + " — aproveitamento de " + fmt(num(l.razao, 0) * 100, 0) + " %", texto: (l.sugestao || "A ligação não passa.") + (l.governante ? " Governa: " + l.governante + "." : ""), botoes: [], modo3d: "aproveitamento" }); });
    var els = arr(r.servico).filter(function (s) { return s.razao > 1; }).sort(function (a, b) { return b.razao - a.razao; })[0];
    if (els) {
      var b2 = [];
      if (base !== "engastada") b2.push('<button class="mc-bt pri" data-mc-acao="engastar">Calcular com a base engastada</button>');
      b2.push('<button class="mc-bt" data-mc-acao="continuar">Mais rodadas de otimização</button>');
      o.push({ titulo: "Deslocamento acima do limite (" + (els.tipo === "viga" ? "flecha da viga" : "topo do pilar") + ")", texto: fmt(els.valor * 1000, 1) + " mm para o limite de " + fmt(els.limite * 1000, 1) + " mm (" + els.texto + ", " + els.ref + "). Mais rigidez resolve: base engastada ou perfis maiores.", botoes: b2, modo3d: "deformada" });
    }
    if (r.deslocabilidade && r.deslocabilidade.classe === "grande") o.push({ titulo: "Estrutura de grande deslocabilidade", texto: "Δ2/Δ1 = " + fmt(r.deslocabilidade.razao, 2) + ": a NBR 8800 pede análise rigorosa. Aumente a rigidez — base engastada ou perfis maiores.", botoes: base !== "engastada" ? ['<button class="mc-bt pri" data-mc-acao="engastar">Calcular com a base engastada</button>'] : [], modo3d: "flambagem" });
    return o;
  }
  var ICONE_TEMA = { "Pórticos": "P", "Terças": "T", "Telha e terças": "T", "Travessas de fechamento": "Tr", "Travessas dos oitões": "Tr", "Colunas de tapamento": "C", "Contraventamento": "X", "Contraventamento das paredes": "X", "Análise estrutural": "2ª", "Mãos-francesas": "MF", "Flambagem global": "λ", "Vento": "V", "Perfis de partida": "W", "Estabilidade": "!", "Travessas laterais": "Tr" };
  var DICA_TEMA = { "Terças": "terca", "Telha e terças": "terca", "Travessas de fechamento": "travessa-fechamento", "Travessas dos oitões": "travessa-fechamento", "Colunas de tapamento": "coluna-tapamento", "Contraventamento": "contraventamento-cobertura", "Contraventamento das paredes": "contraventamento-parede", "Mãos-francesas": "mao-francesa", "Flambagem global": "deformada", "Pórticos": "portico-alma-cheia", "Vento": "vento-90", "Perfis de partida": "secao-w", "Estabilidade": "contraventamento-cobertura", "Travessas laterais": "travessa-fechamento" };
  function decisoesHtml(r) {
    var L = arr(r.decisoesTela).concat(arr(r.decisoes));
    if (!L.length) return "";
    return '<section class="mc-card" data-mc="decisoes"><h4>Decisões do sistema <span class="mc-chip">' + L.length + '</span></h4><p class="mc-exp">O que o sistema decidiu sozinho e por quê — o mesmo texto vai para o memorial.</p>' +
      L.map(function (d) { var dk = DICA_TEMA[d.tema]; return '<div class="mc-dec"' + (dk ? ' data-dica="' + dk + '" data-dica-lado="direita"' : "") + '><span class="mc-di">' + esc(ICONE_TEMA[d.tema] || (d.tema || "?").charAt(0)) + "</span><div><b>" + esc(d.tema) + "</b><p>" + esc(d.decisao) + '</p><span class="mc-pq">' + esc(d.motivo) + "</span></div></div>"; }).join("") + "</section>";
  }
  function servicoHtml(r) {
    var S = arr(r.servico); if (!S.length) return "";
    var pior = {}; S.forEach(function (s) { if (!pior[s.tipo] || s.razao > pior[s.tipo].razao) pior[s.tipo] = s; });
    var nomes = { pilarTopo: "Topo dos pilares (horizontal)", viga: "Flecha das vigas de cobertura", tapamento: "Colunas de tapamento" };
    return '<section class="mc-card"><h4>Deslocamentos (serviço) <button type="button" class="mc-i" data-dica="deformada" aria-label="Deformada">i</button></h4><table class="mc-tab"><thead><tr><th>Onde</th><th class="n">Valor</th><th class="n">Limite</th><th>Uso</th></tr></thead><tbody>' +
      Object.keys(pior).map(function (k) { var s = pior[k], cls = s.razao > 1 ? "erro" : (s.razao > 0.9 ? "aviso" : ""); return "<tr><td><b>" + esc(nomes[k] || k) + '</b><br><span class="mc-exp" style="margin:0">' + esc(s.texto) + '</span></td><td class="n">' + fmt(s.valor * 1000, 1) + ' mm</td><td class="n">' + fmt(s.limite * 1000, 1) + ' mm</td><td><div class="mc-ap" style="min-width:120px"><div class="mc-barra ' + cls + '"><i style="width:' + Math.min(100, s.razao * 100).toFixed(1) + '%"></i></div><b>' + fmt(s.razao * 100, 0) + " %</b></div></td></tr>"; }).join("") + "</tbody></table></section>";
  }
  function reacoesHtml(r) {
    var R = r.reacoes || {}, ids = Object.keys(R); if (!ids.length) return "";
    var L = r.modelo && r.modelo.layout, nV = L ? L.nV : null, grp = { ext: [], int: [], tap: [] };
    ids.forEach(function (id) { var m = /^B(\d+)[LR]$/.exec(id); if (m) { var k = +m[1]; (k === 0 || k === nV ? grp.ext : grp.int).push(id); } else grp.tap.push(id); });
    function lin(nome, lista) {
      if (!lista.length) return "";
      var cmp = 0, arr0 = 0, hor = 0, mom = 0;
      lista.forEach(function (id) { var e = R[id].envELU || {}; cmp = Math.max(cmp, num((e.Fy || [])[1], 0)); arr0 = Math.max(arr0, -num((e.Fy || [])[0], 0)); hor = Math.max(hor, Math.abs(num((e.Fx || [])[0], 0)), Math.abs(num((e.Fx || [])[1], 0)), Math.abs(num((e.Fz || [])[0], 0)), Math.abs(num((e.Fz || [])[1], 0))); mom = Math.max(mom, Math.abs(num((e.Mx || [])[0], 0)), Math.abs(num((e.Mx || [])[1], 0)), Math.abs(num((e.Mz || [])[0], 0)), Math.abs(num((e.Mz || [])[1], 0))); });
      return "<tr><td><b>" + nome + '</b><br><span class="mc-exp" style="margin:0">' + lista.length + ' apoio(s)</span></td><td class="n">' + fmt(cmp, 1) + '</td><td class="n">' + (arr0 > 0.05 ? fmt(arr0, 1) : "—") + '</td><td class="n">' + fmt(hor, 1) + '</td><td class="n">' + (mom > 0.05 ? fmt(mom, 1) : "—") + "</td></tr>";
    }
    return '<section class="mc-card"><h4>Cargas na fundação <span class="mc-chip">para o projeto de fundação</span></h4><p class="mc-exp">Envoltória das combinações últimas (valores de cálculo). Por caso, característicos, no memorial.</p><table class="mc-tab"><thead><tr><th>Apoios</th><th class="n">Compressão kN</th><th class="n">Arrancamento kN</th><th class="n">Horizontal kN</th><th class="n">Momento kN·m</th></tr></thead><tbody>' +
      lin("Pilares dos pórticos extremos", grp.ext) + lin("Pilares dos pórticos internos", grp.int) + lin("Colunas de tapamento", grp.tap) + "</tbody></table></section>";
  }
  function avisosHtml(r) {
    /* o mesmo aviso em várias barras ("P0L (W 310 x 32,7 Gerdau): Esbeltez…") vira UMA linha com a lista das barras */
    var L0 = arr(r.avisos).filter(function (a) { return !/VENTO NÃO CONSIDERADO/.test(a); }), grupos = {}, ordem = [];
    L0.forEach(function (a) {
      var m = /^([A-Z]{1,3}\d+[A-Z]?(?:_\d+)*) \(([^)]+)\): (.*)$/.exec(String(a)), k = m ? m[2] + "|" + m[3] : a;
      if (!grupos[k]) { grupos[k] = { perfil: m ? m[2] : null, texto: m ? m[3] : a, ids: [] }; ordem.push(k); }
      if (m) grupos[k].ids.push(m[1]);
    });
    var L = ordem.map(function (k) { var g = grupos[k]; return g.ids.length ? g.texto.replace(/\.$/, "") + " — " + g.perfil + ", " + (g.ids.length > 1 ? g.ids.length + " barras (" + g.ids.slice(0, 6).join(", ") + (g.ids.length > 6 ? "…" : "") + ")" : "barra " + g.ids[0]) + "." : g.texto; });
    if (!L.length) return "";
    var mais = L.length > 8;
    return '<section class="mc-card"><h4>Avisos <span class="mc-chip aviso">' + L.length + '</span></h4><ul class="mc-avisos">' + L.slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" + (mais ? '<details><summary class="mc-exp" style="cursor:pointer">Mais ' + (L.length - 8) + ' avisos</summary><ul class="mc-avisos">' + L.slice(8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></details>" : "") + "</section>";
  }
  function umaAgua(r) { var g = r && r.parametros && r.parametros.geometria; return !!((g && num(g.aguas, 2) === 1) || (r && r.modelo && r.modelo.layout && r.modelo.layout.aguas === 1)); }
  function rodapeResultado() {
    var r = UIC.r, ok = r && r.ok, um = umaAgua(r);
    function bt(acao, txt, icone, dispo, dica) { return '<button class="mc-bt' + (acao === "gerar3d" ? " pri" : "") + '" data-mc-acao="' + acao + '"' + (dispo ? "" : " disabled") + ' title="' + esc(dica) + '">' + ico(icone, 15) + " " + txt + "</button>"; }
    return '<footer class="mc-rod"><div class="mc-acoes">' +
      '<button class="mc-bt ghost" data-mc-acao="voltar-assistente" style="margin-right:auto">' + ico("editar", 15) + " Editar os dados</button>" +
      bt("vista3d", "Ver em 3D", "olho", ok && !!global.MetalCalcVista, global.MetalCalcVista ? "Deformada, esforços e flambagem no 3D" : "A vista 3D dos resultados está em preparação (js/metalcalcvista.js)") +
      bt("memorial", "Memorial", "relatorio", ok && !!(global.AcoMemorial && AcoMemorial.gerar), global.AcoMemorial ? "Memorial de cálculo para imprimir ou salvar em PDF" : "O memorial está em preparação (js/acomemorial.js)") +
      bt("pranchas", "Pranchas", "prancha", ok && !!(global.AcoPranchas && AcoPranchas.gerar), global.AcoPranchas ? "Pranchas no padrão da casa, em Pranchas do projeto" : "As pranchas estão em preparação (js/acopranchas.js)") +
      bt("cype", "Exportar para o CYPE", "exportar", ok && !!global.AcoCype, global.AcoCype ? "Arquivo para o CYPE 3D com perfis, cargas e apoios" : "A exportação para o CYPE está em preparação (js/acocype.js)") +
      bt("cype-guia", "Como usar no CYPE 3D", "checklist", !!(global.AcoCype && AcoCype.comoUsarHTML), "Passo a passo no CYPE 3D com os números deste cálculo: abrir o IFC, perfis, vínculos, flambagem, cargas e conferir o resultado") +
      (function () {
        /* PÓRTICOS M4 (14/10/2026): o js/metalgalpao.js desenha também o galpão de UMA água (alma cheia, subindo para a direita
           como o cálculo) — o botão vale para os dois */
        var podeG = ok && !!global.BimMetalUI && !!(global.BimMetalGalpao && BimMetalGalpao.parDoCalculo), gl = galpaoLigado();
        /* uma estrutura por cálculo: com o galpão no modelo, o cálculo só ATUALIZA esse (decisão do Rogério, 12/10/2026 —
           outro galpão é outro cálculo) */
        if (gl) return bt("gerar3d", "Atualizar o galpão no modelo", "estrutura", podeG, "Refaz no mesmo lugar as " + gl.n + " peças do galpão que este cálculo desenhou, com os perfis e ligações novos — não cria outro. As peças desenhadas à parte ficam. Ctrl+Z desfaz.");
        return bt("gerar3d", "Gerar o modelo 3D", "estrutura", podeG, "Desenha o galpão no BIM igual ao cálculo: perfis, terças, travessas, contraventamento e ligações dimensionadas");
      })() + "</div></footer>";
  }

  /* ================================================================ NORMAS */
  function normasHtml() {
    var N = global.AcoNormas;
    if (!N) return '<div class="mc-vazio">A tabela de normas (js/aconormas.js) não carregou.</div>';
    var L = N.lista(), mot = N.doMotor(), rs = N.resumo();
    var h = '<div class="mc-ph"><div><h3>Normas configuradas</h3><p>As normas brasileiras que o cálculo usa, a edição em vigor e a que o motor aplica hoje. ' + esc(rs.texto) + "</p></div></div>";
    h += '<div class="mc-pend">' + ico("alerta", 18) + "<div><b>Pendência</b><br>" + esc(N.PENDENCIA) + "</div></div>";
    h += '<div class="mc-normas" data-mc="normas">' + L.map(function (n) {
      var t = n.sit.tom === "ok" ? "ok" : (n.sit.tom === "aviso" ? "aviso" : (n.sit.tom === "info" ? "info" : ""));
      return '<article class="mc-norma" data-mc-norma="' + n.id + '"><div class="mc-cod">' + esc(n.norma) + "<small>em vigor: " + esc(n.vigente) + "</small></div>" +
        "<div><h5>" + esc(n.titulo) + "</h5><p>" + esc(n.tema) + "</p><dl><dt>No motor</dt><dd>" + esc(n.usada) + "</dd><dt>Texto na biblioteca</dt><dd>" + esc(n.texto) + "</dd><dt>Arquivos</dt><dd>" + esc(arr(n.motor).join(", ")) + "</dd></dl></div>" +
        '<div class="mc-sit"><span class="mc-chip ' + t + '">' + esc(n.sit.curto) + '</span><span class="mc-exp" style="margin:0">' + esc(n.sit.rotulo) + "</span></div></article>";
    }).join("") + "</div>";
    if (mot.length) h += '<section class="mc-card" style="margin-top:14px"><h4>O que cada motor carregado declara</h4><table class="mc-tab"><tbody>' + mot.map(function (m) { return "<tr><td><b>" + esc(m.motor) + '</b><br><span class="mc-exp" style="margin:0">' + esc(m.arquivo) + "</span></td><td>" + esc(m.texto) + "</td></tr>"; }).join("") + "</tbody></table></section>";
    h += '<div class="mc-duas" style="margin-top:14px"><section class="mc-card"><h4>Normas de produto (catálogos)</h4><table class="mc-tab"><tbody>' + N.PRODUTO.map(function (p) { return "<tr><td><b>" + esc(p.norma) + "</b></td><td>" + esc(p.titulo) + '<br><span class="mc-exp" style="margin:0">' + esc(p.uso) + "</span></td></tr>"; }).join("") + "</tbody></table></section>" +
      '<section class="mc-card"><h4>Próxima etapa: trabalho em altura</h4><table class="mc-tab"><tbody>' + N.PROXIMAS.map(function (p) { return "<tr><td><b>" + esc(p.norma) + "</b></td><td>" + esc(p.titulo) + '<br><span class="mc-exp" style="margin:0">' + esc(p.uso) + "</span></td></tr>"; }).join("") + "</tbody></table></section></div>";
    return h;
  }

  /* ================================================================ AÇÕES DO RESULTADO */
  /* nome de arquivo sem acento nem espaço ("OBRA TESTE ORÇAPRO" → "OBRA-TESTE-ORCAPRO"): o CYPE e o e-mail não estranham */
  function nomeArq() {
    var o = obra(), n = String((o && o.nome) || "obra");
    try { n = n.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return n.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "obra";
  }
  function baixar(nome, dados, mime) {
    /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
    if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, "modela:metalica"); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
    if (global.BimMetalUI && BimMetalUI.baixar) return BimMetalUI.baixar(nome, dados, mime);
    try { var bl = new Blob([dados], { type: mime || "application/octet-stream" }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }
  /* ⚠ TRAVA DE LICENÇA NA FUNÇÃO (21/10/2026, js/licencafuncao.js): a fita esconde o grupo da Metálica quando a disciplina não está
     liberada, mas o cálculo e cada entrega também são chamados pelos botões desta janela, pela API e por atalho — cada função
     confere sozinha. Em teste de 1 hora libera e conta (o entregável sai com a marca, pelo `baixar`); vencido ou sem licença
     recusa e mostra a oferta. Consultar (abrir a janela, ver o que já foi calculado) continua livre. Sem o módulo: não trava. */
  function lic(acao) { var L = global.LicencaFuncao; return L && L.guarda ? L.guarda("metalica", acao) : true; }
  function hojeBR() { var d = new Date(); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); }
  /* o cadastro da conta (Empresa.dados: nome, CNPJ, responsável, título, CREA…) e o logo */
  function empresaApp() { var d = {}, logo = null; try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {} return { d: d, logo: logo }; }
  /* o item do catálogo no formato que o memorial lê (os nomes do levantamento dos catálogos) */
  function itemMemorial(t) {
    if (!t) return null;
    return { fabricante: t.fabricante, modelo: t.modelo, espessura_mm: t.espessura, revestimento: t.revestimento || t.acabamento, peso_kN_m2: t.peso,
             peso_obs: t.peso == null && t.pesoAdotado ? t.pesoAdotado.texto : t.pesoObs, largura_util_m: t.larguraUtil, altura_onda_mm: t.alturaOnda,
             inclinacao_min_pct: t.inclMin, fonte: t.fonte, pagina: t.pagina, tabela_tecnica: t.tt, tabela_tecnica_notas: t.ttNotas, instalacao: t.links };
  }
  function paredePrincipal(est) {
    var A = F(), x = null;
    ["esquerda", "direita", "frente", "fundo"].some(function (k) { var f = est.fechamentos[k]; if (!f || f.tipo === "aberto") return false; x = f.tipo === "telha" ? telhaParede(est, f) : paredeDe(f); return !!x; });
    return x || (A ? null : null);
  }
  function fontesArray() { var A = F(), o = []; if (A && A.FONTES) Object.keys(A.FONTES).forEach(function (k) { var f = A.FONTES[k]; o.push({ id: k, titulo: f.titulo, url: f.url, edicao: f.edicao }); }); return o; }
  function opcoesMemorial(imagens) {
    var em = empresaApp(), o = obra() || {}, l = UIC.est.local, ti = telhaInfo(UIC.est);
    return {
      empresa: { nome: em.d.nome || "", cnpj: em.d.cnpj || "", endereco: [em.d.endereco, em.d.cidade].filter(Boolean).join(" — "), logoDataUrl: em.logo || "" },
      responsavel: { nome: em.d.responsavel || "", titulo: em.d.titulo || "", crea: em.d.crea || "" },
      obra: { nome: o.nome || "", endereco: l.endereco || o.local || l.texto || "", cidade: "", cliente: o.clienteNome || "", lat: num(l.lat, null), lon: num(l.lon, null) },
      revisao: "R00", data: new Date(), versao: versao(), imagens: imagens || {},
      fechamentos: { telha: itemMemorial(ti.telha), paredes: itemMemorial(paredePrincipal(UIC.est)) },
      fontes: fontesArray()
    };
  }
  function opcoesPranchas() {
    var em = empresaApp(), o = obra() || {}, l = UIC.est.local;
    return { empresa: em.d && em.d.nome ? em.d : "", responsavel: em.d.responsavel || "", registro: em.d.crea || "", tituloProfissional: em.d.titulo || "",
             obra: o.nome || "", proprietario: o.clienteNome || "", contratante: o.clienteNome || "", local: l.endereco || o.local || "",
             codigo: "EST-MET", revisao: "R00", data: hojeBR(), formato: "A1", logo: em.logo || null };
  }
  /* as fotos do 3D para o memorial (perspectiva com o aproveitamento, deformada e flambagem):
     uma vista fora da tela, fotografada e destruída — sem a vista, o memorial desenha as próprias */
  function fotos(r) {
    var V3 = global.MetalCalcVista;
    if (!V3 || !V3.abrir || !doc) return Promise.resolve({});
    return new Promise(function (ok) {
      var box = doc.createElement("div"), c = null, img = {};
      box.style.cssText = "position:fixed;left:-12000px;top:0;width:1400px;height:900px;pointer-events:none";
      doc.body.appendChild(box);
      function fim() { try { if (c && c.destruir) c.destruir(); } catch (e) {} box.remove(); ok(img); }
      try { c = V3.abrir(box, r, { modo: "aproveitamento", tema: "claro", animar: false, barra: false }); } catch (e) { fim(); return; }
      setTimeout(function () {
        try { img.perspectiva = c.foto(1400, 900); } catch (e) {}
        try { c.modo("deformada"); img.deformada = c.foto(1400, 900); } catch (e) {}
        try { c.modo("flambagem"); if (c.animar) c.animar(false); img.flambagem = c.foto(1400, 900); } catch (e) {}
        Object.keys(img).forEach(function (k) { if (!/^data:image\/png/.test(String(img[k] || ""))) delete img[k]; });
        fim();
      }, 450);
    });
  }
  function memorial() {
    if (!lic("gerar o memorial")) return;
    var r = UIC.r, M = global.AcoMemorial; if (!r || !r.ok || !M || !M.gerar) { toast("O memorial sai de um cálculo que fechou.", "aviso"); return; }
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (w && w.document) { try { w.document.write('<!doctype html><meta charset="utf-8"><title>Memorial</title><p style="font:15px system-ui;padding:40px;color:#334">Montando o memorial de cálculo…</p>'); } catch (e) {} }
    status("Montando o memorial de cálculo (fotos do 3D, figuras e verificações)…");
    fotos(r).then(function (img) { return M.gerar(r, opcoesMemorial(img)); }).then(function (x) {
      var html = typeof x === "string" ? x : (x && x.html) || "";
      if (html && global.UnidadesMemorial) html = UnidadesMemorial.preparar(html);   /* aba SI | Técnica (kgf / tf) */
      if (!html) { if (w) try { w.close(); } catch (e) {} toast("Memorial: " + ((x && x.motivo) || "não gerou conteúdo") + ".", "erro", 9000); return; }
      /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
      if (global.TesteModulo && TesteModulo.marcarHtml) { var hT = TesteModulo.marcarHtml(html, "modela:metalica"); if (hT == null) { if (w) try { w.close(); } catch (eW) {} return; } html = hT; }
      UIC.ultimoMemorial = { titulo: x.titulo, secoes: arr(x.secoes).length, avisos: arr(x.avisos).length, bytes: html.length };
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); toast("Memorial aberto em outra aba: imprima ou salve em PDF (Ctrl+P)." + (arr(x.avisos).length ? " " + x.avisos.length + " conferência(s) acusada(s) na seção 13." : ""), "ok", 8000); }
      else { baixar(nomeArq() + "-memorial-metalica.html", html, "text/html"); toast("Memorial baixado (.html): abra e imprima em PDF.", "ok", 7000); }
    }, function (e) { if (w) try { w.close(); } catch (e2) {} toast("Memorial: " + (e && e.message ? e.message : e), "erro", 9000); });
  }
  function pranchas() {
    if (!lic("gerar as pranchas")) return;
    var r = UIC.r, PR = global.AcoPranchas; if (!r || !r.ok || !PR || !PR.gerar) { toast("As pranchas saem de um cálculo que fechou.", "aviso"); return; }
    var x = null;
    try { x = PR.gerar(r, opcoesPranchas()); } catch (e) { toast("Pranchas: " + e.message, "erro", 9000); return; }
    if (!x || !x.ok || !arr(x.folhas).length) { toast("Pranchas: " + ((x && arr(x.avisos)[0]) || "nada gerado") + ".", "erro", 9000); return; }
    UIC.pranchas = x; UIC.modo = "pranchas"; render();
  }
  function pranchasHtml() {
    var x = UIC.pranchas || { folhas: [], avisos: [] };
    var h = '<div class="mc-ph"><div><h3>Pranchas do projeto executivo</h3><p>' + x.folhas.length + " folhas " + esc((x.folhas[0] || {}).formato || "A1") + " no padrão da casa (carimbo RA). Imprima em PDF ou baixe os desenhos.</p></div></div>";
    if (arr(x.avisos).length) h += '<ul class="mc-avisos">' + x.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
    h += '<div class="mc-modelos" data-mc="pranchas">' + x.folhas.map(function (f, i) {
      return '<div class="mc-mod" style="cursor:default"><div class="mc-fig" style="background:#fff;cursor:zoom-in" data-mc-acao="prancha-ver" data-mc-v="' + i + '" title="Ver a folha grande">' + f.svg + '</div><div class="mc-mc"><b>' + esc((f.numero ? f.numero + " — " : "") + f.titulo) + '</b><p>Escala ' + esc(f.escala || "indicada") + '</p><div class="mc-ds"><button class="mc-bt" data-mc-acao="prancha-svg" data-mc-v="' + i + '">Baixar SVG</button><button class="mc-bt" data-mc-acao="prancha-dxf" data-mc-v="' + i + '">Baixar DXF</button></div></div></div>';
    }).join("") + "</div>";
    return h;
  }
  /* uma folha grande (role a página; a folha A1 inteira na largura da janela) */
  function folhaHtml() {
    var x = UIC.pranchas || { folhas: [] }, i = UIC.folha || 0, f = x.folhas[i];
    if (!f) return '<div class="mc-vazio">Sem folha.</div>';
    return '<div class="mc-ph"><div><h3>' + esc((f.numero ? f.numero + " — " : "") + f.titulo) + "</h3><p>Folha " + (i + 1) + " de " + x.folhas.length + " · " + esc(f.formato || "A1") + " · escala " + esc(f.escala || "indicada") + '</p></div><span class="mc-cont"><button class="mc-bt" data-mc-acao="prancha-svg" data-mc-v="' + i + '">Baixar SVG</button><button class="mc-bt" data-mc-acao="prancha-dxf" data-mc-v="' + i + '">Baixar DXF</button></span></div>' +
      '<div class="mc-papel" style="padding:0;background:#fff" data-mc="folha">' + f.svg + "</div>";
  }
  function imprimirPranchas() {
    var x = UIC.pranchas; if (!x) return;
    if (!lic("imprimir as pranchas")) return;
    var f0 = x.folhas[0] || {}, A = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] }[f0.formato || "A1"] || [841, 594];
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pranchas — estrutura metálica — ' + esc((obra() || {}).nome || "") + "</title><style>@page{size:" + A[0] + "mm " + A[1] + "mm;margin:0}html,body{margin:0;background:#888}.f{width:" + A[0] + "mm;height:" + A[1] + "mm;background:#fff;page-break-after:always;overflow:hidden;margin:0 auto 8mm}.f svg{width:100%;height:100%;display:block}@media print{body{background:#fff}.f{margin:0}}</style></head><body>" +
      x.folhas.map(function (f) { return '<div class="f">' + f.svg + "</div>"; }).join("") + "</body></html>";
    /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
    if (global.TesteModulo && TesteModulo.marcarHtml) { html = TesteModulo.marcarHtml(html, "modela:metalica"); if (html == null) return; }
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); toast("Pranchas abertas em outra aba: imprima em PDF no tamanho " + (f0.formato || "A1") + ".", "ok", 7000); }
    else baixar(nomeArq() + "-pranchas-metalica.html", html, "text/html");
  }
  function zipPranchas() {
    var x = UIC.pranchas; if (!x || !global.BimBcf || !BimBcf.zipEscrever) { toast("O gerador de .zip não carregou.", "erro"); return; }
    if (!lic("baixar as pranchas")) return;
    var arqs = {}; x.folhas.forEach(function (f, i) { arqs[(f.numero || ("folha-" + (i + 1))).replace(/[^\w.-]+/g, "-") + "-" + String(f.titulo || "").replace(/[^\w.-]+/g, "-").slice(0, 40) + ".svg"] = f.svg; });
    baixar(nomeArq() + "-pranchas-metalica.zip", BimBcf.zipEscrever(arqs), "application/zip");
  }
  /* O DXF DAS PRANCHAS (21/10/2026, js/pranchasdxf.js): cada folha em DXF R2000, mm de papel 1:1, layers e penas do Padrão RA,
     textos e cotas como entidades, carimbo RA. Em teste de 1 hora o `baixar` põe a marca "Versão de teste" em cada DXF (também dentro do .zip). */
  function dxfFolha(i) {
    var x = UIC.pranchas, PX = global.PranchasDxf, f = x && x.folhas[i];
    if (!f) return;
    if (!PX) { toast("O DXF das pranchas não carregou (js/pranchasdxf.js).", "erro"); return; }
    if (!lic("baixar o DXF da prancha")) return;
    var t = null; try { t = PX.dxfDaFolha(f); } catch (e) { toast("DXF: " + e.message, "erro", 9000); return; }
    if (baixar(nomeArq() + "-" + PX.nomeArquivo(f, i), t, "application/dxf") !== false) toast("DXF da folha " + (f.numero || (i + 1)) + " baixado (R2000, mm de papel 1:1, layers do Padrão RA). O AutoCAD abre direto e salva em DWG.", "ok", 8000);
  }
  function dxfPranchas() {
    var x = UIC.pranchas, PX = global.PranchasDxf;
    if (!x) return;
    if (!PX || !global.BimBcf || !BimBcf.zipEscrever) { toast("O DXF das pranchas (ou o gerador de .zip) não carregou.", "erro"); return; }
    if (!lic("baixar o DXF das pranchas")) return;
    var r = null; try { r = PX.arquivos(x); } catch (e) { toast("DXF: " + e.message, "erro", 9000); return; }
    if (!r || !r.nomes.length) { toast("DXF: " + ((r && r.avisos[0]) || "nada gerado") + ".", "erro", 9000); return; }
    if (baixar(nomeArq() + "-pranchas-metalica-dxf.zip", BimBcf.zipEscrever(r.arquivos), "application/zip") !== false)
      toast(r.nomes.length + " DXF (R2000, mm de papel 1:1, layers do Padrão RA com a pena de cada uma, textos e cotas como entidades, carimbo RA)." + (r.avisos.length ? " " + r.avisos.length + " aviso(s): " + r.avisos[0] : "") + " O AutoCAD abre direto e salva em DWG.", "ok", 9000);
  }
  /* os nomes dos arquivos do pacote: o MESMO base vai para o AcoCype.arquivos e para o guia
     (o guia cita o IFC e os textos por etiqueta pelo nome que estão no .zip). O AcoCype troca
     por "_" o que não for letra, número, "_" ou "-" — aqui também, para os nomes baterem. */
  function opCype() {
    var b = (nomeArq() + "-cype3d").replace(/[^A-Za-z0-9_-]+/g, "_");
    return { base: b, arquivoIfc: b + ".ifc", obra: (obra() || {}).nome || "" };
  }
  /* ================================================================ COMO USAR NO CYPE 3D
     O guia é do motor (AcoCype.comoUsarHTML: com o resultado, os números deste cálculo; sem ele,
     o guia geral). A tela só o põe numa página no padrão dela, com voltar e Esc. */
  function guiaCypeHtml() {
    var CY = global.AcoCype, r = UIC.r && UIC.r.ok ? UIC.r : null, op = opCype(), frag = "";
    if (!CY || !CY.comoUsarHTML) return '<div class="mc-vazio">O guia do CYPE (js/acocype.js) não carregou.</div>';
    try { frag = String(CY.comoUsarHTML(r, op) || ""); } catch (e) { return '<div class="mc-vazio">O guia do CYPE não abriu: ' + esc(e && e.message || e) + "</div>"; }
    frag = frag.replace('<ol class="guia">', '<ol class="guia" role="list">');   /* sem marcador, a lista continua lista para o leitor de tela */
    return '<div class="mc-ph"><div><h3>Como usar no CYPE 3D</h3><p>' + (r ?
        "Do pacote <b>" + esc(op.base) + ".zip</b> até comparar o resultado, com os números deste cálculo. O roteiro (.html) que vai no .zip traz o mesmo passo a passo e todas as tabelas (seções, flambagem, cargas e combinações) para consultar ao lado do CYPE." :
        "O passo a passo geral. Depois de calcular, o guia mostra os números da obra.") + "</p></div>" +
      (r && CY.arquivos ? '<button class="mc-bt" data-mc-acao="cype">' + ico("exportar", 15) + " Baixar o pacote (.zip)</button>" : "") + "</div>" +
      '<section class="mc-card mc-guia" data-mc="cype-guia">' + frag + "</section>";
  }
  /* para onde o Esc e o "Voltar" levam: a tela de onde o guia foi aberto (a vista 3D e a folha
     ampliada não voltam sozinhas — vão para o resultado e para as pranchas) */
  function voltaDoGuia() {
    var m = UIC.cypeVolta;
    if (m === "vista") return "resultado";
    if (m === "folha") return "pranchas";
    if (m === "resultado" || m === "pranchas") return UIC.r ? m : "assistente";
    if (m === "assistente" || m === "normas" || m === "modelos") return m;
    return UIC.r ? "resultado" : "assistente";
  }
  function abrirGuiaCype(volta) {
    if (volta) UIC.cypeVolta = volta;
    else if (UIC.modo !== "cypeguia") UIC.cypeVolta = UIC.modo === "calculando" ? "assistente" : UIC.modo;
    UIC.modo = "cypeguia"; render();
    var pal = doc && doc.querySelector(".mc-palco"); if (pal) pal.scrollTop = 0;
    return true;
  }
  function voltarDoGuia() {
    if (UIC.cypeVolta === "fechar") { UIC.cypeVolta = null; fechar(); return; }
    UIC.modo = voltaDoGuia(); UIC.cypeVolta = null; render();
  }
  /* aviso com um atalho (o "Ver como usar" do download): o UI.toast não aceita botão, então o botão
     entra no aviso que ele acabou de criar. ⚠ O contêiner dos avisos tem pointer-events: none (para
     não tampar nada por baixo — css/app.css); só o botão volta a pegar clique (.mc-toast-acao). */
  function toastAcao(texto, tipo, ms, rotulo, fn) {
    toast(texto, tipo, ms);
    try {
      var ts = doc ? doc.querySelectorAll("#toasts .toast") : [], el = ts.length ? ts[ts.length - 1] : null;
      if (!el || el.textContent.indexOf(texto.slice(0, 24)) !== 0) return null;
      var b = doc.createElement("button");
      b.type = "button"; b.className = "mc-toast-acao"; b.textContent = rotulo; b.setAttribute("data-mc-toast", "acao");
      b.addEventListener("click", function (ev) { ev.stopPropagation(); try { el.remove(); } catch (e) {} fn(); });
      el.appendChild(b);
      return b;
    } catch (e) { return null; }
  }
  function cype() {
    if (!lic("exportar para o CYPE 3D")) return;
    var r = UIC.r, CY = global.AcoCype; if (!r || !r.ok || !CY) { toast("A exportação para o CYPE sai de um cálculo que fechou.", "aviso"); return; }
    var op = opCype(), lista = null;
    try { lista = CY.arquivos ? CY.arquivos(r, op) : null; } catch (e) { toast("CYPE: " + e.message, "erro", 9000); return; }
    if (!lista || !lista.length) { toast("O exportador do CYPE não devolveu arquivos.", "erro"); return; }
    if (global.BimBcf && BimBcf.zipEscrever) {
      var arqs = {}; lista.forEach(function (a) { arqs[a.nome] = a.conteudo; });
      baixar(op.base + ".zip", BimBcf.zipEscrever(arqs), "application/zip");
    } else lista.forEach(function (a) { baixar(a.nome, a.conteudo, a.tipo); });
    UIC.ultimoCype = lista.map(function (a) { return a.nome; });
    var msg = "Pacote para o CYPE 3D baixado: IFC com o modelo analítico, texto da geometria por etiqueta e o roteiro (.html) com seções, cargas e combinações.";
    if (UIC.modo === "cypeguia" && raiz()) toast(msg, "ok", 8000);
    else toastAcao(msg, "ok", 15000, "Ver como usar", function () { MetalCalcUI.comoUsarCype(); });
  }
  var vistaCtl = null;
  function soltarVista() { if (vistaCtl && vistaCtl.destruir) { try { vistaCtl.destruir(); } catch (e) {} } vistaCtl = null; }
  function verEm3D(foco) {
    var r = UIC.r, V3 = global.MetalCalcVista; if (!r || !r.ok || !V3 || !V3.abrir) { toast("A vista 3D dos resultados não carregou.", "aviso"); return; }
    soltarVista();
    UIC.modo = "vista"; render();
    var box = doc.querySelector("[data-mc='vista3d']");
    try { vistaCtl = V3.abrir(box, r, { modo: foco && foco.modo ? foco.modo : "aproveitamento", tema: "auto" }); } catch (e) { toast("Vista 3D: " + e.message, "erro", 8000); UIC.modo = "resultado"; render(); return; }
    /* "Mostrar no 3D" de um problema: a barra que não passa fica em destaque e enquadrada */
    if (foco && foco.id && vistaCtl && vistaCtl.selecionar) { try { vistaCtl.selecionar(foco.id, { enquadrar: true }); } catch (e2) {} }
  }
  /* o galpão no BIM com os perfis FINAIS (o assistente de modelagem do js/metalgalpao.js) */
  /* o galpão que ESTE cálculo desenhou e que ainda está no modelo (o id fica nos dados da obra); sem o id, se o modelo
     tem um galpão só, é ele */
  function galpaoLigado() {
    var U = global.BimMetalUI; if (!U || !U.galpoes) return null;
    var gs = U.galpoes(), id = UIC.est && UIC.est.galpaoId;
    if (id) { var g = gs.filter(function (x) { return x.id === String(id); })[0]; if (g) return g; }
    return !id && gs.length === 1 ? gs[0] : null;
  }
  function gerarModelo3D() {
    if (!lic("gerar o modelo 3D")) return null;
    var r = UIC.r, U = global.BimMetalUI, MG = global.BimMetalGalpao;
    if (!r || !r.ok || !U || !U.gerarGalpao || !MG || !MG.parDoCalculo) { toast("O modelador da metálica não carregou.", "erro"); return null; }
    /* PÓRTICOS M4 (14/10/2026): o BimMetalGalpao desenha também UMA água (parDoCalculo leva `aguas`, a água sobe para a direita
       como no cálculo) — a guarda que recusava uma água saiu; a de treliçado de uma água fica no validar do gerador */
    if (umaAgua(r) && !(MG.PADRAO && MG.PADRAO.aguas != null)) { toast("O modelador desta versão desenha só galpão de duas águas — o modelo sairia diferente do cálculo. Use “Ver em 3D” para ver a estrutura calculada.", "aviso", 9000); return null; }
    /* o modelo sai IGUAL ao cálculo: o BimMetalGalpao.parDoCalculo traduz o resultado (perfis finais,
       terça Ue com as correntes, travessas nas alturas do cálculo, contraventamento nas mesmas
       barras da análise, tapamentos, mãos-francesas e as ligações com as medidas dimensionadas) */
    /* o galpão deste cálculo já está no modelo → ATUALIZA no mesmo lugar (nunca uma cópia por cima) */
    var alvo = galpaoLigado(), P = U.pontoPadrao ? U.pontoPadrao() : [0, 0, 0];
    var org = alvo && alvo.info && alvo.info.par ? { x0: num(alvo.info.par.x0, 0), z0: num(alvo.info.par.z0, 0), base: num(alvo.info.par.base, 0) }
            : { x0: num(P[0], 0), z0: num(P[2], 0), base: num(P[1], 0) };
    /* VEDAÇÃO (14/10/2026, js/acovedacao.js): o galpão do cálculo vem com as telhas e o fechamento das faces que a pessoa
       escolheu (passos 3 e 4) — telhas, alvenaria do misto, rufos e cumeeira como peças; o peso continua indo para as
       cargas pelo par do cálculo (telhaPeso / fechamentoPeso), nunca pelas peças */
    try {
      var eV = UIC.est || {}, fV = {};
      FACES.forEach(function (fc) { var x = (eV.fechamentos || {})[fc.id] || {}, pw = paredeDe(x); fV[fc.id] = { telhaId: x.telhaId || "", paredeId: pw ? pw.id : "", bloco: x.bloco || "" }; });
      org.vedacao = { telhaCobertura: (eV.cobertura && eV.cobertura.telhaId) || "", faces: fV, calha: !!(eV.cobertura && eV.cobertura.calha) };
    } catch (eVd) { org.vedacao = null; }
    var par = MG.parDoCalculo(r, org);
    if (!par) { toast("O modelador não reconheceu o resultado do cálculo.", "erro"); return null; }
    var res = U.gerarGalpao(par, { doCalculo: true, substituir: alvo ? alvo.id : null, calc: UIC.est });
    if (res && res.ok) {
      UIC.est.galpaoId = res.galpaoId; salvar(true);
      fechar();
      /* as notas do modelador NÃO vão inteiras para a tela: são dezenas (uma por ponta de barra
         ajustada, por furo conferido) e citam ids internos. Na tela: só o que pede ação — furo fora
         da distância mínima da NBR 8800 (o comando Ligações › Conferir furos lista cada um) e ponto
         que ficou a detalhar. A lista completa vai para o log (console), para o técnico. */
      var av = arr(res.avisos).concat(arr(res.avisosLigacoes));
      var nNbr = av.filter(function (a) { return /NBR 8800/.test(a); }).length;
      var nDet = av.filter(function (a) { return !/NBR 8800/.test(a) && /a detalhar|não cabe|falhou|não está no catálogo|sem furo|vire a cantoneira/i.test(a); }).length;
      var txt = res.atualizou ? "Galpão atualizado no modelo com o novo cálculo (no mesmo lugar; as peças que você desenhou à parte ficaram)."
                              : "Galpão desenhado com o resultado do cálculo: perfis, terças, travessas, contraventamento e ligações dimensionadas.";
      if (nNbr) txt += " Atenção: " + nNbr + " furo(s) do detalhe das ligações fora da distância mínima da NBR 8800 — Ligações › Conferir furos mostra cada um.";
      if (nDet) txt += " " + nDet + " ponto(s) do modelo ficaram a detalhar.";
      toast(txt + " Ctrl+Z desfaz.", nNbr ? "aviso" : "ok", nNbr ? 14000 : 9000);
      try { if (av.length && global.console && console.info) console.info("[Cálculo do galpão] notas do modelador (" + av.length + "):\n· " + av.join("\n· ")); } catch (e) {}
    }
    return res;
  }

  /* ================================================================ EVENTOS */
  function ligar(v) {
    v.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("[data-mc-acao]") : null;
      if (!a || !v.contains(a) || a.disabled) return;
      acao(a.getAttribute("data-mc-acao"), a.getAttribute("data-mc-v"), a, ev);
    });
    v.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Escape") { if (global.DicaRica && DicaRica.atual()) { DicaRica.esconder(); return; } ev.preventDefault(); teclaEsc(); return; }
      var a = ev.target.closest ? ev.target.closest("[data-mc-acao]") : null;
      if (a && a.tagName === "g" && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); acao(a.getAttribute("data-mc-acao"), a.getAttribute("data-mc-v"), a, ev); return; }
      if (ev.key === "Enter" && ev.target.getAttribute && ev.target.getAttribute("data-mc-campo") === "local.texto") { ev.preventDefault(); campoMudou(ev.target); localizar(); }
    });
    v.addEventListener("keyup", function (ev) { ev.stopPropagation(); });
    /* clique no véu não tira o foco da janela (o foco no body deixaria Delete/atalhos irem para o BIM) */
    v.addEventListener("mousedown", function (ev) { if (ev.target === v) ev.preventDefault(); });
    v.addEventListener("input", function (ev) { var t = ev.target; if (t.getAttribute && t.getAttribute("data-mc-campo") && t.type !== "checkbox" && t.tagName !== "SELECT") campoMudou(t); });
    v.addEventListener("change", function (ev) { var t = ev.target; if (t.getAttribute && t.getAttribute("data-mc-campo") && (t.type === "checkbox" || t.tagName === "SELECT")) { campoMudou(t); UIC.manterRolagem = true; render(); } });
    v.addEventListener("focusin", function (ev) { var c = ev.target.getAttribute && ev.target.getAttribute("data-mc-campo"); if (c && /^geometria\./.test(c)) { UIC.foco = c; vivo(); } });
    v.addEventListener("focusout", function (ev) { var c = ev.target.getAttribute && ev.target.getAttribute("data-mc-campo"); if (c && UIC.foco === c) { UIC.foco = null; setTimeout(vivo, 0); } });
  }
  /* Esc: volta um nível (folha → pranchas → resultado; normas/modelos → assistente) ou fecha */
  function teclaEsc() {
    if (UIC.modo === "cypeguia") { voltarDoGuia(); return; }
    if (UIC.modo === "folha") { UIC.modo = "pranchas"; render(); return; }
    if (UIC.modo === "vista" || UIC.modo === "normas" || UIC.modo === "modelos" || UIC.modo === "pranchas") { UIC.modo = UIC.r && (UIC.modo === "vista" || UIC.modo === "pranchas") ? "resultado" : "assistente"; render(); return; }
    fechar();
  }
  /* ⚠ A JANELA ABERTA PELA FITA FICAVA SURDA AO Esc: o foco continuava no botão da fita,
     ATRÁS da janela, e a tecla nunca chegava a ela (medido no e2e em 12/10/2026 — a janela
     não fechava e engolia os cliques seguintes). Agora o render leva o foco para dentro da
     janela e, se ele escapar, o documento repassa o Esc. */
  var escDoc = false;
  function ligarEscDocumento() {
    if (escDoc || !doc) return; escDoc = true;
    doc.addEventListener("keydown", function (ev) {
      var v = raiz(); if (!v || ev.key !== "Escape" || v.contains(ev.target) || ev.defaultPrevented) return;
      ev.preventDefault(); teclaEsc();
    });
  }
  function campoMudou(t) {
    var cam = t.getAttribute("data-mc-campo"), tipo = t.getAttribute("data-mc-tipo"), box = t.closest ? t.closest(".mc-campo") : null, err = raiz() && raiz().querySelector('[data-mc-erro="' + cam + '"]');
    var val;
    if (tipo === "bool") val = !!t.checked;
    else if (tipo === "num") {
      var s = String((global.UnidadesUI ? UnidadesUI.texto(t) : t.value) || "").trim();
      if (s === "" && /posicao|v0Manual/.test(cam)) val = null;
      else {
        val = num(s, NaN);
        var mn = t.getAttribute("data-mc-min"), mx = t.getAttribute("data-mc-max");
        var ruim = !isFinite(val) || (mn != null && val < +mn) || (mx != null && val > +mx);
        if (box) box.classList.toggle("invalido", ruim);
        if (err) err.textContent = ruim ? (!isFinite(val) ? "Número inválido" : "Entre " + fmt(+mn, +mn % 1 ? 1 : 0) + " e " + fmt(+mx, +mx % 1 ? 1 : 0)) : "";
        if (!isFinite(val)) return;
      }
    } else val = t.value;
    if (cam === "fechamentos." + UIC.face + ".bloco") por(UIC.est, "fechamentos." + UIC.face + ".paredeId", "");
    por(UIC.est, cam, val);
    if (/^local\.(lat|lon)$/.test(cam)) { UIC.est.local.fonte = "coordenadas digitadas"; UIC.est.local.endereco = ""; }
    if (/^geometria\.vao$/.test(cam) || /^perfis\.familia$/.test(cam)) UIC.est.perfis.partida = {};
    salvar(); vivo();
  }
  /* atualiza só os desenhos e os resumos (sem redesenhar os campos: o cursor fica onde está) */
  function vivo() {
    var v = raiz(); if (!v || UIC.modo !== "assistente") return;
    var e = UIC.est;
    function por0(sel, html) { var el = v.querySelector(sel); if (el) el.innerHTML = html; }
    PASSOS.forEach(function (p) { por0('[data-mc-vivo="rt' + p.n + '"]', esc(resumoPasso(p.n))); });
    if (UIC.passo === 2) { por0('[data-mc-vivo="portico"]', svgPortico(e, UIC.foco)); por0('[data-mc-vivo="planta"]', svgPlantaPorticos(e, UIC.foco)); por0('[data-mc-vivo="geo-num"]', geoNumeros()); por0('[data-mc-vivo="graus"]', grausTxt()); }
    if (UIC.passo === 1) { var l = e.local; if (/^local\.(lat|lon|v0Manual|usarV0)$/.test(UIC.ultimoCampo || "") || isFinite(num(l.lat, NaN))) por0('[data-mc-vivo="vento"]', painelVento()); }
    if (UIC.passo === 3) { por0('[data-mc-vivo="planta-faces"]', svgPlantaFaces(e, UIC.face) + legendaFaces()); por0('[data-mc-vivo="face-elev"]', svgFace(e, UIC.face)); }
    if (UIC.passo === 4) { var a = doc.activeElement, cam = a && a.getAttribute && a.getAttribute("data-mc-campo"); if (cam !== "cobertura.extra") por0('[data-mc-vivo="telha"]', painelTelha()); }
    var msg = v.querySelector("[data-mc='msg']"); if (msg) { var val = validar(e), ult = UIC.passo === PASSOS.length; var f = ult ? val.falta[0] : val.falta.filter(function (x) { return x.passo === UIC.passo; })[0]; if (f) { msg.textContent = f.texto; } }
  }
  function acao(a, val, el, ev) {
    var e = UIC.est;
    switch (a) {
      case "fechar": fechar(); return;
      case "livre": fechar(); if (global.MetalCalcLivreUI) global.MetalCalcLivreUI.abrir(); return;
      case "passo": case "passo-assistente": UIC.passo = clamp(+val || 1, 1, PASSOS.length); UIC.modo = "assistente"; render(); return;
      case "proximo": UIC.passo = Math.min(PASSOS.length, UIC.passo + 1); render(); return;
      case "voltar": UIC.passo = Math.max(1, UIC.passo - 1); render(); return;
      case "modelos": UIC.modo = "modelos"; render(); return;
      case "normas": UIC.modo = "normas"; render(); return;
      case "cype-guia": abrirGuiaCype(); return;
      case "cype-guia-voltar": voltarDoGuia(); return;
      case "resultados": UIC.modo = "resultado"; render(); return;
      case "voltar-assistente": UIC.modo = "assistente"; render(); return;
      case "usar-modelo": usarModelo(val); return;
      case "localizar": localizar(); return;
      case "usar-endereco": var x = UIC.busca && UIC.busca.lista && UIC.busca.lista[+val]; if (x) usarLocal(+x.lat, +x.lon, "endereço (OpenStreetMap)", x.nome); return;
      case "s1": e.vento.s1.tipo = val; break;
      case "cat": e.vento.categoria = val; break;
      case "s3": e.vento.grupoS3 = +val; break;
      case "aguas": e.geometria.aguas = +val; break;
      case "base": e.geometria.base = val; break;
      case "face": UIC.face = val; break;
      case "face-tipo": e.fechamentos[UIC.face].tipo = val; break;
      case "todas": FACES.forEach(function (f) { e.fechamentos[f.id].tipo = val; }); break;
      case "portao-mais": e.fechamentos[UIC.face].portoes = arr(e.fechamentos[UIC.face].portoes).concat([{ largura: 4, altura: 4, dominante: true }]); break;
      case "portao-menos": e.fechamentos[UIC.face].portoes.splice(+val, 1); break;
      case "telha": e.cobertura.telhaId = val; break;
      case "telha-filtro": e.cobertura.filtro = val || ""; break;
      case "perfis-modo": e.perfis.modo = val; break;
      case "familia": e.perfis.familia = val; e.perfis.partida = {}; e.perfis.pilar = ""; e.perfis.viga = ""; break;
      case "contravento": e.contraventamento = val; break;
      case "maofrancesa": e.maoFrancesa = val; break;
      case "calcular": calcular(); return;
      case "cancelar": cancelar(); return;
      case "solucao": var pb0 = UIC.r && arr(UIC.r.problemas)[0]; UIC.solucao = { id: val, problema: pb0 ? pb0.texto : "", texto: el ? String(el.textContent || "").replace(/^Calcular com:\s*/, "") : val }; e.contraventamento = val; salvar(true); calcular(); return;
      case "sugestao": calcular({ aplicarSugestao: true }); return;
      case "troca": var pr = String(val || "").split("|"); if (pr.length === 2) { e.perfis.partida = e.perfis.partida || {}; e.perfis.partida[pr[0]] = pr[1]; if (e.perfis.modo === "manual") e.perfis[pr[0]] = pr[1]; salvar(true); calcular(); } return;
      case "continuar": var gr = (UIC.r && UIC.r.grupos) || {}; e.perfis.partida = {}; ["pilar", "viga", "tapamento"].forEach(function (k) { if (gr[k] && gr[k].perfil) e.perfis.partida[k] = gr[k].perfil; }); salvar(true); calcular(); return;
      case "engastar": e.geometria.base = "engastada"; salvar(true); calcular(); return;
      case "vista3d": verEm3D(); return;
      case "mostrar3d": verEm3D({ id: el ? el.getAttribute("data-mc-foco") : "", modo: el ? el.getAttribute("data-mc-modo") : "" }); return;
      case "memorial": memorial(); return;
      case "pranchas": pranchas(); return;
      case "cype": cype(); return;
      case "gerar3d": gerarModelo3D(); return;
      case "comparar-base": compararBase(); return;
      case "cancelar-alternativa": if (UIC.alt && UIC.alt.worker) { try { UIC.alt.worker.terminate(); } catch (eW) {} } UIC.alt = null; redesenharAlt(); return;
      case "usar-alternativa": usarAlternativa(); return;
      case "manter-atual": UIC.alt = null; redesenharAlt(); return;
      case "pranchas-imprimir": imprimirPranchas(); return;
      case "prancha-ver": UIC.folha = +val || 0; UIC.modo = "folha"; render(); return;
      case "pranchas-voltar": UIC.modo = "pranchas"; render(); return;
      case "folha-nav": var nf = UIC.pranchas ? UIC.pranchas.folhas.length : 1; UIC.folha = ((UIC.folha || 0) + (+val || 0) + nf) % nf; render(); return;
      case "pranchas-zip": zipPranchas(); return;
      case "pranchas-dxf": dxfPranchas(); return;
      case "prancha-dxf": dxfFolha(+val); return;
      case "prancha-svg": var fo = UIC.pranchas && UIC.pranchas.folhas[+val]; if (fo && lic("baixar a prancha")) baixar(nomeArq() + "-" + String((fo.numero || "folha") + "-" + (fo.titulo || "")).replace(/[^\w.-]+/g, "-").slice(0, 60) + ".svg", fo.svg, "image/svg+xml"); return;
      default: return;
    }
    salvar(); UIC.manterRolagem = true; render();
  }

  /* ================================================================ API */
  var MetalCalcUI = {
    MODELOS: MODELOS, PADRAO: PADRAO, PASSOS: PASSOS,
    /* abre o assistente (no passo pedido) */
    abrir: function (passo) { conferirObra(); garantir(); UIC.modo = "assistente"; if (passo) UIC.passo = clamp(+passo, 1, PASSOS.length); render(); return true; },
    /* PÓRTICOS M4 (14/10/2026, js/metalporticosui.js): a tipologia de alma cheia da biblioteca de pórticos manda a geometria,
       a base, o fechamento das faces e o galpão que ela desenhou (galpaoId) — o resto do assistente (local, telha, perfis em
       modo automático) fica como o engenheiro deixou. Devolve o estado. */
    preparar: function (d) {
      conferirObra(); d = d || {};
      var e = MetalCalcUI.estado(), g = d.geometria || {};
      ["vao", "comprimento", "espacamento", "peDireito", "inclinacaoPct"].forEach(function (k) { if (g[k] != null && isFinite(+g[k])) e.geometria[k] = +g[k]; });
      if (g.aguas != null) e.geometria.aguas = +g.aguas === 1 ? 1 : 2;
      if (g.base) e.geometria.base = g.base === "engastada" ? "engastada" : "rotulada";
      if (d.fechamento) FACES.forEach(function (f) { var x = e.fechamentos[f.id] || face("telha"); x.tipo = d.fechamento === "aberto" ? "aberto" : "telha"; if (d.fechamento === "aberto") x.portoes = []; e.fechamentos[f.id] = x; });
      if (d.contraventamento) e.contraventamento = d.contraventamento === "nenhum" ? "nenhum" : (d.contraventamento === "X-cantoneira" ? "X-cantoneira" : "auto");
      if (d.galpaoId) e.galpaoId = String(d.galpaoId);
      if (d.modelo !== undefined) e.modelo = d.modelo;
      UIC.r = null; salvar(true);
      return e;
    },
    modelos: function () { conferirObra(); garantir(); UIC.modo = "modelos"; render(); return true; },
    normas: function () { conferirObra(); garantir(); UIC.modo = "normas"; render(); return true; },
    resultados: function () { conferirObra(); garantir(); UIC.modo = UIC.r ? "resultado" : "assistente"; if (!UIC.r) { UIC.passo = PASSOS.length; toast("Ainda não há cálculo nesta sessão: confira os dados e calcule.", "aviso", 5000); } render(); return !!UIC.r; },
    calcular: function () { if (!lic("calcular a estrutura")) return false; conferirObra(); garantir(); return calcular(); },
    /* a trava na função, para quem integra e para o teste: true = pode (e em teste de 1 hora o relógio do módulo anda) */
    licenca: function (acao) { return lic(acao || "usar a função"); },
    memorial: function () { conferirObra(); if (!UIC.r) { toast("Calcule primeiro: o memorial sai do resultado.", "aviso"); return false; } memorial(); return true; },
    pranchas: function () { conferirObra(); if (!UIC.r) { toast("Calcule primeiro: as pranchas saem do resultado.", "aviso"); return false; } pranchas(); return true; },
    cype: function () { conferirObra(); if (!UIC.r) { toast("Calcule primeiro: o arquivo do CYPE sai do resultado.", "aviso"); return false; } cype(); return true; },
    /* o guia "Como usar no CYPE 3D" (com o resultado, os números da obra; sem ele, o geral). Aberto com
       a janela fechada (o atalho do aviso de um download feito pela fita), o Esc fecha a janela de novo */
    comoUsarCype: function () { conferirObra(); var aberta = !!raiz(); garantir(); return abrirGuiaCype(aberta ? null : "fechar"); },
    gerarModelo3D: function () { return gerarModelo3D(); },
    galpaoLigado: function () { return galpaoLigado(); },
    fechar: fechar,
    usarModelo: function (id) { conferirObra(); garantir(); return usarModelo(id); },
    /* M1 (1.2.145): a telha escolhida no Catálogo BR vai para a COBERTURA do galpão (as faces "a mesma da cobertura"
       seguem junto). Telha que não está no catálogo de fechamentos: recusa, sem mexer no estado. */
    usarTelha: function (id) {
      conferirObra(); var A = F(); if (!A || !A.obter(id)) return false;
      var e = MetalCalcUI.estado(); e.cobertura.telhaId = String(id); salvar(true);
      if (raiz()) { UIC.manterRolagem = true; render(); }
      return true;
    },
    /* para o teste e para outras telas */
    estado: function () { conferirObra(); if (!UIC.est) { var s = ler(); UIC.est = s ? mesclar(copia(PADRAO), s.estado) : estadoNovo(); } return UIC.est; },
    resultado: function () { return UIC.r; },
    ultimas: function () { return { memorial: UIC.ultimoMemorial || null, cype: UIC.ultimoCype || null, pranchas: UIC.pranchas ? UIC.pranchas.folhas.length : 0 }; },
    modoCalculo: function () { return UIC.modo_calc; },
    calculando: function () { return !!(UIC.calc && UIC.calc.rodando); },
    tela: function () { return raiz() ? UIC.modo : null; },
    parametros: function (e) { return parametros(e || MetalCalcUI.estado()); },
    telhaInfo: function (e) { return telhaInfo(e || MetalCalcUI.estado()); },
    validar: function (e) { return validar(e || MetalCalcUI.estado()); },
    chave: chave,
    svg: { portico: svgPortico, planta: svgPlantaPorticos, faces: svgPlantaFaces, face: svgFace, galpao: svgGalpao3D }
  };
  if (global.DicaRica && DicaRica.registrar) {
    DicaRica.registrar("met-calc-assistente", "portico-alma-cheia"); DicaRica.registrar("met-calc-calcular", "deformada");
  }
  global.MetalCalcUI = MetalCalcUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCalcUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
