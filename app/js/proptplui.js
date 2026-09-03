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
      '<button class="btn sm primary" data-gacao="propmod-agente" style="margin-right:10px;align-self:center" '
      + 'title="Responder um roteiro e deixar a IA montar a estrutura do seu modelo">'
      + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " Montar com a IA</button>"
      + '<button class="btn sm" data-gacao="propmod-importar" style="margin-right:10px;align-self:center" '
      + 'title="Abrir um modelo que veio de outra conta (arquivo .json)">'
      + (typeof Icones !== "undefined" ? Icones.get("importar", 15) : "") + " Trazer de um arquivo</button>"
      + '<button class="btn sm" data-gacao="propmod-fabrica" style="margin-right:10px;align-self:center">'
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
      + '<button class="btn sm" data-gacao="propmod-exportar" title="Salvar este modelo num arquivo, com as fotos dentro, para usar em outra conta">'
      + (typeof Icones !== "undefined" ? Icones.get("salvar", 15) : "") + " Levar para outra conta</button>"
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
        html += G._propModTipografia(p);
        html += G._propModFormas(p);
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
        /* ⚠ CORTAR só aparece com foto: botão que não faz nada ensina a
           desconfiar dos outros. E o "voltar ao original" só quando há corte
           para desfazer — senão promete desfazer o que não foi feito. */
        + (temFoto ? '<button class="btn sm" data-gacao="propmod-cortar" data-n="' + s.numero
             + '" title="Escolher o que aparece da foto neste lugar">Cortar</button>' : "")
        + (s.original ? '<button class="btn sm ghost" data-gacao="propmod-corte-desfazer" data-n="' + s.numero
             + '" title="Voltar para a foto como ela veio">↺</button>' : "")
        + (temFoto ? '<button class="btn sm ghost" data-gacao="propmod-foto-tira" data-slot="' + s.numero + '" title="Tirar a foto">×</button>' : "")
        + "</div>"
        + (s.proporcao ? '<div class="muted" style="font-size:11px;margin-top:6px">Esta imagem é desenhada em '
             + (s.proporcao >= 1 ? "faixa larga" : "retrato") + " (" + s.proporcao.toFixed(2) + ":1)</div>" : "")
        + "</div>";
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
      + cor("pme-corDestaque2", "2º destaque (curvas e botões)", e.corDestaque2 || e.corDestaque)
      + cor("pme-corFundoEscuro", "Fundo das páginas escuras", e.corFundoEscuro)
      + "</div>";

    html += '<div class="row">'
      + K.campo("Formato do papel", K.sel("pme-formato", K.opts([["a4", "A4 — para imprimir e assinar"], ["vertical", "Vertical — formato de celular, para mandar no WhatsApp"]], e.formato)))
      + K.campo("Textura de fundo", K.sel("pme-textura", K.opts(T.TEXTURAS.map(function (t) { return [t.id, t.nome]; }), e.textura)))
      + "</div>"
      + '<div class="row">'
      + K.campo("Traços da marca", K.sel("pme-ornamento", K.opts([["", "Sem ornamento"], ["curvas", "Curvas — traços nas capas e nos cantos das páginas"]], e.ornamento)))
      + K.campo("Rodapé das páginas", K.sel("pme-rodape", K.opts([["", "Sem rodapé"], ["contatos", "Contatos da empresa (links clicáveis no PDF)"]], e.rodape)))
      + K.campo("Páginas internas", K.sel("pme-fundoInternas", K.opts([["", "Escopo e condições em página escura"], ["claro", "Todas as páginas internas claras"]], e.fundoInternas)))
      + K.campo("Logo nas páginas escuras", K.sel("pme-logoEscuro", K.opts([
          ["", "Como ele é (logo claro)"],
          ["clarear", "Deixar branco (logo escuro — o mais comum)"],
          ["pastilha", "Sobre uma pastilha branca (mantém as cores)"]], e.logoEscuro)))
      + "</div>"
      + '<p class="muted" style="margin:-4px 0 0;font-size:12px">Capa, "quem somos" e encerramento têm fundo escuro: '
      + "um logo azul-marinho desaparece neles sem dar erro nenhum.</p>";

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

    /* =================================================================
     * O LOGO DO MODELO
     *
     * ⚠ O PADRÃO CONTINUA SENDO O ⚙ EMPRESA — é o que mantém o sistema
     *   white-label: cada conta imprime a marca dela. Aqui é a exceção
     *   explícita: um modelo que carrega o próprio logo, para atravessar a
     *   exportação e chegar montado na conta de quem recebe. A tela diz qual
     *   dos dois está valendo, porque um logo que "não muda quando eu troco
     *   em ⚙ Empresa" é o tipo de coisa que ninguém descobre sozinho.
     * ================================================================= */
    var logoEmp = "";
    try { logoEmp = (typeof Empresa !== "undefined" && Empresa.logo && Empresa.logo()) || ""; } catch (eL) {}
    html += '<div style="margin-top:16px;border-top:1px solid var(--linha);padding-top:12px">'
      + '<label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--texto-fraco)">Logo</label>'
      + '<div class="flex" style="gap:12px;align-items:center;margin-top:6px;flex-wrap:wrap">'
      + '<div style="min-width:150px;min-height:56px;display:flex;align-items:center;justify-content:center;border:1px solid var(--linha);border-radius:6px;padding:6px;background:#fff">'
      + (m.logo
          ? '<img src="' + esc(m.logo) + '" alt="logo do modelo" style="max-height:44px;max-width:180px;object-fit:contain">'
          : (logoEmp
              ? '<img src="' + esc(logoEmp) + '" alt="logo da empresa" style="max-height:44px;max-width:180px;object-fit:contain">'
              : '<span class="muted" style="font-size:12px">sem logo</span>'))
      + "</div>"
      + '<div style="flex:1;min-width:220px">'
      + '<button class="btn sm" data-gacao="propmod-logo">' + (typeof Icones !== "undefined" ? Icones.get("importar", 15) : "") + " Enviar um logo para este modelo</button>"
      + (m.logo ? ' <button class="btn sm ghost" data-gacao="propmod-logo-remover">Voltar a usar o do ⚙ Empresa</button>' : "")
      + '<p class="muted" style="margin:6px 0 0;font-size:12px">'
      + (m.logo
          ? "Este modelo usa um <b>logo próprio</b> — o de ⚙ Empresa é ignorado aqui. Ele viaja dentro do arquivo quando você levar o modelo para outra conta."
          : (logoEmp
              ? "Usando o logo de <b>⚙ Empresa</b>. Envie um aqui só se este modelo tiver de sair com outra marca, ou se você for mandá-lo para outra conta."
              : "Nenhum logo cadastrado: a capa sai com <b>[LOGO]</b>. Envie o logo em ⚙ Empresa (vale para todos os documentos) ou aqui, só para este modelo."))
      + "</p></div></div></div>";

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
      empresa: (function () {
        var e2 = {}; Object.keys(emp).forEach(function (k) { e2[k] = txt(emp[k]); });
        e2.nome = e2.nome || "Sua Empresa"; return e2;
      })(),
      links: { planilha: "https://exemplo.invalido/proposta.xlsx" },
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
  /* =====================================================================
   * TIPOGRAFIA DA PÁGINA — o que evita exportar para outro programa
   *
   * ⚠ FICA DENTRO DA PÁGINA, não numa aba separada. Quem quer justificar o
   *   escopo está olhando para o escopo; mandar a pessoa a outra aba, achar a
   *   página de novo numa lista e voltar é o atrito que faz ela desistir e
   *   abrir o documento no Word.
   *
   * ⚠ E VEM FECHADO. São sete controles que a maioria nunca vai tocar: abertos
   *   por padrão, empurram para baixo os campos que todo mundo usa.
   * =================================================================== */
  G._propModTipografia = function (p) {
    var tp = T.tipografia(p.tipografia);
    var pid = esc(p.id);
    function sel(campo, atual, opcoes) {
      return '<select data-pmt="' + pid + '" data-tcampo="' + campo + '">'
        + opcoes.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (String(atual) === String(o[0]) ? " selected" : "") + ">"
              + esc(o[1]) + "</option>";
          }).join("") + "</select>";
    }
    function faixa(campo, atual, min, max, passo, sufixo) {
      return '<div class="flex" style="gap:8px;align-items:center">'
        + '<input type="range" data-pmt="' + pid + '" data-tcampo="' + campo + '" min="' + min + '" max="' + max
        + '" step="' + passo + '" value="' + atual + '" style="flex:1">'
        + '<span class="muted" style="font-size:12px;min-width:52px;text-align:right" data-tval="' + pid + ":" + campo + '">'
        + atual + esc(sufixo) + "</span></div>";
    }

    var alinTit = [["", "como o modelo desenha"]];
    var alinTxt = [["", "como o modelo desenha"]];
    T.ALINHAMENTOS.forEach(function (a) {
      alinTxt.push([a.id, a.nome]);
      if (!a.soTexto) alinTit.push([a.id, a.nome]);
    });

    return '<details style="margin-top:10px">'
      + '<summary class="muted" style="cursor:pointer;font-size:12.5px">Tipografia desta página</summary>'
      + '<div class="row" style="margin-top:8px">'
      + K.campo("Alinhamento do título", sel("alinhaTitulo", tp.alinhaTitulo, alinTit))
      + K.campo("Alinhamento do texto", sel("alinhaTexto", tp.alinhaTexto, alinTxt))
      + "</div>"
      + '<div class="row">'
      + K.campo("Tamanho do título", faixa("escalaTitulo", tp.escalaTitulo, 60, 180, 5, "%"))
      + K.campo("Tamanho do texto", faixa("escalaTexto", tp.escalaTexto, 70, 160, 5, "%"))
      + "</div>"
      + '<div class="row">'
      + K.campo("Espaço entre linhas", faixa("entrelinha", tp.entrelinha, 80, 200, 5, "%"))
      + K.campo("Espaço entre letras", faixa("espacoLetra", tp.espacoLetra, -5, 40, 1, ""))
      + "</div>"
      + '<label class="flex" style="gap:8px;align-items:center;margin-top:4px;font-size:13px">'
      + '<input type="checkbox" data-pmt="' + pid + '" data-tcampo="caixaAltaTitulo"'
      + (tp.caixaAltaTitulo ? " checked" : "") + "> Título em MAIÚSCULAS</label>"
      + '<p class="muted" style="font-size:11.5px;margin:6px 0 0">"Justificado" vale só para o texto: '
      + "justificar um título de duas palavras abre um vão enorme entre elas.</p>"
      + "</details>";
  };

  /* =====================================================================
   * O ROTEIRO — as perguntas que impedem de esquecer
   *
   * ⚠ POR QUE ROTEIRO E NÃO UMA CAIXA DE TEXTO. "Descreva o que você quer"
   *   devolve um parágrafo que esquece metade: quem escreve não lembra de
   *   dizer o tom, o formato, quantas fotos tem, o que não pode faltar. O
   *   roteiro pergunta o que MUDA A ESTRUTURA do documento — e nada além
   *   disso, porque formulário longo é formulário abandonado.
   *
   * ⚠ E ELE NÃO PERGUNTA PREÇO, PRAZO NEM PAGAMENTO. Esses três já existem
   *   no orçamento e entram prontos na hora de gerar a proposta. Perguntar de
   *   novo aqui criaria uma segunda verdade sobre o mesmo dado — e a que o
   *   cliente lê seria a errada.
   * =================================================================== */
  G.PROPMOD_ROTEIRO = [
    { id: "ramo", nome: "O que a sua empresa faz", obrigatorio: true, multi: false,
      dica: "Ex.: carpintaria de deck e forro em madeira" },
    { id: "oQueVende", nome: "O que esta proposta costuma vender", obrigatorio: true, multi: true,
      dica: "Ex.: deck de cumaru instalado, forro ripado, caibro aparente — com a instalação" },
    { id: "paraQuem", nome: "Para quem você manda a proposta", multi: false,
      dica: "Ex.: arquitetos, construtoras, cliente final de alto padrão" },
    { id: "tom", nome: "Que cara o documento deve ter", multi: false, tipo: "opcoes",
      opcoes: ["Sóbrio e técnico", "Marcante e visual", "Equilibrado"] },
    { id: "naoPodeFaltar", nome: "O que NÃO pode faltar no documento", multi: true,
      dica: "Ex.: as fotos de obras prontas, a explicação de como escolhemos a madeira, a garantia" },
    { id: "diferenciais", nome: "Por que o cliente escolhe vocês", multi: true,
      dica: "Escreva só o que é verdade — o que você escrever aqui vai para o papel" },
    { id: "quantasFotos", nome: "Quantas fotos boas você tem para usar", multi: false, tipo: "opcoes",
      opcoes: ["Nenhuma por enquanto", "1 ou 2", "3 a 5", "Mais de 5"] },
    { id: "formato", nome: "Onde o cliente vai ler", multi: false, tipo: "opcoes",
      opcoes: ["Impresso / PDF em A4", "No celular (vertical)"] }
  ];

  G._propModAgente = function () {
    var campos = G.PROPMOD_ROTEIRO.map(function (q) {
      var id = "pmr-" + q.id;
      var ctrl;
      if (q.tipo === "opcoes") {
        ctrl = '<select id="' + id + '">' + q.opcoes.map(function (o) {
          return '<option value="' + esc(o) + '">' + esc(o) + "</option>";
        }).join("") + "</select>";
      } else if (q.multi) {
        ctrl = '<textarea id="' + id + '" rows="3" placeholder="' + esc(q.dica || "") + '"></textarea>';
      } else {
        ctrl = '<input id="' + id + '" placeholder="' + esc(q.dica || "") + '">';
      }
      return K.campo(q.nome + (q.obrigatorio ? " *" : ""), ctrl);
    }).join("");

    UI.modal("Montar o modelo com a IA",
      '<p class="muted" style="margin:0 0 10px">Responda o que souber. A IA monta a <b>estrutura</b> do documento — '
      + "quais páginas, em que ordem, com que textos — e depois te entrega a lista do que anexar em cada lugar.</p>"
      + '<div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e;padding:9px;margin-bottom:10px;font-size:12.5px">'
      + "A IA <b>não inventa fato sobre a sua empresa</b>. O que você não escrever aqui aparece no documento como "
      + "<b>[preencher: …]</b>, para você completar — em vez de virar uma afirmação que ninguém fez."
      + "<br>Sem internet ou sem licença da IA, o modelo é montado <b>aqui mesmo</b>, pelas suas respostas: "
      + "você vê a estrutura e confirma antes de qualquer coisa ser criada."
      + "</div>"
      + campos
      + '<p class="muted" style="font-size:12px;margin:8px 0 0">Preço, prazo e forma de pagamento não são perguntados: '
      + "eles vêm do orçamento, prontos, na hora de gerar a proposta.</p>",
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Montar estrutura", classe: "primary", onClick: function () { G._propModAgenteEnviar(); } }]);
  };

  /* =====================================================================
   * MONTAR A ESTRUTURA — a IA quando dá, a regra quando não dá
   *
   * ⚠ O BOTÃO NÃO PODE TERMINAR EM TOAST VERMELHO. Antes, tudo dependia do
   *   servidor de IA: sem licença ativa, sem internet, ou com a rota fora do
   *   ar, o usuário respondia oito perguntas e recebia "não consegui falar
   *   com a IA" — sem modelo nenhum. Agora o roteiro SEMPRE vira um modelo:
   *   `PropTpl.montarDoRoteiro` monta a mesma estrutura por regra, aqui
   *   dentro, com as palavras que a pessoa acabou de escrever. A IA, quando
   *   responde, entra por cima — ela costuma escrever textos melhores.
   *
   * ⚠ E NADA É GRAVADO SEM O USUÁRIO VER. A tela de confirmação diz de onde
   *   veio a estrutura (IA ou roteiro), quantas páginas tem e o que a IA
   *   devolveu que este sistema não sabe desenhar. Modelo que aparece pronto
   *   na lista, sem ninguém aprovar, é modelo que ninguém confere.
   * =================================================================== */
  var AG_TIMEOUT = 60000;

  G._propModAgenteEnviar = function () {
    var roteiro = {}, faltam = [];
    G.PROPMOD_ROTEIRO.forEach(function (q) {
      var el = document.getElementById("pmr-" + q.id);
      var v = el ? String(el.value || "").trim() : "";
      if (q.obrigatorio && !v) faltam.push(q.nome);
      if (v) roteiro[q.id] = v;
    });
    if (faltam.length) { UI.toast("Falta responder: " + faltam.join(" · "), "erro"); return; }

    /* a base garantida sai ANTES da rede: se a IA não vier, já está pronta */
    var local;
    try { local = T.montarDoRoteiro(roteiro); }
    catch (e) { UI.toast("Não consegui montar a estrutura: " + (e && e.message ? e.message : e), "erro"); return; }

    var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
    /* ⚠ CARIMBO DE TURNO, como no Escopo IA: a chamada leva dezenas de
       segundos e o app continua navegável. Sem isto, a resposta de um pedido
       antigo criaria um modelo depois que o usuário já pediu outro. */
    var meuTurno = (G._pmAgReq = (G._pmAgReq || 0) + 1);
    UI.fecharModal();
    UI.toast("Montando a estrutura do seu modelo…", "ok");

    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var expirou = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, AG_TIMEOUT);

    fetch(back + "/ia/modelo-proposta", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") },
      body: JSON.stringify({ roteiro: roteiro }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
        /* 403 é a resposta do servidor para quem não ativou a licença — dizer
           "erro de rede" mandaria a pessoa procurar defeito na internet dela */
        if (r.status === 403 || r.status === 401) return { __motivo: "a IA é do plano licenciado" };
        if (!r.ok) return { __motivo: "o servidor da IA respondeu " + r.status };
        return r.json()["catch"](function () { return { __motivo: "a resposta da IA não era JSON" }; });
      })
      .then(function (j) {
        clearTimeout(expirou);
        if (meuTurno !== G._pmAgReq) return;             /* pedido velho: some calado */
        if (j && j.__motivo) { G._propModAgenteConfirmar(local, "roteiro", { motivo: j.__motivo }); return; }
        if (!j || !j.ok || !j.resultado) {
          G._propModAgenteConfirmar(local, "roteiro", { motivo: j && j.error ? j.error : "a IA não devolveu uma estrutura" });
          return;
        }
        var v = T.doAgente(j.resultado);
        if (!v.ok) { G._propModAgenteConfirmar(local, "roteiro", { motivo: "a estrutura da IA não passou na conferência (" + v.erro + ")" }); return; }
        G._propModAgenteConfirmar(v.modelo, "ia", { descartadas: v.descartadas, costurou: v.investimentoCosturado });
      })
      ["catch"](function (e) {
        clearTimeout(expirou);
        if (meuTurno !== G._pmAgReq) return;
        var m = (e && e.name === "AbortError") ? "a IA passou de " + Math.round(AG_TIMEOUT / 1000) + " segundos sem responder"
              : "não consegui falar com a IA" + (e && e.message ? " (" + e.message + ")" : "");
        G._propModAgenteConfirmar(local, "roteiro", { motivo: m });
      });
  };

  /* a conferência antes de gravar: o que vai ser criado e de onde veio */
  G._propModAgenteConfirmar = function (m, origem, info) {
    info = info || {};
    var linhas = m.paginas.map(function (p, i) {
      var b = T.bloco(p.tipo);
      var tit = txt(p.titulo) || txt(p.frase) || (b ? b.nome : p.tipo);
      return "<li><b>" + esc(tit) + '</b> <span class="muted">· ' + esc(b ? b.nome : p.tipo) + "</span></li>";
    }).join("");

    var cabeca = (origem === "ia")
      ? '<div class="card" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46;padding:9px;font-size:12.5px">A <b>IA</b> montou esta estrutura a partir das suas respostas.</div>'
      : '<div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e;padding:9px;font-size:12.5px">'
        + "Montei a estrutura <b>aqui no seu computador</b>, pelas suas respostas — "
        + (info.motivo ? esc(info.motivo) : "a IA não respondeu") + ". "
        + "O documento sai completo do mesmo jeito; os textos ficam mais secos que os da IA, e você ajusta na aba Páginas.</div>";

    var extras = "";
    if (info.descartadas && info.descartadas.length) {
      extras += '<p class="muted" style="font-size:12px;margin:8px 0 0">A IA propôs ' + info.descartadas.length
        + " página(s) que este sistema não sabe desenhar (" + esc(info.descartadas.join(", ")) + "). Foram deixadas de fora.</p>";
    }
    if (info.costurou) {
      extras += '<p class="muted" style="font-size:12px;margin:6px 0 0">A página de <b>Investimento</b> foi acrescentada: é ela que leva os preços do orçamento.</p>';
    }

    UI.modal("Confere a estrutura antes de criar",
      cabeca
      + '<p style="margin:10px 0 4px"><b>' + esc(m.nome) + "</b> · " + m.paginas.length + " páginas · "
      + (m.estilo.formato === "vertical" ? "vertical (celular)" : "A4") + "</p>"
      + '<ol style="margin:0 0 0 18px;font-size:13px;line-height:1.7">' + linhas + "</ol>"
      + extras
      + '<p class="muted" style="font-size:12px;margin-top:10px">Nada é gravado até você criar. Depois, tudo é editável: '
      + "textos na aba <b>Páginas</b>, fotos na aba <b>Fotos</b>, cores e logo em <b>Cor e letra</b>.</p>",
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Criar modelo", classe: "primary", onClick: function () { UI.fecharModal(); G._propModAgenteAplicar(m); } }]);
  };

  /* grava o modelo e abre a LISTA DO QUE ANEXAR */
  G._propModAgenteAplicar = function (m) {
    var usados = lista().map(function (x) { return T.modelo(x).nome; });
    var novo = T.modelo(m);
    novo.nome = T.nomeLivre(novo.nome, usados);
    novo.id = "";
    var faltas = T.validar(novo);
    if (faltas.length) { UI.toast(faltas[0], "erro"); return; }
    var salvo = gravar(novo);
    if (!salvo) { UI.toast("Não consegui gravar o modelo (armazenamento cheio?).", "erro"); return; }

    G._propModId = salvo.id;
    App.render();
    G._propModAnexos(salvo.id, []);
  };

  /* =====================================================================
   * "ANEXE CADA COISA NO SEU LUGAR"
   *
   * ⚠ A LISTA É MONTADA DO MODELO, NÃO DA RESPOSTA DA IA. `T.slots` sabe
   *   exatamente quantas fotos cada página pede e quais ainda estão vazias —
   *   a IA pode esquecer de listar uma. Contar o que o documento REALMENTE
   *   precisa é a única fonte que não mente.
   * =================================================================== */
  G._propModAnexos = function (id, pendenciasIA) {
    var raw = obter(id); if (!raw) return;
    var m = T.modelo(raw);
    var sl = T.slots(m) || [];
    /* mesma régua do `PropTpl.avisos`: slot que a página não desenha (a foto da
       equipe desligada no Contato) não é pendência, e página cheia com o
       ornamento ligado sai com o fundo da marca em vez de buraco */
    var CHEIA = { capa: 1, sobre: 1, encerramento: 1 };
    var comFundo = m.estilo.ornamento === "curvas";
    var vazios = sl.filter(function (s) { return !s.ref && s.desenha && !(comFundo && CHEIA[s.paginaTipo]); });

    /* os marcadores [preencher: ...] que sobraram nos textos */
    var marcadores = [];
    m.paginas.forEach(function (p) {
      Object.keys(p).forEach(function (k) {
        var v = p[k];
        if (typeof v !== "string") return;
        var re = /\[preencher:([^\]]*)\]/g, mm;
        while ((mm = re.exec(v))) marcadores.push({ pagina: p.tipo, oque: String(mm[1] || "").trim() });
      });
    });

    var linhas = "";
    vazios.forEach(function (s) {
      linhas += '<li><b>Foto</b> — ' + esc(s.onde || ("imagem " + s.numero)) + "</li>";
    });
    marcadores.forEach(function (x) {
      linhas += "<li><b>Texto</b> — " + esc(x.oque || "completar") + ' <span class="muted">(página ' + esc(x.pagina) + ")</span></li>";
    });
    (pendenciasIA || []).forEach(function (x) {
      var o = String((x && x.oque) || "").trim();
      if (!o) return;
      if (/foto|imagem|logo/i.test(o) || marcadores.length) return;   /* já contados acima */
      linhas += "<li>" + esc(o) + (x.onde ? ' <span class="muted">(' + esc(x.onde) + ")</span>" : "") + "</li>";
    });

    var temLogo = false;
    try { temLogo = !!(typeof Empresa !== "undefined" && Empresa.logo && Empresa.logo()); } catch (e) {}
    if (!temLogo) linhas += '<li><b>Logo da empresa</b> — em ⚙ Empresa; sem ele a capa sai com [LOGO]</li>';

    UI.modal("Estrutura pronta — agora anexe cada coisa",
      '<p>O modelo <b>' + esc(m.nome) + "</b> foi criado com <b>" + m.paginas.length + "</b> páginas.</p>"
      + (linhas
          ? '<p class="muted" style="margin:8px 0 4px">Falta isto para ele ficar completo:</p>'
            + '<ul style="margin:0 0 0 18px;font-size:13px;line-height:1.7">' + linhas + "</ul>"
          : '<p class="muted">Não falta nada: todas as fotos já estão no lugar e nenhum texto ficou pendente.</p>')
      + '<p class="muted" style="font-size:12.5px;margin-top:10px">As fotos ficam na aba <b>Fotos</b> do modelo; '
      + "os textos, na aba <b>Páginas</b>. A <b>Prévia</b> mostra como está ficando.</p>",
      [{ texto: "Ver o modelo", classe: "primary", onClick: function () { UI.fecharModal(); G._propModAbrir(id); } }]);
  };

  /* =====================================================================
   * ENVIAR O LOGO DO MODELO
   *
   * ⚠ ELE MORA NO REGISTRO, e o registro mora no localStorage: um PNG de
   *   3 MB arrastado para cá derrubaria a gravação da conta inteira com a
   *   cota estourada. Por isso a imagem é REDESENHADA num canvas com largura
   *   máxima antes de virar data URI, e há um teto duro no fim.
   * ⚠ SVG entra pelo seletor e sai PNG: o motor não aceita SVG em data URI
   *   (é documento, pode trazer script) — mas o navegador sabe rasterizá-lo,
   *   e recusar o formato em que metade das marcas está seria empurrar o
   *   usuário para o "[LOGO]" da capa.
   * =================================================================== */
  var LOGO_LARGURA = 900;      /* ~46 mm impressos a 300 dpi, com folga */
  var LOGO_TETO = 260 * 1024;  /* data URI final; acima disso a conta sofre */

  G._propModLogoEnviar = function () {
    var id = G._propModId;
    if (!obter(id)) { UI.toast("Abra um modelo primeiro.", "erro"); return; }
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onerror = function () { UI.toast("Não consegui ler a imagem.", "erro"); };
      fr.onload = function () { G._propModLogoAplicar(id, String(fr.result)); };
      fr.readAsDataURL(f);
    };
    inp.click();
  };

  G._propModLogoAplicar = function (id, dataURL) {
    var img = new Image();
    img.onerror = function () { UI.toast("Este arquivo não abriu como imagem.", "erro"); };
    img.onload = function () {
      /* SVG sem width/height chega com dimensão 0: o canvas sairia vazio */
      var lw = img.naturalWidth || img.width || LOGO_LARGURA;
      var lh = img.naturalHeight || img.height || Math.round(LOGO_LARGURA / 3);
      function render(maxW) {
        var esc2 = Math.min(1, maxW / lw);
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(lw * esc2));
        cv.height = Math.max(1, Math.round(lh * esc2));
        var ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        return cv.toDataURL("image/png");
      }
      var out = "";
      try { out = render(LOGO_LARGURA); } catch (e) { UI.toast("Não consegui converter a imagem: " + (e.message || e), "erro"); return; }
      if (out.length > LOGO_TETO) { try { out = render(500); } catch (e2) {} }
      if (!T.logoValido(out)) { UI.toast("A conversão do logo falhou neste navegador.", "erro"); return; }
      if (out.length > LOGO_TETO) {
        UI.toast("Este logo ficou grande demais (" + Math.round(out.length / 1024) + " KB) mesmo reduzido. "
          + "Use uma imagem com menos detalhe ou fundo transparente.", "erro");
        return;
      }
      var r = obter(id); if (!r) return;
      r.logo = out;
      if (!gravar(r)) { UI.toast("Não consegui gravar (armazenamento cheio?).", "erro"); return; }
      G._propModRender();
      UI.toast("Logo deste modelo atualizado (" + Math.round(out.length / 1024) + " KB).", "ok");
    };
    img.src = dataURL;
  };

  /* =====================================================================
   * CORTAR A IMAGEM — escolher o que fica, em vez de aceitar o centro
   *
   * ⚠ O PROBLEMA QUE ISTO RESOLVE. O documento desenha toda foto com
   *   `object-fit:cover`: o navegador corta o que sobra, sempre pelo CENTRO.
   *   Uma fachada com o prédio à esquerda entra na capa com o prédio pela
   *   metade, e não havia nada que o usuário pudesse fazer além de abrir a
   *   foto em outro programa — que é exatamente o que este módulo existe para
   *   evitar.
   *
   * ⚠ MOLDURA FIXA, IMAGEM QUE SE MOVE. O contrário (retângulo livre que o
   *   usuário arrasta) parece mais liberdade e entrega corte na proporção
   *   errada: o documento corta DE NOVO por cima, e o enquadramento escolhido
   *   se perde. Aqui a moldura já tem a proporção da caixa onde a foto vai
   *   ser desenhada — o que se vê é o que sai.
   *
   * ⚠ E A ORIGINAL É GUARDADA. Cortar de novo parte SEMPRE da original; sem
   *   isso, cada ajuste comeria mais um pedaço da foto, sem volta.
   * =================================================================== */
  var CORTE_LADO = 2400;          /* o maior lado do resultado, como o upload */

  G._propModCortar = function (numero) {
    var raw = obter(this._propModId); if (!raw) return;
    var m = T.modelo(raw);
    var sl = (T.slots(m) || []).filter(function (s) { return String(s.numero) === String(numero); })[0];
    if (!sl) { UI.toast("Slot não encontrado.", "erro"); return; }
    var fonte = sl.original || sl.ref;
    if (!fonte) { UI.toast("Escolha uma imagem para este lugar antes de cortar.", "erro"); return; }
    if (typeof Fotos === "undefined") { UI.toast("O guardador de fotos não carregou.", "erro"); return; }

    var prop = Number(sl.proporcao) || 1;
    UI.toast("Abrindo a imagem…", "ok");
    Promise.resolve(Fotos.dataURI(fonte)).then(function (d) {
      if (!d) { UI.toast("Não consegui ler a imagem original.", "erro"); return; }
      G._propModCorteAbrir(numero, d, prop, sl.onde);
    })["catch"](function () { UI.toast("Não consegui ler a imagem original.", "erro"); });
  };

  G._propModCorteAbrir = function (numero, dataURI, prop, onde) {
    var LARG = 520;                       /* largura da moldura na tela */
    var alt = Math.round(LARG / prop);
    /* moldura muito alta não cabe no modal: reduz mantendo a proporção */
    if (alt > 420) { alt = 420; LARG = Math.round(alt * prop); }

    UI.modal("Cortar a imagem — " + esc(onde || ""),
      '<p class="muted" style="margin:0 0 8px">Arraste a foto para escolher o que aparece, e use o controle para aproximar. '
      + "<b>O que estiver dentro da moldura é o que sai no documento.</b></p>"
      + '<div id="pmc-palco" style="position:relative;width:' + LARG + "px;height:" + alt + "px;margin:0 auto;"
      + 'overflow:hidden;background:#111;border-radius:6px;cursor:grab;touch-action:none">'
      + '<img id="pmc-img" src="' + esc(dataURI) + '" style="position:absolute;transform-origin:0 0;user-select:none;pointer-events:none">'
      + "</div>"
      + '<div class="flex" style="gap:10px;align-items:center;margin-top:10px">'
      + '<span class="muted" style="font-size:12px">Aproximar</span>'
      + '<input type="range" id="pmc-zoom" min="100" max="400" step="1" value="100" style="flex:1">'
      + '<button class="btn sm ghost" id="pmc-centro">Centralizar</button></div>'
      + '<p class="muted" style="font-size:12px;margin:8px 0 0">A imagem original fica guardada: você pode cortar de novo quando quiser, '
      + "sem perder qualidade.</p>",
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Cortar e usar", classe: "primary", onClick: function () { G._propModCorteAplicar(numero); } }]);

    var palco = document.getElementById("pmc-palco");
    var img = document.getElementById("pmc-img");
    var zoom = document.getElementById("pmc-zoom");
    var st = G._pmCorte = { x: 0, y: 0, z: 1, base: 1, natW: 0, natH: 0, palcoW: LARG, palcoH: alt, numero: numero };

    function limitar() {
      var w = st.natW * st.base * st.z, h = st.natH * st.base * st.z;
      /* ⚠ a moldura NUNCA pode ficar com faixa vazia: a foto sempre a cobre */
      if (st.x > 0) st.x = 0;
      if (st.y > 0) st.y = 0;
      if (st.x < st.palcoW - w) st.x = st.palcoW - w;
      if (st.y < st.palcoH - h) st.y = st.palcoH - h;
    }
    function pintar() {
      limitar();
      img.style.transform = "translate(" + st.x + "px," + st.y + "px) scale(" + (st.base * st.z) + ")";
    }
    function centralizar() {
      var w = st.natW * st.base * st.z, h = st.natH * st.base * st.z;
      st.x = (st.palcoW - w) / 2; st.y = (st.palcoH - h) / 2;
      pintar();
    }
    img.onload = function () {
      st.natW = img.naturalWidth; st.natH = img.naturalHeight;
      /* base = a menor escala que ainda COBRE a moldura (o mesmo que o cover) */
      st.base = Math.max(st.palcoW / st.natW, st.palcoH / st.natH);
      img.style.width = st.natW + "px"; img.style.height = st.natH + "px";
      centralizar();
    };
    if (img.complete && img.naturalWidth) img.onload();

    var arrastando = false, px = 0, py = 0;
    palco.addEventListener("pointerdown", function (e) {
      arrastando = true; px = e.clientX; py = e.clientY;
      palco.style.cursor = "grabbing";
      try { palco.setPointerCapture(e.pointerId); } catch (x) {}
    });
    palco.addEventListener("pointermove", function (e) {
      if (!arrastando) return;
      st.x += e.clientX - px; st.y += e.clientY - py;
      px = e.clientX; py = e.clientY;
      pintar();
    });
    function soltar() { arrastando = false; palco.style.cursor = "grab"; }
    palco.addEventListener("pointerup", soltar);
    palco.addEventListener("pointercancel", soltar);

    zoom.addEventListener("input", function () {
      var antes = st.z;
      st.z = Number(zoom.value) / 100;
      /* aproxima pelo CENTRO da moldura, não pelo canto: aproximar e ver a
         foto fugir para o canto é o gesto que ninguém entende */
      var cx = st.palcoW / 2, cy = st.palcoH / 2;
      st.x = cx - (cx - st.x) * (st.z / antes);
      st.y = cy - (cy - st.y) * (st.z / antes);
      pintar();
    });
    document.getElementById("pmc-centro").onclick = function () { centralizar(); };
  };

  G._propModCorteAplicar = function (numero) {
    var st = G._pmCorte;
    var img = document.getElementById("pmc-img");
    if (!st || !img || !st.natW) { UI.toast("A imagem ainda não carregou.", "erro"); return; }

    /* do que está na tela para pixels da ORIGINAL */
    var escala = st.base * st.z;
    var sx = -st.x / escala, sy = -st.y / escala;
    var sw = st.palcoW / escala, sh = st.palcoH / escala;
    sx = Math.max(0, Math.min(st.natW - 1, sx));
    sy = Math.max(0, Math.min(st.natH - 1, sy));
    sw = Math.max(1, Math.min(st.natW - sx, sw));
    sh = Math.max(1, Math.min(st.natH - sy, sh));

    /* o resultado sai na proporção da moldura, no maior lado que valha a pena */
    var razao = sw / sh;
    var dw = sw, dh = sh;
    if (Math.max(dw, dh) > CORTE_LADO) {
      if (dw >= dh) { dw = CORTE_LADO; dh = Math.round(CORTE_LADO / razao); }
      else { dh = CORTE_LADO; dw = Math.round(CORTE_LADO * razao); }
    }
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(dw)); cv.height = Math.max(1, Math.round(dh));
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    var saida;
    try { saida = cv.toDataURL("image/jpeg", 0.92); }
    catch (e) { UI.toast("Não consegui cortar esta imagem.", "erro"); return; }

    var self = G, id = self._propModId;
    UI.fecharModal();
    UI.toast("Guardando o corte…", "ok");
    Fotos.guardar(saida, "Modelo de proposta (cortada)", { larguraMax: CORTE_LADO, qualidade: 0.92 })
      .then(function (ref) {
        var r = obter(id); if (!r) return;
        var m = T.modelo(r);
        /* ⚠ a ORIGINAL só é gravada na PRIMEIRA vez: da segunda em diante ela
           já está lá, e sobrescrever com a cortada faria o próximo corte
           partir do corte anterior. */
        var orig = r.imagensOrig || {};
        if (!orig[String(numero)]) orig[String(numero)] = m.imagens[String(numero)] || null;
        var imgs = r.imagens || {};
        imgs[String(numero)] = ref;
        r.imagens = imgs; r.imagensOrig = orig;
        if (!gravar(r)) { UI.toast("Não consegui gravar (armazenamento cheio?).", "erro"); return; }
        self._propModRender();
        UI.toast("Imagem " + numero + " cortada.", "ok");
      })["catch"](function () { UI.toast("Não consegui guardar a imagem cortada.", "erro"); });
  };

  /* volta para a foto como ela veio, sem precisar subir de novo */
  G._propModCorteDesfazer = function (numero) {
    var r = obter(this._propModId); if (!r) return;
    var orig = (r.imagensOrig || {})[String(numero)];
    if (!orig) { UI.toast("Esta imagem não foi cortada.", "erro"); return; }
    var imgs = r.imagens || {};
    imgs[String(numero)] = orig;
    var oo = r.imagensOrig || {};
    delete oo[String(numero)];
    r.imagens = imgs; r.imagensOrig = oo;
    if (!gravar(r)) { UI.toast("Não consegui gravar.", "erro"); return; }
    this._propModRender();
    UI.toast("Imagem " + numero + " voltou ao original.", "ok");
  };

  /* =====================================================================
   * LINHAS E SÍMBOLOS DA PÁGINA
   *
   * ⚠ FECHADO, e ao lado da tipografia: são os dois painéis de acabamento, e
   *   quem procura um procura o outro. Abertos por padrão, empurrariam para
   *   baixo os campos de texto que todo mundo usa.
   * =================================================================== */
  /* ⚠ O PAINEL SE APAGA NA PAGINA QUE NAO SABE DESENHAR AQUILO. Regua so
     existe em 5 das 9 paginas, e lista com marcador em uma so. Mostrar os
     quatro controles em toda pagina seria mexer e nao acontecer nada — e uma
     tela que faz isso ensina a pessoa a desconfiar do resto dela. Quem manda
     e `PropTpl.FORMAS_DO_BLOCO`, que o teste confere contra o HTML de verdade. */
  G._propModFormas = function (p) {
    var pode = T.formasDoBloco(p.tipo);
    if (!pode.regua && !pode.marcador) return "";

    var f = T.formas(p.formas);
    var pid = esc(p.id);
    function sel(campo, atual, lista) {
      return '<select data-pmf="' + pid + '" data-fcampo="' + campo + '">'
        + lista.map(function (o) {
            return '<option value="' + esc(o.id) + '"' + (o.id === atual ? " selected" : "") + ">"
              + esc(o.nome) + "</option>";
          }).join("") + "</select>";
    }

    var corpo = "";
    if (pode.regua) {
      corpo += '<div class="row" style="margin-top:8px">'
        + K.campo("Linha sob o título", sel("regua", f.regua, T.REGUAS))
        + K.campo("Largura da linha", sel("reguaLargura", f.reguaLargura, T.LARGURAS_REGUA))
        + "</div>"
        + '<div class="row">'
        + K.campo("Cor da linha", sel("reguaCor", f.reguaCor, T.CORES_ELEMENTO))
        + (pode.marcador ? K.campo("Marcador dos itens da lista", sel("marcador", f.marcador, T.MARCADORES)) : "")
        + "</div>";
    } else if (pode.marcador) {
      corpo += '<div class="row" style="margin-top:8px">'
        + K.campo("Marcador dos itens da lista", sel("marcador", f.marcador, T.MARCADORES))
        + "</div>";
    }
    if (pode.marcador) {
      corpo += '<p class="muted" style="font-size:11.5px;margin:6px 0 0">O marcador vale para a lista do escopo. '
        + "Numa proposta, <b>✓</b> diz que aquilo está incluído — a bolinha não diz nada.</p>";
    }

    return '<details style="margin-top:6px">'
      + '<summary class="muted" style="cursor:pointer;font-size:12.5px">'
      + (pode.marcador ? "Linhas e símbolos desta página" : "Linha do título desta página")
      + "</summary>" + corpo + "</details>";
  };

  G._propModWire = function () {
    var self = this;
    var cx = document.getElementById("propmod-editor"); if (!cx) return;
    var raw = obter(this._propModId); if (!raw) return;
    var m = T.modelo(raw);

    /* tipografia da página: grava na hora, e o número ao lado acompanha */
    var tcs = cx.querySelectorAll("[data-pmt]");
    for (var q = 0; q < tcs.length; q++) {
      (function (el) {
        var evento = (el.type === "range") ? "input" : "change";
        el.addEventListener(evento, function () {
          var pg = el.getAttribute("data-pmt"), campo = el.getAttribute("data-tcampo");
          var valor = (el.type === "checkbox") ? el.checked
            : (el.type === "range" ? Number(el.value) : el.value);
          var eco = cx.querySelector('[data-tval="' + pg + ":" + campo + '"]');
          if (eco) eco.textContent = valor + (campo === "espacoLetra" ? "" : "%");
          var r = obter(self._propModId); if (!r) return;
          var mm = T.modelo(r);
          mm.paginas.forEach(function (pp) {
            if (pp.id !== pg) return;
            pp.tipografia = pp.tipografia || {};
            pp.tipografia[campo] = valor;
          });
          r.paginas = mm.paginas;
          /* ⚠ SEM `_propModRender()` aqui: o slider perde o foco no meio do
             arrasto e o gesto morre na primeira mexida. Só a prévia repinta. */
          if (!gravar(r)) { UI.toast("Não consegui gravar.", "erro"); return; }
          if (self._propModAba === "previa") self._propModRender();
        });
      })(tcs[q]);
    }

    /* linhas e símbolos: gravam na hora, e a prévia acompanha */
    var fcs = cx.querySelectorAll("[data-pmf]");
    for (var w = 0; w < fcs.length; w++) {
      (function (el) {
        el.addEventListener("change", function () {
          var pg = el.getAttribute("data-pmf"), campo = el.getAttribute("data-fcampo");
          var r = obter(self._propModId); if (!r) return;
          var mm = T.modelo(r);
          mm.paginas.forEach(function (pp) {
            if (pp.id !== pg) return;
            pp.formas = pp.formas || {};
            pp.formas[campo] = el.value;
          });
          r.paginas = mm.paginas;
          if (!gravar(r)) { UI.toast("Não consegui gravar.", "erro"); return; }
          if (self._propModAba === "previa") self._propModRender();
        });
      })(fcs[w]);
    }

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
    /* =================================================================
     * AS FONTES TEM DE VIAJAR PARA A JANELA DO DOCUMENTO
     *
     * ⚠ A janela nova nasce vazia: ela recebia SO o `T.css()`. Enquanto as
     *   famílias eram font-stack do sistema ("Georgia, Times New Roman…")
     *   isso funcionava por acidente — o sistema operacional já tinha as
     *   fontes. Com família embutida (`css/fontes.css`, base64), a folha não
     *   chega na janela e o documento cai numa fonte genérica: o seletor de
     *   fonte passaria a MENTIR, e o usuário só descobriria com a proposta
     *   impressa na mão.
     *
     * ⚠ URL ABSOLUTA, montada a partir da página. `window.open("")` herda a
     *   origem, mas o caminho relativo de um documento `about:blank` é frágil
     *   quando o app é servido de uma subpasta.
     * =============================================================== */
    var urlFontes = "";
    try { urlFontes = new URL("css/fontes.css", location.href).href; } catch (eU) { urlFontes = "css/fontes.css"; }

    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
      + "<title>" + esc(txt(dados && dados.tituloDoc) || "Proposta") + "</title>"
      + '<link rel="stylesheet" href="' + urlFontes + '">'
      + "<style>body{margin:0}" + T.css(m.estilo.formato) + "</style></head><body>" + html + "</body></html>");
    w.document.close();

    /* ⚠ IMPRIMIR ANTES DA FONTE CARREGAR SAI NA FONTE ERRADA, e o usuário não
       tem como saber por quê. `document.fonts.ready` resolve quando as faces
       usadas estão prontas; o tempo fixo continua como rede de segurança para
       navegador que não tenha a API. */
    var mandarImprimir = function () { try { w.focus(); w.print(); } catch (e) {} };
    var jaFoi = false;
    var uma = function () { if (jaFoi) return; jaFoi = true; mandarImprimir(); };
    try {
      if (w.document.fonts && w.document.fonts.ready && w.document.fonts.ready.then) {
        w.document.fonts.ready.then(function () { setTimeout(uma, 120); });
      }
    } catch (eF) {}
    setTimeout(uma, 1200);
    return true;
  };

  /* ===================================================================
   * AÇÕES
   * =================================================================== */
  G.registrarAcoes("propmodelos", {
    /* =================================================================
     * LEVAR — o modelo vira arquivo, com as fotos dentro
     *
     * ⚠ AS FOTOS SÃO RESOLVIDAS ANTES. No registro elas são referência para
     *   o guardador de fotos DESTA conta; do outro lado essa referência não
     *   aponta para nada. `_propModImagens` já sabe transformá-las em data
     *   URI — é a mesma função que a impressão usa.
     *
     * ⚠ E O QUE NÃO RESOLVEU É DITO. Foto que ficou só no servidor e não
     *   voltou vira slot vazio na outra ponta; avisar depois de baixar o
     *   arquivo não é avisar.
     * =============================================================== */
    "propmod-exportar": function () {
      var self = G;
      var raw = obter(self._propModId);
      if (!raw) { UI.toast("Abra um modelo primeiro.", "erro"); return; }
      var m = T.modelo(raw);
      var faltas = T.validar(m);
      if (faltas.length) { UI.toast(faltas[0], "erro"); return; }

      UI.toast("Preparando o arquivo…", "ok");
      self._propModImagens(m, function (imgs) {
        var resolvidas = {};
        Object.keys(imgs || {}).forEach(function (k) {
          if (imgs[k] && imgs[k].dataURI) resolvidas[k] = imgs[k].dataURI;
        });
        var arq = T.paraArquivo(m, resolvidas);
        arq.exportadoEm = Util.agoraISO();

        var sl = T.slots(m) || [];
        var comRef = sl.filter(function (s) { return !!s.ref; }).length;
        var foram = Object.keys(arq.imagens).length;

        var texto = JSON.stringify(arq, null, 2);
        var blob = new Blob([texto], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "modelo-de-proposta-" + String(m.nome).replace(/[^\w\-]+/g, "-").toLowerCase() + ".json";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);

        var tam = Math.round(texto.length / 1024);
        if (foram < comRef) {
          UI.toast("Arquivo salvo (" + tam + " KB), mas " + (comRef - foram) + " de " + comRef
            + " foto(s) não pôde(ram) ser lida(s) — elas vão faltar na outra conta.", "aviso");
        } else {
          UI.toast("Modelo salvo em arquivo (" + tam + " KB, " + foram + " foto(s) dentro).", "ok");
        }
      });
    },

    /* =================================================================
     * TRAZER — o arquivo vira um modelo NOVO desta conta
     *
     * ⚠ NUNCA SOBRESCREVE. O modelo importado nasce com id próprio e nome
     *   livre: trazer o desenho de alguém não pode apagar o que a empresa já
     *   montou, e um "id igual" é justamente o caso em que isso aconteceria
     *   sem ninguém ver.
     * =============================================================== */
    "propmod-logo": function () { G._propModLogoEnviar(); },
    "propmod-logo-remover": function () {
      var r = obter(G._propModId); if (!r) return;
      delete r.logo;
      if (!gravar(r)) { UI.toast("Não consegui gravar.", "erro"); return; }
      G._propModRender();
      UI.toast("Este modelo voltou a usar o logo de ⚙ Empresa.", "ok");
    },

    "propmod-cortar": function (ds) { G._propModCortar(ds.n); },
    "propmod-corte-desfazer": function (ds) { G._propModCorteDesfazer(ds.n); },

    "propmod-agente": function () { G._propModAgente(); },

    "propmod-importar": function () {
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json,application/json";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onerror = function () { UI.toast("Não consegui ler o arquivo.", "erro"); };
        fr.onload = function () {
          var obj;
          try { obj = JSON.parse(String(fr.result)); }
          catch (e) { UI.toast("Esse arquivo não é um .json válido.", "erro"); return; }
          var r = T.doArquivo(obj);
          if (!r.ok) { UI.toast(r.erro, "erro"); return; }
          G._propModConfirmarImport(r);
        };
        fr.readAsText(f);
      };
      inp.click();
    },

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
      ["corTitulo", "corTexto", "corDestaque", "corDestaque2", "corFundoEscuro"].forEach(function (k) {
        var el = document.getElementById("pme-" + k);
        if (el && el.value) e[k] = el.value;
      });
      var fm = K.v("pme-formato"); if (fm) e.formato = fm;
      var tx = document.getElementById("pme-textura"); e.textura = tx ? tx.value : e.textura;
      ["ornamento", "rodape", "fundoInternas", "logoEscuro"].forEach(function (k) {
        var sel = document.getElementById("pme-" + k);
        if (sel) e[k] = sel.value;
      });
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

  /* mostra o que veio no arquivo e só grava depois do "Trazer" */
  G._propModConfirmarImport = function (r) {
    var usados = lista().map(function (x) { return T.modelo(x).nome; });
    var nome = T.nomeLivre(r.modelo.nome, usados);
    var semFoto = r.nSlots - r.nFotos;

    UI.modal("Trazer este modelo?",
      '<div class="card" style="padding:10px 12px"><b>' + esc(nome) + "</b>"
      + (r.modelo.descricao ? '<div class="muted" style="font-size:12.5px">' + esc(r.modelo.descricao) + "</div>" : "")
      + '<div class="muted" style="font-size:12.5px;margin-top:4px">' + r.modelo.paginas.length + " página(s) · "
      + r.nFotos + " de " + r.nSlots + " foto(s)"
      + (r.temLogo ? " · com o <b>logo</b> dentro" : "") + "</div></div>"
      + (nome !== r.modelo.nome
          ? '<p class="muted" style="font-size:12.5px;margin-top:8px">Já existe um modelo chamado "'
            + esc(r.modelo.nome) + '", então este entra como "' + esc(nome) + '". Nada do que você tem é alterado.</p>'
          : '<p class="muted" style="font-size:12.5px;margin-top:8px">Ele entra como um modelo novo — nada do que você tem é alterado.</p>')
      + (semFoto > 0
          ? '<div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e;padding:9px;margin-top:8px;font-size:12.5px">'
            + semFoto + " slot(s) de foto vêm vazios neste arquivo. Você escolhe as imagens depois, na aba Fotos.</div>"
          : ""),
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Trazer modelo", classe: "primary", onClick: function () {
           UI.fecharModal();
           G._propModGravarImport(r, nome);
       } }]);
  };

  /* grava o modelo e RECOLOCA as fotos no guardador desta conta */
  G._propModGravarImport = function (r, nome) {
    var novo = T.modelo({
      nome: nome, descricao: r.modelo.descricao,
      estilo: r.modelo.estilo, paginas: r.modelo.paginas,
      /* ⚠ O LOGO ENTRA JUNTO. Ele é o único conteúdo visual que viaja DENTRO
         do arquivo (as fotos vão à parte, para o IndexedDB): esquecê-lo aqui
         faz o modelo importado desenhar [LOGO] na capa mesmo com o arquivo
         trazendo a marca — e o dono da conta que recebeu não tem como saber
         que o logo veio e foi descartado na porta. */
      logo: r.modelo.logo
      /* sem paraCliente e sem padrao, de propósito — ver PropTpl.paraArquivo */
    });
    novo.id = "";                    /* o Store cunha o id — nunca reaproveita o da origem */

    var chaves = Object.keys(r.imagens || {});
    if (!chaves.length || typeof Fotos === "undefined") {
      var g0 = gravar(novo);
      if (!g0) { UI.toast("Não consegui gravar (armazenamento cheio?).", "erro"); return; }
      UI.toast('Modelo "' + nome + '" trazido.', "ok");
      /* ⚠ `App.render()`, não `_propModRender`: a importação parte da LISTA,
         onde não há modelo aberto — repintar o editor de um modelo que não
         existe é tela em branco. */
      App.render();
      return;
    }

    UI.toast("Guardando as fotos do modelo…", "ok");
    var imagens = {}, n = 0, falhas = 0;
    chaves.forEach(function (k) {
      Fotos.guardar(r.imagens[k], "Modelo de proposta", { larguraMax: IMG_LARGURA, qualidade: IMG_QUALIDADE })
        .then(function (ref) { imagens[k] = ref; })
        ["catch"](function () { falhas++; })
        .then(function () {
          if (++n < chaves.length) return;
          novo.imagens = imagens;
          if (!gravar(novo)) { UI.toast("Não consegui gravar (armazenamento cheio?).", "erro"); return; }
          /* ⚠ o aviso conta o que REALMENTE entrou: dizer "trazido" com metade
             das fotos perdidas é a mentira educada que este projeto persegue. */
          if (falhas) UI.toast('Modelo "' + nome + '" trazido, mas ' + falhas + " foto(s) não couberam.", "aviso");
          else UI.toast('Modelo "' + nome + '" trazido, com ' + chaves.length + " foto(s).", "ok");
          App.render();
        });
    });
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
