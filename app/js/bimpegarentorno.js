/* =====================================================================
 * bimpegarentorno.js — BIM › Massa e terreno › "Pegar entorno" (01/11/2026)
 *
 * O QUE FAZ. Busca no mapa (OpenStreetMap, pelo servidor da RA) as edificações, muros, água, ruas e árvores em volta da obra e as
 * mostra no 3D do BIM — DEPOIS de a pessoa ver a prévia e aceitar. Não é motor novo: reaproveita os do Içamento (js/icargeo.js,
 * js/icarentorno.js, as rotas /ia/geo/busca e /ia/geo/entorno e o desenho BIM.icarPlanta / BIM.icarLocal) pelos mesmos caminhos
 * do Gestao (_icarGeoPost, _icarLocalMapa, _icarEntornoAdicionar, _icarGeoAplicar, _icarSalvar).
 *
 * ONDE MORA O DADO. Em `p.entorno` do plano `bim_icamento` DA OBRA (e o local em `p.geo`): um entorno só por obra, dividido com o
 * Içamento — o prédio vizinho é obstáculo de verdade no caminho do equipamento. Colocar pelo BIM aparece no Içamento e o que se
 * aceita no Içamento aparece aqui; remover some nos dois.
 *
 * ⚠ O ENTORNO NÃO É PEÇA DO MODELO. Ele é um grupo de cena (icPlantaG) fora do modelRoot e fora da lista de edição (S.edit.ops):
 *   não entra em quantitativo, área construída, volume, orçamento, 2D, DXF nem IFC, e o Ctrl+Z do BIM não o desfaz. O desfazer é o
 *   botão "Remover entorno" (só aparece quando há entorno). Este arquivo NUNCA chama BIM.instOp, b2Op, carregarSintetico nem
 *   elementoOrcar — o teste tools/test-bim-pegar-entorno.js confere isso lendo o código.
 *
 * ⚠ PRÉVIA = nada gravado. Enquanto a janela de prévia está aberta o entorno aparece em laranja (as propostas do Içamento); Cancelar
 *   (ou fechar a janela) devolve o estado de antes e redesenha. Só "Colocar no modelo" grava, numa operação só (um _icarSalvar).
 * ⚠ SEM LOCAL: pede ali mesmo (endereço, link do mapa ou coordenadas, ou o que o IFC traz) e só grava o plano quando a pessoa
 *   escolhe — cancelar não cria plano. Gravar o local não mexe em nada fora de `geo`/`vias`/`entorno` do plano.
 * ⚠ SUBSTITUIR NÃO PERDE O QUE A PESSOA FEZ. O volume novo com a mesma `fonte` de um antigo com `estimada:false` herda a altura conforme a regra abaixo; o volume aceito do mapa que a busca nova NÃO traz como proposta viva (por exemplo o que está sobre o terreno) fica; o da planta
 *   do Içamento fica. A prévia e a confirmação dizem quantos ficam. "Remover entorno" tira só os do mapa (os da planta só com a caixa marcada).
 * ⚠ O ENTORNO MUDOU = a verificação do caminho de antes deixa de valer. Colocar, Substituir, Remover, "Aceitar" (do mapa e da planta), "Tirar" e altura
 *   nova passam por Gestao._icarEntornoMudou (zera o caminho e a visada SÓ dos içamentos deste plano, zera a sugestão do agente e marca "verificar de novo").
 *   O que vale, exatamente: ao verificar o caminho o içamento grava ic.caminhoEnt (assinatura do entorno de então — a ÚNICA gravação nova no plano; o
 *   resultado livre/choque continua só na sessão). Se o entorno de agora tem outra assinatura (recarregou, o entorno veio da nuvem, "Aceitar" da planta), o
 *   motor põe a PENDÊNCIA e a tela pede nova verificação: nunca "Caminho livre" nem "liberado" até verificar de novo. Liberação já registrada fica na lista
 *   (é registro) mas não é mostrada como vigente. NÃO muda: plano com entorno nunca verificado, plano verificado antes desta versão (sem ic.caminhoEnt)
 *   e choque verificado que some ao recarregar (comportamento antigo).
 * ⚠ ALTURA AO SUBSTITUIR: só herda a altura exata o volume antigo com altDigitada verdadeiro. Sem a marca vale a MAIOR entre a antiga e a do mapa novo, e o
 *   volume nunca é marcado como digitado.
 * ⚠ RUAS ficam gravadas no plano (p.vias) e voltam ao 3D; ÁRVORES, áreas verdes e postes só existem na sessão da busca.
 * ⚠ Licença dos dados: a fonte é a que o servidor devolve (atribuição OpenStreetMap, ODbL) e aparece na prévia. Não troca de fonte.
 * ES5 puro (vale no navegador e no Node dos testes).
 * ===================================================================== */
