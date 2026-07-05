/* ============================================================
   OrçaPro — Construtor 3D : CONTROLADOR DO JOGO
   Telas, lojas (lote, canteiro, equipe, ferramentas, insumos,
   projetos), execução das etapas, pontuação e progressão.
   ============================================================ */
(function (global) {
  'use strict';

  var D = global.DADOS, E = global.ESTADO;
  var cena = null;
  var painelAtual = null;

  // ---------- utilidades --------------------------------------
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function rs(v) {
    v = Math.round(v);
    return 'R$ ' + v.toLocaleString('pt-BR');
  }
  function escala() { var n = nivelAtual(); return n ? n.escala : 1; }
  function nivelAtual() { var s = E.get(); return s.obra.nivelId ? D.nivel(s.obra.nivelId) : null; }
  function toast(msg, tipo) {
    var t = el('<div class="toast ' + (tipo || '') + '">' + msg + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // ---------- montagem das telas ------------------------------
  function montarBase() {
    var app = $('#app');
    app.innerHTML = '';
    app.appendChild(el('<div id="tela-menu" class="tela"></div>'));
    app.appendChild(el('<div id="tela-niveis" class="tela oculto"></div>'));
    app.appendChild(el(
      '<div id="tela-jogo" class="tela oculto">' +
        '<canvas id="cena"></canvas>' +
        '<div id="hud"></div>' +
        '<div id="dock"></div>' +
        '<div id="painel" class="oculto"></div>' +
        '<div id="overlay-anim" class="oculto"></div>' +
      '</div>'
    ));
  }

  // ======== MENU ==============================================
  function telaMenu() {
    trocarTela('tela-menu');
    var s = E.get();
    var temSave = s.obra.nivelId && s.obra.etapasConcluidas.length > 0;
    $('#tela-menu').innerHTML =
      '<div class="menu-bg"></div>' +
      '<div class="menu-card">' +
        '<div class="menu-logo">🏗️ OrçaPro <span>Construtor 3D</span></div>' +
        '<p class="menu-sub">Simulador de construção civil. Compre o lote, monte o canteiro, ' +
        'contrate a equipe, alugue equipamentos e entregue a obra dentro do prazo e do orçamento.</p>' +
        '<div class="menu-stats">💰 Caixa da construtora: <b>' + rs(s.caixa) + '</b></div>' +
        '<div class="menu-botoes">' +
          (temSave ? '<button class="bt grande verde" id="bt-continuar">▶ Continuar obra</button>' : '') +
          '<button class="bt grande azul" id="bt-niveis">🏆 Selecionar fase</button>' +
          '<button class="bt grande cinza" id="bt-reset">🗑️ Reiniciar progresso</button>' +
        '</div>' +
        '<div class="menu-rodape">Otimizado para tablet • toque e arraste para girar a obra em 3D</div>' +
      '</div>';
    if (temSave) $('#bt-continuar').onclick = function () { abrirJogo(); };
    $('#bt-niveis').onclick = telaNiveis;
    $('#bt-reset').onclick = function () {
      if (confirm('Reiniciar todo o progresso e o caixa da construtora?')) { E.resetar(); telaMenu(); }
    };
  }

  // ======== SELEÇÃO DE NÍVEIS =================================
  function telaNiveis() {
    trocarTela('tela-niveis');
    var s = E.get();
    var cards = D.NIVEIS.map(function (n) {
      var liberado = n.id <= s.nivelMax;
      var est = s.estrelas[n.id] || 0;
      var estrelasHtml = '★★★'.split('').map(function (_, i) {
        return '<span class="' + (i < est ? 'on' : '') + '">★</span>';
      }).join('');
      return '<div class="nivel-card ' + (liberado ? '' : 'travado') + '" data-id="' + n.id + '">' +
        '<div class="nv-ico">' + n.icone + (liberado ? '' : ' 🔒') + '</div>' +
        '<div class="nv-info">' +
          '<div class="nv-tipo">' + n.tipo.toUpperCase() + ' • Fase ' + n.id + '</div>' +
          '<div class="nv-nome">' + n.nome + '</div>' +
          '<div class="nv-desc">' + n.desc + '</div>' +
          '<div class="nv-meta">📅 Prazo: <b>' + n.prazo + ' dias</b> &nbsp; 💵 Venda: <b>' + rs(n.orcamento) + '</b></div>' +
          '<div class="nv-estrelas">' + estrelasHtml + '</div>' +
        '</div></div>';
    }).join('');
    $('#tela-niveis').innerHTML =
      '<div class="topbar"><button class="bt voltar" id="nv-voltar">‹ Menu</button>' +
        '<div class="topbar-tit">Selecione a fase</div>' +
        '<div class="topbar-caixa">💰 ' + rs(s.caixa) + '</div></div>' +
      '<div class="niveis-grid">' + cards + '</div>';
    $('#nv-voltar').onclick = telaMenu;
    document.querySelectorAll('.nivel-card:not(.travado)').forEach(function (c) {
      c.onclick = function () { iniciarNivel(parseInt(c.dataset.id, 10)); };
    });
  }

  function iniciarNivel(id) {
    var s = E.get();
    var jaTinha = s.obra.nivelId === id && s.obra.etapasConcluidas.length > 0;
    if (!jaTinha) {
      if (s.obra.nivelId && s.obra.nivelId !== id && s.obra.etapasConcluidas.length > 0) {
        if (!confirm('Iniciar uma nova obra vai abandonar a obra em andamento. Continuar?')) return;
      }
      E.iniciarNivel(id);
    }
    abrirJogo(true);
  }

  // ======== TELA DE JOGO ======================================
  function abrirJogo(comBriefing) {
    trocarTela('tela-jogo');
    var canvasAtual = $('#cena');
    // (re)cria a cena se ainda não existe ou se o canvas foi remontado
    if (!cena || cena.canvas !== canvasAtual) {
      if (cena && cena.destruir) cena.destruir();
      cena = new global.Cena3D(canvasAtual);
    }
    if (cena && !cena.ok) {
      $('#cena').style.display = 'none';
      var aviso = el('<div class="sem3d">⚠️ Não foi possível carregar o motor 3D (Three.js). ' +
        'Conecte-se à internet uma vez para baixar o motor — o gerenciamento da obra continua funcionando normalmente abaixo.</div>');
      $('#tela-jogo').insertBefore(aviso, $('#hud'));
    }
    renderHUD();
    renderDock();
    atualizarCena();
    setTimeout(function () { if (cena) cena.resize(); }, 50);
    if (comBriefing) abrirPainel('briefing');
  }

  function renderHUD() {
    var s = E.get(), n = nivelAtual();
    if (!n) return;
    var prog = progresso();
    var atraso = s.obra.dia > n.prazo;
    var clima = D.CLIMAS[n.clima];
    var climaIco = s.obra.tempoChuva ? '🌧️' : clima.emoji;
    var seg = E.nivelSeguranca();
    var mudo = global.AUDIO && global.AUDIO.mudo();
    $('#hud').innerHTML =
      '<button class="bt mini" id="hud-menu">‹</button>' +
      '<div class="hud-bloco"><span class="hl">' + n.icone + ' ' + n.nome + '</span></div>' +
      '<div class="hud-bloco"><small>Caixa</small><b class="' + (s.caixa < 0 ? 'neg' : '') + '">' + rs(s.caixa) + '</b></div>' +
      '<div class="hud-bloco"><small>Prazo</small><b class="' + (atraso ? 'neg' : '') + '">' + s.obra.dia + ' / ' + n.prazo + ' d</b></div>' +
      '<div class="hud-bloco hud-prog"><small>Obra</small>' +
        '<div class="barra"><i style="width:' + prog + '%"></i></div><b>' + prog + '%</b></div>' +
      '<div class="hud-bloco hud-mini2" title="Clima: ' + clima.nome + '"><small>Clima</small><b>' + climaIco + '</b></div>' +
      '<div class="hud-bloco hud-mini2" title="Segurança NR-18"><small>Seg</small><b class="' + (seg < 40 ? 'neg' : '') + '">' + seg + '%</b></div>' +
      '<button class="bt mini" id="hud-som">' + (mudo ? '🔇' : '🔊') + '</button>';
    $('#hud-menu').onclick = telaMenu;
    $('#hud-som').onclick = function () {
      var m = global.AUDIO.toggleMudo();
      if (!m && s.obra.tempoChuva) global.AUDIO.chuva(true);
      renderHUD();
    };
  }

  function renderDock() {
    var itens = [
      ['briefing', '📋', 'Resumo'],
      ['lote', '📍', 'Lote'],
      ['canteiro', '🚧', 'Canteiro'],
      ['equipe', '👷', 'Equipe'],
      ['ferramentas', '🛠️', 'Ferram.'],
      ['insumos', '🧱', 'Materiais'],
      ['seguranca', '🦺', 'Segurança'],
      ['projetos', '📐', 'Projetos'],
      ['obra', '🏗️', 'Executar']
    ];
    $('#dock').innerHTML = itens.map(function (i) {
      return '<button class="dock-bt" data-p="' + i[0] + '"><span class="di">' + i[1] + '</span>' +
        '<span class="dl">' + i[2] + '</span></button>';
    }).join('');
    document.querySelectorAll('.dock-bt').forEach(function (b) {
      b.onclick = function () { if (global.AUDIO) { global.AUDIO.ativar(); global.AUDIO.clique(); } abrirPainel(b.dataset.p); };
    });
  }

  // ---------- progresso e cena --------------------------------
  function progresso() {
    var n = nivelAtual(); if (!n) return 0;
    return Math.round((E.get().obra.etapasConcluidas.length / n.etapas.length) * 100);
  }

  function estagiosConcluidos() {
    var s = E.get(), set = new Set();
    if (s.obra.canteiro.length) set.add('canteiro');
    s.obra.etapasConcluidas.forEach(function (id) {
      var et = D.etapa(id); if (et) set.add(et.estagio);
    });
    return set;
  }

  function cfgCena(emObra) {
    var s = E.get(), n = nivelAtual();
    var lote = D.lote(s.obra.loteId);
    var equipeTotal = 0;
    Object.keys(s.obra.equipe).forEach(function (k) { equipeTotal += s.obra.equipe[k]; });
    var temInsumo = Object.keys(s.obra.insumos).some(function (k) { return s.obra.insumos[k] > 0; });
    return {
      tipo: n.tipo, pavimentos: n.pavimentos, escala: n.escala,
      frente: lote ? lote.frente : 10, fundo: lote ? lote.fundo : 20,
      canteiro: s.obra.canteiro,
      ferramentas: s.obra.ferramentasCompradas.concat(s.obra.ferramentasAlugadas),
      equipe: equipeTotal, insumosNoCanteiro: temInsumo, emObra: emObra || null
    };
  }

  function atualizarCena(emObra) {
    if (!cena || !cena.ok) return;
    if (!nivelAtual()) return;
    var cfg = cfgCena(emObra);
    cena.construir(estagiosConcluidos(), cfg);
    cena.setChuva(E.get().obra.tempoChuva);
    // som ambiente da betoneira
    if (global.AUDIO) {
      var temBet = cfg.ferramentas.indexOf('betoneira') >= 0 && cfg.canteiro.length > 0;
      global.AUDIO.betoneira(temBet && !global.AUDIO.mudo());
    }
  }

  // ======== PAINÉIS ===========================================
  function abrirPainel(p) {
    painelAtual = p;
    var pe = $('#painel');
    pe.classList.remove('oculto');
    pe.innerHTML = '';
    var titulos = {
      briefing: '📋 Resumo da obra', lote: '📍 Comprar o lote', canteiro: '🚧 Montar o canteiro',
      equipe: '👷 Contratar equipe', ferramentas: '🛠️ Ferramentas e equipamentos',
      insumos: '🧱 Comprar materiais', seguranca: '🦺 Segurança (NR-18)',
      projetos: '📐 Projetos técnicos', obra: '🏗️ Executar etapas'
    };
    var head = el('<div class="painel-head"><b>' + (titulos[p] || '') + '</b>' +
      '<div class="painel-caixa">💰 ' + rs(E.get().caixa) + '</div>' +
      '<button class="bt fechar" id="p-fechar">✕</button></div>');
    pe.appendChild(head);
    var corpo = el('<div class="painel-corpo"></div>');
    pe.appendChild(corpo);
    $('#p-fechar').onclick = fecharPainel;
    ({
      briefing: pBriefing, lote: pLote, canteiro: pCanteiro, equipe: pEquipe,
      ferramentas: pFerramentas, insumos: pInsumos, seguranca: pSeguranca,
      projetos: pProjetos, obra: pObra
    })[p](corpo);
  }
  function fecharPainel() { $('#painel').classList.add('oculto'); painelAtual = null; }
  function recarregarPainel() { if (painelAtual) abrirPainel(painelAtual); renderHUD(); }

  // ---- Briefing ----
  function pBriefing(c) {
    var n = nivelAtual(), s = E.get();
    var clima = D.CLIMAS[n.clima];
    var custoEst = Math.round(n.orcamento / (1 + n.bdi));
    var projs = n.projetosObrig.map(function (id) {
      var p = D.projeto(id);
      return '<span class="tag ' + (E.temProjeto(id) ? 'ok' : '') + '">' + p.emoji + ' ' + p.nome + '</span>';
    }).join('');
    var areaC = areaConstruida();
    c.innerHTML =
      '<div class="info-box">' + n.icone + ' <b>' + n.nome + '</b><br><small>' + n.desc + '</small></div>' +
      '<div class="grade2">' +
        '<div class="kpi"><small>Tipo</small><b>' + n.tipo + '</b></div>' +
        '<div class="kpi"><small>Pavimentos</small><b>' + n.pavimentos + '</b></div>' +
        '<div class="kpi"><small>Prazo</small><b>' + n.prazo + ' dias</b></div>' +
        '<div class="kpi"><small>Clima</small><b>' + clima.emoji + ' ' + clima.nome + '</b></div>' +
        '<div class="kpi"><small>Lote exigido</small><b>' + n.loteMin + '–' + n.loteMax + ' m²</b></div>' +
        '<div class="kpi"><small>Área construída</small><b>' + (areaC ? areaC + ' m²' : '—') + '</b></div>' +
      '</div>' +
      '<h4>💰 Contrato e economia</h4>' +
      '<div class="fin-box">' +
        '<div><span>Custo estimado (SINAPI)</span><b>' + rs(custoEst) + '</b></div>' +
        '<div><span>BDI aplicado</span><b>' + (n.bdi * 100).toFixed(2) + '%</b></div>' +
        '<div><span>Valor do contrato</span><b class="pos">' + rs(n.orcamento) + '</b></div>' +
        '<div><span>Impostos s/ medição</span><b>' + (D.IMPOSTO * 100).toFixed(2) + '%</b></div>' +
        '<div class="fin-sep"><span>Já recebido (medições)</span><b class="pos">' + rs(s.obra.recebido) + '</b></div>' +
        (s.obra.emprestimo ? '<div><span>Financiamento a pagar</span><b class="neg">' + rs(s.obra.emprestimo + s.obra.emprestimoJuros) + '</b></div>' : '') +
      '</div>' +
      (s.obra.etapasConcluidas.length === 0 && !s.obra.emprestimo ?
        '<button class="bt azul" id="bt-financiar" style="width:100%;margin-top:8px">🏦 Tomar financiamento (' +
        rs(Math.round(n.orcamento * 0.3)) + ' agora, +15% na entrega)</button>' : '') +
      '<h4>Projetos obrigatórios para a entrega</h4><div class="tags">' + projs + '</div>' +
      '<div class="dica">💡 Você recebe uma <b>medição</b> a cada etapa concluída (proporcional ao serviço), já descontado o imposto. ' +
      'Cuidado com <b>chuva</b>, <b>cura do concreto</b>, <b>segurança</b> e <b>imprevistos</b>!</div>';
    if ($('#bt-financiar')) $('#bt-financiar').onclick = function () {
      var v = Math.round(n.orcamento * 0.3);
      E.creditar(v);
      s.obra.emprestimo = v; s.obra.emprestimoJuros = Math.round(v * 0.15); E.salvar();
      if (global.AUDIO) global.AUDIO.dinheiro();
      toast('Financiamento aprovado! +' + rs(v), 'ok'); recarregarPainel();
    };
  }

  function areaConstruida() {
    var s = E.get(), n = nivelAtual();
    var lote = D.lote(s.obra.loteId);
    if (!lote) return 0;
    var bw = Math.max(6, Math.min(lote.frente - 2.4, lote.frente * 0.78));
    var bd = Math.max(6, Math.min(lote.fundo * 0.6, lote.fundo - 6));
    return Math.round(bw * bd * n.pavimentos);
  }

  // ---- Lote ----
  function pLote(c) {
    var n = nivelAtual(), s = E.get();
    c.innerHTML = '<p class="ajuda">Compre um lote compatível com a fase (entre ' + n.loteMin +
      ' e ' + n.loteMax + ' m²). O custo do terreno sai do caixa.</p>';
    D.LOTES.forEach(function (l) {
      var compativel = l.area >= n.loteMin && l.area <= n.loteMax;
      var atual = s.obra.loteId === l.id;
      var card = el(
        '<div class="loja-item ' + (atual ? 'sel' : '') + (compativel ? '' : ' incompat') + '">' +
          '<div class="li-ico">📐</div>' +
          '<div class="li-info"><b>' + l.nome + '</b>' +
            '<small>' + l.frente + 'm × ' + l.fundo + 'm = ' + l.area + ' m² • ' + l.desc + '</small>' +
            (compativel ? '' : '<small class="warn">Não compatível com esta fase</small>') +
          '</div>' +
          '<div class="li-acao"><b class="preco">' + rs(l.preco) + '</b>' +
            (atual ? '<span class="badge-ok">✓ Comprado</span>' :
              '<button class="bt comprar ' + (compativel ? '' : 'off') + '">Comprar</button>') +
          '</div></div>');
      if (compativel && !atual) {
        $('.comprar', card).onclick = function () {
          if (s.obra.loteId) { toast('Você já comprou um lote para esta obra.', 'erro'); return; }
          if (!E.pode(l.preco)) { toast('Caixa insuficiente.', 'erro'); return; }
          E.debitar(l.preco); s.obra.loteId = l.id; E.salvar();
          toast('Lote adquirido! 📍', 'ok'); atualizarCena(); recarregarPainel();
        };
      }
      c.appendChild(card);
    });
  }

  // ---- Canteiro ----
  function pCanteiro(c) {
    var s = E.get();
    c.innerHTML = '<p class="ajuda">Monte a estrutura do canteiro. <b>Tapume</b> e <b>Barracão/Almoxarifado</b> ' +
      'são obrigatórios para iniciar a obra.</p>';
    D.CANTEIRO.forEach(function (it) {
      var tem = E.temCanteiro(it.id);
      var card = el(
        '<div class="loja-item ' + (tem ? 'sel' : '') + '">' +
          '<div class="li-ico">' + it.emoji + '</div>' +
          '<div class="li-info"><b>' + it.nome + '</b><small>' + it.desc + '</small></div>' +
          '<div class="li-acao"><b class="preco">' + rs(it.preco) + '</b>' +
            (tem ? '<span class="badge-ok">✓ Montado</span>' : '<button class="bt comprar">Montar</button>') +
          '</div></div>');
      if (!tem) {
        $('.comprar', card).onclick = function () {
          if (!E.pode(it.preco)) { toast('Caixa insuficiente.', 'erro'); return; }
          E.debitar(it.preco); s.obra.canteiro.push(it.id); E.salvar();
          toast(it.nome + ' montado! 🚧', 'ok'); atualizarCena(); recarregarPainel();
        };
      }
      c.appendChild(card);
    });
  }

  // ---- Equipe ----
  function pEquipe(c) {
    var s = E.get();
    var setores = { tecnico: '🎓 Técnico', execucao: '🔨 Execução', instalacoes: '🔧 Instalações', acabamento: '🎨 Acabamento', apoio: '📦 Apoio' };
    c.innerHTML = '<p class="ajuda">Contrate profissionais. Em cada etapa você paga só as funções usadas, ' +
      'pela diária × dias. Mais gente da função e um <b>Mestre de Obras</b> aceleram a etapa (menos dias).</p>';
    Object.keys(setores).forEach(function (set) {
      c.appendChild(el('<h4 class="setor">' + setores[set] + '</h4>'));
      D.FUNCOES.filter(function (f) { return f.setor === set; }).forEach(function (f) {
        var q = E.qtdEquipe(f.id);
        var card = el(
          '<div class="loja-item">' +
            '<div class="li-ico">' + f.emoji + '</div>' +
            '<div class="li-info"><b>' + f.nome + '</b><small>' + f.desc + '</small>' +
              '<small class="preco-un">' + rs(f.diaria) + ' / dia</small></div>' +
            '<div class="li-acao stepper"><button class="bt menos">−</button>' +
              '<b class="qtd">' + q + '</b><button class="bt mais">+</button></div>' +
          '</div>');
        $('.mais', card).onclick = function () {
          s.obra.equipe[f.id] = (s.obra.equipe[f.id] || 0) + 1; E.salvar();
          atualizarCena(); $('.qtd', card).textContent = s.obra.equipe[f.id];
        };
        $('.menos', card).onclick = function () {
          if (!s.obra.equipe[f.id]) return;
          s.obra.equipe[f.id]--; if (!s.obra.equipe[f.id]) delete s.obra.equipe[f.id];
          E.salvar(); atualizarCena(); $('.qtd', card).textContent = E.qtdEquipe(f.id);
        };
        c.appendChild(card);
      });
    });
    var diaria = custoDiarioEquipe();
    c.appendChild(el('<div class="resumo-rodape">Folha diária (se todos trabalharem 1 dia): <b>' + rs(diaria) + '</b></div>'));
  }
  function custoDiarioEquipe() {
    var s = E.get(), t = 0;
    Object.keys(s.obra.equipe).forEach(function (id) {
      var f = D.funcao(id); if (f) t += f.diaria * s.obra.equipe[id];
    });
    return t;
  }

  // ---- Ferramentas ----
  function pFerramentas(c) {
    var s = E.get();
    c.innerHTML = '<p class="ajuda">Compre ferramentas que usará sempre, ou <b>alugue</b> equipamentos pesados — ' +
      'o aluguel só é cobrado nas etapas em que o equipamento é usado.</p>';
    D.FERRAMENTAS.forEach(function (f) {
      var comprada = s.obra.ferramentasCompradas.indexOf(f.id) >= 0;
      var alugada = s.obra.ferramentasAlugadas.indexOf(f.id) >= 0;
      var acoes = '';
      if (comprada) acoes = '<span class="badge-ok">✓ Comprada</span>';
      else if (alugada) acoes = '<span class="badge-ok alug">📅 Alugada</span><button class="bt mini-x devolver">devolver</button>';
      else {
        if (f.modo === 'comprar' || f.modo === 'ambos')
          acoes += '<button class="bt comprar">Comprar ' + rs(f.precoCompra) + '</button>';
        if (f.modo === 'alugar' || f.modo === 'ambos')
          acoes += '<button class="bt alugar">Alugar ' + rs(f.precoAluguel) + '/dia</button>';
      }
      var card = el(
        '<div class="loja-item ' + (comprada || alugada ? 'sel' : '') + '">' +
          '<div class="li-ico">' + f.emoji + '</div>' +
          '<div class="li-info"><b>' + f.nome + '</b><small>' + f.desc + '</small></div>' +
          '<div class="li-acao col">' + acoes + '</div></div>');
      var bc = $('.comprar', card), ba = $('.alugar', card), bd = $('.devolver', card);
      if (bc) bc.onclick = function () {
        if (!E.pode(f.precoCompra)) { toast('Caixa insuficiente.', 'erro'); return; }
        E.debitar(f.precoCompra); s.obra.ferramentasCompradas.push(f.id); E.salvar();
        toast(f.nome + ' comprada! 🛠️', 'ok'); atualizarCena(); recarregarPainel();
      };
      if (ba) ba.onclick = function () {
        s.obra.ferramentasAlugadas.push(f.id); E.salvar();
        toast(f.nome + ' alugada 📅 (cobrança por etapa de uso)', 'ok'); atualizarCena(); recarregarPainel();
      };
      if (bd) bd.onclick = function () {
        s.obra.ferramentasAlugadas = s.obra.ferramentasAlugadas.filter(function (x) { return x !== f.id; });
        E.salvar(); atualizarCena(); recarregarPainel();
      };
      c.appendChild(card);
    });
  }

  // ---- Insumos ----
  function pInsumos(c) {
    var s = E.get();
    c.innerHTML = '<p class="ajuda">Compre materiais para o estoque do canteiro. Cada etapa consome o que precisa — ' +
      'compre antes de executar! Toque em +1 / +5 / +10.</p>';
    D.INSUMOS.forEach(function (m) {
      var card = el(
        '<div class="loja-item">' +
          '<div class="li-ico">' + m.emoji + '</div>' +
          '<div class="li-info"><b>' + m.nome + '</b>' +
            '<small>' + rs(m.preco) + ' / ' + m.un + '</small>' +
            '<small class="estoque">Estoque: <b>' + E.estoque(m.id) + '</b> ' + m.un + '</small></div>' +
          '<div class="li-acao col compras">' +
            '<button class="bt p1" data-q="1">+1</button>' +
            '<button class="bt p1" data-q="5">+5</button>' +
            '<button class="bt p1" data-q="10">+10</button>' +
          '</div></div>');
      $('.compras', card).querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var q = parseInt(b.dataset.q, 10), custo = q * m.preco;
          if (!E.pode(custo)) { toast('Caixa insuficiente.', 'erro'); return; }
          E.debitar(custo);
          s.obra.insumos[m.id] = (s.obra.insumos[m.id] || 0) + q; E.salvar();
          $('.estoque b', card).textContent = E.estoque(m.id);
          $('.painel-caixa').textContent = '💰 ' + rs(s.caixa);
          atualizarCena();
        };
      });
      c.appendChild(card);
    });
  }

  // ---- Segurança (NR-18) ----
  function pSeguranca(c) {
    var s = E.get(), seg = E.nivelSeguranca();
    var cor = seg >= 70 ? 'pos' : (seg >= 40 ? '' : 'neg');
    c.innerHTML = '<p class="ajuda">Invista em segurança (NR-18) para <b>reduzir acidentes</b> e passar nas ' +
      'fiscalizações. Segurança alta também conta pontos na avaliação final.</p>' +
      '<div class="seg-medidor"><div class="seg-bar"><i style="width:' + seg + '%"></i></div>' +
      '<b class="' + cor + '">' + seg + '% de segurança</b></div>';
    D.SEGURANCA.forEach(function (it) {
      var tem = E.temSeguranca(it.id);
      var card = el(
        '<div class="loja-item ' + (tem ? 'sel' : '') + '">' +
          '<div class="li-ico">' + it.emoji + '</div>' +
          '<div class="li-info"><b>' + it.nome + ' <span class="segpt">+' + it.seg + '</span></b>' +
            '<small>' + it.desc + '</small></div>' +
          '<div class="li-acao"><b class="preco">' + rs(it.preco) + '</b>' +
            (tem ? '<span class="badge-ok">✓ OK</span>' : '<button class="bt comprar">Adquirir</button>') +
          '</div></div>');
      if (!tem) $('.comprar', card).onclick = function () {
        if (!E.pode(it.preco)) { toast('Caixa insuficiente.', 'erro'); return; }
        E.debitar(it.preco); s.obra.segurancaItens.push(it.id); E.salvar();
        if (global.AUDIO) global.AUDIO.clique();
        toast(it.nome + ' ✓', 'ok'); renderHUD(); recarregarPainel();
      };
      c.appendChild(card);
    });
  }

  // ---- Projetos ----
  function pProjetos(c) {
    var n = nivelAtual(), s = E.get();
    c.innerHTML = '<p class="ajuda">Contrate os projetos técnicos. Cada etapa só pode ser executada se o ' +
      'projeto correspondente estiver aprovado. Os obrigatórios estão marcados.</p>';
    D.PROJETOS.forEach(function (p) {
      var tem = E.temProjeto(p.id);
      var obrig = n.projetosObrig.indexOf(p.id) >= 0;
      var card = el(
        '<div class="loja-item ' + (tem ? 'sel' : '') + '">' +
          '<div class="li-ico">' + p.emoji + '</div>' +
          '<div class="li-info"><b>' + p.nome + (obrig ? ' <span class="req">obrigatório</span>' : '') + '</b>' +
            '<small>' + p.desc + '</small></div>' +
          '<div class="li-acao"><b class="preco">' + rs(p.custo) + '</b>' +
            (tem ? '<span class="badge-ok">✓ Aprovado</span>' : '<button class="bt comprar">Contratar</button>') +
          '</div></div>');
      if (!tem) $('.comprar', card).onclick = function () {
        if (!E.pode(p.custo)) { toast('Caixa insuficiente.', 'erro'); return; }
        E.debitar(p.custo); s.obra.projetos.push(p.id); E.salvar();
        toast(p.nome + ' aprovado! 📐', 'ok'); recarregarPainel();
      };
      c.appendChild(card);
    });
  }

  // ---- Obra (executar etapas) ----
  function pObra(c) {
    var n = nivelAtual(), s = E.get();
    c.innerHTML = '<p class="ajuda">Execute as etapas na ordem. O jogo verifica equipe, ferramentas, ' +
      'materiais e projetos. A cada etapa você recebe uma <b>medição</b>.<br>🧱 Na <b>alvenaria</b> ' +
      'entra o modo <b>Mão na Massa</b>. 🌧️ Chuva, cura do concreto e imprevistos podem atrasar a obra!</p>';
    // aviso de cura em andamento
    if (s.obra.curaAte > s.obra.dia) {
      var falta = s.obra.curaAte - s.obra.dia;
      var av = el('<div class="cura-aviso">⏳ Concreto curando — faltam <b>' + falta + ' dias</b>.' +
        '<button class="bt azul" id="bt-cura">⏩ Aguardar cura</button></div>');
      c.appendChild(av);
      $('#bt-cura', av).onclick = function () {
        s.obra.dia = s.obra.curaAte; E.salvar(); renderHUD();
        toast('Concreto curado! Cronograma avançou.', 'ok'); recarregarPainel();
      };
    }
    n.etapas.forEach(function (eid) {
      var et = D.etapa(eid);
      var feita = E.etapaFeita(eid);
      var chk = checarEtapa(et);
      var estado = feita ? 'feita' : (chk.ok ? 'pronta' : 'bloq');
      var dias = diasEtapa(et);
      var custo = custoEtapa(et);
      var faltasHtml = chk.faltas.length ?
        '<div class="faltas">' + chk.faltas.map(function (f) { return '<span>⛔ ' + f + '</span>'; }).join('') + '</div>' : '';
      var card = el(
        '<div class="etapa-item ' + estado + '">' +
          '<div class="et-ico">' + (feita ? '✅' : et.emoji) + '</div>' +
          '<div class="et-info"><b>' + et.nome + '</b><small>' + et.desc + '</small>' +
            '<div class="et-meta">📅 ' + dias + ' dias • 💰 ' + rs(custo) + ' • 💵 medição ' + rs(medicaoLiquida(et)) + '</div>' +
            faltasHtml +
          '</div>' +
          '<div class="et-acao">' +
            (feita ? '<span class="badge-ok">Concluída</span>' :
              '<button class="bt executar ' + (chk.ok ? 'verde' : 'off') + '">' +
                (chk.ok ? (et.estagio === 'alvenaria1' || et.estagio === 'alvenaria2' ? '🧱 Mão na massa' : '▶ Executar') : 'Bloqueada') + '</button>') +
          '</div></div>');
      if (!feita && chk.ok) {
        $('.executar', card).onclick = function () { executarEtapa(et); };
      }
      c.appendChild(card);
    });
  }

  // ---------- regras de execução ------------------------------
  function checarEtapa(et) {
    var s = E.get(), faltas = [], esc = escala();
    var n = nivelAtual();
    et.dependeDe.forEach(function (dep) {
      // só exige dependências que fazem parte deste nível
      if (n && n.etapas.indexOf(dep) < 0) return;
      if (!E.etapaFeita(dep)) faltas.push('Conclua antes: ' + D.etapa(dep).nome);
    });
    (et.canteiroReq || []).forEach(function (cid) {
      if (!E.temCanteiro(cid)) faltas.push('Canteiro: ' + D.canteiro(cid).nome);
    });
    et.projetos.forEach(function (pid) {
      if (!E.temProjeto(pid)) faltas.push('Projeto: ' + D.projeto(pid).nome);
    });
    et.funcoes.forEach(function (fid) {
      if (E.qtdEquipe(fid) < 1) faltas.push('Equipe: ' + D.funcao(fid).nome);
    });
    et.ferramentas.forEach(function (tid) {
      if (!E.temFerramenta(tid)) faltas.push('Ferramenta: ' + D.ferramenta(tid).nome);
    });
    Object.keys(et.insumos).forEach(function (iid) {
      var prec = Math.ceil(et.insumos[iid] * esc);
      if (E.estoque(iid) < prec) {
        var m = D.insumo(iid);
        faltas.push('Material: ' + m.nome + ' (' + E.estoque(iid) + '/' + prec + ' ' + m.un + ')');
      }
    });
    // cura do concreto: bloqueia a etapa seguinte a uma concretagem
    var dependeConcreto = et.dependeDe.some(function (dep) {
      return D.CONCRETO.indexOf(dep) >= 0 && E.etapaFeita(dep) && (n && n.etapas.indexOf(dep) >= 0);
    });
    if (dependeConcreto && s.obra.dia < s.obra.curaAte) {
      faltas.push('Cura do concreto: aguarde ' + (s.obra.curaAte - s.obra.dia) + ' dias');
    }
    if (!E.get().obra.loteId) faltas.push('Compre o lote primeiro');
    return { ok: faltas.length === 0, faltas: faltas };
  }

  function totalBaseDias(n) { var t = 0; n.etapas.forEach(function (id) { t += D.etapa(id).dias; }); return t; }
  function medicaoBruta(et) { var n = nivelAtual(); return Math.round(n.orcamento * (et.dias / totalBaseDias(n))); }
  function medicaoLiquida(et) { return Math.round(medicaoBruta(et) * (1 - D.IMPOSTO)); }
  function curaDias() { return Math.round(D.CURA_BASE * Math.min(2, escala())); }

  // produtividade: mais profissionais das funções da etapa e um mestre
  // reduzem os dias necessários (limite de 2,2x mais rápido).
  function diasEtapa(et) {
    var esc = escala(), sumQ = 0;
    et.funcoes.forEach(function (id) { sumQ += Math.max(1, E.qtdEquipe(id)); });
    var avg = et.funcoes.length ? sumQ / et.funcoes.length : 1;
    var speed = 1 + 0.12 * Math.max(0, avg - 1);
    if (E.qtdEquipe('mestre') > 0) speed += 0.2;
    speed = Math.min(2.2, speed);
    return Math.max(1, Math.round(et.dias * esc / speed));
  }

  // mão de obra: paga apenas as funções (trades) usadas na etapa,
  // pela quantidade contratada, durante os dias da etapa.
  function laborEtapa(et, dias) {
    var t = 0;
    et.funcoes.forEach(function (id) {
      var f = D.funcao(id); if (f) t += f.diaria * Math.max(1, E.qtdEquipe(id));
    });
    return t * dias;
  }

  function custoEtapa(et) {
    var dias = diasEtapa(et);
    var aluguel = 0;
    et.ferramentas.forEach(function (tid) {
      if (E.get().obra.ferramentasAlugadas.indexOf(tid) >= 0) {
        var f = D.ferramenta(tid); aluguel += (f.precoAluguel || 0) * dias;
      }
    });
    return laborEtapa(et, dias) + aluguel;
  }

  // ---------- simulação: clima, acidentes e imprevistos -------
  function simularEtapa(et) {
    var s = E.get(), n = nivelAtual(), esc = escala();
    var oc = [], extraDias = 0, custoExtra = 0, dinheiroExtra = 0, chuva = false;
    var dias = diasEtapa(et);

    // clima / chuva (só a céu aberto)
    if (D.OUTDOOR.indexOf(et.id) >= 0) {
      var pch = D.CLIMAS[n.clima].chuva;
      if (Math.random() < pch) {
        chuva = true;
        var atraso = Math.max(1, Math.ceil(dias * 0.4));
        extraDias += atraso;
        oc.push({ emoji: '🌧️', titulo: 'Choveu na obra', texto: 'A chuva parou o serviço por ' + atraso + ' dias.' });
      }
    }
    // acidente (mitigado pela segurança)
    var seg = E.nivelSeguranca();
    var risco = 0.14 * (1 - seg / 100) * (D.OUTDOOR.indexOf(et.id) >= 0 ? 1 : 0.6);
    if (Math.random() < risco) {
      var cA = Math.round(6000 * esc), dA = 2;
      extraDias += dA; custoExtra += cA;
      oc.push({ emoji: '🚑', titulo: 'Acidente de trabalho', texto: 'Faltou segurança! Afastamento e custos: ' + rs(cA) + ' e +' + dA + ' dias. Invista em EPI/NR-18.' });
    }
    // evento aleatório (~33%)
    if (Math.random() < 0.33) {
      var pool = D.EVENTOS.filter(function (ev) {
        if (ev.so && ev.so.indexOf(et.id) < 0) return false;
        if (ev.evitaCom && E.qtdEquipe(ev.evitaCom) > 0) return false;
        return Math.random() < ev.chance;
      });
      if (pool.length) {
        var ev = pool[Math.floor(Math.random() * pool.length)];
        var texto = ev.desc;
        if (ev.fiscal) {
          if (seg < 55) { custoExtra += Math.round(10000 * esc); extraDias += 2; texto = 'Fiscal reprovou o canteiro (segurança baixa): multa de ' + rs(Math.round(10000 * esc)) + ' e +2 dias.'; }
          else { texto = 'Canteiro aprovado na vistoria! Nenhuma penalidade.'; }
        } else {
          if (ev.dias) extraDias += Math.round(ev.dias * (ev.dias < 0 ? esc * 0.6 : esc * 0.5));
          if (ev.custo) custoExtra += Math.round(ev.custo * esc);
          if (ev.dinheiro) dinheiroExtra += Math.round(ev.dinheiro * esc);
        }
        oc.push({ emoji: ev.emoji, titulo: ev.nome, texto: texto });
      }
    }
    return { ocorrencias: oc, extraDias: extraDias, custoExtra: custoExtra, dinheiroExtra: dinheiroExtra, chuva: chuva };
  }

  // confirma a etapa: consome materiais, debita custos, recebe medição, avança dias
  function commitEtapa(et, sim) {
    var s = E.get(), n = nivelAtual(), esc = escala();
    sim = sim || { extraDias: 0, custoExtra: 0, dinheiroExtra: 0, chuva: false };
    Object.keys(et.insumos).forEach(function (iid) {
      var q = Math.ceil(et.insumos[iid] * esc);
      s.obra.insumos[iid] = Math.max(0, (s.obra.insumos[iid] || 0) - q);
    });
    var dias = diasEtapa(et) + (sim.extraDias || 0);
    E.debitar(custoEtapa(et) + (sim.custoExtra || 0));
    if (sim.dinheiroExtra) E.creditar(sim.dinheiroExtra);
    s.obra.dia += dias;
    s.obra.etapasConcluidas.push(et.id);
    s.obra.tempoChuva = !!sim.chuva;
    // cura do concreto
    if (D.CONCRETO.indexOf(et.id) >= 0) s.obra.curaAte = s.obra.dia + curaDias();
    // medição (recebimento por etapa, já com imposto retido)
    var bruta = medicaoBruta(et), liquida = medicaoLiquida(et);
    E.creditar(liquida);
    s.obra.recebido += liquida;
    s.obra.imposto += (bruta - liquida);
    E.salvar();
    if (global.AUDIO) global.AUDIO.dinheiro();
    return dias;
  }

  function posEtapa(et, dias, ocorrencias) {
    atualizarCena();
    renderHUD();
    function seguir() {
      if (et.id === ultimaEtapa().id) { finalizarObra(); }
      else { toast(et.nome + ' concluída! (+' + dias + ' dias)', 'ok'); abrirPainel('obra'); }
    }
    if (ocorrencias && ocorrencias.length) modalImprevistos(ocorrencias, seguir);
    else seguir();
  }

  function executarEtapa(et) {
    if (global.AUDIO) global.AUDIO.ativar();
    var chk = checarEtapa(et);
    if (!chk.ok) { if (global.AUDIO) global.AUDIO.erro(); toast('Etapa bloqueada — verifique os itens em falta.', 'erro'); return; }
    var sim = simularEtapa(et);
    var custo = custoEtapa(et) + sim.custoExtra;
    if (!E.pode(custo)) {
      if (global.AUDIO) global.AUDIO.erro();
      toast('Caixa insuficiente para esta etapa (' + rs(custo) + ').', 'erro'); return;
    }
    // alvenaria -> modo mão na massa (assentar tijolos)
    if (cena && cena.ok && (et.estagio === 'alvenaria1' || et.estagio === 'alvenaria2')) {
      iniciarMaoNaMassa(et, sim);
      return;
    }
    var dias = commitEtapa(et, sim);
    fecharPainel();
    animarEtapa(et, dias, sim.chuva, function () { posEtapa(et, dias, sim.ocorrencias); });
  }

  // ---------- modo mão na massa -------------------------------
  function iniciarMaoNaMassa(et, sim) {
    fecharPainel();
    var cfg = cfgCena(et.estagio);
    atualizarCena(et.estagio);                 // mostra contexto (pilares, 1ª fiada, andaime)
    if (cena && sim && sim.chuva) cena.setChuva(true);
    var totalFiadas = cena.calcularFiadas(cfg);
    var de, ate;
    if (et.estagio === 'alvenaria1') { de = 0; ate = 1; }   // só a 1ª fiada
    else { de = 1; ate = totalFiadas; }                      // elevação
    cena.iniciarTijolos(cfg, de, ate);
    abrirSessaoTijolo(et, sim);
  }

  // modal de imprevistos ocorridos numa etapa
  function modalImprevistos(oc, done) {
    var ov = $('#overlay-anim');
    ov.classList.remove('oculto');
    var itens = oc.map(function (o) {
      return '<div class="oc-item"><span class="oc-ic">' + o.emoji + '</span>' +
        '<div><b>' + o.titulo + '</b><small>' + o.texto + '</small></div></div>';
    }).join('');
    ov.innerHTML = '<div class="result-card"><div class="result-cong">📋 Diário de obra</div>' +
      '<div class="oc-lista">' + itens + '</div>' +
      '<button class="bt grande verde" id="oc-ok">Entendi</button></div>';
    if (global.AUDIO) global.AUDIO.alerta();
    $('#oc-ok').onclick = function () { ov.classList.add('oculto'); ov.innerHTML = ''; done(); };
  }

  function abrirSessaoTijolo(et, sim) {
    var tj = $('#tela-jogo');
    var sess = el(
      '<div id="sessao">' +
        '<div class="sess-top">' +
          '<div class="sess-info"><b>🧱 ' + et.nome + '</b>' +
            '<span id="sess-sub"></span>' +
            '<div class="sess-barra"><i id="sess-i"></i></div></div>' +
          '<button class="bt fechar" id="sess-x">✕</button>' +
        '</div>' +
        '<div class="sess-dica">👆 Toque na obra para assentar um bloco</div>' +
        '<div class="sess-bts">' +
          '<button class="bt" id="sess-1">🧱 +1 bloco</button>' +
          '<button class="bt azul" id="sess-fiada">➕ Fiada inteira</button>' +
          '<button class="bt cinza" id="sess-tudo">⏭️ Assentar tudo</button>' +
        '</div>' +
      '</div>');
    tj.appendChild(sess);

    function atualiza(st) {
      st = st || cena.estadoTijolos();
      $('#sess-sub').textContent = ' — Fiada ' + st.fiadaAtual + '/' + st.fiadasTotal +
        ' • ' + st.placed + '/' + st.total + ' blocos';
      $('#sess-i').style.width = (st.total ? (st.placed / st.total * 100) : 100) + '%';
      if (st.completo) concluir();
    }
    var ult = { placed: 0 };
    function somTijolo(st) {
      if (global.AUDIO && st.placed > ult.placed) { global.AUDIO.tijolo(); }
      ult.placed = st.placed;
    }
    function umBloco() {
      if (global.AUDIO) global.AUDIO.ativar();
      var st = cena.assentarBloco(); somTijolo(st); atualiza(st);
    }
    cena.onTap = umBloco;
    $('#sess-1').onclick = umBloco;
    $('#sess-fiada').onclick = function () { var st = cena.assentarFiada(); somTijolo(st); atualiza(st); };
    $('#sess-tudo').onclick = function () { var st = cena.assentarTudo(); somTijolo(st); atualiza(st); };
    $('#sess-x').onclick = function () {        // cancela sem concluir
      cena.onTap = null; sess.remove(); atualizarCena(); abrirPainel('obra');
    };
    var concluido = false;
    function concluir() {
      if (concluido) return; concluido = true;
      cena.onTap = null;
      setTimeout(function () {
        sess.remove();
        var dias = commitEtapa(et, sim);
        toast('Parede levantada! 🧱 ' + et.nome + ' concluída (+' + dias + ' dias)', 'ok');
        posEtapa(et, dias, sim ? sim.ocorrencias : null);
      }, 500);
    }
    atualiza();
  }

  function ultimaEtapa() {
    var n = nivelAtual();
    return D.etapa(n.etapas[n.etapas.length - 1]);
  }

  function animarEtapa(et, dias, chuva, done) {
    atualizarCena(et.estagio);
    if (cena && chuva) { cena.setChuva(true); if (global.AUDIO && !global.AUDIO.mudo()) global.AUDIO.chuva(true); }
    var ov = $('#overlay-anim');
    ov.classList.remove('oculto');
    ov.innerHTML = '<div class="anim-card"><div class="anim-ico">' + (chuva ? '🌧️' : et.emoji) + '</div>' +
      '<b>Executando: ' + et.nome + '</b>' +
      '<div class="anim-barra"><i></i></div>' +
      '<small>+' + dias + ' dias no cronograma' + (chuva ? ' (com chuva)' : '') + '</small></div>';
    setTimeout(function () { $('.anim-barra i', ov).style.width = '100%'; }, 30);
    setTimeout(function () {
      ov.classList.add('oculto'); ov.innerHTML = '';
      if (global.AUDIO) global.AUDIO.chuva(false);
      done();
    }, 1500);
  }

  // ---------- finalização e pontuação -------------------------
  function finalizarObra() {
    var s = E.get(), n = nivelAtual();
    var faltamProjetos = n.projetosObrig.filter(function (p) { return !E.temProjeto(p); });
    // quita financiamento (com juros)
    var quitacao = 0;
    if (s.obra.emprestimo) {
      quitacao = s.obra.emprestimo + s.obra.emprestimoJuros;
      E.debitar(quitacao);
      s.obra.emprestimo = 0; s.obra.emprestimoJuros = 0; E.salvar();
    }
    s.obra.tempoChuva = false; E.salvar();
    if (cena) cena.setChuva(false);
    if (global.AUDIO) { global.AUDIO.chuva(false); global.AUDIO.betoneira(false); }

    var noPrazo = s.obra.dia <= n.prazo;
    var seg = E.nivelSeguranca();
    var estrelas = 1;
    if (noPrazo) estrelas++;
    if (s.caixa > 0 && faltamProjetos.length === 0 && noPrazo && seg >= 50) estrelas++;
    estrelas = Math.max(1, Math.min(3, estrelas));

    s.estrelas[n.id] = Math.max(s.estrelas[n.id] || 0, estrelas);
    if (estrelas >= 1) s.nivelMax = Math.max(s.nivelMax, Math.min(D.NIVEIS.length, n.id + 1));
    E.salvar();
    if (global.AUDIO) global.AUDIO.sucesso();

    telaResultado(n, estrelas, noPrazo, faltamProjetos, seg, quitacao);
  }

  function telaResultado(n, estrelas, noPrazo, faltamProjetos, seg, quitacao) {
    var s = E.get();
    var ov = $('#overlay-anim');
    ov.classList.remove('oculto');
    var estrelasHtml = '★★★'.split('').map(function (_, i) {
      return '<span class="' + (i < estrelas ? 'on' : '') + '">★</span>';
    }).join('');
    var proximo = D.nivel(n.id + 1);
    ov.innerHTML =
      '<div class="result-card">' +
        '<div class="result-cong">🎉 Obra entregue!</div>' +
        '<h2>' + n.icone + ' ' + n.nome + '</h2>' +
        '<div class="result-estrelas">' + estrelasHtml + '</div>' +
        '<div class="result-linhas">' +
          '<div><span>Prazo</span><b class="' + (noPrazo ? 'pos' : 'neg') + '">' + s.obra.dia + ' / ' + n.prazo + ' dias ' + (noPrazo ? '✓' : '⚠ atrasada') + '</b></div>' +
          '<div><span>Recebido em medições</span><b class="pos">' + rs(s.obra.recebido) + '</b></div>' +
          '<div><span>Impostos pagos</span><b class="neg">' + rs(s.obra.imposto) + '</b></div>' +
          (quitacao ? '<div><span>Financiamento quitado</span><b class="neg">' + rs(quitacao) + '</b></div>' : '') +
          '<div><span>Segurança final</span><b class="' + (seg >= 50 ? 'pos' : 'neg') + '">' + seg + '%</b></div>' +
          '<div><span>Caixa da construtora</span><b class="' + (s.caixa < 0 ? 'neg' : 'pos') + '">' + rs(s.caixa) + '</b></div>' +
          (faltamProjetos.length ? '<div><span>Projetos faltando</span><b class="neg">' + faltamProjetos.length + '</b></div>' : '') +
        '</div>' +
        '<div class="result-bts">' +
          (proximo && proximo.id <= s.nivelMax ? '<button class="bt grande verde" id="r-prox">▶ Próxima fase: ' + proximo.nome + '</button>' : '') +
          '<button class="bt grande azul" id="r-niveis">🏆 Selecionar fase</button>' +
          '<button class="bt grande cinza" id="r-menu">🏠 Menu</button>' +
        '</div>' +
      '</div>';
    if ($('#r-prox')) $('#r-prox').onclick = function () { ov.classList.add('oculto'); iniciarNivel(proximo.id); };
    $('#r-niveis').onclick = function () { ov.classList.add('oculto'); ov.innerHTML = ''; telaNiveis(); };
    $('#r-menu').onclick = function () { ov.classList.add('oculto'); ov.innerHTML = ''; telaMenu(); };
  }

  // ---------- troca de telas ----------------------------------
  function trocarTela(id) {
    document.querySelectorAll('.tela').forEach(function (t) { t.classList.add('oculto'); });
    $('#' + id).classList.remove('oculto');
  }

  // ---------- boot --------------------------------------------
  function boot() {
    E.carregar();
    if (global.AUDIO) global.AUDIO.carregarPref();
    montarBase();
    telaMenu();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.JOGO = { boot: boot };
})(window);
