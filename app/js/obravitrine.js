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
  /* percentual na grafia do módulo Medições (Util.fmtPct, 1 casa): "30,3%",
     e não o "30.27%" cru que a aba Medições da ficha escrevia (revisão da 1.2.70) */
  function pct(n) {
    if (global.Util && global.Util.fmtPct) return global.Util.fmtPct(n, 1);
    return num(n).toFixed(1).replace(".", ",") + "%";
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

  function cabecalho(m, idTitulo) {
    var l1 = [];
    if (m.statusRot) l1.push('<span class="ov-st" data-st="' + esc(m.status) + '">' + esc(m.statusRot) + "</span>");
    if (m.faseRot) l1.push("<span>Fase: " + esc(m.faseRot) + "</span>");
    if (m.tipoRot) l1.push("<span>" + esc(m.tipoRot) + "</span>");
    var onde = [];
    if (m.cliente) onde.push("<span>" + esc(m.cliente) + "</span>");
    if (m.local) onde.push("<span>" + esc(m.local) + "</span>");
    return (l1.length ? '<p class="ov-linha1">' + l1.join("") + "</p>" : "") +
      '<h2 class="ov-nome"' + (idTitulo ? ' id="' + idTitulo + '"' : "") + ">" + esc(m.nome) + "</h2>" +
      (onde.length ? '<p class="ov-onde">' + onde.join("") + "</p>" : "");
  }
  /* os números da obra (contrato, medido, calendário, trena, último diário):
     o palco e o Resumo da ficha mostram o MESMO bloco, saído daqui */
  ObraVitrine.numerosHtml = function (m) {
    return '<dl class="ov-numeros">' +
        bloco("Contrato", m.valor > 0 ? moeda(m.valor) : "—", m.valor > 0 ? "" : "valor do contrato não cadastrado", "") +
        /* a amostra de cor é a legenda da trena: sem trena, sem legenda */
        bloco((temTrena(m) && m.avanco.pct !== null ? '<i class="ov-sw ov-sw-med"></i>' : "") + "Medido", m.avanco.texto, m.avanco.nota, "") +
        blocoCalendario(m.prazo) +
      "</dl>" +
      trena(m) +
      '<p class="ov-diario">' + esc(m.diario.texto) + "</p>";
  };

  /* As abas da ficha. A fiação manda só as que a pessoa pode ver (RBAC por
     módulo): o palco e a ficha não oferecem atalho para o que ela não abre. */
  ObraVitrine.ABAS = [
    { id: "resumo", rot: "Resumo" },
    /* a única aba que manda dado para fora: o título avisa ANTES do clique */
    { id: "mapa", rot: "Mapa", dica: "O mapa é do Google: abrir esta aba envia o endereço da obra ao Google Maps (Política de Privacidade, item 4.11)" },
    { id: "diario", rot: "Diário" },
    { id: "medicoes", rot: "Medições" },
    { id: "fotos", rot: "Fotos" },
    { id: "documentos", rot: "Documentos" }
  ];
  function abasPermitidas(lista) {
    if (!lista) return ObraVitrine.ABAS.slice();
    return ObraVitrine.ABAS.filter(function (a) { return lista.indexOf(a.id) >= 0; });
  }

  ObraVitrine.texto = function (m, opts) {
    /* atalhos direto para uma aba da ficha — o palco é a porta; "Abrir obra"
       entra pelo Resumo. Resumo e Documentos ficam só na ficha: no palco
       sobrariam botões demais para uma olhada. */
    var atalhos = abasPermitidas(opts && opts.abas).filter(function (a) {
      return a.id === "mapa" || a.id === "diario" || a.id === "medicoes" || a.id === "fotos";
    });
    return cabecalho(m) +
      ObraVitrine.numerosHtml(m) +
      '<div class="ov-acoes">' +
        '<button type="button" class="btn primary" data-gacao="ov-ficha" data-id="' + esc(m.id) + '" data-aba="resumo">Abrir obra</button>' +
        '<button type="button" class="btn ov-sec" data-gacao="portal-obra" data-id="' + esc(m.id) + '">Portal do cliente' + (m.portal ? " ✓" : "") + "</button>" +
      "</div>" +
      (atalhos.length ? '<div class="ov-atalhos" role="group" aria-label="Ver na ficha da obra">' +
        atalhos.map(function (a) {
          return '<button type="button" class="ov-chip" data-gacao="ov-ficha" data-id="' + esc(m.id) + '" data-aba="' + a.id + '"' + (a.dica ? ' title="' + esc(a.dica) + '"' : "") + ">" + esc(a.rot) + "</button>";
        }).join("") + "</div>" : "");
  };

  /* ---------------------------------------------------------------
   * A FICHA DA OBRA — o painel de vidro que abre sobre a cena
   * No lugar do formulário branco de cadastro, que era o que o "Abrir obra"
   * abria: a obra VISTA, com o fundo da foto atrás. O cadastro continua a
   * um clique ("Editar cadastro").
   * --------------------------------------------------------------- */

  /* O mapa é o do Google, embutido pelo ENDEREÇO: não precisa de chave nem de
     um passo de geocodificação nosso. ⚠ O endereço da obra só sai do aparelho
     quando alguém ABRE a aba Mapa — é o próprio iframe que pede. */
  ObraVitrine.urlMapa = function (endereco, satelite) {
    var e = String(endereco == null ? "" : endereco).trim();
    if (!e) return "";
    return "https://maps.google.com/maps?q=" + encodeURIComponent(e) + "&z=16&t=" + (satelite ? "k" : "m") + "&output=embed";
  };
  ObraVitrine.linkMapa = function (endereco) {
    var e = String(endereco == null ? "" : endereco).trim();
    return e ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(e) : "";
  };

  function porDataDesc(a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; }

  /* Os diários desta obra, do mais novo para o mais antigo. O RASCUNHO
     aparece (é trabalho real esperando conferência) mas marcado — ao
     contrário do "último diário" do palco, que só conta o finalizado. */
  ObraVitrine.diariosDaObra = function (rdos, obraId, max) {
    var out = [];
    (rdos || []).forEach(function (r) {
      if (!r || r.obraId !== obraId) return;
      var ef = 0;
      if (typeof r.efetivo === "number") ef = r.efetivo;
      else (r.efetivo || []).forEach(function (e) { ef += num(e && e.qtd); });
      out.push({
        id: r.id, data: String(r.data || "").slice(0, 10), status: r.status || "",
        rascunho: r.status === "rascunho",
        atividades: String(r.atividades || "").replace(/\s+/g, " ").trim(),
        efetivo: ef, fotos: (r.fotos || []).length
      });
    });
    out.sort(porDataDesc);
    return out.slice(0, max || 8);
  };

  /* As medições desta obra, da mais nova para a mais antiga. `percentual`
     vazio é medição POR VALOR — fica null, e a tela mostra o dinheiro. */
  ObraVitrine.medicoesDaObra = function (meds, obraId, max) {
    var out = [];
    (meds || []).forEach(function (m) {
      if (!m || m.obraId !== obraId) return;
      out.push({
        id: m.id, numero: m.numero == null ? "" : String(m.numero), data: String(m.data || "").slice(0, 10),
        status: m.status || "", percentual: (m.percentual == null || m.percentual === "") ? null : num(m.percentual),
        valor: num(m.valor)
      });
    });
    out.sort(porDataDesc);
    return out.slice(0, max || 10);
  };

  /* As fotos da obra: a capa primeiro, depois as dos diários FINALIZADOS do
     mais novo para o mais antigo, sem repetir a mesma imagem. Rascunho não
     empresta foto — mesma regra do cenário. */
  ObraVitrine.FONTE_RESGATE = "RA Gestão de Obras";
  ObraVitrine.fotosDaObra = function (obra, rdos, max) {
    var out = [], vistas = {};
    function por(ref, data, origem, fonte) {
      if (!ref) return;
      var f = { ref: ref, data: data || "", origem: origem };
      if (fonte) f.fonte = fonte;
      var k = ObraVitrine.chaveFoto(f);
      if (!k || vistas[k]) return;
      vistas[k] = 1; out.push(f);
    }
    por(obra ? refDeFoto(obra.foto) : null, "", "capa");
    /* os diários (sem rascunho) e o ÁLBUM da obra — as fotos que vieram de
       fora do diário (o resgate do RA Gestão de Obras), cada uma com a data
       dela — numa fila só, da mais nova para a mais antiga */
    var ds = (rdos || []).filter(function (r) { return r && obra && r.obraId === obra.id && r.status !== "rascunho"; })
      .map(function (r) { return { data: String(r.data || "").slice(0, 10), fotos: r.fotos || [], origem: "diario" }; });
    ((obra && obra.album) || []).forEach(function (a) {
      if (a) ds.push({ data: String(a.data || "").slice(0, 10), fotos: [a], origem: "album", fonte: a.fonte || "" });
    });
    ds.sort(porDataDesc);
    ds.forEach(function (d) { d.fotos.forEach(function (x) { por(refDeFoto(x), d.data, d.origem, d.fonte); }); });
    return out.slice(0, max || 24);
  };

  /* ---------------------------------------------------------------
   * O RESGATE DAS FOTOS DO RA GESTÃO DE OBRAS
   * As fotos que o sistema antigo tinha nos registros de produção e que a
   * importação de 07/2026 não trouxe (o antigo ainda apagava foto antiga
   * quando o armazenamento enchia). Foram copiadas para uma pasta com um
   * manifesto.json (arquivo, dataRegistro, legenda, sha256…). Aqui só se
   * PLANEJA — o que entra, o que já está, o que não confere; quem grava é a
   * tela, depois de a pessoa confirmar.
   * ⚠ Elas entram no ÁLBUM da obra, com a data original — nunca num diário:
   * pendurar foto em diário de outro dia é ligar por semelhança, e criar
   * diário para o dia seria inventar um documento que vai ao Portal.
   * --------------------------------------------------------------- */
  /* manifesto ilegível devolve null — nunca uma lista vazia calada, que a
     tela leria como "nenhuma foto para trazer" */
  ObraVitrine.lerManifesto = function (json) {
    var m = json;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { return null; } }
    if (!m || typeof m !== "object") return null;
    var itens = Array.isArray(m) ? m : m.fotos;
    if (!Array.isArray(itens)) return null;
    return {
      origem: String(m.origem || ""),
      fotos: itens.filter(Boolean).map(function (x) {
        return { arquivo: String(x.arquivo || ""), data: String(x.dataRegistro || "").slice(0, 10), leg: String(x.legenda || ""),
          sha: String(x.sha256 || "").toLowerCase(), bytes: num(x.bytes), idErp: String(x.idRegistroProducaoErp || "") };
      })
    };
  };
  /* `arquivos`: [{ nome, sha }] com o sha256 MEDIDO no aparelho; `album`: o
     que a obra já tem. ⚠ A conferência é pelo sha do manifesto: arquivo
     trocado ou corrompido na pasta fica de fora, e é dito. E é o sha que
     impede duplicar ao rodar de novo. */
  ObraVitrine.planoResgate = function (man, arquivos, album) {
    var p = { entram: [], repetidas: [], jaNoAlbum: [], semArquivo: [], divergentes: [], semData: [] };
    if (!man || !man.fotos) return p;
    var porNome = {}, noAlbum = {}, visto = {};
    (arquivos || []).forEach(function (a) { if (a && a.nome) porNome[String(a.nome).toLowerCase()] = a; });
    (album || []).forEach(function (a) { if (a && a.sha) noAlbum[String(a.sha).toLowerCase()] = 1; });
    man.fotos.forEach(function (f) {
      var a = porNome[String(f.arquivo).toLowerCase()];
      if (!a) { p.semArquivo.push(f); return; }
      if (!f.sha || String(a.sha || "").toLowerCase() !== f.sha) { p.divergentes.push(f); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) { p.semData.push(f); return; }
      if (noAlbum[f.sha]) { p.jaNoAlbum.push(f); return; }
      if (visto[f.sha]) { p.repetidas.push(f); return; }
      visto[f.sha] = 1; p.entram.push(f);
    });
    return p;
  };
  /* o que a tela diz ANTES de gravar — com número, e com o nome do arquivo
     que ficou de fora (número a pessoa confere; aviso genérico ela ignora) */
  ObraVitrine.resumoResgate = function (p) {
    function nomes(l) { return l.slice(0, 4).map(function (f) { return f.arquivo; }).join(", ") + (l.length > 4 ? "…" : ""); }
    var n = p.entram.length, out = [];
    if (n) {
      var dias = {}, ordem = [];
      p.entram.forEach(function (f) { if (!dias[f.data]) { dias[f.data] = 0; ordem.push(f.data); } dias[f.data]++; });
      ordem.sort();
      out.push(n + (n === 1 ? " foto entra" : " fotos entram") + " no álbum da obra, cada uma com a data original: " +
        ordem.map(function (d) { return dia(d) + " (" + dias[d] + ")"; }).join(", ") + ".");
    } else out.push("Nenhuma foto nova para trazer.");
    if (p.jaNoAlbum.length) out.push(p.jaNoAlbum.length + (p.jaNoAlbum.length === 1 ? " já está no álbum e fica como está." : " já estão no álbum e ficam como estão."));
    if (p.repetidas.length) out.push(p.repetidas.length + " é a mesma imagem de outra da lista (estava em dois registros) e entra uma vez só: " + nomes(p.repetidas) + ".");
    if (p.divergentes.length) out.push("⚠ " + p.divergentes.length + " não conferem com o manifesto (o arquivo não é o que foi copiado) e ficam de fora: " + nomes(p.divergentes) + ".");
    if (p.semArquivo.length) out.push("⚠ " + p.semArquivo.length + " estão no manifesto mas não foram escolhidas: " + nomes(p.semArquivo) + ".");
    if (p.semData.length) out.push("⚠ " + p.semData.length + " sem data no manifesto ficam de fora: " + nomes(p.semData) + ".");
    return out;
  };

  function vazio(txt, botao) {
    return '<div class="ov-vazio"><p>' + esc(txt) + "</p>" + (botao || "") + "</div>";
  }
  function linhaDado(rot, valor) {
    return valor ? "<div><dt>" + esc(rot) + "</dt><dd>" + esc(valor) + "</dd></div>" : "";
  }
  function numBR(v) {
    var n = num(v);
    return n > 0 ? (global.Util && global.Util.fmtNum ? global.Util.fmtNum(n, 2) : String(n)) + " m²" : "";
  }

  /* o corpo de UMA aba — separado para a troca de aba não redesenhar a ficha */
  ObraVitrine.corpoAba = function (ctx) {
    var m = ctx.m, o = ctx.obra || {}, id = esc(m.id), aba = ctx.aba || "resumo";
    var editar = '<button type="button" class="btn ov-sec" data-gopen="obras:' + id + '">Editar cadastro</button>';
    if (aba === "mapa") {
      var url = ObraVitrine.urlMapa(o.local, ctx.mapa === "satelite");
      if (!url) return vazio("Cadastre o endereço da obra para ver onde ela fica no mapa.", editar);
      if (ctx.online === false) return vazio("Sem internet agora — o mapa aparece quando a conexão voltar.");
      /* ⚠ referrerpolicy="no-referrer": sem isso o iframe manda ao Google o
         endereço COMPLETO desta página, com a query — e o link ?lic= carrega a
         chave de licença, que é a credencial da nuvem. Ao Google vai só o
         endereço da obra (item 4.11 da política; tools/test-privacidade.js). */
      return '<div class="ov-mapa">' +
        '<div class="ov-mapa-barra"><div class="ov-seg" role="group" aria-label="Tipo de mapa">' +
          '<button type="button" class="ov-chip' + (ctx.mapa === "satelite" ? "" : " on") + '" data-gacao="ov-mapa-tipo" data-tipo="mapa" aria-pressed="' + (ctx.mapa === "satelite" ? "false" : "true") + '">Mapa</button>' +
          '<button type="button" class="ov-chip' + (ctx.mapa === "satelite" ? " on" : "") + '" data-gacao="ov-mapa-tipo" data-tipo="satelite" aria-pressed="' + (ctx.mapa === "satelite" ? "true" : "false") + '">Satélite</button>' +
        "</div>" +
        '<a class="ov-link" href="' + esc(ObraVitrine.linkMapa(o.local)) + '" target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a></div>' +
        /* ⚠ O AVISO MORA AQUI, e não só no item 4.11 da política: o app nunca
           abre o .txt, e é nesta tela que o endereço sai (mesma regra da foto
           da conta, em js/app.js). Acima do mapa, para não cair fora da tela. */
        '<p class="ov-nota ov-aviso-mapa">O mapa é do Google: ao abrir esta aba, o endereço cadastrado — ' + esc(o.local) +
          " — vai ao Google Maps (Política de Privacidade, item 4.11).</p>" +
        '<iframe class="ov-mapa-frame' + (ctx.mapa === "satelite" ? " satelite" : "") + '" src="' + esc(url) + '" title="Mapa da obra: ' + esc(o.local) + '" loading="lazy" referrerpolicy="no-referrer"></iframe></div>';
    }
    if (aba === "diario") {
      var ds = ctx.diarios || [];
      if (!ds.length) return vazio("Nenhum diário nesta obra ainda.");
      return '<div class="ov-lista">' + ds.map(function (d) {
        return '<button type="button" class="ov-linha" data-gopen="rdo:' + esc(d.id) + '">' +
          '<span class="ov-linha-data">' + esc(dia(d.data) || "sem data") + "</span>" +
          '<span class="ov-linha-corpo"><b>' + esc(d.atividades || "Sem atividades descritas") + "</b>" +
            "<small>" + (d.rascunho ? '<i class="ov-marca">Rascunho — esperando conferência</i>' : "Finalizado") +
            (d.efetivo ? " · " + d.efetivo + (d.efetivo === 1 ? " pessoa" : " pessoas") : "") +
            (d.fotos ? " · " + d.fotos + (d.fotos === 1 ? " foto" : " fotos") : "") + "</small></span></button>";
      }).join("") + "</div>" +
      '<div class="ov-mais"><button type="button" class="ov-chip" data-gacao="ov-ir" data-mod="rdo" data-id="' + id + '">Ver todos no Diário</button></div>';
    }
    if (aba === "medicoes") {
      var ms = ctx.medicoes || [];
      if (!ms.length) return vazio("Nenhuma medição nesta obra ainda.");
      return '<div class="ov-lista">' + ms.map(function (x) {
        /* ⚠ havendo %, o dinheiro continua na linha — a 1ª versão o escondia.
           Sem %, é medição POR VALOR: só o dinheiro, nunca "0%". Valor zerado
           não vira "R$ 0,00" embaixo de um percentual. */
        var quanto = x.percentual !== null
          ? "<b>" + esc(pct(x.percentual)) + "</b>" + (x.valor > 0 ? "<small>" + esc(moeda(x.valor)) + "</small>" : "")
          : "<b>" + esc(moeda(x.valor)) + "</b>";
        return '<button type="button" class="ov-linha" data-gopen="medicoes:' + esc(x.id) + '">' +
          '<span class="ov-linha-data">' + esc(dia(x.data) || "sem data") + "</span>" +
          '<span class="ov-linha-corpo"><b>Medição ' + esc(x.numero || "") + "</b>" +
            '<small><span class="ov-st" data-st="' + esc(x.status) + '">' + esc(x.statusRot || x.status || "") + "</span></small></span>" +
          '<span class="ov-linha-num">' + quanto + "</span></button>";
      }).join("") + "</div>" +
      '<div class="ov-mais"><button type="button" class="ov-chip" data-gacao="ov-ir" data-mod="medicoes" data-id="' + id + '">Ver todas em Medições</button></div>';
    }
    if (aba === "fotos") {
      var fs = ctx.fotos || [];
      /* o resgate só aparece em obra que VEIO do RA Gestão de Obras: o id
         carrega a marca da importação (erp-) — não é palpite pelo nome */
      var resgate = /^erp-/.test(String(m.id)) ? '<button type="button" class="ov-chip" data-gacao="ov-resgate" data-id="' + id + '" title="Escolha as fotos resgatadas do sistema antigo e o manifesto.json da mesma pasta">Trazer fotos do RA Gestão de Obras</button>' : "";
      if (!fs.length) return vazio("Nenhuma foto nesta obra ainda — elas chegam pela capa da obra e pelos diários.", resgate);
      return '<div class="ov-galeria">' + fs.map(function (f, i) {
        var leg = f.origem === "capa" ? "Capa da obra" : f.origem === "album" ? (f.fonte || "Álbum da obra") + " · " + dia(f.data) : "Diário de " + dia(f.data);
        return '<button type="button" class="ov-thumb" data-gacao="ov-foto-cena" data-i="' + i + '" title="Pôr esta foto no fundo">' +
          '<img data-ov-thumb="' + i + '" alt="' + esc(leg) + '"><span>' + esc(leg) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="ov-mais">' + resgate + '<button type="button" class="ov-chip" data-gacao="ov-ir" data-mod="galeria" data-id="' + id + '">Ver na Galeria</button></div>';
    }
    if (aba === "documentos") {
      var dc = ctx.documentos || [];
      var gerenciar = '<button type="button" class="btn ov-sec" data-gacao="docs-obra" data-id="' + id + '">Gerenciar documentos</button>';
      if (!dc.length) return vazio("Nenhum documento cadastrado — ART/RRT, alvará, apólice e o que o cliente vê no Portal.", gerenciar);
      return '<div class="ov-lista">' + dc.map(function (d) {
        return '<div class="ov-linha ov-linha-fixa"><span class="ov-linha-corpo"><b>' + esc(d.nome || "Documento") + "</b>" +
          "<small>" + esc([d.tipo, d.numero ? "nº " + d.numero : "", d.emissao ? "emitido em " + dia(d.emissao) : ""].filter(Boolean).join(" · ")) + "</small></span></div>";
      }).join("") + "</div>" + '<div class="ov-mais">' + gerenciar + "</div>";
    }
    /* resumo */
    var dados = linhaDado("Endereço", o.local) +
      linhaDado("Início", o.inicio ? dia(o.inicio) : "") +
      linhaDado("Previsão de término", o.termino ? dia(o.termino) : "") +
      linhaDado("Área construída", numBR(o.areaConstruida)) +
      linhaDado("Área do terreno", numBR(o.areaTerreno)) +
      linhaDado("Entrega de materiais", o.enderecoEntrega && o.enderecoEntrega !== o.local ? o.enderecoEntrega : "") +
      linhaDado("Observações", o.obs);
    return '<div class="ov-resumo">' + ObraVitrine.numerosHtml(m) + "</div>" +
      (dados ? '<dl class="ov-dados">' + dados + "</dl>" : "");
  };

  /* ⚠ display:none inline, como o palco e o cenário (ver ObraVitrine.palco). */
  ObraVitrine.fichaHtml = function (ctx) {
    var m = ctx.m, id = esc(m.id), abas = abasPermitidas(ctx.abas), aba = ctx.aba || "resumo";
    if (!abas.some(function (a) { return a.id === aba; })) aba = "resumo";
    ctx.aba = aba;
    return '<section class="ov-ficha" style="display:none" data-ov-ficha data-ov-id="' + id + '" role="dialog" aria-labelledby="ov-ficha-tit">' +
      '<header class="ov-ficha-cab"><div class="ov-ficha-tit">' + cabecalho(m, "ov-ficha-tit") + "</div>" +
        '<button type="button" class="ov-ficha-fechar" data-gacao="ov-ficha-fechar" title="Voltar para as obras (Esc)">Voltar às obras</button></header>' +
      '<nav class="ov-abas" role="tablist" aria-label="Dados da obra">' + abas.map(function (a) {
        var on = a.id === aba;
        return '<button type="button" role="tab" class="ov-aba' + (on ? " on" : "") + '" aria-selected="' + (on ? "true" : "false") + '" data-gacao="ov-aba" data-aba="' + a.id + '"' + (a.dica ? ' title="' + esc(a.dica) + '"' : "") + ">" + esc(a.rot) + "</button>";
      }).join("") + "</nav>" +
      '<div class="ov-ficha-corpo" role="tabpanel" data-ov-corpo>' + ObraVitrine.corpoAba(ctx) + "</div>" +
      '<footer class="ov-ficha-rodape">' +
        /* ⚠ as ações que moravam no card (a lixeira, o Aviso semanal) vieram
           para cá quando o card virou só foto e nome (pedido de 11/09/2026).
           A lixeira segue só para quem pode excluir, e pede confirmação. */
        (ctx.podeExcluir ? '<button type="button" class="btn ov-sec ov-perigo" data-gacao="excluir-obra" data-id="' + id + '" title="Excluir esta obra (pede confirmação)">Excluir obra</button>' : "") +
        '<span class="ov-rodape-vao"></span>' +
        (m.portal ? '<button type="button" class="btn ov-sec" data-gacao="aviso-semanal" data-id="' + id + '" title="Gera o resumo da semana pronto para mandar ao cliente">Aviso semanal</button>' : "") +
        '<button type="button" class="btn ov-sec" data-gopen="obras:' + id + '">Editar cadastro</button>' +
        '<button type="button" class="btn primary" data-gacao="portal-obra" data-id="' + id + '">Portal do cliente' + (m.portal ? " ✓" : "") + "</button>" +
      "</footer></section>";
  };

  /* ---------------------------------------------------------------
   * A FILEIRA — as obras num trilho só, que anda para os lados
   * Pedido de 11/09/2026: a grade rolando para baixo poluía a tela. É uma
   * fileira no pé da cena, como no Netflix: a rodinha do mouse anda para os
   * lados, as setas pulam uma página, e o card é só a foto e o nome.
   * --------------------------------------------------------------- */

  /* A seta é o LOGO da OrçaPRO: as três barras sobem da esquerda para a
     direita, então ele já aponta para a frente; espelhado (no css), aponta
     para trás. Sem gradiente com id: o mesmo svg entra várias vezes na
     tela, e id repetido faz o segundo desenho herdar a pintura do primeiro. */
  var MARCA = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<rect class="ov-marca-fundo" x="4" y="4" width="92" height="92" rx="24"/>' +
    '<rect class="ov-b1" x="24" y="52" width="13" height="22" rx="4"/>' +
    '<rect class="ov-b2" x="44" y="38" width="13" height="36" rx="4"/>' +
    '<rect class="ov-b3" x="64" y="24" width="13" height="50" rx="4"/></svg>';
  ObraVitrine.MARCA = MARCA;

  /* O card: a foto e o nome, mais nada. `m` é o que ObraVitrine.montar
     devolve — então a foto é a mesma do palco (a capa, senão a do diário
     mais recente), e obra sem foto nenhuma ganha a marca no lugar.
     ⚠ `card orc-card` e a altura da `.obra-capa` ficam: são o que o piso de
     UI.chaoDeEstilo() e tools/e2e-imagem-sem-css.js conhecem. */
  ObraVitrine.card = function (m, emCena) {
    var id = esc(m.id), nome = esc(m.nome || "Obra sem nome");
    return '<div class="card orc-card ov-card' + (m.foto ? " com-foto" : "") + (emCena ? " em-cena" : "") + '"' +
      ' data-gacao="ov-ficha" data-id="' + id + '" data-aba="resumo" data-ov="' + id + '" tabindex="0" aria-label="' + nome + ': abrir a obra">' +
      (m.foto ? '<div class="obra-capa"><img data-obrafoto="' + id + '" alt=""></div>'
              : '<div class="obra-capa sem-foto">' + MARCA + "</div>") +
      "<h3>" + nome + "</h3></div>";
  };

  /* ⚠ as setas nascem com style="display:none": folha de estilo velha (o
     tablet que ficou com o css da versão anterior) não desenha dois botões
     soltos no meio da tela. Quem as mostra é a classe `on`, que o js põe
     quando há para onde andar, e o css força com !important. */
  ObraVitrine.fila = function (cardsHtml) {
    function seta(lado, dir, rot) {
      return '<button type="button" class="ov-seta ' + lado + '" style="display:none" data-gacao="ov-rolar" data-dir="' + dir + '" aria-label="' + rot + '" title="' + rot + '">' + MARCA + "</button>";
    }
    return '<div class="ov-fila" data-ov-fila>' + seta("esq", "-1", "Obras anteriores") +
      '<div class="grid-cards ov-grade" aria-label="Obras">' + (cardsHtml || "") + "</div>" +
      seta("dir", "1", "Próximas obras") + "</div>";
  };

  /* Quais setas aparecem: só a do lado para onde ainda há obra. A folga de
     4 px é o arredondamento do navegador — sem ela a seta da direita fica
     acesa no fim do trilho, apontando para o nada. */
  ObraVitrine.setas = function (esquerda, larguraTotal, larguraVisivel) {
    var e = num(esquerda), t = num(larguraTotal), v = num(larguraVisivel);
    return { esq: e > 4, dir: e + v < t - 4 };
  };

  /* Quanto uma seta anda: uma página, menos um card — o último que se via
     continua à vista, para a pessoa não perder o fio (é o que o Netflix faz).
     Nunca menos que um card. */
  ObraVitrine.passo = function (larguraVisivel, larguraCard, vao) {
    var um = num(larguraCard) + num(vao);
    if (um <= 0) return 0;
    return Math.max(1, Math.floor((num(larguraVisivel) + num(vao)) / um) - 1) * um;
  };

  /* ---------------------------------------------------------------
   * A CENA — a foto da obra em tela cheia, atrás da lista inteira
   * --------------------------------------------------------------- */

  /* Movimentos de câmera do cenário (o zoom lento contínuo, "como se fosse um
     vídeo"). Um por obra e sempre o mesmo para ela — sai do id —, para as
     obras parecerem cenas diferentes e a mesma obra não mudar de cara cada
     vez que volta ao palco. Os nomes são as classes kb-* do css/app.css. */
  ObraVitrine.MOVIMENTOS = ["aproxima", "direita", "sobe", "afasta", "diagonal"];
  /* duração do deslize na troca de obra — tem de ser a mesma do css (1s):
     é depois dela que a camada que saiu é desligada */
  ObraVitrine.TROCA_MS = 1000;

  /* A cena se move? Sim, a menos que o SISTEMA peça menos movimento — e aí
     só se a pessoa escolheu "Sempre ligado" em Aparência (App.aplicarMovimento).
     A escolha dela passa na frente da do Windows; a falta de escolha segue o
     Windows. É a mesma regra que o css aplica com :root[data-movimento]. */
  ObraVitrine.movimentoLigado = function (sistemaReduz, preferencia) {
    return preferencia === "sempre" || !sistemaReduz;
  };

  ObraVitrine.movimento = function (id) {
    var s = String(id == null ? "" : id), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
    return ObraVitrine.MOVIMENTOS[h % ObraVitrine.MOVIMENTOS.length];
  };

  /* De que lado a foto nova entra: acompanha a posição do card na grade.
     Card mais adiante → a foto nova vem da direita e a antiga sai pela
     esquerda, como quem anda pela fileira; card para trás, o contrário. Sem
     referência (primeira foto, obra fora da grade) → "", e aí só esmaece. */
  ObraVitrine.direcao = function (ordem, de, para) {
    ordem = ordem || [];
    var a = ordem.indexOf(de), b = ordem.indexOf(para);
    if (a < 0 || b < 0 || a === b) return "";
    return b > a ? "direita" : "esquerda";
  };

  /* ⚠ style="display:none" NO HTML, e o CSS o vence com !important — no
     palco E no cenário. Lição da .obra-capa (tools/e2e-imagem-sem-css.js):
     quando o service worker serve a folha de estilo VELHA junto com o JS
     novo, elemento sem regra nasce em tamanho natural — foto de 1600 px
     cobrindo a tela do tablet. Aqui, sem a folha nova a cena simplesmente
     não aparece e a lista fica exatamente como era; com ela, o
     `display:... !important` vence o inline. Não troque por uma classe: é o
     inline que protege. */
  ObraVitrine.cenario = function (m) {
    return '<div class="ov-cenario' + (m.foto ? "" : " sem-foto") + '" style="display:none" data-ov-cenario aria-hidden="true">' +
      '<div class="ov-camada"><img class="ov-img" alt=""></div>' +
      '<div class="ov-camada"><img class="ov-img" alt=""></div>' +
      '<div class="ov-veu"></div>' +
      "</div>" +
      /* a AURA: a mesma foto, muito desfocada, fixa atrás da janela inteira —
         é ela que aparece através do topo e do menu lateral de vidro, e faz a
         cena passar por trás deles (pedido de 11/09/2026) */
      '<div class="ov-aura" style="display:none" aria-hidden="true"><img alt=""></div>';
  };
  ObraVitrine.palco = function (m, opts) {
    return '<section class="ov-palco" style="display:none" data-ov-palco data-ov-id="' + esc(m.id) + '" aria-label="Obra em destaque">' +
      '<div class="ov-texto" data-ov-texto>' + ObraVitrine.texto(m, opts) + "</div>" +
      '<p class="ov-credito" data-ov-credito></p>' +
      "</section>";
  };

  global.ObraVitrine = ObraVitrine;
  if (typeof module !== "undefined" && module.exports) module.exports = ObraVitrine;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
