/* =====================================================================
 * iarender.js — RENDER POR IA, sem placa de vídeo (F4, 07/10/2026)
 *
 * "Renderizar com IA" no BIM: captura a vista 3D ATUAL (e a mesma vista em
 * linha oculta, que guia a forma), o usuário escreve o escopo ("fim de
 * tarde, paisagismo tropical, mesa de madeira maciça para 6 lugares, piso
 * de porcelanato claro") e pode anexar imagens de referência. O servidor de
 * IA (POST /ia/render, server/ia-gemini.js — Gemini) devolve a imagem
 * preservando a geometria e o enquadramento.
 *
 * GALERIA DA OBRA: cada render vira um registro LEVE no Store "bim_renders"
 * (obraId, escopo, data, autor, modelo de IA, tamanho) e os BYTES moram no
 * IndexedDB DO APARELHO (Idb "iarender:<id>" e a miniatura
 * "iarender:min:<id>").
 * ⚠ NUNCA base64 de imagem no Store/localStorage: imagem dentro do registro
 *   sincronizado já parou a sincronização de um cliente (js/fotos.js conta).
 * ⚠ A MARCA "Ilustração gerada por IA — não é projeto executivo" vai na
 *   galeria, na tela do resultado e QUEIMADA no PNG baixado: a imagem sai do
 *   app e vai para o WhatsApp do cliente — a marca tem de ir junto.
 *
 * OBJETO NO MODELO × SÓ NO RENDER (a mesa que o usuário quer):
 *   • só no render → vai no texto (e a imagem dele como referência);
 *   • no modelo, Poly Haven → busca um modelo 3D CC0 em api.polyhaven.com,
 *     baixa o glTF e importa com BIM.importarMalha. Direto do NAVEGADOR:
 *     a API e o dl.polyhaven.org respondem Access-Control-Allow-Origin: *
 *     (medido em 07/10/2026), e desde 18/07/2026 a API é livre para uso
 *     comercial pedindo só que fique CLARO que a peça veio da Poly Haven —
 *     por isso o nome da peça leva "Poly Haven (CC0)". Nenhum outro site:
 *     licença incerta não entra no modelo de cliente;
 *   • no modelo, família por IA → abre a Família por IA (js/iafamilia.js)
 *     já com a descrição e a imagem do objeto.
 * ES5; partes puras exportadas para o Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function ic(n) { try { return global.Icones && Icones.get ? Icones.get(n, 15) : ""; } catch (e) { return ""; } }
  function IAF() { return global.IAFamilia; }
  function sem(s) { return String(s || "").toLowerCase().normalize ? String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : String(s || "").toLowerCase(); }

  var MARCA = "Ilustração gerada por IA — não é projeto executivo";
  var ENT = "bim_renders", PREF = "iarender:", PREF_MIN = "iarender:min:";
  var PROPORCOES = [["16:9", 16 / 9], ["21:9", 21 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3], ["5:4", 5 / 4], ["1:1", 1], ["4:5", 4 / 5], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16]];
  var LARGURA = 1280, MAX_OBJ = 4;
  var PH_API = "https://api.polyhaven.com", PH_TETO_BYTES = 30 * 1024 * 1024;

  /* português → termos da Poly Haven (os nomes, etiquetas e categorias de lá são em inglês) */
  var DIC = {
    mesa: ["table"], mesinha: ["table", "coffee"], escrivaninha: ["desk"], cadeira: ["chair"], poltrona: ["armchair", "chair"], sofa: ["sofa", "couch"],
    banco: ["bench", "stool"], banqueta: ["stool"], cama: ["bed"], estante: ["shelf", "bookshelf"], prateleira: ["shelf"], armario: ["cabinet", "wardrobe"],
    gaveteiro: ["drawer", "cabinet"], comoda: ["drawer", "dresser"], luminaria: ["lamp", "light"], lampada: ["lamp", "bulb"], abajur: ["lamp"], lustre: ["chandelier", "lamp"],
    planta: ["plant"], plantas: ["plant"], vaso: ["vase", "pot", "potted"], arvore: ["tree"], arbusto: ["shrub", "bush"], grama: ["grass"], flor: ["flower"], flores: ["flower"],
    palmeira: ["palm"], pedra: ["rock", "stone"], pedras: ["rock"], tapete: ["rug", "carpet"], quadro: ["frame", "painting"], espelho: ["mirror"], relogio: ["clock"],
    livro: ["book"], livros: ["book"], caixa: ["box", "crate"], barril: ["barrel"], balde: ["bucket"], ferramenta: ["tool"], escada: ["ladder", "stairs"],
    bicicleta: ["bicycle", "bike"], carro: ["car"], lixeira: ["bin", "trash"], cesto: ["basket"], garrafa: ["bottle"], prato: ["plate", "dish"], copo: ["glass", "cup"],
    madeira: ["wood", "wooden"], metal: ["metal"], ferro: ["iron", "metal"], vidro: ["glass"], couro: ["leather"], tecido: ["fabric"], jardim: ["garden"], externo: ["outdoor"],
    jantar: ["dining"], cozinha: ["kitchen"], escritorio: ["office"], banheiro: ["bathroom"], sala: ["living"], rustico: ["rustic"], antigo: ["vintage", "old"], moderno: ["modern"],
    redondo: ["round"], redonda: ["round"], lateral: ["side"], centro: ["coffee"]
  };
  var VAZIAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, para: 1, com: 1, em: 1, e: 1, a: 1, o: 1, um: 1, uma: 1, lugares: 1, lugar: 1 };

  var IARender = {
    MARCA: MARCA, ENT: ENT,
    _rasc: null, _ctx: null, _phCache: null,

    /* ------------------------------------------------------- puros */
    proporcaoDe: function (w, h) {
      var r = (w > 0 && h > 0) ? w / h : 16 / 9, melhor = PROPORCOES[0], d = Infinity;
      PROPORCOES.forEach(function (p) { var x = Math.abs(Math.log(r / p[1])); if (x < d) { d = x; melhor = p; } });
      return { nome: melhor[0], razao: melhor[1] };
    },
    termos: function (texto) {
      var out = [];
      sem(texto).split(/[^a-z0-9]+/).forEach(function (w) {
        if (!w || VAZIAS[w] || /^\d+$/.test(w)) return;
        (DIC[w] || (w.length > 2 ? [w] : [])).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
      });
      return out;
    },
    /* nota de uma peça da Poly Haven para os termos (nome e etiqueta valem mais que a descrição) */
    pontuar: function (a, termos) {
      var nome = sem(a.name), tags = (a.tags || []).map(sem), cats = (a.categories || []).map(sem), desc = sem(a.description), n = 0, achou = 0;
      termos.forEach(function (t) {
        var p = 0;
        if (nome.indexOf(t) >= 0) p += 5;
        if (tags.indexOf(t) >= 0) p += 3; else if (tags.some(function (x) { return x.indexOf(t) >= 0; })) p += 1;
        if (cats.indexOf(t) >= 0) p += 2;
        if (desc.indexOf(t) >= 0) p += 1;
        if (p) achou++;
        n += p;
      });
      return achou ? n + achou * 4 : 0;
    },
    buscarEm: function (lista, texto, max) {
      var termos = this.termos(texto), self = this, out = [];
      if (!termos.length) return [];
      Object.keys(lista || {}).forEach(function (id) {
        var a = lista[id]; if (!a || a.type !== 2) return;                 // 2 = modelo 3D (0 HDRI, 1 textura)
        var s = self.pontuar(a, termos); if (s > 0) out.push({ id: id, nome: a.name || id, nota: s, miniatura: a.thumbnail_url || "", dimensoes: a.dimensions || null, poligonos: a.polycount || 0, autores: Object.keys(a.authors || {}) });
      });
      out.sort(function (x, y) { return y.nota - x.nota || String(x.nome).localeCompare(String(y.nome)); });
      return out.slice(0, max || 12);
    },
    /* o corpo da /ia/render a partir do rascunho e da captura */
    montarCorpo: function (rasc, cap) {
      var objs = (rasc.objetos || []).filter(function (o) { return o.destino === "render" && String(o.descricao || "").trim(); });
      var refs = (rasc.objetos || []).filter(function (o) { return o.destino === "render" && o.imagem; }).slice(0, MAX_OBJ)
        .map(function (o) { return { imagem: o.imagem, descricao: String(o.descricao || "").trim() }; });
      return { vista: cap.vista, linhas: rasc.linhas !== false ? (cap.linhas || "") : "", prompt: String(rasc.escopo || "").trim(),
        referencias: refs, objetos: objs.map(function (o) { return String(o.descricao).trim(); }), proporcao: cap.proporcao };
    },
    /* objetos marcados "no modelo" que ainda não foram colocados */
    pendentesNoModelo: function (rasc) { return (rasc.objetos || []).filter(function (o) { return o.destino !== "render" && !o.colocado; }); },
    textoMarca: function (reg) {
      var d = reg && reg.criadoEm ? new Date(reg.criadoEm) : new Date();
      return MARCA + " · " + (reg && reg.modelo ? reg.modelo + " · " : "") + d.toLocaleDateString("pt-BR") + " · OrçaPRO";
    },

    /* ------------------------------------------------------ captura */
    capturar: function () {
      var B = global.BIM;
      if (!B || !B.desenharQuadroEm) return { ok: false, erro: "O visualizador 3D não está aberto." };
      var tela = null; try { tela = B.desenharQuadro ? B.desenharQuadro() : null; } catch (e) { tela = null; }
      var p = this.proporcaoDe(tela && tela.width, tela && tela.height);
      var W = LARGURA, H = Math.round(LARGURA / p.razao);
      var c = B.desenharQuadroEm("#dfe7ef", W, H);
      if (!c || !c.width) return { ok: false, erro: "Não consegui capturar a vista 3D." };
      var vista = c.toDataURL("image/jpeg", 0.9), linhas = "";
      try { var cl = B.quadroLinhas ? B.quadroLinhas(W, H) : null; if (cl && cl.width) linhas = cl.toDataURL("image/jpeg", 0.92); } catch (e) { linhas = ""; }
      return { ok: true, vista: vista, linhas: linhas, proporcao: p.nome, largura: W, altura: H };
    },

    /* ------------------------------------------------------ galeria */
    _eid: function () { try { return (this._ctx && this._ctx.empresaId) ? this._ctx.empresaId() : Auth.empresaId(); } catch (e) { return ""; } },
    lista: function (obraId) {
      var l = []; try { l = Store.listar(this._eid(), ENT) || []; } catch (e) { l = []; }
      return l.filter(function (r) { return !obraId || r.obraId === obraId; }).sort(function (a, b) { return String(b.criadoEm).localeCompare(String(a.criadoEm)); });
    },
    _miniatura: function (dataUrl) {
      return new Promise(function (ok) {
        try {
          var img = new Image();
          img.onload = function () { try { var f = Math.min(1, 360 / img.width), c = document.createElement("canvas"); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); ok({ min: c.toDataURL("image/jpeg", 0.8), w: img.width, h: img.height }); } catch (e) { ok({ min: "", w: 0, h: 0 }); } };
          img.onerror = function () { ok({ min: "", w: 0, h: 0 }); };
          img.src = dataUrl;
        } catch (e) { ok({ min: "", w: 0, h: 0 }); }
      });
    },
    /* grava: bytes no IndexedDB, registro leve no Store. {ok, reg} */
    salvar: function (r, info) {
      var self = this, dataUrl = "data:" + (r.imagem.mime || "image/jpeg") + ";base64," + r.imagem.data;
      var id = "ren" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return this._miniatura(dataUrl).then(function (m) {
        var temIdb = typeof Idb !== "undefined" && Idb.disponivel && Idb.disponivel();
        var grava = temIdb ? Promise.all([Idb.set(PREF + id, dataUrl), m.min ? Idb.set(PREF_MIN + id, m.min) : Promise.resolve()]) : Promise.reject(new Error("sem IndexedDB"));
        return grava.then(function () {
          var reg = { id: id, obraId: info.obraId || "", prompt: String(info.prompt || "").slice(0, 2000), objetos: info.objetos || [], refs: info.refs || 0,
            autor: info.autor || "", modelo: r.modelo || "", provedor: r.provider || "gemini", criadoEm: new Date().toISOString(),
            mime: r.imagem.mime || "image/jpeg", largura: m.w, altura: m.h, bytes: Math.round(r.imagem.data.length * 3 / 4), ia: true, marca: MARCA };
          var ok = false; try { ok = !!Store.salvar(self._eid(), ENT, reg); } catch (e) { ok = false; }
          if (!ok) { try { Idb.del(PREF + id); Idb.del(PREF_MIN + id); } catch (e) {} return { ok: false, erro: "Não consegui registrar o render na galeria (armazenamento cheio?)." }; }
          return { ok: true, reg: reg, dataUrl: dataUrl };
        }, function () {
          /* sem IndexedDB (janela anônima): mostra e deixa baixar, mas não guarda */
          self._soNaSessao = self._soNaSessao || {};
          self._soNaSessao[id] = dataUrl;
          return { ok: false, semIdb: true, reg: { id: id, obraId: info.obraId || "", prompt: info.prompt, modelo: r.modelo, criadoEm: new Date().toISOString(), autor: info.autor || "", ia: true, marca: MARCA }, dataUrl: dataUrl };
        });
      });
    },
    imagem: function (id) {
      if (this._soNaSessao && this._soNaSessao[id]) return Promise.resolve(this._soNaSessao[id]);
      if (typeof Idb === "undefined" || !Idb.disponivel()) return Promise.resolve(null);
      return Idb.get(PREF + id)["catch"](function () { return null; });
    },
    excluir: function (id) {
      try { Store.excluir(this._eid(), ENT, id); } catch (e) {}
      try { if (typeof Idb !== "undefined" && Idb.disponivel()) { Idb.del(PREF + id); Idb.del(PREF_MIN + id); } } catch (e) {}
    },
    /* o PNG que sai do app: a imagem + faixa com a marca de IA */
    pngComMarca: function (dataUrl, reg) {
      var self = this;
      return new Promise(function (ok, erro) {
        var img = new Image();
        img.onload = function () {
          try {
            var faixa = Math.max(30, Math.round(img.height * 0.05)), c = document.createElement("canvas");
            c.width = img.width; c.height = img.height + faixa;
            var g = c.getContext("2d");
            g.drawImage(img, 0, 0);
            g.fillStyle = "#0b1a2b"; g.fillRect(0, img.height, c.width, faixa);
            g.fillStyle = "#fbbf24"; g.font = "bold " + Math.round(faixa * 0.42) + "px Segoe UI, Arial";
            g.textBaseline = "middle"; g.fillText(self.textoMarca(reg), Math.round(faixa * 0.4), img.height + faixa / 2);
            if (c.toBlob) c.toBlob(function (b) { b ? ok(b) : erro(new Error("PNG vazio")); }, "image/png");
            else ok(c.toDataURL("image/png"));
          } catch (e) { erro(e); }
        };
        img.onerror = function () { erro(new Error("imagem ilegível")); };
        img.src = dataUrl;
      });
    },
    baixar: function (reg) {
      var self = this;
      return this.imagem(reg.id).then(function (d) {
        if (!d) { toast("A imagem deste render não está neste aparelho (ela fica só no aparelho que gerou).", "aviso"); return false; }
        return self.pngComMarca(d, reg).then(function (b) {
          var url = typeof b === "string" ? b : URL.createObjectURL(b), a = document.createElement("a");
          a.href = url; a.download = "render-ia-" + String(reg.criadoEm || "").slice(0, 10) + "-" + reg.id + ".png";
          document.body.appendChild(a); a.click(); a.remove();
          if (typeof b !== "string") setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
          self._ultimoDownload = { nome: a.download, tipo: typeof b === "string" ? "image/png" : b.type, bytes: typeof b === "string" ? b.length : b.size };
          return true;
        });
      })["catch"](function (e) { toast("Não consegui gerar o PNG: " + (e && e.message || e), "erro"); return false; });
    },

    /* ---------------------------------------------------- Poly Haven */
    phLista: function () {
      var self = this;
      if (this._phCache) return Promise.resolve(this._phCache);
      return fetch(PH_API + "/assets?t=models").then(function (r) { if (!r.ok) throw new Error("Poly Haven respondeu " + r.status); return r.json(); })
        .then(function (j) { self._phCache = j || {}; return self._phCache; });
    },
    phBuscar: function (texto) { var self = this; return this.phLista().then(function (l) { return self.buscarEm(l, texto, 12); }); },
    _b64: function (ab) {
      var u = new Uint8Array(ab), s = "", P = 0x8000;
      for (var i = 0; i < u.length; i += P) s += String.fromCharCode.apply(null, u.subarray(i, i + P));
      return btoa(s);
    },
    /* o .gltf da Poly Haven com o .bin e as texturas EMBUTIDOS (data:) — o
       importador do BIM não abre .gltf com arquivos ao lado */
    phGltf: function (id, res) {
      var self = this;
      return fetch(PH_API + "/files/" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("Poly Haven respondeu " + r.status); return r.json(); }).then(function (f) {
        var g = f && f.gltf, alvo = null, rs = [res || "1k", "1k", "2k", "4k"];
        for (var i = 0; i < rs.length && !alvo; i++) if (g && g[rs[i]] && g[rs[i]].gltf) alvo = g[rs[i]].gltf;
        if (!alvo || !alvo.url) throw new Error("esta peça não tem glTF na Poly Haven");
        var inc = alvo.include || {}, total = (alvo.size || 0);
        Object.keys(inc).forEach(function (k) { total += inc[k].size || 0; });
        if (total > PH_TETO_BYTES) throw new Error("a peça tem " + Math.round(total / 1048576) + " MB — grande demais para o modelo");
        return fetch(alvo.url).then(function (r) { if (!r.ok) throw new Error("glTF não baixou (" + r.status + ")"); return r.text(); }).then(function (txt) {
          var j = JSON.parse(txt), pedidos = [];
          function embutir(obj, mimePadrao) {
            var uri = obj && obj.uri; if (!uri || /^data:/.test(uri)) return;
            var ent = inc[uri] || inc[decodeURIComponent(uri)]; if (!ent || !ent.url) throw new Error("arquivo " + uri + " não veio na lista da Poly Haven");
            var mime = /\.png$/i.test(uri) ? "image/png" : (/\.jpe?g$/i.test(uri) ? "image/jpeg" : mimePadrao);
            pedidos.push(fetch(ent.url).then(function (r) { if (!r.ok) throw new Error(uri + " não baixou"); return r.arrayBuffer(); }).then(function (ab) { obj.uri = "data:" + mime + ";base64," + self._b64(ab); }));
          }
          (j.buffers || []).forEach(function (b) { embutir(b, "application/octet-stream"); });
          (j.images || []).forEach(function (im) { embutir(im, "image/jpeg"); });
          return Promise.all(pedidos).then(function () { return JSON.stringify(j); });
        });
      });
    },
    /* importa no modelo, no ponto que a vista olha, no chão, sem mexer na câmera */
    phImportar: function (peca) {
      var B = global.BIM, self = this;
      if (!B || !B.importarMalha) return Promise.resolve({ ok: false, erro: "O visualizador 3D não está aberto." });
      var pos = [0, 0, 0];
      try {
        var est = B.estadoVista ? B.estadoVista() : null, cx = B.pavimentos2d ? B.pavimentos2d().caixa : null;
        if (est && est.camera && est.camera.alvo) pos = [est.camera.alvo[0], cx ? cx.min[1] : est.camera.alvo[1], est.camera.alvo[2]];
      } catch (e) {}
      return this.phGltf(peca.id, "1k").then(function (txt) {
        return B.importarMalha(peca.nome + " - Poly Haven (CC0).gltf", txt, { unidade: "m", posicao: pos, manterCamera: true, disciplina: "arquitetura" });
      }).then(function (r) { if (r && r.ok) self._ultimaPeca = { id: peca.id, mid: r.mid, posicao: pos }; return r; }, function (e) { return { ok: false, erro: String(e && e.message || e) }; });
    },

    /* =============================================================== TELAS
     * ctx = { empresaId(), obraId, autor, abrirEditor(fam) } (vem do gestao.js) */
    abrir: function (ctx) {
      var self = this;
      this._ctx = ctx || this._ctx || {};
      if (!global.UI || !UI.modal) return;
      var cap = this.capturar();
      if (!cap.ok) { toast(cap.erro, "erro"); return; }
      this._cap = cap;
      var R = this._rasc = this._rasc || { escopo: "", objetos: [], linhas: true };
      var h = '<div class="iar" data-ia="render">' +
        '<div style="position:relative;margin-bottom:8px"><img id="iar-prev" src="' + cap.vista + '" alt="Vista atual" style="width:100%;max-height:220px;object-fit:contain;border-radius:8px;background:#dfe7ef">' +
        '<span style="position:absolute;left:8px;bottom:8px;background:rgba(11,26,43,.8);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px">Vista atual · ' + esc(cap.proporcao) + "</span></div>" +
        '<p class="muted" style="margin:0 0 6px;font-size:12px">A IA mantém o enquadramento, as paredes e as aberturas desta vista e troca as cores do BIM por materiais, luz e entorno. Ajuste a câmera antes de abrir, se quiser outro ângulo.</p>' +
        '<div class="field"><label>Escopo do render</label><textarea id="iar-escopo" rows="3" maxlength="2000" placeholder="Ex.: fim de tarde, paisagismo tropical, mesa de madeira maciça para 6 lugares, piso de porcelanato claro">' + esc(R.escopo) + "</textarea></div>" +
        '<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" id="iar-linhas"' + (R.linhas !== false ? " checked" : "") + "> Mandar também a vista em linhas (guia da forma)</label>" +
        '<div style="margin-top:10px"><b style="font-size:12.5px">Objetos e referências</b> <small class="muted">(até ' + MAX_OBJ + ")</small></div>" +
        '<div id="iar-objs"></div>' +
        '<button class="btn sm" data-iar="add-obj">+ Objeto</button>' +
        '<p class="muted" style="font-size:11px;margin:6px 0 0"><b>Só no render</b>: vai no pedido à IA (a foto vira referência). <b>No modelo</b>: entra no BIM antes — modelo 3D livre (CC0) da Poly Haven ou família por IA.</p>' +
        '<div id="iar-cota" class="muted" style="font-size:11.5px;margin-top:6px"></div>' +
        '<div id="iar-msg" style="margin-top:6px"></div>' +
        '<p style="font-size:11px;margin:8px 0 0;color:#b45309">' + esc(MARCA) + ".</p></div>";
      UI.modal(ic("camera") + " Renderizar com IA", h, [
        { texto: "Fechar", classe: "ghost", onClick: function () { self._lerForm(); UI.fecharModal(); } },
        { texto: "Galeria da obra", onClick: function () { self._lerForm(); self.galeria(self._ctx); } },
        { texto: "Renderizar", classe: "primary", onClick: function () { self._renderizar(this); } }
      ]);
      this._pintarObjetos();
      var IA = IAF();
      if (IA) IA.cota().then(function (c) { var el = document.getElementById("iar-cota"); if (el) el.textContent = IA.textoCota(c, "render"); });
    },
    _lerForm: function () {
      var R = this._rasc; if (!R) return;
      var e = document.getElementById("iar-escopo"); if (e) R.escopo = e.value;
      var l = document.getElementById("iar-linhas"); if (l) R.linhas = !!l.checked;
      Array.prototype.forEach.call(document.querySelectorAll("#iar-objs .iar-obj"), function (row) {
        var o = R.objetos[+row.getAttribute("data-i")]; if (!o) return;
        var d = row.querySelector('[data-iar="desc"]'), s = row.querySelector('[data-iar="destino"]');
        if (d) o.descricao = d.value; if (s) o.destino = s.value;
      });
    },
    _pintarObjetos: function () {
      var self = this, R = this._rasc, el = document.getElementById("iar-objs");
      if (!R || !el) return;
      var DEST = { render: "Só no render", polyhaven: "No modelo: Poly Haven (CC0)", familia: "No modelo: família por IA" };
      el.innerHTML = R.objetos.map(function (o, i) {
        return '<div class="iar-obj" data-i="' + i + '" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0;padding:6px;border:1px solid #cbd5e1;border-radius:8px">' +
          (o.imagem ? '<img src="' + esc(o.imagem) + '" alt="" style="width:52px;height:40px;object-fit:cover;border-radius:6px">' : "") +
          '<input data-iar="desc" placeholder="ex.: mesa de madeira maciça 6 lugares" value="' + esc(o.descricao || "") + '" style="flex:1;min-width:160px">' +
          '<select data-iar="destino"' + (o.colocado ? " disabled" : "") + ">" + Object.keys(DEST).map(function (k) { return '<option value="' + k + '"' + (k === o.destino ? " selected" : "") + ">" + DEST[k] + "</option>"; }).join("") + "</select>" +
          '<label class="btn sm" style="position:relative;overflow:hidden">Foto<input type="file" accept="image/png,image/jpeg,image/webp" data-iar="foto" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>' +
          (o.destino !== "render" ? (o.colocado ? '<span class="iar-ok" style="font-size:11.5px;color:#15803d">No modelo: ' + esc(o.colocado.nome || "") + "</span>" : '<button class="btn sm primary" data-iar="colocar">Colocar no modelo</button>') : "") +
          '<button class="btn sm ghost" data-iar="tirar" title="Tirar">Tirar</button></div>';
      }).join("");
      el.onchange = function (e) {
        var t = e.target, row = t.closest && t.closest(".iar-obj"); if (!row) return;
        var o = R.objetos[+row.getAttribute("data-i")]; if (!o) return;
        if (t.getAttribute("data-iar") === "destino") { self._lerForm(); self._pintarObjetos(); }
        if (t.getAttribute("data-iar") === "foto" && t.files && t.files[0] && IAF()) {
          IAF().lerArquivo(t.files[0]).then(function (d) { return IAF().reduzir(d, 1024); }).then(function (d) { if (d) { self._lerForm(); o.imagem = d; self._pintarObjetos(); } });
        }
      };
      var bAdd = document.querySelector('[data-iar="add-obj"]');
      if (bAdd) bAdd.onclick = function () {
        self._lerForm();
        if (R.objetos.length >= MAX_OBJ) { toast("No máximo " + MAX_OBJ + " objetos por render.", "aviso"); return; }
        R.objetos.push({ descricao: "", destino: "render", imagem: "", colocado: null }); self._pintarObjetos();
      };
      el.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-iar]") : null; if (!b) return;
        var k = b.getAttribute("data-iar"), row = b.closest(".iar-obj"), i = row ? +row.getAttribute("data-i") : -1;
        if (k === "tirar") { self._lerForm(); R.objetos.splice(i, 1); self._pintarObjetos(); }
        else if (k === "colocar") { self._lerForm(); self._colocar(R.objetos[i]); }
      };
    },
    _msg: function (html) { var m = document.getElementById("iar-msg"); if (m) m.innerHTML = html; },
    _colocar: function (o) {
      var self = this;
      if (!o) return;
      if (!String(o.descricao || "").trim()) { this._msg('<div class="fe-erro">Escreva o que é o objeto antes de colocar no modelo.</div>'); return; }
      if (o.destino === "polyhaven") { this.escolherPolyhaven(o); return; }
      var IA = IAF(); if (!IA) { toast("A família por IA não carregou.", "erro"); return; }
      IA.abrir({ pedidoInicial: o.descricao, imagensIniciais: o.imagem ? [{ dados: o.imagem, papel: "foto" }] : [],
        abrirEditor: this._ctx.abrirEditor,
        aoGerar: function (fam) { o.colocado = { fonte: "familia-ia", famId: fam.id, nome: fam.nome }; toast("Coloque a família no modelo pelo editor (Colocar no modelo) e volte a Renderizar com IA.", "info", 6000); } });
    },
    escolherPolyhaven: function (o) {
      var self = this;
      UI.modal(ic("buscar") + " Modelo 3D livre (CC0) — Poly Haven", '<div data-ia="polyhaven">' +
        '<div style="display:flex;gap:6px"><input id="iar-ph-q" value="' + esc(o.descricao) + '" style="flex:1"><button class="btn sm primary" data-iar="ph-buscar">Buscar</button></div>' +
        '<p class="muted" style="font-size:11.5px;margin:6px 0">Modelos da <b>Poly Haven</b>, licença <b>CC0</b> (domínio público, uso comercial livre). A peça entra no ponto que a vista olha, no chão do modelo, com "Poly Haven (CC0)" no nome.</p>' +
        '<div id="iar-ph-res" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px"></div><div id="iar-ph-msg"></div></div>', [
        { texto: "Voltar ao render", classe: "ghost", onClick: function () { self.abrir(self._ctx); } }
      ]);
      function buscar() {
        var q = String((document.getElementById("iar-ph-q") || {}).value || "");
        var res = document.getElementById("iar-ph-res"), msg = document.getElementById("iar-ph-msg");
        if (res) res.innerHTML = '<p class="muted">Buscando na Poly Haven…</p>';
        self.phBuscar(q).then(function (l) {
          self._phUltima = l;
          if (!res) return;
          if (!l.length) { res.innerHTML = '<p class="muted">Nada na Poly Haven para "' + esc(q) + '". Tente uma palavra só (mesa, cadeira, vaso, planta) ou use a família por IA.</p>'; return; }
          res.innerHTML = l.map(function (p, i) {
            var dm = p.dimensoes ? (p.dimensoes.map(function (x) { return (x / 1000).toFixed(2).replace(".", ","); }).join(" × ") + " m") : "";
            return '<div class="iar-ph" data-i="' + i + '" style="border:1px solid #cbd5e1;border-radius:8px;padding:6px;font-size:11.5px">' +
              (p.miniatura ? '<img src="' + esc(p.miniatura) + '" alt="" style="width:100%;height:96px;object-fit:contain;background:#f1f5f9;border-radius:6px">' : "") +
              "<b>" + esc(p.nome) + '</b><br><span class="muted">' + esc(dm) + " · CC0 · Poly Haven</span><br>" +
              '<button class="btn sm primary" data-iar="ph-importar" style="margin-top:4px">Importar</button></div>';
          }).join("");
        })["catch"](function (e) { if (res) res.innerHTML = ""; if (msg) msg.innerHTML = '<div class="fe-erro">Não consegui falar com a Poly Haven (' + esc(e && e.message || e) + ").</div>"; });
      }
      var raiz = document.querySelector('[data-ia="polyhaven"]');
      if (raiz) raiz.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-iar]") : null; if (!b) return;
        if (b.getAttribute("data-iar") === "ph-buscar") buscar();
        if (b.getAttribute("data-iar") === "ph-importar") {
          var p = (self._phUltima || [])[+b.closest(".iar-ph").getAttribute("data-i")]; if (!p) return;
          b.disabled = true; b.textContent = "Baixando…";
          self.phImportar(p).then(function (r) {
            if (!r || !r.ok) { b.disabled = false; b.textContent = "Importar"; var m = document.getElementById("iar-ph-msg"); if (m) m.innerHTML = '<div class="fe-erro">Não importei: ' + esc(r && r.erro || "erro") + "</div>"; return; }
            o.colocado = { fonte: "polyhaven", id: p.id, nome: p.nome, mid: r.mid };
            toast("\"" + p.nome + "\" entrou no modelo (Poly Haven, CC0).", "ok", 5000);
            self.abrir(self._ctx);
          });
        }
      };
      buscar();
    },
    _renderizar: function (botao) {
      var self = this, R = this._rasc, ctx = this._ctx || {};
      if (!R || this._enviando) return;                                // ⚠ clique duplo não paga dois renders
      this._lerForm();
      if (String(R.escopo || "").trim().length < 3) { this._msg('<div class="fe-erro">Escreva o escopo do render (luz, paisagismo, materiais, objetos).</div>'); return; }
      var pend = this.pendentesNoModelo(R);
      if (pend.length) { this._msg('<div class="fe-erro">"' + esc(pend[0].descricao || "objeto") + '" está marcado para entrar no modelo: clique Colocar no modelo ou troque para Só no render.</div>'); return; }
      var cap = this.capturar();                                        // a vista de AGORA (o modelo pode ter ganhado peça)
      if (!cap.ok) { this._msg('<div class="fe-erro">' + esc(cap.erro) + "</div>"); return; }
      var corpo = this.montarCorpo(R, cap), IA = IAF();
      if (!IA) { toast("O módulo de IA não carregou.", "erro"); return; }
      this._enviando = true; if (botao) botao.disabled = true;
      this._msg('<div class="muted">Renderizando com IA… pode levar até 2 minutos.</div>');
      IA.post("/ia/render", corpo, 120000).then(function (r) {
        self._enviando = false; if (botao) botao.disabled = false;
        if (r.status !== 200 || !r.j || !r.j.ok || !r.j.imagem || !r.j.imagem.data) { self._msg('<div class="fe-erro">' + esc(IA.recado(r, "o render por IA")) + "</div>"); return; }
        return self.salvar(r.j, { obraId: ctx.obraId || "", prompt: corpo.prompt, objetos: corpo.objetos, refs: corpo.referencias.length, autor: ctx.autor || "" }).then(function (s) {
          if (s.semIdb) toast("Este navegador não guarda imagens (janela anônima?): o render aparece agora e dá para baixar, mas não fica na galeria.", "aviso", 7000);
          else if (!s.ok) { self._msg('<div class="fe-erro">' + esc(s.erro) + "</div>"); return; }
          R.escopo = corpo.prompt;
          self.mostrar(s.reg, s.dataUrl, r.j.cota);
        });
      });
    },
    mostrar: function (reg, dataUrl, cota) {
      var self = this;
      UI.modal(ic("camera") + " Render por IA", '<div data-ia="resultado" data-modal-largo="1">' +
        /* a imagem cabe na tela (58vh) para a marca, colada nela, nunca ficar abaixo da dobra */
        '<div style="text-align:center"><div style="position:relative;display:inline-block;max-width:100%"><img id="iar-img" src="' + esc(dataUrl) + '" alt="Render por IA" style="display:block;max-width:100%;max-height:58vh;border-radius:8px">' +
        '<span class="iar-marca" style="position:absolute;left:0;right:0;bottom:0;background:rgba(11,26,43,.82);color:#fbbf24;font-size:12px;font-weight:600;padding:6px 10px;border-radius:0 0 8px 8px;text-align:left">' + esc(MARCA) + "</span></div></div>" +
        '<p style="font-size:12px;margin:8px 0 0"><b>Escopo:</b> ' + esc(reg.prompt || "") + "</p>" +
        '<p class="muted" style="font-size:11.5px;margin:4px 0 0">' + esc(new Date(reg.criadoEm).toLocaleString("pt-BR")) + " · " + esc(reg.autor || "") + " · modelo de IA: " + esc(reg.modelo || "") +
        (cota ? " · " + esc(cota.usado + " de " + cota.teto + " renders no mês") : "") + "</p></div>", [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Galeria da obra", onClick: function () { self.galeria(self._ctx); } },
        { texto: "Outro render", onClick: function () { self.abrir(self._ctx); } },
        { texto: "Baixar PNG", classe: "primary", onClick: function () { self.baixar(reg); } }
      ]);
    },
    galeria: function (ctx) {
      var self = this;
      this._ctx = ctx || this._ctx || {};
      var l = this.lista(this._ctx.obraId || "");
      var h = '<div data-ia="galeria">' + (l.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">' + l.map(function (r) {
        return '<div class="iar-card" data-id="' + esc(r.id) + '" style="border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;font-size:11.5px">' +
          '<div style="position:relative;background:#e2e8f0;height:110px"><img data-min="' + esc(r.id) + '" alt="" style="width:100%;height:110px;object-fit:cover">' +
          '<span class="iar-marca" style="position:absolute;left:0;right:0;bottom:0;background:rgba(11,26,43,.82);color:#fbbf24;font-size:10px;padding:2px 6px">Gerada por IA — não é projeto executivo</span></div>' +
          '<div style="padding:6px"><div style="max-height:32px;overflow:hidden">' + esc(r.prompt || "") + '</div><div class="muted">' + esc(new Date(r.criadoEm).toLocaleDateString("pt-BR")) + " · " + esc(r.autor || "") + " · " + esc(r.modelo || "") + "</div>" +
          '<div style="display:flex;gap:4px;margin-top:4px"><button class="btn sm" data-iar="ver">Ver</button><button class="btn sm" data-iar="baixar">PNG</button><button class="btn sm ghost" data-iar="excluir">Excluir</button></div></div></div>';
      }).join("") + "</div>" : '<p class="muted">Nenhum render desta obra ainda. Abra a vista que quer e use Renderizar com IA.</p>') +
        '<p class="muted" style="font-size:11px;margin:8px 0 0">As imagens ficam neste aparelho; a lista guarda o escopo, a data, o autor e o modelo de IA de cada uma.</p></div>';
      UI.modal(ic("camera") + " Galeria de renders da obra", h, [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Novo render", classe: "primary", onClick: function () { self.abrir(self._ctx); } }
      ]);
      l.forEach(function (r) {
        if (typeof Idb === "undefined" || !Idb.disponivel()) return;
        Idb.get(PREF_MIN + r.id).then(function (d) { var im = document.querySelector('img[data-min="' + r.id + '"]'); if (im && d) im.src = d; })["catch"](function () {});
      });
      var raiz = document.querySelector('[data-ia="galeria"]');
      if (raiz) raiz.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-iar]") : null; if (!b) return;
        var id = b.closest(".iar-card").getAttribute("data-id"), reg = l.filter(function (x) { return x.id === id; })[0]; if (!reg) return;
        var k = b.getAttribute("data-iar");
        if (k === "baixar") self.baixar(reg);
        else if (k === "ver") self.imagem(id).then(function (d) { if (d) self.mostrar(reg, d); else toast("A imagem deste render não está neste aparelho.", "aviso"); });
        else if (k === "excluir" && global.confirm("Excluir este render da galeria?")) { self.excluir(id); self.galeria(self._ctx); }
      };
    }
  };

  global.IARender = IARender;
  if (typeof module !== "undefined" && module.exports) module.exports = IARender;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
