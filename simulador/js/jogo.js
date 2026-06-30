/* ============================================================
   OrçaPRO — Simulador de Obras 3D : CONTROLADOR
   Telas, módulos (lote, canteiro, equipe, ferramentas, insumos,
   projetos), execução das etapas, avaliação e progressão.
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
        '<div class="menu-logo">🏗️ OrçaPRO <span>Simulador de Obras</span></div>' +
        '<p class="menu-sub">Simulador de gestão de obras. Compre o lote, monte o canteiro, ' +
        'contrate a equipe, contrate equipamentos e entregue a obra dentro do prazo e do orçamento.</p>' +
        '<div class="menu-stats">💰 Caixa da construtora: <b>' + rs(s.caixa) + '</b></div>' +
        '<div class="menu-botoes">' +
          (temSave ? '<button class="bt grande verde" id="bt-continuar">▶ Continuar obra</button>' : '') +
          '<button class="bt grande azul" id="bt-niveis">📂 Selecionar cenário</button>' +
          '<button class="bt grande cinza" id="bt-reset">🗑️ Reiniciar simulação</button>' +
        '</div>' +
        '<div class="menu-rodape">Otimizado para tablet • toque e arraste para girar a obra em 3D</div>' +
      '</div>';
    if (temSave) $('#bt-continuar').onclick = function () { abrirJogo(); };
    $('#bt-niveis').onclick = telaNiveis;
    $('#bt-reset').onclick = function () {
      if (confirm('Reiniciar toda a simulação e o caixa da construtora?')) { E.resetar(); telaMenu(); }
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
          '<div class="nv-tipo">' + n.tipo.toUpperCase() + ' • Cenário ' + n.id + '</div>' +
          '<div class="nv-nome">' + n.nome + '</div>' +
          '<div class="nv-desc">' + n.desc + '</div>' +
          '<div class="nv-meta">📅 Prazo: <b>' + n.prazo + ' dias</b> &nbsp; 💵 Venda: <b>' + rs(n.orcamento) + '</b></div>' +
          '<div class="nv-estrelas">' + estrelasHtml + '</div>' +
        '</div></div>';
    }).join('');
    $('#tela-niveis').innerHTML =
      '<div class="topbar"><button class="bt voltar" id="nv-voltar">‹ Menu</button>' +
        '<div class="topbar-tit">Selecione o cenário de obra</div>' +
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
    $('#hud').innerHTML =
      '<button class="bt mini" id="hud-menu">‹</button>' +
      '<div class="hud-bloco"><span class="hl">' + n.icone + ' ' + n.nome + '</span></div>' +
      '<div class="hud-bloco"><small>Caixa</small><b class="' + (s.caixa < 0 ? 'neg' : '') + '">' + rs(s.caixa) + '</b></div>' +
      '<div class="hud-bloco"><small>Prazo</small><b class="' + (atraso ? 'neg' : '') + '">' + s.obra.dia + ' / ' + n.prazo + ' dias</b></div>' +
      '<div class="hud-bloco hud-prog"><small>Obra</small>' +
        '<div class="barra"><i style="width:' + prog + '%"></i></div><b>' + prog + '%</b></div>';
    $('#hud-menu').onclick = telaMenu;
  }

  function renderDock() {
    var itens = [
      ['briefing', '📋', 'Resumo'],
      ['lote', '📍', 'Lote'],
      ['canteiro', '🚧', 'Canteiro'],
      ['equipe', '👷', 'Equipe'],
      ['ferramentas', '🛠️', 'Ferramentas'],
      ['insumos', '🧱', 'Materiais'],
      ['projetos', '📐', 'Projetos'],
      ['obra', '🏗️', 'Executar']
    ];
    $('#dock').innerHTML = itens.map(function (i) {
      return '<button class="dock-bt" data-p="' + i[0] + '"><span class="di">' + i[1] + '</span>' +
        '<span class="dl">' + i[2] + '</span></button>';
    }).join('');
    document.querySelectorAll('.dock-bt').forEach(function (b) {
      b.onclick = function () { abrirPainel(b.dataset.p); };
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
    cena.construir(estagiosConcluidos(), cfgCena(emObra));
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
      insumos: '🧱 Comprar materiais', projetos: '📐 Projetos técnicos', obra: '🏗️ Executar etapas'
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
      ferramentas: pFerramentas, insumos: pInsumos, projetos: pProjetos, obra: pObra
    })[p](corpo);
  }
  function fecharPainel() { $('#painel').classList.add('oculto'); painelAtual = null; }
  function recarregarPainel() { if (painelAtual) abrirPainel(painelAtual); renderHUD(); }

  // ---- Briefing ----
  function pBriefing(c) {
    var n = nivelAtual(), s = E.get();
    var projs = n.projetosObrig.map(function (id) {
      var p = D.projeto(id);
      return '<span class="tag ' + (E.temProjeto(id) ? 'ok' : '') + '">' + p.emoji + ' ' + p.nome + '</span>';
    }).join('');
    c.innerHTML =
      '<div class="info-box">' + n.icone + ' <b>' + n.nome + '</b><br><small>' + n.desc + '</small></div>' +
      '<div class="grade2">' +
        '<div class="kpi"><small>Tipo</small><b>' + n.tipo + '</b></div>' +
        '<div class="kpi"><small>Pavimentos</small><b>' + n.pavimentos + '</b></div>' +
        '<div class="kpi"><small>Prazo</small><b>' + n.prazo + ' dias</b></div>' +
        '<div class="kpi"><small>Valor de venda</small><b>' + rs(n.orcamento) + '</b></div>' +
        '<div class="kpi"><small>Lote exigido</small><b>' + n.loteMin + '–' + n.loteMax + ' m²</b></div>' +
        '<div class="kpi"><small>Dia atual</small><b>' + s.obra.dia + '</b></div>' +
      '</div>' +
      '<h4>Projetos obrigatórios para a entrega</h4><div class="tags">' + projs + '</div>' +
      '<div class="dica">💡 Sequência recomendada: <b>Lote → Projetos → Canteiro → Equipe → Ferramentas → Materiais → Executar etapas</b>. ' +
      'Você só recebe o valor de venda ao concluir a etapa final (Entrega).</div>';
  }

  // ---- Lote ----
  function pLote(c) {
    var n = nivelAtual(), s = E.get();
    c.innerHTML = '<p class="ajuda">Compre um lote compatível com o cenário (entre ' + n.loteMin +
      ' e ' + n.loteMax + ' m²). O custo do terreno sai do caixa.</p>';
    D.LOTES.forEach(function (l) {
      var compativel = l.area >= n.loteMin && l.area <= n.loteMax;
      var atual = s.obra.loteId === l.id;
      var card = el(
        '<div class="loja-item ' + (atual ? 'sel' : '') + (compativel ? '' : ' incompat') + '">' +
          '<div class="li-ico">📐</div>' +
          '<div class="li-info"><b>' + l.nome + '</b>' +
            '<small>' + l.frente + 'm × ' + l.fundo + 'm = ' + l.area + ' m² • ' + l.desc + '</small>' +
            (compativel ? '' : '<small class="warn">Não compatível com este cenário</small>') +
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
    c.innerHTML = '<p class="ajuda">Execute as etapas na ordem. O simulador verifica equipe, ferramentas, ' +
      'materiais e projetos. Cada etapa consome dias do cronograma.<br>🧱 Nas etapas de ' +
      '<b>alvenaria</b> você entra no modo de <b>execução assistida</b> e assenta os blocos fiada por fiada.</p>';
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
            '<div class="et-meta">📅 ' + dias + ' dias • 💰 ' + rs(custo) + '</div>' +
            faltasHtml +
          '</div>' +
          '<div class="et-acao">' +
            (feita ? '<span class="badge-ok">Concluída</span>' :
              '<button class="bt executar ' + (chk.ok ? 'verde' : 'off') + '">' +
                (chk.ok ? (et.estagio === 'alvenaria1' || et.estagio === 'alvenaria2' ? '🧱 Executar alvenaria' : '▶ Executar') : 'Bloqueada') + '</button>') +
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
    if (!E.get().obra.loteId) faltas.push('Compre o lote primeiro');
    return { ok: faltas.length === 0, faltas: faltas };
  }

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

  // confirma a etapa: consome materiais, debita custo, avança dias e marca concluída
  function commitEtapa(et) {
    var s = E.get(), esc = escala();
    Object.keys(et.insumos).forEach(function (iid) {
      var q = Math.ceil(et.insumos[iid] * esc);
      s.obra.insumos[iid] = Math.max(0, (s.obra.insumos[iid] || 0) - q);
    });
    var dias = diasEtapa(et);
    E.debitar(custoEtapa(et));
    s.obra.dia += dias;
    s.obra.etapasConcluidas.push(et.id);
    E.salvar();
    return dias;
  }

  function posEtapa(et, dias) {
    atualizarCena();
    renderHUD();
    if (et.id === ultimaEtapa().id) { finalizarObra(); }
    else { toast(et.nome + ' concluída! (+' + dias + ' dias)', 'ok'); abrirPainel('obra'); }
  }

  function executarEtapa(et) {
    var chk = checarEtapa(et);
    if (!chk.ok) { toast('Etapa bloqueada — verifique os itens em falta.', 'erro'); return; }
    var custo = custoEtapa(et);
    if (!E.pode(custo)) {
      toast('Caixa insuficiente para a mão de obra/aluguel desta etapa (' + rs(custo) + ').', 'erro'); return;
    }
    // alvenaria -> modo mão na massa (assentar tijolos)
    if (cena && cena.ok && (et.estagio === 'alvenaria1' || et.estagio === 'alvenaria2')) {
      iniciarMaoNaMassa(et);
      return;
    }
    var dias = commitEtapa(et);
    fecharPainel();
    animarEtapa(et, dias, function () { posEtapa(et, dias); });
  }

  // ---------- modo mão na massa -------------------------------
  function iniciarMaoNaMassa(et) {
    fecharPainel();
    var cfg = cfgCena(et.estagio);
    atualizarCena(et.estagio);                 // mostra contexto (pilares, 1ª fiada, andaime)
    var totalFiadas = cena.calcularFiadas(cfg);
    var de, ate;
    if (et.estagio === 'alvenaria1') { de = 0; ate = 1; }   // só a 1ª fiada
    else { de = 1; ate = totalFiadas; }                      // elevação
    cena.iniciarTijolos(cfg, de, ate);
    abrirSessaoTijolo(et);
  }

  function abrirSessaoTijolo(et) {
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
    function umBloco() { atualiza(cena.assentarBloco()); }
    cena.onTap = umBloco;
    $('#sess-1').onclick = umBloco;
    $('#sess-fiada').onclick = function () { atualiza(cena.assentarFiada()); };
    $('#sess-tudo').onclick = function () { atualiza(cena.assentarTudo()); };
    $('#sess-x').onclick = function () {        // cancela sem concluir
      cena.onTap = null; sess.remove(); atualizarCena(); abrirPainel('obra');
    };
    var concluido = false;
    function concluir() {
      if (concluido) return; concluido = true;
      cena.onTap = null;
      setTimeout(function () {
        sess.remove();
        var dias = commitEtapa(et);
        toast('🧱 Alvenaria assentada — ' + et.nome + ' concluída (+' + dias + ' dias)', 'ok');
        posEtapa(et, dias);
      }, 500);
    }
    atualiza();
  }

  function ultimaEtapa() {
    var n = nivelAtual();
    return D.etapa(n.etapas[n.etapas.length - 1]);
  }

  function animarEtapa(et, dias, done) {
    atualizarCena(et.estagio);
    var ov = $('#overlay-anim');
    ov.classList.remove('oculto');
    ov.innerHTML = '<div class="anim-card"><div class="anim-ico">' + et.emoji + '</div>' +
      '<b>Executando: ' + et.nome + '</b>' +
      '<div class="anim-barra"><i></i></div>' +
      '<small>+' + dias + ' dias no cronograma</small></div>';
    setTimeout(function () { $('.anim-barra i', ov).style.width = '100%'; }, 30);
    setTimeout(function () { ov.classList.add('oculto'); ov.innerHTML = ''; done(); }, 1500);
  }

  // ---------- finalização e pontuação -------------------------
  function finalizarObra() {
    var s = E.get(), n = nivelAtual();
    // projetos obrigatórios faltando?
    var faltamProjetos = n.projetosObrig.filter(function (p) { return !E.temProjeto(p); });
    // venda
    E.creditar(n.orcamento);
    var noPrazo = s.obra.dia <= n.prazo;
    // lucro estimado: comparar caixa não é trivial; usamos venda - referência
    var lucro = n.orcamento; // valor recebido nesta entrega
    var estrelas = 1;
    if (noPrazo) estrelas++;
    if (s.caixa > 0 && faltamProjetos.length === 0 && noPrazo) estrelas++;
    estrelas = Math.max(1, Math.min(3, estrelas));

    s.estrelas[n.id] = Math.max(s.estrelas[n.id] || 0, estrelas);
    if (estrelas >= 1) s.nivelMax = Math.max(s.nivelMax, Math.min(D.NIVEIS.length, n.id + 1));
    E.salvar();

    telaResultado(n, estrelas, noPrazo, faltamProjetos);
  }

  function telaResultado(n, estrelas, noPrazo, faltamProjetos) {
    var s = E.get();
    var ov = $('#overlay-anim');
    ov.classList.remove('oculto');
    var estrelasHtml = '★★★'.split('').map(function (_, i) {
      return '<span class="' + (i < estrelas ? 'on' : '') + '">★</span>';
    }).join('');
    var proximo = D.nivel(n.id + 1);
    ov.innerHTML =
      '<div class="result-card">' +
        '<div class="result-cong">✅ Obra concluída</div>' +
        '<h2>' + n.icone + ' ' + n.nome + '</h2>' +
        '<div class="result-estrelas">' + estrelasHtml + '</div>' +
        '<div class="result-linhas">' +
          '<div><span>Prazo</span><b class="' + (noPrazo ? 'pos' : 'neg') + '">' + s.obra.dia + ' / ' + n.prazo + ' dias ' + (noPrazo ? '✓' : '⚠ atrasada') + '</b></div>' +
          '<div><span>Valor recebido</span><b class="pos">' + rs(n.orcamento) + '</b></div>' +
          '<div><span>Caixa da construtora</span><b class="' + (s.caixa < 0 ? 'neg' : 'pos') + '">' + rs(s.caixa) + '</b></div>' +
          (faltamProjetos.length ? '<div><span>Projetos faltando</span><b class="neg">' + faltamProjetos.length + '</b></div>' : '') +
        '</div>' +
        '<div class="result-bts">' +
          (proximo && proximo.id <= s.nivelMax ? '<button class="bt grande verde" id="r-prox">▶ Próximo cenário: ' + proximo.nome + '</button>' : '') +
          '<button class="bt grande azul" id="r-niveis">📂 Selecionar cenário</button>' +
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
    montarBase();
    telaMenu();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.JOGO = { boot: boot };
})(window);
