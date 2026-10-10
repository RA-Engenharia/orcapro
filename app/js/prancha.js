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
  /* a coluna da direita: 205 mm no A1 (a do calculista), proporcional nos outros.
     modelo = o MODELO DE CARIMBO da prancha ('RA' tem a geometria própria, abaixo) */
  function geometria(formato, orientacao, modelo) {
    if (modelo === 'RA') return geometriaRA(formato, orientacao);
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

  /* =====================================================================
   * MODELO DE CARIMBO "RA" (09/10/2026)
   *
   * O gabarito é o carimbo da RA dos desenhos do CYPE e do motor de prancha
   * da RA (Padrao RA - CYPE/carimbo_ra.py → carimbo_RA_180x115.dxf, campos
   * preenchidos pelo pos_dwg_ra.py): 180 × 115 mm, origem no canto inferior
   * esquerdo, sete faixas — de baixo para cima: DATA | ESCALA | CÓDIGO DO
   * DESENHO | FOLHA · CONTEÚDO DA PRANCHA · OBRA / PROPRIETÁRIO / LOCAL ·
   * RESPONSÁVEL TÉCNICO | CONTRATANTE / PROPRIETÁRIO (assinaturas) · logo +
   * dados da empresa · aviso de propriedade · revisões (REV, DESCRIÇÃO, DATA,
   * EXEC, VER, APROV). As medidas abaixo são as do gabarito, em mm, y para
   * CIMA como no DXF; quem desenha converte.
   *
   * ⚠ O MODELO É SÓ O DESENHO. Nome, CNPJ, endereço, contato, responsável e
   *   registro vêm do cadastro da conta (⚙ Empresa) ou da própria prancha —
   *   nunca daqui. Na conta de um cliente, o mesmo carimbo sai com os dados e
   *   o logo DELE (test-prancha-carimbo-ra.js reprova dado de empresa no código).
   * ⚠ O carimbo não muda com o Padrão de detalhamento (v2 TQS: "só o carimbo
   *   nosso não precisa mexer").
   * Fator por formato: 180 × 115 cabe do A0 ao A2; no A3 e no A4 o carimbo
   * inteiro encolhe (texto e linhas juntos, a pena não) para a área de
   * desenho não ficar menor que a coluna.
   * Margens do Padrão RA (prancha.margens_mm): 20 mm à esquerda, 10 nas outras.
   * ===================================================================== */
  var CARIMBO_RA = { w: 180, h: 115, fator: { A0: 1, A1: 1, A2: 1, A3: 0.75, A4: 0.6 }, margens: { esquerda: 20, demais: 10 } };
  var MODELOS_CARIMBO = [{ id: 'RA', nome: 'RA (padrão do escritório)' }, { id: 'simples', nome: 'Simples' }];
  function r2(v) { return Math.round(v * 100) / 100; }
  function modeloCarimbo(pr) { return pr && pr.carimbo && pr.carimbo.modelo === 'RA' ? 'RA' : 'simples'; }
  function geometriaRA(formato, orientacao) {
    var f = FORMATOS[formato] ? formato : 'A1', p = papel(f, orientacao), me = CARIMBO_RA.margens.esquerda, m = CARIMBO_RA.margens.demais;
    var k = CARIMBO_RA.fator[f], W = r2(CARIMBO_RA.w * k), H = r2(CARIMBO_RA.h * k);
    var mold = { x: me, y: m, w: p.w - me - m, h: p.h - 2 * m }, car = { x: r2(p.w - m - W), y: r2(p.h - m - H), w: W, h: H, k: k };
    /* em pé não há coluna: o carimbo fica no pé, à direita, e a área de desenho é o que sobra acima dele */
    if (orientacao === 'retrato') return { papel: p, colW: W, modelo: 'RA', semColuna: true, moldura: mold, carimbo: car,
      area: { x: me + 3, y: m + 3, w: mold.w - 6, h: r2(mold.h - H - 6) }, coluna: { x: car.x, y: car.y, w: W, h: H } };
    return { papel: p, colW: W, modelo: 'RA', moldura: mold, carimbo: car,
      area: { x: me + 3, y: m + 3, w: r2(mold.w - W - 6), h: mold.h - 6 }, coluna: { x: car.x, y: m, w: W, h: mold.h } };
  }
  /* a geometria da prancha (com o modelo de carimbo dela) */
  function geometriaDe(pr) { pr = pr || {}; return geometria(pr.formato, pr.orientacao, modeloCarimbo(pr)); }

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
               blocos: arr(f.blocos).map(bloco).filter(function (b) { return !!b; }), imagemInteira: txt(f.imagemInteira),
               auto: txt(f.auto) };   /* auto = a chave do "Gerar pranchas" (gerarJogo): gerar de novo atualiza esta folha */
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
                 logos: arr(c.logos).map(txt).filter(function (k) { return !!k; }).slice(0, 3),
                 /* o MODELO de carimbo ('RA' ou 'simples', o de antes) e os dados da empresa PRÓPRIOS da prancha
                    (vazios = os do cadastro da conta, lidos na hora de desenhar) */
                 modelo: c.modelo === 'RA' ? 'RA' : 'simples', titulo: txt(c.titulo), cnpj: txt(c.cnpj), endereco: txt(c.endereco), contato: txt(c.contato) },
      coluna: arr(pr.coluna).map(function (s) { return { titulo: txt(s && s.titulo), itens: arr(s && s.itens).map(txt) }; }),
      folhas: folhas, pdf: pr.pdf && pr.pdf.chave ? { chave: txt(pr.pdf.chave), nome: txt(pr.pdf.nome) } : null
    };
  }

  /* o que está fora da área de desenho (bloco que invade o carimbo sai
     cortado na impressão sem ninguém perceber na tela) */
  function conferir(pr) {
    var p = normalizar(pr), g = geometriaDe(p), fora = [];
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
    var g = geometria(formato, orient, o.carimbo && o.carimbo.modelo === 'RA' ? 'RA' : 'simples'), vs = arr(o.vistas), porFolha = Math.max(1, num(o.porFolha, formato === 'A1' || formato === 'A0' ? 6 : (formato === 'A2' ? 4 : 2)));
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
    var c = (pr && pr.carimbo) || {}, g = geometriaDe(pr), ra = revisaoAtual(folha, projeto);
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

  /* -------------------------------------------- carimbo RA: os dados
   * Cada campo do gabarito → de onde vem. Prancha primeiro (a prancha que um
   * escritório assina continua com os dados dele quando aberta na conta da
   * construtora), depois o cadastro da conta (`empresa` = Empresa.dados():
   * nome, cnpj, titulo, responsavel, crea, endereco, cidade, email, telefone,
   * contato). Os campos da FOLHA são os parâmetros (mapaParametros): mudou o
   * parâmetro, mudou o carimbo. */
  function tituloCurto(t) {
    var s = txt(t).trim();
    return s.replace(/^engenheir[oa]\s+/i, 'Eng. ').replace(/^arquitet[oa]\s+e\s+urbanista$/i, 'Arq. e Urb.').replace(/^arquitet[oa]$/i, 'Arq.').replace(/^t[eé]cnic[oa]\s+em\s+/i, 'Téc. ');
  }
  /* "1234567" → "CREA nº 1234567" (CAU para arquiteto, CFT para técnico); já com a sigla, fica como veio */
  function fmtRegistro(v, titulo) {
    var s = txt(v).trim(); if (!s) return '';
    if (/^(crea|cau|cft|crt)\b/i.test(s)) return s;
    return (/arquitet/i.test(titulo) ? 'CAU' : (/t[eé]cnic/i.test(titulo) ? 'CFT' : 'CREA')) + ' nº ' + s;
  }
  function juntar(lista, sep) { return lista.map(function (x) { return txt(x).trim(); }).filter(function (x) { return !!x; }).join(sep); }
  function dadosCarimbo(pr, folha, projeto, empresa) {
    pr = pr || {}; folha = folha || {};
    var c = pr.carimbo || {}, E = empresa || {}, pm = mapaParametros(pr, folha, projeto);
    var titulo = c.titulo || E.titulo || '', resp = c.responsavel || E.responsavel || '', reg = c.registro || fmtRegistro(E.crea, titulo);
    var empresaNome = c.empresa || E.nome || '';
    var rt = resp ? juntar([tituloCurto(titulo), resp], ' ') + (reg ? ' — ' + reg : '') : reg;
    /* revisões: as do PROJETO marcadas na folha (as 3 últimas, a mais antiga em cima); a última é a ATUAL e
       leva EXEC/VER/APROV dos parâmetros da folha. Sem revisão: a linha "00 EMISSÃO INICIAL" do gabarito */
    var revP = revisoesNaFolha(folha, projeto), linhas;
    function atual(r) { return { rev: r.rev, desc: r.desc, data: r.data, exec: pm.SHEET_DRAWN_BY || r.exec || '', ver: pm.SHEET_CHECKED_BY || '', aprov: pm.SHEET_APPROVED_BY || '', atual: true }; }
    if (revP.length) linhas = revP.slice(-3).map(function (r) { return { rev: r.numero, desc: r.descricao, data: r.data, exec: r.emitidoPor, ver: '', aprov: '' }; });
    else if (arr(c.revisoes).length) linhas = arr(c.revisoes).slice(-3).map(function (r) { return { rev: txt(r[0]), desc: txt(r[1]), data: txt(r[2]), exec: '', ver: '', aprov: '' }; });
    else linhas = [{ rev: '00', desc: 'EMISSÃO INICIAL', data: pm.SHEET_ISSUE_DATE || '', exec: '', ver: '', aprov: '' }];
    linhas[linhas.length - 1] = atual(linhas[linhas.length - 1]);
    return {
      empresa: empresaNome, cnpj: c.cnpj || E.cnpj || '', titulo: titulo, responsavel: resp, registro: reg, rt: rt,
      endereco: c.endereco || juntar([E.endereco, E.cidade], ' — '),
      contato: c.contato || juntar([E.email, E.telefone], '   |   ') || txt(E.contato),
      aviso: 'AS INFORMAÇÕES DESTE DOCUMENTO SÃO PROPRIEDADE ' + (empresaNome ? 'DA ' + empresaNome.toUpperCase() : 'DO AUTOR DO PROJETO') +
             ' E DO CONTRATANTE; É PROIBIDA A UTILIZAÇÃO FORA DA FINALIDADE DESTA OBRA.',
      obra: c.obra, proprietario: c.proprietario, contratante: c.contratante || c.proprietario || '', local: c.local,
      conteudo: pm.SHEET_NAME, data: pm.SHEET_ISSUE_DATE, escala: pm.SHEET_SCALE, codigo: pm.SHEET_NUMBER,
      folha: dois(folha.n || 1) + '/' + dois(arr(pr.folhas).length || 1), revisoes: linhas
    };
  }

  /* -------------------------------------------- carimbo RA: o desenho
   * As primitivas do carimbo em mm DO PAPEL, relativas ao canto superior
   * esquerdo do carimbo (y para baixo), já no fator do formato. A tela/PDF
   * (js/pranchaui.js, SVG) e o DXF (js/bimdxf.js) desenham DAQUI — o mesmo
   * carimbo nos dois. Texto: `h` = altura da maiúscula (a altura do TEXT do
   * CAD); `al` E/C; y = linha de base; texto comprido encolhe para caber na
   * célula (`cabe`), nunca é cortado.
   * opts.logos = quantos logos há (0 = os dados da empresa ocupam a faixa). */
  var CAMADAS_CARIMBO_RA = {   /* as layers do gabarito: [cor ACI, pena em mm] */
    'RA-CARIMBO-MOLDURA': [7, 0.50], 'RA-CARIMBO-LINHA': [8, 0.18], 'RA-CARIMBO-TEXTO': [7, 0.18],
    'RA-CARIMBO-ROTULO': [8, 0.13], 'RA-CARIMBO-LOGO': [5, 0], 'RA-CARIMBO-DESTAQUE': [5, 0.35]
  };
  var ALT_MAIUSCULA = 0.716;   /* Arial: altura da maiúscula / corpo — texto do CAD (maiúscula) → corpo do SVG */
  var LOGO_RA = { x: 4, y: 65, w: 30.58, h: 25 };   /* a caixa do logo no gabarito (o logo vetorizado mede 30,58 × 25) */
  function largTexto(s, h) { return txt(s).length * 0.6 * h / ALT_MAIUSCULA; }
  function cabe(s, h, wmax) { var w = largTexto(s, h); return (wmax > 0 && w > wmax) ? Math.max(0.5, Math.floor(h * wmax / w * 100) / 100) : h; }
  function carimboRA(pr, folha, projeto, empresa, geo, opts) {
    opts = opts || {};
    var g = geo || geometriaDe(pr), car = g.carimbo, k = car.k || car.w / CARIMBO_RA.w, H0 = CARIMBO_RA.h, W0 = CARIMBO_RA.w;
    var d = dadosCarimbo(pr, folha, projeto, empresa), out = { x: car.x, y: car.y, w: car.w, h: car.h, k: k, retangulos: [], linhas: [], textos: [], logos: [], dados: d };
    function X(x) { return r2(x * k); }
    function Yt(y) { return r2((H0 - y) * k); }
    function ln(x1, y1, x2, y2, cam) { out.linhas.push({ x1: X(x1), y1: Yt(y1), x2: X(x2), y2: Yt(y2), camada: cam || 'RA-CARIMBO-LINHA' }); }
    function tx(s, x, y, h, o) {
      o = o || {}; s = txt(s);
      if (!s && !o.param) return;
      out.textos.push({ s: s, x: X(x), y: Yt(y), h: r2(cabe(s, h, o.wmax || 0) * k), al: o.al || 'E', camada: o.camada || 'RA-CARIMBO-TEXTO',
                        negrito: !!o.negrito, destaque: !!o.destaque, param: o.param || '', campo: o.campo || '' });
    }
    function rot(s, x, ytopo) { tx(s, x + 1, ytopo - 2.4, 1.6, { camada: 'RA-CARIMBO-ROTULO', campo: 'rotulo' }); }
    /* valor alinhado pelo MEIO (como o pos_dwg_ra.py escreve): linha de base = meio − h/2 */
    function val(s, x, ymeio, h, o) { o = o || {}; tx(s, x, ymeio - h / 2, h, o); }
    out.retangulos.push({ x: 0, y: 0, w: X(W0), h: X(H0), camada: 'RA-CARIMBO-MOLDURA' });
    /* faixa 1 (0–14): DATA | ESCALA | CÓDIGO DO DESENHO | FOLHA */
    [28, 56, 140].forEach(function (x) { ln(x, 0, x, 14); });
    ln(0, 14, W0, 14, 'RA-CARIMBO-MOLDURA');
    rot('DATA', 0, 14); rot('ESCALA', 28, 14); rot('CÓDIGO DO DESENHO', 56, 14); rot('FOLHA', 140, 14);
    val(d.data, 14, 5.5, 2.5, { al: 'C', wmax: 26, param: 'SHEET_ISSUE_DATE', campo: 'data' });
    val(d.escala, 42, 5.5, 2.5, { al: 'C', wmax: 26, param: 'SHEET_SCALE', campo: 'escala' });
    val(d.codigo, 98, 5.5, 2.5, { al: 'C', wmax: 80, param: 'SHEET_NUMBER', campo: 'codigo' });
    val(d.folha, 160, 5.0, 4.5, { al: 'C', wmax: 38, campo: 'folha' });
    /* faixa 2 (14–26): CONTEÚDO DA PRANCHA */
    ln(0, 26, W0, 26);
    rot('CONTEÚDO DA PRANCHA', 0, 26);
    val(d.conteudo, 90, 18.5, 3.0, { al: 'C', wmax: 174, param: 'SHEET_NAME', campo: 'conteudo' });
    /* faixa 3 (26–47): OBRA / PROPRIETÁRIO / LOCAL */
    ln(0, 33, W0, 33); ln(0, 40, W0, 40); ln(0, 47, W0, 47, 'RA-CARIMBO-MOLDURA');
    rot('LOCAL', 0, 33); rot('PROPRIETÁRIO', 0, 40); rot('OBRA', 0, 47);
    val(d.obra, 3, 42.2, 1.9, { wmax: 174, campo: 'obra' });
    val(d.proprietario, 3, 35.2, 1.9, { wmax: 174, campo: 'proprietario' });
    val(d.local, 3, 28.2, 1.9, { wmax: 174, campo: 'local' });
    /* faixa 4 (47–63): assinaturas — responsável técnico | contratante */
    ln(90, 47, 90, 63); ln(0, 63, W0, 63);
    rot('RESPONSÁVEL TÉCNICO', 0, 63); rot('CONTRATANTE / PROPRIETÁRIO', 90, 63);
    ln(8, 52.5, 82, 52.5, 'RA-CARIMBO-ROTULO'); ln(98, 52.5, 172, 52.5, 'RA-CARIMBO-ROTULO');
    tx(d.rt, 45, 49.2, 1.9, { al: 'C', wmax: 86, campo: 'rt' });
    val(d.contratante, 135, 49.2, 1.4, { al: 'C', wmax: 86, campo: 'contratante' });
    /* faixa 5 (63–92): logo(s) + dados da empresa */
    ln(0, 92, W0, 92);
    var nl = Math.max(0, Math.min(3, Math.round(num(opts.logos, 0)))), xi = 4;
    for (var i = 0; i < nl; i++) out.logos.push({ x: X(LOGO_RA.x + i * (LOGO_RA.w + 3)), y: Yt(LOGO_RA.y + LOGO_RA.h), w: X(LOGO_RA.w), h: X(LOGO_RA.h) });
    if (nl) { xi = LOGO_RA.x + nl * LOGO_RA.w + (nl - 1) * 3 + 5; ln(xi - 2.5, 66, xi - 2.5, 89, 'RA-CARIMBO-DESTAQUE'); }
    var wd = W0 - xi - 2;
    tx(d.empresa ? d.empresa.toUpperCase() : '', xi, 83.3, 4.0, { camada: 'RA-CARIMBO-DESTAQUE', negrito: true, destaque: true, wmax: wd, campo: 'empresa' });
    tx(d.cnpj ? 'CNPJ ' + d.cnpj : '', xi, 78.2, 2.2, { wmax: wd, campo: 'cnpj' });
    tx(d.endereco, xi, 74.6, 2.0, { wmax: wd, campo: 'endereco' });
    tx(d.contato, xi, 71.0, 2.0, { wmax: wd, campo: 'contato' });
    /* faixa 6 (92–96): aviso de propriedade */
    ln(0, 96, W0, 96);
    tx(d.aviso, 90, 93.4, 1.45, { al: 'C', camada: 'RA-CARIMBO-ROTULO', wmax: 176, campo: 'aviso' });
    /* faixa 7 (96–115): revisões — cabeçalho + 3 linhas */
    [100.5, 105.25, 110].forEach(function (y) { ln(0, y, W0, y); });
    var COLS = [[0, 'REV'], [10, 'DESCRIÇÃO'], [122, 'DATA'], [141, 'EXEC'], [154, 'VER'], [167, 'APROV']], lim = COLS.map(function (q) { return q[0]; }).concat([W0]);
    COLS.slice(1).forEach(function (q) { ln(q[0], 96, q[0], 115); });
    COLS.forEach(function (q, j) { tx(q[1], (q[0] + lim[j + 1]) / 2, 111.6, 1.8, { al: 'C', camada: 'RA-CARIMBO-ROTULO', negrito: true, campo: 'rotulo' }); });
    [106.6, 101.85, 97.1].forEach(function (y, j) {
      var r = d.revisoes[j]; if (!r) return;
      var p = r.atual ? function (bip) { return bip; } : function () { return ''; };
      tx(r.rev, 5, y, 1.9, { al: 'C', wmax: 9, campo: 'rev' });
      tx(r.desc, 12, y, 1.9, { wmax: 108, campo: 'rev-desc' });
      tx(r.data, 131.5, y, 1.9, { al: 'C', wmax: 17, campo: 'rev-data' });
      tx(r.exec, 147.5, y, 1.9, { al: 'C', wmax: 12, param: p('SHEET_DRAWN_BY'), campo: 'rev-exec' });
      tx(r.ver, 160.5, y, 1.9, { al: 'C', wmax: 12, param: p('SHEET_CHECKED_BY'), campo: 'rev-ver' });
      tx(r.aprov, 173.5, y, 1.9, { al: 'C', wmax: 12, param: p('SHEET_APPROVED_BY'), campo: 'rev-aprov' });
    });
    return out;
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
    var g = geometriaDe(pr), a = g.area;
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

  /* =====================================================================
   * GERAR PRANCHAS — o jogo do modelo num clique (motor)
   *
   * Uma folha por planta (de cada nível, por disciplina); os cortes e as
   * elevações de cada disciplina juntos, em quantas folhas precisar. Cada
   * vista na escala do Padrão RA (planta e corte 1:50) — ou na maior que
   * couber no formato —, centralizada na área de desenho (nunca sobre o
   * carimbo), com o título de vista; folhas numeradas em sequência
   * (código-nn) e com nome automático.
   *
   * IDEMPOTENTE: a folha gerada leva `auto` (a chave do grupo); gerar de novo
   * ATUALIZA as mesmas folhas (mesmo id, mesmos parâmetros — desenhado por,
   * revisões…), não duplica. Folha feita à mão não é tocada, e a vista que já
   * está numa folha feita à mão fica fora (uma vista entra numa folha só).
   *
   * o = { formato, orientacao, base (o registro "Folhas do projeto" ou null),
   *       modelo ('RA' força o modelo de carimbo), carimbo (o de um registro novo),
   *       vistas: [{ id, nome, tipo: 'planta'|'corte'|'elevacao', disciplina,
   *                  ordem (plantas: a ordem do nível), caixa: { w, h } (m),
   *                  escala (a do padrão), fixa (escala travada) }],
   *       outras: as outras pranchas da obra, folga (0–1: parte da área que a
   *       escala pode ocupar; a tela usa < 1 na 1ª passada) }
   * → { ok, prancha, escalas: { vistaId: N }, criadas, atualizadas, puladas: [{ id, nome, motivo }], conferir }
   * ===================================================================== */
  var ESCALAS_FOLHA = [20, 25, 50, 75, 100, 125, 200, 500];
  var ORDEM_DISC = ['arquitetura', 'estrutural', 'hidraulica', 'eletrica', 'mecanica', 'coordenacao'];
  var NOME_DISC = { arquitetura: '', estrutural: 'Estrutural', hidraulica: 'Hidráulica', eletrica: 'Elétrica', mecanica: 'Mecânica', coordenacao: 'Coordenação' };
  var ORDEM_TIPO = { planta: 0, corte: 1, elevacao: 2 };
  var ESPACO_VISTAS = 15;   /* Padrão RA: respiro mínimo de 15 mm entre desenhos */
  function idDe(chave, usados) {
    var h = 5381, s = String(chave);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    var id = 'g' + h.toString(36), n = 2;
    while (usados[id]) id = 'g' + h.toString(36) + '-' + (n++);
    usados[id] = 1;
    return id;
  }
  /* a menor escala (maior desenho) a partir da do padrão que cabe na área */
  function escolherEscala(caixa, base, fixa, area, folga) {
    var lista = fixa ? [base] : [base].concat(ESCALAS_FOLHA.filter(function (e) { return e > base; }));
    for (var i = 0; i < lista.length; i++) {
      var t = tamanhoViewport(caixa, lista[i], null);
      if (t.w <= area.w * folga + 1e-6 && t.h + TITULO_VISTA_H <= area.h * folga + 1e-6) return lista[i];
    }
    return 0;
  }
  /* prateleiras: itens [{ w, hT (com o título) }] → folhas [{ linhas: [{ itens, w, h }], h }] */
  function empacotar(itens, area) {
    var folhas = [], fl = { linhas: [], h: 0 }, ln = null;
    function gap() { return fl.linhas.length ? ESPACO_VISTAS : 0; }
    function fechaLinha() { if (ln && ln.itens.length) { fl.h += gap() + ln.h; fl.linhas.push(ln); } ln = null; }
    itens.forEach(function (it) {
      if (ln && (ln.w + ESPACO_VISTAS + it.w > area.w || fl.h + gap() + Math.max(ln.h, it.hT) > area.h)) fechaLinha();
      if (!ln) {
        if (fl.linhas.length && fl.h + ESPACO_VISTAS + it.hT > area.h) { folhas.push(fl); fl = { linhas: [], h: 0 }; }
        ln = { itens: [], w: 0, h: 0 };
      }
      ln.w += (ln.itens.length ? ESPACO_VISTAS : 0) + it.w; ln.h = Math.max(ln.h, it.hT); ln.itens.push(it);
    });
    fechaLinha();
    if (fl.linhas.length) folhas.push(fl);
    /* centraliza o conjunto na área (cada linha centrada na largura) */
    return folhas.map(function (f) {
      var pos = [], y = area.y + (area.h - f.h) / 2;
      f.linhas.forEach(function (l, i) {
        if (i) y += ESPACO_VISTAS;
        var x = area.x + (area.w - l.w) / 2;
        l.itens.forEach(function (it) { pos.push({ it: it, x: x, y: y }); x += it.w + ESPACO_VISTAS; });
        y += l.h;
      });
      return pos;
    });
  }
  function gerarJogo(o) {
    o = o || {};
    var formato = FORMATOS[o.formato] ? o.formato : 'A1', orient = o.orientacao === 'retrato' ? 'retrato' : 'paisagem';
    var folga = Math.max(0.3, Math.min(1, num(o.folga, 1)));
    var base = normalizar(o.base || { nome: 'Folhas do projeto', origem: 'folhas', carimbo: o.carimbo || { modelo: 'RA' }, folhas: [] });
    if (!o.base) base.origem = 'folhas';
    if (o.modelo === 'RA' || o.modelo === 'simples') base.carimbo.modelo = o.modelo;
    base.formato = formato; base.orientacao = orient;
    var g = geometriaDe(base), a = g.area, res = { ok: true, prancha: null, escalas: {}, criadas: 0, atualizadas: 0, puladas: [] };
    /* vistas que já estão numa folha feita à mão (desta prancha ou de outra) */
    var mao = {};
    arr(o.outras).forEach(function (p0) {
      var p = normalizar(p0); if (base.id && p.id === base.id) return;
      p.folhas.forEach(function (f) { f.blocos.forEach(function (b) { if (b.tipo === 'viewport') mao[b.vistaId] = numeroFolha(p, f); }); });
    });
    base.folhas.forEach(function (f) { if (!f.auto) f.blocos.forEach(function (b) { if (b.tipo === 'viewport') mao[b.vistaId] = numeroFolha(base, f); }); });
    function ordDisc(d) { var i = ORDEM_DISC.indexOf(d || 'arquitetura'); return i < 0 ? 99 : i; }
    var vs = arr(o.vistas).filter(function (v) { return v && ORDEM_TIPO[v.tipo] != null; }).slice().sort(function (x, y) {
      return (ordDisc(x.disciplina) - ordDisc(y.disciplina)) || (ORDEM_TIPO[x.tipo] - ORDEM_TIPO[y.tipo]) || (num(x.ordem, 0) - num(y.ordem, 0)) || natural(x.nome, y.nome);
    });
    var grupos = {}, ordemG = [];
    function grupo(chave, rotulo) { if (!grupos[chave]) { grupos[chave] = { chave: chave, rotulo: rotulo, itens: [] }; ordemG.push(chave); } return grupos[chave]; }
    vs.forEach(function (v) {
      var id = txt(v.id), nome = txt(v.nome) || id; if (!id) return;
      if (mao[id]) { res.puladas.push({ id: id, nome: nome, motivo: 'já está na folha ' + mao[id] + ' (uma vista entra numa folha só)' }); return; }
      var cx = v.caixa || {};
      if (!(+cx.w > 0 && +cx.h > 0)) { res.puladas.push({ id: id, nome: nome, motivo: 'sem desenho (abra o modelo da obra)' }); return; }
      var pad = Math.max(1, Math.round(num(v.escala, 50))), esc = escolherEscala({ w: +cx.w, h: +cx.h }, pad, !!v.fixa, a, folga);
      if (!esc) { res.puladas.push({ id: id, nome: nome, motivo: v.fixa ? 'em 1:' + pad + ' (escala travada pelo modelo de vista) não cabe no ' + formato : 'não cabe no ' + formato + ' nem em 1:' + ESCALAS_FOLHA[ESCALAS_FOLHA.length - 1] }); return; }
      res.escalas[id] = esc;
      var t = tamanhoViewport({ w: +cx.w, h: +cx.h }, esc, null), disc = ordDisc(v.disciplina) < 99 ? (v.disciplina || 'arquitetura') : 'arquitetura';
      var it = { v: v, id: id, nome: nome, esc: esc, w: t.w, h: t.h, hT: t.h + TITULO_VISTA_H };
      if (v.tipo === 'planta') grupo('v:' + id, nome).itens.push(it);
      else grupo('g:' + disc + ':' + v.tipo, (NOME_DISC[disc] ? NOME_DISC[disc] + ' — ' : '') + (v.tipo === 'elevacao' ? 'Elevações' : 'Cortes')).itens.push(it);
    });
    var porAuto = {}, usados = {};
    base.folhas.forEach(function (f) { usados[f.id] = 1; if (f.auto) porAuto[f.auto] = f; });
    var geradas = [], tocadas = {};
    ordemG.forEach(function (ch) {
      var gr = grupos[ch], partes = empacotar(gr.itens, a);
      partes.forEach(function (pos, i) {
        var chave = ch + (i ? ':' + (i + 1) : ''), ex = porAuto[chave];
        var f = ex ? JSON.parse(JSON.stringify(ex)) : { id: idDe(chave, usados), conteudo: gr.rotulo + (partes.length > 1 ? ' ' + (i + 1) + '/' + partes.length : ''), escala: 'indicada' };
        var antes = {}; arr(ex && ex.blocos).forEach(function (b) { if (b.tipo === 'viewport') antes[b.vistaId] = b; });
        f.auto = chave;
        f.blocos = pos.map(function (p, j) {
          var b0 = antes[p.it.id];
          return bloco({ tipo: 'viewport', vistaId: p.it.id, x: r2(p.x), y: r2(p.y), w: p.it.w, h: p.it.h, escala: p.it.esc,
                         numeroDetalhe: b0 && b0.numeroDetalhe ? b0.numeroDetalhe : String(j + 1), tituloVista: b0 && b0.tituloVista ? b0.tituloVista : p.it.nome,
                         mostrarTitulo: b0 ? b0.mostrarTitulo !== false : true });
        });
        if (ex) res.atualizadas++; else res.criadas++;
        tocadas[f.id] = 1; geradas.push(f);
      });
    });
    var todas = geradas.concat(base.folhas.filter(function (f) { return !tocadas[f.id]; }));
    todas.forEach(function (f, i) { f.n = i + 1; });
    base.folhas = todas;
    res.prancha = normalizar(base);
    res.conferir = conferir(res.prancha);
    return res;
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
    listaFolhas: listaFolhas, listaVistas: listaVistas, tabelaRevisoes: tabelaRevisoes, blocoDeLista: blocoDeLista,
    /* modelo de carimbo RA e o Gerar pranchas (09/10/2026) */
    CARIMBO_RA: CARIMBO_RA, MODELOS_CARIMBO: MODELOS_CARIMBO, CAMADAS_CARIMBO_RA: CAMADAS_CARIMBO_RA, ALT_MAIUSCULA: ALT_MAIUSCULA, ESCALAS_FOLHA: ESCALAS_FOLHA,
    modeloCarimbo: modeloCarimbo, geometriaDe: geometriaDe, dadosCarimbo: dadosCarimbo, carimboRA: carimboRA, tituloCurto: tituloCurto, fmtRegistro: fmtRegistro, cabe: cabe,
    escolherEscala: escolherEscala, empacotar: empacotar, gerarJogo: gerarJogo };
  global.Prancha = Prancha;
  if (typeof module !== 'undefined' && module.exports) module.exports = Prancha;
})(typeof window !== 'undefined' ? window : this);
