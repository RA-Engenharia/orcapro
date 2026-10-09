/* =====================================================================
 * prancha.js — PRANCHAS do projeto (motor puro, sem tela)
 *
 * Uma prancha é um conjunto de FOLHAS (A0…A4, em milímetros) com o carimbo
 * da empresa e blocos posicionados: vistas do modelo (pontos de vista, com
 * as cotas), imagens (o desenho de detalhe, a perspectiva), textos (notas,
 * especificações) e tabelas.
 *
 * O desenho da folha segue o padrão de prancha de projeto: margem de 25 mm
 * à esquerda (encadernação), 10 mm nas outras, uma COLUNA à direita com
 * especificações e o CARIMBO embaixo dela.
 *
 * ⚠ A vista entra por REFERÊNCIA ao ponto de vista (id), não como foto
 *   congelada: regravou a vista, a prancha sai com a vista nova. Quem
 *   fotografa a vista é a tela, na hora de imprimir.
 * ===================================================================== */
(function (global) {
  'use strict';
  var FORMATOS = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] };
  var MARG_E = 25, MARG = 10;

  function txt(v) { return v == null ? '' : String(v); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* tamanho do papel (paisagem por padrão; A4 retrato quando pedido) */
  function papel(formato, orientacao) {
    var f = FORMATOS[formato] || FORMATOS.A1;
    return orientacao === 'retrato' ? { w: f[1], h: f[0] } : { w: f[0], h: f[1] };
  }
  /* a coluna da direita: 205 mm no A1 (a do calculista), proporcional nos outros */
  function geometria(formato, orientacao) {
    var p = papel(formato, orientacao);
    var col = Math.round(Math.min(205, Math.max(70, p.w * 0.244)));
    var carH = Math.round(Math.min(150, Math.max(58, p.h * 0.25)));
    return {
      papel: p, colW: col,
      moldura: { x: MARG_E, y: MARG, w: p.w - MARG_E - MARG, h: p.h - 2 * MARG },
      area: { x: MARG_E + 3, y: MARG + 3, w: p.w - MARG_E - MARG - col - 6, h: p.h - 2 * MARG - 6 },
      coluna: { x: p.w - MARG - col, y: MARG, w: col, h: p.h - 2 * MARG },
      carimbo: { x: p.w - MARG - col, y: p.h - MARG - carH, w: col, h: carH }
    };
  }

  /* P8: 'viewport' = a vista 2D EM ESCALA (vetor do js/desenho2d.js) */
  var TIPOS_BLOCO = ['vista', 'imagem', 'texto', 'tabela', 'viewport'];
  function bloco(b) {
    b = b || {};
    var t = TIPOS_BLOCO.indexOf(b.tipo) >= 0 ? b.tipo : null;
    if (!t) return null;
    var o = { tipo: t, x: num(b.x, 0), y: num(b.y, 0), w: Math.max(5, num(b.w, 50)), h: Math.max(5, num(b.h, 40)),
              titulo: txt(b.titulo), subtitulo: txt(b.subtitulo) };
    if (t === 'viewport') return viewport(b, o);
    if (t === 'vista') { o.vistaId = txt(b.vistaId); o.origemVista = txt(b.origemVista); if (!o.vistaId && !o.origemVista) return null; }
    if (t === 'imagem') { o.chave = txt(b.chave); if (!o.chave) return null; }
    if (t === 'texto') o.linhas = arr(b.linhas).map(txt);
    if (t === 'tabela') { o.cabecalho = arr(b.cabecalho).map(txt); o.linhas = arr(b.linhas).map(function (l) { return arr(l).map(txt); }); }
    return o;
  }

  function normalizar(pr) {
    pr = pr || {};
    var formato = FORMATOS[pr.formato] ? pr.formato : 'A1';
    var orient = pr.orientacao === 'retrato' ? 'retrato' : 'paisagem';
    var c = pr.carimbo || {};
    var folhas = arr(pr.folhas).map(function (f, i) {
      f = f || {};
      var o = { id: txt(f.id) || ('f' + (i + 1)), n: num(f.n, i + 1), conteudo: txt(f.conteudo), escala: txt(f.escala) || 'indicada',
               blocos: arr(f.blocos).map(bloco).filter(function (b) { return !!b; }), imagemInteira: txt(f.imagemInteira) };
      paramsFolha(f, o);   /* P8: os parâmetros da folha */
      return o;
    });
    return {
      id: txt(pr.id), obraId: txt(pr.obraId), nome: txt(pr.nome) || 'Prancha', formato: formato, orientacao: orient,
      origem: txt(pr.origem), origemId: txt(pr.origemId), criadoEm: txt(pr.criadoEm),
      carimbo: { empresa: txt(c.empresa), responsavel: txt(c.responsavel), registro: txt(c.registro), contratante: txt(c.contratante),
                 obra: txt(c.obra), proprietario: txt(c.proprietario), projeto: txt(c.projeto), local: txt(c.local),
                 codigo: txt(c.codigo), data: txt(c.data), revisoes: arr(c.revisoes).map(function (r) { return arr(r).map(txt); }),
                 /* os LOGOS da prancha (chaves de imagem no IndexedDB): quem projeta e quem executa. Sem
                    eles vale o logo da conta — que na conta da construtora é o DELA, não o de quem assina */
                 logos: arr(c.logos).map(txt).filter(function (k) { return !!k; }).slice(0, 3) },
      coluna: arr(pr.coluna).map(function (s) { return { titulo: txt(s && s.titulo), itens: arr(s && s.itens).map(txt) }; }),
      folhas: folhas, pdf: pr.pdf && pr.pdf.chave ? { chave: txt(pr.pdf.chave), nome: txt(pr.pdf.nome) } : null
    };
  }

  /* o que está fora da área de desenho (bloco que invade o carimbo sai
     cortado na impressão sem ninguém perceber na tela) */
  function conferir(pr) {
    var p = normalizar(pr), g = geometria(p.formato, p.orientacao), fora = [];
    p.folhas.forEach(function (f) {
      f.blocos.forEach(function (b, i) {
        var a = g.area;
        if (b.x < a.x - 0.5 || b.y < a.y - 0.5 || b.x + b.w > a.x + a.w + 0.5 || b.y + b.h > a.y + a.h + 0.5) fora.push({ folha: f.n, bloco: i, titulo: b.titulo });
        /* P8: o título da vista (abaixo do quadro) também tem de caber */
        else if (b.tipo === 'viewport' && b.mostrarTitulo && b.y + b.h + TITULO_VISTA_H > a.y + a.h + 0.5) fora.push({ folha: f.n, bloco: i, titulo: b.tituloVista });
      });
    });
    return { ok: !fora.length, fora: fora };
  }

  /* grade automática para n vistas numa área: escolhe colunas × linhas que
     deixam as células mais perto de 16:10 (a proporção do visualizador) */
  function grade(n, area, opts) {
    opts = opts || {};
    var titH = num(opts.titulo, 12), gap = num(opts.espaco, 6), alvo = num(opts.proporcao, 1.6);
    var melhor = null;
    for (var c = 1; c <= n; c++) {
      var l = Math.ceil(n / c);
      var cw = (area.w - (c - 1) * gap) / c, ch = (area.h - (l - 1) * gap) / l - titH;
      if (cw <= 10 || ch <= 10) continue;
      var r = cw / ch, pena = Math.abs(Math.log(r / alvo)) + (c * l - n) * 0.05;
      if (!melhor || pena < melhor.pena) melhor = { c: c, l: l, cw: cw, ch: ch, pena: pena };
    }
    if (!melhor) return [];
    var out = [];
    for (var i = 0; i < n; i++) {
      var col = i % melhor.c, lin = Math.floor(i / melhor.c);
      out.push({ x: area.x + col * (melhor.cw + gap), y: area.y + lin * (melhor.ch + titH + gap), w: melhor.cw, h: melhor.ch, tituloY: area.y + lin * (melhor.ch + titH + gap) + melhor.ch + 2 });
    }
    return out;
  }

  /* prancha nova a partir de pontos de vista: até `porFolha` vistas por folha */
  function deVistas(o) {
    o = o || {};
    var formato = FORMATOS[o.formato] ? o.formato : 'A1', orient = o.orientacao === 'retrato' ? 'retrato' : 'paisagem';
    var g = geometria(formato, orient), vs = arr(o.vistas), porFolha = Math.max(1, num(o.porFolha, formato === 'A1' || formato === 'A0' ? 6 : (formato === 'A2' ? 4 : 2)));
    var folhas = [];
    for (var i = 0; i < vs.length; i += porFolha) {
      var parte = vs.slice(i, i + porFolha), celulas = grade(parte.length, g.area, { titulo: 12 });
      folhas.push({ n: folhas.length + 1, conteudo: txt(o.conteudo) || txt(o.nome), escala: 'sem escala', blocos: parte.map(function (v, k) {
        var cl = celulas[k];
        return { tipo: 'vista', vistaId: txt(v.id), origemVista: txt(v.origemId), x: cl.x, y: cl.y, w: cl.w, h: cl.h, titulo: txt(v.nome), subtitulo: txt(v.descricao) };
      }) });
    }
    return normalizar({ nome: o.nome, formato: formato, orientacao: orient, carimbo: o.carimbo, coluna: o.coluna, folhas: folhas, origem: 'vistas' });
  }

  /* =====================================================================
   * P8 — VISTA EM ESCALA, PARÂMETROS DA FOLHA, LISTAS E REVISÕES
   * (plano do BIM §3.6; nomes PT-BR dos parâmetros em convenção de mercado
   * — inventário de parâmetros, elementos.prancha)
   * ===================================================================== */

  /* penas de PAPEL (mm, NBR 8403) por jogo da vista: as mesmas no PDF e no DXF
     (js/bimdxf.js lê daqui; o teste confere a cópia dele) */
  var PENAS_PAPEL = {
    fina:   { corte: 0.35, vista: 0.13, cota: 0.13, marca: 0.18 },
    media:  { corte: 0.50, vista: 0.18, cota: 0.13, marca: 0.25 },
    grossa: { corte: 0.70, vista: 0.25, cota: 0.18, marca: 0.35 }
  };
  var TITULO_VISTA_H = 12;   /* mm abaixo do quadro: o título da vista (círculo, nome, escala) */

  /* o bloco viewport: { vistaId, x, y, w, h (mm), escala (1:N da vista), recorte
     (caixa em METROS do desenho, ou null = a vista inteira), numeroDetalhe,
     tituloVista, mostrarTitulo } */
  function viewport(b, o) {
    o.vistaId = txt(b.vistaId); if (!o.vistaId) return null;
    o.escala = Math.max(1, Math.round(num(b.escala, 50)));
    var r = b.recorte;
    o.recorte = (r && isFinite(+r.x0) && isFinite(+r.y0) && isFinite(+r.x1) && isFinite(+r.y1) && +r.x1 > +r.x0 && +r.y1 > +r.y0)
      ? { x0: +r.x0, y0: +r.y0, x1: +r.x1, y1: +r.y1 } : null;
    o.numeroDetalhe = txt(b.numeroDetalhe);
    o.tituloVista = txt(b.tituloVista);
    o.mostrarTitulo = b.mostrarTitulo !== false;
    o.titulo = ''; o.subtitulo = '';   /* o título do viewport é o "título de vista", não o rótulo dos outros blocos */
    return o;
  }

  /* parâmetros da folha (instância, grupo "Dados de identidade") */
  function paramsFolha(f, o) {
    o.numero = txt(f.numero);                     /* SHEET_NUMBER — vazio = código-nn do carimbo */
    o.desenhadoPor = txt(f.desenhadoPor);         /* SHEET_DRAWN_BY "Desenhadas por" */
    o.projetadoPor = txt(f.projetadoPor);         /* SHEET_DESIGNED_BY */
    o.verificadoPor = txt(f.verificadoPor);       /* SHEET_CHECKED_BY */
    o.aprovadoPor = txt(f.aprovadoPor);           /* SHEET_APPROVED_BY */
    o.dataEmissao = txt(f.dataEmissao);           /* SHEET_ISSUE_DATE — vazio = data do carimbo */
    o.apareceNaLista = f.apareceNaLista !== false;   /* SHEET_SCHEDULED */
    o.revisoes = arr(f.revisoes).map(txt).filter(function (x) { return !!x; });   /* SHEET_REVISIONS_ON_SHEET (ids) */
    var eg = f.eixoGuia;                          /* SHEET_GUIDE_GRID */
    o.eixoGuia = eg && num(eg.espaco, 0) >= 5 ? { espaco: Math.min(200, num(eg.espaco, 25)) } : null;
    return o;
  }

  /* -------------------------------------------- revisões do projeto
   * projeto.revisoes[] = { id, numero, data, descricao, emitidoPor, emitidoPara, emitida }
   * (o formato da P7 — anotação/nuvem de revisão liga pelo id). A ORDEM da
   * lista é a sequência do projeto (a "Revisão atual" é a última da folha). */
  function revisao(r, i) {
    r = r || {};
    return { id: txt(r.id) || ('rev' + (i + 1)), numero: txt(r.numero) || ('R' + ('0' + i).slice(-2)), data: txt(r.data), descricao: txt(r.descricao),
             emitidoPor: txt(r.emitidoPor), emitidoPara: txt(r.emitidoPara), emitida: !!r.emitida };
  }
  function revisoesProjeto(projeto) { return arr(projeto && projeto.revisoes).map(revisao); }
  function revisoesNaFolha(folha, projeto) {
    var ids = arr(folha && folha.revisoes).map(txt);
    return revisoesProjeto(projeto).filter(function (r) { return ids.indexOf(r.id) >= 0; });
  }
  function revisaoAtual(folha, projeto) { var l = revisoesNaFolha(folha, projeto); return l.length ? l[l.length - 1] : null; }

  /* -------------------------------------------- número, escala, nome */
  function dois(n) { return ('0' + n).slice(-2); }
  function numeroFolha(pr, folha) {
    if (folha && folha.numero) return folha.numero;
    var c = (pr && pr.carimbo) || {};
    return (c.codigo ? c.codigo + '-' : '') + dois(folha ? folha.n : 1);
  }
  /* Escala da folha (SHEET_SCALE): a da única escala dos viewports; várias = "Como indicada" */
  function escalaFolha(folha) {
    var esc = {}, n = 0;
    arr(folha && folha.blocos).forEach(function (b) { if (b && b.tipo === 'viewport') { if (!esc[b.escala]) n++; esc[b.escala] = 1; } });
    if (n === 1) return '1:' + Object.keys(esc)[0];
    if (n > 1) return 'Como indicada';
    return (folha && folha.escala) || 'indicada';
  }
  function limpaArq(s) { return String(s || '').replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }
  /* nome automático do arquivo: "<número> - <nome da folha> - <revisão>.pdf" */
  function nomeArquivo(pr, folha, projeto, ext) {
    var ra = revisaoAtual(folha, projeto), partes = [numeroFolha(pr, folha), folha.conteudo || pr.nome || 'Folha'];
    if (ra) partes.push(ra.numero);
    return limpaArq(partes.join(' - ')).slice(0, 150) + '.' + (ext || 'pdf');
  }
  function nomeArquivoLote(pr, folhas, ext) {
    var c = (pr && pr.carimbo) || {}, fs = arr(folhas);
    var faixa = fs.length > 1 ? 'folhas ' + dois(fs[0].n) + ' a ' + dois(fs[fs.length - 1].n) : 'folha ' + dois(fs.length ? fs[0].n : 1);
    return limpaArq([c.codigo || '', pr.nome || 'Pranchas', faixa].filter(function (x) { return !!x; }).join(' - ')) + '.' + (ext || 'pdf');
  }

  /* -------------------------------------------- parâmetros da folha
   * a lista de parâmetros, na ordem usual, com o código BuiltInParameter (ponte com o
   * inventário e o teste de paridade). `leitura` = calculado. O CARIMBO lê
   * daqui (rótulos ligados a parâmetros): mudou o parâmetro, mudou o carimbo. */
  function parametrosFolha(pr, folha, projeto) {
    var c = (pr && pr.carimbo) || {}, g = geometria(pr.formato, pr.orientacao), ra = revisaoAtual(folha, projeto);
    var revs = revisoesNaFolha(folha, projeto).map(function (r) { return r.numero; }).join(', ');
    return [
      { bip: 'SHEET_NAME', nome: 'Nome da folha', valor: folha.conteudo || pr.nome || '', campo: 'conteudo' },
      { bip: 'SHEET_NUMBER', nome: 'Número da folha', valor: numeroFolha(pr, folha), campo: 'numero' },
      { bip: 'SHEET_ISSUE_DATE', nome: 'Data de emissão da folha', valor: folha.dataEmissao || c.data || '', campo: 'dataEmissao' },
      { bip: 'SHEET_DESIGNED_BY', nome: 'Projetado por', valor: folha.projetadoPor || [c.responsavel, c.registro].filter(function (x) { return !!x; }).join(' - '), campo: 'projetadoPor' },
      { bip: 'SHEET_DRAWN_BY', nome: 'Desenhadas por', valor: folha.desenhadoPor, campo: 'desenhadoPor' },
      { bip: 'SHEET_CHECKED_BY', nome: 'Verificado por', valor: folha.verificadoPor, campo: 'verificadoPor' },
      { bip: 'SHEET_APPROVED_BY', nome: 'Aprovado por', valor: folha.aprovadoPor, campo: 'aprovadoPor' },
      { bip: 'SHEET_SCHEDULED', nome: 'Aparece na lista de folhas', valor: folha.apareceNaLista !== false, campo: 'apareceNaLista', simnao: true },
      { bip: 'SHEET_REVISIONS_ON_SHEET', nome: 'Revisões na folha', valor: revs, campo: 'revisoes' },
      { bip: 'SHEET_CURRENT_REVISION', nome: 'Revisão atual', valor: ra ? ra.numero : '', leitura: true },
      { bip: 'SHEET_CURRENT_REVISION_DATE', nome: 'Data da revisão atual', valor: ra ? ra.data : '', leitura: true },
      { bip: 'SHEET_CURRENT_REVISION_DESCRIPTION', nome: 'Descrição da revisão atual', valor: ra ? ra.descricao : '', leitura: true },
      { bip: 'SHEET_CURRENT_REVISION_ISSUED', nome: 'Revisão atual emitida', valor: ra ? ra.emitida : false, leitura: true, simnao: true },
      { bip: 'SHEET_CURRENT_REVISION_ISSUED_BY', nome: 'Revisão atual emitida por', valor: ra ? ra.emitidoPor : '', leitura: true },
      { bip: 'SHEET_CURRENT_REVISION_ISSUED_TO', nome: 'Revisão atual emitida para', valor: ra ? ra.emitidoPara : '', leitura: true },
      { bip: 'SHEET_SCALE', nome: 'Escala', valor: escalaFolha(folha), leitura: true },
      { bip: 'SHEET_WIDTH', nome: 'Largura da folha', valor: g.papel.w, leitura: true },
      { bip: 'SHEET_HEIGHT', nome: 'Altura da folha', valor: g.papel.h, leitura: true },
      { bip: 'SHEET_GUIDE_GRID', nome: 'Eixo guia', valor: folha.eixoGuia ? folha.eixoGuia.espaco + ' mm' : '<Nenhum>', campo: 'eixoGuia' }
    ];
  }
  function mapaParametros(pr, folha, projeto) {
    var m = {}; parametrosFolha(pr, folha, projeto).forEach(function (p) { m[p.bip] = p.valor; }); return m;
  }

  /* -------------------------------------------- viewport na folha */
  function proximoNumeroDetalhe(folha) {
    var usados = {}; arr(folha && folha.blocos).forEach(function (b) { if (b && b.tipo === 'viewport' && b.numeroDetalhe) usados[b.numeroDetalhe] = 1; });
    for (var i = 1; i < 1000; i++) if (!usados[String(i)]) return String(i);
    return '';
  }
  /* uma vista só pode estar numa folha (uma planta ou corte entra em uma folha só) */
  function vistaEmFolha(pranchas, vistaId) {
    var achou = null;
    arr(pranchas).forEach(function (pr) { arr(pr && pr.folhas).forEach(function (f) { arr(f && f.blocos).forEach(function (b) {
      if (!achou && b && b.tipo === 'viewport' && b.vistaId === vistaId) achou = { prancha: pr, folha: f, bloco: b };
    }); }); });
    return achou;
  }
  function ajustarEixo(v, espaco, origem) { if (!(espaco > 0)) return v; return origem + Math.round((v - origem) / espaco) * espaco; }
  /* linhas do eixo guia (só na tela, não imprime) dentro da área de desenho */
  function eixoGuiaLinhas(folha, geo) {
    if (!folha || !folha.eixoGuia) return { xs: [], ys: [] };
    var a = geo.area, e = folha.eixoGuia.espaco, xs = [], ys = [], v;
    for (v = a.x; v <= a.x + a.w + 1e-6; v += e) xs.push(Math.round(v * 100) / 100);
    for (v = a.y; v <= a.y + a.h + 1e-6; v += e) ys.push(Math.round(v * 100) / 100);
    return { xs: xs, ys: ys };
  }
  /* tamanho do quadro no papel: a caixa do desenho (m) × 1000 / escala */
  function tamanhoViewport(caixaM, escala, recorte) {
    var w = recorte ? recorte.x1 - recorte.x0 : caixaM.w, h = recorte ? recorte.y1 - recorte.y0 : caixaM.h;
    return { w: Math.max(5, w * 1000 / escala), h: Math.max(5, h * 1000 / escala) };
  }
  /* coloca a vista na folha. o = { vistaId, nome, escala, caixa:{w,h} (m), cx, cy (mm,
     o CENTRO onde soltou; sem eles, o centro da área) }. Devolve { ok, folha (nova),
     bloco, aviso } — a folha recebida não é alterada. */
  function colocarViewport(pr, folha, o, pranchas) {
    pr = normalizar(pr);
    var g = geometria(pr.formato, pr.orientacao), a = g.area;
    if (!o || !o.vistaId) return { ok: false, erro: 'Vista sem identificação.' };
    var ja = vistaEmFolha(pranchas || [pr], o.vistaId);
    if (ja) return { ok: false, erro: 'A vista "' + (o.nome || o.vistaId) + '" já está na folha ' + numeroFolha(ja.prancha, ja.folha) + ' (uma vista entra em uma folha só). Duplique a vista para usar em outra folha.' };
    var esc = Math.max(1, Math.round(num(o.escala, 50))), t = tamanhoViewport(o.caixa || { w: 1, h: 1 }, esc, null);
    var cx = isFinite(+o.cx) ? +o.cx : a.x + a.w / 2, cy = isFinite(+o.cy) ? +o.cy : a.y + (a.h - TITULO_VISTA_H) / 2;
    var x = cx - t.w / 2, y = cy - t.h / 2;
    if (folha.eixoGuia) { x = ajustarEixo(x, folha.eixoGuia.espaco, a.x); y = ajustarEixo(y, folha.eixoGuia.espaco, a.y); }
    var aviso = '';
    if (t.w > a.w || t.h + TITULO_VISTA_H > a.h) aviso = 'A vista em 1:' + esc + ' (' + Math.round(t.w) + ' × ' + Math.round(t.h) + ' mm) não cabe na área de desenho desta folha. Troque a escala da vista ou use uma folha maior.';
    x = Math.max(a.x, Math.min(x, a.x + a.w - t.w)); y = Math.max(a.y, Math.min(y, a.y + a.h - t.h - TITULO_VISTA_H));
    var b = bloco({ tipo: 'viewport', vistaId: o.vistaId, x: x, y: y, w: t.w, h: t.h, escala: esc, numeroDetalhe: proximoNumeroDetalhe(folha), tituloVista: o.nome || '' });
    var nova = JSON.parse(JSON.stringify(folha)); nova.blocos = arr(nova.blocos).concat([b]);
    return { ok: true, folha: nova, bloco: b, aviso: aviso };
  }

  /* -------------------------------------------- listas (tabelas) */
  function natural(a, b) { return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }); }
  /* Lista de folhas (tabela da categoria Folhas): só as que "Aparecem na lista" */
  function listaFolhas(pranchas, projeto) {
    var linhas = [];
    arr(pranchas).forEach(function (p0) {
      var pr = normalizar(p0);
      pr.folhas.forEach(function (f) {
        if (f.apareceNaLista === false) return;
        var m = mapaParametros(pr, f, projeto);
        linhas.push([m.SHEET_NUMBER, m.SHEET_NAME, m.SHEET_CURRENT_REVISION, m.SHEET_ISSUE_DATE, m.SHEET_DRAWN_BY]);
      });
    });
    linhas.sort(function (a, b) { return natural(a[0], b[0]); });
    return { titulo: 'LISTA DE FOLHAS', cabecalho: ['Número da folha', 'Nome da folha', 'Revisão atual', 'Data de emissão da folha', 'Desenhadas por'], linhas: linhas };
  }
  /* Lista de vistas: vistas = [{ id, nome, tipo, escala }] */
  function listaVistas(vistas, pranchas) {
    var linhas = arr(vistas).map(function (v) {
      var em = vistaEmFolha(arr(pranchas).map(normalizar), v.id);
      return [txt(v.nome), txt(v.tipo), v.escala ? '1:' + v.escala : '', em ? numeroFolha(em.prancha, em.folha) : '', em ? (em.folha.conteudo || em.prancha.nome) : '', em ? em.bloco.numeroDetalhe : ''];
    });
    linhas.sort(function (a, b) { return natural(a[0], b[0]); });
    return { titulo: 'LISTA DE VISTAS', cabecalho: ['Nome da vista', 'Tipo', 'Escala', 'Número da folha', 'Nome da folha', 'Número de detalhe'], linhas: linhas };
  }
  /* Revisões/emissões do projeto, com as folhas onde cada uma aparece */
  function tabelaRevisoes(projeto, pranchas) {
    var revs = revisoesProjeto(projeto);
    var linhas = revs.map(function (r) {
      var fs = [];
      arr(pranchas).forEach(function (p0) { var pr = normalizar(p0); pr.folhas.forEach(function (f) { if (f.revisoes.indexOf(r.id) >= 0) fs.push(numeroFolha(pr, f)); }); });
      return [r.numero, r.data, r.descricao, r.emitidoPor, r.emitida ? 'Sim' : 'Não', fs.sort(natural).join(', ')];
    });
    return { titulo: 'REVISÕES DO PROJETO', cabecalho: ['Número', 'Data', 'Descrição', 'Emitido por', 'Emitida', 'Folhas'], linhas: linhas };
  }
  /* uma lista vira bloco 'tabela' da folha (5 mm por linha) */
  function blocoDeLista(tab, x, y, w) {
    return bloco({ tipo: 'tabela', x: x, y: y, w: w || 180, h: Math.max(10, (tab.linhas.length + 1) * 5), titulo: tab.titulo, cabecalho: tab.cabecalho, linhas: tab.linhas });
  }

  var Prancha = { FORMATOS: FORMATOS, papel: papel, geometria: geometria, normalizar: normalizar, bloco: bloco, conferir: conferir, grade: grade, deVistas: deVistas,
    /* P8 */
    PENAS_PAPEL: PENAS_PAPEL, TITULO_VISTA_H: TITULO_VISTA_H, revisao: revisao, revisoesProjeto: revisoesProjeto, revisoesNaFolha: revisoesNaFolha,
    revisaoAtual: revisaoAtual, numeroFolha: numeroFolha, escalaFolha: escalaFolha, nomeArquivo: nomeArquivo, nomeArquivoLote: nomeArquivoLote,
    parametrosFolha: parametrosFolha, mapaParametros: mapaParametros, proximoNumeroDetalhe: proximoNumeroDetalhe, vistaEmFolha: vistaEmFolha,
    ajustarEixo: ajustarEixo, eixoGuiaLinhas: eixoGuiaLinhas, tamanhoViewport: tamanhoViewport, colocarViewport: colocarViewport,
    listaFolhas: listaFolhas, listaVistas: listaVistas, tabelaRevisoes: tabelaRevisoes, blocoDeLista: blocoDeLista };
  global.Prancha = Prancha;
  if (typeof module !== 'undefined' && module.exports) module.exports = Prancha;
})(typeof window !== 'undefined' ? window : this);
