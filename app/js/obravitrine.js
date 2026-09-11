/* =====================================================================
 * obravitrine.js — o palco da lista de Obras
 *
 * O topo da tela de Obras mostra UMA obra em tamanho grande (foto, cliente,
 * contrato, medido, calendário e o último diário) e troca para a obra sobre
 * a qual a pessoa para o mouse. É o gesto das vitrines de streaming, aplicado
 * à pergunta que o engenheiro faz de manhã: "essa obra está andando no ritmo
 * do calendário?".
 *
 * Motor puro: não lê Store e não toca DOM. O AVANÇO chega pronto, calculado
 * por Gestao._avancoMedido — a régua única do engenheiro (Painel, alertas,
 * cartão da obra). Existem seis réguas de avanço nesta base e duas já
 * divergiram com o número errado indo para fora; esta tela NÃO pode virar a
 * sétima. Aqui se decide só o que é da vitrine: prazo, último diário, qual
 * foto vai para o fundo, e o texto honesto de cada caso.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ObraVitrine = {};
  var DIA = 86400000;

  /* Hover intent: o palco só troca depois de o mouse PARAR sobre o card.
     Sem a espera, atravessar a grade a caminho de outro lugar faz o fundo
     piscar uma foto por card — e o efeito vira ruído. */
  ObraVitrine.ESPERA_MS = 280;

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(v) {
    if (global.Util && global.Util.num) return global.Util.num(v);
    var n = Number(v); return isFinite(n) ? n : 0;
  }
  function moeda(n) {
    if (global.Util && global.Util.fmtMoeda) return global.Util.fmtMoeda(n);
    return "R$ " + num(n).toFixed(2).replace(".", ",");
  }
  /* dia sem fuso: "2026-09-09" -> "09/09/2026" montado em partes, pelo mesmo
     motivo do Util.fmtDia — passar por Date lê meia-noite UTC e, em Brasília,
     a tela escreveria o dia anterior */
  function dia(iso) {
    var m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }
  function zero(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function local(iso) {
    var s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  /* ---------------------------------------------------------------
   * PRAZO
   * ⚠ A MESMA CONTA DO PAINEL (Gestao._dashPrazoAvancoDados), de propósito:
   * início e término lidos como meia-noite LOCAL ("T00:00:00", sem Z), %
   * decorrido arredondado e nunca negativo, dias com Math.ceil. Se as duas
   * telas fizessem contas parecidas-mas-não-iguais, a mesma obra sairia com
   * 58% no Painel e 57% aqui — e a pessoa passa a desconfiar das duas.
   * tools/e2e-obras-vitrine.js compara as duas no navegador.
   *
   * A diferença que é de propósito: com término e SEM início o Painel tira a
   * obra da conta (não há como dizer quanto do calendário passou); aqui ainda
   * dá para dizer quantos dias faltam, e é o que se diz — sem a porcentagem.
   * --------------------------------------------------------------- */
  ObraVitrine.prazo = function (inicio, fim, status, hoje) {
    /* obra entregue não tem prazo a cumprir: "vencido há 936 dias" sobre uma
       obra concluída foi exatamente o defeito que o Painel já teve */
    if (status === "concluida") return { tipo: "concluida", dias: null, pct: null, texto: "obra concluída" };
    var f = local(fim);
    if (!f) return { tipo: "sem", dias: null, pct: null, texto: "sem previsão de término" };
    var hj = zero(hoje || new Date());
    var i = local(inicio);
    var dur = i ? (f - i) / DIA : 0;
    var pct = dur > 0 ? Math.max(0, Math.round(((hj - i) / DIA) / dur * 100)) : null;
    var dias = Math.ceil((f - hj) / DIA);
    var texto = dias > 1 ? "faltam " + dias + " dias"
      : dias === 1 ? "falta 1 dia"
      : dias === 0 ? "termina hoje"
      : "vencido há " + (-dias) + (dias === -1 ? " dia" : " dias");
    return { tipo: dias < 0 ? "vencido" : "restam", dias: dias, pct: pct, texto: texto };
  };

  /* ---------------------------------------------------------------
   * MEDIDO — o número vem de Gestao._avancoMedido; aqui só o texto.
   * `pct === null` é a medição POR VALOR (boletim aprovado em R$, sem %, e
   * sem denominador para derivar a porcentagem): a resposta é o dinheiro
   * medido, nunca "0%". E "nenhuma medição aprovada" só é dito quando é
   * verdade — obra com boletim aprovado a 0% não é obra sem boletim.
   * --------------------------------------------------------------- */
  ObraVitrine.avanco = function (pct, medidoValor, aprovadas) {
    var n = num(aprovadas);
    var qtas = n === 1 ? "em 1 medição aprovada" : "em " + n + " medições aprovadas";
    if (pct === null || pct === undefined) {
      return { tipo: "valor", pct: null, texto: moeda(medidoValor), nota: "medido em valor, sem percentual" };
    }
    var p = num(pct);
    if (!n) return { tipo: "nada", pct: 0, texto: "0%", nota: "nenhuma medição aprovada" };
    return { tipo: "pct", pct: p, texto: p + "%", nota: qtas };
  };

  /* ---------------------------------------------------------------
   * DIÁRIOS — um passe só pela lista inteira, e não um filtro por obra a
   * cada card: a tela de quem tem 40 obras e três anos de diário não pode
   * engasgar a cada vez que o mouse passa.
   * --------------------------------------------------------------- */
  function refDeFoto(f) {
    if (!f) return null;
    /* formato antigo: a foto inteira dentro do registro ({ d: dataURI }) —
       Fotos.dataURI sabe ler as duas formas */
    if (typeof f === "string") return /^data:image\//.test(f) ? { d: f } : null;
    return (f.id || f.remoto || f.d) ? f : null;
  }
  ObraVitrine.indiceDiarios = function (rdos) {
    var idx = {};
    (rdos || []).forEach(function (r) {
      if (!r || !r.obraId) return;
      /* ⚠ RASCUNHO NÃO CONTA. É o recado do WhatsApp esperando alguém
         conferir. "Último diário: ontem" em cima de um rascunho afirma que a
         obra foi registrada quando ninguém aprovou nada — e a foto dele pode
         ser a do lugar errado, que é justamente o que a conferência pega. */
      if (r.status === "rascunho") return;
      var d = String(r.data || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var e = idx[r.obraId] || (idx[r.obraId] = { ultimo: "", fotoRef: null, fotoData: "" });
      if (d > e.ultimo) e.ultimo = d;
      var fs = r.fotos || [], ref = null;
      for (var k = 0; k < fs.length && !ref; k++) ref = refDeFoto(fs[k]);
      if (ref && d > e.fotoData) { e.fotoRef = ref; e.fotoData = d; }
    });
    return idx;
  };

  ObraVitrine.diario = function (ent, hoje) {
    if (!ent || !ent.ultimo) return { data: "", dias: null, texto: "Nenhum diário finalizado nesta obra" };
    var dias = Math.round((zero(hoje || new Date()) - local(ent.ultimo)) / DIA);
    var quando = dias === 0 ? "hoje" : dias === 1 ? "ontem" : dias > 1 ? "há " + dias + " dias" : "";
    return { data: ent.ultimo, dias: dias, texto: "Último diário em " + dia(ent.ultimo) + (quando ? ", " + quando : "") };
  };

  /* A capa cadastrada na obra manda; sem ela, a foto do diário mais recente
     que tenha foto. A origem vai junto porque a tela diz de onde a imagem
     veio — foto do diário de três meses atrás no fundo, sem legenda, seria
     lida como o estado de hoje. */
  ObraVitrine.foto = function (obra, ent) {
    var capa = obra ? refDeFoto(obra.foto) : null;
    if (capa) return { ref: capa, origem: "capa", data: "" };
    if (ent && ent.fotoRef) return { ref: ent.fotoRef, origem: "diario", data: ent.fotoData };
    return null;
  };
  ObraVitrine.chaveFoto = function (f) {
    if (!f || !f.ref) return "";
    var r = f.ref;
    return String(r.id || r.remoto || (r.d ? "d:" + r.d.length + ":" + r.d.slice(-32) : ""));
  };
  ObraVitrine.credito = function (m) {
    return (m && m.foto && m.foto.origem === "diario") ? "Foto do diário de " + dia(m.foto.data) : "";
  };

  /* Quem abre o palco: a última obra que a pessoa olhou (voltar para a lista
     não pode jogá-la de volta para a primeira), senão a primeira em
     andamento, senão a primeira da lista. */
  ObraVitrine.destaque = function (obras, lembrado) {
    obras = obras || [];
    var i;
    if (lembrado) for (i = 0; i < obras.length; i++) if (obras[i] && obras[i].id === lembrado) return lembrado;
    for (i = 0; i < obras.length; i++) if (obras[i] && obras[i].status === "andamento") return obras[i].id;
    return obras.length && obras[0] ? obras[0].id : "";
  };

  ObraVitrine.montar = function (o, ctx) {
    ctx = ctx || {};
    var ent = ctx.diario || null;
    return {
      id: o.id,
      nome: o.nome || "Obra sem nome",
      status: o.status || "",
      statusRot: ctx.statusRot || "",
      faseRot: ctx.faseRot || "",
      tipoRot: ctx.tipoRot || "",
      cliente: ctx.clienteNome || "",
      local: o.local || "",
      valor: num(o.valor),
      avanco: ObraVitrine.avanco(ctx.avancoPct, ctx.medidoValor, ctx.aprovadas),
      prazo: ObraVitrine.prazo(o.inicio, ctx.fim, o.status, ctx.hoje),
      diario: ObraVitrine.diario(ent, ctx.hoje),
      foto: ObraVitrine.foto(o, ent),
      portal: !!o.portalUser
    };
  };

  /* ---------------------------------------------------------------
   * HTML
   * --------------------------------------------------------------- */
  function bloco(dtHtml, dd, nota, cls) {
    return "<div><dt>" + dtHtml + "</dt>" +
      "<dd" + (cls ? ' class="' + cls + '"' : "") + ">" + esc(dd) + "</dd>" +
      (nota ? '<dd class="ov-nota">' + esc(nota) + "</dd>" : "") + "</div>";
  }
  function blocoCalendario(p) {
    var alerta = p.tipo === "vencido" ? "ov-alerta" : "";
    if (p.pct !== null) return bloco('<i class="ov-sw ov-sw-hoje"></i>Calendário', p.pct + "%", p.texto, alerta);
    if (p.tipo === "concluida") return bloco("Calendário", "Concluída", "", "");
    if (p.tipo === "sem") return bloco("Calendário", "—", "sem previsão de término", "");
    return bloco("Calendário", p.texto, "sem data de início", alerta);
  }
  /* A TRENA: o medido e o calendário na mesma régua. É a leitura do cartão
     "Prazo × avanço" do Painel, desenhada para um relance: barra verde
     atrás do traço branco = a obra está atrasada em relação ao calendário. */
  /* ⚠ SÓ HÁ TRENA QUANDO HÁ O QUE COMPARAR: um medido acima de zero ou o
     traço do calendário. A 1ª versão desenhava a fita para "0% e sem
     prazo" — uma régua vazia, sem traço nenhum, que a foto da tela mostrou
     como enfeite quebrado. Com o traço, 0% ainda diz algo: "o calendário
     andou e nada foi medido". */
  function temTrena(m) {
    return (m.avanco.pct !== null && m.avanco.pct > 0) || m.prazo.pct !== null;
  }
  function trena(m) {
    if (!temTrena(m)) return "";
    var med = m.avanco.pct !== null ? Math.max(0, Math.min(100, m.avanco.pct)) : null;
    var cal = m.prazo.pct !== null ? Math.max(0, Math.min(100, m.prazo.pct)) : null;
    var rot = [];
    if (med !== null) rot.push("medido " + m.avanco.pct + "%");
    if (cal !== null) rot.push(m.prazo.pct + "% do prazo decorrido");
    return '<div class="ov-trena" role="img" aria-label="' + esc(rot.join(", ")) + '">' +
      (med !== null ? '<span class="ov-trena-med" style="width:' + med + '%"></span>' : "") +
      (cal !== null ? '<span class="ov-trena-hoje" style="left:' + cal + '%"></span>' : "") +
      "</div>";
  }

  ObraVitrine.texto = function (m) {
    var l1 = [];
    if (m.statusRot) l1.push('<span class="ov-st" data-st="' + esc(m.status) + '">' + esc(m.statusRot) + "</span>");
    if (m.faseRot) l1.push("<span>Fase: " + esc(m.faseRot) + "</span>");
    if (m.tipoRot) l1.push("<span>" + esc(m.tipoRot) + "</span>");
    var onde = [];
    if (m.cliente) onde.push("<span>" + esc(m.cliente) + "</span>");
    if (m.local) onde.push("<span>" + esc(m.local) + "</span>");
    return (l1.length ? '<p class="ov-linha1">' + l1.join("") + "</p>" : "") +
      '<h2 class="ov-nome">' + esc(m.nome) + "</h2>" +
      (onde.length ? '<p class="ov-onde">' + onde.join("") + "</p>" : "") +
      '<dl class="ov-numeros">' +
        bloco("Contrato", m.valor > 0 ? moeda(m.valor) : "—", m.valor > 0 ? "" : "valor do contrato não cadastrado", "") +
        /* a amostra de cor é a legenda da trena: sem trena, sem legenda */
        bloco((temTrena(m) && m.avanco.pct !== null ? '<i class="ov-sw ov-sw-med"></i>' : "") + "Medido", m.avanco.texto, m.avanco.nota, "") +
        blocoCalendario(m.prazo) +
      "</dl>" +
      trena(m) +
      '<p class="ov-diario">' + esc(m.diario.texto) + "</p>" +
      '<div class="ov-acoes">' +
        '<button type="button" class="btn primary" data-gopen="obras:' + esc(m.id) + '">Abrir obra</button>' +
        '<button type="button" class="btn ov-sec" data-gacao="portal-obra" data-id="' + esc(m.id) + '">Portal do cliente' + (m.portal ? " ✓" : "") + "</button>" +
      "</div>";
  };

  /* ⚠ style="display:none" NO HTML, e o CSS o vence com !important.
     Lição da .obra-capa (tools/e2e-imagem-sem-css.js): quando o service
     worker serve a folha de estilo VELHA junto com o JS novo, elemento sem
     regra nasce em tamanho natural — foto de 1600 px cobrindo a tela do
     tablet. Aqui, sem a folha nova o palco simplesmente não aparece e a
     lista fica exatamente como era; com ela, `display:grid !important`
     vence o inline. Não troque por uma classe: é o inline que protege. */
  ObraVitrine.palco = function (m) {
    return '<section class="ov-palco' + (m.foto ? "" : " sem-foto") + '" style="display:none" data-ov-palco data-ov-id="' + esc(m.id) + '" aria-label="Obra em destaque">' +
      '<div class="ov-fundo"><img class="ov-img" alt=""><img class="ov-img" alt=""></div>' +
      '<div class="ov-veu"></div>' +
      '<div class="ov-texto" data-ov-texto>' + ObraVitrine.texto(m) + "</div>" +
      '<p class="ov-credito" data-ov-credito></p>' +
      "</section>";
  };

  global.ObraVitrine = ObraVitrine;
  if (typeof module !== "undefined" && module.exports) module.exports = ObraVitrine;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
