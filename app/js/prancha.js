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

  var TIPOS_BLOCO = ['vista', 'imagem', 'texto', 'tabela'];
  function bloco(b) {
    b = b || {};
    var t = TIPOS_BLOCO.indexOf(b.tipo) >= 0 ? b.tipo : null;
    if (!t) return null;
    var o = { tipo: t, x: num(b.x, 0), y: num(b.y, 0), w: Math.max(5, num(b.w, 50)), h: Math.max(5, num(b.h, 40)),
              titulo: txt(b.titulo), subtitulo: txt(b.subtitulo) };
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
      return { id: txt(f.id) || ('f' + (i + 1)), n: num(f.n, i + 1), conteudo: txt(f.conteudo), escala: txt(f.escala) || 'indicada',
               blocos: arr(f.blocos).map(bloco).filter(function (b) { return !!b; }), imagemInteira: txt(f.imagemInteira) };
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

  var Prancha = { FORMATOS: FORMATOS, papel: papel, geometria: geometria, normalizar: normalizar, bloco: bloco, conferir: conferir, grade: grade, deVistas: deVistas };
  global.Prancha = Prancha;
  if (typeof module !== 'undefined' && module.exports) module.exports = Prancha;
})(typeof window !== 'undefined' ? window : this);
