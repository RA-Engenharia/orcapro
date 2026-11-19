/* =====================================================================
 * bimfolhaui.js — FOLHAS NO BIM (P8, frentes A, B e C)
 * (plano do BIM §3.6 e fase P8; prévia `?previa=modelador`)
 *
 * Quem faz o quê:
 *   js/prancha.js .... motor: viewport, parâmetros da folha, revisões,
 *                      lista de folhas/vistas, nome automático (puro);
 *   js/pranchaui.js .. o HTML da folha (vista em escala em VETOR, título de
 *                      vista, carimbo parametrizado);
 *   js/bimdxf.js ..... o DXF da vista e da folha (camada por categoria,
 *                      espessura pela pena);
 *   este arquivo ..... a TELA: a folha abre numa ABA de vista (igual planta e
 *                      corte), recebe a vista ARRASTADA do Navegador, mostra
 *                      os parâmetros em Propriedades e exporta.
 *
 * Onde mora o quê:
 *   folhas ........... no registro de pranchas da obra (Store `bim_pranchas`,
 *                      o mesmo das "Pranchas do projeto");
 *   revisões ......... do PROJETO, por obra: localStorage
 *                      `orcapro:bim:projeto:<obra>` = { revisoes: [{ id,
 *                      numero, data, descricao, emitidoPor, emitidoPara,
 *                      emitida }] } (o formato da P7: a nuvem de revisão liga
 *                      pelo id). Só neste aparelho por enquanto (prévia).
 *   desenho da vista . NUNCA gravado: refeito do modelo (Bim2D) na hora.
 *
 * Sem a prévia, `ativo()` é falso e nada daqui aparece.
 * ===================================================================== */
