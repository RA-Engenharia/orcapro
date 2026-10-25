/* =====================================================================
 * bimcenaui.js — OrçaPRO CENA: a tela do módulo de apresentação (ES5; os motores entram por import()
 * só quando a Cena abre).
 *
 * Entrada: botão "OrçaPRO Cena" em Vista › Apresentação e na barra de título do BIM (ao lado de Pranchas).
 * O que a pessoa faz aqui, sem sair do projeto:
 *   · Biblioteca: arrastar móveis, luminárias e árvores para dentro da cena (objetos DA CENA — não entram
 *     no BIM nem no orçamento); clicar para selecionar, arrastar para mover, girar, escalar, excluir;
 *   · Materiais: clicar numa superfície (ou escolher na lista) e mudar cor, rugosidade, metal, verniz,
 *     relevo e escala da textura, na hora;
 *   · Ambiente: hora, data/estação, nuvens, céu, exposição;
 *   · Luzes: as luminárias do projeto por comando (ligar/desligar) e dia/entardecer/noite;
 *   · Câmeras: salvar vistas com miniatura, ir de uma a outra com transição suave;
 *   · Efeitos: raios de sol, vento, água em movimento, fogueira;
 *   · Cena: nome, salvar NO PROJETO (entidade bim_cenas), abrir outra, exportar a imagem, qualidade do aparelho.
 * Antes × depois: marca a imagem de agora e compara com a cena editada, com um divisor.
 * Desfazer / refazer cobrem tudo isso (BimCena.Historico); a cena é salva sozinha (autosave) no projeto.
 *
 * MOTOR PURO + FIAÇÃO FINA: as regras (estado, validação, desfazer, qualidade, tamanhos) moram em js/bimcena.js e são
 * testadas em node; este arquivo só liga isso ao motor ao vivo (js/bimrendervivo.js) e desenha os controles.
 *
 * ⚠ QUALIDADE PELO APARELHO. Antes de abrir, BimCena.classificarAparelho escolhe leve/alta/ultra pela placa; depois, a cada
 * segundo, BimCena.Controlador olha os quadros por segundo e reduz a RESOLUÇÃO (sem recompilar nada) se a imagem
 * passar de 3 s abaixo de 24 qps. Se nem no mínimo ficar fluido, a tela AVISA e oferece o nível abaixo — nunca troca
 * sozinha (trocar recompila a cena e leva tempo). A taxa só é julgada com a cena "quieta" (sem calcular luz, sem
 * comparar, aba visível): julgar durante o carregamento rebaixaria para sempre um aparelho bom.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NOME = "OrçaPRO Cena";
  function CE() { return global.BimCena; }
  function V() { return global.BimRenderVivo; }
  function BR() { return global.BimRender; }
  function OB() { return global.BimCenaObjs; }
  function ARM() { return global.BimCenaArm; }
  function url(arq) { try { return new URL("js/" + arq, document.baseURI).href; } catch (e) { return "js/" + arq; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms); } catch (e) {} }
  function agora() { return (global.performance && performance.now) ? performance.now() : Date.now(); }
  function fmt(v, d) { return v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); }

  /* ------------------------------------------------------------ estilo (uma vez) */
  var CSS =
    ".cn-barra{position:absolute;left:10px;right:362px;top:10px;z-index:6;display:flex;gap:6px;align-items:center;flex-wrap:wrap;pointer-events:none;font-size:12px;color:#eef0f4}" +
    ".cn-barra>*{pointer-events:auto}" +
    ".cn-chip{background:rgba(10,12,16,.8);border-radius:9px;padding:4px 10px;display:flex;gap:6px;align-items:center}" +
    ".cn-titulo{font-weight:600;letter-spacing:.02em}" +
    ".cn-btn{background:rgba(10,12,16,.88);color:#eef0f4;border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit}" +
    ".cn-btn:hover{border-color:#6ea8ff}.cn-btn[disabled]{opacity:.38;cursor:default;border-color:rgba(255,255,255,.12)}.cn-btn.on{background:#2f6fd6;border-color:#2f6fd6}" +
    ".cn-painel{position:absolute;right:10px;top:10px;bottom:10px;width:342px;z-index:6;background:rgba(10,12,16,.88);color:#eef0f4;border-radius:12px;display:flex;flex-direction:column;font-size:12.5px;overflow:hidden}" +
    ".cn-abas{display:flex;flex-wrap:wrap;gap:2px;padding:6px 6px 0}" +
    ".cn-aba{background:transparent;color:#cfd4dc;border:0;border-bottom:2px solid transparent;padding:6px 8px;font-size:12px;cursor:pointer;font-family:inherit}" +
    ".cn-aba.on{color:#fff;border-bottom-color:#6ea8ff}" +
    ".cn-corpo{flex:1;overflow:auto;padding:8px 10px 12px}" +
    ".cn-corpo h4{margin:10px 0 4px;font-size:12px;color:#aeb6c4;font-weight:600;text-transform:uppercase;letter-spacing:.05em}" +
    ".cn-lin{display:flex;align-items:center;gap:8px;margin:5px 0}.cn-lin>label{flex:0 0 96px;color:#cfd4dc}.cn-lin input[type=range]{flex:1;min-width:0}" +
    ".cn-lin .cn-val{flex:0 0 46px;text-align:right;font-variant-numeric:tabular-nums;color:#cfd4dc}" +
    ".cn-corpo input[type=text],.cn-corpo input[type=search],.cn-corpo input[type=date],.cn-corpo select{background:#161a21;color:#eef0f4;border:1px solid rgba(255,255,255,.2);border-radius:7px;padding:4px 7px;font-size:12px;font-family:inherit;min-width:0}" +
    ".cn-lista{display:flex;flex-direction:column;gap:3px}" +
    ".cn-item{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:7px;background:rgba(255,255,255,.05);cursor:grab;user-select:none}" +
    ".cn-item:hover{background:rgba(110,168,255,.18)}.cn-item.on{background:rgba(47,111,214,.45)}.cn-item small{color:#9aa3b2}" +
    ".cn-item .cn-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cn-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.cn-chips .cn-btn{padding:2px 8px}" +
    ".cn-nota{color:#9aa3b2;font-size:11.5px;margin:4px 0;line-height:1.4}.cn-aviso{background:rgba(255,170,60,.14);border:1px solid rgba(255,170,60,.38);border-radius:8px;padding:6px 8px;margin:6px 0}" +
    ".cn-mini{width:64px;height:36px;object-fit:cover;border-radius:5px;background:#222;flex:0 0 auto}" +
    ".cn-sel{position:absolute;left:50%;top:54px;transform:translateX(-50%);z-index:7;display:flex;gap:4px;background:rgba(10,12,16,.9);border-radius:10px;padding:5px 8px;color:#eef0f4;font-size:12px;align-items:center}" +
    ".cn-dica{position:absolute;left:10px;bottom:10px;z-index:6;max-width:calc(100% - 380px);background:rgba(10,12,16,.7);color:#cfd4dc;border-radius:8px;padding:4px 10px;font-size:11.5px}" +
    ".cn-comp{position:absolute;inset:0;z-index:5;touch-action:none;cursor:ew-resize}" +
    ".cn-comp img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}" +
    ".cn-comp .cn-div{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.6)}" +
    ".cn-comp .cn-alca{position:absolute;top:50%;width:34px;height:34px;margin:-17px 0 0 -16px;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-weight:700}" +
    ".cn-comp .cn-rot{position:absolute;top:60px;background:rgba(10,12,16,.8);color:#fff;padding:3px 10px;border-radius:8px;font-size:12px}" +
    ".cn-over{position:absolute;inset:0;z-index:9;background:rgba(6,8,12,.9);display:flex;align-items:center;justify-content:center}" +
    ".cn-over>div{max-width:460px;background:#161a21;color:#eef0f4;border-radius:12px;padding:18px 20px;font-size:13px;line-height:1.5}";
  function injetarCSS() {
    if (document.getElementById("cn-css")) return;
    var s = document.createElement("style"); s.id = "cn-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  var S = null;   /* a sessão aberta (null = fechada) */

  /* ------------------------------------------------------------ o aparelho */
  function infoAparelho(sup) {
    var i = { descricao: sup && sup.placa || "", fallback: !!(sup && sup.fallback), nucleos: navigator.hardwareConcurrency || 0, memoriaGB: navigator.deviceMemory || 0,
      telaW: global.screen && screen.width || 1920, telaH: global.screen && screen.height || 1080, dpr: global.devicePixelRatio || 1,
      mobile: /android|iphone|ipad|mobile/i.test(navigator.userAgent || "") };
    if (!navigator.gpu) return Promise.resolve(i);
    return navigator.gpu.requestAdapter({ powerPreference: "high-performance" }).then(function (a) {
      if (a) {
        var l = a.limits || {}; i.maxTexturas = l.maxSampledTexturesPerShaderStage || 16;
        i.maxTextura2D = l.maxTextureDimension2D || 8192;
        var inf = a.info || {}; i.vendor = inf.vendor || ""; i.arquitetura = inf.architecture || ""; i.dispositivo = inf.device || "";
      }
      return i;
    }, function () { return i; });
  }

  /* ------------------------------------------------------------ entrada */
  var Cena = {
    nome: NOME,
    ativo: function () { try { return !!(BR() && BR().ativo() && CE() && V()); } catch (e) { return false; } },
    aberta: function () { return !!S; },
    registrar: function (reg, G) {
      var R = global.BimRibbon, self = this;
      if (!this.ativo() || !R || !reg) return false;
      R.acrescentar("vista", "Vista", "Apresentação", [
        { id: "cena", rotulo: "OrçaPRO\nCena", icone: "apresentar", grande: true, dica: "OrçaPRO Cena: o módulo de apresentação do projeto. Arraste móveis, luminárias e árvores, troque materiais, escolha hora, estação e céu, ligue as luzes do projeto, salve câmeras, compare antes e depois e exporte a imagem. A cena fica salva no projeto." }
      ]);
      reg.cena = function () { self.abrir(); return true; };
      return true;
    },
    /* abre a cena: do projeto (a última, ou a que a pessoa escolheu em opc.cenaId) */
    abrir: function (opc) {
      var self = this, o = opc || {};
      if (S && S.abrindo) return S.promessa;
      if (!this.ativo()) { toast(NOME + " precisa do modelador BIM ligado e de um modelo aberto.", "aviso"); return Promise.resolve(null); }
      injetarCSS();
      var obra = BR().obraKey(), s = S = { abrindo: true, obra: obra, aba: "biblioteca", antes: null, comparar: false, armado: null, sel: null, filaObj: Promise.resolve(), busca: "", cat: "", mostrar: 60, fogoIds: {}, ultimoSalvo: "", t0: agora(), cenasLista: null };
      toast("Abrindo o " + NOME + "…", "info", 2500);
      s.promessa = import(url("bimrendervivo.js")).then(function (Mod) {
        return Mod.suportado().then(function (sup) {
          if (!sup.ok) { self._semWebGPU(sup.motivo); S = null; return null; }
          return infoAparelho(sup).then(function (ap) { s.ap = ap; s.cls = CE().classificarAparelho(ap); return self._abrirMotor(o); });
        });
      })["catch"](function (err) { toast(NOME + " falhou ao abrir: " + (err && err.message || err), "erro", 9000); try { console.error(err); } catch (e) {} S = null; return null; });
      return s.promessa;
    },
    _semWebGPU: function (motivo) {
      var d = document.createElement("div"); d.className = "cn-over"; d.style.cssText += ";position:fixed;z-index:99999";
      d.innerHTML = "<div><b>" + NOME + " precisa de WebGPU</b><p>" + esc(motivo || "Este navegador ou esta placa de vídeo não liberou o WebGPU.") + "</p>" +
        "<p>Use o Chrome ou o Edge atualizados no computador. Neste aparelho continua valendo o <b>Render</b> (foto fotorrealista calculada) da mesma aba Vista › Apresentação.</p>" +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="cn-btn" data-f="render">Abrir o Render</button><button type="button" class="cn-btn on" data-f="ok">Entendi</button></div></div>';
      document.body.appendChild(d);
      d.querySelector('[data-f="ok"]').onclick = function () { d.parentNode.removeChild(d); };
      d.querySelector('[data-f="render"]').onclick = function () { d.parentNode.removeChild(d); try { BR().abrir(); } catch (e) {} };
    },

    _abrirMotor: function (o) {
      var self = this, s = S, C = CE(), Vv = V(), B = BR();
      /* o estado: o pedido (cenaId), a última da obra, ou uma cena nova */
      var norm = { normalizarObjeto: OB() ? OB().normalizar : null }, estado = null, aviso = "";
      try {
        var lido = o.estado ? { estado: o.estado } : (o.cenaId && ARM() ? ARM().ler(o.cenaId) : (ARM() ? ARM().lerPadrao(s.obra) : null));
        if (lido && (lido.erro || lido.aviso)) aviso = lido.erro || lido.aviso;
        estado = lido && lido.estado ? C.normalizar(lido.estado, norm) : C.normalizar({}, norm);
        s.cenaId = o.cenaId || null;
        s.nomeCena = estado.nome;
      } catch (e) { estado = C.normalizar({}, norm); }
      s.estado = estado; s.hist = new C.Historico(estado);
      var modo = estado.qualidade.modo, nivel = modo === "auto" ? s.cls.nivel : modo;
      s.nivel = nivel; s.nivelMax = nivel;
      s.ctrl = new C.Controlador({ nivel: nivel, escala: s.cls.escala });
      if (aviso) toast(aviso, "aviso", 8000);
      var ef = C.ambienteEfetivo(estado);
      Vv.modoCena = true; Vv._nomeAba = NOME; Vv.sobreAmb = { data: ef.data, nuvens: ef.nuvens, ceu: estado.ambiente.ceu };
      var hora0 = estado.ambiente.hora || "15:00";
      return Vv.abrir({ qualidade: nivel, hora: hora0, refino: false, estadoLuzes: estado.luzes, aposPreparar: function (vivo, tela, info) { return self._aposPreparar(vivo, tela, info); } }).then(function (info) {
        if (!info) { self._limpar(); S = null; return null; }
        /* o motor devolve antes de a Cena pôr a tela e aplicar o estado: espera (a promessa é a de _aposPreparar) */
        return Promise.resolve(Vv._cenaPronta).then(function () { return self; });
      });
    },

    _limpar: function () { var Vv = V(); if (Vv) { Vv.modoCena = false; Vv._nomeAba = null; Vv.sobreAmb = null; } },

    /* ------------------------------------------------------------ a cena está montada: pôr a tela e aplicar o estado */
    _aposPreparar: function (vivo, tela, info) {
      var self = this, s = S; if (!s) return null;
      s.vivo = vivo; s.tela = tela; s.palco = tela.querySelector('[data-rv="palco"]'); s.info = info;
      return Promise.all([import(url("bimcenamat.js"))]).then(function (m) {
        s.mats = new m[0].MateriaisCena(vivo);
        self._montarTela();
        self._ligarEventos();
        /* o mapa da planta vai para o canto de baixo à ESQUERDA: o painel da Cena ocupa a direita inteira */
        Promise.resolve(V()._mapaPronto).then(function () { var r = S && S.tela && S.tela.querySelector('[data-rv="mapa"]'); if (r) { r.style.right = "auto"; r.style.left = "10px"; r.style.bottom = "44px"; } });
        s.abrindo = false;
        s.t0 = agora();
        return self._aplicarTudo(true);
      }).then(function () {
        s.timer = setInterval(function () { self._tique(); }, 1000);
        self._pintarAba();
        return true;
      });
    },

    /* ------------------------------------------------------------ aplicar o estado ao motor */
    origem: function () { var v = S && S.vivo; return (v && v._origemCena) || [0, 0, 0]; },
    _aplicarTudo: function (primeira) {
      var s = S, e = s.estado, C = CE(), vivo = s.vivo, self = this;
      try { vivo.efeitos.definir(e.efeitos); } catch (x) { console.warn("efeitos:", x); }
      vivo.definirComp(e.ambiente.exposicao || 0);
      s.mats.varrer(); s.mats.sincronizar(e.materiais);
      self._sincFogos();
      var p = self._sincObjetos();
      if (primeira) {
        var c0 = e.camAtiva && e.cameras.filter(function (c) { return c.id === e.camAtiva; })[0];
        var cam = c0 ? c0.camera : e.vista;
        if (cam) vivo.definirCamera(C.cameraParaMotor(cam, self.origem()));
      }
      self._sincLuzes();
      return p;
    },
    _sincObjetos: function () {
      var s = S; if (!s || !s.vivo || !s.vivo.objetos) return Promise.resolve(null);
      var lista = s.estado.objetos.slice();
      s.filaObj = s.filaObj.then(function () { return S && S.vivo && S.vivo.objetos ? S.vivo.objetos.sincronizar(lista) : null; })["catch"](function (e) { try { console.warn("objetos da cena:", e); } catch (x) {} return null; });
      return s.filaObj;
    },
    _sincFogos: function () {
      var s = S, ef = s.vivo.efeitos, C = CE(), O = this.origem(); if (!ef) return;
      var queremos = {}; s.estado.fogos.forEach(function (f) { queremos[f.id] = f; });
      Object.keys(s.fogoIds).forEach(function (id) { if (!queremos[id]) { ef.removerFogo(s.fogoIds[id]); delete s.fogoIds[id]; } });
      s.estado.fogos.forEach(function (f) {
        if (s.fogoIds[f.id]) return;
        var eid = ef.adicionarFogo({ pos: [f.pos[0] - O[0], f.pos[1] - O[1], f.pos[2] - O[2]], escala: f.escala }); if (eid) s.fogoIds[f.id] = eid;
      });
    },
    _sincLuzes: function () {
      var s = S, c = s.vivo.circuitos; if (!c || !c.estado) return;
      var e = s.estado.luzes, atual = c.estado();
      Object.keys(e).forEach(function (id) { if (atual[id] !== undefined && atual[id] !== e[id]) c.ligar(id, e[id]); });
    },
    _sincAmbiente: function (imediato) {
      var s = S, C = CE(), Vv = V(), a = s.estado.ambiente, ef = C.ambienteEfetivo(s.estado);
      Vv.sobreAmb = { data: ef.data, nuvens: ef.nuvens, ceu: a.ceu };
      s.vivo.definirComp(a.exposicao || 0);
      clearTimeout(s.tAmb);
      s.tAmb = setTimeout(function () { if (S) Vv.hora(a.hora || "15:00"); }, imediato ? 0 : 220);
    },

    /* ------------------------------------------------------------ mudar o estado (tudo passa por aqui) */
    mudar: function (novo, chave, partes) {
      var s = S; if (!s) return;
      s.estado = novo; s.hist.registrar(novo, chave);
      this._aplicarPartes(partes);
      this._agendarSalvar(); this._pintarBarra();
    },
    _aplicarPartes: function (partes) {
      var s = S, p = partes || [];
      if (p.indexOf("ambiente") >= 0) this._sincAmbiente();
      if (p.indexOf("materiais") >= 0) { s.mats.sincronizar(s.estado.materiais); }
      if (p.indexOf("objetos") >= 0) {
        this._sincObjetos();
        /* só o contador: repintar a aba levaria a lista de itens de volta ao topo */
        var ct = s.corpo && s.corpo.querySelector('[data-cn="contagem"]');
        if (ct && OB()) { var orc = OB().orcamento(s.estado.objetos); ct.textContent = ct.textContent.replace(/\d+ objeto\(s\) na cena \([^)]*\)/, s.estado.objetos.length + " objeto(s) na cena (" + fmt(orc.triangulos) + " triângulos)"); }
      }
      if (p.indexOf("efeitos") >= 0) s.vivo.efeitos.definir(s.estado.efeitos);
      if (p.indexOf("fogos") >= 0) this._sincFogos();
      if (p.indexOf("luzes") >= 0) this._sincLuzes();
    },
    desfazer: function () { var s = S; if (!s || !s.hist.podeDesfazer()) return; this._voltar(s.hist.desfazer()); },
    refazer: function () { var s = S; if (!s || !s.hist.podeRefazer()) return; this._voltar(s.hist.refazer()); },
    _voltar: function (e) {
      var s = S; s.estado = e; s.sel = null;
      this._aplicarPartes(["ambiente", "materiais", "objetos", "efeitos", "fogos", "luzes"]);
      this._agendarSalvar(); this._pintarBarra(); this._pintarAba(); this._pintarSel();
    },

    /* ------------------------------------------------------------ salvar no projeto */
    _estadoParaSalvar: function () {
      var s = S, C = CE(), e = C.copia(s.estado), v = s.vivo;
      try { var cam = v.cameraAtual(); e.vista = C.cameraParaProjeto({ pos: cam.pos, alvo: cam.alvo, fov: cam.fov }, this.origem()); } catch (x) {}
      try { if (v.circuitos && v.circuitos.estado) e.luzes = v.circuitos.estado(); } catch (x2) {}
      e.nome = s.nomeCena || e.nome || "";
      return e;
    },
    /* ⚠ RITMO (revisão adversarial 24/10/2026, js/bimcenaarm.js R4): cada gravação sobe a lista bim_cenas INTEIRA para a
       nuvem — no máximo uma a cada BimCenaArm.INTERVALO_AUTO; o pendente vai na hora no fechar e ao esconder/sair da página */
    _agendarSalvar: function () {
      var s = S, self = this; clearTimeout(s.tSalvar);
      var ms = ARM() && ARM().esperaAutosalvar ? ARM().esperaAutosalvar(Date.now(), s.ultimoAuto || 0) : 1500;
      s.tSalvar = setTimeout(function () { self.salvarPadrao(); }, ms);
      s.sujo = true; this._pintarSalvo();
    },
    salvarPadrao: function () {
      var s = S; if (!s) return { ok: false };
      clearTimeout(s.tSalvar);
      var r = ARM() ? ARM().salvarPadrao(s.obra, this._estadoParaSalvar()) : { ok: false, motivo: "O armazenamento da cena não carregou." };
      s.ultimoRes = r;
      if (r.ok) { s.sujo = false; if (!r.igual) s.ultimoAuto = Date.now(); } else if (!s.avisouSalvar) { s.avisouSalvar = true; toast(r.motivo || "Não consegui salvar a cena.", "aviso", 8000); }
      this._pintarSalvo(); return r;
    },
    /* fechar / esconder a página: o pendente vai agora; SEM mudança, só a posição da câmera vai para a última cena que
       está no projeto (R3: nunca regrava por cima o que outro aparelho salvou depois que esta tela abriu) */
    _gravarAoSair: function () {
      var s = S; if (!s || !s.vivo || !s.estado) return null;
      if (s.sujo) return this.salvarPadrao();
      if (!ARM() || !ARM().salvarVistaPadrao) return null;
      var vista = null;
      try { vista = this._estadoParaSalvar().vista; } catch (e) { vista = null; }
      return ARM().salvarVistaPadrao(s.obra, vista);
    },
    /* "Salvar cena": uma cena NOMEADA (além da automática), com miniatura */
    salvarNomeada: function (nome, comoNova) {
      var s = S, self = this; if (!s || !ARM()) return Promise.resolve({ ok: false });
      return this._foto("image/jpeg", 0.7, 220).then(function (mini) {
        var e = self._estadoParaSalvar(); e.nome = nome || s.nomeCena || "";
        var r = ARM().salvar(s.obra, { id: comoNova ? undefined : s.cenaId, nome: e.nome, estado: e, miniatura: mini });
        if (r.ok) { s.cenaId = r.id; s.nomeCena = e.nome || (r.registro && r.registro.nome) || ""; toast("Cena salva no projeto: " + (r.registro && r.registro.nome || s.nomeCena), "ok", 3500); if (r.semMiniaturas) toast("A cena ficou grande: as miniaturas das câmeras foram retiradas.", "aviso", 6000); }
        else toast(r.motivo || "Não consegui salvar a cena.", "erro", 8000);
        s.cenasLista = null; self._pintarAba(); return r;
      });
    },

    /* ------------------------------------------------------------ imagem do quadro (só dentro do quadro: WebGPU invalida o buffer depois) */
    _foto: function (tipo, qual, largura) {
      var s = S; if (!s || !s.vivo) return Promise.resolve("");
      return new Promise(function (resolve) {
        (s.pedidos = s.pedidos || []).push({ tipo: tipo, qual: qual, largura: largura, resolve: resolve });
        setTimeout(function () { var k = s.pedidos && s.pedidos.filter(function (p) { return p.resolve === resolve; })[0]; if (k) { s.pedidos.splice(s.pedidos.indexOf(k), 1); resolve(""); } }, 4000);
      });
    },
    _noQuadro: function () {
      var s = S; if (!s || !s.pedidos || !s.pedidos.length) return;
      var v = s.vivo, cv = v.canvas, lista = s.pedidos.splice(0);
      lista.forEach(function (p) {
        var d = "";
        try {
          if (p.largura && cv.width > p.largura) {
            var k = p.largura / cv.width, c2 = document.createElement("canvas"); c2.width = p.largura; c2.height = Math.max(1, Math.round(cv.height * k));
            var g = c2.getContext("2d"); g.drawImage(cv, 0, 0, c2.width, c2.height); d = c2.toDataURL(p.tipo, p.qual);
          } else d = cv.toDataURL(p.tipo, p.qual);
        } catch (e) { d = ""; }
        p.resolve(d);
      });
    },

    /* ------------------------------------------------------------ o relógio de 1 s: fluidez, luzes mexidas por clique, salvo */
    _tique: function () {
      var s = S; if (!s || !s.vivo || !s.vivo.renderer) return;
      var v = s.vivo, C = CE();
      /* as luzes mudaram por clique no interruptor (3D)? entra no desfazer */
      try {
        if (v.circuitos && v.circuitos.estado) {
          var at = v.circuitos.estado(), dif = false, e = s.estado;
          Object.keys(at).forEach(function (id) { if (e.luzes[id] !== at[id]) dif = true; });
          if (dif) { var luzes = Object.assign({}, e.luzes, at); this.mudar(C.normalizar(Object.assign({}, e, { luzes: luzes }), { normalizarObjeto: OB() && OB().normalizar }), "luzes", []); if (s.aba === "luzes") this._pintarAba(); }
        }
      } catch (x) {}
      var ocupado = (agora() - s.t0 < 20000) || s.comparar || document.hidden || !!(v.assadaInfo && v.assadaInfo.calculando) || !!(v.luzInfo && v.luzInfo.calculando) || !!s.exportando || (v.circuitos && v.circuitos.info && !v.circuitos.info.pronto && v.circuitos.info.assados != null && false);
      var r = s.ctrl.amostra(v.estado.qps, { ocupado: ocupado });
      if (r.acao === "resolucao") { v.escalaDinamica(r.escala); s.avisoFluidez = r.motivo; this._pintarSistema(); }
      else if (r.acao === "nivel") { s.avisoFluidez = r.motivo; s.sugerirNivel = r.nivel; this._pintarSistema(); }
      else if (r.acao === "limite") { s.avisoFluidez = r.motivo; this._pintarSistema(); }
      this._pintarBarra();
    },

    /* ------------------------------------------------------------ fechar */
    fechar: function () {
      var s = S; if (!s) return;
      try { clearInterval(s.timer); clearTimeout(s.tSalvar); clearTimeout(s.tAmb); } catch (e) {}
      try { this._gravarAoSair(); } catch (e2) {}
      this._desligarEventos();
      if (s.comp) this._sairComparar();
      try { if (s.mats) s.mats.descartar(); } catch (e3) {}
      var Vv = V();
      try { if (s.painel && s.painel.parentNode) s.painel.parentNode.removeChild(s.painel); if (s.barra && s.barra.parentNode) s.barra.parentNode.removeChild(s.barra); if (s.dica && s.dica.parentNode) s.dica.parentNode.removeChild(s.dica); if (s.selBarra && s.selBarra.parentNode) s.selBarra.parentNode.removeChild(s.selBarra); } catch (e4) {}
      S = null;
      this._limpar();
      try { Vv.fechar(); } catch (e5) {}
    }
  };

  /* ================================================================ A TELA ================================================================ */
  Cena._montarTela = function () {
    var s = S, self = this, tela = s.tela;
    var barra = s.barra = document.createElement("div"); barra.className = "cn-barra"; barra.setAttribute("data-cn", "barra");
    barra.innerHTML =
      '<div class="cn-chip"><span class="cn-titulo">' + NOME + '</span><span data-cn="nome" style="color:#aeb6c4"></span></div>' +
      '<div class="cn-chip" style="padding:3px"><button type="button" class="cn-btn" data-cn-a="desfazer" title="Desfazer (Ctrl+Z)">Desfazer</button><button type="button" class="cn-btn" data-cn-a="refazer" title="Refazer (Ctrl+Y)">Refazer</button></div>' +
      '<div class="cn-chip" style="padding:3px"><button type="button" class="cn-btn" data-cn-a="orbita">Órbita</button><button type="button" class="cn-btn" data-cn-a="caminhar" title="W A S D para andar, arrastar para olhar">Caminhar</button></div>' +
      '<div class="cn-chip" style="padding:3px"><button type="button" class="cn-btn" data-cn-a="cam-ant" title="Câmera anterior (PageUp)">&lsaquo;</button><span data-cn="cam" style="min-width:90px;text-align:center">Câmera livre</span><button type="button" class="cn-btn" data-cn-a="cam-prox" title="Próxima câmera (PageDown)">&rsaquo;</button></div>' +
      '<div class="cn-chip" style="padding:3px"><button type="button" class="cn-btn" data-cn-a="antes" title="Guarda a imagem de agora para comparar depois">Marcar antes</button><button type="button" class="cn-btn" data-cn-a="comparar" disabled title="Compara o antes com a cena editada">Antes / depois</button></div>' +
      '<button type="button" class="cn-btn" data-cn-a="imagem" title="Salva a imagem da cena em PNG">Imagem</button>' +
      '<button type="button" class="cn-btn" data-cn-a="fechar">Fechar</button>' +
      '<span class="cn-chip" data-cn="estado" style="margin-left:auto;font-variant-numeric:tabular-nums"></span>';
    tela.appendChild(barra);
    var painel = s.painel = document.createElement("div"); painel.className = "cn-painel"; painel.setAttribute("data-cn", "painel");
    var ABAS = [["biblioteca", "Biblioteca"], ["materiais", "Materiais"], ["ambiente", "Ambiente"], ["luzes", "Luzes"], ["cameras", "Câmeras"], ["efeitos", "Efeitos"], ["cena", "Cena"]];
    painel.innerHTML = '<div class="cn-abas">' + ABAS.map(function (a) { return '<button type="button" class="cn-aba" data-cn-aba="' + a[0] + '">' + a[1] + "</button>"; }).join("") + '</div><div class="cn-corpo" data-cn="corpo"></div>';
    tela.appendChild(painel);
    s.corpo = painel.querySelector('[data-cn="corpo"]');
    var dica = s.dica = document.createElement("div"); dica.className = "cn-dica"; dica.setAttribute("data-cn", "dica"); tela.appendChild(dica);
    var sb = s.selBarra = document.createElement("div"); sb.className = "cn-sel"; sb.style.display = "none"; tela.appendChild(sb);
    /* o painel de luzes antigo (rv5) fica atrás da aba Luzes: aqui ele começa escondido */
    var antigo = tela.querySelector('[data-rv="luzes"]'); if (antigo) antigo.style.display = "none";
    barra.onclick = function (ev) { var b = ev.target.closest ? ev.target.closest("[data-cn-a]") : null; if (b && !b.disabled) self._acaoBarra(b.getAttribute("data-cn-a")); };
    painel.querySelector(".cn-abas").onclick = function (ev) { var b = ev.target.closest ? ev.target.closest("[data-cn-aba]") : null; if (b) { s.aba = b.getAttribute("data-cn-aba"); s.armado = null; self._pintarAba(); } };
    this._pintarBarra();
  };

  Cena._acaoBarra = function (a) {
    var s = S, self = this, C = CE(), v = s.vivo;
    if (a === "desfazer") this.desfazer();
    else if (a === "refazer") this.refazer();
    else if (a === "orbita" || a === "caminhar") { v.modo(a); this._pintarBarra(); }
    else if (a === "cam-ant" || a === "cam-prox") { var c = C.vizinhaCamera(s.estado, a === "cam-prox" ? 1 : -1); if (c) this.irParaCamera(c.id); else toast("Salve uma câmera na aba Câmeras para percorrer as vistas.", "info", 3500); }
    else if (a === "antes") this.marcarAntes();
    else if (a === "comparar") this.comparar();
    else if (a === "imagem") { s.aba = "cena"; this._pintarAba(); }
    else if (a === "fechar") this.fechar();
  };

  Cena._pintarBarra = function () {
    var s = S; if (!s || !s.barra) return;
    var b = s.barra, q = function (x) { return b.querySelector(x); };
    q('[data-cn="nome"]').textContent = s.nomeCena ? "· " + s.nomeCena : "";
    q('[data-cn-a="desfazer"]').disabled = !s.hist.podeDesfazer(); q('[data-cn-a="refazer"]').disabled = !s.hist.podeRefazer();
    var modo = s.vivo && s.vivo.nav ? s.vivo.nav.modo : "orbita";
    q('[data-cn-a="orbita"]').classList.toggle("on", modo === "orbita"); q('[data-cn-a="caminhar"]').classList.toggle("on", modo === "caminhar");
    var ativa = s.estado.cameras.filter(function (c) { return c.id === s.estado.camAtiva; })[0];
    q('[data-cn="cam"]').textContent = ativa ? ativa.nome : "Câmera livre";
    q('[data-cn-a="comparar"]').disabled = !s.antes; q('[data-cn-a="comparar"]').classList.toggle("on", !!s.comparar);
    var v = s.vivo, t = "";
    if (v && v.estado) {
      t = fmt(v.estado.qps) + " qps";
      if (v.assadaInfo && v.assadaInfo.calculando) t += " · luz da obra " + Math.round((v.assadaInfo.progresso || 0) * 100) + "%";
      else if (v.luzInfo && v.luzInfo.calculando) t += " · luz da obra " + Math.round((v.luzInfo.progresso || 0) * 100) + "%";
    }
    q('[data-cn="estado"]').textContent = t;
    this._pintarSalvo(); this._pintarDica();
  };
  Cena._pintarSalvo = function () {
    var s = S; if (!s || !s.barra) return; var e = s.barra.querySelector('[data-cn="estado"]'); if (!e) return;
    var m = s.sujo ? "salvando…" : (s.ultimoRes && s.ultimoRes.ok ? "salva no projeto" : "");
    e.setAttribute("data-salvo", s.sujo ? "0" : (s.ultimoRes && s.ultimoRes.ok ? "1" : ""));
    if (m && e.textContent.indexOf(m) < 0) e.textContent = e.textContent.replace(/ · (salvando…|salva no projeto)/, "") + " · " + m;
  };
  Cena._pintarDica = function () {
    var s = S; if (!s || !s.dica) return;
    var t = "Arraste para girar · botão direito para mover · roda para aproximar";
    if (s.armado === "fogo") t = "Clique no chão para acender a fogueira · Esc cancela";
    else if (s.armado) t = "Clique na cena para colocar o item · Esc cancela";
    else if (s.aba === "materiais") t = "Clique numa superfície para editar o material dela";
    else if (s.aba === "biblioteca") t = "Arraste um item da lista para a cena · clique num objeto para selecionar · arraste para mover";
    if (s.comparar) t = "Arraste o divisor · Esc sai da comparação";
    s.dica.textContent = t;
  };

  /* ---------------------------------------------------------------- as abas */
  Cena._pintarAba = function () {
    var s = S; if (!s || !s.corpo) return;
    [].forEach.call(s.painel.querySelectorAll("[data-cn-aba]"), function (b) { b.classList.toggle("on", b.getAttribute("data-cn-aba") === s.aba); });
    var f = this["_aba_" + s.aba]; s.corpo.innerHTML = ""; if (f) f.call(this, s.corpo);
    var antigo = s.tela.querySelector('[data-rv="luzes"]'); if (antigo) antigo.style.display = s.aba === "luzes" && s.luzesCompleto ? "" : "none";
    this._pintarDica();
  };
  function slider(rot, chave, min, max, passo, valor, fmtv, extra) {
    return '<div class="cn-lin"><label for="cn-' + chave + '">' + rot + '</label><input type="range" id="cn-' + chave + '" data-cn-r="' + chave + '" min="' + min + '" max="' + max + '" step="' + passo + '" value="' + valor + '"' + (extra || "") + '><span class="cn-val" data-cn-v="' + chave + '">' + fmtv(valor) + "</span></div>";
  }
  function onSliders(corpo, fn) {
    [].forEach.call(corpo.querySelectorAll("[data-cn-r]"), function (r) {
      var k = r.getAttribute("data-cn-r");
      r.oninput = function () { var sp = corpo.querySelector('[data-cn-v="' + k + '"]'); fn(k, +r.value, sp, true); };
      r.onchange = function () { fn(k, +r.value, null, false); };
    });
  }

  /* ----- Biblioteca */
  Cena._aba_biblioteca = function (el) {
    var s = S, self = this, O = OB();
    if (!O) { el.innerHTML = '<div class="cn-aviso">A biblioteca de objetos não carregou (js/bimcenaobjs.js).</div>'; return; }
    var cats = O.categorias();
    var lista = O.buscar(s.busca, s.cat || undefined), mostra = lista.slice(0, s.mostrar);
    var orc = O.orcamento(s.estado.objetos);
    el.innerHTML =
      '<input type="search" data-cn="busca" placeholder="Buscar: sofá, mesa, carvalho, spot…" value="' + esc(s.busca) + '" style="width:100%;box-sizing:border-box">' +
      '<div class="cn-chips"><button type="button" class="cn-btn' + (s.cat ? "" : " on") + '" data-cn-cat="">Tudo (' + O.catalogo().length + ")</button>" +
      cats.map(function (c) { return '<button type="button" class="cn-btn' + (s.cat === c.cat ? " on" : "") + '" data-cn-cat="' + esc(c.cat) + '">' + esc(c.nome) + " (" + c.n + ")</button>"; }).join("") + "</div>" +
      '<div class="cn-nota" data-cn="contagem">' + lista.length + " itens · arraste para a cena, ou clique no item e depois no chão. " + s.estado.objetos.length + " objeto(s) na cena (" + fmt(orc.triangulos) + " triângulos).</div>" +
      '<div class="cn-lista" data-cn="itens">' + mostra.map(function (i) {
        return '<div class="cn-item' + (s.armado === i.id ? " on" : "") + '" draggable="true" data-cn-item="' + esc(i.id) + '" title="' + esc(i.nome) + '"><span class="cn-n">' + esc(i.nome) + "</span><small>" + (i.dim ? fmt(i.dim[0] * 100) + "×" + fmt(i.dim[1] * 100) + "×" + fmt(i.dim[2] * 100) : "") + (i.falta ? " · sem luz" : "") + "</small></div>";
      }).join("") + "</div>" + (lista.length > mostra.length ? '<button type="button" class="cn-btn" data-cn="mais" style="margin-top:6px">Mostrar mais (' + (lista.length - mostra.length) + ")</button>" : "") +
      '<h4>Pessoas</h4><div class="cn-nota">' + esc(O.pendencias()[0]) + "</div>";
    var bs = el.querySelector('[data-cn="busca"]');
    bs.oninput = function () { s.busca = bs.value; clearTimeout(s.tBusca); s.tBusca = setTimeout(function () { s.mostrar = 60; self._pintarAba(); var b2 = s.corpo.querySelector('[data-cn="busca"]'); if (b2) { b2.focus(); b2.setSelectionRange(b2.value.length, b2.value.length); } }, 200); };
    [].forEach.call(el.querySelectorAll("[data-cn-cat]"), function (b) { b.onclick = function () { s.cat = b.getAttribute("data-cn-cat"); s.mostrar = 60; self._pintarAba(); }; });
    var mais = el.querySelector('[data-cn="mais"]'); if (mais) mais.onclick = function () { s.mostrar += 120; self._pintarAba(); };
    [].forEach.call(el.querySelectorAll("[data-cn-item]"), function (d) {
      var id = d.getAttribute("data-cn-item");
      d.ondragstart = function (ev) { try { ev.dataTransfer.setData("text/x-orcapro-cena", id); ev.dataTransfer.setData("text/plain", id); ev.dataTransfer.effectAllowed = "copy"; } catch (e) {} s.arrastando = id; };
      d.ondragend = function () { s.arrastando = null; };
      d.onclick = function () { s.armado = s.armado === id ? null : id; self._pintarAba(); };
    });
  };

  /* ----- Materiais */
  Cena._aba_materiais = function (el) {
    var s = S, self = this, C = CE();
    var lista = s.mats.lista(), sel = s.matSel && lista.filter(function (m) { return m.id === s.matSel; })[0];
    var q = (s.buscaMat || "").toLowerCase();
    var filtrada = lista.filter(function (m) { return !q || m.nome.toLowerCase().indexOf(q) >= 0 || m.id.indexOf(q) >= 0; });
    el.innerHTML = '<div class="cn-nota">Clique numa superfície da cena para escolher o material dela, ou escolha na lista. A mudança vale para todas as peças com esse material.</div>' +
      '<input type="search" data-cn="buscamat" placeholder="Buscar material" value="' + esc(s.buscaMat || "") + '" style="width:100%;box-sizing:border-box">' +
      '<div class="cn-lista" style="max-height:170px;overflow:auto;margin-top:6px" data-cn="mats">' + filtrada.map(function (m) {
        var ed = s.estado.materiais[m.id];
        return '<div class="cn-item' + (s.matSel === m.id ? " on" : "") + '" style="cursor:pointer" data-cn-mat="' + esc(m.id) + '"><span class="cn-n">' + esc(m.nome) + (ed ? " *" : "") + "</span><small>" + m.n + (m.textura ? " · textura" : "") + "</small></div>";
      }).join("") + "</div>" + (sel ? '<div data-cn="editor"></div>' : "");
    var bm = el.querySelector('[data-cn="buscamat"]'); bm.oninput = function () { s.buscaMat = bm.value; clearTimeout(s.tBM); s.tBM = setTimeout(function () { self._pintarAba(); var b2 = s.corpo.querySelector('[data-cn="buscamat"]'); if (b2) { b2.focus(); b2.setSelectionRange(b2.value.length, b2.value.length); } }, 200); };
    [].forEach.call(el.querySelectorAll("[data-cn-mat]"), function (d) { d.onclick = function () { s.matSel = d.getAttribute("data-cn-mat"); self._pintarAba(); }; });
    if (sel) this._editorMaterial(el.querySelector('[data-cn="editor"]'), sel);
  };
  Cena._editorMaterial = function (el, m) {
    var s = S, self = this, C = CE(), ed = s.estado.materiais[m.id] || {}, val = function (k) { return ed[k] !== undefined ? ed[k] : m.valores[k]; };
    var linha = function (k, rot, min, max, passo, d) { return m.cap[k] ? slider(rot, "m-" + k, min, max, passo, val(k), function (x) { return fmt(x, d); }) : '<div class="cn-nota">' + rot + ": este material não aceita (textura 2K ou liso)</div>"; };
    el.innerHTML = "<h4>" + esc(m.nome) + "</h4>" +
      '<div class="cn-lin"><label for="cn-cor">Cor</label><input type="color" id="cn-cor" data-cn="cor" value="' + esc(val("cor") || "#cccccc") + '"' + (m.cap.cor ? "" : " disabled") + '><input type="text" data-cn="corhex" value="' + esc(val("cor") || "") + '" style="width:80px"></div>' +
      linha("rugosidade", "Rugosidade", 0, 1, 0.01, 2) + linha("metal", "Metal", 0, 1, 0.01, 2) + linha("verniz", "Verniz", 0, 1, 0.01, 2) +
      (m.textura ? linha("relevo", "Relevo", 0, 2, 0.05, 2) + linha("escala", "Escala", 0.25, 4, 0.05, 2) : "") +
      '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="cn-btn" data-cn="restaurar"' + (s.estado.materiais[m.id] ? "" : " disabled") + ">Voltar ao do projeto</button></div>" +
      (m.vidro ? '<div class="cn-nota">Vidro: a cor tinge a transmissão.</div>' : "");
    var rb = null;
    var aplicar = function (campos, chave) {
      var novo = C.definirMaterial(S.estado, m.id, campos, { normalizarObjeto: OB() && OB().normalizar });
      S.mats.aplicar(m.id, campos); S.estado = novo; S.hist.registrar(novo, chave); self._agendarSalvar(); self._pintarBarra();
      if (rb) rb.disabled = false;   /* ⚠ o botão nasce apagado quando o material ainda não foi editado: sem isto o 1º clique em "Voltar" não fazia nada */
    };
    var cor = el.querySelector('[data-cn="cor"]'), hex = el.querySelector('[data-cn="corhex"]');
    cor.oninput = function () { hex.value = cor.value; aplicar({ cor: cor.value }, "mat:" + m.id + ":cor"); };
    hex.onchange = function () { var h = C.corHex(hex.value, ""); if (h) { cor.value = h; aplicar({ cor: h }, "mat:" + m.id + ":cor"); } };
    onSliders(el, function (k, v, sp) { var campo = k.slice(2); if (sp) sp.textContent = fmt(v, 2); var o = {}; o[campo] = v; aplicar(o, "mat:" + m.id + ":" + campo); });
    rb = el.querySelector('[data-cn="restaurar"]');
    rb.onclick = function () { var novo = C.restaurarMaterial(S.estado, m.id, { normalizarObjeto: OB() && OB().normalizar }); S.mats.restaurar(m.id); S.estado = novo; S.hist.registrar(novo, null); self._agendarSalvar(); self._pintarAba(); self._pintarBarra(); };
  };

  /* ----- Ambiente */
  function horaDoSol(alvo) {
    try {
      var b = BR(), R = global.RenderMat, ef = CE().ambienteEfetivo(S.estado), L = b.local(), fz = b.fuso(L);
      for (var m = 14 * 60; m <= 23 * 60; m += 5) { var h = CE().hm(m), so = R.sol({ lat: L.lat, lon: L.lon, data: ef.data, hora: h, fuso: fz, norte: L.norte }); if (so && so.elevacao <= alvo) return h; }
    } catch (e) {}
    return alvo > 0 ? "17:45" : "20:30";
  }
  Cena._aba_ambiente = function (el) {
    var s = S, self = this, C = CE(), a = s.estado.ambiente, ef = C.ambienteEfetivo(s.estado);
    var min = C.minutos(a.hora || "15:00");
    el.innerHTML =
      slider("Hora", "hora", 0, 1435, 5, min, function (x) { return C.hm(x); }) +
      '<div class="cn-chips"><button type="button" class="cn-btn" data-cn-per="manha">Manhã</button><button type="button" class="cn-btn" data-cn-per="dia">Meio-dia</button><button type="button" class="cn-btn" data-cn-per="tarde">Entardecer</button><button type="button" class="cn-btn" data-cn-per="noite">Noite</button></div>' +
      "<h4>Estação e data</h4>" +
      '<div class="cn-chips">' + ["auto", "verao", "outono", "inverno", "primavera"].map(function (k) { return '<button type="button" class="cn-btn' + (a.estacao === k ? " on" : "") + '" data-cn-est="' + k + '">' + (k === "auto" ? "Pela data" : C.ESTACOES[k].nome) + "</button>"; }).join("") + "</div>" +
      '<div class="cn-lin"><label for="cn-data">Data</label><input type="date" id="cn-data" data-cn="data" value="' + esc(ef.data) + '"><span class="cn-nota" style="margin:0">' + esc(C.ESTACOES[ef.estacao] ? C.ESTACOES[ef.estacao].nome : "") + "</span></div>" +
      '<div class="cn-nota">A data e a hora mudam a altura do sol (e a luz que entra) para o local do projeto.</div>' +
      "<h4>Céu</h4>" +
      slider("Nuvens", "nuvens", 0, 100, 1, Math.round(a.nuvens * 100), function (x) { return x + "%"; }) +
      '<div class="cn-lin"><label for="cn-ceu">Céu</label><select id="cn-ceu" data-cn="ceu" style="flex:1"><option value="auto">Automático (foto de céu real)</option><option value="calculado">Calculado</option></select></div>' +
      slider("Exposição", "expo", -2, 2, 0.1, a.exposicao, function (x) { return (x > 0 ? "+" : "") + fmt(x, 1); });
    onSliders(el, function (k, v, sp, vivo) {
      var ch = null;
      if (k === "hora") { if (sp) sp.textContent = C.hm(v); ch = { hora: C.hm(v) }; }
      else if (k === "nuvens") { if (sp) sp.textContent = v + "%"; ch = { nuvens: v / 100 }; }
      else if (k === "expo") { if (sp) sp.textContent = (v > 0 ? "+" : "") + fmt(v, 1); ch = { exposicao: v }; }
      if (ch) self.mudar(C.definirAmbiente(S.estado, ch, { normalizarObjeto: OB() && OB().normalizar }), "amb:" + k, ["ambiente"]);
    });
    [].forEach.call(el.querySelectorAll("[data-cn-per]"), function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-cn-per"), h = p === "manha" ? "09:00" : p === "dia" ? "12:00" : p === "tarde" ? horaDoSol(4) : horaDoSol(-10);
        self.mudar(C.definirAmbiente(S.estado, { hora: h }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]); self._pintarAba();
      };
    });
    [].forEach.call(el.querySelectorAll("[data-cn-est]"), function (b) {
      b.onclick = function () { var k = b.getAttribute("data-cn-est"); self.mudar(C.definirAmbiente(S.estado, k === "auto" ? { estacao: "auto", data: "" } : { estacao: k }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]); self._pintarAba(); };
    });
    el.querySelector('[data-cn="data"]').onchange = function () { var d = this.value; self.mudar(C.definirAmbiente(S.estado, { data: d, estacao: "auto" }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]); self._pintarAba(); };
    var sc = el.querySelector('[data-cn="ceu"]');
    import(url("bimceuhdri.js")).then(function (H) { return H.manifesto(); }).then(function (m) {
      if (!S || S.aba !== "ambiente") return;
      (m.ceus || []).forEach(function (c) { var op = document.createElement("option"); op.value = c.id; op.textContent = c.nome + " (" + String(c.tipo || "").replace(/-/g, " ") + ")"; sc.appendChild(op); });
      sc.value = a.ceu;
    })["catch"](function () {});
    sc.value = a.ceu;
    sc.onchange = function () { self.mudar(C.definirAmbiente(S.estado, { ceu: sc.value }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]); };
  };

  /* ----- Luzes */
  Cena._aba_luzes = function (el) {
    var s = S, self = this, C = CE(), c = s.vivo.circuitos;
    var h = '<div class="cn-nota">As luminárias do projeto, ligadas por comando (o que o interruptor acende). Clique num interruptor ou luminária na cena para acender.</div>' +
      '<div class="cn-chips"><button type="button" class="cn-btn" data-cn-per="dia">Dia</button><button type="button" class="cn-btn" data-cn-per="tarde">Entardecer</button><button type="button" class="cn-btn" data-cn-per="noite">Noite</button></div>';
    if (c && c.comandos && c.comandos.length) {
      h += '<div class="cn-chips"><button type="button" class="cn-btn" data-cn-tudo="1">Tudo ligado</button><button type="button" class="cn-btn" data-cn-tudo="0">Tudo apagado</button></div>' +
        '<div class="cn-nota">' + (c.info && c.info.pronto ? "Luz de " + c.comandos.length + " comando(s) gravada." : (c.info && c.info.assados ? "Gravando a luz: " + c.info.assados + " de " + c.comandos.length : "A luz por comando é gravada depois da luz do sol.")) + "</div>" +
        '<div class="cn-lista">' + c.comandos.map(function (k) {
          return '<label class="cn-item" style="cursor:pointer"><input type="checkbox" data-cn-cmd="' + esc(k.id) + '"' + (k.ligado ? " checked" : "") + '><span class="cn-n">' + esc(k.nome) + "</span><small>" + k.luzes.length + (k.luzes.length === 1 ? " ponto" : " pontos") + "</small></label>";
        }).join("") + "</div>";
    } else h += '<div class="cn-aviso">Este projeto não tem luminárias. Arraste luminárias da Biblioteca ou use <b>Sugerir iluminação</b> para pôr as do catálogo em cada ambiente.</div>';
    h += '<div style="display:flex;gap:6px;margin-top:10px"><button type="button" class="cn-btn" data-cn="sugerir">Sugerir iluminação…</button></div>' +
      '<h4>Luzes dos objetos</h4><div class="cn-nota">Luminárias arrastadas da biblioteca aparecem no desenho. Para que elas também iluminem a cena (luz de verdade) ligue abaixo — a primeira vez recompila a cena inteira e leva alguns minutos num computador comum.</div>' +
      '<label class="cn-item" style="cursor:pointer"><input type="checkbox" data-cn="luzreal"' + (s.vivo.objetos && s.vivo.objetos.info && s.vivo.objetos.info().luzes && s.vivo.objetos.info().luzes.luzReal ? " checked" : "") + '><span class="cn-n">Luminárias da cena iluminam de verdade</span></label>';
    el.innerHTML = h;
    [].forEach.call(el.querySelectorAll("[data-cn-per]"), function (b) {
      b.onclick = function () { var p = b.getAttribute("data-cn-per"), hh = p === "dia" ? "12:00" : p === "tarde" ? horaDoSol(4) : horaDoSol(-10); self.mudar(C.definirAmbiente(S.estado, { hora: hh }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]); };
    });
    [].forEach.call(el.querySelectorAll("[data-cn-cmd]"), function (cb) { cb.onchange = function () { c.ligar(cb.getAttribute("data-cn-cmd"), cb.checked); self._tique(); }; });
    [].forEach.call(el.querySelectorAll("[data-cn-tudo]"), function (b) { b.onclick = function () { c.tudo(b.getAttribute("data-cn-tudo") === "1"); self._tique(); self._pintarAba(); }; });
    var sg = el.querySelector('[data-cn="sugerir"]');
    sg.onclick = function () { s.luzesCompleto = true; var antigo = s.tela.querySelector('[data-rv="luzes"]'); if (antigo) { antigo.style.display = ""; antigo.style.top = "54px"; antigo.style.left = "10px"; var b = antigo.querySelector('[data-luz-acao="sugerir"]'); if (b) b.click(); } else toast("O painel de sugestão ainda está carregando; tente de novo em instantes.", "info"); };
    var lr = el.querySelector('[data-cn="luzreal"]');
    lr.onchange = function () { try { s.vivo.objetos.luzesReais(lr.checked); toast(lr.checked ? "Luz real ligada: a cena está recompilando, aguarde." : "Luz real desligada.", "info", 4000); } catch (e) { toast("Não consegui mudar: " + (e && e.message || e), "erro"); } };
  };

  /* ----- Câmeras */
  Cena._aba_cameras = function (el) {
    var s = S, self = this, C = CE();
    el.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cn-btn on" data-cn="salvarcam">Salvar câmera atual</button><button type="button" class="cn-btn" data-cn="percurso"' + (s.estado.cameras.length < 2 ? " disabled" : "") + ">" + (s.percurso ? "Parar percurso" : "Percorrer câmeras") + "</button></div>" +
      '<div class="cn-nota">Cada câmera guarda a posição, o ângulo e a hora. As setas da barra de cima vão de uma à outra com transição suave. ' + s.estado.cameras.length + " de " + C.TETO.cameras + ".</div>" +
      '<div class="cn-lista">' + s.estado.cameras.map(function (c) {
        return '<div class="cn-item' + (c.id === s.estado.camAtiva ? " on" : "") + '" style="cursor:default;flex-wrap:wrap" data-cn-cam="' + esc(c.id) + '">' + (c.miniatura ? '<img class="cn-mini" alt="" src="' + c.miniatura + '">' : '<span class="cn-mini"></span>') +
          '<input type="text" value="' + esc(c.nome) + '" data-cn-camnome="' + esc(c.id) + '" style="flex:1;min-width:80px"><small>' + (c.hora || "") + "</small>" +
          '<span style="display:flex;gap:3px;width:100%;justify-content:flex-end"><button type="button" class="cn-btn" data-cn-camacao="ir" title="Ir para esta câmera">Ir</button><button type="button" class="cn-btn" data-cn-camacao="atualizar" title="Regravar com a vista de agora">Atualizar</button><button type="button" class="cn-btn" data-cn-camacao="sobe" title="Subir na ordem">&uarr;</button><button type="button" class="cn-btn" data-cn-camacao="desce" title="Descer na ordem">&darr;</button><button type="button" class="cn-btn" data-cn-camacao="excluir">Excluir</button></span></div>';
      }).join("") + "</div>";
    el.querySelector('[data-cn="salvarcam"]').onclick = function () { self.salvarCamera(); };
    el.querySelector('[data-cn="percurso"]').onclick = function () { self.percurso(); };
    [].forEach.call(el.querySelectorAll("[data-cn-camnome]"), function (i) { i.onchange = function () { self.mudar(C.renomearCamera(S.estado, i.getAttribute("data-cn-camnome"), i.value, { normalizarObjeto: OB() && OB().normalizar }), null, []); self._pintarBarra(); }; });
    [].forEach.call(el.querySelectorAll("[data-cn-camacao]"), function (b) {
      b.onclick = function () {
        var id = b.closest("[data-cn-cam]").getAttribute("data-cn-cam"), a = b.getAttribute("data-cn-camacao"), opc = { normalizarObjeto: OB() && OB().normalizar };
        if (a === "ir") self.irParaCamera(id);
        else if (a === "atualizar") self.atualizarCamera(id);
        else if (a === "sobe" || a === "desce") { self.mudar(C.moverCamera(S.estado, id, a === "sobe" ? -1 : 1, opc), null, []); self._pintarAba(); }
        else if (a === "excluir") { self.mudar(C.removerCamera(S.estado, id, opc), null, []); self._pintarAba(); }
      };
    });
  };
  Cena._camAtualProjeto = function () {
    var v = S.vivo, c = v.cameraAtual(); return CE().cameraParaProjeto({ pos: c.pos, alvo: c.alvo, fov: c.fov }, this.origem());
  };
  Cena.salvarCamera = function () {
    var s = S, self = this, C = CE();
    return this._foto("image/jpeg", 0.6, 160).then(function (mini) {
      var r = C.adicionarCamera(s.estado, { camera: self._camAtualProjeto(), hora: s.estado.ambiente.hora || undefined, miniatura: mini || undefined }, { normalizarObjeto: OB() && OB().normalizar });
      if (r.erro) { toast(r.erro, "aviso", 5000); return null; }
      self.mudar(r.estado, null, []); self._pintarAba(); toast("Câmera salva: " + r.estado.cameras[r.estado.cameras.length - 1].nome, "ok", 2500); return r.id;
    });
  };
  Cena.atualizarCamera = function (id) {
    var s = S, self = this, C = CE();
    return this._foto("image/jpeg", 0.6, 160).then(function (mini) {
      self.mudar(C.atualizarCamera(s.estado, id, self._camAtualProjeto(), { miniatura: mini || undefined, hora: s.estado.ambiente.hora || undefined }, { normalizarObjeto: OB() && OB().normalizar }), null, []); self._pintarAba();
    });
  };
  /* transição suave (1,2 s): posição e alvo interpolados; o ângulo de visão também */
  Cena.irParaCamera = function (id, semAnim) {
    var s = S, self = this, C = CE(), c = s.estado.cameras.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var v = s.vivo, alvo = C.cameraParaMotor(c.camera, this.origem());
    s.estado = Object.assign({}, s.estado, { camAtiva: id }); s.hist.registrar(s.estado, null);
    if (c.hora && c.hora !== s.estado.ambiente.hora) this.mudar(C.definirAmbiente(s.estado, { hora: c.hora }, { normalizarObjeto: OB() && OB().normalizar }), null, ["ambiente"]);
    var a0 = v.cameraAtual(), p0 = a0.pos, t0 = a0.alvo, f0 = a0.fov, f1 = alvo.fov || 50;
    if (!alvo.alvo) { var q = alvo.quat, d = [0, 0, -10]; /* quaternion → direção */ var x = q[0], y = q[1], z = q[2], w = q[3]; var vx = d[0], vy = d[1], vz = d[2]; var tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx); alvo.alvo = [alvo.pos[0] + vx + w * tx + (y * tz - z * ty), alvo.pos[1] + vy + w * ty + (z * tx - x * tz), alvo.pos[2] + vz + w * tz + (x * ty - y * tx)]; }
    var ini = agora(), dur = semAnim ? 0 : 1200; clearTimeout(s.tCam); s.animCam = (s.animCam || 0) + 1; var tok = s.animCam;
    var passo = function () {
      if (!S || tok !== S.animCam) return;
      var k = dur ? Math.min(1, (agora() - ini) / dur) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var mix = function (a, b) { return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]; };
      v.definirCamera({ pos: mix(p0, alvo.pos), alvo: mix(t0, alvo.alvo), fov: f0 + (f1 - f0) * e });
      if (k < 1) requestAnimationFrame(passo); else { self._pintarBarra(); if (S.aba === "cameras") self._pintarAba(); }
    };
    passo();
  };
  Cena.percurso = function () {
    var s = S, self = this, C = CE();
    if (s.percurso) { clearInterval(s.percurso); s.percurso = null; this._pintarAba(); return; }
    if (s.estado.cameras.length < 2) return;
    var passo = function () { var c = C.vizinhaCamera(S.estado, 1); if (c) self.irParaCamera(c.id); };
    s.percurso = setInterval(passo, 6000); passo(); this._pintarAba();
  };

  /* ----- Efeitos */
  Cena._aba_efeitos = function (el) {
    var s = S, self = this, C = CE(), e = s.estado.efeitos;
    var sec = function (k, rot, nota, extra) {
      return "<h4>" + rot + '</h4><label class="cn-item" style="cursor:pointer"><input type="checkbox" data-cn-ef="' + k + '"' + (e[k].on ? " checked" : "") + '><span class="cn-n">Ligado</span></label>' +
        slider("Força", k + "-forca", 0, 1, 0.05, e[k].forca, function (x) { return Math.round(x * 100) + "%"; }) + (extra || "") + '<div class="cn-nota">' + nota + "</div>";
    };
    el.innerHTML =
      sec("raios", "Raios de sol", "Luz que atravessa o ar em direção à câmera quando o sol está à frente. Pesa um pouco na placa de vídeo.") +
      sec("vento", "Vento", "Balança a grama, as árvores e as cortinas.", slider("Direção", "vento-dir", 0, 359, 1, Math.round(e.vento.dir), function (x) { return x + "°"; })) +
      sec("agua", "Água em movimento", "Ondas na piscina e no espelho d'água.") +
      "<h4>Fogueira e fumaça</h4>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cn-btn' + (s.armado === "fogo" ? " on" : "") + '" data-cn="acender">Colocar fogueira…</button></div>' +
      '<div class="cn-lista" style="margin-top:6px">' + s.estado.fogos.map(function (f, i) { return '<div class="cn-item" style="cursor:default"><span class="cn-n">Fogueira ' + (i + 1) + "</span><button type=\"button\" class=\"cn-btn\" data-cn-fogo=\"" + esc(f.id) + '">Apagar</button></div>'; }).join("") + "</div>" +
      '<div class="cn-nota">A chama ainda não ilumina o entorno e some atrás de paredes inteiras (não pela metade).</div>';
    [].forEach.call(el.querySelectorAll("[data-cn-ef]"), function (cb) {
      cb.onchange = function () { var o = {}; o[cb.getAttribute("data-cn-ef")] = { on: cb.checked }; self.mudar(C.definirEfeitos(S.estado, o, { normalizarObjeto: OB() && OB().normalizar }), null, ["efeitos"]); };
    });
    onSliders(el, function (k, v, sp) {
      var o = {};
      if (k === "vento-dir") { o.vento = { dir: v }; if (sp) sp.textContent = Math.round(v) + "°"; }
      else { var g = k.replace("-forca", ""); o[g] = { forca: v }; if (sp) sp.textContent = Math.round(v * 100) + "%"; }
      self.mudar(C.definirEfeitos(S.estado, o, { normalizarObjeto: OB() && OB().normalizar }), "ef:" + k, ["efeitos"]);
    });
    el.querySelector('[data-cn="acender"]').onclick = function () { s.armado = s.armado === "fogo" ? null : "fogo"; self._pintarAba(); };
    [].forEach.call(el.querySelectorAll("[data-cn-fogo]"), function (b) { b.onclick = function () { var id = b.getAttribute("data-cn-fogo"); self.mudar(C.normalizar(Object.assign({}, S.estado, { fogos: S.estado.fogos.filter(function (f) { return f.id !== id; }) }), { normalizarObjeto: OB() && OB().normalizar }), null, ["fogos"]); self._pintarAba(); }; });
  };

  /* ----- Cena (projeto, imagem, aparelho) */
  Cena._aba_cena = function (el) {
    var s = S, self = this, C = CE(), nivelMax = s.nivelMax;
    var tetoPx = nivelMax === "ultra" ? 4096 : (nivelMax === "alta" ? 2560 : 1920);
    var lista = ARM() ? ARM().listar(s.obra) : [];
    el.innerHTML =
      "<h4>Esta cena</h4>" +
      '<div class="cn-lin"><label for="cn-nomecena">Nome</label><input type="text" id="cn-nomecena" data-cn="nomecena" value="' + esc(s.nomeCena || "") + '" placeholder="Ex.: Fachada ao entardecer" style="flex:1"></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cn-btn on" data-cn="salvar">Salvar cena</button><button type="button" class="cn-btn" data-cn="salvarcomo">Salvar como nova</button></div>' +
      '<div class="cn-nota">A cena é salva sozinha no projeto a cada mudança (a "última cena" da obra). "Salvar cena" guarda uma versão com nome e miniatura.' + (s.obra === "geral" ? " <b>Abra uma obra</b> para a cena ficar guardada nela." : "") + "</div>" +
      '<h4>Cenas salvas (' + lista.length + ")</h4><div class=\"cn-lista\">" + (lista.length ? lista.map(function (r) {
        return '<div class="cn-item" style="cursor:default">' + (r.miniatura ? '<img class="cn-mini" alt="" src="' + r.miniatura + '">' : '<span class="cn-mini"></span>') + '<span class="cn-n">' + esc(r.nome) + '</span><button type="button" class="cn-btn" data-cn-abrir="' + esc(r.id) + '">Abrir</button><button type="button" class="cn-btn" data-cn-excl="' + esc(r.id) + '">Excluir</button></div>';
      }).join("") : '<div class="cn-nota">Nenhuma cena salva com nome ainda.</div>') + "</div>" +
      "<h4>Imagem</h4>" +
      '<div class="cn-lin"><label for="cn-res">Tamanho</label><select id="cn-res" data-cn="res" style="flex:1">' + Object.keys(C.RESOLUCOES).filter(function (k) { return k === "tela" || C.RESOLUCOES[k].w <= tetoPx; }).map(function (k) { return '<option value="' + k + '"' + ((s.res || "tela") === k ? " selected" : "") + ">" + C.RESOLUCOES[k].nome + "</option>"; }).join("") + "</select></div>" +
      '<div style="display:flex;gap:6px"><button type="button" class="cn-btn on" data-cn="exportar">Salvar imagem (PNG)</button></div><div class="cn-nota" data-cn="expmsg">O tamanho máximo segue a qualidade do aparelho (' + tetoPx + " px).</div>" +
      "<h4>Aparelho e qualidade</h4><div data-cn=\"sistema\"></div>";
    var nome = el.querySelector('[data-cn="nomecena"]'); nome.onchange = function () { s.nomeCena = nome.value.trim(); self._pintarBarra(); self._agendarSalvar(); };
    el.querySelector('[data-cn="salvar"]').onclick = function () { s.nomeCena = nome.value.trim(); self.salvarNomeada(s.nomeCena, false); };
    el.querySelector('[data-cn="salvarcomo"]').onclick = function () { s.nomeCena = nome.value.trim(); self.salvarNomeada(s.nomeCena, true); };
    [].forEach.call(el.querySelectorAll("[data-cn-abrir]"), function (b) { b.onclick = function () { var id = b.getAttribute("data-cn-abrir"); self.fechar(); setTimeout(function () { Cena.abrir({ cenaId: id }); }, 300); }; });
    [].forEach.call(el.querySelectorAll("[data-cn-excl]"), function (b) { b.onclick = function () { if (ARM().excluir(b.getAttribute("data-cn-excl"))) { toast("Cena excluída.", "info", 2500); self._pintarAba(); } }; });
    var rs = el.querySelector('[data-cn="res"]'); rs.onchange = function () { s.res = rs.value; };
    el.querySelector('[data-cn="exportar"]').onclick = function () { self.exportar(rs.value); };
    this._pintarSistema();
  };
  Cena._pintarSistema = function () {
    var s = S; if (!s || !s.corpo) return; var el = s.corpo.querySelector('[data-cn="sistema"]'); if (!el) return;
    var C = CE(), v = s.vivo, cls = s.cls, mem = global.performance && performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    el.innerHTML =
      '<div class="cn-nota">Placa: ' + esc(s.ap.descricao || "não informada") + (cls.software ? " (por software)" : "") + "<br>Qualidade em uso: <b>" + esc(s.nivel) + "</b> · resolução " + Math.round((v.escalaDin || 1) * 100) + "% · " + fmt(v.estado.qps) + " qps" + (mem != null ? " · memória da página " + fmt(mem) + " MB" : "") + "</div>" +
      '<div class="cn-chips">' + ["auto", "leve", "alta", "ultra"].map(function (m) { return '<button type="button" class="cn-btn' + (s.estado.qualidade.modo === m ? " on" : "") + '" data-cn-q="' + m + '">' + (m === "auto" ? "Automática" : m.charAt(0).toUpperCase() + m.slice(1)) + "</button>"; }).join("") + "</div>" +
      (s.avisoFluidez ? '<div class="cn-aviso">' + esc(s.avisoFluidez) + (s.sugerirNivel ? ' <button type="button" class="cn-btn" data-cn="trocarnivel">Usar ' + esc(s.sugerirNivel) + "</button>" : "") + "</div>" : "") +
      '<div class="cn-nota">' + esc((cls.motivos || []).join(" · ")) + "</div>" +
      '<div class="cn-nota">Automática: o OrçaPRO escolhe pela placa de vídeo e, se a imagem ficar abaixo de ' + s.ctrl.alvo + " quadros por segundo, reduz a resolução sozinho.</div>";
    var self = this;
    [].forEach.call(el.querySelectorAll("[data-cn-q]"), function (b) { b.onclick = function () { self._trocarQualidade(b.getAttribute("data-cn-q")); }; });
    var tn = el.querySelector('[data-cn="trocarnivel"]'); if (tn) tn.onclick = function () { self._trocarQualidade(s.sugerirNivel); };
  };
  Cena._trocarQualidade = function (modo) {
    var s = S, self = this, C = CE();
    var novo = C.normalizar(Object.assign({}, s.estado, { qualidade: { modo: modo } }), { normalizarObjeto: OB() && OB().normalizar });
    var nivel = modo === "auto" ? s.cls.nivel : modo;
    s.estado = novo; s.hist.registrar(novo, null);
    if (nivel === s.nivel) { s.avisoFluidez = null; s.sugerirNivel = null; this._pintarSistema(); this._agendarSalvar(); return; }
    toast("Mudando a qualidade para " + nivel + ": a cena será remontada.", "info", 4000);
    var e = this._estadoParaSalvar(); e.qualidade = { modo: modo };
    if (ARM()) ARM().salvarPadrao(s.obra, e);
    this.fechar(); setTimeout(function () { Cena.abrir({ estado: e }); }, 400);
  };

  /* ---------------------------------------------------------------- exportar a imagem */
  Cena.exportar = function (resKey) {
    var s = S, self = this, C = CE(), v = s.vivo, msg = s.corpo && s.corpo.querySelector('[data-cn="expmsg"]');
    if (s.exportando) return Promise.resolve(null);
    var razao = v.canvas.clientWidth / Math.max(1, v.canvas.clientHeight);
    var teto = Math.min(s.ap.maxTextura2D || 8192, s.nivelMax === "ultra" ? 4096 : (s.nivelMax === "alta" ? 2560 : 1920));
    var alvo = C.tamanhoSaida(resKey, razao, teto);
    s.exportando = true; if (msg) msg.textContent = "Gerando a imagem…";
    var restaura = function () { s.exportando = false; if (v.escalaSaida && v.escalaSaida !== 1) { v.escalaSaida = 1; v._redimensionar(); } };
    var passo = Promise.resolve();
    if (alvo) {
      var base = Math.min(global.devicePixelRatio || 1, 2) * v.qual.escala * (v.escalaDin || 1);
      v.escalaSaida = Math.max(0.5, Math.min(4, alvo.w / (Math.max(1, v.palco.clientWidth) * base))); v._redimensionar();   /* ⚠ o motor dimensiona pelo PALCO, não pelo canvas */
      /* ~25 quadros: a suavização temporal (TRAA) precisa de amostras no tamanho novo */
      passo = new Promise(function (r) { var q0 = v._quadros || 0, t = setInterval(function () { if ((v._quadros || 0) > q0 + 25 || !S) { clearInterval(t); r(); } }, 60); });
    }
    return passo.then(function () { return self._foto("image/png", undefined, 0); }).then(function (d) {
      var w = v.canvas.width, h = v.canvas.height; restaura();
      if (!d) { if (msg) msg.textContent = "Não consegui capturar a imagem (o navegador recusou). Tente de novo com a câmera parada."; return null; }
      var cam = s.estado.cameras.filter(function (c) { return c.id === s.estado.camAtiva; })[0];
      var a = document.createElement("a"); a.href = d; a.download = C.nomeArquivo({ nome: s.nomeCena }, cam && cam.nome, new Date());
      document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
      if (msg) msg.textContent = "Imagem salva: " + a.download + " (" + w + "×" + h + ").";
      s.ultimaImagem = { arquivo: a.download, w: w, h: h, bytes: d.length };
      return s.ultimaImagem;
    });
  };

  /* ---------------------------------------------------------------- antes × depois */
  Cena.marcarAntes = function () {
    var s = S, self = this, C = CE();
    return this._foto("image/jpeg", 0.85, 0).then(function (d) {
      if (!d) { toast("Não consegui guardar a imagem de antes.", "aviso", 4000); return; }
      s.antes = { img: d, estado: C.copia(s.estado), camera: s.vivo.cameraAtual() };
      toast("Imagem de antes guardada. Faça as mudanças e use Antes / depois.", "ok", 4000); self._pintarBarra();
    });
  };
  Cena.comparar = function () {
    var s = S, self = this, C = CE(), v = s.vivo;
    if (!s.antes) return;
    if (s.comparar) { this._sairComparar(); return; }
    s.comparar = true;
    /* o "antes" é uma foto: a câmera tem de ser a mesma. Volta para a do antes (sem animação) e trava a navegação debaixo da camada */
    v.definirCamera({ pos: s.antes.camera.pos, alvo: s.antes.camera.alvo, fov: s.antes.camera.fov });
    var d = C.diferencas(s.antes.estado, s.estado);
    var c = s.comp = document.createElement("div"); c.className = "cn-comp"; c.setAttribute("data-cn", "comparar");
    c.innerHTML = '<img alt="Antes" src="' + s.antes.img + '"><div class="cn-div"></div><div class="cn-alca">&harr;</div><div class="cn-rot" style="left:12px">ANTES</div><div class="cn-rot" style="right:372px">DEPOIS</div>' +
      '<div class="cn-rot" style="left:50%;bottom:10px;top:auto;transform:translateX(-50%);max-width:60%">' + (d.length ? esc(d.slice(0, 4).join(" · ") + (d.length > 4 ? " · +" + (d.length - 4) : "")) : "Sem diferenças entre o antes e agora") + "</div>";
    s.tela.appendChild(c);
    var pos = 0.5, img = c.querySelector("img"), div = c.querySelector(".cn-div"), alca = c.querySelector(".cn-alca");
    var pintar = function () { var w = c.clientWidth; img.style.clipPath = "inset(0 " + Math.round((1 - pos) * w) + "px 0 0)"; div.style.left = Math.round(pos * w) + "px"; alca.style.left = Math.round(pos * w) + "px"; };
    var mover = function (ev) { var r = c.getBoundingClientRect(); pos = C.posDivisor(ev.clientX - r.left, r.width); pintar(); };
    var solta = function () { c.removeEventListener("pointermove", mover); };
    c.onpointerdown = function (ev) { c.setPointerCapture(ev.pointerId); mover(ev); c.addEventListener("pointermove", mover); };
    c.onpointerup = solta;
    s.compRedim = pintar; global.addEventListener("resize", pintar); pintar();
    this._pintarBarra();
  };
  Cena._sairComparar = function () {
    var s = S; if (!s) return;
    if (s.comp && s.comp.parentNode) s.comp.parentNode.removeChild(s.comp);
    if (s.compRedim) global.removeEventListener("resize", s.compRedim);
    s.comp = null; s.comparar = false; this._pintarBarra(); this._pintarDica();
  };

  /* ---------------------------------------------------------------- objetos: arrastar da biblioteca, selecionar, mover */
  function fracao(ev, el) { var r = el.getBoundingClientRect(); return [(ev.clientX - r.left) / Math.max(1, r.width), (ev.clientY - r.top) / Math.max(1, r.height)]; }
  Cena.colocar = function (itemId, fx, fy) {
    var s = S, C = CE(), O = OB(), v = s.vivo; if (!O || !v.objetos) return null;
    var it = O.item(itemId); if (!it) return null;
    var p = v.objetos.pontoNoChao(fx, fy);
    if (!p) { toast("Não achei o chão nesse ponto. Aponte para o piso ou o gramado.", "aviso", 3500); return null; }
    var o = O.novo(itemId, p, 0);
    var orc = O.orcamento(s.estado.objetos.concat([o]));
    if (!orc.ok) { toast(orc.motivo, "aviso", 6000); return null; }
    var novo = C.normalizar(Object.assign({}, s.estado, { objetos: s.estado.objetos.concat([o]) }), { normalizarObjeto: O.normalizar });
    this.mudar(novo, null, ["objetos"]); this.selecionar(o.id);
    return o.id;
  };
  Cena.selecionar = function (id) {
    var s = S; s.sel = id; try { if (s.vivo.objetos) s.vivo.objetos.realcar(id); } catch (e) {}
    this._pintarSel(); if (s.aba === "biblioteca") this._pintarDica();
  };
  Cena._pintarSel = function () {
    var s = S, self = this, b = s.selBarra; if (!b) return;
    var o = s.sel && s.estado.objetos.filter(function (x) { return x.id === s.sel; })[0], it = o && OB().item(o.item);
    if (!o || !it) { b.style.display = "none"; return; }
    b.style.display = "flex";
    b.innerHTML = '<b style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.nome) + '</b><button type="button" class="cn-btn" data-cn-o="giraE" title="Girar 15° (R)">&#8634;</button><button type="button" class="cn-btn" data-cn-o="giraD">&#8635;</button><button type="button" class="cn-btn" data-cn-o="menor" title="Menor ([)">&minus;</button><button type="button" class="cn-btn" data-cn-o="maior" title="Maior (])">+</button><button type="button" class="cn-btn" data-cn-o="dup">Duplicar</button><button type="button" class="cn-btn" data-cn-o="del" title="Excluir (Delete)">Excluir</button><button type="button" class="cn-btn" data-cn-o="x">&times;</button>';
    b.onclick = function (ev) { var k = ev.target.closest && ev.target.closest("[data-cn-o]"); if (k) self._acaoObjeto(k.getAttribute("data-cn-o")); };
  };
  Cena._acaoObjeto = function (a) {
    var s = S, C = CE(), O = OB(), opc = { normalizarObjeto: O.normalizar };
    var i = -1; s.estado.objetos.forEach(function (x, k) { if (x.id === s.sel) i = k; }); if (i < 0) return;
    var o = Object.assign({}, s.estado.objetos[i]), lista = s.estado.objetos.slice();
    if (a === "x") { this.selecionar(null); return; }
    if (a === "giraE") o.rotY -= Math.PI / 12; else if (a === "giraD") o.rotY += Math.PI / 12;
    else if (a === "menor") o.esc = Math.max(0.2, o.esc / 1.1); else if (a === "maior") o.esc = Math.min(5, o.esc * 1.1);
    else if (a === "del") { lista.splice(i, 1); s.sel = null; }
    else if (a === "dup") { var c = O.novo(o.item, [o.pos[0] + 0.6, o.pos[1], o.pos[2] + 0.6], o.rotY, { esc: o.esc, par: o.par }); lista.push(c); this.mudar(C.normalizar(Object.assign({}, s.estado, { objetos: lista }), opc), null, ["objetos"]); this.selecionar(c.id); return; }
    if (a !== "del") lista[i] = o;
    this.mudar(C.normalizar(Object.assign({}, s.estado, { objetos: lista }), opc), a === "del" ? null : "obj:" + o.id + ":" + a, ["objetos"]);
    this._pintarSel();
    if (a === "del") this.selecionar(null);
  };

  /* ---------------------------------------------------------------- eventos da cena (palco) */
  Cena._ligarEventos = function () {
    var s = S, self = this, palco = s.palco, C = CE(), O = OB();
    var ev = s.ev = [];
    var on = function (alvo, tipo, fn, cap) { alvo.addEventListener(tipo, fn, cap); ev.push([alvo, tipo, fn, cap]); };
    on(palco, "dragover", function (e) { if (s.arrastando || (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "text/x-orcapro-cena") >= 0)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
    on(palco, "drop", function (e) {
      var id = ""; try { id = e.dataTransfer.getData("text/x-orcapro-cena"); } catch (x) {} id = id || s.arrastando; if (!id) return;
      e.preventDefault(); var f = fracao(e, s.vivo.canvas); s.arrastando = null; self.colocar(id, f[0], f[1]);
    });
    /* clique: colocar (item armado / fogueira), escolher material ou selecionar objeto. Arrastar = navegar. */
    var down = null;
    on(palco, "pointerdown", function (e) {
      if (s.comparar) return;
      down = { x: e.clientX, y: e.clientY, t: agora(), b: e.button };
      /* objeto selecionado sob o ponteiro: arrastar MOVE o objeto (a captura do palco vem antes da navegação) */
      if (e.button === 0 && s.sel && s.vivo.objetos && !s.armado) {
        var f = fracao(e, s.vivo.canvas), id = s.vivo.objetos.escolher(f[0], f[1]);
        if (id === s.sel) { e.stopPropagation(); s.movendo = { id: id, moveu: false }; try { palco.setPointerCapture(e.pointerId); } catch (x) {} }
      }
    }, true);
    on(palco, "pointermove", function (e) {
      if (!s.movendo) return;
      e.stopPropagation(); s.movendo.moveu = true;
      var f = fracao(e, s.vivo.canvas), p = s.vivo.objetos.pontoNoChao(f[0], f[1]); if (!p) return;
      var lista = s.estado.objetos.map(function (o) { return o.id === s.movendo.id ? Object.assign({}, o, { pos: [p[0], p[1], p[2]] }) : o; });
      s.estado = Object.assign({}, s.estado, { objetos: lista });
      if (!s.movQuadro) { s.movQuadro = true; requestAnimationFrame(function () { s.movQuadro = false; if (S) self._sincObjetos(); }); }
    }, true);
    on(palco, "pointerup", function (e) {
      if (s.movendo) {
        var m = s.movendo; s.movendo = null; e.stopPropagation();
        if (m.moveu) { var novo = C.normalizar(s.estado, { normalizarObjeto: O.normalizar }); s.estado = novo; s.hist.registrar(novo, null); self._sincObjetos(); self._agendarSalvar(); self._pintarBarra(); }
        down = null; return;
      }
      if (!down || s.comparar) return;
      var d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = agora() - down.t, b = down.b; down = null;
      if (d > 4 || dt > 450 || b !== 0) return;
      var f = fracao(e, s.vivo.canvas);
      if (s.armado === "fogo") { self._acenderFogo(f[0], f[1]); return; }
      if (s.armado) { var nid = self.colocar(s.armado, f[0], f[1]); return; }
      if (s.aba === "materiais" && s.mats) { var mid = s.mats.materialSob(f[0], f[1]); if (mid) { s.matSel = mid; self._pintarAba(); } return; }
      if (s.vivo.objetos) { var oid = s.vivo.objetos.escolher(f[0], f[1]); self.selecionar(oid || null); }
    });
    /* a página some (fechar a aba, trocar de app no celular): grava o pendente na hora (R4) */
    on(global, "pagehide", function () { try { self._gravarAoSair(); } catch (x) {} });
    on(document, "visibilitychange", function () { if (document.hidden && S && S.sujo) { try { self.salvarPadrao(); } catch (x) {} } });
    on(global, "keydown", function (e) {
      if (!S || !S.vivo) return;
      var alvo = (e.target && e.target.tagName) || ""; if (/input|select|textarea/i.test(alvo)) return;
      var k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) self.refazer(); else self.desfazer(); }
      else if ((e.ctrlKey || e.metaKey) && (k === "y" || k === "Y")) { e.preventDefault(); self.refazer(); }
      else if (k === "Escape") { if (s.comparar) self._sairComparar(); else if (s.armado) { s.armado = null; self._pintarAba(); } else if (s.sel) self.selecionar(null); }
      else if (k === "Delete" && s.sel) self._acaoObjeto("del");
      else if ((k === "r" || k === "R") && s.sel) self._acaoObjeto("giraD");
      else if (k === "[" && s.sel) self._acaoObjeto("menor");
      else if (k === "]" && s.sel) self._acaoObjeto("maior");
      else if (k === "PageDown" || k === "PageUp") { var c = C.vizinhaCamera(s.estado, k === "PageDown" ? 1 : -1); if (c) { e.preventDefault(); self.irParaCamera(c.id); } }
    });
    /* cada quadro: capturas pedidas e a leitura de luzes */
    var antes = s.vivo.aoQuadro;
    s.vivo.aoQuadro = function (vv) { if (antes) antes(vv); self._noQuadro(); };
    s.aoQuadroAntes = antes;
  };
  Cena._desligarEventos = function () {
    var s = S; if (!s) return;
    (s.ev || []).forEach(function (r) { try { r[0].removeEventListener(r[1], r[2], r[3]); } catch (e) {} });
    s.ev = [];
  };
  Cena._acenderFogo = function (fx, fy) {
    var s = S, C = CE(), v = s.vivo, p = v.objetos && v.objetos.pontoNoChao(fx, fy);
    if (!p) { toast("Aponte para o chão para acender a fogueira.", "aviso", 3000); return; }
    var O = this.origem(), ch = v.efeitos.chaoEm ? v.efeitos.chaoEm(p[0] - O[0], p[2] - O[2], p[1] - O[1] + 2) : null;
    var pos = [p[0], ch != null ? ch + O[1] : p[1], p[2]];
    var f = { id: C.novoId("fogo"), pos: pos, escala: 1 };
    this.mudar(C.normalizar(Object.assign({}, s.estado, { fogos: s.estado.fogos.concat([f]) }), { normalizarObjeto: OB() && OB().normalizar }), null, ["fogos"]);
    s.armado = null; if (s.aba === "efeitos") this._pintarAba();
  };

  /* ---------------------------------------------------------------- introspecção para teste e suporte */
  Cena.diagnostico = function () {
    var s = S; if (!s) return null; var v = s.vivo;
    return { obra: s.obra, nivel: s.nivel, escalaDin: v && v.escalaDin || 1, qps: v && v.estado && v.estado.qps, estado: s.estado, sel: s.sel, armado: s.armado, comparar: s.comparar, antes: !!s.antes,
      aparelho: s.ap, classe: s.cls, ctrl: s.ctrl && { escala: s.ctrl.escala, nivel: s.ctrl.nivel, historico: s.ctrl.historico }, ultimoSalvo: s.ultimoRes, ultimaImagem: s.ultimaImagem || null, aba: s.aba,
      desfazer: s.hist && { pode: s.hist.podeDesfazer(), refaz: s.hist.podeRefazer(), n: s.hist.pilha.length } };
  };

  Cena.inspecionarMaterial = function (id) { return S && S.mats ? S.mats.inspecionar(id) : null; };

  global.BimCenaUI = Cena;
  if (typeof module !== "undefined" && module.exports) module.exports = Cena;
})(typeof window !== "undefined" ? window : this);
