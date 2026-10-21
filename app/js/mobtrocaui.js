/* =====================================================================
 * mobtrocaui.js — "TROCAR POR…" E A ESCOLHA FABRICANTE → LINHA → ACABAMENTO (20/10/2026)
 *
 * Pedido do Rogério ("um clique por ambiente", 5 ou mais opções de troca por peça; público alto padrão):
 * na peça de mobiliário selecionada, Propriedades › Ações ganha
 *   · "Trocar por…": as alternativas da mesma categoria (mesmo estilo primeiro, depois pela largura), com
 *     miniatura, medidas e preço — inclusive as de linha de alto padrão; e
 *   · "Fabricante, linha e acabamento": desce Fabricante → Linha/Modelo → peça, e o acabamento (tecido, couro,
 *     madeira, metal, pedra) da peça colocada.
 * A troca é UMA op "instancia" (js/bimedit.js): um passo só no Ctrl+Z. A peça nova fica na mesma posição e giro;
 * se a origem das duas famílias for diferente (encostada × solta), a face de ENCOSTO fica onde estava.
 * MobTroca (o cálculo) é puro e testável no Node; MobTrocaUI é a tela (só no navegador).
 * ES5, sem framework. Nada de nome de cliente aqui.
 * ===================================================================== */
(function (global) {
  "use strict";
  function FC() { return global.FamiliasCat || null; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* família da biblioteca RA antiga (Casa 487 & cia.) → categoria do catálogo: a peça antiga também troca por peça comercial */
  var LEGADO = { "ra-mob-sofa-reto": "sofa-3-lugares", "ra-mob-sofa-l": "sofa-canto-chaise", "ra-mob-poltrona": "poltrona", "ra-mob-mesa-centro": "mesa-centro", "ra-mob-rack-tv": "rack-painel-tv",
    "ra-mob-aparador": "aparador", "ra-mob-tapete": "tapete", "ra-mob-mesa-jantar": "mesa-jantar-6", "ra-mob-banqueta": "banqueta-bancada", "ra-mob-cama": "cama-queen", "ra-mob-criado": "criado-mudo",
    "ra-mob-guarda-roupa": "guarda-roupa-pronto", "ra-mob-escrivaninha": "escrivaninha-home-office", "ra-coz-geladeira": "geladeira", "ra-coz-lavadora": "lava-seca-maquina", "ra-lazer-espreguicadeira": "poltrona-externa-espreguicadeira" };
  function famCatDe(famId) { var id = txt(famId); if (/^ra-cat-/.test(id)) return id; return LEGADO[id] ? "ra-cat-" + LEGADO[id] : null; }
  function centroDe(fam) {
    if (!fam) return false;
    if (fam.catalogo && FC() && FC().encaixeTroca) return FC().encaixeTroca(fam, fam).centroAntes;
    return /no centro da peça/.test(txt(fam.descricao));
  }
  /* encaixe(inst, famVelha, valVelha, famNova, valNova): a nova origem (x, z) mantendo a face de encosto.
     Encostada: fundo em Z local = 0. Solta: centro — o fundo fica em Z local = −P/2. Giro rotY (rad) como o three: Z local → (sen θ, cos θ). */
  function encaixe(inst, famVelha, valVelha, famNova, valNova) {
    var zv = centroDe(famVelha) ? -(+(valVelha && valVelha.Profundidade) || 0) / 2 : 0, zn = centroDe(famNova) ? -(+(valNova && valNova.Profundidade) || 0) / 2 : 0, d = zv - zn, t = +inst.rotY || 0;
    return { x: (+inst.x || 0) + d * Math.sin(t), z: (+inst.z || 0) + d * Math.cos(t), deslocamento: d };
  }
  /* a op da troca (o que vai ao BIM.instanciaAlterar): mesma família = só o tipo; outra família = famId + posição encaixada */
  function mudanca(inst, famVelha, valVelha, famNova, tipoNovoId, valNova, acabamento) {
    var m = { tipoId: tipoNovoId };
    if (famNova && famVelha && famNova.id !== famVelha.id) { var e = encaixe(inst, famVelha, valVelha, famNova, valNova); m.famId = famNova.id; m.x = e.x; m.z = e.z; }
    if (acabamento) m.inst = { Acabamento: acabamento };
    return m;
  }
  var MobTroca = { famCatDe: famCatDe, encaixe: encaixe, mudanca: mudanca, centroDe: centroDe, LEGADO: LEGADO };

  /* ------------------------------------------------------------ TELA */
  var MobTrocaUI = {
    acoes: function (id) {
      var B = global.BIM, inf = B && B.instanciaInfo ? B.instanciaInfo(id) : null;
      if (!inf || !FC() || !famCatDe(inf.instancia.famId) || !FC().obter(famCatDe(inf.instancia.famId))) return [];
      var self = this;
      return [{ id: "mob-trocar", rotulo: "Trocar", tipo: "botao", rotuloBotao: "Trocar por…", fn: function () { self.abrirTroca(id); } },
              { id: "mob-fabricante", rotulo: "Fabricante", tipo: "botao", rotuloBotao: "Fabricante, linha e acabamento", fn: function () { self.abrirFabricante(id); } }];
    },
    _contexto: function (id) {
      var B = global.BIM, inf = B.instanciaInfo(id), fv = global.FamiliaUI && FamiliaUI.obter ? FamiliaUI.obter(inf.instancia.famId) : null;
      var fcId = famCatDe(inf.instancia.famId), fn = FC().obter(fcId);
      return { B: B, inf: inf, famVelha: fv || { id: inf.instancia.famId }, famNova: fn, valVelha: (inf.avaliado && inf.avaliado.valores) || {} };
    },
    _aplicar: function (id, tipoId, acab) {
      var k = this._contexto(id), t = null;
      k.famNova.tipos.forEach(function (x) { if (x.id === tipoId) t = x; });
      if (!t) return false;
      var m = mudanca(k.inf.instancia, k.famVelha, k.valVelha, k.famNova, tipoId, t.valores, acab);
      var ok = k.B.instanciaAlterar(id, m);
      try { if (global.UI && UI.toast) UI.toast("Trocado por " + t.nome + " — " + (t.valores.Fonte_preco ? "R$ " + Number(t.valores.Preco_unitario).toFixed(2).replace(".", ",") : "") + (t.valores.Preco_provisorio ? " (PROVISÓRIO — cotar com o fornecedor: " + t.valores.Motivo_preco + ")" : "") + ". Ctrl+Z desfaz.", t.valores.Preco_provisorio ? "alerta" : "ok", 7000); } catch (e) {}
      return ok;
    },
    abrirTroca: function (id) {
      var k = this._contexto(id), self = this, tipoAtual = k.famNova.id === k.inf.instancia.famId ? k.inf.instancia.tipoId : (k.famNova.tipos[0] || {}).id;
      var alts = FC().alternativas(k.famNova.id, tipoAtual, 8);
      var mini = global.FamiliasMob && FamiliasMob.miniatura ? function (t) { try { return FamiliasMob.miniatura(k.famNova.id, t); } catch (e) { return ""; } } : function () { return ""; };
      var h = '<div id="mob-troca" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;max-height:62vh;overflow:auto">' + alts.map(function (a) {
        var src = mini(a.tipoId);
        return '<button type="button" class="card" data-tipo="' + esc(a.tipoId) + '" style="text-align:left;padding:8px;cursor:pointer;display:flex;gap:8px;align-items:center">' +
          (src ? '<img src="' + src + '" width="72" height="72" alt="" style="flex:none;background:#f4f4f2;border-radius:6px">' : '<span style="width:72px;height:72px;flex:none"></span>') +
          '<span style="font-size:12px;line-height:1.35"><b>' + esc(a.nome.split(" — ")[0]) + '</b><br>' + esc(a.fabricante || "") +
          '<br>' + (a.largura * 100).toFixed(0) + ' × ' + (a.profundidade * 100).toFixed(0) + ' × ' + (a.altura * 100).toFixed(0) + ' cm<br><b>' + esc(a.precoTexto) + '</b>' +
          (a.provisorio ? '<br><span data-provisorio="1" title="' + esc(a.motivoPreco) + '" style="color:#b45309;font-weight:600">provisório — cotar com o fornecedor</span><br><span style="opacity:.75">' + esc(a.motivoPreco) + '</span>' : '') +
          (a.altoPadrao ? ' <span style="color:#8a6d1d">· alto padrão</span>' : '') + (a.mesmoEstilo ? ' <span style="opacity:.7">· mesmo estilo</span>' : '') + '</span></button>';
      }).join("") + '</div><p style="font-size:12px;opacity:.75;margin-top:8px">A peça nova fica no mesmo lugar e giro. Preço de fornecimento (sem montagem e frete), com a fonte no tipo. Ctrl+Z desfaz.</p>';
      UI.modal("Trocar por… — " + k.famNova.nome, h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      setTimeout(function () {
        var box = document.getElementById("mob-troca"); if (!box) return;
        box.addEventListener("click", function (ev) { var b = ev.target.closest ? ev.target.closest("[data-tipo]") : null; if (!b) return; UI.fecharModal(); self._aplicar(id, b.getAttribute("data-tipo")); });
      }, 0);
    },
    abrirFabricante: function (id) {
      var k = this._contexto(id), self = this, arv = FC().arvore(k.famNova.id), ACB = FC().ACABAMENTOS, atual = k.inf.instancia.tipoId;
      var fab0 = 0, lin0 = 0;
      arv.forEach(function (F, i) { F.linhas.forEach(function (L, j) { L.tipos.forEach(function (t) { if (t.tipoId === atual) { fab0 = i; lin0 = j; } }); }); });
      function opts(lista, sel, rot) { return lista.map(function (x, i) { return '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(rot(x)) + "</option>"; }).join(""); }
      var acOpts = Object.keys(ACB).map(function (g) { return '<optgroup label="' + esc(g) + '">' + ACB[g].map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + "</option>"; }).join("") + "</optgroup>"; }).join("");
      var h = '<div id="mob-fab" style="display:grid;gap:8px;min-width:min(520px,90vw)">' +
        '<label>Fabricante<select data-f="fab">' + opts(arv, fab0, function (F) { return F.fabricante + (F.altoPadrao ? " (alto padrão)" : ""); }) + '</select></label>' +
        '<label>Linha / modelo<select data-f="lin"></select></label><label>Peça (medida e preço)<select data-f="tipo"></select></label>' +
        '<label>Acabamento da peça colocada<select data-f="acab"><option value="">— o da ficha —</option>' + acOpts + '</select></label>' +
        '<div data-f="info" style="font-size:12px;opacity:.8"></div></div>';
      UI.modal("Fabricante, linha e acabamento — " + k.famNova.nome, h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () { var box = document.getElementById("mob-fab"); var t = box && box.querySelector('[data-f="tipo"]').value, ac = box && box.querySelector('[data-f="acab"]').value; UI.fecharModal(); if (t) self._aplicar(id, t, ac || null); } }]);
      setTimeout(function () {
        var box = document.getElementById("mob-fab"); if (!box) return;
        var sf = box.querySelector('[data-f="fab"]'), sl = box.querySelector('[data-f="lin"]'), st = box.querySelector('[data-f="tipo"]'), inf = box.querySelector('[data-f="info"]');
        function linhas(sel) { var F = arv[+sf.value] || arv[0]; sl.innerHTML = opts(F.linhas, sel || 0, function (L) { return L.linha; }); tipos(); }
        function tipos() { var F = arv[+sf.value] || arv[0], L = F.linhas[+sl.value] || F.linhas[0]; st.innerHTML = L.tipos.map(function (t) { return '<option value="' + esc(t.tipoId) + '"' + (t.tipoId === atual ? " selected" : "") + ">" + esc(t.nome.split(" — ")[1] || t.nome) + " — " + esc(t.precoTexto) + "</option>"; }).join(""); info(); }
        function info() { var F = arv[+sf.value] || arv[0], L = F.linhas[+sl.value] || F.linhas[0], t = L.tipos.filter(function (x) { return x.tipoId === st.value; })[0] || L.tipos[0]; inf.textContent = t ? ("Acabamento da ficha: " + t.acabamento + " · " + t.fonte + (t.provisorio ? " · PREÇO PROVISÓRIO — cotar com o fornecedor: " + t.motivoPreco : "")) : ""; }
        sf.addEventListener("change", function () { linhas(0); }); sl.addEventListener("change", tipos); st.addEventListener("change", info);
        linhas(lin0);
      }, 0);
    }
  };
  global.MobTroca = MobTroca; global.MobTrocaUI = MobTrocaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = { MobTroca: MobTroca, MobTrocaUI: MobTrocaUI };
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
