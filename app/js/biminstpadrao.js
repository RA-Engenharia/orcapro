/* =====================================================================
 * biminstpadrao.js (BimInstPadrao) — PADRÃO DE APRESENTAÇÃO DE INSTALAÇÕES
 * (motor puro, ES5, Node-testável; sem three.js nem DOM).
 *
 * Pedido do Rogério (17/10/2026): "a configuração de cores e de visibilidade
 * das peças já é costume dos projetistas. O tubo de esgoto tem uma cor, o de
 * água fria tem outra; seguir o que já está pronto fica melhor."
 *
 * O QUE É: a CONVENÇÃO de apresentação usual de mercado em projeto de
 * instalações — cor, pena e tipo de linha por SISTEMA, filtros de vista
 * (por sistema, de aviso e de meio-tom), modelos de vista (plantas por
 * disciplina, isométrico, 3D de coordenação, detalhe), o conteúdo dos
 * rótulos (DN, inclinação, seta de fluxo, código da peça) e a legenda de
 * tubulação. Os VALORES foram levantados num template de referência de
 * mercado e estão em dados-fonte/hidro/apresentacao/padrao-instalacoes.json;
 * o js com os dados é GERADO (js/biminstpadraodados.js, tools/gerar-biminst-
 * padrao.js --checar). Nenhum arquivo, família ou texto do template é
 * copiado ou distribuído: só a convenção, em formato nosso.
 *
 * QUEM USA:
 *   js/biminst.js        cor do SISTEMA (BimInst.SISTEMAS[s].cor e .linha)
 *   js/biminstnivel.js   pena/cor/tipo da linha única (ESTILO_SIS — aplicar())
 *   js/bimmodelovista.js os modelos de vista de instalações (MODELOS_RA —
 *                        aplicar()) e os filtros por sistema (conjuntos())
 *   js/biminstui.js      cor por SISTEMA como modo padrão da vista
 *                        Instalações; filtros de AVISO (mapaAvisos)
 *   js/hidpranchas.js    camadas HID-*-TUBO, rótulo e legenda da prancha
 *
 * ⚠ SEM NÚMERO MÁGICO: todo valor (cor, pena, mm, formato do rótulo, escala,
 *   nível de detalhe) vem do js gerado. Sem os dados, as funções devolvem
 *   null e quem chama fica com o que já tinha (o teste confere os dois).
 * Teste: node tools/test-biminstpadrao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function txt(v) { return v == null ? "" : String(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function D() { return dep("BimInstPadraoDados", "./biminstpadraodados.js"); }

  /* o número no formato do rótulo: vírgula decimal, casas do padrão */
  function br(v, casas) {
    var n = Number(v); if (!isFinite(n)) return "";
    return n.toFixed(casas || 0).replace(".", ",");   /* casas FIXAS: "i=2,0%", como a etiqueta da fonte */
  }

  var BimInstPadrao = {
    /* ============================================================ DADOS */
    dados: function () { return D(); },
    pronto: function () { var d = D(); return !!(d && d.sistemas); },
    origem: function () { var d = D(); return d ? d.origem : ""; },

    /* o estilo de um SISTEMA do OrçaPRO (chave do js/biminst.js) */
    sistema: function (chave) {
      var d = D(), s = d && obj(d.sistemas)[chave];
      return s ? clone(s) : null;
    },
    chaves: function () { var d = D(); return d ? Object.keys(obj(d.sistemas)) : []; },
    /* mm de papel de uma pena numa escala (tabela de penas do OrçaPRO, copiada pelo gerador) */
    mm: function (pena, escala) {
      var d = D(); if (!d || !d.penas) return null;
      var t = d.penas.tabela[String(escala)] || d.penas.tabela[String(d.penas.escalaBase)];
      return t ? t[pena - 1] : null;
    },
    /* o traço do tipo de linha em mm de papel ([] = contínua) */
    traco: function (padrao) {
      var d = D(), p = d && obj(d.padroesLinha)[padrao];
      return p ? clone(p.mm) : null;
    },

    /* ============================================================ APLICAR
     * Leva o padrão aos motores já carregados. Idempotente: rodar de novo
     * não muda nada. Devolve o que mudou (para o teste e para o status). */
    aplicar: function (alvos) {
      alvos = alvos || {};
      var d = D(), rel = { sistemas: [], linhaUnica: [], modelos: [] };
      if (!d || !d.sistemas) return rel;
      var BI = alvos.BimInst || dep("BimInst", "./biminst.js");
      var NV = alvos.BimInstNivel || dep("BimInstNivel", "./biminstnivel.js");
      var MV = alvos.BimModeloVista || global.BimModeloVista || null;
      Object.keys(d.sistemas).forEach(function (k) {
        var s = d.sistemas[k];
        if (BI && BI.SISTEMAS && BI.SISTEMAS[k]) {
          BI.SISTEMAS[k].cor = s.cor;
          BI.SISTEMAS[k].linha = { pena: s.pena, mm: s.mm, padrao: s.padrao };
          rel.sistemas.push(k);
        }
        /* NÍVEL DE DETALHE: a linha única leva a pena, a cor e o tipo do padrão (o objeto é o exportado pelo motor) */
        if (NV && NV.ESTILO_SIS) {
          NV.ESTILO_SIS[k] = { cor: s.cor, mm: s.mm, pena: s.pena, padrao: s.padrao, contorno: s.corContorno || null };   /* contorno = a linha única do Médio */
          rel.linhaUnica.push(k);
        }
      });
      if (MV && MV.MODELOS_RA) {
        this.modelosVista2d().forEach(function (m) { MV.MODELOS_RA[m.id] = m; rel.modelos.push(m.id); });
      }
      return rel;
    },

    /* ======================================================= MODELOS DE VISTA
     * modelos 2D no formato do js/bimmodelovista.js (planta, corte, detalhe):
     * { id, nome, tipoVista, ra, inst, campos, valores: { escala, nivelDetalhe, disciplina,
     *   estiloVisual, faixa, vg: {OST_*: {visivel, meioTom}}, filtros: {conjuntoId: ov} } } */
    modelosVista2d: function () {
      var d = D(); if (!d) return [];
      return Object.keys(obj(d.modelos)).map(function (k) { return d.modelos[k]; })
        .filter(function (m) { return m.tipoVista !== "3d" && m.tipoVista !== "isometrico"; })
        .map(function (m) {
          var campos = { escala: true, nivelDetalhe: true, disciplina: true, estiloVisual: true, vg: true, filtros: true };
          if (m.valores && m.valores.faixa) campos.faixa = true;
          return { id: m.id, nome: m.nome, tipoVista: m.tipoVista, ra: true, inst: true, origem: d.origem, campos: campos, valores: clone(m.valores) };
        });
    },
    /* todos (inclusive 3D de coordenação e isométrico, que vivem na tela 3D) */
    modelosVista: function () { var d = D(); return d ? Object.keys(obj(d.modelos)).map(function (k) { return clone(d.modelos[k]); }) : []; },
    modelo: function (id) { var d = D(), m = d && obj(d.modelos)[id]; return m ? clone(m) : null; },

    /* ======================================================= FILTROS
     * por SISTEMA: conjuntos de BUSCA do js/bimset.js (regra = dado, sem código),
     * com o id que os modelos de vista citam em `filtros`. A regra compara o
     * campo `sistemaNome` (o nome legível) com o nome do sistema. */
    conjuntos: function () {
      var d = D(); if (!d) return [];
      return Object.keys(obj(d.filtros)).filter(function (k) { return d.filtros[k].tipo === "sistema"; }).map(function (k) {
        var f = d.filtros[k], cond = arr(f.nomes).map(function (n) { return { campo: "sistemaNome", oper: "contem", valor: n }; });
        return { id: k, nome: f.nome, tipo: "busca", padrao: true, regra: { op: "ou", cond: cond }, cor: f.ov && f.ov.cor ? String(f.ov.cor).toLowerCase() : "" };
      });
    },
    filtro: function (id) { var d = D(), f = d && obj(d.filtros)[id]; return f ? clone(f) : null; },
    /* o filtro de SISTEMA de um trecho/peça (para a vista que filtra pelo id do elemento) */
    filtroDoSistema: function (sistema) {
      var d = D(); if (!d) return null;
      var ks = Object.keys(obj(d.filtros)).filter(function (k) { return d.filtros[k].tipo === "sistema" && arr(d.filtros[k].sistemas).indexOf(sistema) >= 0; });
      return ks[0] || null;
    },
    /* a sobreposição de um sistema numa vista (modelo): visível? meio-tom? cor? */
    sobreposicao: function (modeloId, sistema) {
      var m = this.modelo(modeloId), f = this.filtroDoSistema(sistema);
      if (!m || !f) return null;
      var ov = obj(obj(m.valores).filtros)[f];
      return Object.keys(ov).length ? clone(ov) : null;
    },
    /* AVISO: itens do BimInst.verificar → { mapa: {id: cor}, porFiltro: {id: n} } — a cor do filtro de aviso do padrão */
    /* itens = BimInst.verificar(...).itens; trechos (opcional) = os trechos do modelo, para o filtro de BARRA
       (tubo mais comprido que o limite do filtro da fonte, limite_m) */
    mapaAvisos: function (itens, trechos) {
      var d = D(), out = { mapa: {}, porFiltro: {} }; if (!d) return out;
      /* PRECEDÊNCIA = a ordem dos filtros de aviso no padrão (o de ERRO vem antes do de FALTA): a peça com os dois
         fica na cor do mais grave */
      var porTipo = {}, rank = {}, ordem = 0, rk = {};
      Object.keys(obj(d.filtros)).forEach(function (k) { var f = d.filtros[k]; if (f.tipo === "aviso") { rank[k] = ordem++; arr(f.verificacao).forEach(function (t) { porTipo[t] = k; }); } });
      function pinta(id, k) { if (rk[id] == null || rank[k] < rk[id]) { out.mapa[id] = d.filtros[k].ov.cor; rk[id] = rank[k]; } }
      arr(itens).forEach(function (it) {
        var k = porTipo[it.tipo]; if (!k) return;
        out.porFiltro[k] = (out.porFiltro[k] || 0) + 1;
        arr(it.ids).forEach(function (id) { pinta(id, k); });
      });
      var kb = porTipo.tuboLongo, lim = kb ? d.filtros[kb].limite_m : null;
      if (kb && lim > 0) arr(trechos).forEach(function (t) {
        if (!(t && t.comprimento > lim)) return;
        pinta(t.id, kb); out.porFiltro[kb] = (out.porFiltro[kb] || 0) + 1;
      });
      return out;
    },

    /* ======================================================= RÓTULOS
     * o texto do rótulo de um trecho pelo formato do padrão:
     *   t = { sistema, dn, inclinacao (%), vertical, comprimento (m), codigo }
     * Tokens: {abrev} {dn} {i} {comp} {codigo}. Sem inclinação, o pedaço
     * que a cita sai inteiro (o formato marca com [ ]). */
    rotuloTrecho: function (t) {
      var d = D(); if (!d || !d.rotulos) return null;
      var S = obj(d.sistemas)[t.sistema], R = d.rotulos.tubo, f = R.porSistema[t.sistema] || R.porGrupo[S ? S.grupo : ""] || R.padrao;
      if (t.vertical && R.vertical) f = R.vertical;
      var s = f.formato;
      var val = { abrev: S ? S.abrev : "", dn: txt(t.dn), i: t.inclinacao != null && isFinite(+t.inclinacao) ? br(t.inclinacao, R.casasInclinacao) : "",
                  comp: t.comprimento != null ? br(t.comprimento, R.casasComprimento) : "", codigo: txt(t.codigo) };
      /* trecho opcional entre colchetes: some se algum token dentro dele estiver vazio */
      s = s.replace(/\[([^\]]*)\]/g, function (m0, dentro) {
        var vazio = false; dentro.replace(/\{(\w+)\}/g, function (m1, k) { if (!val[k]) vazio = true; return m1; });
        return vazio ? "" : dentro;
      });
      return s.replace(/\{(\w+)\}/g, function (m0, k) { return val[k] != null ? val[k] : ""; }).replace(/\s+/g, " ").trim();
    },
    /* o rótulo de PEÇA.
       rotuloPeca("caixa_sifonada") → o FORMATO do padrão para aquele tipo (chave do js/biminst.js PECAS ou família):
         { formato: "CS {a}x{b}x{c}mm", cor: "#…", altura_mm, campos: ["a","b","c"] }  (null = o padrão não tem rótulo para o tipo)
       rotuloPeca({ tipo?, codigo, nome, dn, a, b, c… }) → o TEXTO pronto (o formato do tipo, ou o genérico do padrão).
       Tokens vazios: o pedaço entre [ ] some inteiro; nada é inventado. */
    rotuloPeca: function (p) {
      var d = D(); if (!d || !d.rotulos) return null;
      var porTipo = obj(d.rotulos.pecas);
      if (typeof p === "string") {
        var fT = porTipo[p]; if (!fT) return null;
        var campos = []; String(fT.formato).replace(/\{(\w+)\}/g, function (m0, k) { if (campos.indexOf(k) < 0) campos.push(k); return m0; });
        return { formato: fT.formato, cor: fT.cor || null, altura_mm: fT.altura_mm || null, campos: campos };
      }
      p = obj(p);
      var fo = (p.tipo && porTipo[p.tipo]) || d.rotulos.peca, f = fo.formato, val = {};
      Object.keys(p).forEach(function (k) { if (p[k] != null && p[k] !== "") val[k] = txt(p[k]); });
      var s = f.replace(/\[([^\]]*)\]/g, function (m0, dentro) { var vazio = false; dentro.replace(/\{(\w+)\}/g, function (m1, k) { if (!val[k]) vazio = true; return m1; }); return vazio ? "" : dentro; });
      return s.replace(/\{(\w+)\}/g, function (m0, k) { return val[k] || ""; }).replace(/\s+/g, " ").trim();
    },

    /* ======================================================= PLANTA (API para o desenho 2D e o nível de detalhe)
     * Como o padrão sai na planta de instalações: o TUBO preenchido com a cor do sistema (preenchimento de
     * superfície do filtro do sistema), contorno na cor da linha; CONEXÕES brancas com contorno; louças em
     * meio-tom (modelo de vista); caixa com hachura e rótulo próprio (rotuloPeca). Sem o dado levantado, null. */
    corSistema: function (sis) { var s = this.sistema(sis); return s ? s.cor : null; },
    corPreenchimentoPlanta: function (sis) { var s = this.sistema(sis); return s && s.corPreenchimento ? s.corPreenchimento : null; },
    /* { preenchimento: "#FFFFFF", contorno: "#…", pena, mm, padrao } */
    estiloConexaoPlanta: function () { var d = D(); return d && d.planta && d.planta.conexao ? clone(d.planta.conexao) : null; },
    /* { preenchimento, contorno, pena, mm, hachura } da caixa/ralo na planta (hachura = nome do padrão de preenchimento) */
    estiloCaixaPlanta: function () { var d = D(); return d && d.planta && d.planta.caixa ? clone(d.planta.caixa) : null; },
    /* quais sistemas levam SETA DE FLUXO no 2D (sentido do escoamento ou da água) */
    temSeta: function (sistema) { var d = D(); return !!(d && d.rotulos && arr(d.rotulos.setaFluxo.sistemas).indexOf(sistema) >= 0); },
    texto: function () { var d = D(); return d && d.rotulos ? clone(d.rotulos.texto) : null; },

    /* ======================================================= LEGENDA
     * a legenda de tubulação de uma folha: um item por sistema PRESENTE, na
     * ordem do padrão, com a cor, a pena, o traço e se leva seta. */
    legenda: function (presentes) {
      var d = D(); if (!d) return [];
      var tem = {}; arr(presentes).forEach(function (s) { tem[s] = 1; });
      var self = this;
      return arr(d.ordemLegenda).filter(function (k) { return tem[k] && d.sistemas[k]; }).map(function (k) {
        var s = d.sistemas[k];
        return { sistema: k, nome: s.nome, abrev: s.abrev, cor: s.cor, pena: s.pena, mm: s.mm, padrao: s.padrao, traco: self.traco(s.padrao) || [], seta: self.temSeta(k),
                 texto: s.nome + " (" + s.abrev + ")" + (self.temSeta(k) ? " - seta = sentido do escoamento" : "") };
      });
    },

    /* ======================================================= TELA
     * o modo de cor da vista Instalações (decisão no JSON, com o porquê) */
    modoCorPadrao: function () { var d = D(); return d && d.aplicacao ? d.aplicacao.modoCorPadrao : null; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = BimInstPadrao;
  global.BimInstPadrao = BimInstPadrao;
  /* no navegador o motor entra depois do js/biminst.js e do js/biminstnivel.js (index.html): aplica já */
  /* no navegador o motor entra depois do js/biminst.js e do js/biminstnivel.js (index.html): aplica já; os modelos de
     vista entram quando o js/bimmodelovista.js existir (ele é de outro grupo de carga) */
  if (typeof window !== "undefined") {
    try { BimInstPadrao.aplicar(); } catch (e) { /* sem dados: fica o de antes */ }
    var tentativas = 0;
    (function esperarModelos() {
      if (global.BimModeloVista && global.BimModeloVista.MODELOS_RA) { try { BimInstPadrao.aplicar(); } catch (e2) {} return; }
      if (++tentativas < 240) setTimeout(esperarModelos, 500);
    })();
  }
})(typeof window !== "undefined" ? window : globalThis);
