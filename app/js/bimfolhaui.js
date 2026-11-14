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
      else this._marcar(r);
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
    desenho: function (vistaId, refazer, escala) {
      /* ⚠ O DESENHO É DA OBRA (revisão da Prancha Viva, 23/10/2026): o id da vista ("d2p-pav0", "d2c-…") se repete em toda
         obra, e o cache era só por id — abrir a obra A, trocar para a B e a folha da B mostrava a planta da A; o pacote do
         link da Prancha Viva levava essa imagem ao celular do cliente da obra B (tools/test-pranchaviva-rev.js [a]) */
      var obraK = this.obraKey();
      if (this._desenhosObra !== obraK) { this._desenhos = {}; this._desenhosObra = obraK; }
      var chave = escala ? vistaId + "@" + escala : vistaId;
      if (!refazer && this._desenhos[chave]) return this._desenhos[chave];
      var b2 = B2(), D = D2(); if (!b2 || !D) return null;
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e0) {}
      var d = b2.def(vistaId); if (!d) return null;
      var c = b2._cache[vistaId], bruto = (c && c.dados && !refazer) ? c.dados : b2._extrair(d);
      if (!bruto || !bruto.ok) return null;
      var an = b2._anotar(d, bruto); an.linhasIfc = bruto.linhasIfc || [];
      var est = clone(b2.estilo(vistaId)); est.titulo = false;
      if (escala) est.escala = Math.max(1, Math.round(+escala));   /* a cópia com escala própria: anotação do tamanho certo nela */   /* o título é o do viewport */
      var exF = { titulo: "" };
      /* NÍVEL DE DETALHE / P6: a folha sai com as PENAS e as cores das linhas da vista (a tubulação em linha única na cor
         do sistema, como na tela) — sem isto a planta de instalações saía toda na mesma pena preta */
      /* JUNÇÃO 18/10/2026: só com a prévia ?previa=hidro — a P6 na folha muda a pena de TODA a planta (parede, porta, viga
         acima do corte); sem a prévia a folha sai como no master (e2e-bim-acima-corte, test-traco-tela) */
      var comHidroF = false; try { comHidroF = !!(global.BimPrevia && BimPrevia.hidro && BimPrevia.hidro()); } catch (eH) {}
      try { var M6 = b2._p6 ? b2._p6() : null; if (comHidroF && M6 && M6.extraSvg && bruto.p6Estilos) exF = M6.extraSvg(vistaId, bruto, exF) || exF; } catch (eP6) {}
      /* CORES POR CATEGORIA: a folha sai SEM as cores, a menos que a vista peça "imprimir com as cores" (js/bimcorescatui.js) */
      try { var cf = global.BimCoresCatUI ? global.BimCoresCatUI.paraImpressao(vistaId, bruto, exF) : null; if (cf) { an = b2._anotar(d, cf); an.linhasIfc = bruto.linhasIfc || []; } } catch (eCF) { exF = { titulo: "" }; }
      var res = D.svg(an, est, exF);
      /* `def`: a vista COMO ESTAVA ao desenhar (a Prancha Viva tira a matriz dela: desenho e matriz sempre da mesma vista) */
      var o = { vistaId: vistaId, nome: d.nome, tipo: d.tipo, dados: an, estilo: est, svg: res.svg, vb: res.vb, pena: est.pena, penasPx: D.PENAS[est.pena], escala: est.escala, def: (function () { try { return clone(d); } catch (eDf) { return null; } })() };
      this._desenhos[chave] = o;
      return o;
    },
    /* a chave do desenho de UMA cópia: com escala própria a anotação (texto, cota, marca) sai do tamanho certo
       naquela escala — o desenho é refeito nela, não esticado */
    chaveVp: function (b) { return b && b.escalaPropria ? b.vistaId + "@" + b.escala : b.vistaId; },
    desenhoVp: function (b, refazer) { return b.escalaPropria ? this.desenho(b.vistaId, refazer, b.escala) : this.desenho(b.vistaId, refazer); },
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
      var a = this.achar(id); if (!a) return { ok: false, erro: "Folha não encontrada." };
      var b2 = B2(); if (!b2 || !b2.ehVista2d(vistaId)) { toast("Arraste uma planta ou um corte do Navegador (Vistas › Plantas de piso / Cortes).", "aviso"); return { ok: false, erro: "não é vista 2D" }; }
      var dz = this.desenho(vistaId, true);
      if (!dz) { toast("Não consegui desenhar a vista: abra o modelo da obra primeiro.", "erro"); return { ok: false, erro: "sem desenho" }; }
      var todas = this.registros().map(function (r) { return PR().normalizar(r); });
      /* a folha montada à mão aceita a MESMA vista mais de uma vez (cada cópia com escala e recorte próprios) */
      var r = PR().colocarViewport(a.pr, a.folha, { vistaId: vistaId, nome: dz.nome, escala: dz.escala, caixa: { w: dz.vb.w, h: dz.vb.h }, cx: cx, cy: cy, repetir: true }, todas);
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      this.gravarFolha(a, r.folha);
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
    trocarEscala: function (id, ix, escala) {
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
      if (this._foraDaArea(a, f, ix)) toast("Nesta escala parte da vista sai da área de desenho: arraste ou recorte (alça do canto).", "aviso");
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
      var self = this; Object.keys(this._desenhos).forEach(function (k) { if (k === self._ativada || k.indexOf(self._ativada + "@") === 0) delete self._desenhos[k]; });
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
      outros.push({ id: "pdf", rotulo: "PDF desta folha", tipo: "botao", rotuloBotao: "Imprimir / PDF", fn: function () { self.pdf([id]); } });
      outros.push({ id: "dxf", rotulo: "DXF desta folha", tipo: "botao", rotuloBotao: "Exportar DXF", fn: function () { self.exportarDxf(id); } });
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
          var vps = {}, self = this;
          a.folha.blocos.forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenhoVp(b); if (dz) vps[self.chaveVp(b)] = { dados: dz.dados, estilo: dz.estilo, vb: dz.vb, svgSemTitulo: dz.svg }; } });
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
    exportarDwg: function () {
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
    pdfLote: function () {
      var self = this, regs = this.registros().filter(function (r) { return r.origem === "folhas" || arr(r.folhas).some(function (f) { return arr(f.blocos).some(function (b) { return b.tipo === "viewport"; }); }); });
      var itens = [];
      regs.forEach(function (r) { var pr = PR().normalizar(r); pr.folhas.forEach(function (f) { itens.push({ id: self.idFolha(r.id, f.id), rot: self.nomeFolha(pr, f), arq: PR().nomeArquivo(pr, f, self.projeto(), "pdf") }); }); });
      if (!itens.length) { toast("Nenhuma folha ainda: Vista › Folha.", "aviso"); return null; }
      global.UI.modal("PDF em lote", '<p class="muted" style="font-size:12px;margin:0 0 6px">As folhas marcadas saem num documento só, cada uma no tamanho do papel dela. Nome automático: número - nome - revisão.</p>' +
        itens.map(function (it) { return '<label style="display:block;font-size:12.5px;padding:2px 0"><input type="checkbox" checked data-pv-lote="' + esc(it.id) + '"> ' + esc(it.rot) + ' <span class="muted">(' + esc(it.arq) + ")</span></label>"; }).join(""),
        [{ texto: "Imprimir / PDF", classe: "primary", onClick: function () {
          var ids = [].slice.call(document.querySelectorAll("[data-pv-lote]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-lote"); });
          global.UI.fecharModal(); self.pdf(ids);
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      return itens;
    },
    /* posicionar sem arrastar (toque, teclado): escolhe a vista numa lista */
    escolherVista: function () {
      var self = this, g = this.G(), st = g && g._bimVxEst(), id = st && st.ativa;
      if (!this.ehFolha(id)) { toast("Abra uma folha primeiro (Navegador › Folhas ou Vista › Folha).", "aviso"); return; }
      var vs = this.vistas2d(); if (!vs.length) { toast("Nenhuma planta ou corte ainda.", "aviso"); return; }
      global.UI.modal("Posicionar vista", vs.map(function (v) { return '<label style="display:block;font-size:12.5px;padding:3px 0"><input type="radio" name="pv-vs" value="' + esc(v.id) + '"> ' + esc(v.nome) + " · 1:" + esc(v.escala) + "</label>"; }).join(""),
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
    vistasParaGerar: function () {
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
      delete this._desenhos[id];
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
      var todas = this.vistasParaGerar(), ids = opts.vistas ? opts.vistas.map(String) : null;
      var escolhidas = todas.filter(function (v) { return !ids || ids.indexOf(v.id) >= 0; });
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
          var trav = self.escalaTravada(v.id), dz = self.desenho(v.id, true), esc = fixas ? fixas[v.id] : self.escalaPadrao(v.tipo);
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
    /* a pergunta mínima: o formato e quais vistas (todas marcadas) */
    abrirGerar: function () {
      if (!this.ativo()) return false;
      var self = this, vs = this.vistasParaGerar(), reg = this.registros().filter(function (r) { return r.origem === "folhas"; })[0], f0 = (reg && reg.formato) || "A1";
      if (!vs.length) { toast("Nenhuma planta, corte ou elevação ainda: abra o modelo da obra e crie as vistas (Navegador › Vistas).", "aviso"); return false; }
      var DISC = { arquitetura: "Arquitetura", estrutural: "Estrutural", hidraulica: "Hidráulica", eletrica: "Elétrica", mecanica: "Mecânica", coordenacao: "Coordenação" };
      var TIPO = { planta: "planta", corte: "corte", elevacao: "elevação" };
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Uma folha por planta; os cortes e as elevações juntos. Escala do Padrão de detalhamento (1:50) ou a maior que couber; carimbo do escritório; numeração código-nn. Gerar de novo <b>atualiza</b> as mesmas folhas (não duplica) e não mexe nas folhas feitas à mão.</p>' +
        '<label style="font-size:12.5px">Formato <select id="pv-ger-formato">' + ["A0", "A1", "A2", "A3", "A4", "auto"].map(function (f) { return '<option value="' + f + '"' + (f === f0 ? " selected" : "") + ">" + (f === "auto" ? "Automático (o menor onde tudo cabe)" : f) + "</option>"; }).join("") + "</select></label>" +
        '<div style="margin-top:8px;max-height:46vh;overflow:auto">' + vs.map(function (v) {
          return '<label style="display:block;font-size:12.5px;padding:2px 0"><input type="checkbox" checked data-pv-ger="' + esc(v.id) + '"> ' + esc(v.nome) + ' <span class="muted">(' + esc(DISC[v.disciplina] || v.disciplina) + " · " + esc(TIPO[v.tipo] || v.tipo) + ")</span></label>";
        }).join("") + "</div>";
      if (this.temHidro()) h = '<p style="font-size:12.5px;margin:0 0 8px;padding:6px 8px;border-left:3px solid var(--primary,#0b5)"><b>Projeto hidrossanitário:</b> use <b>Hidrossanitário completo</b> — planta por sistema com diâmetro e declividade, isométrico, cortes das paredes com a altura de cada ponto, detalhes e quadro de materiais. Esta lista abaixo só enquadra as vistas.</p>' + h;
      global.UI.modal("Gerar pranchas", h, (this.temHidro() ? [{ texto: "Hidrossanitário completo", classe: "primary", onClick: function () { global.UI.fecharModal(); self.pranchasHidro(); } }] : []).concat([
        { texto: "Gerar", classe: this.temHidro() ? "" : "primary", onClick: function () {
          var fm = (document.getElementById("pv-ger-formato") || {}).value || f0;
          var ids = [].slice.call(document.querySelectorAll("[data-pv-ger]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-ger"); });
          global.UI.fecharModal();
          if (!ids.length) { toast("Marque ao menos uma vista.", "aviso"); return; }
          self.gerar({ formato: fm, vistas: ids });
        } },
        { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]));
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
          filhos.push({ id: "fl:" + id, rotulo: self.nomeFolha(pr, f) + (regs.length > 1 ? " (" + pr.nome + ")" : ""), icone: "prancha", fn: function () { self.abrir(id); } });
        });
      });
      /* as ações ficam À VISTA no nó (o dono não achava onde ficam as pranchas) */
      filhos.unshift({ id: "fl:gerar", rotulo: "Gerar pranchas…", icone: "prancha", fn: function () { self.abrirGerar(); } });
      /* PRANCHA VIVA: a folha → o 3D no ponto tocado (o comando da fita, com a trava do módulo) */
      if (global.PranchaVivaUI) filhos.unshift({ id: "fl:viva", rotulo: "Prancha Viva (folha → 3D)", icone: "prancha", acao: "prancha-viva" });
      if (global.ArqPranchasUI) filhos.splice(1, 0, { id: "fl:gerar-arq", rotulo: "Gerar pranchas de arquitetura…", icone: "prancha", fn: function () { global.ArqPranchasUI.abrir(); } });
      if (global.ArqPranchasUI && global.ArqPranchasUI.abrirArranjo) filhos.splice(2, 0, { id: "fl:arranjo-arq", rotulo: "Arranjo das folhas de arquitetura…", icone: "prancha", fn: function () { global.ArqPranchasUI.abrirArranjo(); } });
      filhos.push({ id: "fl:nova", rotulo: "+ Nova folha", icone: "prancha", fn: function () { self.novaFolha(); } });
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
        { id: "lista-vistas", rotulo: "Lista de\nvistas", icone: "tabela", dica: "Todas as plantas e cortes, com a escala e a folha/número de detalhe onde estão." }
      ]);
      R.acrescentar("vista", "Vista", "Exportar", [
        { id: "exportar-dxf", rotulo: "DXF", icone: "exportar", grande: true, dica: "DXF da folha aberta (em mm de papel, carimbo completo) ou da planta/corte aberto (1:1 em metros). Camada por categoria (ARQ-PAREDE-CORTE, EST-PILAR-CORTE…), espessura pela pena, cota que o AutoCAD mede de novo." },
        { id: "exportar-dwg", rotulo: "DWG", icone: "exportar", dica: "DWG pelo servidor depende de licença comercial do conversor — por enquanto, use o DXF (o AutoCAD salva em DWG)." },
        { id: "pdf-lote", rotulo: "PDF em\nlote", icone: "imprimir", grande: true, dica: "Várias folhas num PDF só, cada uma no tamanho do papel, com o nome automático (número - nome - revisão)." }
      ]);
      reg["gerar-pranchas"] = function () { return self.abrirGerar(); };
      reg["nova-folha"] = function () { return !!self.novaFolha(); };
      reg["posicionar-vista"] = function () { self.escolherVista(); return true; };
      reg["revisoes-folha"] = function () { self.editarRevisoes(); return true; };
      reg["lista-folhas"] = function () { self.mostrarLista("folhas"); return true; };
      reg["lista-vistas"] = function () { self.mostrarLista("vistas"); return true; };
      reg["exportar-dxf"] = function () { return !!self.exportarDxf(); };
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