(function (global) {
  "use strict";

  function PR() { return global.Prancha; }
  function UI2() { return global.PranchaUI; }
  function D2() { return global.Desenho2D; }
  function B2() { return global.Bim2D; }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  var MM_PX = 96 / 25.4;
  var TIPO_ARRASTE = "text/x-orcapro-vista";

  var BimFolhaUI = {
    _G: null, _desenhos: {}, _sel: null, _telas: {}, _ultimoArquivo: null, _pilha: [], _refazerP: [], _ferr: null, _menu: null, _editor: null,

    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && PR() && UI2() && PR().colocarViewport); } catch (e) { return false; } },
    G: function () { return this._G || global.Gestao || null; },
    obraKey: function () { var g = this.G(); return String((g && g._bimSel) || "geral"); },
    empresa: function () { try { return global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : null; } catch (e) { return null; } },

    /* ---------------------------------------------------------- dados */
    registros: function () { var g = this.G(); try { return (g && g._prRegs) ? g._prRegs() : []; } catch (e) { return []; } },
    /* `semPilha`: gravação que não é do usuário (o quadro acompanhando a vista) não entra no Ctrl+Z */
    salvarRegistro: function (reg, semPilha) {
      if (!global.Store) return null;
      /* DESFAZER da folha (revisão 14/11/2026, dado de cliente): o passo guarda SÓ as folhas mexidas (e o carimbo,
         se mudou) e a OBRA — nunca o registro inteiro: voltar o registro inteiro apagava o que outro painel, o Gerar
         pranchas ou a nuvem tinham mudado nas outras folhas, e recriava conjunto já apagado */
      this._conferirObra();
      if (!semPilha && reg && reg.id) {
        var antes = this.registros().filter(function (x) { return String(x.id) === String(reg.id); })[0];
        var passo = antes ? this._passo(antes, reg) : null;
        if (passo) { this._pilha.push(passo); if (this._pilha.length > 60) this._pilha.shift(); this._refazerP = []; }
      }
      var r = global.Store.salvar(this.empresa(), "bim_pranchas", reg);
      if (!r) toast("Não consegui salvar a folha (armazenamento cheio?).", "erro");
      else { this._marcar(r); try { if (B2() && B2().atualizarBolhasFolha) B2().atualizarBolhasFolha(); } catch (eB) {} }   /* a bolha da chamada na vista-mae mostra a folha */
      return r;
    },
    /* a pilha é DA OBRA: trocou de obra, zera (Ctrl+Z na obra B não pode gravar a folha da obra A) */
    _conferirObra: function () { var k = this.obraKey(); if (this._pilhaObra !== k) { this._pilha = []; this._refazerP = []; this._marcas = {}; this._pilhaObra = k; } return k; },
    _jsonF: function (f) { return JSON.stringify(f == null ? null : f); },
    /* o que a FOLHA gravou por último (folha a folha e o carimbo): diferente na hora do Ctrl+Z = mudaram por fora */
    _marcar: function (r) {
      var self = this; this._marcas = this._marcas || {};
      arr(r.folhas).forEach(function (f) { self._marcas[r.id + "|" + f.id] = self._jsonF(f); });
      this._marcas[r.id + "|carimbo"] = this._jsonF(r.carimbo || null);
    },
    _passo: function (antes, depois) {
      var self = this, folhas = {}, n = 0, ant = {};
      arr(antes.folhas).forEach(function (f) { ant[f.id] = f; });
      arr(depois.folhas).forEach(function (f) { var a = ant[f.id]; if (a && self._jsonF(a) !== self._jsonF(f)) { folhas[f.id] = clone(a); n++; } });
      var car = this._jsonF(antes.carimbo || null) !== this._jsonF(depois.carimbo || null);
      if (!n && !car) return null;
      var p = { obra: this.obraKey(), regId: String(antes.id), folhas: folhas };
      if (car) p.carimbo = clone(antes.carimbo || null);
      return p;
    },
    _chaveProjeto: function () { return "orcapro:bim:projeto:" + this.obraKey(); },
    projeto: function () {
      var p = null; try { p = JSON.parse(global.localStorage.getItem(this._chaveProjeto()) || "null"); } catch (e) { p = null; }
      if (!p || typeof p !== "object") p = {};
      p.revisoes = PR() ? PR().revisoesProjeto(p) : arr(p.revisoes);
      return p;
    },
    gravarProjeto: function (p) { try { global.localStorage.setItem(this._chaveProjeto(), JSON.stringify(p)); return true; } catch (e) { toast("Não consegui guardar as revisões neste aparelho.", "erro"); return false; } },

    idFolha: function (regId, folhaId) { return "fl-" + regId + "--" + folhaId; },
    ehFolha: function (id) { return /^fl-.+--.+/.test(String(id || "")); },
    achar: function (id) {
      var m = /^fl-(.+)--(.+)$/.exec(String(id || "")); if (!m) return null;
      var reg = this.registros().filter(function (r) { return String(r.id) === m[1]; })[0]; if (!reg) return null;
      var pr = PR().normalizar(reg), ix = -1;
      pr.folhas.forEach(function (f, i) { if (f.id === m[2]) ix = i; });
      if (ix < 0) return null;
      return { reg: reg, pr: pr, folha: pr.folhas[ix], ix: ix, geo: PR().geometriaDe(pr) };
    },
    /* grava a folha `f` (normalizada) de volta no registro */
    gravarFolha: function (a, f, semPilha) {
      var reg = a.reg, pr = PR().normalizar(reg);
      pr.folhas[a.ix] = f;
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      return this.salvarRegistro(pr, semPilha);
    },
    nomeFolha: function (pr, f) { return PR().numeroFolha(pr, f) + " - " + (f.conteudo || "Sem nome"); },

    /* o cadastro da conta (⚙ Empresa): nome, CNPJ, título, responsável, CREA, endereço, contato */
    empresaDados: function () { try { return global.Empresa && global.Empresa.dados ? global.Empresa.dados() : {}; } catch (e) { return {}; } },
    /* o prancha do template aplicado na obra (.optpl: formato, notas, modelo de carimbo) */
    templatePrancha: function () { try { var b = B2(); return (b && b.estado && (b.estado().templateAtivo || {}).prancha) || null; } catch (e) { return null; } },
    /* o conjunto "Folhas do projeto" da obra — criado na 1ª vez com o CARIMBO RA. Os dados da empresa
       NÃO são copiados para a prancha: o carimbo lê o cadastro da conta na hora (mudou lá, muda aqui).
       Registro de antes do modelo de carimbo (sem `modelo`) passa a RA: é o padrão das folhas do modelador. */
    conjunto: function (formato) {
      var regs = this.registros(), reg = regs.filter(function (r) { return r.origem === "folhas"; })[0];
      if (reg) {
        if (!reg.carimbo || !reg.carimbo.modelo) { reg = clone(reg); reg.carimbo = reg.carimbo || {}; reg.carimbo.modelo = "RA"; }
        return reg;
      }
      var tpl = this.templatePrancha() || {}, obra = null;
      try { obra = global.Store.obter(this.empresa(), "obras", this.G()._bimSel); } catch (e2) { obra = null; }
      obra = obra || {};
      var tc = tpl.carimbo || {};
      reg = PR().normalizar({ nome: "Folhas do projeto", formato: formato || tpl.formato || "A1", orientacao: tpl.orientacao, origem: "folhas", folhas: [], coluna: tpl.coluna || [],
        carimbo: { modelo: tc.modelo === "simples" ? "simples" : "RA", obra: obra.nome || "", proprietario: obra.clienteNome || "",
                   local: obra.local || obra.endereco || "", data: new Date().toLocaleDateString("pt-BR") } });
      reg.obraId = String(this.G()._bimSel || ""); reg.criadoEm = new Date().toISOString(); delete reg.id;
      return reg;
    },

    /* uma folha nova no conjunto "Folhas do projeto" da obra (criado na 1ª vez) */
    novaFolha: function (formato) {
      var reg = this.conjunto(formato);
      var pr = PR().normalizar(reg), n = pr.folhas.length + 1;
      pr.folhas.push(PR().normalizar({ folhas: [{ id: "f" + Date.now().toString(36) + n, n: n, conteudo: "Folha " + ("0" + n).slice(-2), escala: "indicada" }] }).folhas[0]);
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      if (!pr.id) delete pr.id;
      var salvo = this.salvarRegistro(pr); if (!salvo) return null;
      var id = this.idFolha(salvo.id, pr.folhas[pr.folhas.length - 1].id);
      this.abrir(id);
      return id;
    },


    /* =====================================================================
     * EXCLUIR E DUPLICAR FOLHA (16/11/2026, pedido do Rogério)
     *   • EXCLUIR: confirmação; a folha sai do conjunto, a aba fecha e as VISTAS continuam no projeto (só o quadro da folha some). Fica um instantâneo (até 20) para
     *     "Desfazer exclusão" — Navegador › Folhas, menu da folha e Ctrl+Z numa aba de folha quando a última coisa feita foi excluir.
     *   • DUPLICAR: cópia com as mesmas vistas (cada quadro com escala e recorte), o mesmo carimbo e parâmetros; vai para o FIM do conjunto, com o número seguinte (EST-01 → EST-02,
     *     ou o código-nn automático) e o nome "… (cópia)". A cópia é folha de mão: perde a chave `auto` do "Gerar pranchas" (senão o gerador a tomaria por a folha gerada e a sobrescreveria).
     * ⚠ FOLHA GERADA (estrutura/hidro/arquitetura) que foi EXCLUÍDA: rodar "Gerar pranchas" de novo a recria (a folha gerada é idempotente por chave `auto`: o que não existe, nasce);
     *   a cópia de uma gerada NÃO é tocada pelo gerador. Quem quer a folha fora do jogo exclui depois de gerar, ou não marca aquela vista no diálogo.
     * ===================================================================== */
    _apagadas: [],
    _proximoNumero: function (pr, f) {
      var usados = {}; arr(pr.folhas).forEach(function (x) { usados[PR().numeroFolha(pr, x)] = 1; });
      var m = /^(.*?)(\d+)$/.exec(String(f.numero || "")); if (!m) return "";
      var larg = m[2].length, n = parseInt(m[2], 10);
      for (var i = 1; i < 500; i++) { var cand = m[1] + ("000000" + (n + i)).slice(-Math.max(larg, String(n + i).length)); if (!usados[cand]) return cand; }
      return "";
    },
    duplicarFolha: function (id) {
      var a = this.achar(id); if (!a) { toast("Folha não encontrada.", "aviso"); return null; }
      var reg = clone(a.reg), pr = PR().normalizar(reg), f = clone(a.folha), n = 1;
      pr.folhas.forEach(function (x) { n = Math.max(n, x.n + 1); });
      var ids = {}; pr.folhas.forEach(function (x) { ids[x.id] = 1; });
      var novoId = "f" + Date.now().toString(36) + n; while (ids[novoId]) novoId += "x";
      f.id = novoId; f.n = n; f.auto = ""; f.numero = this._proximoNumero(pr, a.folha);
      f.conteudo = (f.conteudo || "Folha") + " (cópia)";
      pr.folhas.push(f);
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      var salvo = this.salvarRegistro(pr, true); if (!salvo) return null;
      var nid = this.idFolha(salvo.id, novoId);
      try { var g = this.G(); if (g && g._nivArvore) g._nivArvore(); } catch (e) {}
      this.abrir(nid);
      status("Folha duplicada: " + this.nomeFolha(PR().normalizar(salvo), f) + ".");
      return nid;
    },
    /* confirma e exclui; `sim` = true pula a pergunta (testes e chamadas de código) */
    excluirFolha: function (id, sim) {
      var a = this.achar(id); if (!a) { toast("Folha não encontrada.", "aviso"); return false; }
      var self = this, nome = this.nomeFolha(a.pr, a.folha);
      if (sim !== true) {
        global.UI.modal("Excluir a folha?", '<p style="font-size:13px;line-height:1.5">A folha <b>' + esc(nome) + '</b> sai do conjunto' + (a.folha.auto ? " (é uma folha GERADA: \"Gerar pranchas\" de novo a recria)" : "") +
          '. As vistas (plantas, cortes, elevações, 3D) <b>continuam no projeto</b>; só o quadro delas nesta folha some. Dá para desfazer em Navegador › Folhas.</p>',
          [{ texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }, { texto: "Excluir folha", classe: "danger", onClick: function () { global.UI.fecharModal(); self.excluirFolha(id, true); } }]);
        return true;
      }
      var reg = clone(a.reg), pr = PR().normalizar(reg);
      this._apagadas.push({ obra: this.obraKey(), regId: String(reg.id), folha: clone(a.folha), ix: a.ix, nome: nome, em: Date.now() });
      if (this._apagadas.length > 20) this._apagadas.shift();
      pr.folhas.splice(a.ix, 1);
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      var salvo = this.salvarRegistro(pr, true); if (!salvo) { this._apagadas.pop(); return false; }
      try { var g = this.G(); if (g && g._bimVxFechar && g._bimVxAchar && g._bimVxAchar(id)) g._bimVxFechar(id); } catch (e) {}
      this.desmontar(id); this._sel = null;
      try { var g2 = this.G(); if (g2 && g2._nivArvore) g2._nivArvore(); } catch (e2) {}
      status("Folha excluída: " + nome + " (Navegador › Folhas › Desfazer exclusão).");
      toast("Folha excluída: " + nome + ". Desfazer em Navegador › Folhas.", "info");
      return true;
    },
    ultimaApagada: function () { var k = this.obraKey(), l = this._apagadas.filter(function (x) { return x.obra === k; }); return l[l.length - 1] || null; },
    desfazerExclusao: function () {
      var k = this.obraKey(), u = this.ultimaApagada(); if (!u) { toast("Nenhuma exclusão de folha para desfazer.", "aviso"); return null; }
      var reg = this.registros().filter(function (r) { return String(r.id) === u.regId; })[0];
      if (!reg) { this._apagadas = this._apagadas.filter(function (x) { return x !== u; }); toast("O conjunto dessa folha não existe mais.", "aviso"); return null; }
      var pr = PR().normalizar(clone(reg)), ids = {}; pr.folhas.forEach(function (x) { ids[x.id] = 1; });
      var f = clone(u.folha); if (ids[f.id]) f.id += "r";
      pr.folhas.splice(Math.min(u.ix, pr.folhas.length), 0, f);
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      var salvo = this.salvarRegistro(pr, true); if (!salvo) return null;
      this._apagadas = this._apagadas.filter(function (x) { return x !== u; });
      try { var g = this.G(); if (g && g._nivArvore) g._nivArvore(); } catch (e) {}
      var nid = this.idFolha(salvo.id, f.id); this.abrir(nid);
      status("Exclusão desfeita: " + u.nome + ".");
      return nid;
    },

    /* ----------------------------------------------- aba da folha */
    abrir: function (id) {
      var g = this.G(), a = this.achar(id); if (!g || !a) return null;
      var st = g._bimVxEst(), v = g._bimVxAchar(id), nome = "Folha: " + this.nomeFolha(a.pr, a.folha);
      if (!v) {
        var tela = g._bimVxCriarTela(id, nome); if (!tela) return null;
        tela.classList.add("bim-tela-folha");
        this.montar(tela, id);
        st.lista.push({ id: id, nome: nome, janela: null, tipo: "folha" });
      }
      g._bimVxAtivar(id);
      try { g._nivArvore(); } catch (e) {}
      return id;
    },
    montar: function (tela, id) {
      if (!tela) return false;
      var self = this, c = tela.querySelector(".pv-tela");
      if (!c) { c = document.createElement("div"); c.className = "pv-tela"; tela.appendChild(c); }
      c.setAttribute("data-pv-folha", id);
      this._telas[id] = { tela: tela, el: c };
      if (!c._pvLigado) { c._pvLigado = true; this._ligar(c, id); }
      if (global.ResizeObserver && !c._pvRO) { c._pvRO = new global.ResizeObserver(function () { self._ajustar(id); }); c._pvRO.observe(c); }
      return this.pintar(id);
    },
    desmontar: function (id) { var t = this._telas[id]; if (t && t.el && t.el._pvRO) { try { t.el._pvRO.disconnect(); } catch (e) {} } delete this._telas[id]; if (this._sel && this._sel.id === id) this._sel = null; },

    /* o desenho de uma vista 2D, pronto para o viewport (cache da sessão; "Atualizar" refaz) */
    desenho: function (vistaId, refazer, escala, semInst, conv) {
      if (/^d3:/.test(String(vistaId))) return this._desenho3d(vistaId);
      /* ⚠ O DESENHO É DA OBRA (revisão da Prancha Viva, 23/10/2026): o id da vista ("d2p-pav0", "d2c-…") se repete em toda
         obra, e o cache era só por id — abrir a obra A, trocar para a B e a folha da B mostrava a planta da A; o pacote do
         link da Prancha Viva levava essa imagem ao celular do cliente da obra B (tools/test-pranchaviva-rev.js [a]) */
      var obraK = this.obraKey();
      if (this._desenhosObra !== obraK) { this._desenhos = {}; this._desenhosObra = obraK; }
      /* `semInst` ("arquitetura" | "estrutural") vem do VIEWPORT da folha gerada (b.semInst), não da vista: a mesma vista pode estar numa folha sem tubo e noutra com */
      var tagSI = semInst === "arquitetura" || semInst === "estrutural" ? semInst : "";
      var tagCV = conv === "construirDemolir" ? "~cd" : "";   /* a cópia na convenção Construir e Demolir é outro desenho da MESMA vista (a vista não muda) */
      var chave = (escala ? vistaId + "@" + escala : vistaId) + (tagSI ? "#" + tagSI : "") + tagCV;
      if (!refazer && this._desenhos[chave]) return this._desenhos[chave];
      var b2 = B2(), D = D2(); if (!b2 || !D) return null;
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e0) {}
      var d = b2.def(vistaId); if (!d) return null;
      var c = b2._cache[vistaId], bruto = (c && c.dados && !refazer && !(b2._desenhandoDe && b2._desenhandoDe(c.dados))) ? c.dados : b2._extrair(d);   /* C3: a vista da tela ainda desenhando no Worker não vai à folha (extrai completa, síncrona) */
      if (!bruto || !bruto.ok) return null;
      var an = b2._anotar(d, bruto); an.linhasIfc = bruto.linhasIfc || [];
      /* a folha só vale a disciplina ESCOLHIDA da vista: o traço de instalação em meio-tom que a tela marcou por seguir a fita sai (Coordenação/fita = folha de sempre) */
      try {
        var M6s = b2._p6 ? b2._p6() : null, fdF = M6s && M6s.fundoDeSistema ? M6s.fundoDeSistema(vistaId, true) : null;
        if (!fdF && an.inst) { var limpa = function (l) { if (!l || !l.fundo) return l; var o = {}; Object.keys(l).forEach(function (k) { if (k !== "fundo") o[k] = l[k]; }); return o; }; an.inst = Object.assign({}, an.inst, { linhas: (an.inst.linhas || []).map(limpa), simbolos: (an.inst.simbolos || []).map(limpa) }); }
      } catch (eSF) { /* fica como está */ }
      var est = clone(b2.estilo(vistaId)); est.titulo = false;
      if (tagCV) {
        est.convencao = "construirDemolir";
        /* o piso a REMOVER (reforma, por ambiente) vira hachura diagonal no ambiente — a regra é do motor (js/bimconstruirdemolir.js) */
        try { var CDh = global.BimConstruirDemolir, stH = this._estadoBim(); if (CDh && stH && an.ambientes && an.ambientes.itens) an.ambientes.itens.forEach(function (it) { if (CDh.pisoRemove(stH, it.id) && it.pts && it.pts.length >= 3) it.hachura = "piso"; }); } catch (eCD) { /* sem o piso hachurado: o resto da planta sai */ }
      }
      if (escala) est.escala = Math.max(1, Math.round(+escala));   /* a cópia com escala própria: anotação do tamanho certo nela */   /* o título é o do viewport */
      var exF = { titulo: "" };
      /* NÍVEL DE DETALHE / P6: a folha sai com as PENAS e as cores das linhas da vista (a tubulação em linha única na cor
         do sistema, como na tela) — sem isto a planta de instalações saía toda na mesma pena preta */
      /* JUNÇÃO 18/10/2026: só com a prévia ?previa=hidro — a P6 na folha muda a pena de TODA a planta (parede, porta, viga
         acima do corte); sem a prévia a folha sai como no master (e2e-bim-acima-corte, test-traco-tela) */
      var comHidroF = false; try { comHidroF = !!(global.BimPrevia && BimPrevia.hidro && BimPrevia.hidro()); } catch (eH) {}
      /* MEIO-TOM POR DISCIPLINA NA FOLHA (17/11/2026): a vista com disciplina escolhida (≠ Coordenação) sai SEMPRE com o meio-tom das outras disciplinas, com ou sem a prévia
         (hidro plena sobre arquitetura cinza, como a prancha de projeto). A vista de Coordenação segue exatamente como estava: só a prévia liga a P6 nela. */
      var comDiscF = false; try { var M6d = b2._p6 ? b2._p6() : null; comDiscF = !!(M6d && M6d.disciplinaDaFolha && M6d.disciplinaDaFolha(vistaId)); } catch (eDc) {}
      try { var M6 = b2._p6 ? b2._p6() : null; if ((comHidroF || comDiscF) && M6 && M6.extraSvg && bruto.p6Estilos) exF = M6.extraSvg(vistaId, bruto, exF) || exF; } catch (eP6) {}
      /* CORES POR CATEGORIA: a folha sai SEM as cores, a menos que a vista peça "imprimir com as cores" (js/bimcorescatui.js) */
      try { var cf = global.BimCoresCatUI ? global.BimCoresCatUI.paraImpressao(vistaId, bruto, exF) : null; if (cf) { an = b2._anotar(d, cf); an.linhasIfc = bruto.linhasIfc || []; } } catch (eCF) { exF = { titulo: "" }; }
      /* ARQUITETURA/ESTRUTURAL: o tubo sai dos DADOS (linhas, cortes, instalação desenhada) ANTES de desenhar — vale nos dois caminhos (com e sem a prévia P6) e a cota/enquadramento
         já não veem o tubo. As penas do pedido (arquitetura) também nos dois: o caminho comum agrupa por categoria (exF.porCategoria) para o SVG carregar o data-cat. */
      if (tagSI) an = this.semTuboDados(an);
      if (tagSI === "arquitetura") exF.porCategoria = true;
      var res = D.svg(an, est, exF);
      /* `def`: a vista COMO ESTAVA ao desenhar (a Prancha Viva tira a matriz dela: desenho e matriz sempre da mesma vista) */
      var svgV = tagSI ? this.semInstalacao(res.svg) : res.svg; if (tagSI === "arquitetura") svgV = this.penasArq(svgV);   /* arquitetura: as penas do pedido */   /* só a vista GERADA como arquitetura/estrutural (diálogo) vai sem tubulação; a padrão da vista não decide */
      var o = { vistaId: vistaId, nome: d.nome, tipo: d.tipo, dados: an, estilo: est, svg: svgV, vb: res.vb, pena: est.pena, penasPx: D.PENAS[est.pena], escala: est.escala, def: (function () { try { return clone(d); } catch (eDf) { return null; } })() };
      this._desenhos[chave] = o;
      return o;
    },
    /* a chave do desenho de UMA cópia: com escala própria a anotação (texto, cota, marca) sai do tamanho certo
       naquela escala — o desenho é refeito nela, não esticado */
    chaveVp: function (b) { return b && b.escalaPropria ? b.vistaId + "@" + b.escala : b.vistaId; },
    desenhoVp: function (b, refazer) { return this.desenho(b.vistaId, refazer, b.escalaPropria ? b.escala : undefined, b.semInst, b.convencao); },
    /* =====================================================================
     * VISTA 3D E ELEVAÇÃO NA FOLHA (16/11/2026, pedido do Rogério: "puxar para dentro da folha a vista 3D e as elevações, igual planta e corte")
     *   • ELEVAÇÃO (d2e-norte|sul|leste|oeste): o mesmo motor do corte, olhando de fora (js/bim2dui.js _defBase) — vetor em escala, como planta e corte.
     *   • VISTA 3D (d3:atual | d3:<id do ponto de vista salvo>): é IMAGEM por natureza (a cena 3D). Entra no quadro da folha com moldura e título, SEM escala de desenho
     *     (o título diz "SEM ESCALA"); a imagem é fotografada do modelo NO TAMANHO DO QUADRO a 300 dpi (PNG sem perda, no máximo 8192 px de lado) e guardada no IndexedDB
     *     (a folha recarrega igual); a vista SALVA se refaz do modelo a qualquer hora ("Atualizar vista 3D"). O PDF leva essa imagem sem reamostrar.
     * ===================================================================== */
    DPI_3D: 300, LADO_MAX_3D: 8192, ESCALA_NOMINAL_3D: 100,
    _chave3d: function (id) { return this.obraKey() + "|" + id; },
    _idb3d: function (id) { return "folha3d:" + this.obraKey() + ":" + String(id).replace(/^d3:/, ""); },
    _desenho3d: function (id) {
      var e = (this._d3 || {})[this._chave3d(id)];
      if (!e) { this._carregar3d(id); return null; }
      var N = this.ESCALA_NOMINAL_3D, W = e.wMm * N / 1000, H = e.hMm * N / 1000;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="d2-svg" data-d2-tipo="3d" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet"><image href="' + e.uri + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/></svg>';
      return { vistaId: id, nome: e.nome, tipo: "3d", svg: svg, vb: { x: 0, y: 0, w: W, h: H }, escala: N, pena: "", penasPx: {}, dados: null, estilo: {}, def: null, pxW: e.pxW, pxH: e.pxH, wMm: e.wMm, hMm: e.hMm };
    },
    /* a imagem guardada no navegador (IndexedDB) volta para a memória e a folha se pinta de novo */
    _carregar3d: function (id) {
      var self = this, k = this._chave3d(id); this._d3 = this._d3 || {}; this._d3Lendo = this._d3Lendo || {};
      if (this._d3Lendo[k] || !global.Idb) return;
      this._d3Lendo[k] = 1;
      Promise.resolve(global.Idb.get(this._idb3d(id))).then(function (v) {
        if (v && v.uri) { self._d3[k] = v; Object.keys(self._telas).forEach(function (t) { try { self.pintar(t); } catch (e) {} }); }
      })["catch"](function () {}).then(function () { delete self._d3Lendo[k]; });
    },
    _guardar3d: function (id, e) {
      this._d3 = this._d3 || {}; this._d3[this._chave3d(id)] = e;
      try { if (global.Idb) Promise.resolve(global.Idb.set(this._idb3d(id), e))["catch"](function () {}); } catch (x) {}
    },
    /* fotografa a vista 3D (a atual ou a salva) no tamanho wMm × hMm a 300 dpi → Promise<{uri,pxW,pxH,wMm,hMm,nome,dpi}> */
    capturar3d: function (id, wMm, hMm) {
      var self = this, BIM = global.BIM, raw = String(id).replace(/^d3:/, "");
      if (!BIM || !BIM.desenharQuadroEm) return Promise.reject(new Error("O visualizador 3D ainda não abriu: abra o modelo da obra."));
      var px = Math.max(64, Math.round(wMm / 25.4 * this.DPI_3D)), py = Math.round(px * hMm / wMm), lado = this.LADO_MAX_3D;
      if (Math.max(px, py) > lado) { var r = lado / Math.max(px, py); px = Math.round(px * r); py = Math.round(py * r); }
      var g = this.G(), v = null, antes = null, nome = "Vista 3D";
      try { antes = BIM.estadoVista ? BIM.estadoVista() : null; } catch (e0) {}
      if (raw !== "atual") { v = g && g._bimVistaDe ? g._bimVistaDe(raw) : null; if (!v) return Promise.reject(new Error("A vista 3D salva não existe mais.")); nome = v.nome; }
      var espera = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
      var p = Promise.resolve();
      if (v) p = p.then(function () { try { BIM.aplicarVista(v); } catch (e1) { throw new Error("Não consegui aplicar a vista 3D."); } return espera(450); });
      /* ENQUADRAR: o modelo ocupa o quadro (zoom to fit, na direção da câmera da vista); SEM a grade do chão, fundo branco */
      return p.then(function () {
        var cv = BIM.desenharQuadroEm("#ffffff", px, py, { semGrade: true, ajustar: true });
        if (!cv || !cv.width) throw new Error("O 3D não devolveu a imagem (modelo aberto?).");
        var uri = cv.toDataURL("image/png");
        return { uri: uri, pxW: cv.width, pxH: cv.height, wMm: wMm, hMm: hMm, nome: nome, dpi: Math.round(cv.width / (wMm / 25.4)) };
      }).then(function (r) { self._restaurar3d(antes); return r; }, function (e) { self._restaurar3d(antes); throw e; });
    },
    _restaurar3d: function (antes) {
      if (!antes || !global.BimVista || !global.BIM) return;
      try { BIM.aplicarVista(BimVista.vista({ nome: "_antes", completa: true, camera: antes.camera, cortes: antes.cortes, visibilidade: antes.visibilidade, aparencias: antes.aparencias, modelos: antes.modelos, estilo: antes.estilo, medidas: antes.medidas, cotaRede: antes.cotaRede })); } catch (e) {}
    },
    /* as vistas que a folha aceita além das plantas e cortes: as 4 elevações do modelo e as vistas 3D (a atual e as salvas) */
    vistasExtras: function () {
      var L = [], b2 = B2(), g = this.G();
      if (b2 && b2.DIRS_ELEV) b2.DIRS_ELEV.forEach(function (d) { var id = b2.idElevacao(d), df = b2.def(id); if (df) L.push({ id: id, nome: df.nome, tipo: "Elevação", escala: b2.estilo(id).escala }); });
      L.push({ id: "d3:atual", nome: "Vista 3D atual", tipo: "Vista 3D", escala: 0 });
      var sv = []; try { sv = g && g._bimVistaDaObra ? g._bimVistaDaObra() : []; } catch (e) {}
      arr(sv).forEach(function (v) { if (v && v.camera && !v.hid3d && !v.hidIso) L.push({ id: "d3:" + v.id, nome: v.nome, tipo: "Vista 3D", escala: 0 }); });
      return L;
    },
    /* o primeiro lugar LIVRE da área de desenho para um quadro w × h (mais o título de 12 mm embaixo), sem pisar em outro bloco; null = não há */
    lugarLivre: function (a, w, h) {
      var ar = a.geo.area, T = 12, M = 3, ocup = arr(a.folha.blocos).map(function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h + (b.tipo === "viewport" ? T : 0) }; });
      for (var y = ar.y + 2; y + h + T <= ar.y + ar.h + 0.01; y += 5) for (var x = ar.x + 2; x + w <= ar.x + ar.w + 0.01; x += 5) {
        var bate = ocup.some(function (o) { return x < o.x + o.w + M && x + w + M > o.x && y < o.y + o.h + M && y + h + T + M > o.y; });
        if (!bate) return { x: x, y: y };
      }
      return null;
    },
    /* garante o quadro INTEIRO dentro da área de desenho (título incluído) */
    _caber: function (id, ix) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b) return;
      var ar = a.geo.area, f = clone(a.folha), q = f.blocos[ix];
      q.x = Math.round(Math.max(ar.x, Math.min(q.x, ar.x + ar.w - q.w)) * 10) / 10; q.y = Math.round(Math.max(ar.y, Math.min(q.y, ar.y + ar.h - q.h - 12)) * 10) / 10;
      if (q.x !== b.x || q.y !== b.y) this.gravarFolha(a, f);
    },
    /* põe a vista 3D na folha: fotografa no tamanho do quadro (≈ 60% da área, proporção 3:2), grava e posiciona. → Promise<{ok}> */
    posicionar3d: function (id, vistaId, cx, cy) {
      var self = this, a = this.achar(id); if (!a) return Promise.resolve({ ok: false, erro: "Folha não encontrada." });
      var ar = a.geo.area, wMm = Math.round(Math.min(ar.w * 0.6, (ar.h - 14) * 1.5, 260)), hMm = Math.round(wMm / 1.5);
      if (cx == null || cy == null) {   /* sem ponto de soltura: o primeiro lugar livre; sem espaço, encolhe o quadro até caber */
        var sp = null; while (!(sp = this.lugarLivre(a, wMm, hMm)) && wMm > 80) { wMm = Math.round(wMm * 0.85); hMm = Math.round(wMm / 1.5); }
        if (sp) { cx = sp.x + wMm / 2; cy = sp.y + hMm / 2; }
      }
      status("Fotografando a vista 3D em " + this.DPI_3D + " dpi…");
      return this.capturar3d(vistaId, wMm, hMm).then(function (e) {
        self._guardar3d(vistaId, e);
        var a2 = self.achar(id), dz = self._desenho3d(vistaId);
        var todas = self.registros().map(function (r) { return PR().normalizar(r); });
        var r = PR().colocarViewport(a2.pr, a2.folha, { vistaId: vistaId, nome: e.nome, escala: self.ESCALA_NOMINAL_3D, caixa: { w: dz.vb.w, h: dz.vb.h }, cx: cx, cy: cy, repetir: true }, todas);
        if (!r.ok) { toast(r.erro, "aviso"); return r; }
        self.gravarFolha(a2, r.folha); self._caber(id, r.folha.blocos.length - 1); self._sel = { id: id, ix: r.folha.blocos.length - 1 };
        self.pintar(id); self._pintarProps();
        status(e.nome + " na folha: " + wMm + " × " + hMm + " mm, imagem " + e.pxW + " × " + e.pxH + " px (" + e.dpi + " dpi).");
        return r;
      }, function (er) { toast("Vista 3D: " + (er && er.message || er), "erro"); return { ok: false, erro: String(er && er.message || er) }; });
    },
    /* refaz a imagem de TODOS os quadros 3D das folhas dadas no tamanho atual deles (>= 300 dpi); sem modelo aberto, fica a imagem guardada. → Promise */
    garantir3d: function (itens) {
      var self = this, fila = [], vistos = {};
      arr(itens).forEach(function (a) { arr(a.folha.blocos).forEach(function (b) {
        if (b.tipo !== "viewport" || !/^d3:/.test(b.vistaId)) return;
        var k = b.vistaId, ex = vistos[k]; if (ex) { ex.w = Math.max(ex.w, b.w); ex.h = Math.max(ex.h, b.h); return; }
        vistos[k] = { id: k, w: b.w, h: b.h }; fila.push(vistos[k]);
      }); });
      var seq = Promise.resolve();
      fila.forEach(function (q) {
        seq = seq.then(function () {
          var e = (self._d3 || {})[self._chave3d(q.id)], dpi = e ? e.pxW / (q.w / 25.4) : 0;
          if (e && dpi >= self.DPI_3D - 1) return null;
          return self.capturar3d(q.id, q.w, q.h).then(function (n) { self._guardar3d(q.id, n); }, function () { return null; });   /* sem modelo: segue com a imagem guardada */
        });
      });
      return seq;
    },
    atualizar3d: function (id) {
      var self = this, a = this.achar(id); if (!a) return Promise.resolve(false);
      var vistos = {}; arr(a.folha.blocos).forEach(function (b) { if (b.tipo === "viewport" && /^d3:/.test(b.vistaId)) vistos[b.vistaId] = b; });
      var ids = Object.keys(vistos); if (!ids.length) { toast("Esta folha não tem vista 3D.", "aviso"); return Promise.resolve(false); }
      var seq = Promise.resolve();
      ids.forEach(function (v) { seq = seq.then(function () { return self.capturar3d(v, vistos[v].w, vistos[v].h).then(function (n) { self._guardar3d(v, n); }); }); });
      return seq.then(function () { self.pintar(id); toast("Vista 3D atualizada (" + self.DPI_3D + " dpi).", "ok"); return true; }, function (e) { toast("Vista 3D: " + (e && e.message || e), "erro"); return false; });
    },

    /* o quadro acompanha a escala e o tamanho da vista (o viewport É a vista); a cópia com escala própria
       segue a escala DELA */
    _sincronizar: function (a) {
      var self = this, mudou = false, f = clone(a.folha);
      f.blocos.forEach(function (b) {
        if (b.tipo !== "viewport") return;
        var dz = self.desenhoVp(b); if (!dz) return;
        var e = b.escalaPropria ? b.escala : dz.escala;
        var t = PR().tamanhoViewport({ w: dz.vb.w, h: dz.vb.h }, e, b.recorte);
        if (b.escala !== e || Math.abs(b.w - t.w) > 0.05 || Math.abs(b.h - t.h) > 0.05) { b.escala = e; b.w = t.w; b.h = t.h; mudou = true; }
      });
      if (mudou) { this.gravarFolha(a, f, true); return this.achar(this.idFolha(a.reg.id, a.folha.id)); }
      return a;
    },
    recursos: function (a, editor) {
      var self = this, rec = { imagens: {}, vistas: {}, viewports: {}, projeto: this.projeto(), editor: !!editor };
      a.folha.blocos.forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenhoVp(b); if (dz) rec.viewports[self.chaveVp(b)] = dz; } });
      try { rec.logo = global.Empresa && global.Empresa.logo ? global.Empresa.logo() : null; } catch (e) {}
      rec.empresa = this.empresaDados();   /* o carimbo lê nome, CNPJ, RT e registro do cadastro da conta */
      /* as folhas PRONTAS geradas nesta sessão (ex.: "Gerar pranchas" do hidrossanitário): a imagem inteira da folha */
      var ext = this._imagensExternas || {}; Object.keys(ext).forEach(function (k) { rec.imagens[k] = ext[k]; });
      return rec;
    },
    /* a barra da folha: texto, zoom e o aviso da vista ativada */
    _barra: function (id) {
      var t = this._telas[id], at = t && t.ativa, pct = t && t.escalaTela ? Math.round(t.escalaTela * 100) : 100;
      var ferr = this._ferr && this._ferr.id === id ? this._ferr.qual : "";
      return '<div class="pv-barra" data-pv-barra="1">' +
        (at ? '<span class="pv-barra-ativa">Vista ativada — arraste para enquadrar · roda amplia · <b>Esc</b> ou 2 cliques fora para sair</span><button type="button" data-pv-acao="sair">Sair da vista</button>'
            : '<button type="button" data-pv-acao="texto"' + (ferr === "texto" ? ' class="on"' : "") + ' title="Texto na folha: clique no papel onde ele começa">A&#8202;<small>Texto</small></button>') +
        '<span class="pv-barra-sep"></span><button type="button" data-pv-acao="menos" title="Afastar (roda do mouse)">−</button><button type="button" data-pv-acao="ajustar" title="Folha inteira na tela" data-pv-zoom="1">' + pct + '%</button><button type="button" data-pv-acao="mais" title="Aproximar (roda do mouse)">+</button></div>';
    },
    pintar: function (id) {
      var t = this._telas[id], a = this.achar(id); if (!t || !t.el) return false;
      if (!a) { t.el.innerHTML = '<div class="d2-vazio">Esta folha não existe mais nesta obra.</div>'; return false; }
      a = this._sincronizar(a);
      var P = a.geo.papel, html = UI2().folha(a.pr, a.folha, this.recursos(a, true), a.geo);
      var dica = a.folha.blocos.length || a.folha.imagemInteira ? "" : '<div class="pv-dica">Arraste uma planta ou um corte do Navegador para a folha (ou Vista › Posicionar vista).</div>';
      var sl = t.el.scrollLeft, sc = t.el.scrollTop;
      t.el.innerHTML = this._barra(id) + dica + '<div class="pv-papel-wrap"><div class="pv-papel' + (t.ativa ? " pv-ativa" : "") + '" style="width:' + P.w + 'mm;height:' + P.h + 'mm">' + html + "</div></div>";
      t.papel = t.el.querySelector(".pv-papel"); t.P = P;
      if (t.ativa) { var ba = t.el.querySelector('[data-pv-bloco="' + t.ativa.ix + '"]'); if (ba) ba.setAttribute("data-pv-on", "1"); else t.ativa = null; }
      var sel = this._sel && this._sel.id === id ? this._sel.ix : -1;
      if (sel >= 0) this._marcarSel(id, sel);
      this._ajustar(id);
      t.el.scrollLeft = sl; t.el.scrollTop = sc;
      return true;
    },
    /* seleção: contorno + (viewport fora da vista ativada) a alça do canto para recortar */
    _marcarSel: function (id, ix) {
      var t = this._telas[id]; if (!t || !t.el) return;
      [].forEach.call(t.el.querySelectorAll("[data-pv-alca]"), function (e) { e.parentNode.removeChild(e); });
      [].forEach.call(t.el.querySelectorAll("[data-pv-bloco]"), function (e) { if (+e.getAttribute("data-pv-bloco") === ix) e.setAttribute("data-pv-sel", "1"); else e.removeAttribute("data-pv-sel"); });
      var b = t.el.querySelector('[data-pv-bloco="' + ix + '"][data-pv-vp]');
      if (b && !t.ativa) { var h = document.createElement("div"), lado = 12 / (t.escalaTela || 1); h.setAttribute("data-pv-alca", "1");
        /* a alça tem 12 px NA TELA em qualquer zoom (em mm ela sumia com a folha inteira na tela) */
        h.style.width = h.style.height = lado + "px"; h.style.right = h.style.bottom = (-lado / 2) + "px"; h.style.borderWidth = (2 / (t.escalaTela || 1)) + "px"; h.title = "Puxe para recortar a vista (o quadro muda, a escala fica)"; b.appendChild(h); }
    },
    _ajustar: function (id) {
      var t = this._telas[id]; if (!t || !t.papel || !t.P) return;
      var W = t.el.clientWidth || 800, H = t.el.clientHeight || 560, pw = t.P.w * MM_PX, ph = t.P.h * MM_PX;
      var f = t.zoom || Math.max(0.05, Math.min((W - 32) / pw, (H - 70) / ph));
      t.escalaTela = f;
      t.papel.style.transform = "scale(" + f + ")";
      /* ampliada, a folha ganha meia tela de folga em volta: o ponto embaixo do mouse fica parado no zoom e o pan
         chega à borda (centrada com "margin:auto" ela pulava para o lado a cada passo da roda) */
      var w = t.el.querySelector(".pv-papel-wrap"); if (w) { w.style.width = Math.ceil(pw * f) + "px"; w.style.height = Math.ceil(ph * f) + "px"; w.style.margin = t.zoom ? Math.round(H * 0.5) + "px " + Math.round(W * 0.5) + "px" : "0 auto"; }
      var z = t.el.querySelector("[data-pv-zoom]"); if (z) z.textContent = Math.round(f * 100) + "%";
      var al = t.el.querySelector("[data-pv-alca]"); if (al) { var lado = 12 / f; al.style.width = al.style.height = lado + "px"; al.style.right = al.style.bottom = (-lado / 2) + "px"; al.style.borderWidth = (2 / f) + "px"; }
    },
    /* ZOOM da folha (roda do mouse / − + ): o ponto do papel embaixo do cursor fica parado */
    zoomTela: function (id, fator, cx, cy) {
      var t = this._telas[id]; if (!t || !t.papel || !t.P) return null;
      var c = t.el, rc = c.getBoundingClientRect();
      if (!isFinite(cx)) { cx = rc.left + rc.width / 2; cy = rc.top + rc.height / 2; }
      var r = t.papel.getBoundingClientRect(), ux = (cx - r.left) / (r.width || 1), uy = (cy - r.top) / (r.height || 1);
      var f0 = t.escalaTela || 1, f1 = Math.max(0.05, Math.min(12, f0 * fator));
      t.zoom = f1; this._ajustar(id);
      var r2 = t.papel.getBoundingClientRect();
      c.scrollLeft += (r2.left + ux * r2.width) - cx; c.scrollTop += (r2.top + uy * r2.height) - cy;
      return f1;
    },
    zoomAjustar: function (id) { var t = this._telas[id]; if (!t) return; t.zoom = null; this._ajustar(id); t.el.scrollLeft = 0; t.el.scrollTop = 0; },
    /* ponto da tela → mm de papel */
    _mm: function (id, ev) {
      var t = this._telas[id]; if (!t || !t.papel || !t.P) return null;
      var r = t.papel.getBoundingClientRect(); if (!r.width) return null;
      return { x: (ev.clientX - r.left) / r.width * t.P.w, y: (ev.clientY - r.top) / r.height * t.P.h };
    },
    _ligar: function (c, id) {
      var self = this, arr0 = null, pan = null;
      c.addEventListener("dragover", function (ev) {
        var tipos = ev.dataTransfer ? [].slice.call(ev.dataTransfer.types || []) : [];
        if (tipos.indexOf(TIPO_ARRASTE) >= 0 || tipos.indexOf("text/plain") >= 0) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = "copy"; } catch (e) {} }
      });
      c.addEventListener("drop", function (ev) {
        ev.preventDefault();
        var v = ""; try { v = ev.dataTransfer.getData(TIPO_ARRASTE) || ev.dataTransfer.getData("text/plain"); } catch (e) { v = ""; }
        var p = self._mm(id, ev);
        if (v && p) self.posicionar(id, v, p.x, p.y);
      });
      /* ⚠ `passive:false`: sem ele o preventDefault não vale e a roda rolava a página em vez de ampliar */
      c.addEventListener("wheel", function (ev) {
        if (self._editor) return;
        ev.preventDefault();
        self.zoomTela(id, ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.clientX, ev.clientY);
      }, { passive: false });
      c.addEventListener("click", function (ev) {
        var bt = ev.target && ev.target.closest ? ev.target.closest("[data-pv-acao]") : null; if (!bt) return;
        var q = bt.getAttribute("data-pv-acao");
        if (q === "texto") { self._ferr = self._ferr && self._ferr.qual === "texto" ? null : { id: id, qual: "texto" }; self._pintarBarra(id); if (self._ferr) status("Texto: clique no papel onde o texto começa (Esc cancela)."); }
        else if (q === "mais") self.zoomTela(id, 1.25);
        else if (q === "menos") self.zoomTela(id, 1 / 1.25);
        else if (q === "ajustar") self.zoomAjustar(id);
        else if (q === "sair") self.desativarNaFolha(id);
      });
      c.addEventListener("pointerdown", function (ev) {
        /* editor de texto aberto: o clique fora só GRAVA o texto (não começa arraste com a folha prestes a repintar) */
        if (self._editor && !(ev.target && ev.target.closest && ev.target.closest(".pv-edit"))) { ev.preventDefault(); self._fecharEditor(); return; }
        if (ev.target && ev.target.closest && (ev.target.closest(".pv-barra") || ev.target.closest(".pv-menu") || ev.target.closest(".pv-edit"))) return;
        self._fecharMenu();
        try { c.focus({ preventScroll: true }); } catch (eF) {}
        var t = self._telas[id], p = self._mm(id, ev);
        function comecarPan() { pan = { x: ev.clientX, y: ev.clientY, sl: c.scrollLeft, st: c.scrollTop }; try { c.setPointerCapture(ev.pointerId); } catch (e) {} }
        /* botão do meio = arrastar a folha (pan), em qualquer lugar */
        if (ev.button === 1) { ev.preventDefault(); comecarPan(); return; }
        if (ev.button !== 0) return;
        if (self._ferr && self._ferr.id === id && self._ferr.qual === "texto" && p) { ev.preventDefault(); self._ferr = null; self.novoTexto(id, p.x, p.y); return; }
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-pv-bloco]") : null;
        var ix = b ? +b.getAttribute("data-pv-bloco") : -1, a = self.achar(id), bl = a && ix >= 0 ? a.folha.blocos[ix] : null;
        /* VISTA ATIVADA: arrastar dentro dela desloca o recorte; fora, arrasta a folha */
        if (t && t.ativa) {
          if (bl && ix === t.ativa.ix && p) { arr0 = { modo: "recorte", ix: ix, x0: p.x, y0: p.y, dx: 0, dy: 0, bl: bl, svg: b.querySelector("svg.pv-vp") }; try { c.setPointerCapture(ev.pointerId); } catch (e1) {} }
          else comecarPan();
          return;
        }
        if (ev.target.closest && ev.target.closest("[data-pv-alca]") && bl && p) {
          arr0 = { modo: "tam", ix: ix, x0: p.x, y0: p.y, dx: 0, dy: 0, bl: bl, el: b }; try { c.setPointerCapture(ev.pointerId); } catch (e2) {} ev.preventDefault(); return;
        }
        var cr = ev.target.closest ? ev.target.closest("[data-pv-cr]") : null;
        if (cr) { ev.preventDefault(); self.editarCampoCarimbo(id, cr.getAttribute("data-pv-cr")); return; }
        if (!b) { self.selecionar(id, -1); comecarPan(); return; }
        self.selecionar(id, ix);
        if (ev.target.closest("[data-pv-escala]") && bl && bl.tipo === "viewport") { ev.preventDefault(); self.menuEscala(id, ix, ev.clientX, ev.clientY); return; }
        if (bl && p) { arr0 = { modo: "mover", ix: ix, x0: p.x, y0: p.y, bx: bl.x, by: bl.y, el: b, dx: 0, dy: 0 }; try { c.setPointerCapture(ev.pointerId); } catch (e3) {} }
      });
      c.addEventListener("pointermove", function (ev) {
        if (pan) { c.scrollLeft = pan.sl - (ev.clientX - pan.x); c.scrollTop = pan.st - (ev.clientY - pan.y); return; }
        if (!arr0) return; var p = self._mm(id, ev); if (!p) return;
        arr0.dx = p.x - arr0.x0; arr0.dy = p.y - arr0.y0;
        if (arr0.modo === "mover") { arr0.el.style.left = (arr0.bx + arr0.dx) + "mm"; arr0.el.style.top = (arr0.by + arr0.dy) + "mm"; }
        else if (arr0.modo === "tam") { arr0.el.style.width = Math.max(10, arr0.bl.w + arr0.dx) + "mm"; arr0.el.style.height = Math.max(10, arr0.bl.h + arr0.dy) + "mm"; }
        else if (arr0.modo === "recorte" && arr0.svg) {
          var dz = self.desenhoVp(arr0.bl), nb = dz ? PR().deslocarRecorte(arr0.bl, dz.vb, arr0.dx, arr0.dy) : null;
          if (nb) { var r = nb.recorte; arr0.svg.setAttribute("viewBox", r.x0 + " " + r.y0 + " " + (r.x1 - r.x0) + " " + (r.y1 - r.y0)); }
        }
      });
      c.addEventListener("pointerup", function () {
        if (pan) { pan = null; return; }
        if (!arr0) return; var m = arr0; arr0 = null;
        if (Math.abs(m.dx) < 0.5 && Math.abs(m.dy) < 0.5) return;
        if (m.modo === "mover") self.moverViewport(id, m.ix, m.bx + m.dx, m.by + m.dy);
        else if (m.modo === "tam") self.recortar(id, m.ix, m.bl.w + m.dx, m.bl.h + m.dy);
        else if (m.modo === "recorte") self.enquadrar(id, m.ix, m.dx, m.dy);
      });
      /* dois cliques: no viewport = ATIVAR a vista na folha; no texto = editar; fora da vista ativada = sair */
      c.addEventListener("dblclick", function (ev) {
        var t = self._telas[id];
        /* ⚠ o alvo pelo PONTO, não `ev.target`: o 1º clique pegou o ponteiro (setPointerCapture do arraste) e o
           navegador manda o dblclick para a tela inteira — "dois cliques na vista" não ativava nada */
        var alvo = null; try { alvo = document.elementFromPoint(ev.clientX, ev.clientY); } catch (eP) { alvo = null; }
        alvo = alvo || ev.target;
        var b = alvo && alvo.closest ? alvo.closest("[data-pv-bloco]") : null, ix = b ? +b.getAttribute("data-pv-bloco") : -1;
        if (t && t.ativa) { if (ix !== t.ativa.ix) self.desativarNaFolha(id); return; }
        if (!b) return;
        if (b.hasAttribute("data-pv-vp")) self.ativarNaFolha(id, ix);
        else if (b.getAttribute("data-pv-tipo") === "texto") self.editarTexto(id, ix);
      });
      c.addEventListener("keydown", function (ev) {
        var tg = ev.target, digit = tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.isContentEditable);
        if (digit) return;
        var t = self._telas[id];
        if (ev.key === "Escape") {
          if (self._fecharMenu()) { ev.preventDefault(); ev.stopPropagation(); return; }
          if (self._ferr) { self._ferr = null; self._pintarBarra(id); ev.preventDefault(); ev.stopPropagation(); return; }
          if (t && t.ativa) { self.desativarNaFolha(id); ev.preventDefault(); ev.stopPropagation(); return; }
        }
        if ((ev.key === "Delete" || ev.key === "Backspace") && self._sel && self._sel.id === id && !(t && t.ativa)) { ev.preventDefault(); self.removerSelecionado(); }
      });
      c.tabIndex = 0;
    },
    _pintarBarra: function (id) { var t = this._telas[id], b = t && t.el && t.el.querySelector(".pv-barra"); if (!b) return; var d = document.createElement("div"); d.innerHTML = this._barra(id); b.parentNode.replaceChild(d.firstChild, b); this._ajustar(id); },

    /* --------------------------------------------- viewport: pôr, mover, tirar */
    posicionar: function (id, vistaId, cx, cy) {
      if (/^d3:/.test(String(vistaId))) return this.posicionar3d(id, vistaId, cx, cy);
      var a = this.achar(id); if (!a) return { ok: false, erro: "Folha não encontrada." };
      var b2 = B2(); if (!b2 || !b2.ehVista2d(vistaId)) { toast("Arraste uma planta, um corte, uma elevação ou uma vista 3D do Navegador.", "aviso"); return { ok: false, erro: "não é vista 2D" }; }
      var dz = this.desenho(vistaId, true);
      if (!dz) { toast("Não consegui desenhar a vista: abra o modelo da obra primeiro.", "erro"); return { ok: false, erro: "sem desenho" }; }
      var todas = this.registros().map(function (r) { return PR().normalizar(r); });
      /* a folha montada à mão aceita a MESMA vista mais de uma vez (cada cópia com escala e recorte próprios) */
      /* ELEVAÇÃO: a escala padrão (1:50) não cabe na folha para a casa inteira — entra na MAIOR escala padrão que cabe na área de desenho (a cópia fica com escala própria) */
      var escE = dz.escala;
      if (/^d2e-/.test(String(vistaId))) {
        var ar0 = a.geo.area, cand = [10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000], achou = false;
        for (var ci = 0; ci < cand.length && !achou; ci++) {
          var wE = dz.vb.w * 1000 / cand[ci], hE = dz.vb.h * 1000 / cand[ci];
          if (wE > ar0.w - 4 || hE + 12 > ar0.h - 4) continue;
          var sp = (cx == null || cy == null) ? this.lugarLivre(a, wE, hE) : { x: cx - wE / 2, y: cy - hE / 2 };
          if (sp) { escE = cand[ci]; if (cx == null || cy == null) { cx = sp.x + wE / 2; cy = sp.y + hE / 2; } achou = true; }
        }
      }
      var r = PR().colocarViewport(a.pr, a.folha, { vistaId: vistaId, nome: dz.nome, escala: escE, caixa: { w: dz.vb.w, h: dz.vb.h }, cx: cx, cy: cy, repetir: true }, todas);
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      this.gravarFolha(a, r.folha);
      var ixE = r.folha.blocos.length - 1;
      if (escE !== dz.escala) this.trocarEscala(id, ixE, escE, true);
      this._caber(id, ixE); var a3 = this.achar(id); if (a3) { r.folha = a3.folha; r.bloco = a3.folha.blocos[ixE]; }
      /* aviso único, só se DEPOIS do ajuste ainda sai da área */
      if (a3 && this._foraDaArea(a3, a3.folha, ixE)) toast("Nesta escala parte da vista sai da área de desenho: arraste ou recorte (alça do canto).", "aviso");
      this._sel = { id: id, ix: r.folha.blocos.length - 1 };
      this.pintar(id); this._pintarProps();
      status("Vista posicionada: " + dz.nome + " · 1:" + dz.escala + " · detalhe " + r.bloco.numeroDetalhe + ". Clique no 1:" + dz.escala + " do título para trocar a escala desta cópia.");
      if (r.aviso) toast(r.aviso, "aviso");
      return r;
    },
    /* mover qualquer bloco (viewport, texto, tabela) — o eixo guia prende */
    moverViewport: function (id, ix, x, y) {
      var a = this.achar(id); if (!a || !a.folha.blocos[ix]) return false;
      var f = clone(a.folha), b = f.blocos[ix], eg = f.eixoGuia, ar = a.geo.area;
      if (eg) { x = PR().ajustarEixo(x, eg.espaco, ar.x); y = PR().ajustarEixo(y, eg.espaco, ar.y); }
      b.x = Math.round(x * 10) / 10; b.y = Math.round(y * 10) / 10;
      this.gravarFolha(a, f); this.pintar(id);
      if (this._foraDaArea(a, f, ix)) toast("Parte do bloco ficou fora da área de desenho (sai cortado na impressão).", "aviso");
      return true;
    },
    /* o aviso "fora da área" só do bloco que mexeu, com a área do carimbo DESTE conjunto (sem o modelo de
       carimbo a conta usava a área do carimbo simples e avisava à toa; e um bloco vizinho fora avisava de novo a cada passo) */
    _foraDaArea: function (a, f, ix) {
      var pr = clone(a.pr); pr.folhas = [f];
      return PR().conferir(pr).fora.some(function (q) { return q.bloco === ix; });
    },
    /* troca a escala de UMA cópia (o 1:50 do título): o desenho é refeito nessa escala e o quadro muda em volta do centro */
    trocarEscala: function (id, ix, escala, silencioso) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "viewport") return false;
      var f = clone(a.folha), nb;
      if (escala === "vista") {
        var dzV = this.desenho(b.vistaId); if (!dzV) return false;
        nb = PR().escalaViewport(b, dzV.vb, dzV.escala); if (!nb) return false; delete nb.escalaPropria;
      } else {
        var e = Math.round(+escala); if (!(e >= 1)) return false;
        var dz = this.desenho(b.vistaId, false, e); if (!dz) return false;
        nb = PR().escalaViewport(b, dz.vb, e); if (!nb) return false;
      }
      f.blocos[ix] = PR().bloco(nb);
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      status("Escala da cópia " + (b.numeroDetalhe || "") + ": 1:" + f.blocos[ix].escala + (escala === "vista" ? " (a da vista)" : "") + ".");
      /* o aviso só vale DEPOIS do ajuste final (16/11/2026: ao puxar uma elevação para a folha o aviso saía antes de _caber, mesmo a vista terminando dentro da área) */
      if (!silencioso && this._foraDaArea(a, f, ix)) toast("Nesta escala parte da vista sai da área de desenho: arraste ou recorte (alça do canto).", "aviso");
      return true;
    },
    menuEscala: function (id, ix, cx, cy) {
      var t = this._telas[id], a = this.achar(id), b = a && a.folha.blocos[ix]; if (!t || !b) return null;
      this._fecharMenu();
      var self = this, dz = this.desenho(b.vistaId), ev0 = dz ? dz.escala : b.escala, m = document.createElement("div");
      m.className = "pv-menu"; m.setAttribute("data-pv-menu", "1");
      m.innerHTML = '<div class="pv-menu-tit">Escala desta cópia</div>' + PR().ESCALAS_VISTA.filter(function (e) { return e >= 10 && e <= 500; }).map(function (e) {
        return '<button type="button" data-pv-esc="' + e + '"' + (e === b.escala ? ' class="on"' : "") + ">1:" + e + "</button>";
      }).join("") + '<button type="button" data-pv-esc="vista" class="pv-menu-vista">A da vista (1:' + ev0 + ")</button>";
      var rc = t.el.getBoundingClientRect();
      m.style.left = (cx - rc.left + t.el.scrollLeft) + "px"; m.style.top = (cy - rc.top + t.el.scrollTop + 6) + "px";
      t.el.appendChild(m); this._menu = m;
      /* perto da borda de baixo/direita o menu abre para cima/esquerda (cortado ele escondia "A da vista") */
      var rm = m.getBoundingClientRect();
      if (rm.bottom > rc.bottom - 4) m.style.top = Math.max(t.el.scrollTop + 4, cy - rc.top + t.el.scrollTop - rm.height - 6) + "px";
      if (rm.right > rc.right - 4) m.style.left = Math.max(t.el.scrollLeft + 4, cx - rc.left + t.el.scrollLeft - rm.width) + "px";
      m.addEventListener("click", function (ev) { var q = ev.target.closest("[data-pv-esc]"); if (!q) return; var v = q.getAttribute("data-pv-esc"); self._fecharMenu(); self.trocarEscala(id, ix, v === "vista" ? "vista" : +v); });
      return m;
    },
    _fecharMenu: function () { var m = this._menu; this._menu = null; if (m && m.parentNode) { m.parentNode.removeChild(m); return true; } return false; },
    /* a alça do canto: o quadro muda (mm) e o recorte acompanha na escala da cópia */
    recortar: function (id, ix, w, h) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "viewport") return false;
      var dz = this.desenhoVp(b); if (!dz) return false;
      var f = clone(a.folha); f.blocos[ix] = PR().bloco(PR().redimensionarViewport(b, dz.vb, w, h));
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      status("Recorte da cópia " + (b.numeroDetalhe || "") + ": " + Math.round(f.blocos[ix].w) + " × " + Math.round(f.blocos[ix].h) + " mm.");
      return true;
    },
    /* vista ativada: o desenho andou dentro do quadro (dx, dy em mm de papel) */
    enquadrar: function (id, ix, dx, dy) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "viewport") return false;
      var dz = this.desenhoVp(b); if (!dz) return false;
      var f = clone(a.folha); f.blocos[ix] = PR().bloco(PR().deslocarRecorte(b, dz.vb, dx, dy));
      this.gravarFolha(a, f); this.pintar(id);
      return true;
    },
    tirarRecorte: function (id, ix) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "viewport") return false;
      var f = clone(a.folha); f.blocos[ix].recorte = null;
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      return true;
    },
    /* dois cliques no viewport: a vista ATIVA na própria folha — o resto apaga, a tela amplia nela;
       sair volta à escala da tela de antes */
    ativarNaFolha: function (id, ix) {
      var t = this._telas[id], a = this.achar(id), b = a && a.folha.blocos[ix]; if (!t || !b || b.tipo !== "viewport") return false;
      t.ativa = { ix: ix, zoom: t.zoom || null, sl: t.el.scrollLeft, st: t.el.scrollTop };
      this._sel = { id: id, ix: ix };
      this.pintar(id);
      var W = t.el.clientWidth || 800, H = t.el.clientHeight || 560, f = Math.max(0.05, Math.min(12, Math.min((W - 60) / (b.w * MM_PX), (H - 110) / ((b.h + 14) * MM_PX))));
      t.zoom = f; this._ajustar(id);
      var el = t.el.querySelector('[data-pv-bloco="' + ix + '"]');
      if (el) { var r = el.getBoundingClientRect(), rc = t.el.getBoundingClientRect(); t.el.scrollLeft += (r.left + r.width / 2) - (rc.left + rc.width / 2); t.el.scrollTop += (r.top + r.height / 2) - (rc.top + rc.height / 2); }
      status("Vista ativada: " + (b.tituloVista || "") + ". Arraste para enquadrar; Esc sai.");
      return true;
    },
    desativarNaFolha: function (id) {
      var t = this._telas[id]; if (!t || !t.ativa) return false;
      var v = t.ativa; t.ativa = null; t.zoom = v.zoom;
      this.pintar(id);
      t.el.scrollLeft = v.sl; t.el.scrollTop = v.st;
      status("Vista desativada.");
      return true;
    },

    /* --------------------------------------------- texto livre na folha */
    /* o editor em cima do papel (em mm: amplia junto com a folha). fim(valor|null) */
    _editorEm: function (id, x, y, w, h, valor, multi, fsMm, fim) {
      var t = this._telas[id]; if (!t || !t.papel) return null;
      this._fecharEditor();
      var self = this, e = document.createElement(multi ? "textarea" : "input");
      e.className = "pv-edit"; e.value = valor || ""; e.spellcheck = false;
      e.style.left = x + "mm"; e.style.top = y + "mm"; e.style.width = Math.max(20, w) + "mm"; e.style.height = Math.max(fsMm * 1.6, h) + "mm"; e.style.fontSize = fsMm + "mm";
      var feito = false;
      function acabar(ok) { if (feito) return; feito = true; var v = e.value; self._editor = null; if (e.parentNode) e.parentNode.removeChild(e); try { t.el.focus({ preventScroll: true }); } catch (eF) {} fim(ok ? v : null); }
      e.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Escape") { ev.preventDefault(); acabar(false); }
        else if (ev.key === "Enter" && (!multi || !ev.shiftKey)) { ev.preventDefault(); acabar(true); }
      });
      e.addEventListener("blur", function () { acabar(true); });
      t.papel.appendChild(e); this._editor = { el: e, acabar: acabar };
      try { e.focus(); e.select(); } catch (eS) {}
      return e;
    },
    _fecharEditor: function () { var ed = this._editor; if (ed) ed.acabar(true); },
    novoTexto: function (id, x, y) {
      var self = this; this._pintarBarra(id);
      return this._editorEm(id, x, y, 60, 6, "", true, 2.5 / 0.716, function (v) {
        if (v == null || !String(v).trim()) { status("Texto cancelado."); return; }
        self.criarTexto(id, x, y, String(v).split(/\r?\n/));
      });
    },
    criarTexto: function (id, x, y, linhas, alt) {
      var a = this.achar(id); if (!a) return null;
      var f = clone(a.folha), b = PR().blocoTexto(linhas, x, y, alt || 2.5); if (!b) return null;
      f.blocos.push(b);
      this.gravarFolha(a, f); this._sel = { id: id, ix: f.blocos.length - 1 }; this.pintar(id); this._pintarProps();
      status("Texto na folha (2 cliques edita; arraste move; Delete apaga).");
      return b;
    },
    editarTexto: function (id, ix) {
      var self = this, a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "texto") return null;
      var fs = (b.alt > 0 ? b.alt : 2.82 * 0.716) / 0.716;
      return this._editorEm(id, b.x, b.y, b.w + 10, b.h + 4, (b.linhas || []).join("\n"), true, fs, function (v) {
        if (v == null) return;
        self.mudarTexto(id, ix, String(v).split(/\r?\n/));
      });
    },
    mudarTexto: function (id, ix, linhas) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "texto") return false;
      var f = clone(a.folha);
      if (!linhas.join("").trim()) { f.blocos.splice(ix, 1); this._sel = null; }
      else { var nb = PR().blocoTexto(linhas, b.x, b.y, b.alt > 0 ? b.alt : 2.5); if (b.negrito) nb.negrito = true; f.blocos[ix] = nb; }
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      return true;
    },
    _mudarBlocoTexto: function (id, ix, campo, valor) {
      var a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b || b.tipo !== "texto") return false;
      var f = clone(a.folha), alt = campo === "alt" ? Math.max(1, Math.min(20, +valor || 2.5)) : (b.alt > 0 ? b.alt : 2.5);
      var nb = PR().blocoTexto(b.linhas, b.x, b.y, alt); if (campo === "negrito" ? !!valor : b.negrito) nb.negrito = true;
      f.blocos[ix] = nb; this.gravarFolha(a, f); this.pintar(id);
      return true;
    },

    /* --------------------------------------------- carimbo: clicar no campo e digitar */
    valorCampoCarimbo: function (a, campo) {
      var cf = PR().CAMPOS_CARIMBO_FOLHA[campo];
      if (cf) { var pm = PR().mapaParametros(a.pr, a.folha, this.projeto()); return campo === "data" ? (pm.SHEET_ISSUE_DATE || "") : (campo === "codigo" ? (pm.SHEET_NUMBER || "") : (a.folha.conteudo || "")); }
      var c = a.pr.carimbo || {};
      if (campo === "contratante") return c.contratante || "";
      return c[campo] || "";
    },
    editarCampoCarimbo: function (id, campo) {
      var self = this, a = this.achar(id), t = this._telas[id]; if (!a || !t) return null;
      if (!PR().CAMPOS_CARIMBO_FOLHA[campo] && !PR().CAMPOS_CARIMBO_CONJ[campo]) return null;
      var L = PR().carimboRA(a.pr, a.folha, this.projeto(), this.empresaDados(), a.geo, {}), z = (L.zonas || []).filter(function (q) { return q.campo === campo; })[0]; if (!z) return null;
      status(PR().CAMPOS_CARIMBO_CONJ[campo] ? "Carimbo: este campo vale para TODAS as folhas do conjunto. Enter grava, Esc cancela." : "Carimbo: este campo é só desta folha. Enter grava, Esc cancela.");
      return this._editorEm(id, L.x + z.x, L.y + z.y, z.w, z.h, this.valorCampoCarimbo(a, campo), false, Math.max(2, z.h * 0.55), function (v) {
        if (v == null) return;
        self.mudarCampoCarimbo(id, campo, v);
      });
    },
    mudarCampoCarimbo: function (id, campo, valor) {
      var a = this.achar(id); if (!a) return false;
      var cf = PR().CAMPOS_CARIMBO_FOLHA[campo], v = String(valor == null ? "" : valor).trim();
      if (cf) {
        if (v === String(this.valorCampoCarimbo(a, campo))) return false;
        var f = clone(a.folha); f[cf] = v; this.gravarFolha(a, f); this.pintar(id); this._renomearAbas(); this._pintarProps();
        return true;
      }
      if (PR().CAMPOS_CARIMBO_CONJ[campo]) { if (v === String(this.valorCampoCarimbo(a, campo))) return false; return this.mudarCarimbo(id, campo, v); }
      return false;
    },

    /* --------------------------------------------- desfazer / refazer (Ctrl+Z / Ctrl+Y na aba da folha) */
    abaAtiva: function () { try { var g = this.G(), st = g && g._bimVxEst && g._bimVxEst(); return !!(st && this.ehFolha(st.ativa) && this._telas[st.ativa]); } catch (e) { return false; } },
    _volta: function (de, para, rot) {
      var obraK = this._conferirObra();
      de = de === "pilha" ? this._pilha : this._refazerP; para = para === "pilha" ? this._pilha : this._refazerP;
      var p = de.pop(), self = this; if (!p || !global.Store) return false;
      if (p.obra !== obraK) { this._pilha = []; this._refazerP = []; return false; }
      var atual = this.registros().filter(function (x) { return String(x.id) === String(p.regId); })[0];
      /* o conjunto foi apagado: descarta (gravar aqui RECRIAVA o conjunto apagado) */
      if (!atual) { status("Esse passo era de um conjunto de folhas que não existe mais."); return false; }
      var porId = {}; arr(atual.folhas).forEach(function (f) { porId[f.id] = f; });
      var ids = Object.keys(p.folhas), marcas = this._marcas || {};
      var sumiu = ids.some(function (k) { return !porId[k]; });
      var porFora = ids.some(function (k) { return porId[k] && marcas[p.regId + "|" + k] !== undefined && self._jsonF(porId[k]) !== marcas[p.regId + "|" + k]; }) ||
        (p.carimbo !== undefined && marcas[p.regId + "|carimbo"] !== undefined && this._jsonF(atual.carimbo || null) !== marcas[p.regId + "|carimbo"]);
      if (sumiu || porFora) {
        /* mudaram por fora (outro painel, Gerar pranchas, outro aparelho): zera o desfazer DESTE conjunto, não sobrescreve */
        var tira = function (q) { return q.regId !== p.regId; };
        this._pilha = this._pilha.filter(tira); this._refazerP = this._refazerP.filter(tira);
        toast(sumiu ? "A folha desse passo foi apagada: o desfazer dela foi zerado." : "A folha foi mudada fora deste editor: o desfazer dela foi zerado para não apagar a mudança.", "aviso");
        return false;
      }
      var inv = { obra: obraK, regId: p.regId, folhas: {} };
      ids.forEach(function (k) { inv.folhas[k] = clone(porId[k]); });
      if (p.carimbo !== undefined) inv.carimbo = clone(atual.carimbo || null);
      var novo = clone(atual);
      novo.folhas = arr(novo.folhas).map(function (f) { return p.folhas[f.id] ? clone(p.folhas[f.id]) : f; });
      if (p.carimbo !== undefined) novo.carimbo = clone(p.carimbo);
      var r = global.Store.salvar(this.empresa(), "bim_pranchas", novo);
      if (!r) return false;
      this._marcar(r); para.push(inv); Object.keys(this._telas).forEach(function (k) { var t = self._telas[k]; if (t && t.ativa) t.ativa = null; });
      this._sel = null; this._repintarTodas(); this._renomearAbas();
      status(rot);
      return true;
    },
    desfazer: function () { return this._volta("pilha", "refazer", "Folha: desfeito (Ctrl+Y refaz)."); },
    refazer: function () { return this._volta("refazer", "pilha", "Folha: refeito."); },
    removerSelecionado: function () {
      var s = this._sel; if (!s) return false;
      var a = this.achar(s.id); if (!a || !a.folha.blocos[s.ix]) return false;
      var f = clone(a.folha), b = f.blocos.splice(s.ix, 1)[0];
      this.gravarFolha(a, f); this._sel = null; this.pintar(s.id); this._pintarProps();
      status((b.tituloVista || "Bloco") + " retirado da folha (a vista continua no projeto).");
      return true;
    },
    selecionar: function (id, ix) {
      this._sel = ix >= 0 ? { id: id, ix: ix } : null;
      this._marcarSel(id, ix);
      this._pintarProps();
    },
    _pintarProps: function () { try { if (global.BimShell) global.BimShell.pintarProps(this._sel ? this.propsViewport(this._sel.id, this._sel.ix) : null); } catch (e) {} },
    /* "Ativar vista": aqui a vista abre na aba dela para editar; a folha continua na aba ao lado */
    ativarVista: function (vistaId) {
      var g = this.G(), d = B2() && B2().def(vistaId); if (!g || !d) return false;
      g._d2Abrir(vistaId, d.nome);
      status("Vista ativada: " + d.nome + ". Edite e volte à aba da folha (Desativar vista).");
      this._ativada = vistaId;
      return true;
    },
    desativarVista: function () {
      var g = this.G(), st = g && g._bimVxEst(), alvo = null;
      if (!st) return false;
      st.lista.forEach(function (v) { if (v.tipo === "folha") alvo = alvo || v.id; });
      var self = this; self._esquecerDesenhos(self._ativada);
      this._ativada = null;
      if (alvo) { g._bimVxAtivar(alvo); this.pintar(alvo); }
      return !!alvo;
    },

    /* --------------------------------------------- Propriedades */
    props: function (id) {
      var self = this, a = this.achar(id); if (!a) return null;
      var params = PR().parametrosFolha(a.pr, a.folha, this.projeto()), ident = [], graf = [], outros = [];
      params.forEach(function (p) {
        var q = { id: "p:" + p.bip, rotulo: p.nome, valor: p.valor, leitura: !!p.leitura };
        if (p.bip === "SHEET_SCHEDULED") { q.tipo = "sim-nao"; }
        else if (p.bip === "SHEET_REVISIONS_ON_SHEET") { q = { id: "p:rev", rotulo: p.nome, tipo: "botao", rotuloBotao: (p.valor || "Nenhuma") + " — editar…", fn: function () { self.escolherRevisoes(id); } }; }
        else if (p.bip === "SHEET_GUIDE_GRID") { q.tipo = "lista"; q.valor = a.folha.eixoGuia ? String(a.folha.eixoGuia.espaco) : "0"; q.opcoes = [{ id: "0", rotulo: "<Nenhum>" }, { id: "10", rotulo: "10 mm" }, { id: "25", rotulo: "25 mm" }, { id: "50", rotulo: "50 mm" }]; }
        else if (!p.leitura) q.tipo = "texto";
        if (p.bip === "SHEET_SCALE" || p.bip === "SHEET_WIDTH" || p.bip === "SHEET_HEIGHT") graf.push(q);
        else if (p.bip === "SHEET_GUIDE_GRID") outros.push(q);
        else ident.push(q);
      });
      graf.forEach(function (q) { if (q.id === "p:SHEET_WIDTH" || q.id === "p:SHEET_HEIGHT") q.unidade = "mm"; });
      outros.push({ id: "pdf", rotulo: "PDF desta folha", tipo: "botao", rotuloBotao: "Gerar PDF", fn: function () { self.pdfVetorial([id]); } });
      /* PDF INTERATIVO (camadas): ligado por padrão; gravado no projeto (conjunto de folhas) */
      outros.push({ id: "pdf-camadas", rotulo: "PDF interativo (camadas)", tipo: "sim-nao", valor: this.pdfCamadasCfg(id).ativo !== false });
      outros.push({ id: "pdf-camadas-escolher", rotulo: "Camadas do PDF", tipo: "botao", rotuloBotao: "Escolher camadas…", fn: function () { self.dialogoPdfCamadas(id); } });
      outros.push({ id: "duplicar", rotulo: "Duplicar esta folha", tipo: "botao", rotuloBotao: "Duplicar folha", fn: function () { self.duplicarFolha(id); } });
      outros.push({ id: "excluir", rotulo: "Excluir esta folha", tipo: "botao", rotuloBotao: "Excluir folha…", fn: function () { self.excluirFolha(id); } });
      outros.push({ id: "dxf", rotulo: "DXF desta folha", tipo: "botao", rotuloBotao: "Exportar DXF", fn: function () { self.exportarDxf(id); } });
      outros.push({ id: "cad", rotulo: "CAD único do conjunto", tipo: "botao", rotuloBotao: "Arquivo CAD único", fn: function () { self.exportarCad(id); } });
      if (arr(a.folha.blocos).some(function (b) { return b.tipo === "viewport" && /^d3:/.test(b.vistaId); })) outros.push({ id: "atualizar3d", rotulo: "Vista 3D", tipo: "botao", rotuloBotao: "Atualizar vista 3D", fn: function () { self.atualizar3d(id); } });
      outros.push({ id: "atualizar", rotulo: "Modelo mudou?", tipo: "botao", rotuloBotao: "Atualizar vistas", fn: function () { self._desenhos = {}; self.pintar(id); } });
      return {
        daVista: true, semEditarTipo: true, titulo: "Folha: " + this.nomeFolha(a.pr, a.folha), icone: "prancha",
        secoes: [{ nome: "Gráficos", params: graf }, { nome: "Dados de identidade", params: ident }, { nome: "Carimbo (todas as folhas do conjunto)", params: this.paramsCarimbo(a) }, { nome: "Outros", params: outros }],
        onMudar: function (pid, valor) { self._mudarFolha(id, pid, valor); return self.props(id); }
      };
    },
    /* o carimbo é do CONJUNTO (as folhas do registro): modelo, código-base e os dados do projeto. Empresa,
       CNPJ, RT e registro vêm do cadastro da conta (⚙ Empresa) — não se digitam aqui */
    paramsCarimbo: function (a) {
      var c = a.pr.carimbo || {};
      return [
        { id: "c:modelo", rotulo: "Modelo de carimbo", tipo: "lista", valor: c.modelo, opcoes: PR().MODELOS_CARIMBO.map(function (m) { return { id: m.id, rotulo: m.nome }; }) },
        { id: "c:codigo", rotulo: "Código-base (código-nn)", tipo: "texto", valor: c.codigo },
        { id: "c:obra", rotulo: "Obra", tipo: "texto", valor: c.obra },
        { id: "c:proprietario", rotulo: "Proprietário", tipo: "texto", valor: c.proprietario },
        { id: "c:contratante", rotulo: "Contratante", tipo: "texto", valor: c.contratante },
        { id: "c:local", rotulo: "Local", tipo: "texto", valor: c.local },
        { id: "c:data", rotulo: "Data do carimbo", tipo: "texto", valor: c.data }
      ];
    },
    mudarCarimbo: function (id, campo, valor) {
      var a = this.achar(id); if (!a) return false;
      var CAMPOS = { modelo: 1, codigo: 1, obra: 1, proprietario: 1, contratante: 1, local: 1, data: 1 };
      if (!CAMPOS[campo]) return false;
      var pr = PR().normalizar(a.reg);
      pr.carimbo[campo] = campo === "modelo" ? (valor === "simples" ? "simples" : "RA") : String(valor == null ? "" : valor);
      pr.id = a.reg.id; pr.obraId = a.reg.obraId; pr.criadoEm = a.reg.criadoEm;
      if (!this.salvarRegistro(pr)) return false;
      this._repintarTodas(); this._renomearAbas();
      var cf = PR().conferir(pr);
      if (campo === "modelo" && !cf.ok) toast(cf.fora.length + " vista(s) ficaram fora da área de desenho com o carimbo novo: arraste para dentro ou use Gerar pranchas.", "aviso");
      return true;
    },
    /* o nome das abas e do Navegador acompanha número/nome das folhas */
    _renomearAbas: function () {
      var self = this, g = this.G(), st = g && g._bimVxEst && g._bimVxEst(); if (!st) return;
      st.lista.forEach(function (v) { if (v.tipo !== "folha") return; var b = self.achar(v.id); if (b) v.nome = "Folha: " + self.nomeFolha(b.pr, b.folha); });
      try { g._bimVxDocs(); } catch (e) {}
      try { g._nivArvore(); } catch (e2) {}
    },
    _mudarFolha: function (id, pid, valor) {
      if (/^c:/.test(String(pid))) { this.mudarCarimbo(id, String(pid).slice(2), valor); return; }
      var a = this.achar(id); if (!a) return;
      if (pid === "pdf-camadas") { var cc = clone(this.pdfCamadasCfg(id)); cc.ativo = valor === true || valor === "true"; this.mudarPdfCamadas(id, cc); return; }   /* PDF interativo ligado/desligado */
      var f = clone(a.folha), mapa = { "p:SHEET_NAME": "conteudo", "p:SHEET_NUMBER": "numero", "p:SHEET_ISSUE_DATE": "dataEmissao", "p:SHEET_DESIGNED_BY": "projetadoPor",
        "p:SHEET_DRAWN_BY": "desenhadoPor", "p:SHEET_CHECKED_BY": "verificadoPor", "p:SHEET_APPROVED_BY": "aprovadoPor", "p:SHEET_SCHEDULED": "apareceNaLista" };
      if (mapa[pid]) f[mapa[pid]] = pid === "p:SHEET_SCHEDULED" ? !!valor : String(valor == null ? "" : valor);
      else if (pid === "p:SHEET_GUIDE_GRID") f.eixoGuia = +valor >= 5 ? { espaco: +valor } : null;
      else return;
      this.gravarFolha(a, f); this.pintar(id);
      /* o nome da aba e do Navegador seguem o número/nome da folha */
      var g = this.G(), v = g && g._bimVxAchar(id), b = this.achar(id);
      if (v && b) { v.nome = "Folha: " + this.nomeFolha(b.pr, b.folha); try { g._bimVxDocs(); g._nivArvore(); } catch (e) {} }
    },
    propsViewport: function (id, ix) {
      var self = this, a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b) return null;
      if (b.tipo === "texto") return { daVista: true, semEditarTipo: true, titulo: "Texto na folha", icone: "prancha",
        secoes: [{ nome: "Texto", params: [
          { id: "t:txt", rotulo: "Texto", tipo: "botao", rotuloBotao: "Editar texto…", fn: function () { self.editarTexto(id, ix); } },
          { id: "t:alt", rotulo: "Altura da letra", tipo: "lista", valor: String(b.alt > 0 ? b.alt : 2.5), opcoes: ["1.8", "2", "2.5", "3", "3.5", "5", "7"].map(function (v) { return { id: v, rotulo: v.replace(".", ",") + " mm" }; }) },
          { id: "t:negrito", rotulo: "Negrito", tipo: "sim-nao", valor: !!b.negrito },
          { id: "tirar", rotulo: "Folha", tipo: "botao", rotuloBotao: "Apagar o texto", fn: function () { self.removerSelecionado(); } } ] }],
        onMudar: function (pid, valor) { if (pid === "t:alt") self._mudarBlocoTexto(id, ix, "alt", +valor); else if (pid === "t:negrito") self._mudarBlocoTexto(id, ix, "negrito", !!valor); return self.propsViewport(id, ix); } };
      if (b.tipo !== "viewport") return { daVista: true, semEditarTipo: true, titulo: b.titulo || b.tipo, icone: "prancha", secoes: [{ nome: "Bloco", params: [{ id: "tirar", rotulo: "Bloco", tipo: "botao", rotuloBotao: "Retirar da folha", fn: function () { self.removerSelecionado(); } }] }] };
      var dzV = this.desenho(b.vistaId), escV = dzV ? dzV.escala : b.escala, opEsc = PR().ESCALAS_VISTA.filter(function (e) { return e >= 10 && e <= 500; }).map(function (e) { return { id: String(e), rotulo: "1:" + e }; });
      opEsc.push({ id: "vista", rotulo: "A da vista (1:" + escV + ")" });
      return {
        daVista: true, semEditarTipo: true, titulo: "Viewport: " + b.tituloVista, icone: "planta",
        secoes: [
          { nome: "Gráficos", params: [
            { id: "escala", rotulo: "Escala desta cópia", tipo: "lista", valor: b.escalaPropria ? String(b.escala) : "vista", opcoes: opEsc },
            { id: "numeroDetalhe", rotulo: "Número de detalhe", tipo: "texto", valor: b.numeroDetalhe },
            { id: "tituloVista", rotulo: "Título na folha", tipo: "texto", valor: b.tituloVista },
            { id: "mostrarTitulo", rotulo: "Mostrar título", tipo: "sim-nao", valor: b.mostrarTitulo !== false } ] },
          { nome: "Extensões", params: [
            b.recorte ? { id: "recorte", rotulo: "Região de recorte", tipo: "botao", rotuloBotao: "Tirar o recorte (vista inteira)", fn: function () { self.tirarRecorte(id, ix); } }
                      : { id: "recorte", rotulo: "Região de recorte", leitura: true, valor: "a vista inteira (puxe a alça do canto)" },
            { id: "tam", rotulo: "Quadro no papel", leitura: true, valor: Math.round(b.w) + " × " + Math.round(b.h) + " mm" } ] },
          { nome: "Vista", params: [
            { id: "ativarF", rotulo: "Enquadrar", tipo: "botao", rotuloBotao: "Ativar vista na folha", fn: function () { self.ativarNaFolha(id, ix); } },
            { id: "ativar", rotulo: "Editar o modelo", tipo: "botao", rotuloBotao: "Abrir a vista", fn: function () { self.ativarVista(b.vistaId); } },
            { id: "tirar", rotulo: "Folha", tipo: "botao", rotuloBotao: "Retirar da folha", fn: function () { self.removerSelecionado(); } } ] }
        ],
        onMudar: function (pid, valor) {
          var a2 = self.achar(id); if (!a2 || !a2.folha.blocos[ix]) return null;
          var f = clone(a2.folha), bb = f.blocos[ix];
          if (pid === "escala") { self.trocarEscala(id, ix, valor === "vista" ? "vista" : +valor); return self.propsViewport(id, ix); }
          if (pid === "numeroDetalhe") {
            var v = String(valor || "").trim(), rep = f.blocos.some(function (o, k) { return k !== ix && o.tipo === "viewport" && o.numeroDetalhe === v; });
            if (rep) { toast("O número de detalhe " + v + " já existe nesta folha.", "aviso"); return self.propsViewport(id, ix); }
            bb.numeroDetalhe = v;
          } else if (pid === "tituloVista") bb.tituloVista = String(valor || "");
          else if (pid === "mostrarTitulo") bb.mostrarTitulo = !!valor;
          self.gravarFolha(a2, f); self.pintar(id);
          return self.propsViewport(id, ix);
        }
      };
    },

    /* --------------------------------------------- revisões do projeto */
    editarRevisoes: function () {
      var self = this, p = this.projeto();
      function linha(r, i) {
        return '<tr data-rv-i="' + i + '"><td><input data-f="numero" value="' + esc(r.numero) + '" style="width:54px"></td><td><input data-f="data" value="' + esc(r.data) + '" style="width:90px"></td>' +
          '<td><input data-f="descricao" value="' + esc(r.descricao) + '" style="width:220px"></td><td><input data-f="emitidoPor" value="' + esc(r.emitidoPor) + '" style="width:110px"></td>' +
          '<td><input data-f="emitidoPara" value="' + esc(r.emitidoPara) + '" style="width:110px"></td><td style="text-align:center"><input type="checkbox" data-f="emitida"' + (r.emitida ? " checked" : "") + "></td></tr>";
      }
      function corpo() {
        return '<p class="muted" style="font-size:12px;margin:0 0 8px">As revisões são do PROJETO (valem para todas as folhas da obra). Em cada folha, Propriedades › Revisões na folha diz quais aparecem no carimbo; a última é a Revisão atual.</p>' +
          '<table class="tbl" style="font-size:12px"><thead><tr><th>Número</th><th>Data</th><th>Descrição</th><th>Emitido por</th><th>Emitido para</th><th>Emitida</th></tr></thead><tbody id="pv-revs">' +
          p.revisoes.map(linha).join("") + '</tbody></table><button class="btn sm" id="pv-rev-nova" style="margin-top:8px">+ Revisão</button>';
      }
      function ler() {
        [].forEach.call(document.querySelectorAll("#pv-revs tr[data-rv-i]"), function (tr) {
          var r = p.revisoes[+tr.getAttribute("data-rv-i")]; if (!r) return;
          [].forEach.call(tr.querySelectorAll("[data-f]"), function (i) { var k = i.getAttribute("data-f"); r[k] = k === "emitida" ? i.checked : i.value; });
        });
      }
      global.UI.modal("Revisões e emissões do projeto", corpo(), [
        { texto: "Salvar", classe: "primary", onClick: function () { ler(); self.gravarProjeto(p); global.UI.fecharModal(); self._repintarTodas(); toast(p.revisoes.length + " revisão(ões) no projeto.", "ok"); } },
        { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      var bt = document.getElementById("pv-rev-nova");
      if (bt) bt.onclick = function () {
        ler();
        var n = p.revisoes.length;
        p.revisoes.push(PR().revisao({ id: "rev" + Date.now().toString(36), numero: "R" + ("0" + n).slice(-2), data: new Date().toLocaleDateString("pt-BR") }, n));
        var tb = document.getElementById("pv-revs"); if (tb) tb.innerHTML = p.revisoes.map(linha).join("");
      };
    },
    escolherRevisoes: function (id) {
      var self = this, a = this.achar(id), p = this.projeto(); if (!a) return;
      if (!p.revisoes.length) { toast("O projeto ainda não tem revisões: Vista › Revisões.", "aviso"); this.editarRevisoes(); return; }
      var h = p.revisoes.map(function (r) { return '<label style="display:block;font-size:12.5px;padding:3px 0"><input type="checkbox" data-pv-rev="' + esc(r.id) + '"' + (a.folha.revisoes.indexOf(r.id) >= 0 ? " checked" : "") + "> <b>" + esc(r.numero) + "</b> · " + esc(r.data) + " · " + esc(r.descricao) + "</label>"; }).join("");
      global.UI.modal("Revisões na folha " + PR().numeroFolha(a.pr, a.folha), h, [
        { texto: "Aplicar", classe: "primary", onClick: function () {
          var ids = [].slice.call(document.querySelectorAll("[data-pv-rev]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-rev"); });
          self.definirRevisoes(id, ids); global.UI.fecharModal();
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
    },
    definirRevisoes: function (id, ids) {
      var a = this.achar(id); if (!a) return false;
      var f = clone(a.folha); f.revisoes = arr(ids).map(String);
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      return true;
    },
    _repintarTodas: function () { var self = this; Object.keys(this._telas).forEach(function (k) { self.pintar(k); }); this._pintarProps(); },

    /* --------------------------------------------- listas (folhas, vistas) */
    vistas2d: function () {
      var b2 = B2(); if (!b2) return [];
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e) {}
      var L = [];
      b2.niveis().forEach(function (n) { var id = b2.idPlanta(n.id); L.push({ id: id, nome: "Planta baixa — " + n.nome, tipo: "Planta de piso", escala: b2.estilo(id).escala }); });
      b2.cortes().forEach(function (c) { var id = b2.idCorte(c.id); L.push({ id: id, nome: "Corte " + c.letra, tipo: "Corte", escala: b2.estilo(id).escala }); });
      return L;
    },
    tabela: function (qual) {
      var regs = this.registros();
      if (qual === "folhas") return PR().listaFolhas(regs, this.projeto());
      if (qual === "vistas") return PR().listaVistas(this.vistas2d(), regs);
      /* TABELAS QUANTITATIVAS DO MODELO (demolição, construção, portas e janelas): o motor lê a geometria — js/bimconstruirdemolir.js */
      if (qual === "demolicao" || qual === "construcao" || qual === "esquadrias") {
        var CDt = global.BimConstruirDemolir, stT = this._estadoBim();
        if (!CDt || !stT) { toast("Abra o modelo da obra primeiro.", "aviso"); return { titulo: "SEM MODELO", cabecalho: ["Tabela"], linhas: [["Abra o modelo da obra."]] }; }
        var tq = CDt.TABELAS[qual](stT, this._opcCD());
        if (tq.avisos && tq.avisos.length) toast(tq.avisos[0], "aviso");
        return tq;
      }
      return PR().tabelaRevisoes(this.projeto(), regs);
    },
    mostrarLista: function (qual) {
      var self = this, t = this.tabela(qual), g = this.G(), st = g && g._bimVxEst(), fa = st && this.ehFolha(st.ativa) ? st.ativa : null;
      var h = '<table class="tbl" style="font-size:12px"><thead><tr>' + t.cabecalho.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        (t.linhas.length ? t.linhas.map(function (l) { return "<tr>" + l.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") : '<tr><td colspan="' + t.cabecalho.length + '" class="muted">Nada ainda.</td></tr>') + "</tbody></table>";
      var bts = [];
      if (fa) bts.push({ texto: "Pôr na folha aberta", classe: "primary", onClick: function () { self.inserirTabela(fa, t); global.UI.fecharModal(); } });
      bts.push({ texto: "Fechar", onClick: function () { global.UI.fecharModal(); } });
      global.UI.modal(t.titulo.charAt(0) + t.titulo.slice(1).toLowerCase(), h, bts);
      return t;
    },
    /* ---- PRANCHA CONSTRUIR E DEMOLIR (19/11/2026): o estado do modelo e os ganchos da família vêm do editor do BIM; a regra toda é do motor puro */
    _estadoBim: function () { try { var b = global.BIM, e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (e2) { return null; } },
    _opcCD: function () {
      var b = global.BIM || {};
      var af = b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null, cf = b.familiaCategoria ? function (id) { return b.familiaCategoria(id); } : null;
      var niv = []; try { niv = global.BimArqUI && global.BimArqUI.niveis ? global.BimArqUI.niveis() : []; } catch (e) { niv = []; }
      return { avaliarFam: af, niveis: niv, deps: { avaliarFam: af, categoriaFam: cf } };
    },
    /* o botão "Construir e Demolir": uma folha nova com a planta do nível na convenção de reforma, a legenda só com o que existe, as notas padrão e a tabela de demolição */
    gerarConstruirDemolir: function (nivelId) {
      if (!this.ativo()) return false;
      var self = this, CD = global.BimConstruirDemolir, b2 = B2(), st = this._estadoBim();
      if (!CD || !b2) { toast("O motor da prancha Construir e Demolir não carregou.", "erro"); return false; }
      if (!st) { toast("Abra o modelo da obra primeiro.", "aviso"); return false; }
      var niv = []; try { niv = b2.niveis(); } catch (e0) { niv = []; }
      if (!niv.length) { toast("O modelo não tem nível com planta ainda.", "aviso"); return false; }
      if (nivelId == null && niv.length > 1) {
        var h = '<label style="font-size:12.5px">Nível <select id="pv-cd-nivel">' + niv.map(function (n) { return '<option value="' + esc(n.id) + '">' + esc(n.nome) + "</option>"; }).join("") + "</select></label>" +
          '<p class="muted" style="font-size:12px;margin:8px 0 0">A prancha usa a planta do nível, na convenção de reforma (demolir verde tracejado, alvenaria nova vermelha, existente cinza). A planta comum do nível não muda.</p>';
        global.UI.modal("Gerar prancha Construir e Demolir", h, [
          { texto: "Gerar", classe: "primary", onClick: function () { var v = (document.getElementById("pv-cd-nivel") || {}).value; global.UI.fecharModal(); self.gerarConstruirDemolir(v); } },
          { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
        return true;
      }
      var nv = niv.filter(function (n) { return String(n.id) === String(nivelId); })[0] || niv[0];
      var vistaId = b2.idPlanta(nv.id);
      /* a planta 2D segue o filtro de fase da cena: a prancha precisa de TODAS as fases (existente, demolir e novo) */
      try { var P10 = global.BimP10UI; if (P10 && P10.vista && P10.vista().filtro !== "tudo") { P10.definirVista({ filtro: "tudo" }); toast("Filtro de fase da vista passou para \"Mostrar tudo\": a prancha leva as três fases.", "info"); } } catch (eF) { /* fica o filtro de agora */ }
      var dz = this.desenho(vistaId, true, undefined, undefined, "construirDemolir");
      if (!dz) { toast("Não consegui desenhar a planta: abra o modelo da obra primeiro.", "erro"); return false; }
      var id = this.novaFolha("A1"); if (!id) return false;
      var a = this.achar(id); if (!a) return false;
      var ar = a.geo.area, W = Math.max(40, Math.min(75, ar.w * 0.22)), livreW = ar.w - W - 8, livreH = ar.h - 16, cand = [20, 25, 50, 75, 100, 125, 200, 500], esc = 500;
      for (var i = 0; i < cand.length; i++) if (dz.vb.w * 1000 / cand[i] <= livreW && dz.vb.h * 1000 / cand[i] <= livreH) { esc = cand[i]; break; }
      var f = clone(a.folha); f.conteudo = "Construir e Demolir - " + nv.nome;
      var r = PR().colocarViewport(a.pr, f, { vistaId: vistaId, nome: "Construir e Demolir - " + nv.nome, escala: esc, caixa: { w: dz.vb.w, h: dz.vb.h }, cx: ar.x + livreW / 2, cy: ar.y + livreH / 2, repetir: true }, this.registros().map(function (q) { return PR().normalizar(q); }));
      if (!r.ok) { toast(r.erro, "aviso"); return false; }
      f = r.folha;
      var vp = f.blocos[f.blocos.length - 1]; vp.escalaPropria = true; vp.escala = esc; vp.convencao = "construirDemolir";
      var oc = this._opcCD(), cd = CD.blocosDaFolha(st, ar, { avaliarFam: oc.avaliarFam, deps: oc.deps, niveis: oc.niveis, incluirDrywall: false });
      f.blocos = f.blocos.concat(cd.blocos);
      this.gravarFolha(a, f); this.pintar(id);
      status("Prancha Construir e Demolir: " + nv.nome + " · 1:" + esc + " · legenda com " + cd.legenda.itens.length + " convenção(ões)." + (CD.reforma(st) ? "" : " O projeto não está marcado como Reforma (Gerenciar › Fases): o piso não entra como a remover."));
      if (cd.demolicao.avisos && cd.demolicao.avisos.length) toast(cd.demolicao.avisos[0], "aviso");
      return id;
    },
    inserirTabela: function (id, t) {
      var a = this.achar(id); if (!a) return false;
      var ar = a.geo.area, f = clone(a.folha), w = Math.min(ar.w, 40 * t.cabecalho.length);
      f.blocos.push(PR().blocoDeLista(t, ar.x + ar.w - w, ar.y + 6, w));
      this.gravarFolha(a, f); this.pintar(id);
      status(t.titulo + " posta na folha (canto superior direito da área de desenho).");
      return true;
    },

    /* --------------------------------------------- saída: DXF, DWG, PDF */
    _baixar: function (nome, texto, tipo) {
      /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
      if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, texto, tipo, ""); if (!wT) return false; nome = wT.nome; texto = wT.dados; }
      this._ultimoArquivo = { nome: nome, texto: texto, tamanho: texto.length };
      try {
        var url = URL.createObjectURL(new Blob([texto], { type: tipo || "application/dxf" })), a = document.createElement("a");
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      } catch (e) {}
    },
    /* DXF da aba ativa: folha → a folha em mm; planta/corte → a vista 1:1 em metros */
    exportarDxf: function (id) {
      var X = global.BimDxf; if (!X) { toast("O módulo de DXF não carregou.", "erro"); return null; }
      var g = this.G(), st = g && g._bimVxEst(); id = id || (st && st.ativa);
      try {
        if (this.ehFolha(id)) {
          var a = this.achar(id); if (!a) return null;
          /* folha das pranchas do hidro (imagem inteira = o SVG gerado): o DXF antigo desta aba saía só com a moldura e o carimbo; vai pelo CAD único */
          if (/^hidsvg:/.test(a.folha.imagemInteira || "")) return this.exportarCad(id);
          var vps = {}, self = this;
          a.folha.blocos.forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenhoVp(b); if (dz && dz.tipo !== "3d") vps[self.chaveVp(b)] = { dados: dz.dados, estilo: dz.estilo, vb: dz.vb, svgSemTitulo: dz.svg }; } });
          var logoConta = null; try { logoConta = global.Empresa && global.Empresa.logo ? global.Empresa.logo() : null; } catch (eL) {}
          var doc = X.daFolha(a.pr, a.folha, a.geo, vps, { projeto: this.projeto(), empresa: this.empresaDados(), logo: !!logoConta });
          var nome = PR().nomeArquivo(a.pr, a.folha, this.projeto(), "dxf");
          this._baixar(nome, X.escrever(doc));
          toast("DXF da folha: " + nome + " (" + doc.ordem.length + " camadas, papel " + a.geo.papel.w + " × " + a.geo.papel.h + " mm)." + (doc.avisos.length ? " " + doc.avisos.join("; ") + "." : ""), doc.avisos.length ? "aviso" : "ok");
          return { nome: nome, camadas: doc.ordem.slice() };
        }
        if (B2() && B2().ehVista2d(id)) {
          var dz2 = this.desenho(id, true); if (!dz2) { toast("Não consegui desenhar a vista.", "erro"); return null; }
          var doc2 = X.daVista(dz2.dados, dz2.estilo, { titulo: dz2.nome });
          var nome2 = String(dz2.nome).replace(/[\\\/:*?"<>|]+/g, "-") + " - 1-" + dz2.escala + ".dxf";
          this._baixar(nome2, X.escrever(doc2));
          toast("DXF da vista: " + nome2 + " (1:1 em metros, " + doc2.ordem.length + " camadas por categoria, cotas medem de novo no AutoCAD).", "ok");
          return { nome: nome2, camadas: doc2.ordem.slice() };
        }
      } catch (e) { toast("Não consegui gerar o DXF: " + (e && e.message || e), "erro"); return null; }
      toast("Abra uma folha, uma planta ou um corte para exportar em DXF.", "aviso");
      return null;
    },
    /* ARQUIVO CAD ÚNICO (16/11/2026): o conjunto (registro) da folha aberta → um DXF/DWG com o MODEL em escala real e um LAYOUT por folha (viewports travadas na escala de
       cada vista), CTB da disciplina. Folhas do hidro (imagem inteira = SVG gerado) vão por BimCad.paraCad (CTB RA_Hidrossanitario); as demais por paraCadFolhas (CTB RA_Geral).
       Roteiro do defeito: o DXF desta tela (daFolha) não tinha layout, CTB nem penas, e a aba do hidro exportava só moldura e carimbo. */
    _svgDaFolhaHidro: function (f) {
      var u = (this._imagensExternas || {})[f.imagemInteira]; if (!u) return "";
      try { return decodeURIComponent(String(u).replace(/^data:image\/svg\+xml;charset=utf-8,/, "")); } catch (e) { return ""; }
    },
    /* → { saidas: [{ o, base, partes, rotulo }], o, base, partes (= a 1ª saída) } | null. O registro pode MISTURAR folhas do hidro (imagem inteira = SVG gerado) e folhas comuns
       (viewports do BIM): cada grupo vira a sua saída (CTB RA_Hidrossanitario × RA_Geral); nenhuma folha some em silêncio. */
    cadDoRegistro: function (id, opc) {
      opc = opc || {}; var BC = global.BimCad; if (!BC) { toast("O módulo de CAD único não carregou.", "erro"); return null; }
      var a = this.achar(id || (this.G() && this.G()._bimVxEst && this.G()._bimVxEst().ativa)); if (!a) { toast("Abra uma folha para exportar o arquivo CAD.", "aviso"); return null; }
      var pr = a.pr, self = this, base = String(pr.nome || "Folhas").replace(/[\\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Folhas";
      var ehHidro = function (f) { return /^hidsvg:/.test(f.imagemInteira || ""); };
      var hidro = arr(pr.folhas).filter(ehHidro), comuns = arr(pr.folhas).filter(function (f) { return !ehHidro(f); }), saidas = [];
      var nomesDe = function (suf) { return { dxf: base + suf + ".dxf", dwg: base + suf + ".dwg", base: base + suf }; };
      var misto = hidro.length > 0 && comuns.length > 0;
      try {
        if (hidro.length) {
          var fols = hidro.map(function (f) {
            var m = /^(\S+) - ([\s\S]*)$/.exec(f.conteudo || ""), svg = self._svgDaFolhaHidro(f);
            return svg ? { numero: m ? m[1] : (f.numero || "F" + f.n), titulo: m ? m[2] : (f.conteudo || ""), escala: f.escala || "", formato: pr.formato || "A1", svg: svg } : null;
          }).filter(function (x) { return !!x; });
          if (!fols.length) toast("As folhas do hidro desta sessão não estão em memória: use Gerar pranchas de novo e exporte em seguida.", "aviso");
          else { var nh = nomesDe(misto ? " - hidro" : ""); saidas.push({ o: BC.paraCad({ ok: true, folhas: fols }, { disciplina: "hidrossanitario", dxfNome: nh.dxf, dwgNome: nh.dwg }), base: nh.base, rotulo: "hidrossanitário",
            partes: global.BimCadUI ? global.BimCadUI.partesHidro({ folhas: fols }) : null }); }
        }
        if (comuns.length) {
          var logoConta = null; try { logoConta = global.Empresa && global.Empresa.logo ? global.Empresa.logo() : null; } catch (eL) {}
          var folhas = comuns.map(function (f) {
            var vps = {}; arr(f.blocos).forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenhoVp(b); if (dz && dz.tipo !== "3d") vps[self.chaveVp(b)] = { dados: dz.dados, estilo: dz.estilo, vb: dz.vb, svgSemTitulo: dz.svg }; } });
            return { folha: f, vps: vps, nome: PR().numeroFolha(pr, f) };
          });
          var nc = nomesDe(misto ? " - folhas" : ""), mk = function (lista, dxfNome, dwgNome) { return BC.paraCadFolhas({ pr: pr, geo: a.geo, projeto: self.projeto(), empresa: self.empresaDados(), logo: !!logoConta, folhas: lista }, { disciplina: opc.disciplina || "geral", dxfNome: dxfNome, dwgNome: dwgNome }); };
          saidas.push({ o: mk(folhas, nc.dxf, nc.dwg), base: nc.base, rotulo: "folhas do BIM", partes: function (i0, i1, nome) { return mk(folhas.slice(i0, i1), nome + ".dxf", nome + ".dwg"); } });
        }
      } catch (e) { toast("Não consegui montar o arquivo CAD: " + (e && e.message || e), "erro"); return null; }
      if (!saidas.length) return null;
      return { saidas: saidas, o: saidas[0].o, base: saidas[0].base, partes: saidas[0].partes };
    },
    exportarCad: function (id) {
      var c = this.cadDoRegistro(id); if (!c || !c.saidas) return null;
      var UI = global.BimCadUI; if (!UI) { toast("O módulo de saída CAD não carregou.", "erro"); return null; }
      var nomes = [], layouts = 0;
      c.saidas.forEach(function (sd) { var r = UI.baixarCad(sd.o, { base: sd.base }); if (r) { nomes.push(r.nome); layouts += sd.o.resumo.layouts.length; } });
      return nomes.length ? { nome: nomes[0], nomes: nomes, layouts: layouts } : null;
    },
    exportarDwg: function (id) {
      var UI = global.BimCadUI, self = this;
      if (!UI) { toast("O módulo de saída CAD não carregou.", "erro"); return false; }
      var c = this.cadDoRegistro(id); if (!c || !c.saidas) return false;
      var A = global.ArqPranchasUI, sondar = A && A.sondarDwg ? A.sondarDwg() : Promise.resolve({ disponivel: false, motivo: UI.DWG_SO_NO_APP });
      sondar.then(function (s) {
        if (s.disponivel) { c.saidas.forEach(function (sd) { UI.baixarDwg(sd.o, { base: sd.base, partes: sd.partes }); }); return; }
        global.UI.modal("DWG", '<p style="font-size:13px;line-height:1.5">' + esc(s.motivo || UI.DWG_SO_NO_APP) + '</p><p class="muted" style="font-size:12px">No AutoCAD: abra o DXF e use Salvar como → DWG. Os layouts, as penas (CTB) e as escalas das viewports vão junto no arquivo CAD único.</p>',
          [{ texto: "Arquivo CAD único (DXF)", classe: "primary", onClick: function () { global.UI.fecharModal(); c.saidas.forEach(function (sd) { UI.baixarCad(sd.o, { base: sd.base }); }); } }, { texto: "Fechar", onClick: function () { global.UI.fecharModal(); } }]);
      });
      return true;
    },
    exportarDwgAntigo: function () {
      var X = global.BimDxf, m = X && X.DWG ? X.DWG.motivo : "Use o DXF.";
      global.UI.modal("DWG", '<p style="font-size:13px;line-height:1.5">' + esc(m) + '</p><p class="muted" style="font-size:12px">No AutoCAD: abra o DXF e use Salvar como → DWG. As camadas, as espessuras e as cotas vão junto.</p>',
        [{ texto: "Exportar DXF", classe: "primary", onClick: function () { global.UI.fecharModal(); BimFolhaUI.exportarDxf(); } }, { texto: "Fechar", onClick: function () { global.UI.fecharModal(); } }]);
      return false;
    },
    /* PDF em lote: as folhas escolhidas num documento só, cada uma no papel dela
       (@page com nome por tamanho), com o nome automático no título — o "Salvar
       como PDF" do navegador propõe esse nome */
    pdf: function (ids) {
      var self = this, itens = [], projeto = this.projeto();
      arr(ids).forEach(function (id) { var a = self.achar(id); if (a) itens.push(a); });
      if (!itens.length) { toast("Nenhuma folha para imprimir.", "aviso"); return null; }
      var paginas = {}, css = "", corpo = "";
      itens.forEach(function (a) {
        var P = a.geo.papel, nm = "p" + P.w + "x" + P.h;
        if (!paginas[nm]) { paginas[nm] = 1; css += "@page " + nm + "{size:" + P.w + "mm " + P.h + "mm;margin:0}"; }
        var rec = self.recursos(a, false); rec.projeto = projeto;
        corpo += '<div style="page:' + nm + '">' + UI2().folha(a.pr, a.folha, rec, a.geo) + "</div>";
      });
      var titulo = itens.length === 1 ? PR().nomeArquivo(itens[0].pr, itens[0].folha, projeto, "pdf") : PR().nomeArquivoLote(itens[0].pr, itens.map(function (a) { return a.folha; }), "pdf");
      titulo = titulo.replace(/\.pdf$/, "");
      var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + "</title><style>" + css +
        "html,body{margin:0;padding:0;background:#fff}.folha{page-break-after:always;break-after:page}div:last-child>.folha{page-break-after:auto;break-after:auto}" +
        "@media screen{body{background:#666}.folha{margin:10px auto;box-shadow:0 2px 12px rgba(0,0,0,.4)}}</style></head><body>" + corpo + "</body></html>";
      this._ultimoArquivo = { nome: titulo + ".pdf", texto: html, tamanho: html.length };
      /* a janela abre depois de montar (tudo aqui é síncrono: continua no mesmo clique) */
      /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
      if (global.TesteModulo && TesteModulo.marcarHtml) { html = TesteModulo.marcarHtml(html, ""); if (html == null) return null; }
      var jan = global.open("", "_blank");
      if (!jan) { toast("O navegador bloqueou a janela do PDF. Permita pop-ups para o OrçaPRO.", "erro"); return null; }
      jan.document.open(); jan.document.write(html); jan.document.close();
      setTimeout(function () { try { jan.focus(); jan.print(); } catch (e) {} }, 700);
      return { titulo: titulo, folhas: itens.length };
    },
    /* PDF VETORIAL (16/11/2026): o arquivo é escrito pelo sistema (js/folhapdf.js + js/svgpdf.js), sem o driver de impressão — linhas e hachura em vetor com a pena de papel da tela,
       texto selecionável, carimbo e moldura; só a vista 3D e os logos são imagem (PNG sem perda, >= 300 dpi). O `pdf()` acima (janela de impressão) fica para quem quer o diálogo.
       Roteiro do defeito: pelo driver ("Microsoft Print to PDF") o texto e as linhas saíam borrados e rasterizados, diferente da tela. → Promise<{ nome, tamanho, paginas }> */
    pdfVetorial: function (ids) {
      var self = this, itens = [], projeto = this.projeto(), FPd = global.FolhaPdf;
      if (!FPd) { toast("O módulo de PDF não carregou.", "erro"); return Promise.resolve(null); }
      arr(ids).forEach(function (id) { var a = self.achar(id); if (a) itens.push(a); });
      if (!itens.length) { toast("Nenhuma folha para gerar o PDF.", "aviso"); return Promise.resolve(null); }
      var nome = itens.length === 1 ? PR().nomeArquivo(itens[0].pr, itens[0].folha, projeto, "pdf") : PR().nomeArquivoLote(itens[0].pr, itens.map(function (a) { return a.folha; }), "pdf");
      var lista = itens.map(function (a) { var rec = self.recursos(a, false); rec.projeto = projeto; return { pr: a.pr, folha: a.folha, rec: rec, geo: a.geo }; });
      status("Gerando o PDF vetorial…");
      return Promise.resolve(self._garantir3d(itens)).then(function () {
        lista.forEach(function (it, i) { var rec = self.recursos(itens[i], false); rec.projeto = projeto; it.rec = rec; });
        var cfgCam = PR().pdfCamadasDe(itens[0].pr);   /* PDF interativo: ligado por padrão (Propriedades da folha › Escolher camadas) */
        var ivo = null;
        return Promise.resolve(cfgCam.ativo === false ? null : self._interativoCompleto(itens, projeto)).then(function (iv) { ivo = iv; return FPd.gerar(lista, { P: UI2(), titulo: nome.replace(/\.pdf$/, ""), camadas: cfgCam.ativo === false ? null : cfgCam, interativo: cfgCam.ativo === false ? null : ivo }); });
      }).then(function (r) {
        var d = r.bytes;
        if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, d, "application/pdf", ""); if (!wT) return null; nome = wT.nome; d = wT.dados; }
        self._ultimoArquivo = { nome: nome, bytes: d, tamanho: d.length, vetorial: true, paginas: r.paginas, imagens: r.imagens };
        try {
          var url = URL.createObjectURL(new Blob([d], { type: "application/pdf" })), el = document.createElement("a");
          el.href = url; el.download = nome; document.body.appendChild(el); el.click(); el.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        } catch (e) {}
        var mb = d.length / 1048576;
        toast("PDF vetorial: " + nome + " (" + r.paginas + " folha" + (r.paginas > 1 ? "s" : "") + ", " + (mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(d.length / 1024) + " KB") + ")." + (mb > 30 ? " Arquivo grande: reduza as vistas 3D da folha." : ""), mb > 30 ? "aviso" : "ok");
        arr(r.avisos).slice(0, 4).forEach(function (av) { toast("PDF interativo: " + av, "aviso"); });   /* o que ficou de fora e por quê (QR sem placa publicada, anexo vazio…) */
        try { self._guardarSnapsRev(r.snapshots, itens, projeto); } catch (eSn) {}   /* revisão emitida: guarda o retrato para a próxima comparar */
        return { nome: nome, tamanho: d.length, paginas: r.paginas, avisos: arr(r.avisos) };
      })["catch"](function (e) { toast("Não consegui gerar o PDF: " + (e && e.message || e), "erro"); return null; });
    },
    _garantir3d: function (itens) { return this.garantir3d(itens); },
    /* PDF INTERATIVO (js/pdfinterativo.js): o que o app sabe e o motor puro não. Cada função é opcional e falha para "sem dado" (nunca inventa). */
    _interativoOpc: function (itens, projeto) {
      var self = this, PIv = global.PdfInterativo, ad = PIv && PIv.adaptadorApp ? PIv.adaptadorApp(global) : {};
      var rev = PIv.criarRevisao(PR(), projeto, self._revSnaps);
      return { ativo: true, indice: true, ambiente: ad.ambiente, peca: ad.peca, etapaDe: ad.etapaDe, revisao: rev, detalheArmacao: function (uid) { try { return global.ConcUI && global.ConcUI.detalheArmacaoSvg ? global.ConcUI.detalheArmacaoSvg(uid) : null; } catch (e) { return null; } }, qr: function (t) { return self._qrModulos(t); } };
    },
    /* REVISÃO ANTERIOR e NUVEM: o retrato do desenho de cada vista fica guardado (IndexedDB) quando a revisão da folha é EMITIDA; o PDF seguinte, com outra revisão atual, compara com ele. */
    _revSnaps: {},
    _carregarSnapsRev: function (itens) {
      var self = this, ok = this.obraKey(), tarefas = [], mapa = this._revSnaps; Object.keys(mapa).forEach(function (k) { delete mapa[k]; });   /* esvazia NO LUGAR: a revisão do PDF já aponta para este objeto */
      if (!global.Idb) return Promise.resolve();
      itens.forEach(function (a) { arr(a.folha.blocos).forEach(function (b, ix) {
        if (b.tipo !== "viewport") return;
        var ch = a.pr.id + "|" + a.folha.id + "|" + b.vistaId + "#" + ix;
        tarefas.push(Promise.resolve(global.Idb.get("folharev:" + ok + ":" + ch)).then(function (v) { if (v && v.mapa) mapa[ch] = v; })["catch"](function () {}));
      }); });
      return Promise.all(tarefas);
    },
    _guardarSnapsRev: function (snaps, itens, projeto) {
      var self = this, ok = this.obraKey(), PIv = global.PdfInterativo; if (!global.Idb || !PIv) return;
      PIv.guardaveis(snaps, itens, projeto, PR(), this._revSnaps).forEach(function (q) { try { Promise.resolve(global.Idb.set("folharev:" + ok + ":" + q.chave, q.snap))["catch"](function () {}); } catch (e) {} });
    },
    _qrModulos: function (t) {
      var lib = global.qrcode; if (!lib) return null;
      try { var q = lib(0, "M"); q.addData(String(t)); q.make(); return { n: q.getModuleCount(), escuro: function (y, x) { return q.isDark(y, x); } }; } catch (e) { return null; }
    },
    /* o que depende de rede e de arquivos: a placa da obra PUBLICADA (QR e link da Prancha Viva) e os anexos. Falha em qualquer um = PDF sai sem aquela parte (com aviso), nunca trava. */
    _interativoCompleto: function (itens, projeto) {
      var self = this, I = this._interativoOpc(itens, projeto);
      return Promise.all([this._portalPublicado(), this._anexosPdf(), this._carregarSnapsRev(itens)]).then(function (r) {
        I.portal = r[0]; I.anexos = r[1];
        return r[0] ? self._imagemCapa3d() : null;   /* a imagem do modelo 3D só vale com a placa publicada (o link dela é o que leva ao 3D girável) */
      }).then(function (img) { if (img) I.imagem3d = img; return I; })["catch"](function () { return I; });
    },
    /* a IMAGEM DE CAPA do modelo (página "Modelo 3D" do PDF): captura do 3D aberto, 85 x 55 mm a 300 dpi (≈ 150 dpi na página: PDF leve). Sem o 3D aberto, ou passando de 10 s: null (o PDF sai sem a página, com aviso). */
    _imagemCapa3d: function () {
      var self = this, BIM = global.BIM; if (!BIM || !BIM.desenharQuadroEm || !this.capturar3d) return Promise.resolve(null);
      var limite = new Promise(function (res) { setTimeout(function () { res(null); }, 10000); });
      var q = Promise.resolve(this.capturar3d("atual", 85, 55)).then(function (r) { return r && /^data:image\//.test(String(r.uri || "")) ? { uri: r.uri } : null; })["catch"](function () { return null; });
      return Promise.race([q, limite]);
    },
    /* a placa desta obra NO AR ({ url, urlPv }) ou null; os anexos (tabelas do modelo + extras registrados). A lógica mora em js/pdfinterativo.js (adaptadorApp), testada sem o app. */
    anexosPdfExtras: [],
    _portalPublicado: function () { var PIv = global.PdfInterativo; return PIv ? PIv.adaptadorApp(global).portal(this.G(), 6000) : Promise.resolve(null); },
    _anexosPdf: function () { var PIv = global.PdfInterativo; return PIv ? PIv.adaptadorApp(global).anexos(this.anexosPdfExtras) : Promise.resolve([]); },
    /* PDF INTERATIVO (camadas / OCG): { ativo, incluir:{id:false}, desligadas:[ids], variantes:{cotas, parede} } do conjunto da folha (padrão: ligado, tudo incluído, tudo ligado) */
    pdfCamadasCfg: function (id) { var a = this.achar(id); return PR().pdfCamadasDe(a ? a.pr : null); },
    mudarPdfCamadas: function (id, cfg) {
      var a = this.achar(id); if (!a) return false;
      var pr = PR().normalizar(a.reg); delete pr.pdfCamadas;
      var nova = PR().pdfCamadasNorm(cfg); if (nova) pr.pdfCamadas = nova;
      pr.id = a.reg.id; pr.obraId = a.reg.obraId; pr.criadoEm = a.reg.criadoEm;
      if (!this.salvarRegistro(pr)) return false;
      this._pintarProps();
      status(nova && nova.ativo === false ? "PDF comum (sem camadas)." : "PDF interativo: camadas " + (nova ? "configuradas" : "no padrão (todas, ligadas)") + ".");
      return true;
    },
    dialogoPdfCamadas: function (id) {
      var self = this, cfg = this.pdfCamadasCfg(id), CAM = (global.FolhaPdf && global.FolhaPdf.CAMADAS) || [];
      var linhas = CAM.map(function (d) {
        return '<tr><td>' + esc(d.nome) + '</td><td style="text-align:center"><input type="checkbox" data-pc-inc="' + d.id + '"' + (cfg.incluir[d.id] === false ? "" : " checked") + '></td>' +
          '<td style="text-align:center"><input type="checkbox" data-pc-on="' + d.id + '"' + (cfg.desligadas.indexOf(d.id) >= 0 ? "" : " checked") + "></td></tr>";
      }).join("");
      var vp = cfg.variantes || {};
      global.UI.modal("PDF interativo (camadas)",
        '<label style="display:block;margin:0 0 8px"><input type="checkbox" id="pc-ativo"' + (cfg.ativo === false ? "" : " checked") + '> <b>PDF interativo</b> (cada parte do desenho vira uma camada liga/desliga no leitor de PDF)</label>' +
        '<table class="tbl" style="width:100%"><thead><tr><th>Camada</th><th>Incluir</th><th>Começa ligada</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
        '<p class="muted" style="font-size:12px;margin:8px 0 4px">Ao abrir (as duas variantes vão desenhadas; no leitor liga-se uma ou outra):</p>' +
        '<label style="display:block;font-size:12.5px">Cotas: <select id="pc-cotas"><option value="">coloridas (como na tela)</option><option value="preta"' + (vp.cotas === "preta" ? " selected" : "") + '>pretas</option></select></label>' +
        '<label style="display:block;font-size:12.5px;margin-top:4px">Parede: <select id="pc-parede"><option value="">o preenchimento da vista</option>' +
          [["parede-hachura", "hachura 45°"], ["parede-cinza", "cinza"], ["parede-branco", "branco"]].map(function (q) { return '<option value="' + q[0] + '"' + (vp.parede === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + "</select></label>",
        [{ texto: "Salvar", classe: "primary", onClick: function () {
          var q = function (sel) { return [].slice.call(document.querySelectorAll(sel)); }, nova = { ativo: !!(document.getElementById("pc-ativo") || {}).checked, incluir: {}, desligadas: [], variantes: {} };
          q("[data-pc-inc]").forEach(function (e) { if (!e.checked) nova.incluir[e.getAttribute("data-pc-inc")] = false; });
          q("[data-pc-on]").forEach(function (e) { if (!e.checked) nova.desligadas.push(e.getAttribute("data-pc-on")); });
          var vc = (document.getElementById("pc-cotas") || {}).value, vpd = (document.getElementById("pc-parede") || {}).value; if (vc) nova.variantes.cotas = vc; if (vpd) nova.variantes.parede = vpd;
          global.UI.fecharModal(); self.mudarPdfCamadas(id, nova);
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
    },
    pdfLote: function () {
      var self = this, regs = this.registros().filter(function (r) { return r.origem === "folhas" || arr(r.folhas).some(function (f) { return arr(f.blocos).some(function (b) { return b.tipo === "viewport"; }); }); });
      var itens = [];
      regs.forEach(function (r) { var pr = PR().normalizar(r); pr.folhas.forEach(function (f) { itens.push({ id: self.idFolha(r.id, f.id), rot: self.nomeFolha(pr, f), arq: PR().nomeArquivo(pr, f, self.projeto(), "pdf") }); }); });
      if (!itens.length) { toast("Nenhuma folha ainda: Vista › Folha.", "aviso"); return null; }
      var cfgL = this.pdfCamadasCfg(itens[0].id);
      global.UI.modal("PDF em lote", '<p class="muted" style="font-size:12px;margin:0 0 6px">As folhas marcadas saem num documento só, cada uma no tamanho do papel dela. Nome automático: número - nome - revisão.</p>' +
        '<label style="display:block;font-size:12.5px;padding:2px 0 6px"><input type="checkbox" data-pv-camadas="1"' + (cfgL.ativo === false ? "" : " checked") + '> <b>PDF interativo (camadas)</b> — cotas, parede, níveis… liga/desliga no leitor <button type="button" data-pv-camadas-esc="1" style="margin-left:6px">Escolher camadas…</button></label>' +
        itens.map(function (it) { return '<label style="display:block;font-size:12.5px;padding:2px 0"><input type="checkbox" checked data-pv-lote="' + esc(it.id) + '"> ' + esc(it.rot) + ' <span class="muted">(' + esc(it.arq) + ")</span></label>"; }).join(""),
        [{ texto: "Gerar PDF", classe: "primary", onClick: function () {
          var ids = [].slice.call(document.querySelectorAll("[data-pv-lote]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-lote"); });
          var ck = document.querySelector("[data-pv-camadas]"), cfgN = clone(self.pdfCamadasCfg(itens[0].id));
          if (ck && (ck.checked !== (cfgN.ativo !== false))) { cfgN.ativo = !!ck.checked; self.mudarPdfCamadas(itens[0].id, cfgN); }
          global.UI.fecharModal(); self.pdfVetorial(ids);
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      setTimeout(function () { var be = document.querySelector("[data-pv-camadas-esc]"); if (be) be.addEventListener("click", function () { global.UI.fecharModal(); self.dialogoPdfCamadas(itens[0].id); }); }, 0);
      return itens;
    },
    /* posicionar sem arrastar (toque, teclado): escolhe a vista numa lista */
    escolherVista: function () {
      var self = this, g = this.G(), st = g && g._bimVxEst(), id = st && st.ativa;
      if (!this.ehFolha(id)) { toast("Abra uma folha primeiro (Navegador › Folhas ou Vista › Folha).", "aviso"); return; }
      var vs = this.vistas2d().concat(this.vistasExtras()); if (!vs.length) { toast("Nenhuma planta ou corte ainda.", "aviso"); return; }
      global.UI.modal("Posicionar vista", vs.map(function (v) { return '<label style="display:block;font-size:12.5px;padding:3px 0"><input type="radio" name="pv-vs" value="' + esc(v.id) + '"> ' + esc(v.nome) + (v.escala ? " · 1:" + esc(v.escala) : " · " + esc(v.tipo)) + "</label>"; }).join(""),
        [{ texto: "Posicionar", classe: "primary", onClick: function () { var r = document.querySelector('input[name="pv-vs"]:checked'); global.UI.fecharModal(); if (r) self.posicionar(id, r.value); } },
         { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
    },

    /* --------------------------------------------- GERAR PRANCHAS (o jogo num clique)
     * Quem decide é o motor (js/prancha.js gerarJogo: agrupamento, escala,
     * posição, número, idempotência); aqui só a fiação: as vistas do modelo
     * aberto, a escala do Padrão de detalhamento da empresa, aplicar a escala
     * escolhida NA VISTA (a escala é da vista: o viewport acompanha) e gravar.
     * Duas passadas: a 1ª escolhe a escala com folga (o desenho cresce um
     * pouco ao mudar de escala — textos e cotas são em mm de papel); a 2ª mede
     * o desenho já na escala escolhida e posiciona exato. */
    /* DISCIPLINA (15/11/2026). Roteiro do defeito: o "Gerar pranchas" abria com TODAS as vistas marcadas (arquitetura, estrutural, hidráulica, elétrica) e a folha de
       arquitetura saía com a tubulação do hidro. Agora o diálogo abre só na disciplina escolhida (Arquitetura por padrão); vista de hidro/elétrica só entra quando a
       disciplina dela é a escolhida (ou "todas"); e a vista de arquitetura/estrutural vai para a folha SEM as categorias de instalação (semInstalacao). */
    DISCIPLINAS_INST: ["hidraulica", "eletrica", "mecanica"],
    filtrarDisciplina: function (lista, disc) {
      var d = String(disc || "").toLowerCase();
      if (!d || d === "todas") return arr(lista);
      return arr(lista).filter(function (v) { return String((v && v.disciplina) || "arquitetura").toLowerCase() === d; });
    },
    /* tira do SVG da vista o que é instalação (chave de estilo "|inst:" = tubo/conexão/caixa; "|fundo:" = louça em meio-tom da apresentação de instalação) e a imagem da cena
       por baixo (data-d2-inst-img). O resto do desenho (parede, porta, cota, texto) fica byte a byte. */
    semInstalacao: function (svg) {
      return String(svg == null ? "" : svg)
        .replace(/<path[^>]*data-cat="[^"]*\|(?:inst|fundo):[^"]*"[^>]*\/>/g, "")
        .replace(/<image[^>]*data-d2-inst-img="[^"]*"[^>]*\/>/g, "");
    },
    /* QUEM TIRA O TUBO (15/11/2026, revisão 15/11): o VIEWPORT da folha gerada com disciplina "arquitetura" ou "estrutural" leva b.semInst (js/prancha.js guarda); a vista em si NÃO
       é marcada (nada global, nada em localStorage): a mesma vista numa folha de hidro/"Todas" segue com o tubo. A disciplina PADRÃO da vista não decide. */
    _esquecerDesenhos: function (id) {
      var self = this; id = String(id);
      Object.keys(this._desenhos).forEach(function (k) { if (k === id || k.indexOf(id + "@") === 0 || k.indexOf(id + "#") === 0) delete self._desenhos[k]; });
    },
    /* é tubo/conexão/caixa/louça de fundo da instalação? (a mesma regra do rótulo: user data da linha, classe IFC de tubulação e a chave de estilo "|inst:"/"|fundo:") */
    _ehInstLinha: function (dados, i) {
      var U = dados.linhasUd || [], I = dados.linhasIfc || [], K = dados.linhasK || [];
      return !!((U[i] && U[i].inst) || /^IFC(PIPE|FLOW|DUCT|CABLE|VALVE)/.test(String(I[i] || "")) || /\|(?:inst|fundo):/.test(String(K[i] || "")));
    },
    _ehInstCorte: function (c) { return !!(c && (c.inst || /\|(?:inst|fundo):/.test(String(c.k || "")))); },
    /* o `an` (dados anotados da vista) sem a instalação: cópia rasa com linhas/linhasK/linhasUd/linhasIfc/linhasFase filtradas pelo mesmo índice, cortes filtrados e `inst` (a linha unifilar
       desenhada pela apresentação) retirada. O objeto original não muda (o da vista de hidro continua inteiro). */
    semTuboDados: function (an) {
      var self = this, o = {}; Object.keys(an || {}).forEach(function (k) { o[k] = an[k]; });
      var L = arr(an && an.linhas), ficam = [];
      L.forEach(function (l, i) { if (!self._ehInstLinha(an, i)) ficam.push(i); });
      ["linhas", "linhasK", "linhasUd", "linhasIfc"].forEach(function (k) { if (Array.isArray(an[k]) && an[k].length === L.length) o[k] = ficam.map(function (i) { return an[k][i]; }); });
      if (Array.isArray(an.cortes)) o.cortes = an.cortes.filter(function (c) { return !self._ehInstCorte(c); });
      if (o.inst) o.inst = null;
      return o;
    },
    /* tira do SVG da vista a imagem da cena por baixo da instalação (data-d2-inst-img) e, por segurança, o que ainda tenha chave "|inst:"/"|fundo:" (já saiu dos dados) */
    semInstalacao: function (svg) {
      return String(svg == null ? "" : svg)
        .replace(/<path[^>]*data-cat="[^"]*\|(?:inst|fundo):[^"]*"[^>]*\/>/g, "")
        .replace(/<image[^>]*data-d2-inst-img="[^"]*"[^>]*\/>/g, "");
    },
    /* PENAS DA ARQUITETURA NO CAMINHO DO BIM (etapa 2): os valores vêm de ArqEstilo.PENAS_ARQ (js/arqestilo.js, o único lugar). Reescreve `data-mm` (a pena de PAPEL que o js/pranchaui.js usa) e a cor
       do traço por categoria: parede cortada (OST_Walls, corte) 0,35 mm · forro (OST_Ceilings) vermelho 223/0/0 a 0,13 mm · demais linhas de vista/projeção 0,13 mm. Não há categoria de
       "revestimento" nem de "linha de chamada" no desenho 2D do BIM: ficam como estão (pendência registrada). Sem ArqEstilo carregado, devolve o SVG como veio. */
    penasArq: function (svg, PA) {
      var E = global.ArqEstilo; PA = PA || (E && E.PENAS_ARQ); if (!PA || !E || !E.hex) return String(svg == null ? "" : svg);
      return String(svg == null ? "" : svg).replace(/<path\b[^>]*data-cat="([^"]*)"[^>]*>/g, function (tag, key) {
        var cat = key.split("|")[0], cls = (/class="([^"]*)"/.exec(tag) || ["", ""])[1], mm = null, cor = null;
        if (cat === "OST_Ceilings") { mm = PA.forro.mm; cor = E.hex(PA.forro.cor); }
        else if (cat === "OST_Walls" && /d2-corte/.test(cls)) mm = PA.parede_cortada.mm;
        else if (/d2-vista/.test(cls)) mm = PA.vista.mm;
        if (mm == null) return tag;
        tag = /data-mm="[^"]*"/.test(tag) ? tag.replace(/data-mm="[^"]*"/, 'data-mm="' + mm + '"') : tag.replace(/<path\b/, '<path data-mm="' + mm + '"');
        if (cor) tag = /style="stroke:[^";]*/.test(tag) ? tag.replace(/style="stroke:[^";]*/, 'style="stroke:' + cor) : tag;
        return tag;
      });
    },
    discSemTubo: function (disc) { var d = String(disc || "").toLowerCase(); return d === "arquitetura" || d === "estrutural"; },
    disciplinaDe: function (vistaId) {
      var M = global.BimModeloVista, d = "arquitetura";
      try { if (M && M.ativo && M.ativo() && M.itensVistas) M.itensVistas().forEach(function (it) { if (String(it.id) === String(vistaId) && it.disciplina) d = String(it.disciplina); }); } catch (e) {}
      return d;
    },
    vistasParaGerar: function (disc) {
      var lista = this._vistasParaGerar0();
      return this.filtrarDisciplina(lista, disc);
    },
    _vistasParaGerar0: function () {
      var b2 = B2(), M = global.BimModeloVista, itens = []; if (!b2) return [];
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e0) {}
      try { if (M && M.ativo && M.ativo() && M.itensVistas) itens = M.itensVistas(); } catch (e) { itens = []; }
      if (!itens.length) itens = this.vistas2d().map(function (v) { return { id: v.id, tipo: v.tipo === "Corte" ? "corte" : "planta", nome: v.nome, disciplina: "arquitetura" }; });
      var niv = {}; try { b2.niveis().forEach(function (n, i) { niv[n.nome] = i; }); } catch (e2) {}
      var TIPO = { planta: "planta", forro: "planta", estrutural: "planta", corte: "corte", elevacao: "elevacao" };
      return itens.filter(function (it) { return TIPO[it.tipo]; }).map(function (it) {
        return { id: it.id, nome: it.nome, tipo: TIPO[it.tipo], tipoVista: it.tipo, disciplina: it.disciplina || "arquitetura", nivel: it.nivel || "", ordem: niv[it.nivel] != null ? niv[it.nivel] : 0 };
      });
    },
    /* a escala do Padrão de detalhamento da empresa: planta de fôrma / corte de fôrma (1:50) */
    escalaPadrao: function (tipo) {
      var P = global.PadraoDet, e = null;
      try { e = P ? P.ler(this.empresa()).escalas : null; } catch (x) { e = null; }
      var n = parseInt(String((e && (tipo === "planta" ? e.planta_forma : e.corte_forma)) || "1:50").split(":")[1], 10);
      return n > 0 ? n : 50;
    },
    /* a escala é travada quando um modelo de vista manda nela (não se muda por fora) */
    escalaTravada: function (id) {
      var M = global.BimModeloVista; if (!M || !M.ativo || !M.ativo()) return false;
      try { var v = M.estado().vistas[id]; if (!v) return false; var ef = M.efetivo(v, M.estado()); return !!(ef.travados && ef.travados.escala); } catch (e) { return false; }
    },
    /* a escala travada veio de um modelo de vista RA (o padrão da vista criada), não de um modelo do usuário? */
    travaSolta: function (id) {
      var M = global.BimModeloVista; if (!M || !M.ativo || !M.ativo()) return false;
      try { var est = M.estado(), v = est.vistas[id], m = v && v.modeloId ? M.modelo(est, v.modeloId) : null; return !!(m && m.ra); } catch (e) { return false; }
    },
    /* solta a vista do modelo de vista RA: leva os parâmetros dele UMA vez (aplicar) e desliga o vínculo — a escala volta a ser da vista */
    soltarEscala: function (id) {
      var M = global.BimModeloVista; if (!M || !this.travaSolta(id)) return false;
      try { var est = M.estado(), v = est.vistas[id], m = M.modelo(est, v.modeloId); M.aplicarModelo(v, m); M.vincularModelo(v, null); M.gravar(); return true; } catch (e) { return false; }
    },
    definirEscala: function (id, esc) {
      var b2 = B2(), M = global.BimModeloVista; if (!b2 || this.escalaTravada(id)) return false;
      try {
        b2.estilo(id);
        b2.estado().estilos[id].escala = esc;
        if (M && M.ativo && M.ativo()) { var v = M.vistaObj(id, b2.def(id)); if (v) v.escala = esc; }
        b2._gravar();
      } catch (x) { return false; }
      this._esquecerDesenhos(id);
      try { if (b2._cache[id]) b2.redesenhar(id, false); } catch (e2) {}
      return true;
    },
    gerar: function (opts) {
      opts = opts || {};
      /* PRANCHA VIVA (js/pranchavivaui.js gerarDoModelo, 23/10/2026): o módulo é "só visualiza" e pode ser comprado sem o
         modelador — o jogo de pranchas do modelo aberto também sai para ele (a trava é a do módulo, conferida lá) */
      var podePv = !!(opts.pranchaViva && PR() && UI2() && PR().colocarViewport && PR().gerarJogo && global.PranchaVivaModulo && global.PranchaVivaModulo.liberado());
      if (!this.ativo() && !podePv) return null;
      var self = this, PRm = PR(), b2 = B2(), g = this.G();
      var todas = this.vistasParaGerar(opts.disciplina), ids = opts.vistas ? opts.vistas.map(String) : null;

      var escolhidas = todas.filter(function (v) { return !ids || ids.indexOf(v.id) >= 0; });
      var semInstGer = this.discSemTubo(opts.disciplina) ? String(opts.disciplina).toLowerCase() : "";   /* arquitetura/estrutural: os VIEWPORTS gerados levam b.semInst (sem tubo); "Todas"/Hidráulica/…: o tubo fica */
      if (!escolhidas.length) { toast("Nenhuma vista para pôr em folha: crie as plantas, os cortes ou as elevações (Navegador › Vistas).", "aviso"); return null; }
      /* FORMATO AUTOMÁTICO (23/10/2026, opts.formato "auto"): o menor formato (A3 → A0) onde tudo cabe em escala legível, e a escala
         travada por um modelo de vista RA (o que a vista criada já traz, não uma escolha) vira ponto de partida — desce a escala
         ou sobe o formato, e a mensagem diz o que foi escolhido. Só com a prancha SEM folha feita à mão (mudar o formato bagunçaria
         a dela): com folha à mão, vale o formato da prancha e a escala sobe como antes. O formato explícito segue como sempre. */
      var auto = opts.formato === "auto";
      var reg = this.conjunto(auto ? null : opts.formato), formato = PRm.FORMATOS[opts.formato] ? opts.formato : (reg.formato || "A1");
      if (auto && PRm.normalizar(reg).folhas.some(function (f) { return !f.auto; })) auto = false;
      var outras = this.registros().filter(function (r) { return !reg.id || String(r.id) !== String(reg.id); }), soltas = [], avisoFormato = "";
      function vistas(fixas) {
        return escolhidas.filter(function (v) { return !fixas || fixas[v.id]; }).map(function (v) {
          var trav = self.escalaTravada(v.id), dz = self.desenho(v.id, true, undefined, semInstGer), esc = fixas ? fixas[v.id] : self.escalaPadrao(v.tipo);
          if (trav) { try { esc = b2.estilo(v.id).escala; } catch (e) {} }
          return { id: v.id, nome: dz ? dz.nome : v.nome, tipo: v.tipo, disciplina: v.disciplina, ordem: v.ordem, escala: esc, fixa: !!fixas || (trav && !(auto && self.travaSolta(v.id))),
                   caixa: dz ? { w: dz.vb.w, h: dz.vb.h } : null };
        });
      }
      var r1;
      if (auto) {
        var ga = PRm.gerarJogoAuto({ base: reg, vistas: vistas(null), outras: outras, folga: 0.9 });
        r1 = ga.resultado; formato = ga.formato; avisoFormato = ga.aviso;
      } else r1 = PRm.gerarJogo({ formato: formato, base: reg, vistas: vistas(null), outras: outras, folga: 0.9 });
      Object.keys(r1.escalas).forEach(function (id) {
        var e0 = null; try { e0 = b2.estilo(id).escala; } catch (e) {}
        if (e0 === r1.escalas[id]) return;
        if (auto && self.escalaTravada(id) && self.travaSolta(id) && self.soltarEscala(id)) soltas.push(id);
        self.definirEscala(id, r1.escalas[id]);
      });
      var r = PRm.gerarJogo({ formato: formato, base: reg, vistas: vistas(r1.escalas), outras: outras, folga: 1 });
      r.puladas = r1.puladas.concat(r.puladas);
      var pr = r.prancha; pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      /* a marca "sem tubo" mora no VIEWPORT gerado (folhas automáticas desta geração), não na vista */
      var idsEsc = {}; escolhidas.forEach(function (v) { idsEsc[String(v.id)] = 1; });
      pr.folhas.forEach(function (f) { if (!f.auto) return; (f.blocos || []).forEach(function (bl) { if (bl.tipo !== "viewport" || !idsEsc[String(bl.vistaId)]) return; if (semInstGer) bl.semInst = semInstGer; else delete bl.semInst; }); });
      if (!pr.id) delete pr.id;
      var salvo = this.salvarRegistro(pr); if (!salvo) return null;
      this._repintarTodas(); this._renomearAbas();
      var primeira = pr.folhas.filter(function (f) { return !!f.auto; })[0];
      if (primeira && opts.abrir !== false) this.abrir(this.idFolha(salvo.id, primeira.id));
      var nomeDe = {}; escolhidas.forEach(function (v) { nomeDe[v.id] = v.nome; });
      var escTxt = ""; if (auto) { var escSet = {}; Object.keys(r1.escalas).forEach(function (id) { escSet[r1.escalas[id]] = 1; }); escTxt = " Escalas: " + Object.keys(escSet).map(Number).sort(function (a, b) { return a - b; }).map(function (e) { return "1:" + e; }).join(", ") + "."; }
      var msg = "Pranchas geradas em " + formato + (auto ? " (formato automático)" : "") + ": " + r.criadas + " folha(s) nova(s), " + r.atualizadas + " atualizada(s)" + (r.puladas.length ? "; fora: " + r.puladas.map(function (p) { return p.nome + " (" + p.motivo + ")"; }).join("; ") : "") + "." +
        (auto ? " " + avisoFormato + escTxt : "") +
        (soltas.length ? " Escala solta do modelo de vista RA (para caber): " + soltas.map(function (id) { return (nomeDe[id] || id) + " em 1:" + r1.escalas[id]; }).join(", ") + "." : "");
      toast(msg, r.puladas.length ? "aviso" : "ok"); status(msg);
      return { ok: true, id: salvo.id, criadas: r.criadas, atualizadas: r.atualizadas, puladas: r.puladas, escalas: r1.escalas, folhas: pr.folhas.length, conferir: PRm.conferir(pr),
               formato: formato, automatico: auto, aviso: auto ? avisoFormato : "", soltas: soltas, mensagem: msg };
    },
    /* PRANCHAS DO HIDRO PELO BOTÃO GERAL (13/11/2026). Roteiro do defeito: o dono gerou o hidro pelo "Gerar pranchas" do BIM
       e saíram 8 folhas A1 genéricas para um banheiro (sem diâmetro, sem altura de ponto, sem tag de conexão, sem quadro),
       porque o jogo geral só enquadra vistas; o projeto hidrossanitário completo (planta por sistema, isométrico, cortes das
       paredes hidráulicas, detalhes, quadro de materiais) mora no js/hidpranchas.js e só abria pelo painel de cálculo.
       ⚠ Não duplicar o gerador aqui: só a porta. Sem resultado, dimensiona antes (o mesmo botão Dimensionar do painel). */
    temHidro: function () {
      var H = global.HidCalcUI; if (!H || !H.pranchas) return false;
      try { var m = H.modeloAtual && H.modeloAtual(); var ins = m && m.estado && m.estado.instalacoes; return !!(ins && arr(ins.trechos).length); } catch (e) { return false; }
    },
    pranchasHidro: function () {
      var H = global.HidCalcUI; if (!H || !H.pranchas) { toast("O módulo hidrossanitário não está carregado.", "erro"); return false; }
      if (!(H.estado && H.estado.resultado)) {
        var R = H.dimensionar ? H.dimensionar() : null;
        if (!R) { toast((H.estado && H.estado.msg && H.estado.msg.t) || "Não consegui dimensionar o hidrossanitário: abra Instalações › Hidro e confira.", "erro"); return false; }
      }
      var ok = H.pranchas();
      if (!ok && H.estado && H.estado.msg) toast(H.estado.msg.t, H.estado.msg.k === "erro" ? "erro" : "aviso");
      return ok;
    },
    /* depois do Gerar: o CAD único (e/ou o DWG) do conjunto recém-gerado, da mesma geração */
    cadDoGerar: function (regId, q, disc) {
      var reg = this.registros().filter(function (r) { return String(r.id) === String(regId); })[0]; if (!reg || !reg.folhas || !reg.folhas.length) return null;
      var f0 = PR().normalizar(reg).folhas[0], c = this.cadDoRegistro(this.idFolha(reg.id, f0.id), { disciplina: disc === "todas" ? "geral" : disc }); if (!c || !c.o || !global.BimCadUI) return null;
      c.saidas.forEach(function (sd) {
        if (q.cad) global.BimCadUI.baixarCad(sd.o, { base: sd.base });
        if (q.dwg) global.BimCadUI.baixarDwg(sd.o, { base: sd.base, partes: sd.partes });
      });
      return c;
    },
    /* a pergunta mínima: o formato e quais vistas (todas marcadas) */
    abrirGerar: function () {
      if (!this.ativo()) return false;
      var self = this, vs = this.vistasParaGerar(), reg = this.registros().filter(function (r) { return r.origem === "folhas"; })[0], f0 = (reg && reg.formato) || "A1";
      if (!vs.length) { toast("Nenhuma planta, corte ou elevação ainda: abra o modelo da obra e crie as vistas (Navegador › Vistas).", "aviso"); return false; }
      var DISC = { arquitetura: "Arquitetura", estrutural: "Estrutural", hidraulica: "Hidráulica", eletrica: "Elétrica", mecanica: "Mecânica", coordenacao: "Coordenação" };
      /* DISCIPLINA: abre na Arquitetura (a 1ª que tem vista); só as vistas dela vêm marcadas. "Todas" é escolha explícita. */
      var temDisc = {}; vs.forEach(function (v) { temDisc[v.disciplina] = 1; });
      var disc0 = temDisc.arquitetura ? "arquitetura" : (Object.keys(temDisc)[0] || "arquitetura");
      var TIPO = { planta: "planta", corte: "corte", elevacao: "elevação" };
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Escolha a <b>disciplina</b>: a folha de arquitetura não leva a tubulação do hidro. Uma folha por planta; os cortes e as elevações juntos. Escala do Padrão de detalhamento (1:50) ou a maior que couber; carimbo do escritório; numeração código-nn. Gerar de novo <b>atualiza</b> as mesmas folhas (não duplica) e não mexe nas folhas feitas à mão.</p>' +
        '<label style="font-size:12.5px">Formato <select id="pv-ger-formato">' + ["A0", "A1", "A2", "A3", "A4", "auto"].map(function (f) { return '<option value="' + f + '"' + (f === f0 ? " selected" : "") + ">" + (f === "auto" ? "Automático (o menor onde tudo cabe)" : f) + "</option>"; }).join("") + "</select></label>" +
        ' <label style="font-size:12.5px;margin-left:12px">Disciplina <select id="pv-ger-disc">' + Object.keys(temDisc).map(function (k) { return '<option value="' + esc(k) + '"' + (k === disc0 ? " selected" : "") + ">" + esc(DISC[k] || k) + "</option>"; }).join("") + '<option value="todas">Todas</option></select></label>' +
        '<div style="margin-top:8px;max-height:46vh;overflow:auto">' + vs.map(function (v) {
          return '<label data-pv-disc="' + esc(v.disciplina) + '" style="display:' + (v.disciplina === disc0 ? "block" : "none") + ';font-size:12.5px;padding:2px 0"><input type="checkbox"' + (v.disciplina === disc0 ? " checked" : "") + ' data-pv-ger="' + esc(v.id) + '"> ' + esc(v.nome) + ' <span class="muted">(' + esc(DISC[v.disciplina] || v.disciplina) + " · " + esc(TIPO[v.tipo] || v.tipo) + ")</span></label>";
        }).join("") + "</div>" +
        (global.BimCadUI ? '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px;margin-top:8px"><legend><b>Saída CAD</b></legend>' + global.BimCadUI.opcoesHtml("pvg") + "</fieldset>" : "");
      if (this.temHidro()) h = '<p style="font-size:12.5px;margin:0 0 8px;padding:6px 8px;border-left:3px solid var(--primary,#0b5)"><b>Projeto hidrossanitário:</b> use <b>Hidrossanitário completo</b> — planta por sistema com diâmetro e declividade, isométrico, cortes das paredes com a altura de cada ponto, detalhes e quadro de materiais. Esta lista abaixo só enquadra as vistas.</p>' + h;
      global.UI.modal("Gerar pranchas", h, (this.temHidro() ? [{ texto: "Hidrossanitário completo", classe: "primary", onClick: function () { global.UI.fecharModal(); self.pranchasHidro(); } }] : []).concat([
        { texto: "Gerar", classe: this.temHidro() ? "" : "primary", onClick: function () {
          var qCad = { cad: !!document.querySelector('[data-pvg-out="cad"]:checked'), dwg: !!document.querySelector('[data-pvg-out="dwg"]:checked:not(:disabled)') };
          var fm = (document.getElementById("pv-ger-formato") || {}).value || f0;
          var dsel = (document.getElementById("pv-ger-disc") || {}).value || disc0;
          var ids = [].slice.call(document.querySelectorAll("[data-pv-ger]")).filter(function (c) { var lb = c.parentNode; return c.checked && (dsel === "todas" || (lb && lb.getAttribute("data-pv-disc") === dsel)); }).map(function (c) { return c.getAttribute("data-pv-ger"); });
          global.UI.fecharModal();
          if (!ids.length) { toast("Marque ao menos uma vista.", "aviso"); return; }
          var rg = self.gerar({ formato: fm, vistas: ids, disciplina: dsel === "todas" ? "" : dsel });
          if (rg && rg.ok && (qCad.cad || qCad.dwg)) self.cadDoGerar(rg.id, qCad, dsel);
        } },
        { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]));
      try { if (global.BimCadUI) global.BimCadUI.ligar(document, "pvg"); } catch (eC) { /* sem a sonda do DWG */ }
      /* trocar a disciplina mostra só as vistas dela e marca todas elas (as das outras ficam desmarcadas) */
      setTimeout(function () {
        var sel = document.getElementById("pv-ger-disc"); if (!sel) return;
        function aplicar() { [].slice.call(document.querySelectorAll("[data-pv-disc]")).forEach(function (lb) { var vale = sel.value === "todas" || lb.getAttribute("data-pv-disc") === sel.value; lb.style.display = vale ? "block" : "none"; var c = lb.querySelector("input"); if (c) c.checked = vale; }); }
        sel.addEventListener("change", aplicar);
      }, 0);
      return true;
    },
    /* "Pranchas" (barra de título): onde ficam as folhas e o que fazer com elas */
    painel: function () {
      if (!this.ativo()) return false;
      var self = this, itens = [];
      this.registros().forEach(function (r) { var pr = PR().normalizar(r); pr.folhas.forEach(function (f) { itens.push({ id: self.idFolha(r.id, f.id), rot: self.nomeFolha(pr, f), formato: pr.formato, modelo: pr.carimbo.modelo }); }); });
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">As pranchas do projeto também ficam no <b>Navegador de projeto › Folhas (todas)</b> e na fita <b>Vista › Composição da folha</b>.</p>' +
        (itens.length ? itens.map(function (it) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px"><span style="flex:1">' + esc(it.rot) + ' <span class="muted">' + esc(it.formato) + (it.modelo === "RA" ? " · carimbo RA" : "") + '</span></span><button class="btn sm" data-pv-abrir="' + esc(it.id) + '">Abrir</button></div>';
        }).join("") : '<p style="font-size:13px">Nenhuma folha ainda. <b>Gerar pranchas</b> monta o jogo do modelo aberto — plantas, cortes e elevações — com o carimbo do escritório.</p>');
      global.UI.modal("Pranchas do projeto", h, [
        { texto: "Gerar pranchas", classe: "primary", onClick: function () { global.UI.fecharModal(); self.abrirGerar(); } }].concat(
        /* PRANCHA VIVA (js/pranchavivaui.js): a folha que abre o 3D no ponto tocado */
        global.PranchaVivaUI ? [{ texto: "Prancha Viva", onClick: function () { global.UI.fecharModal(); global.PranchaVivaUI.abrir(); } }] : []).concat(
        self.temHidro() ? [{ texto: "Hidrossanitário completo", onClick: function () { global.UI.fecharModal(); self.pranchasHidro(); } }] : []).concat([
        { texto: "Pranchas de arquitetura", onClick: function () { global.UI.fecharModal(); if (global.ArqPranchasUI) global.ArqPranchasUI.abrir(); } },
        { texto: "Nova folha", onClick: function () { global.UI.fecharModal(); self.novaFolha(); } },
        { texto: "PDF em lote", onClick: function () { global.UI.fecharModal(); self.pdfLote(); } },
        { texto: "Fechar", onClick: function () { global.UI.fecharModal(); } }]));
      [].forEach.call(document.querySelectorAll("[data-pv-abrir]"), function (b) { b.onclick = function () { global.UI.fecharModal(); self.abrir(b.getAttribute("data-pv-abrir")); }; });
      return true;
    },

    /* --------------------------------------------- Navegador e fita */
    ramoNavegador: function () {
      if (!this.ativo()) return null;
      var self = this, regs = this.registros(), filhos = [], n = 0;
      regs.forEach(function (r) {
        var pr = PR().normalizar(r);
        pr.folhas.forEach(function (f) {
          n++;
          var id = self.idFolha(r.id, f.id);
          filhos.push({ id: "fl:" + id, rotulo: self.nomeFolha(pr, f) + (regs.length > 1 ? " (" + pr.nome + ")" : ""), icone: "prancha", fn: function () { self.abrir(id); },
            menu: [{ id: "fl-abrir", rotulo: "Abrir", fn: function () { self.abrir(id); } }, { id: "fl-duplicar", rotulo: "Duplicar folha", fn: function () { self.duplicarFolha(id); } },
                   { id: "fl-pdf", rotulo: "Gerar PDF desta folha", fn: function () { self.pdfVetorial([id]); } }, { id: "fl-excluir", rotulo: "Excluir folha…", fn: function () { self.excluirFolha(id); } }] });
        });
      });
      /* as ações ficam À VISTA no nó (o dono não achava onde ficam as pranchas) */
      filhos.unshift({ id: "fl:gerar", rotulo: "Gerar pranchas…", icone: "prancha", fn: function () { self.abrirGerar(); } });
      /* PRANCHA VIVA: a folha → o 3D no ponto tocado (o comando da fita, com a trava do módulo) */
      if (global.PranchaVivaUI) filhos.unshift({ id: "fl:viva", rotulo: "Prancha Viva (folha → 3D)", icone: "prancha", acao: "prancha-viva" });
      if (global.ArqPranchasUI) filhos.splice(1, 0, { id: "fl:gerar-arq", rotulo: "Gerar pranchas de arquitetura…", icone: "prancha", fn: function () { global.ArqPranchasUI.abrir(); } });
      if (global.ArqPranchasUI && global.ArqPranchasUI.abrirArranjo) filhos.splice(2, 0, { id: "fl:arranjo-arq", rotulo: "Arranjo das folhas de arquitetura…", icone: "prancha", fn: function () { global.ArqPranchasUI.abrirArranjo(); } });
      filhos.push({ id: "fl:nova", rotulo: "+ Nova folha", icone: "prancha", fn: function () { self.novaFolha(); } });
      var ua = this.ultimaApagada(); if (ua) filhos.push({ id: "fl:desfazer-excl", rotulo: "↩ Desfazer exclusão: " + ua.nome, icone: "prancha", fn: function () { self.desfazerExclusao(); } });
      return { id: "folhas", rotulo: "Folhas (todas)", icone: "prancha", n: n, aberto: true, filhos: filhos };
    },
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this, R = global.BimRibbon;
      R.acrescentar("vista", "Vista", "Composição da folha", [
        { id: "gerar-pranchas", rotulo: "Gerar\npranchas", icone: "prancha", grande: true, dica: "Monta o jogo de folhas do modelo aberto num clique: uma folha por planta, os cortes e as elevações juntos, na escala do Padrão de detalhamento (1:50 ou a que couber), centralizados, com o carimbo do escritório e numeração código-nn. Gerar de novo atualiza as mesmas folhas." },
        { id: "nova-folha", rotulo: "Folha", icone: "prancha", grande: true, dica: "Folha nova (A1, carimbo RA) no conjunto \"Folhas do projeto\" da obra. Arraste uma planta ou um corte do Navegador para dentro dela: a vista entra em ESCALA, em vetor, com o título de vista." },
        { id: "posicionar-vista", rotulo: "Posicionar\nvista", icone: "planta", grande: true, dica: "Escolhe uma planta ou um corte e põe na folha aberta (o mesmo que arrastar do Navegador)." },
        { id: "revisoes-folha", rotulo: "Revisões", icone: "lista", dica: "Revisões e emissões do PROJETO (número, data, descrição, emitido por/para). Cada folha escolhe as dela; a última vira a Revisão atual do carimbo." },
        { id: "lista-folhas", rotulo: "Lista de\nfolhas", icone: "tabela", dica: "A tabela da categoria Folhas: número, nome, revisão atual, data de emissão, desenhado por. Pode ir para a folha aberta." },
        { id: "lista-vistas", rotulo: "Lista de\nvistas", icone: "tabela", dica: "Todas as plantas e cortes, com a escala e a folha/número de detalhe onde estão." },
        { id: "construir-demolir", rotulo: "Construir e\nDemolir", icone: "prancha", grande: true, dica: "Gera a prancha de reforma do nível: a planta com o demolir em verde tracejado, a alvenaria nova em vermelho e o existente em cinza, a legenda só com o que existe no modelo, as notas padrão (editáveis) e o quadro de demolição. A fase de cada peça é a do BIM (Fase criada / Fase demolida, nas Propriedades); o projeto de reforma liga em Gerenciar › Fases." },
        { id: "tabela-demolicao", rotulo: "Tabela de\ndemolição", icone: "tabela", dica: "m² de parede a demolir e de piso a remover por ambiente, lidos da geometria do modelo. Pode ir para a folha aberta." },
        { id: "tabela-construcao", rotulo: "Tabela de\nconstrução", icone: "tabela", dica: "m² de parede nova (alvenaria e drywall) por ambiente, lidos da geometria. Pode ir para a folha aberta." },
        { id: "tabela-esquadrias", rotulo: "Portas e\njanelas", icone: "tabela", dica: "Cada porta e janela com a marca, o tipo e a fase (Existente, Nova, A demolir). Pode ir para a folha aberta." }
      ]);
      R.acrescentar("vista", "Vista", "Exportar", [
        { id: "exportar-dxf", rotulo: "DXF", icone: "exportar", grande: true, dica: "DXF da folha aberta (em mm de papel, carimbo completo) ou da planta/corte aberto (1:1 em metros). Camada por categoria (ARQ-PAREDE-CORTE, EST-PILAR-CORTE…), espessura pela pena, cota que o AutoCAD mede de novo." },
        { id: "exportar-cad", rotulo: "CAD\núnico", icone: "exportar", grande: true, dica: "Arquivo CAD único do conjunto de folhas aberto: DXF com o MODEL em escala real e um layout por folha (viewport travada na escala de cada vista), mais o CTB das penas da disciplina (RA_Hidrossanitario.ctb nas pranchas do hidro, RA_Geral.ctb nas demais)." },
        { id: "exportar-dwg", rotulo: "DWG", icone: "exportar", dica: "DWG do conjunto de folhas aberto (app instalado: o conversor roda neste computador). Sem o app, explica e entrega o arquivo CAD único em DXF (o AutoCAD salva em DWG)." },
        { id: "pdf-lote", rotulo: "PDF em\nlote", icone: "imprimir", grande: true, dica: "Várias folhas num PDF só, cada uma no tamanho do papel, com o nome automático (número - nome - revisão)." }
      ]);
      R.acrescentar("vista", "Vista", "Vista 3D e folha", [
        { id: "travar-vista", rotulo: "Travar\nvista", icone: "cadeado", grande: true, dica: "Trava a câmera do 3D (cadeado): ela não gira nem dá zoom por engano. Clique de novo para destravar." },
        { id: "salvar-vista-3d", rotulo: "Salvar como\nvista 3D", icone: "camera", grande: true, dica: "Guarda a câmera, o ângulo, os cortes e o estilo do 3D como uma vista com nome (3D - Isométrica 1…) em Navegador › Vistas 3D. Arraste-a para uma folha." },
        { id: "duplicar-folha", rotulo: "Duplicar\nfolha", icone: "prancha", grande: true, dica: "Cópia da folha aberta com as mesmas vistas e o mesmo carimbo, número seguinte e nome \"… (cópia)\"." },
        { id: "excluir-folha", rotulo: "Excluir\nfolha", icone: "lixeira", grande: true, dica: "Exclui a folha aberta (com confirmação; as vistas continuam no projeto). Dá para desfazer em Navegador › Folhas." }
      ]);
      reg["travar-vista"] = function () { var g = self.G(); return !!(g && g._bimVistaTravar && g._bimVistaTravar() !== null); };
      reg["salvar-vista-3d"] = function () { var g = self.G(); return !!(g && g._bimVistaSalvar3d && g._bimVistaSalvar3d()); };
      reg["duplicar-folha"] = function () { var g = self.G(), st = g && g._bimVxEst && g._bimVxEst(); if (!st || !self.ehFolha(st.ativa)) { toast("Abra uma folha para duplicar.", "aviso"); return false; } return !!self.duplicarFolha(st.ativa); };
      reg["excluir-folha"] = function () { var g = self.G(), st = g && g._bimVxEst && g._bimVxEst(); if (!st || !self.ehFolha(st.ativa)) { toast("Abra uma folha para excluir.", "aviso"); return false; } return !!self.excluirFolha(st.ativa); };
      reg["gerar-pranchas"] = function () { return self.abrirGerar(); };
      reg["nova-folha"] = function () { return !!self.novaFolha(); };
      reg["posicionar-vista"] = function () { self.escolherVista(); return true; };
      reg["revisoes-folha"] = function () { self.editarRevisoes(); return true; };
      reg["lista-folhas"] = function () { self.mostrarLista("folhas"); return true; };
      reg["lista-vistas"] = function () { self.mostrarLista("vistas"); return true; };
      reg["construir-demolir"] = function () { return !!self.gerarConstruirDemolir(); };
      reg["tabela-demolicao"] = function () { self.mostrarLista("demolicao"); return true; };
      reg["tabela-construcao"] = function () { self.mostrarLista("construcao"); return true; };
      reg["tabela-esquadrias"] = function () { self.mostrarLista("esquadrias"); return true; };
      reg["exportar-dxf"] = function () { return !!self.exportarDxf(); };
      reg["exportar-cad"] = function () { return !!self.exportarCad(); };
      reg["exportar-dwg"] = function () { self.exportarDwg(); return true; };
      reg["pdf-lote"] = function () { return !!self.pdfLote(); };
      return true;
    },
    /* o Navegador começa o arraste de uma vista (js/bimshell.js, nó com `arrastar`) */
    arrastarInicio: function (ev, vistaId) {
      try { ev.dataTransfer.setData(TIPO_ARRASTE, vistaId); ev.dataTransfer.setData("text/plain", vistaId); ev.dataTransfer.effectAllowed = "copy"; } catch (e) {}
    },
    TIPO_ARRASTE: TIPO_ARRASTE
  };

  global.BimFolhaUI = BimFolhaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFolhaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
