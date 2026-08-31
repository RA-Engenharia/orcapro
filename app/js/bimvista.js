/* =====================================================================
 * bimvista.js — PONTOS DE VISTA, MARCAÇÃO E COMENTÁRIO (o B4; D10)
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Numa reunião de compatibilização, alguém acha o problema, todo mundo olha, e
 * a reunião acaba. Sem ponto de vista salvo, nada do que se achou sobrevive: na
 * semana seguinte é preciso reencontrar a mesma peça, no mesmo ângulo, para
 * explicar de novo. É a moeda da coordenação, e o produto não tinha.
 *
 * Um ponto de vista guarda ONDE a câmera estava, O QUE estava visível, o que
 * foi RABISCADO por cima e o que foi DITO — e é isso que vira o tópico BCF que
 * volta para quem projeta.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ A MARCAÇÃO É 2D SOBRE A VISTA, e isso é escolha, não limitação
 *
 * Coordenadas normalizadas 0..1 do canvas, como no Navisworks. Um risco 3D
 * ficaria correto no espaço e ilegível na imagem: gira a câmera um grau e a
 * seta que apontava para a viga aponta para o céu. A imagem que vai para o
 * relatório é 2D, e o rabisco tem de continuar em cima do que ele aponta.
 * (A anotação 3D pontual do editor serve a outro propósito e continua lá.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ O QUE ESTÁ VISÍVEL É GUARDADO POR CHAVE (B0), NÃO POR `uid`
 *
 * Um ponto de vista tem de valer daqui a três meses, depois de o projetista
 * mandar duas versões do modelo. `uid` é a ordem de abertura da sessão: a vista
 * abriria escondendo peças aleatórias. A chave do B0 sobrevive, e a peça que
 * não existir mais volta como "não localizada" em vez de sumir calada.
 *
 * ⚠ POR QUE PURO
 * `js/bim.js` só APLICA a vista; quem decide o que ela É mora aqui, com teste.
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(s) { return String(s == null ? "" : s); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  function v3(a, padrao) {
    if (Array.isArray(a) && a.length === 3) return [num(a[0]), num(a[1]), num(a[2])];
    return padrao ? padrao.slice() : [0, 0, 0];
  }
  function clamp01(x) { var n = +x; if (!isFinite(n)) return 0; return n < 0 ? 0 : (n > 1 ? 1 : n); }

  /* =====================================================================
   * ⚠ A CONVERSÃO DE EIXO — a linha de que depende o critério do bloco
   *
   * A cena do viewer é Y-up; o IFC (e portanto o BCF) é Z-up. Se a câmera for
   * exportada sem converter, o projetista abre o arquivo no Revit e a câmera
   * está em outro lugar — sem erro nenhum na tela, que é justamente o que o
   * "pronto quando" do B4 proíbe.
   *
   * MEDIDO, não suposto: no `bim/samples/exemplo.ifc` o IFC declara os
   * pavimentos em Z = 0 e Z = 3.139,99 mm; na cena, os membros do segundo
   * pavimento começam em Y = 3,0428 m (a diferença é a espessura da laje). E
   * `GetCoordinationMatrix` do web-ifc devolve a IDENTIDADE — ou seja, a troca
   * de eixo está na geração da geometria, não numa matriz que dê para ler.
   * Logo: cena.Y corresponde a IFC.Z.
   *
   * A convenção completa é a do web-ifc/IFC.js: cena = (X, Z, −Y).
   *
   * ⚠ E O SINAL DO TERCEIRO EIXO NÃO PÔDE SER MEDIDO AQUI — exigiria abrir o
   * arquivo exportado noutra ferramenta, que é exatamente a validação que a
   * especificação manda registrar como PENDENTE. Está isolado nestas duas
   * funções, com teste de ida e volta, para que corrigir seja trocar uma linha
   * e não caçar sinal espalhado pelo arquivo.
   * ===================================================================== */
  function cenaParaIfc(p) {
    var a = v3(p);
    return [a[0], -a[2], a[1]];
  }
  function ifcParaCena(p) {
    var a = v3(p);
    return [a[0], a[2], -a[1]];
  }

  function normalizado(a) {
    var v = v3(a), d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (d < 1e-12) return [0, 0, -1];
    return [v[0] / d, v[1] / d, v[2] / d];
  }

  var TIPOS_MARCA = ["linha", "seta", "nuvem", "texto", "retangulo"];
  var STATUS = ["aberto", "resolvido", "fechado"];

  /* ---------------------------------------------------------------
   * camera — o que a vista guarda, e o que o BCF consegue levar
   *
   * ⚠ O BCF NÃO TEM ONDE GUARDAR O ALVO DA ÓRBITA. Ele leva posição, direção,
   * cima e ângulo — e nada mais. O nosso registro guarda o `alvo` porque o
   * viewer orbita em torno dele; ao importar de fora, o alvo é reconstruído a
   * uma distância declarada na direção da câmera. Posição e direção saem
   * exatas (é o que "mesma câmera" quer dizer); só o pivô da órbita é
   * aproximado, e isso está dito aqui em vez de ficar parecendo perda.
   * ------------------------------------------------------------- */
  var DIST_ALVO_PADRAO = 10;

  function camera(d) {
    d = d || {};
    var pos = v3(d.pos);
    var alvo = Array.isArray(d.alvo) && d.alvo.length === 3 ? v3(d.alvo) : null;
    var dir = Array.isArray(d.dir) && d.dir.length === 3 ? normalizado(d.dir) : null;
    if (!alvo && dir) {
      var dist = num(d.dist) || DIST_ALVO_PADRAO;
      alvo = [pos[0] + dir[0] * dist, pos[1] + dir[1] * dist, pos[2] + dir[2] * dist];
    }
    if (!alvo) alvo = [pos[0], pos[1], pos[2] - DIST_ALVO_PADRAO];
    return {
      pos: pos,
      alvo: alvo,
      up: Array.isArray(d.up) && d.up.length === 3 ? normalizado(d.up) : [0, 1, 0],
      fov: num(d.fov) || 60,
      orto: !!d.orto
    };
  }
  function direcaoDe(cam) {
    return normalizado([cam.alvo[0] - cam.pos[0], cam.alvo[1] - cam.pos[1], cam.alvo[2] - cam.pos[2]]);
  }
  function distanciaDe(cam) {
    var d = [cam.alvo[0] - cam.pos[0], cam.alvo[1] - cam.pos[1], cam.alvo[2] - cam.pos[2]];
    return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  }

  /* ---------------------------------------------------------------
   * marcacao — 2D, em 0..1 do canvas
   * ------------------------------------------------------------- */
  function marcacao(d) {
    d = d || {};
    var tipo = TIPOS_MARCA.indexOf(txt(d.tipo)) >= 0 ? txt(d.tipo) : "";
    if (!tipo) return null;
    var pts = [];
    var lista = Array.isArray(d.pts) ? d.pts : [];
    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      if (!Array.isArray(p) || p.length < 2) continue;
      /* ⚠ preso a 0..1 de propósito: ponto fora do quadro viraria risco
         invisível no relatório, e ninguém saberia que ele existe */
      pts.push([clamp01(p[0]), clamp01(p[1])]);
    }
    if (tipo === "texto") { if (!pts.length || !txt(d.texto).trim()) return null; }
    else if (pts.length < 2) return null;
    return {
      tipo: tipo, pts: pts,
      cor: /^#[0-9a-fA-F]{6}$/.test(txt(d.cor)) ? txt(d.cor).toLowerCase() : "#e11d48",
      texto: txt(d.texto)
    };
  }

  function comentario(d) {
    d = d || {};
    var t = txt(d.texto).trim();
    if (!t) return null;
    return {
      autor: txt(d.autor),
      em: txt(d.em),
      texto: t,
      status: STATUS.indexOf(txt(d.status)) >= 0 ? txt(d.status) : "aberto"
    };
  }

  /* ---------------------------------------------------------------
   * vista — o registro de `bim_vistas`
   * ------------------------------------------------------------- */
  function vista(d) {
    d = d || {};
    var nome = txt(d.nome).trim();
    if (!nome) return null;
    function chaves(a) {
      var out = [], visto = {};
      (Array.isArray(a) ? a : []).forEach(function (c) {
        var k = txt(c).trim();
        if (k && !visto[k]) { visto[k] = 1; out.push(k); }
      });
      return out;
    }
    var marcas = [];
    (Array.isArray(d.marcacoes) ? d.marcacoes : []).forEach(function (m) {
      var mm = marcacao(m); if (mm) marcas.push(mm);
    });
    var coms = [];
    (Array.isArray(d.comentarios) ? d.comentarios : []).forEach(function (c) {
      var cc = comentario(c); if (cc) coms.push(cc);
    });
    return {
      id: txt(d.id),
      obraId: txt(d.obraId),
      nome: nome,
      criadoEm: txt(d.criadoEm),
      autor: txt(d.autor),
      camera: camera(d.camera),
      cortes: {
        planta: { on: !!(d.cortes && d.cortes.planta && d.cortes.planta.on), y: num(d.cortes && d.cortes.planta && d.cortes.planta.y) },
        livre: { on: !!(d.cortes && d.cortes.livre && d.cortes.livre.on),
                 plano: (d.cortes && d.cortes.livre && Array.isArray(d.cortes.livre.plano) && d.cortes.livre.plano.length === 4)
                   ? d.cortes.livre.plano.map(num) : [0, 0, 0, 0] }
      },
      visibilidade: {
        ocultos: chaves(d.visibilidade && d.visibilidade.ocultos),
        isolados: chaves(d.visibilidade && d.visibilidade.isolados),
        raioX: !!(d.visibilidade && d.visibilidade.raioX)
      },
      aparencias: (Array.isArray(d.aparencias) ? d.aparencias : []).map(function (a) {
        return { chave: txt(a && a.chave), cor: v3(a && a.cor, [1, 1, 1]), alpha: (a && a.alpha != null) ? num(a.alpha) : 1 };
      }).filter(function (a) { return !!a.chave; }),
      modelos: (Array.isArray(d.modelos) ? d.modelos : []).map(function (m) {
        return { arquivoId: txt(m && m.arquivoId), visivel: !(m && m.visivel === false), alpha: (m && m.alpha != null) ? num(m.alpha) : 1 };
      }).filter(function (m) { return !!m.arquivoId; }),
      marcacoes: marcas,
      comentarios: coms,
      /* a miniatura é blob: mora no IndexedDB, e aqui fica só o endereço */
      miniatura: txt(d.miniatura)
    };
  }

  /* ---------------------------------------------------------------
   * resolver — o que da vista ainda existe no modelo aberto
   *
   * ⚠ PEÇA QUE SUMIU VOLTA COMO "NÃO LOCALIZADA", NÃO SOME. Uma vista de três
   * meses atrás, aplicada sobre a versão nova do modelo, vai ter peças que não
   * existem mais. Aplicar o que restou e calar faria a vista mostrar menos do
   * que mostrava — e ninguém saberia que aquilo era o ponto do problema.
   * ------------------------------------------------------------- */
  function resolver(v, elementos) {
    var tem = {};
    (elementos || []).forEach(function (e) { if (e && e.chave) tem[e.chave] = 1; });
    function parte(lista) {
      var vivas = [], perdidas = [];
      (lista || []).forEach(function (k) { (tem[k] ? vivas : perdidas).push(k); });
      return { vivas: vivas, perdidas: perdidas };
    }
    var oc = parte(v && v.visibilidade && v.visibilidade.ocultos);
    var iso = parte(v && v.visibilidade && v.visibilidade.isolados);
    var ap = parte((v && v.aparencias || []).map(function (a) { return a.chave; }));
    return {
      ocultos: oc.vivas, isolados: iso.vivas,
      aparencias: (v && v.aparencias || []).filter(function (a) { return tem[a.chave]; }),
      naoLocalizadas: oc.perdidas.concat(iso.perdidas, ap.perdidas).filter(function (k, i, arr) { return arr.indexOf(k) === i; })
    };
  }

  var BimVista = {
    TIPOS_MARCA: TIPOS_MARCA,
    STATUS: STATUS,
    DIST_ALVO_PADRAO: DIST_ALVO_PADRAO,
    cenaParaIfc: cenaParaIfc,
    ifcParaCena: ifcParaCena,
    normalizado: normalizado,
    camera: camera,
    direcaoDe: direcaoDe,
    distanciaDe: distanciaDe,
    marcacao: marcacao,
    comentario: comentario,
    vista: vista,
    resolver: resolver
  };

  global.BimVista = BimVista;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