(function (global) {
  "use strict";

  var LIMITE = 300;                 // volumes de entorno por plano (o mesmo teto do Içamento)
  var RAIOS = [100, 150, 250, 400]; // os mesmos raios do Içamento
  var ATRIB_PADRAO = "© OpenStreetMap contributors (ODbL)";
  var ex = { n: 0, ativo: null, previa: null, obra: null, oculto: false, subst: null };   // execução em andamento (ex.ativo = id; muda ao cancelar; ex.obra = a obra em que a busca começou)
  var ultSig = null;                // a assinatura do que o 3D mostra (obra + ids e alturas): sincronizar não redesenha igual
  var ultTem = null;                // o último "há entorno?" que a fita pintou

  function esc(s) { var t = String(s == null ? "" : s); return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function G() { return global.Gestao || null; }
  function U() { return global.UI || null; }
  function pl(n, um, mu) { return n + " " + (n === 1 ? um : mu); }
  function num5(v) { return (Math.round(v * 1e5) / 1e5).toFixed(5).replace(".", ","); }

  /* ------------------------------------------------------------------ PURO */
  var Pure = {
    LIMITE: LIMITE,
    /* os volumes do plano que vieram do MAPA (têm `fonte`); os da planta PDF/DXF não têm */
    doMapa: function (lista) { return (lista || []).filter(function (e) { return e && e.fonte; }); },
    /* as propostas que "Colocar no modelo" grava: as mesmas do "Aceitar todas" do Içamento (fora as sobre o terreno da obra) */
    vivas: function (mapa) { return ((mapa && mapa.propostas) || []).filter(function (q) { return q && !q.aceita && !q.descartada && !q.jaAceita && !q.sobreModelo; }); },
    /* a contagem da prévia */
    contar: function (mapa, IE) {
      var m = mapa || { propostas: [], porTipo: {}, ruas: [], verdes: [], conta: {} }, vivas = Pure.vivas(m), t = { edificacao: 0, muro: 0, agua: 0 };
      vivas.forEach(function (q) { if (t[q.tipo] != null) t[q.tipo]++; });
      var arv = 0; try { arv = IE && IE.arvores ? IE.arvores(m.verdes || []).length : 0; } catch (e) { arv = 0; }
      return { edificacoes: t.edificacao, muros: t.muro, agua: t.agua, ruas: (m.ruas || []).length, arvores: arv, total: vivas.length,
        sobreModelo: (m.propostas || []).filter(function (q) { return q.sobreModelo; }).length,
        estimadas: vivas.filter(function (q) { return q.alturaEstimada; }).length, cortadas: (m.conta && m.conta.cortadas) || 0 };
    },
    /* o plano comporta N volumes novos? (substituir tira os do mapa que já estão lá) */
    cabe: function (planoEntorno, novos, substituir, fontesNovas) {
      var base = substituir ? (planoEntorno || []).filter(function (e) { return !(e && e.fonte) || (fontesNovas ? !fontesNovas[e.fonte] : false); }) : (planoEntorno || []);
      return base.length + novos <= LIMITE;
    },
    /* SUBSTITUIR sem perder o que a pessoa fez. `herdam`: propostas vivas cuja fonte já está no plano com estimada:false. REGRA DA ALTURA:
       altura exata só herda se o volume antigo tem `altDigitada` verdadeiro (a pessoa digitou). Sem a marca vale o MAIOR entre a antiga e a
       nova (dado antigo sem a marca pode ter sido digitado; o mapa novo pode ter corrigido para cima) e NUNCA se marca como digitada
       (`semMarca`: o volume gravado fica com altDigitada falso). `digitadas`: quantas têm a marca e altura diferente da proposta (a prévia diz); `ficam`: volumes do mapa que a busca nova não traz como
       proposta viva (sobre o terreno, fora do raio, ou que o mapa deixou de ter) — saem só se a pessoa os tirar. */
    substituicao: function (entorno, vivas) {
      var antigos = {}, novas = {}, herdam = [], digitadas = 0;
      Pure.doMapa(entorno).forEach(function (e) { antigos[e.fonte] = e; });
      (vivas || []).forEach(function (q) { novas[q.fonte] = true; });
      (vivas || []).forEach(function (q) {
        var o = antigos[q.fonte];
        if (!o || o.estimada !== false || o.tipo === "agua" || q.tipo === "agua" || !(+o.altura > 0)) return;
        var oa = +o.altura, nova = +(q.alturaEditada != null ? q.alturaEditada : q.altura);
        if (o.altDigitada === true) { herdam.push({ q: q, altura: oa, semMarca: false }); if (oa !== nova) digitadas++; }
        else if (oa > nova) herdam.push({ q: q, altura: oa, semMarca: true });   // sem a marca: vale a maior; a nova, se maior ou igual, já é a da proposta
      });
      var ficam = Pure.doMapa(entorno).filter(function (e) { return !novas[e.fonte]; });
      return { herdam: herdam, digitadas: digitadas, ficam: ficam, fontesNovas: novas };
    },
    /* o texto de atribuição (ODbL): enquanto houver volume, rua ou prévia vindos do mapa */
    atribuicao: function (entorno, vias, previa) { return (Pure.doMapa(entorno).length || (vias && vias.length) || previa) ? ATRIB_PADRAO : ""; },
    /* o que o 3D mostra: a obra, cada volume (id e altura) e as ruas gravadas */
    assinatura: function (obra, entorno, vias, oculto) {
      return JSON.stringify([obra || null, (entorno || []).map(function (e) { return [e.id, e.altura]; }), (vias || []).length, !!oculto]);
    },
    /* o que a pessoa faz quando o servidor não respondeu: sempre a causa e o caminho */
    erroDoServidor: function (x, erroTxt) {
      var s = x ? x.s : 0, causa = erroTxt || (x && x.j && x.j.error) || "";
      if (!s) return { causa: "Sem conexão com o servidor da RA.", corrigir: "Confira a internet deste aparelho e tente de novo. Nada foi alterado na obra." };
      if (s === 403) return { causa: "A licença deste aparelho não está ativa" + (causa ? " (" + causa + ")" : "") + ".", corrigir: "Ative a licença em Configurações e tente de novo. Nada foi alterado na obra." };
      if (s === 429 || s >= 500) return { causa: "O serviço de mapa está ocupado ou fora do ar" + (causa ? " (" + causa + ")" : "") + ".", corrigir: "Espere alguns minutos e tente de novo, ou use um raio menor. Nada foi alterado na obra." };
      return { causa: "O servidor recusou o pedido" + (causa ? ": " + causa : "") + ".", corrigir: "Tente de novo; se repetir, avise o suporte. Nada foi alterado na obra." };
    }
  };

  /* ------------------------------------------------------------------ JANELAS */
  function alvoDoc() { var u = U(); try { return u && u._docAlvo ? u._docAlvo() : global.document; } catch (e) { return global.document; } }
  /* abre a janela (UI.modal) e avisa `aoFechar` UMA vez quando ela some por qualquer caminho (botão, ✕, clique fora) */
  var atual = null;   // a janela aberta agora: abrir outra por cima marca a anterior como "trocada" (não é cancelamento)
  function janela(tipo, titulo, corpo, botoes, aoFechar) {
    var u = U(); if (!u || !u.modal) return false;
    if (atual) atual.feito = true;
    var marca = tipo + ":" + (++ex.n), h = { marca: marca, tipo: tipo, feito: false, fechar: function () { h.feito = true; u.fecharModal(); } };
    atual = h;
    u.modal(titulo, '<div data-pe-modal="' + esc(tipo) + '" data-pe-marca="' + marca + '">' + corpo + "</div>", botoes);
    var d = alvoDoc(), MO = global.MutationObserver;
    /* DUPLO CLIQUE no botão: o 2º clique cai no véu da janela "ocupado" recém-aberta e a fecharia (= cancelar a busca). Nos primeiros 400 ms o
       véu ignora o clique — só desta janela (o UI.modal das outras segue como é). */
    if (tipo === "ocupado") { try {
      var bg = d && d.querySelector ? d.querySelector("#modal-bg") : null, t0 = Date.now();
      if (bg && bg.addEventListener) bg.addEventListener("click", function (ev) { if (Date.now() - t0 < 400) { if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); if (ev.preventDefault) ev.preventDefault(); } }, true);
    } catch (eV) {} }
    if (MO && d && d.body) {
      var mo = new MO(function () {
        if (d.querySelector('[data-pe-marca="' + marca + '"]')) return;
        mo.disconnect(); if (!h.feito) { h.feito = true; if (aoFechar) aoFechar(); }
      });
      mo.observe(d.body, { childList: true, subtree: true });
    }
    return h;
  }
  function raiz(tipo) { var d = alvoDoc(); return d ? d.querySelector('[data-pe-modal="' + tipo + '"]') : null; }
  function aviso(titulo, texto, corrigir) {
    return janela("aviso", titulo, '<p data-pe="causa">' + esc(texto) + "</p>" + (corrigir ? '<p data-pe="corrigir"><b>O que fazer:</b> ' + esc(corrigir) + "</p>" : ""),
      [{ texto: "Entendi", classe: "primary", onClick: function () { U().fecharModal(); } }]);
  }
  function erroComRetentar(causa, corrigir, retentar) {
    return janela("erro", "Pegar entorno", '<p data-pe="causa">' + esc(causa) + '</p><p data-pe="corrigir"><b>O que fazer:</b> ' + esc(corrigir) + "</p>",
      [{ texto: "Tentar de novo", classe: "primary", onClick: function () { U().fecharModal(); retentar(); } }, { texto: "Fechar", onClick: function () { U().fecharModal(); } }]);
  }

  /* ------------------------------------------------------------------ OBRA / LOCAL */
  function obraAtual() { var g = G(); var o = g ? g._bimSel : null; return (o && o !== "geral") ? o : null; }
  function plano() { var g = G(); return g && g._icarPlano ? g._icarPlano() : null; }
  function entornoDoPlano() { var p = plano(); return (p && p.entorno) || []; }

  /* pede o local ali mesmo. `depois()` roda quando o local foi gravado. Cancelar não grava nada (e não cria plano). */
  function pedirLocal(depois) {
    var g = G(), lc = g._icarLocalEst(), achados = [], atrib = "";
    var ifcOk = !!(global.BIM && global.BIM.icarGeoIfc);
    function usar(ng, origem) {
      var p = g._icarPlano();
      if (!g._icarGeoAplicar(p, ng)) { erroComRetentar("Não consegui gravar o local da obra neste aparelho (armazenamento cheio?).", "Libere espaço em Configurações › Armazenamento e tente de novo.", function () { pedirLocal(depois); }); return; }
      lc.assG = null;
      U().fecharModal();
      try { U().toast("Obra localizada" + (origem ? " pelo " + origem : "") + ". Confira no mapa antes de colocar o entorno.", "ok", 6000); } catch (e) {}
      depois();
    }
    function msgCorpo(h) { var r = raiz("local"), a = r && r.querySelector("[data-pe=\"resultados\"]"); if (a) a.innerHTML = h; }
    function localizar() {
      var r = raiz("local"), inp = r && r.querySelector("[data-pe=\"busca\"]"), txt = String(inp ? inp.value : "").trim();
      var c = global.IcarGeo ? global.IcarGeo.lerCoordenada(txt) : null;
      if (c) { usar({ lat: c.lat, lon: c.lon, fonte: c.fonte }, c.fonte); return; }
      if (txt.length < 4) { msgCorpo('<span data-pe="aviso-local" style="color:#b45309">Cole o link do Google Maps, as coordenadas ou digite o endereço da obra (rua, número, cidade).</span>'); return; }
      msgCorpo('<span class="muted" data-pe="procurando">Procurando o endereço…</span>');
      g._icarGeoPost("/ia/geo/busca", { q: txt }).then(function (x) {
        if (!raiz("local")) return;
        if (x.s !== 200 || !x.j || !x.j.ok) { var e = Pure.erroDoServidor(x, x && x.j && x.j.error); msgCorpo('<span data-pe="aviso-local" style="color:#b45309">' + esc(e.causa + " " + e.corrigir) + "</span>"); return; }
        achados = (x.j.resultados || []).slice(0, 5); atrib = x.j.atribuicao || ATRIB_PADRAO;
        if (!achados.length) { msgCorpo('<span data-pe="aviso-local" style="color:#b45309">Não achei esse endereço. Tente com cidade e estado, ou cole o link do Google Maps.</span>'); return; }
        msgCorpo(achados.map(function (a, i) {
          return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px solid var(--linha)"><span style="flex:1">' + esc(a.nome) + '</span><button class="btn sm" data-pe="usar" data-v="' + i + '">Usar</button></div>';
        }).join("") + '<div class="muted" style="font-size:11px">Endereços: ' + esc(atrib) + ". Endereço cai no meio da rua, não no ponto do terreno: confira no mapa.</div>");
        var rr = raiz("local");
        Array.prototype.forEach.call(rr.querySelectorAll("[data-pe=\"usar\"]"), function (b) {
          b.onclick = function () { var a = achados[+b.getAttribute("data-v")]; if (a) usar({ lat: a.lat, lon: a.lon, fonte: "endereço (OpenStreetMap)", endereco: String(a.nome || "").slice(0, 160) }, "endereço"); };
        });
      });
    }
    var corpo = '<p data-pe="pede-local">Esta obra ainda não tem localização. Diga onde ela fica para eu buscar o que está em volta:</p>' +
      '<input type="text" data-pe="busca" placeholder="endereço, link do Google Maps ou -27,5954; -48,5480" style="width:100%;box-sizing:border-box">' +
      '<div data-pe="resultados" style="margin-top:6px;font-size:12px"></div>' +
      '<p class="muted" style="font-size:11px;margin-top:8px">A coordenada vai ao servidor da RA e dele ao serviço público de mapa (OpenStreetMap) — sem nome de obra nem de cliente.</p>';
    var bt = [{ texto: "Localizar", classe: "primary", onClick: localizar }];
    if (ifcOk) bt.push({ texto: "Ler do IFC", onClick: function () {
      var gi = global.BIM.icarGeoIfc();
      if (!gi || !gi.ok) { msgCorpo('<span data-pe="aviso-local" style="color:#b45309">O IFC aberto não traz o local (' + esc((gi && gi.motivo) || "sem dados") + "). Digite o endereço ou cole o link do mapa.</span>"); return; }
      usar(gi, gi.fonte);
    } });
    bt.push({ texto: "Cancelar", onClick: function () { U().fecharModal(); } });
    janela("local", "Pegar entorno: onde fica a obra?", corpo, bt, function () {});
    try { var r0 = raiz("local"), i0 = r0 && r0.querySelector("[data-pe=\"busca\"]"); if (i0) { i0.onkeydown = function (ev) { if (ev && ev.key === "Enter") localizar(); }; i0.focus(); } } catch (e) {}
  }

  /* ------------------------------------------------------------------ PRÉVIA */
  /* devolve ao Içamento/ao 3D o estado de antes (o que a prévia mexeu) */
  function desfazerPrevia() {
    var g = G(), pv = ex.previa; ex.previa = null; ex.ativo = null;
    if (!g || !pv) return;
    var lc = g._icarLocalEst();
    lc.mapaResp = pv.mapaResp; lc.mapa = pv.mapa; lc.obraMapa = pv.obraMapa; lc.raio = pv.raio; lc.mostrar = pv.mostrar;
    redesenhar();
  }
  function redesenhar() {
    var g = G(); if (!g) return;
    try { g._icarPlantaDesenhar(); } catch (e) {}
    try { g._icarLocalSync({ preservar: true }); } catch (e2) {}
    try { g._icarRender(); } catch (e3) {}
    try { if (global.BIM && global.BIM.icarEntornoVisivel) global.BIM.icarEntornoVisivel(!ex.oculto); } catch (e4) {}
    var p = plano(); ultSig = Pure.assinatura(obraAtual(), p && p.entorno, p && p.vias, ex.oculto);
    atualizarRodape();
  }
  /* A ATRIBUIÇÃO (ODbL): linha fixa no rodapé do 3D enquanto houver dado do mapa; a foto e o filme a desenham por carimbar() */
  function atribuicaoAgora() { var p = plano(); return Pure.atribuicao(p && p.entorno, p && p.vias, !!ex.previa); }
  function atualizarRodape() {
    var d = global.document; if (!d || !d.getElementById) return;
    try {
      var t = atribuicaoAgora(), el = d.getElementById("bim-atrib-osm"), box = d.getElementById("bim-canvas");
      if (!t || !box) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
      if (!el) {
        el = d.createElement("div"); el.id = "bim-atrib-osm"; el.setAttribute("data-pe", "atribuicao");
        el.style.cssText = "position:absolute;right:8px;bottom:4px;z-index:6;font:10px system-ui,sans-serif;color:#e2e8f0;background:rgba(15,23,42,.55);padding:1px 6px;border-radius:4px;pointer-events:none";
        box.appendChild(el);
      }
      el.textContent = t;
    } catch (e) {}
  }
  /* fecha a janela do Pegar entorno que estiver aberta SEM contar como cancelamento (quem chama já cuidou do estado) */
  function fecharAtual() { var h = atual; if (h && !h.feito) { try { h.fechar(); } catch (e) {} } }
  function pintarFita() { try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (e) {} }

  function buscar(substituir) {
    var g = G(), p = g._icarPlano(), geo = g._icarGeo(p), lc = g._icarLocalEst(), raio = +lc.raio || 150, id = ++ex.n;
    ex.ativo = id; ex.obra = obraAtual(); ex.subst = null;
    if (!ex.previa) ex.previa = { mapaResp: lc.mapaResp, mapa: lc.mapa, obraMapa: lc.obraMapa, raio: lc.raio, mostrar: lc.mostrar };
    /* PRÉVIA VISÍVEL com o mapa desligado (Local e clima › Mapa): a prévia é o fantasma laranja do mapa — força ligado até Cancelar/Colocar */
    if (lc.mostrar === false) lc.mostrar = true;
    if (RAIOS.indexOf(raio) < 0) raio = 150;
    janela("ocupado", "Pegar entorno", '<p data-pe="ocupado">Buscando o entorno num raio de ' + raio + " m do ponto da obra…</p>",
      [{ texto: "Cancelar", onClick: function () { U().fecharModal(); } }], function () { if (ex.ativo === id) desfazerPrevia(); });
    g._icarGeoPost("/ia/geo/entorno", { lat: +geo.lat, lon: +geo.lon, raio: raio }).then(function (x) {
      if (ex.ativo !== id) return;   // cancelou no meio
      if (ex.obra !== obraAtual()) { if (ex.previa && ex.previa.mostrar === false) lc.mostrar = false; ex.ativo = null; ex.previa = null; fecharAtual(); return; }   // trocou de obra no meio: a resposta é da outra obra
      if (x.s !== 200 || !x.j || !x.j.ok) {
        var e = Pure.erroDoServidor(x, x && x.j && x.j.error);
        ex.ativo = null; desfazerPrevia();
        erroComRetentar(e.causa, e.corrigir, function () { buscar(substituir); });
        return;
      }
      var p2 = g._icarPlano(); lc.mapaResp = x.j; lc.obraMapa = obraAtual(); lc.raio = raio;
      lc.mapa = null;   // propostas limpas: o que foi aceito/descartado numa busca antiga não vale para esta prévia
      g._icarLocalMapa(p2, { ignorarEntorno: !!substituir });
      if (lc.mapa && substituir) {
        /* o que a pessoa fez fica: a altura digitada passa para o volume novo, e o aceito sem proposta viva continua lá */
        var sb = Pure.substituicao(p2.entorno, Pure.vivas(lc.mapa));
        sb.herdam.forEach(function (h) { h.q.alturaEditada = h.altura; h.q.alturaSemMarca = !!h.semMarca; });
        ex.subst = { digitadas: sb.digitadas, ficam: sb.ficam.length, planta: (p2.entorno || []).length - Pure.doMapa(p2.entorno).length };
      }
      if (!lc.mapa) {
        ex.ativo = null; desfazerPrevia();
        erroComRetentar("O mapa respondeu, mas sem nada que eu consiga desenhar nesta área.", "Tente um raio maior ou confira o local da obra (o ponto pode estar no meio da rua ou fora do lugar).", function () { buscar(substituir); });
        return;
      }
      redesenhar();
      previa(substituir, id);
    });
  }

  function previa(substituir, id) {
    var g = G(), lc = g._icarLocalEst(), mp = lc.mapa, c = Pure.contar(mp, global.IcarEntorno), resp = lc.mapaResp || {}, geo = g._icarGeo(g._icarPlano());
    var raio = +lc.raio || 150, atrib = resp.atribuicao || resp.fonte || ATRIB_PADRAO, p = g._icarPlano();
    var cabe = Pure.cabe(p.entorno, c.total, substituir, substituir ? Pure.substituicao(p.entorno, Pure.vivas(mp)).fontesNovas : null);
    var li = [pl(c.edificacoes, "edificação", "edificações"), pl(c.muros, "muro", "muros"), pl(c.agua, "corpo de água", "corpos de água"), pl(c.ruas, "rua", "ruas"), pl(c.arvores, "árvore", "árvores")];
    var corpo = '<p data-pe="titulo-previa">Entorno achado num raio de <b>' + raio + ' m</b> do ponto da obra' + (geo ? " (" + num5(+geo.lat) + "; " + num5(+geo.lon) + ")" : "") + ":</p>" +
      '<ul data-pe="contagem" style="margin:4px 0 8px 18px">' + [["edificacoes", li[0]], ["muros", li[1]], ["agua", li[2]], ["ruas", li[3]], ["arvores", li[4]]].map(function (k) { return '<li data-pe-n="' + k[0] + '">' + esc(k[1]) + "</li>"; }).join("") + "</ul>" +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">Raio <select data-pe="raio">' + RAIOS.map(function (r) { return '<option value="' + r + '"' + (r === raio ? " selected" : "") + ">" + r + " m</option>"; }).join("") + "</select>" +
      '<button class="btn sm" data-pe="refazer">Buscar de novo</button></div>';
    if (c.estimadas) corpo += '<p class="muted" style="font-size:12px" data-pe="estimadas">' + pl(c.estimadas, "altura é estimada", "alturas são estimadas") + " (o mapa não traz a altura: vale 3 m por pavimento quando traz os pavimentos, senão 3 m). Depois de colocar, digite a altura real em Plano de içamento › aba Cenário › Entorno aceito (campo \"altura\" de cada prédio).</p>";
    if (c.sobreModelo) corpo += '<p class="muted" style="font-size:12px" data-pe="sobre">' + pl(c.sobreModelo, "edificação está", "edificações estão") + " sobre o terreno da obra (pode ser a casa que será demolida ou a própria obra): fica de fora.</p>";
    if (c.cortadas) corpo += '<p style="color:#b45309;font-size:12px" data-pe="cortadas">' + c.cortadas + " volumes mais longe ficaram de fora (teto de 300 por busca).</p>";
    if (!c.total) corpo += '<p style="color:#b45309" data-pe="vazio"><b>O mapa não tem edificação, muro nem água nesta área.</b> Tente um raio maior ou confira o ponto da obra.</p>';
    if (!cabe) corpo += '<p style="color:#b45309" data-pe="estoura"><b>O plano comporta até ' + LIMITE + ' volumes de entorno.</b> Escolha um raio menor e busque de novo.</p>';
    if (substituir) {
      var sx = ex.subst || { digitadas: 0, ficam: 0, planta: 0 };
      corpo += '<p data-pe="substitui" style="font-size:12px">Vai <b>substituir</b> o entorno do mapa que já está na obra. <span data-pe="mantidos">Fica(m): ' + pl(sx.digitadas, "altura digitada mantida", "alturas digitadas mantidas") + "; " +
        pl(sx.ficam, "volume aceito que o mapa novo não traz como proposta", "volumes aceitos que o mapa novo não traz como proposta") + (sx.planta ? "; " + pl(sx.planta, "volume da planta do Içamento", "volumes da planta do Içamento") : "") + ".</span></p>";
    }
    corpo += '<p class="muted" style="font-size:12px" data-pe="aviso-uso">Em laranja no 3D agora. Ao colocar, o entorno fica gravado na obra e vira obstáculo no plano de içamento (o prédio vizinho é obstáculo de verdade). Não entra em orçamento, quantitativo, áreas nem volumes. Ruas ficam gravadas na obra; árvores, áreas verdes e postes aparecem só nesta sessão (não ficam gravados). Para tirar: Massa e terreno › Remover entorno.</p>' +
      '<p class="muted" style="font-size:11px" data-pe="fonte">Fonte dos dados: ' + esc(atrib) + ".</p>";
    var bt = [];
    bt.push({ texto: "Colocar no modelo", classe: "primary", onClick: function () { colocar(substituir, id); } });
    bt.push({ texto: "Cancelar", onClick: function () { U().fecharModal(); } });
    var j = janela("previa", "Pegar entorno: prévia", corpo, bt, function () { if (ex.ativo === id) desfazerPrevia(); });
    var r = raiz("previa");
    if (r) {
      r.setAttribute("data-pe-total", String(c.total));
      var rf = r.querySelector("[data-pe=\"refazer\"]"), sl = r.querySelector("[data-pe=\"raio\"]");
      if (rf) rf.onclick = function () { var novo = +(sl && sl.value) || 150; lc.raio = novo; ex.ativo = null; if (j) j.fechar(); buscar(substituir); };
      if (!c.total || !cabe) { var bts = alvoDoc().querySelectorAll("#modal-footer button"); Array.prototype.forEach.call(bts, function (b) { if (/Colocar/.test(b.textContent)) { b.disabled = true; b.title = !c.total ? "Não há o que colocar" : "Passa do limite de volumes"; } }); }
    }
  }

  /* UMA operação: remove os do mapa (se substituir), adiciona os novos, salva. Falhou → volta ao que era. */
  function colocar(substituir, id) {
    var g = G(), lc = g._icarLocalEst(), mp = lc.mapa; if (!mp || ex.ativo !== id) return;
    if (ex.obra !== obraAtual()) { if (ex.previa && ex.previa.mostrar === false) lc.mostrar = false; ex.ativo = null; ex.previa = null; fecharAtual(); return; }   // a janela era de outra obra: nada é gravado nesta
    var p = g._icarPlano(), lista = Pure.vivas(mp);
    if (!lista.length) return;
    var sb = Pure.substituicao(p.entorno, lista);
    if (!Pure.cabe(p.entorno, lista.length, substituir, sb.fontesNovas)) { U().toast("O plano comporta até " + LIMITE + " volumes de entorno: escolha um raio menor.", "aviso"); return; }
    var antes = (p.entorno || []).slice(), tinhaApoio = !!(p.apoio && p.apoio.modo), viasAntes = p.vias, tinhaVias = Object.prototype.hasOwnProperty.call(p, "vias");
    if (substituir) sb.herdam.forEach(function (h) { if (h.q.alturaEditada == null) { h.q.alturaEditada = h.altura; h.q.alturaSemMarca = !!h.semMarca; } });
    /* substituir tira só o entorno do mapa que ESTA busca troca; o que ela não traz como proposta viva, e o da planta, ficam */
    p.entorno = substituir ? antes.filter(function (e) { return !(e && e.fonte) || !sb.fontesNovas[e.fonte]; }) : antes.slice();
    g._icarEntornoAdicionar(p, lista);
    if (!tinhaApoio) delete p.apoio;   /* a base do volume usou o apoio PADRÃO (_icarApoio grava o padrão no plano): o plano segue sem ele, nada fora de entorno muda */
    /* AS RUAS vão junto, na mesma gravação (a área isolada do Içamento é conferida contra elas); ruas já gravadas só são trocadas ao substituir */
    var viasNovas = false;
    if (substituir || !(p.vias && p.vias.length)) { try { viasNovas = !!g._icarLocalGuardarVias(p, true); } catch (eV) { viasNovas = false; } }
    if (!g._icarSalvar(p)) {
      p.entorno = antes; lista.forEach(function (q) { q.aceita = false; });
      if (tinhaVias) p.vias = viasAntes; else delete p.vias;
      ex.ativo = null; desfazerPrevia();
      erroComRetentar("Não consegui gravar o entorno na obra neste aparelho (armazenamento cheio?).", "Libere espaço em Configurações › Armazenamento e tente de novo. A obra ficou como estava.", function () { BimPegarEntorno.iniciar(); });
      return;
    }
    var tinhaVerif = g._icarEntornoMudou(p);   /* só depois de gravar: a verificação do caminho de antes não vale contra o entorno novo */
    /* a edificação sobre o terreno da obra ficou de fora de propósito: não deixa o fantasma laranja dela no 3D */
    mp.propostas.forEach(function (q) { if (q.sobreModelo && !q.aceita) q.descartada = true; });
    var mostrarAntes = ex.previa ? ex.previa.mostrar : lc.mostrar;
    ex.previa = null; ex.ativo = null;
    if (mostrarAntes === false) lc.mostrar = false;   // a prévia ligou o mapa à força; devolve como a pessoa tinha
    U().fecharModal();
    redesenhar(); pintarFita();
    var arv = 0; try { arv = global.IcarEntorno && global.IcarEntorno.arvores ? global.IcarEntorno.arvores(mp.verdes || []).length : 0; } catch (eA) { arv = 0; }
    try {
      U().toast("Entorno colocado: " + pl(lista.length, "volume", "volumes") + " em volta da obra. Também vale no plano de içamento." + (viasNovas ? " As ruas ficaram gravadas." : "") +
        (arv ? " As árvores aparecem só nesta sessão." : "") + (tinhaVerif ? " Verifique o caminho de novo no Içamento." : ""), tinhaVerif ? "aviso" : "ok", 8000);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ API */
  var BimPegarEntorno = {
    Pure: Pure,
    LIMITE: LIMITE,
    /* há entorno gravado na obra aberta? (a fita mostra "Remover entorno" só então) */
    tem: function () { try { return !!obraAtual() && entornoDoPlano().length > 0; } catch (e) { return false; } },
    /* o botão "Pegar entorno" */
    iniciar: function () {
      var g = G();
      if (ex.ativo && atual && !atual.feito && atual.tipo === "ocupado") return true;   // duplo clique: já está buscando
      if (!g || !g._icarPlano || !U()) { aviso("Pegar entorno", "O módulo de obras não carregou nesta tela.", "Recarregue o app (F5) e tente de novo."); return false; }
      if (!obraAtual()) { aviso("Pegar entorno: falta a obra", "Este BIM não está ligado a uma obra, e o entorno é gravado na obra.", "Escolha a obra no seletor do alto da tela do BIM (ou crie uma em Obras) e clique em Pegar entorno de novo."); return false; }
      if (!g._icarGeo(g._icarPlano())) { pedirLocal(function () { BimPegarEntorno._depoisDoLocal(); }); return true; }
      BimPegarEntorno._depoisDoLocal(); return true;
    },
    _depoisDoLocal: function () {
      var g = G(), mapaN = Pure.doMapa(entornoDoPlano()).length;
      if (!mapaN) { buscar(false); return; }
      var alt = Pure.doMapa(entornoDoPlano()).filter(function (e) { return e.estimada === false && e.tipo !== "agua"; }).length, plantaN = entornoDoPlano().length - mapaN;
      janela("substituir", "Pegar entorno", '<p data-pe="pergunta">Substituir o entorno atual?</p><p>Esta obra já tem ' + pl(mapaN, "volume", "volumes") + ' do mapa. Se substituir, os que o mapa trouxer de novo são trocados; só depois de você ver a prévia e aceitar. Se não substituir, nada muda.</p>' +
          '<p data-pe="mantem" style="font-size:12px">Não se perde o que você fez: ' + pl(alt, "altura já conferida", "alturas já conferidas") + ' (digitadas por você ou medidas no mapa) passa(m) para o prédio novo de mesmo número; volume aceito que o mapa novo não trouxer como proposta (por exemplo o que está sobre o terreno)' + (plantaN ? ' e ' + pl(plantaN, "volume da planta do Içamento", "volumes da planta do Içamento") : '') + ' ficam. A prévia diz os números exatos.</p>',
        [{ texto: "Substituir", classe: "primary", onClick: function () { U().fecharModal(); buscar(true); } }, { texto: "Não substituir", onClick: function () { U().fecharModal(); } }]);
      return g;
    },
    /* o botão "Remover entorno": confirma e limpa p.entorno (também some do plano de içamento) */
    remover: function () {
      var g = G(); if (!g || !U()) return false;
      var p = g._icarPlano(), lista = (p && p.entorno) || [];
      if (!lista.length) { aviso("Remover entorno", "Esta obra não tem entorno colocado.", ""); return false; }
      var nm = Pure.doMapa(lista).length, np = lista.length - nm;
      janela("remover", "Remover entorno", '<p data-pe="pergunta">Remover o entorno desta obra?</p><p>' + pl(nm, "volume do mapa sai", "volumes do mapa saem") + " do 3D e do plano de içamento (deixam de ser obstáculo). O modelo, o orçamento e o quantitativo não mudam. As ruas gravadas ficam (servem à conferência da área isolada)." + "</p>" +
        (np ? '<p data-pe="planta"><label><input type="checkbox" data-pe="tambem-planta"> Remover também ' + pl(np, "volume da planta do Içamento", "volumes da planta do Içamento") + " (desenhados por você ou lidos da planta)</label></p>" : "") +
        '<p data-pe="irreversivel"><b>Não dá para desfazer.</b></p>',
        [{ texto: "Remover entorno", classe: "primary", onClick: function () {
          var rz = raiz("remover"), ck = rz && rz.querySelector ? rz.querySelector('[data-pe="tambem-planta"]') : null, tambem = !!(ck && ck.checked);
          var p2 = g._icarPlano(), ant = (p2.entorno || []).slice(), fontes = Pure.doMapa(ant).map(function (e) { return e.fonte; });
          if (!fontes.length && !tambem) { U().toast("Não há volume do mapa para remover. Marque a caixa para remover os da planta do Içamento.", "aviso"); return; }
          p2.entorno = tambem ? [] : ant.filter(function (e) { return !(e && e.fonte); });
          if (!g._icarSalvar(p2)) { p2.entorno = ant; U().fecharModal(); erroComRetentar("Não consegui gravar a remoção neste aparelho.", "Libere espaço em Configurações › Armazenamento e tente de novo. O entorno continua na obra.", function () { BimPegarEntorno.remover(); }); return; }
          var tv = g._icarEntornoMudou(p2), lc = g._icarLocalEst(); lc.mapaResp = null; lc.mapa = null; lc.obraMapa = null; lc.assin = null;
          U().fecharModal(); redesenhar(); pintarFita();
          try { U().toast("Entorno removido da obra" + (tambem ? " (também os da planta do Içamento)." : ".") + (tv ? " Verifique o caminho de novo no Içamento." : ""), "ok", 5000); } catch (e) {}
        } }, { texto: "Cancelar", onClick: function () { U().fecharModal(); } }]);
      return true;
    },
    /* o plano mudou (Içamento ou BIM): repinta a fita só quando "há entorno" virou outra coisa */
    aoSalvar: function () {
      atualizarRodape();
      var t = BimPegarEntorno.tem(); if (t === ultTem) return;
      ultTem = t; pintarFita();
    },
    /* MOSTRAR/OCULTAR o entorno na fita: só a VISUALIZAÇÃO (a foto e o filme respeitam); o plano, o caminho e a colisão seguem com ele */
    ocultar: function (sim) {
      ex.oculto = !!sim;
      try { if (global.BIM && global.BIM.icarEntornoVisivel) global.BIM.icarEntornoVisivel(!ex.oculto); } catch (e) {}
      var p = plano(); ultSig = Pure.assinatura(obraAtual(), p && p.entorno, p && p.vias, ex.oculto);
      return ex.oculto;
    },
    oculto: function () { return !!ex.oculto; },
    /* a linha de atribuição (ODbL) enquanto houver dado do mapa; "" senão */
    atribuicao: function () { try { return atribuicaoAgora(); } catch (e) { return ""; } },
    /* a foto e o filme desenham a mesma linha no canto de baixo à esquerda */
    carimbar: function (g, W, H) {
      var t = BimPegarEntorno.atribuicao(); if (!t || !g) return false;
      try {
        var fs = Math.max(10, Math.round(H / 72)); g.save(); g.font = "600 " + fs + "px system-ui, sans-serif";
        var tw = g.measureText(t).width; g.fillStyle = "rgba(15,23,42,.55)"; g.fillRect(fs * 0.6, H - fs * 2.2, tw + fs * 1.2, fs * 1.7);
        g.fillStyle = "#fff"; g.fillText(t, fs * 1.2, H - fs * 0.95); g.restore(); return true;
      } catch (e) { return false; }
    },
    /* o 3D do BIM acompanha a obra aberta: entra na obra com entorno gravado → desenha; troca para uma sem → limpa */
    sincronizar: function (forcar) {
      var g = G(); if (!g || !g._icarPlano || !global.BIM || !global.BIM.icarPlanta) return false;
      var lc = g._icarLocalEst(), ob = obraAtual();
      /* trocou de obra: a busca, o relevo e as propostas da sessão eram da anterior; uma busca/prévia/janela em andamento morre COM ELA
         (sem restaurar o estado da prévia — era o da obra anterior — e sem gravar nada na nova) */
      if (lc._obraSync !== undefined && lc._obraSync !== ob) {
        if (ex.previa && ex.previa.mostrar === false) lc.mostrar = false;   /* a prévia ligou o mapa à força: devolve como a pessoa tinha */
        ex.ativo = null; ex.previa = null; ex.subst = null; ex.obra = null; ex.oculto = false;
        lc.mapaResp = null; lc.mapa = null; lc.relevoResp = null; lc.malha = null; lc.assin = null; lc.assG = null; lc.obraMapa = null; ultSig = null;
        fecharAtual();
      }
      lc._obraSync = ob;
      /* o botão "Ocultar entorno" da fita acompanha o estado de verdade (trocou de obra: volta a mostrar); Esc não o desliga (persistente) */
      try { if (global.BimRibbon && global.BimRibbon.setAtivo) global.BimRibbon.setAtivo("p11-entorno-ver", !!ex.oculto); } catch (eRb) {}
      var tem = BimPegarEntorno.tem(), p = plano();
      /* nada mudou desde o último desenho (obra, ids e alturas, ruas, oculto): não redesenha. `forcar`: o 3D acabou de ser montado */
      if (!forcar && ultSig != null && ultSig === Pure.assinatura(ob, p && p.entorno, p && p.vias, ex.oculto)) { ultTem = tem; return tem; }
      redesenhar();
      ultTem = tem; pintarFita();
      return tem;
    },
    _ex: ex
  };

  /* a fita do BIM pergunta "há entorno?" por aqui (BimPrevia.entornoColocado) */
  global.BimPegarEntorno = BimPegarEntorno;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPegarEntorno;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
