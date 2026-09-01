/* =====================================================================
 * proptplui.js — A TELA DOS MODELOS DE PROPOSTA
 *
 * O motor (js/proptpl.js) decide o que um modelo É. Aqui ficam as três
 * coisas que só a tela sabe fazer: montar o formulário a partir dos blocos,
 * pegar a foto do disco do usuário, e desenhar a prévia.
 *
 * ---------------------------------------------------------------------
 * ⚠ A FOTO É O PONTO DELICADO DESTE ARQUIVO
 * ---------------------------------------------------------------------
 *
 * Uma foto de capa em qualidade de impressão pesa ~400 KB. O registro do
 * modelo NÃO pode carregá-la: a entidade inteira vai num documento único de
 * 1 MiB na nuvem, e dois modelos com foto embutida parariam a sincronização
 * da empresa PARA SEMPRE, com a tela dizendo "Sincronizado". Já aconteceu
 * com a foto do diário, e o conserto foi guardar a referência.
 *
 * Então aqui é igual: `Fotos.guardar` põe os bytes no IndexedDB e na fila do
 * servidor, e o modelo guarda `{id, remoto, w, h}` — uns 80 bytes.
 *
 * ⚠ E A QUALIDADE É OUTRA. O diário reduz para 1600 px porque foto de obra
 *   é prova, não é papel timbrado. Uma capa de proposta impressa em A4 a
 *   1600 px sai com 135 dpi, e a diferença aparece. Os slots de proposta
 *   pedem 2400 px e qualidade 0.9 — por isso o terceiro argumento.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;
  if (typeof global.PropTpl === "undefined") return;

  var G = global.Gestao;
  var K = G.ui;
  var T = global.PropTpl;

  var ENT = "prop_modelos";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function txt(v) { return String(v == null ? "" : v).trim(); }

  /* imagem de slot na largura da impressão — ver a nota do cabeçalho */
  var IMG_LARGURA = 2400;
  var IMG_QUALIDADE = 0.9;

  function lista() { return K.lista(ENT); }
  function obter(id) { try { return Store.obter(eid(), ENT, id); } catch (e) { return null; } }
  function gravar(m) { return Store.salvar(eid(), ENT, m); }

  /* ===================================================================
   * SEMEAR OS QUATRO DE FÁBRICA
   *
   * ⚠ SÓ O QUE NÃO EXISTE. Semear por cima devolveria ao padrão o modelo
   *   que a empresa ajustou — inclusive apagando as fotos que ela subiu. A
   *   marca é o id de fábrica: uma vez semeado, nunca mais.
   * =================================================================== */
  G.propModelosSemear = function () {
    var atuais = {};
    lista().forEach(function (m) { if (m.base) atuais[m.base] = 1; });
    var n = 0;
    T.FABRICA.forEach(function (f) {
      if (atuais[f.id]) return;
      var m = T.deFabrica(f.id);
      m.id = "";                       /* deixa o Store dar o id */
      if (gravar(m)) n++;
    });
    return n;
  };

  /* ===================================================================
   * A LISTA
   * =================================================================== */
  G.renderPropModelos = function () {
    var self = this;
    var ms = lista();
    if (!ms.length) {
      /* primeira visita: os quatro de fábrica entram sozinhos, senão a tela
         abre vazia e ninguém descobre que existe ponto de partida */
      this.propModelosSemear();
      ms = lista();
    }
    var clientes = K.lista("clientes");
    function nomeCli(id) {
      var c = clientes.filter(function (x) { return x.id === id; })[0];
      return c ? c.nome : "";
    }

    var html = this._head(
      (typeof Icones !== "undefined" ? Icones.get("tabela", 18) : "") + "Modelos de Proposta",
      "propmod-novo", "Novo modelo",
      '<button class="btn sm" data-gacao="propmod-fabrica" style="margin-right:10px;align-self:center">'
      + (typeof Icones !== "undefined" ? Icones.get("baixar", 15) : "") + " Trazer os modelos de fábrica</button>"
    );

    html += '<p class="muted" style="margin:-4px 0 16px;max-width:74ch">'
      + "O modelo decide como a proposta sai no papel: quais páginas, em que ordem, com quais fotos, "
      + "em que cor e em que fonte. Monte uma vez, dê um nome, e use em toda proposta — dá para ter "
      + "vários e escolher na hora de gerar. <b>As fotos ficam no modelo</b>: você troca a foto e todas "
      + "as próximas propostas saem com a nova.</p>";

    html += '<table class="tbl"><thead><tr><th>Modelo</th><th>Formato</th><th class="num">Páginas</th>'
      + '<th class="num">Fotos</th><th>Para</th><th></th></tr></thead><tbody>';

    ms.forEach(function (raw) {
      var m = T.modelo(raw);
      var sl = T.slots(m);
      var comFoto = sl.filter(function (s) { return !!s.ref; }).length;
      var falta = T.validar(m).length;
      html += "<tr>"
        + '<td style="cursor:pointer" data-gacao="propmod-abrir" data-id="' + esc(raw.id) + '"><b>' + esc(m.nome) + "</b>"
        + (m.padrao ? ' <span class="g-pill" style="background:#16a34a22;color:#16a34a;font-weight:700;font-size:10.5px">padrão</span>' : "")
        + (falta ? ' <span class="g-pill" style="background:#dc262622;color:#dc2626;font-weight:700;font-size:10.5px">incompleto</span>' : "")
        + (m.descricao ? '<div class="muted" style="font-size:12px">' + esc(m.descricao) + "</div>" : "")
        + "</td>"
        + "<td>" + (m.estilo.formato === "vertical" ? "Vertical (celular)" : "A4") + "</td>"
        + '<td class="num">' + m.paginas.length + "</td>"
        + '<td class="num">' + comFoto + " / " + sl.length + "</td>"
        + "<td>" + (m.paraCliente ? esc(nomeCli(m.paraCliente) || "cliente removido") : '<span class="muted">todos</span>') + "</td>"
        + '<td class="num">'
        + '<button class="btn sm" data-gacao="propmod-duplicar" data-id="' + esc(raw.id) + '" title="Duplicar">'
        + (typeof Icones !== "undefined" ? Icones.get("copiar", 15) : "cópia") + "</button> "
        + '<button class="btn sm" data-gacao="propmod-abrir" data-id="' + esc(raw.id) + '">Editar</button>'
        + "</td></tr>";
    });
    html += "</tbody></table>";

    html += '<div id="propmod-editor" style="display:none;margin-top:16px"></div>';
    return html;
  };

  /* ===================================================================
   * O EDITOR
   * =================================================================== */
  G._propModAbrir = function (id) {
    var raw = obter(id); if (!raw) return;
    this._propModId = id;
    this._propModAba = this._propModAba || "paginas";
    this._propModRender();
    var el = document.getElementById("propmod-editor");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  G._propModRender = function () {
    var cx = document.getElementById("propmod-editor"); if (!cx) return;
    var raw = obter(this._propModId); if (!raw) { cx.style.display = "none"; return; }
    var m = T.modelo(raw);
    var self = this;
    var abas = [["paginas", "Páginas"], ["fotos", "Fotos"], ["estilo", "Cor e letra"], ["previa", "Prévia"]];

    var html = '<div class="card" style="padding:14px">'
      + '<div class="flex between" style="align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
      + '<h3 style="margin:0">' + esc(m.nome) + "</h3>"
      + '<div class="flex" style="gap:6px">'
      + '<button class="btn sm" data-gacao="propmod-renomear">Renomear</button>'
      + '<button class="btn sm" data-gacao="propmod-padrao">' + (m.padrao ? "Deixar de ser o padrão" : "Usar como padrão") + "</button>"
      + '<button class="btn sm ghost" data-gacao="propmod-excluir">Excluir</button>'
      + '<button class="btn sm ghost" data-gacao="propmod-fechar">Fechar</button>'
      + "</div></div>";

    var faltas = T.validar(m);
    if (faltas.length) {
      html += '<div class="card" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;padding:10px;margin-bottom:10px">'
        + faltas.map(function (f) { return "<div>" + esc(f) + "</div>"; }).join("") + "</div>";
    }
    var avisos = T.avisos(m);
    if (avisos.length) {
      html += '<div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e;padding:10px;margin-bottom:10px;font-size:13px">'
        + avisos.map(function (a) { return "<div>" + esc(a) + "</div>"; }).join("") + "</div>";
    }

    html += '<div class="tabs" style="margin-bottom:12px">' + abas.map(function (a) {
      return '<div class="tab' + (self._propModAba === a[0] ? " on" : "") + '" data-gacao="propmod-aba" data-aba="' + a[0] + '">' + a[1] + "</div>";
    }).join("") + "</div>";

    if (this._propModAba === "paginas") html += this._propModPaginas(m);
    else if (this._propModAba === "fotos") html += this._propModFotos(m);
    else if (this._propModAba === "estilo") html += this._propModEstilo(m);
    else html += this._propModPrevia(m);

    cx.innerHTML = html + "</div>";
    cx.style.display = "";
    this._propModWire();
  };

  /* ---------- aba PÁGINAS ---------- */
  G._propModPaginas = function (m) {
    var html = '<p class="muted" style="margin:0 0 10px">A proposta sai nesta ordem. Cada página é um bloco pronto — '
      + "clique para abrir os campos dela.</p>";

    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    m.paginas.forEach(function (p, i) {
      var b = T.bloco(p.tipo);
      var aberta = (G._propModPgAberta === p.id);
      html += '<div class="card" style="padding:10px">'
        + '<div class="flex between" style="align-items:center;gap:8px;flex-wrap:wrap">'
        + '<div style="cursor:pointer;flex:1;min-width:180px" data-gacao="propmod-pg-abrir" data-pg="' + esc(p.id) + '">'
        + '<b style="font-size:13.5px">' + (i + 1) + ". " + esc(b.nome) + "</b>"
        + '<div class="muted" style="font-size:12px">' + esc(b.resumo) + "</div></div>"
        + '<div class="flex" style="gap:4px">'
        + '<button class="btn sm" data-gacao="propmod-pg-sobe" data-pg="' + esc(p.id) + '"' + (i === 0 ? " disabled" : "") + ' title="Subir">↑</button>'
        + '<button class="btn sm" data-gacao="propmod-pg-desce" data-pg="' + esc(p.id) + '"' + (i === m.paginas.length - 1 ? " disabled" : "") + ' title="Descer">↓</button>'
        + '<button class="btn sm ghost" data-gacao="propmod-pg-remove" data-pg="' + esc(p.id) + '" title="Remover">×</button>'
        + "</div></div>";

      if (aberta) {
        html += '<div style="margin-top:10px;border-top:1px solid var(--linha);padding-top:10px">';
        b.campos.forEach(function (c) {
          var v = p[c.id];
          var idc = "pmc-" + p.id + "-" + c.id;
          if (c.tipo === "sim_nao") {
            html += '<label style="display:flex;gap:7px;align-items:center;margin-bottom:8px;font-size:13px">'
              + '<input type="checkbox" id="' + idc + '" data-pmc="' + esc(p.id) + '" data-campo="' + esc(c.id) + '"' + (v ? " checked" : "") + ">"
              + esc(c.nome) + "</label>";
          } else if (c.tipo === "multi") {
            html += K.campo(c.nome, '<textarea id="' + idc + '" data-pmc="' + esc(p.id) + '" data-campo="' + esc(c.id)
              + '" rows="4" placeholder="' + esc(c.dica || "") + '">' + esc(v) + "</textarea>");
          } else {
            html += K.campo(c.nome, '<input id="' + idc + '" data-pmc="' + esc(p.id) + '" data-campo="' + esc(c.id)
              + '" value="' + esc(v) + '" placeholder="' + esc(c.dica || "") + '">');
          }
        });
        html += "</div>";
      }
      html += "</div>";
    });
    html += "</div>";

    html += '<div style="margin-top:12px"><label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--texto-fraco)">Acrescentar página</label>'
      + '<div class="flex" style="gap:6px;flex-wrap:wrap;margin-top:6px">'
      + T.BLOCOS.map(function (b) {
        return '<button class="btn sm" data-gacao="propmod-pg-add" data-tipo="' + esc(b.tipo) + '" title="' + esc(b.resumo) + '">+ ' + esc(b.nome) + "</button>";
      }).join("") + "</div></div>";
    return html;
  };

  /* ---------- aba FOTOS ---------- */
  G._propModFotos = function (m) {
    var sl = T.slots(m);
    if (!sl.length) return '<p class="muted">Nenhuma página deste modelo usa foto. Acrescente uma Capa, um Quem somos ou uma Galeria.</p>';

    var html = '<p class="muted" style="margin:0 0 12px;max-width:74ch">'
      + "Cada espaço tem um <b>número fixo</b>. A <i>Imagem 1</i> é a Imagem 1 para sempre: no dia em que "
      + "você quiser outra capa, troque só a Imagem 1 e o resto fica como está. Suba na maior qualidade "
      + "que tiver — o sistema reduz para o tamanho de impressão sozinho.</p>";

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px">';
    sl.forEach(function (s) {
      var temFoto = !!(s.ref && (s.ref.id || s.ref.remoto || s.ref.d));
      html += '<div class="card" style="padding:10px">'
        + '<div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--texto-fraco);margin-bottom:2px">'
        + esc(s.rotulo) + "</div>"
        + '<div class="muted" style="font-size:11.5px;margin-bottom:8px">' + esc(s.onde) + "</div>"
        + '<div class="pm-thumb" data-slot="' + s.numero + '" style="height:110px;border:1px dashed var(--linha);border-radius:4px;'
        + 'display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--fundo-2);margin-bottom:8px">'
        + (temFoto ? '<span class="muted" style="font-size:11px">carregando…</span>'
                   : '<span class="muted" style="font-size:11px">sem foto</span>')
        + "</div>"
        + '<div class="flex" style="gap:5px">'
        + '<button class="btn sm primary" data-gacao="propmod-foto-por" data-slot="' + s.numero + '" style="flex:1">'
        + (temFoto ? "Trocar" : "Escolher") + "</button>"
        + (temFoto ? '<button class="btn sm ghost" data-gacao="propmod-foto-tira" data-slot="' + s.numero + '" title="Tirar a foto">×</button>' : "")
        + "</div></div>";
    });
    html += "</div>";
    html += '<input type="file" id="pm-arquivo" accept="image/*" style="display:none">';
    return html;
  };

  /* ---------- aba ESTILO ---------- */
  G._propModEstilo = function (m) {
    var e = m.estilo;
    function cor(id, rot, v) {
      return '<div style="flex:1;min-width:150px"><label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--texto-fraco);display:block;margin-bottom:4px">'
        + esc(rot) + "</label>"
        + '<input type="color" id="' + id + '" data-pme="' + id.replace("pme-", "") + '" value="' + esc(v)
        + '" style="width:100%;height:34px;padding:2px;border:1px solid var(--linha);border-radius:4px;background:none"></div>';
    }
    var html = '<div class="flex" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      + cor("pme-corTitulo", "Títulos e tabela", e.corTitulo)
      + cor("pme-corTexto", "Texto", e.corTexto)
      + cor("pme-corDestaque", "Destaque", e.corDestaque)
      + cor("pme-corFundoEscuro", "Fundo das páginas escuras", e.corFundoEscuro)
      + "</div>";

    html += '<div class="row">'
      + K.campo("Formato do papel", K.sel("pme-formato", K.opts([["a4", "A4 — para imprimir e assinar"], ["vertical", "Vertical — formato de celular, para mandar no WhatsApp"]], e.formato)))
      + K.campo("Textura de fundo", K.sel("pme-textura", K.opts(T.TEXTURAS.map(function (t) { return [t.id, t.nome]; }), e.textura)))
      + "</div>";

    html += '<label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--texto-fraco)">Letra</label>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-top:6px">';
    T.FONTES.forEach(function (f) {
      var on = e.fonte === f.id;
      html += '<div class="card" data-gacao="propmod-fonte" data-fonte="' + esc(f.id) + '" style="padding:10px;cursor:pointer;'
        + (on ? "border-color:var(--acento);box-shadow:0 0 0 1px var(--acento)" : "") + '">'
        + '<div style="font-family:' + f.titulo + ';font-size:22px;font-weight:700;line-height:1.1;margin-bottom:4px">' + esc(f.exemplo) + "</div>"
        + '<div style="font-family:' + f.texto + ';font-size:12px;color:var(--texto-fraco)">' + esc(f.nome) + "</div>"
        + "</div>";
    });
    html += "</div>";

    html += '<p class="muted" style="margin-top:14px;font-size:12.5px;max-width:70ch">'
      + (typeof Icones !== "undefined" ? Icones.get("lampada", 14) : "")
      + " As letras são as que já existem no computador e no celular. É de propósito: a proposta costuma "
      + "ser impressa na frente do cliente, e uma fonte baixada da internet que não carrega troca o "
      + "desenho inteiro sem avisar.</p>";

    /* a quem este modelo serve */
    var clientes = K.lista("clientes");
    html += '<div style="margin-top:14px">'
      + K.campo("Usar este modelo para", K.sel("pme-cliente",
        K.optsRec(clientes, "nome", m.paraCliente, "— todos os clientes —")))
      + '<p class="muted" style="margin:-6px 0 0;font-size:12px">Escolhendo um cliente, este modelo passa a ser o sugerido nas propostas dele.</p></div>';

    html += '<div style="margin-top:14px"><button class="btn primary" data-gacao="propmod-estilo-salvar">Salvar</button></div>';
    return html;
  };

  /* ---------- aba PRÉVIA ---------- */
  G._propModPrevia = function (m) {
    return '<p class="muted" style="margin:0 0 10px;max-width:74ch">'
      + "A prévia usa uma proposta de mentira, só para você ver o desenho. Os preços de verdade entram "
      + "quando a proposta real for gerada.</p>"
      + '<div class="flex" style="gap:8px;margin-bottom:12px">'
      + '<button class="btn sm primary" data-gacao="propmod-imprimir">'
      + (typeof Icones !== "undefined" ? Icones.get("imprimir", 15) : "") + " Abrir para imprimir</button></div>"
      + '<div id="pm-previa" style="border:1px solid var(--linha);border-radius:6px;overflow:auto;max-height:600px;background:#8a8a8a;padding:14px">'
      + '<div class="muted" style="color:#fff">montando…</div></div>';
  };

  /* ===================================================================
   * DADOS DE MENTIRA PARA A PRÉVIA
   *
   * ⚠ Números redondos e nome "Exemplo", de propósito: uma prévia com cara
   *   de proposta real acaba impressa e enviada por engano.
   * =================================================================== */
  G._propModDadosDemo = function () {
    var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
    return {
      empresa: { nome: txt(emp.nome) || "Sua Empresa", cidade: txt(emp.cidade) },
      logoHTML: (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(120) : "",
      cliente: "Cliente Exemplo",
      data: (function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })(),
      validade: { texto: "Esta proposta é válida por 30 dias." },
      blocos: {
        madeira: [
          { descricao: "Item de exemplo em madeira", unidade: "m²", qtd: 40, unitario: 250, total: 10000 },
          { descricao: "Segundo item de exemplo", unidade: "m²", qtd: 18, unitario: 200, total: 3600 }
        ],
        mo: [{ descricao: "Mão de obra de exemplo", unidade: "m²", qtd: 58, unitario: 150, total: 8700 }],
        totalMadeira: 13600, totalMO: 8700, total: 22300
      },
      comercial: {
        condicoesPagamento: "50% na assinatura | 50% na entrega",
        prazoExecucao: "30 dias úteis a partir da aprovação",
        garantia: "5 anos contra defeito de fabricação e montagem"
      },
      imagens: {}
    };
  };

  /* resolve os bytes das fotos do modelo (IndexedDB ou servidor) e chama de volta */
  G._propModImagens = function (m, cb) {
    var sl = T.slots(m);
    var out = {};
    var pend = sl.filter(function (s) { return !!s.ref; });
    if (!pend.length || typeof Fotos === "undefined") { cb(out); return; }
    var n = 0;
    pend.forEach(function (s) {
      var pronto = function (d) {
        if (d) out[String(s.numero)] = { dataURI: d };
        if (++n === pend.length) cb(out);
      };
      try {
        var p = Fotos.dataURI(s.ref);
        if (p && p.then) p.then(pronto)["catch"](function () { pronto(""); });
        else pronto(p || "");
      } catch (e) { pronto(""); }
    });
  };

  /* ===================================================================
   * FIAÇÃO
   * =================================================================== */
  G._propModWire = function () {
    var self = this;
    var cx = document.getElementById("propmod-editor"); if (!cx) return;
    var raw = obter(this._propModId); if (!raw) return;
    var m = T.modelo(raw);

    /* campos de página: gravam ao sair do campo */
    var campos = cx.querySelectorAll("[data-pmc]");
    for (var i = 0; i < campos.length; i++) {
      (function (el) {
        var ev = el.type === "checkbox" ? "change" : "blur";
        el.addEventListener(ev, function () {
          var pg = el.getAttribute("data-pmc"), campo = el.getAttribute("data-campo");
          var r = obter(self._propModId); if (!r) return;
          var mm = T.modelo(r);
          mm.paginas.forEach(function (p) {
            if (p.id !== pg) return;
            p[campo] = (el.type === "checkbox") ? !!el.checked : el.value;
          });
          r.paginas = mm.paginas;
          gravar(r);
        });
      })(campos[i]);
    }

    /* miniaturas das fotos */
    if (this._propModAba === "fotos") {
      this._propModImagens(m, function (imgs) {
        var thumbs = cx.querySelectorAll(".pm-thumb");
        for (var j = 0; j < thumbs.length; j++) {
          var n = thumbs[j].getAttribute("data-slot");
          var im = imgs[n];
          if (im && im.dataURI) {
            thumbs[j].innerHTML = '<img src="' + esc(im.dataURI) + '" style="width:100%;height:100%;object-fit:cover" alt="">';
          } else if (thumbs[j].textContent.indexOf("carregando") > -1) {
            thumbs[j].innerHTML = '<span class="muted" style="font-size:11px">foto não encontrada neste aparelho</span>';
          }
        }
      });
    }

    /* prévia */
    if (this._propModAba === "previa") {
      var alvo = document.getElementById("pm-previa");
      this._propModImagens(m, function (imgs) {
        var dados = self._propModDadosDemo();
        dados.imagens = imgs;
        if (!alvo) return;
        alvo.innerHTML = "<style>" + T.css() + '</style><div style="transform:scale(.52);transform-origin:top left;width:192%">'
          + T.html(m, dados) + "</div>";
      });
    }
  };

  /* ===================================================================
   * O DOCUMENTO DE VERDADE — usado pela proposta real e pela prévia
   *
   * ⚠ A VARREDURA DE VAZAMENTO RODA AQUI, e não só no carpproposta. Este é
   *   um caminho NOVO até o mesmo papel; deixar a proteção só no caminho
   *   antigo é ter meia proteção no dia em que alguém trocar de layout.
   * =================================================================== */
  G.propModImprimir = function (modelo, dados, auditor) {
    var m = T.modelo(modelo);
    var faltas = T.validar(m);
    if (faltas.length) { UI.toast(faltas[0], "erro"); return false; }
    var html = T.html(m, dados);

    /* ⚠ O AUDITOR É O DO DOMÍNIO, NÃO UM SEGUNDO AUDITOR.
       O `CarpProposta.auditar` já sabe distinguir um custo vazado de um valor
       legítimo que por acaso coincide — escrever essa regra de novo aqui é
       como nascem os dois comportamentos diferentes para a mesma pergunta.
       Quem chama passa o auditor dele; sem auditor, cai na varredura grossa
       de palavras do motor, que é melhor que nenhuma. */
    var vaz = (typeof auditor === "function") ? auditor(html) : T.auditar(html, []);
    if (vaz && vaz.length) {
      var qual = vaz[0];
      var comoTexto = (typeof qual === "string") ? qual
        : (qual.tipo === "palavra" ? 'a expressão "' + qual.achado + '"' : (qual.achado + " — " + (qual.motivo || "")));
      UI.modal("Proposta bloqueada",
        "<p>O documento levaria informação que o cliente não pode ver:</p>"
        + '<ul style="margin:0 0 0 18px"><li>' + esc(comoTexto) + "</li>"
        + (vaz.length > 1 ? "<li>e mais " + (vaz.length - 1) + "</li>" : "")
        + '</ul><p class="muted">Nada foi aberto. Avise o suporte.</p>',
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return false;
    }
    var w = window.open("", "_blank");
    if (!w) { UI.toast("O navegador bloqueou a janela. Libere a abertura de janelas para este endereço.", "erro"); return false; }
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
      + "<title>" + esc(txt(dados && dados.tituloDoc) || "Proposta") + "</title>"
      + "<style>body{margin:0}" + T.css() + "</style></head><body>" + html + "</body></html>");
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
    return true;
  };

  /* ===================================================================
   * AÇÕES
   * =================================================================== */
  G.registrarAcoes("propmodelos", {
    "propmod-novo": function () {
      UI.modal("Novo modelo de proposta",
        '<p class="muted">Comece de um dos modelos prontos e ajuste o que quiser.</p>'
        + T.FABRICA.map(function (f) {
          return '<label style="display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
            + '<input type="radio" name="pmf" value="' + esc(f.id) + '"' + (f.id === "tpl-vertical-foto" ? " checked" : "") + ' style="margin-top:3px">'
            + "<span><b>" + esc(f.nome) + "</b><br><span class=\"muted\" style=\"font-size:12.5px\">" + esc(f.descricao) + "</span></span></label>";
        }).join("")
        + K.campo("Nome do novo modelo", '<input id="pm-nome" placeholder="Ex.: Proposta padrão 2026">'),
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Criar", classe: "primary", onClick: function () {
            var sel = document.querySelector('input[name="pmf"]:checked');
            var base = sel ? sel.value : "tpl-vertical-foto";
            var m = T.deFabrica(base);
            if (!m) { UI.toast("Modelo de origem não encontrado.", "erro"); return; }
            m.id = "";
            m.nome = txt(K.v("pm-nome")) || m.nome;
            var novo = gravar(m);
            UI.fecharModal(); App.render();
            if (novo && novo.id) setTimeout(function () { G._propModAbrir(novo.id); }, 60);
          } }
        ]);
    },

    "propmod-fabrica": function () {
      var n = G.propModelosSemear();
      App.render();
      UI.toast(n ? (n + " modelo(s) de fábrica trazido(s).") : "Os modelos de fábrica já estão aqui.", n ? "ok" : "aviso");
    },

    "propmod-abrir": function (ds) { G._propModAbrir(ds.id); },
    "propmod-fechar": function () { G._propModId = ""; var e = document.getElementById("propmod-editor"); if (e) { e.style.display = "none"; e.innerHTML = ""; } },
    "propmod-aba": function (ds) { G._propModAba = ds.aba || "paginas"; G._propModRender(); },
    "propmod-pg-abrir": function (ds) { G._propModPgAberta = (G._propModPgAberta === ds.pg) ? "" : ds.pg; G._propModRender(); },

    "propmod-duplicar": function (ds) {
      var r = obter(ds.id); if (!r) return;
      var m = T.modelo(r);
      m.id = ""; m.padrao = false;
      m.nome = m.nome + " (cópia)";
      var novo = gravar(m);
      App.render();
      if (novo && novo.id) setTimeout(function () { G._propModAbrir(novo.id); }, 60);
      UI.toast("Modelo duplicado — as fotos vieram junto.", "ok");
    },

    "propmod-renomear": function () {
      var r = obter(G._propModId); if (!r) return;
      UI.modal("Renomear modelo",
        K.campo("Nome", '<input id="pm-rn" value="' + esc(r.nome || "") + '">')
        + K.campo("Descrição (opcional)", '<input id="pm-rd" value="' + esc(r.descricao || "") + '" placeholder="Para que serve este modelo">'),
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
            var n = txt(K.v("pm-rn"));
            if (!n) { UI.toast("O modelo precisa de um nome.", "erro"); return; }
            r.nome = n; r.descricao = txt(K.v("pm-rd"));
            gravar(r); UI.fecharModal(); App.render();
            setTimeout(function () { G._propModAbrir(r.id); }, 60);
          } }
        ]);
    },

    "propmod-padrao": function () {
      var r = obter(G._propModId); if (!r) return;
      var virar = !r.padrao;
      /* ⚠ um padrão só: dois modelos marcados fariam a proposta escolher
         por ordem de lista, que muda quando alguém renomeia */
      if (virar) {
        lista().forEach(function (x) { if (x.padrao && x.id !== r.id) { x.padrao = false; gravar(x); } });
      }
      r.padrao = virar; gravar(r);
      G._propModRender(); App.render();
      UI.toast(virar ? "Este passou a ser o modelo padrão." : "Sem modelo padrão agora.", "ok");
    },

    "propmod-excluir": function () {
      var r = obter(G._propModId); if (!r) return;
      UI.modal("Excluir modelo",
        "<p>Excluir <b>" + esc(r.nome) + "</b>?</p>"
        + '<p class="muted">As propostas já geradas não mudam — o documento delas já foi feito. '
        + "As fotos continuam guardadas e podem ser usadas em outro modelo.</p>",
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Excluir", classe: "primary", onClick: function () {
            Store.excluir(eid(), ENT, r.id);
            G._propModId = ""; UI.fecharModal(); App.render();
            UI.toast("Modelo excluído.", "ok");
          } }
        ]);
    },

    /* ---- páginas ---- */
    "propmod-pg-add": function (ds) {
      var r = obter(G._propModId); if (!r) return;
      var b = T.bloco(ds.tipo); if (!b) return;
      var antes = T.modelo(r);
      var nova = { id: "pg" + (Date.now() % 100000), tipo: b.tipo };
      var depois = T.modelo(r);
      depois.paginas.push(nova);
      depois = T.modelo(depois);
      /* ⚠ as fotos seguem as páginas, não os números — ver PropTpl.remapear */
      r.imagens = T.remapear(antes, depois);
      r.paginas = depois.paginas;
      gravar(r);
      G._propModPgAberta = nova.id;
      G._propModRender();
    },
    "propmod-pg-remove": function (ds) {
      var r = obter(G._propModId); if (!r) return;
      var antes = T.modelo(r);
      var depois = T.modelo(r);
      depois.paginas = depois.paginas.filter(function (p) { return p.id !== ds.pg; });
      r.imagens = T.remapear(antes, depois);
      r.paginas = depois.paginas;
      gravar(r); G._propModRender();
    },
    "propmod-pg-sobe": function (ds) { G._propModMover(ds.pg, -1); },
    "propmod-pg-desce": function (ds) { G._propModMover(ds.pg, 1); },

    /* ---- fotos ---- */
    "propmod-foto-por": function (ds) {
      var inp = document.getElementById("pm-arquivo"); if (!inp) return;
      G._propModSlot = ds.slot;
      inp.value = "";
      inp.onchange = function () { G._propModRecebeFoto(inp.files && inp.files[0]); };
      inp.click();
    },
    "propmod-foto-tira": function (ds) {
      var r = obter(G._propModId); if (!r) return;
      var imgs = r.imagens || {};
      delete imgs[String(ds.slot)];
      r.imagens = imgs; gravar(r); G._propModRender();
      UI.toast("Foto tirada do modelo.", "ok");
    },

    /* ---- estilo ---- */
    "propmod-fonte": function (ds) {
      var r = obter(G._propModId); if (!r) return;
      r.estilo = T.modelo(r).estilo;
      r.estilo.fonte = ds.fonte;
      gravar(r); G._propModRender();
    },
    "propmod-estilo-salvar": function () {
      var r = obter(G._propModId); if (!r) return;
      var e = T.modelo(r).estilo;
      ["corTitulo", "corTexto", "corDestaque", "corFundoEscuro"].forEach(function (k) {
        var el = document.getElementById("pme-" + k);
        if (el && el.value) e[k] = el.value;
      });
      var fm = K.v("pme-formato"); if (fm) e.formato = fm;
      var tx = document.getElementById("pme-textura"); e.textura = tx ? tx.value : e.textura;
      r.estilo = e;
      r.paraCliente = K.v("pme-cliente") || "";
      gravar(r); G._propModRender(); App.render();
      UI.toast("Salvo.", "ok");
    },

    "propmod-imprimir": function () {
      var r = obter(G._propModId); if (!r) return;
      var m = T.modelo(r);
      G._propModImagens(m, function (imgs) {
        var d = G._propModDadosDemo();
        d.imagens = imgs;
        d.tituloDoc = "Prévia — " + m.nome;
        G.propModImprimir(m, d, null);
      });
    }
  });

  G._propModMover = function (pgId, delta) {
    var r = obter(this._propModId); if (!r) return;
    var antes = T.modelo(r);
    var ps = T.modelo(r).paginas;
    var i = -1;
    ps.forEach(function (p, k) { if (p.id === pgId) i = k; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= ps.length) return;
    var tmp = ps[i]; ps[i] = ps[j]; ps[j] = tmp;
    var depois = T.modelo({ paginas: ps, estilo: r.estilo, imagens: r.imagens, nome: r.nome });
    r.imagens = T.remapear(antes, depois);
    r.paginas = ps;
    gravar(r); this._propModRender();
  };

  /* ⚠ A FOTO ENTRA PELA MESMA ESTRADA DO DIÁRIO — bytes no IndexedDB e na
     fila do servidor, referência no registro. Só a qualidade muda. */
  G._propModRecebeFoto = function (file) {
    if (!file) return;
    var self = this;
    if (typeof Fotos === "undefined") { UI.toast("O guardador de fotos não carregou.", "erro"); return; }
    var fr = new FileReader();
    fr.onload = function () {
      UI.toast("Preparando a imagem…", "ok");
      Fotos.guardar(String(fr.result), "Modelo de proposta", { larguraMax: IMG_LARGURA, qualidade: IMG_QUALIDADE })
        .then(function (ref) {
          var r = obter(self._propModId); if (!r) return;
          var imgs = r.imagens || {};
          imgs[String(self._propModSlot)] = ref;
          r.imagens = imgs;
          if (!gravar(r)) { UI.toast("Não consegui gravar (armazenamento cheio).", "erro"); return; }
          self._propModRender();
          UI.toast("Imagem " + self._propModSlot + " atualizada.", "ok");
        })["catch"](function () { UI.toast("Não consegui ler essa imagem.", "erro"); });
    };
    fr.onerror = function () { UI.toast("Não consegui ler o arquivo.", "erro"); };
    fr.readAsDataURL(file);
  };

  /* ===================================================================
   * QUAL MODELO USAR NUMA PROPOSTA
   *
   * Ordem: o do cliente → o marcado como padrão → o primeiro da lista.
   * Sem nenhum, devolve null e quem chamou cai no documento antigo — a
   * proposta nunca deixa de sair por falta de modelo.
   * =================================================================== */
  G.propModeloPara = function (clienteId) {
    var ms = lista();
    if (!ms.length) return null;
    var doCliente = ms.filter(function (m) { return m.paraCliente && m.paraCliente === clienteId; })[0];
    if (doCliente) return doCliente;
    var pad = ms.filter(function (m) { return m.padrao; })[0];
    return pad || ms[0];
  };

  G.registrarWire("propmodelos", function () { /* a fiação vive no _propModWire */ });
})(typeof window !== "undefined" ? window : this);
