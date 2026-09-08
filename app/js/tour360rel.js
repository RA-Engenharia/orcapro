/* =====================================================================
 * tour360rel.js — O QUE SAI DO TOUR: o relatório fotográfico e o vídeo.
 *
 * O tour vive na tela (js/tour360view.js) e a conta vive no motor
 * (js/tour360.js). Este arquivo é a SAÍDA — o documento que vai para a
 * reunião e o arquivo de vídeo que vai para o grupo da obra. Ele não decide
 * nada de geometria nem de medida: pergunta tudo ao motor
 * (`paginasRelatorio`, `resumo`, `planoVideo`, `planoComparativo`) e ao
 * gravador já testado da casa (`BimVideo.gravar`).
 *
 * Tela nenhuma mora aqui. Quem desenha botão é js/tour360ui.js.
 *
 * ---------------------------------------------------------------------
 * COMO DOCUMENTO VIRA PDF NESTA CASA
 * ---------------------------------------------------------------------
 * Não há biblioteca de PDF. `Gestao._docShell` monta o cabeçalho da empresa,
 * `Gestao._abrirDoc` chama `App._abrirPrint`, que empilha um OVERLAY no
 * próprio DOM — e quem gera o PDF é a janela de impressão do navegador.
 * Três consequências que mandam no código daqui:
 *   · o miolo é HTML com estilo INLINE (não existe folha de estilo dentro
 *     do overlay de impressão);
 *   · quebra de página é `page-break-*`; paginação minha não existe;
 *   · a foto entra como data URI. `Fotos.url` devolve um endereço que só
 *     responde com o header da licença, e `<img src>` não manda header —
 *     por isso a foto é RESOLVIDA por `Fotos.dataURI` antes de montar o
 *     HTML, e por isso `abrir` é assíncrono.
 *
 * ---------------------------------------------------------------------
 * ⚠ QUATRO COISAS QUE NÃO PODEM SER "SIMPLIFICADAS"
 * ---------------------------------------------------------------------
 *
 * 1. MEDIDA APROXIMADA NUNCA SAI SÓ COMO NÚMERO. Toda medida com
 *    `erroEstimadoPct` acima de `Tour360.ERRO_AVISO_PCT` sai com "~" e com a
 *    faixa em metros à vista. O roteiro do defeito que isso evita: o motor
 *    devolve 25,86 m com ±11,2%; escrito "25,86 m" no papel, aquilo vira
 *    dimensão de projeto na cabeça de quem lê — alguém compra esquadria, ou
 *    contesta uma medição, em cima de um número que na verdade quer dizer
 *    "entre 22,9 e 28,8". O ~ e a faixa são o que impedem o documento de
 *    afirmar mais do que a foto sabe.
 *
 * 2. FOTO QUE NÃO VEIO É AVISO, NÃO MOLDURA VAZIA. Foto na fila de upload
 *    (`Tour360.fotosPendentes`) ou que não chegou a este aparelho vira um
 *    bloco DECLARANDO a ausência, com o que fazer. Documento que omite em
 *    silêncio é pior que documento incompleto: o mesmo defeito já saiu no
 *    diário de obra, que é entregável com valor de prova, e ninguém viu.
 *
 * 3. O CURSOR DO VÍDEO ANDA SEMPRE — inclusive quando o quadro falha.
 *    Ver o comentário em `Rel.gravar`.
 *
 * 4. NÃO SE PRÉ-DECODIFICA TODO PANORAMA. Resolver os data URIs antes de
 *    gravar é obrigatório (a troca no meio da gravação não pode esperar
 *    rede); DECODIFICAR os 40 panoramas de uma vez, não — 4096×2048 em RGBA
 *    são ~33 MB por foto, e 40 delas passam de 1 GB. O navegador mata a aba
 *    e o usuário perde a gravação inteira sem entender por quê.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Rel = {};

  /* ⚠ TETO DE ESPERA POR FOTO. `Fotos.baixar` não tem AbortController: com a
     foto só na nuvem e a internet ruim, o `Promise.all` pode nunca assentar —
     e aí o clique no botão não abre documento nenhum, sem erro e sem spinner,
     para sempre. Mesmo teto do diário de obra (js/gestao.js, imprimirRdo). */
  Rel.TIMEOUT_FOTO_MS = 12000;

  var ACCENT = "#0f2740";

  function M() { return global.Tour360; }
  function V() { return global.Tour360View; }
  function VID() { return global.BimVideo; }

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function txt(v) { return v == null ? "" : String(v); }

  /* `Util.esc` é o escape da casa e é ele quem vale quando o app está
     carregado. O corpo abaixo só existe para este arquivo poder ser exigido
     em Node (gate) sem arrastar js/util.js junto — não é uma segunda régua de
     escape convivendo com a primeira em produção. */
  function esc(s) {
    if (global.Util && typeof global.Util.esc === "function") return global.Util.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function numBR(v, casas) {
    var c = casas === undefined ? 2 : casas;
    return num(v, 0).toFixed(c).replace(".", ",");
  }

  /* Aceita "2026-09-15" e também "2026-09-15T13:40:00" (é o formato de
     `capturadoEm`), por isso o teste é de PREFIXO.

     ⚠ QUANDO NÃO CASA, DEVOLVE A STRING CRUA — e por isso TODO uso desta
     função dentro do HTML passa por `esc()`. `App._abrirPrint` monta o
     documento com `overlay.innerHTML = ...`, ou seja: o que chega aqui
     EXECUTA. E a tela não é a única a escrever no registro do tour — o merge
     da nuvem (união por id, sem olhar campo) e `App.importarBackup` gravam
     direto, sem passar por validação nenhuma. Um `capturadoEm` com
     "<img src=x onerror=...>" chegaria inteiro. */
  function dataBR(iso) {
    var s = txt(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s;
  }

  /* ---------------------------------------------------------------------
   * Rótulos do tipo de comentário. As chaves são as de
   * `Tour360.TIPOS_HOTSPOT`; tipo desconhecido cai em "comentário" em vez de
   * sair sem rótulo nenhum no papel.
   * ------------------------------------------------------------------- */
  var TIPOS = {
    comentario: { rotulo: "COMENTÁRIO", cor: "#0f2740", fundo: "#eef2f7", borda: "#cbd5e1" },
    atencao: { rotulo: "ATENÇÃO", cor: "#7c2d12", fundo: "#fffbeb", borda: "#f59e0b" },
    pendencia: { rotulo: "PENDÊNCIA", cor: "#7f1d1d", fundo: "#fef2f2", borda: "#dc2626" },
    aprovado: { rotulo: "APROVADO", cor: "#14532d", fundo: "#f0fdf4", borda: "#16a34a" }
  };

  function tipoDe(t) {
    var k = txt(t);
    return Object.prototype.hasOwnProperty.call(TIPOS, k) ? TIPOS[k] : TIPOS.comentario;
  }

  /* =====================================================================
   * PARTE 1 — O RELATÓRIO FOTOGRÁFICO
   * ================================================================== */

  /* Como uma medida do tour se escreve num documento. Fica separado do HTML
     de propósito: é a regra do item 1 do cabeçalho, e o gate consegue
     exercitá-la sem montar página nenhuma.

     Entra um item de `Tour360.paginasRelatorio(...).medidas` e sai
     { tipo, rotulo, valor, precisao, aproximada, problema }. */
  Rel.textoMedida = function (medida) {
    var m = medida || {};
    var tipo = txt(m.tipo) === "altura" ? "Altura" : "Distância";
    var rotulo = txt(m.rotulo);

    if (txt(m.problema) || m.metros == null) {
      return {
        tipo: tipo, rotulo: rotulo, valor: "—", precisao: "", aproximada: false,
        problema: txt(m.problema) || "Esta medida não pôde ser recalculada com os dados atuais deste ponto."
      };
    }

    var v = num(m.metros, 0);
    var pct = num(m.erroEstimadoPct, 0);
    /* ⚠ O MESMO SINAL DO MOTOR. `Tour360` marca `aproximada` com `pct >
       ERRO_AVISO_PCT`; usar ">=" aqui faria o documento e a tela discordarem
       na fronteira, e o pior tipo de divergência é a que só aparece num
       valor. O limite vem do motor — nunca escrito à mão aqui. */
    var lim = M() ? num(M().ERRO_AVISO_PCT, 10) : 10;
    var ap = pct > lim;
    var meia = v * pct / 100;

    return {
      tipo: tipo,
      rotulo: rotulo,
      valor: (ap ? "~ " : "") + numBR(v, 2) + " m",
      precisao: ap
        ? ("entre " + numBR(v - meia, 2) + " m e " + numBR(v + meia, 2) + " m (±" + numBR(pct, 1) + "%)")
        : ("±" + numBR(pct, 1) + "%"),
      aproximada: ap,
      problema: ""
    };
  };

  function caixaAviso(htmlInterno) {
    return '<div style="border:1px solid #f59e0b;border-radius:6px;padding:7px 10px;font-size:10.5px;color:#7c2d12;background:#fffbeb;margin-bottom:8px">'
      + htmlInterno + "</div>";
  }

  function chip(valor, rot) {
    return '<span style="display:inline-block;border:1px solid #cbd5e1;border-radius:12px;padding:2px 10px;font-size:10.5px;color:#334155;margin:0 6px 6px 0">'
      + "<b>" + esc(valor) + "</b> " + esc(rot) + "</span>";
  }

  function blocoComentarios(lista) {
    if (!lista || !lista.length) return "";
    var h = '<div style="font-weight:800;font-size:10.5px;letter-spacing:.4px;margin:10px 0 5px">COMENTÁRIOS DESTE PONTO (' + lista.length + ")</div>";
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i], t = tipoDe(c.tipo);
      h += '<div style="border:1px solid ' + t.borda + ';border-left-width:4px;border-radius:5px;background:' + t.fundo + ';padding:6px 9px;margin-bottom:6px;page-break-inside:avoid">'
        + '<span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:' + t.cor + '">' + t.rotulo + "</span>"
        + '<div style="font-size:11.5px;color:#111;margin-top:2px">' + esc(txt(c.texto) || "(sem texto)") + "</div>"
        + '<div style="font-size:9.5px;color:#64748b;margin-top:3px">'
        + (txt(c.autor) ? esc(c.autor) : "")
        + (txt(c.autor) && txt(c.em) ? " · " : "")
        + (txt(c.em) ? esc(dataBR(c.em)) : "")
        /* onde no panorama o comentário está: é isso que deixa quem lê o papel
           reencontrar o ponto exato dentro do tour, no aplicativo */
        + " · giro " + numBR(c.yaw, 0) + "°, inclinação " + numBR(c.pitch, 0) + "°"
        + "</div></div>";
    }
    return h;
  }

  function blocoMedidas(lista) {
    if (!lista || !lista.length) return "";
    var h = '<div style="font-weight:800;font-size:10.5px;letter-spacing:.4px;margin:10px 0 5px">MEDIDAS TIRADAS NESTE PONTO (' + lista.length + ")</div>"
      + '<table style="width:100%;border-collapse:collapse;font-size:11px">'
      + '<thead><tr style="background:' + ACCENT + ';color:#fff">'
      + '<th style="border:1px solid #bbb;padding:4px 6px;text-align:left">O que foi medido</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;width:24%">Valor</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;width:38%">Precisão</th>'
      + "</tr></thead><tbody>";
    for (var i = 0; i < lista.length; i++) {
      var d = Rel.textoMedida(lista[i]);
      var fundo = d.aproximada ? "#fffbeb" : "#fff";
      h += '<tr style="background:' + fundo + '">'
        + '<td style="border:1px solid #bbb;padding:4px 6px"><b>' + esc(d.tipo) + "</b>" + (d.rotulo ? " — " + esc(d.rotulo) : "") + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;text-align:center;font-weight:700' + (d.aproximada ? ";color:#7c2d12" : "") + '">' + esc(d.valor) + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;font-size:10px;color:#475569">' + esc(d.problema || d.precisao) + "</td>"
        + "</tr>";
    }
    return h + "</tbody></table>";
  }

  function molduraFoto(dataURI, pg) {
    if (dataURI) {
      /* ⚠ a MESMA régua do motor: `Tour360.validar` conta como foto comum
         tudo que não for "equirect". Testar por "plana" chamaria um tipo
         desconhecido de panorama e a legenda mentiria. */
      var eh360 = txt(pg.tipo) === "equirect";
      return '<figure style="margin:0 0 8px;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid">'
        + '<img src="' + esc(dataURI) + '" style="width:100%;max-height:420px;object-fit:contain;display:block;background:#0b1a2b">'
        + '<figcaption style="padding:4px 8px;font-size:9.5px;color:#555;background:#f8fafc">'
        + (eh360
          ? "Foto panorâmica 360° — no aplicativo ela gira; no papel ela aparece aberta, com as bordas esquerda e direita se encontrando atrás de quem fotografou."
          : "Foto comum (não gira em 360°).")
        + "</figcaption></figure>";
    }
    /* ⚠ item 2 do cabeçalho: sem foto NÃO vira moldura vazia */
    if (!pg.foto) {
      return caixaAviso("<b>Este ponto ainda não foi fotografado.</b> Ele existe no tour (é o que faz a comparação com a próxima visita ser possível), mas não há imagem para este documento.");
    }
    return caixaAviso("<b>A foto deste ponto não entrou no documento.</b> Os arquivos não estão neste aparelho e ainda não chegaram à nuvem. Abra o tour com internet, espere as fotos subirem e gere o relatório de novo.");
  }

  function paginaHTML(pg, fotos, dataVisita, ultima) {
    var dataURI = (fotos && Object.prototype.hasOwnProperty.call(fotos, pg.pid)) ? fotos[pg.pid] : "";
    /* a classe existe para css/tour360.css poder mandar na paginacao junto;
       o page-break inline continua porque o documento tambem e aberto por
       janela de impressao, onde a folha do app pode nao estar carregada */
    var h = '<div class="t360-estacao" style="page-break-inside:avoid' + (ultima ? "" : ";page-break-after:always") + ';padding-top:6px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ' + ACCENT + ';padding-bottom:4px;margin-bottom:8px">'
      + '<b style="font-size:13px;color:' + ACCENT + '">' + esc(txt(pg.nome) || "Ponto") + "</b>"
      + '<span style="font-size:10px;color:#64748b">'
      + (txt(pg.nivel) ? esc(pg.nivel) + " · " : "")
      + (txt(pg.capturadoEm) ? "foto de " + esc(dataBR(pg.capturadoEm)) : "visita de " + esc(dataBR(dataVisita)))
      + "</span></div>"
      + molduraFoto(dataURI, pg)
      + blocoComentarios(pg.comentarios)
      + blocoMedidas(pg.medidas);
    if (!(pg.comentarios || []).length && !(pg.medidas || []).length) {
      h += '<div style="font-size:10.5px;color:#64748b;margin-top:8px">Sem comentários e sem medidas neste ponto.</div>';
    }
    return h + "</div>";
  }

  /* O miolo do documento. SÍNCRONO de propósito: quem chama já resolveu as
     fotos (`Rel.resolverFotos`) e entrega o mapa pronto em `opts.fotos` — é
     assim que o mesmo HTML serve para a impressão e para um teste que não
     tem IndexedDB nenhum.
     opts: { fotos, soComFoto, soAtencao, obraNome, local, autor } */
  Rel.html = function (tour, opts) {
    var o = opts || {};
    if (!M()) {
      return '<p style="font-size:12px;color:#7f1d1d">O motor do tour (js/tour360.js) não carregou nesta página — sem ele não há relatório.</p>';
    }
    var t = tour || {};
    var fotos = o.fotos || {};
    var pgs = M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao });
    var res = M().resumo(t);

    var i, semArquivo = 0;
    for (i = 0; i < pgs.length; i++) {
      if (pgs[i].foto && !(Object.prototype.hasOwnProperty.call(fotos, pgs[i].pid) && fotos[pgs[i].pid])) semArquivo++;
    }

    var h = '<table style="width:100%;font-size:11.5px;margin-bottom:10px">'
      + "<tr><td><b>Obra:</b> " + esc(txt(o.obraNome) || txt(t.obraNome) || "—") + "</td>"
      + "<td><b>Visita:</b> " + esc(dataBR(t.data)) + "</td></tr>"
      + "<tr><td><b>Tour:</b> " + esc(txt(t.titulo) || "—") + "</td>"
      + "<td><b>Responsável:</b> " + esc(txt(o.autor) || txt(t.autor) || "—") + "</td></tr>"
      + (txt(o.local) ? '<tr><td colspan="2"><b>Local:</b> ' + esc(o.local) + "</td></tr>" : "")
      + "</table>";

    h += '<div style="margin-bottom:10px">'
      + chip(res.pontos, res.pontos === 1 ? "ponto" : "pontos")
      + chip(res.comFoto, "com foto")
      + (res.semFoto ? chip(res.semFoto, "sem foto") : "")
      + chip(res.comentarios, res.comentarios === 1 ? "comentário" : "comentários")
      + (res.pontosDeAtencao ? chip(res.pontosDeAtencao, "de atenção") : "")
      + chip(res.medidas, res.medidas === 1 ? "medida" : "medidas")
      + "</div>";

    /* ⚠ item 2 do cabeçalho, agora no alto do documento: quem recebe o PDF
       precisa saber do buraco ANTES de folhear e concluir que a obra não foi
       fotografada. */
    if (res.fotosPendentes) {
      h += caixaAviso("<b>" + res.fotosPendentes + " foto(s) desta visita ainda não subiram para a nuvem.</b> "
        + "Elas estão no aparelho que fotografou e só aparecem para quem estiver nele. "
        + "Abra o tour naquele aparelho com internet para que subam.");
    }
    if (semArquivo) {
      h += caixaAviso("<b>" + semArquivo + " ponto(s) tinham foto, mas ela não entrou neste documento.</b> "
        + "Os arquivos não estão neste aparelho e ainda não chegaram à nuvem — o documento sai sem eles, e é isto que este aviso declara.");
    }
    if (res.semFoto && !o.soComFoto) {
      h += caixaAviso("<b>" + res.semFoto + " ponto(s) deste tour ainda não foram fotografados.</b> "
        + "Eles continuam no relatório porque são o que permite comparar esta visita com a próxima, do mesmo lugar.");
    }

    if (!pgs.length) {
      return h + caixaAviso("<b>Não há nada para mostrar neste relatório.</b> "
        + (o.soComFoto ? "Nenhum ponto deste tour tem foto." : "Este tour ainda não tem ponto nenhum."));
    }

    /* A nota das medidas só entra quando existe medida aproximada: aviso que
       aparece sempre vira moldura e a pessoa para de ler. */
    var temAprox = false;
    for (i = 0; i < pgs.length; i++) {
      var ms = pgs[i].medidas || [];
      for (var k = 0; k < ms.length; k++) if (Rel.textoMedida(ms[k]).aproximada) { temAprox = true; break; }
      if (temAprox) break;
    }

    h += '<div style="border-top:1px solid #ddd;margin:12px 0 0"></div>';
    for (i = 0; i < pgs.length; i++) {
      h += paginaHTML(pgs[i], fotos, t.data, i === pgs.length - 1 && !temAprox);
    }

    if (temAprox) {
      h += '<div style="page-break-inside:avoid;margin-top:12px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;padding:8px 10px;font-size:10.5px;color:#7c2d12">'
        + "<b>Sobre as medidas marcadas com ~</b><br>"
        + "As medidas deste relatório saem do ângulo dentro da foto panorâmica e da altura em que a câmera estava — não de trena. "
        + "As marcadas com <b>~</b> passaram de ±" + numBR(M().ERRO_AVISO_PCT, 0) + "% de erro estimado: para elas o documento mostra a FAIXA em metros, "
        + "porque o número sozinho seria lido como dimensão de projeto, e não é isso que ele é. "
        + "Servem para ordem de grandeza e para conferir o que se vê; conferência de projeto se faz em campo."
        + "</div>";
    }
    return h;
  };

  /* ---------------------------------------------------------------------
   * Resolver as fotos (assíncrono, com teto por foto)
   * ------------------------------------------------------------------- */

  function resolverUm(ref) {
    if (!ref) return Promise.resolve("");
    if (ref.d) return Promise.resolve(ref.d);      /* formato velho: os bytes já estão no registro */
    var F = global.Fotos;
    if (!F || typeof F.dataURI !== "function") return Promise.resolve("");
    return Promise.race([
      F.dataURI(ref).then(function (d) { return d || ""; }),
      new Promise(function (res) { global.setTimeout(function () { res(""); }, Rel.TIMEOUT_FOTO_MS); })
    ])["catch"](function () { return ""; });
  }

  /* Devolve { fotos: {pid: dataURI}, faltando, comRef, total }. `faltando`
     conta o ponto que TINHA referência de foto e mesmo assim voltou vazio —
     é ele que vira o aviso do documento. */
  Rel.resolverFotos = function (tour, opts) {
    var o = opts || {};
    var ps = ((tour && tour.pontos) || []);
    var alvos = [], i;
    for (i = 0; i < ps.length; i++) {
      if (o.soComFoto && !ps[i].foto) continue;
      alvos.push(ps[i]);
    }
    return Promise.all(alvos.map(function (p) {
      return resolverUm(p.foto).then(function (d) {
        return { pid: txt(p.pid), d: d || "", temRef: !!p.foto };
      });
    })).then(function (lista) {
      var mapa = {}, faltando = 0, comRef = 0, k;
      for (k = 0; k < lista.length; k++) {
        if (lista[k].temRef) comRef++;
        if (lista[k].d) mapa[lista[k].pid] = lista[k].d;
        else if (lista[k].temRef) faltando++;
      }
      return { fotos: mapa, faltando: faltando, comRef: comRef, total: lista.length };
    });
  };

  /* Abre o documento pronto para imprimir. Assíncrono porque as fotos são
     assíncronas — ver o cabeçalho.
     Resolve { ok, paginas, faltando, pendentes } ou { ok:false, motivo }. */
  Rel.abrir = function (tour, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ ok: false, motivo: "O motor do tour não carregou nesta página." });

    var t = tour || {};
    var res = M().resumo(t);
    if (!res.pontos) {
      return Promise.resolve({ ok: false, motivo: "Este tour ainda não tem ponto nenhum — não há relatório para gerar." });
    }
    if (o.soComFoto && !res.comFoto) {
      return Promise.resolve({ ok: false, motivo: "Nenhum ponto deste tour tem foto ainda." });
    }

    /* o mesmo recado do diário: resolver foto do servidor demora, e sem aviso
       o usuário clica de novo achando que o botão não pegou */
    if (res.comFoto && global.UI && typeof global.UI.toast === "function") {
      try { global.UI.toast("Preparando o relatório do tour…", "ok"); } catch (e) {}
    }

    return Rel.resolverFotos(t, o).then(function (r) {
      var op = {
        fotos: r.fotos,
        soComFoto: !!o.soComFoto,
        soAtencao: !!o.soAtencao,
        obraNome: o.obraNome,
        local: o.local,
        autor: o.autor
      };
      var corpo = Rel.html(t, op);
      var titulo = "Tour 360 — " + (txt(t.titulo) || dataBR(t.data));
      var cabec = "TOUR VIRTUAL DA OBRA · RELATÓRIO FOTOGRÁFICO";

      var G = global.Gestao;
      if (G && typeof G._docShell === "function" && typeof G._abrirDoc === "function") {
        G._abrirDoc(titulo, G._docShell(cabec, ACCENT, corpo, "tour360"));
      } else if (global.App && typeof global.App._abrirPrint === "function") {
        /* sem a Gestão carregada o documento sai sem o cabeçalho da empresa,
           mas sai — recusar aqui deixaria o usuário sem saída nenhuma */
        global.App._abrirPrint(titulo, corpo);
      } else {
        return { ok: false, motivo: "Não há como abrir o documento nesta tela." };
      }
      return {
        ok: true,
        paginas: M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao }).length,
        faltando: r.faltando,
        pendentes: res.fotosPendentes
      };
    });
  };

  /* =====================================================================
   * PARTE 2 — O VÍDEO
   * ================================================================== */

  /* Antes de oferecer o botão: dá para gravar aqui? Devolve o motivo do
     próprio BimVideo quando não dá — ele sabe distinguir "não tem gravador"
     de "tem gravador e não aceita formato nenhum", e um recado meu, genérico,
     jogaria os dois no mesmo balde. */
  Rel.podeGravar = function (viewer) {
    var vid = VID();
    if (!vid || typeof vid.suportado !== "function") {
      return { ok: false, motivo: "O gravador de vídeo (js/bimvideo.js) não carregou nesta página." };
    }
    var sup = vid.suportado();
    if (!sup.ok) return { ok: false, motivo: sup.motivo };
    var vw = viewer || V();
    if (!vw || typeof vw.quadro !== "function") {
      return { ok: false, motivo: "O visualizador 360 não carregou nesta página." };
    }
    if (typeof vw.montado === "function" && !vw.montado()) {
      return { ok: false, motivo: "Abra o tour na tela antes de gravar — o vídeo é gravado do que o visualizador desenha." };
    }
    return { ok: true, formato: sup.nome, ext: sup.ext };
  };

  function chaveFoto(lado, pid) { return lado + ":" + txt(pid); }

  /* Resolve as fotos que o PLANO vai pedir, dos dois lados quando é
     comparativo. Chave prefixada ("a:"/"b:") de propósito: além de separar os
     lados, ela impede que um pid chamado "constructor" caia no protótipo do
     objeto e devolva uma função no lugar de uma foto. */
  function fotosDoPlano(plano, tourA, tourB) {
    var vistos = {}, pids = [], i, pd;
    for (i = 0; i < plano.poses.length; i++) {
      pd = plano.poses[i] && plano.poses[i].pid;
      if (!pd) continue;
      if (Object.prototype.hasOwnProperty.call(vistos, "#" + pd)) continue;
      vistos["#" + pd] = true;
      pids.push(pd);
    }
    var pedidos = [];
    for (i = 0; i < pids.length; i++) {
      pedidos.push({ chave: chaveFoto("a", pids[i]), ponto: M().pontoDe(tourA, pids[i]) });
      if (tourB) pedidos.push({ chave: chaveFoto("b", pids[i]), ponto: M().pontoDe(tourB, pids[i]) });
    }
    return Promise.all(pedidos.map(function (p) {
      return resolverUm(p.ponto && p.ponto.foto).then(function (d) { return { chave: p.chave, d: d || "" }; });
    })).then(function (lista) {
      var mapa = {}, k;
      for (k = 0; k < lista.length; k++) if (lista[k].d) mapa[lista[k].chave] = lista[k].d;
      return { mapa: mapa, pids: pids };
    });
  }

  function pegar(mapa, chave) {
    return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : "";
  }

  function nomeArquivo(tour, tourB, ext) {
    var base = "Tour360" + (tourB ? "_comparativo" : "") + "_" + (txt(tour && tour.data) || "");
    var tit = txt(tour && tour.titulo).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 40);
    return (base + (tit ? "_" + tit : "")).replace(/_+/g, "_") + "." + (ext || "webm");
  }

  /* Grava o passeio.
   *
   * opts: { fps, segundosPorPonto, voltas, pitch, yawInicial, pausaFinal,
   *         largura, altura, bitrate, fov, aoAndar(i,n),
   *         comparativo: <outro tour> }   — o resto vai para o motor
   *
   * Resolve { blob, ext, nome, formato, quadros, duracaoSeg, quadrosPerdidos,
   *           pontos } e rejeita com Error(motivo) quando não dá para gravar.
   */
  Rel.gravar = function (tour, viewer, opts) {
    var o = opts || {};
    var vw = viewer || V();
    var vid = VID();

    if (!M()) return Promise.reject(new Error("O motor do tour não carregou nesta página."));
    if (!vid || typeof vid.gravar !== "function") return Promise.reject(new Error("O gravador de vídeo (js/bimvideo.js) não carregou nesta página."));
    if (!vw || typeof vw.quadro !== "function") return Promise.reject(new Error("O visualizador 360 não carregou nesta página."));
    /* ⚠ VISUALIZADOR DESMONTADO GRAVA ARQUIVO VAZIO EM SILÊNCIO. Sem a esfera
       na tela, `quadro()` devolve null a cada passo: todo quadro é pulado, o
       MediaRecorder para com zero quadro e o usuário recebe um arquivo que não
       abre — depois de esperar o passeio inteiro. Recusar aqui é a diferença
       entre um recado e um mistério. */
    if (typeof vw.montado === "function" && !vw.montado()) {
      return Promise.reject(new Error("Abra o tour na tela antes de gravar — o vídeo é gravado do que o visualizador 360 desenha."));
    }

    /* ⚠ PERGUNTA ANTES DE COMEÇAR, E DEVOLVE O MOTIVO DELE. Descobrir no meio
       da gravação que o navegador não grava significa o usuário esperar o
       passeio inteiro correr na tela para receber um erro no fim. */
    var sup = vid.suportado();
    if (!sup.ok) return Promise.reject(new Error(sup.motivo));

    var tourB = o.comparativo || null;
    var plano = tourB ? M().planoComparativo(tour, tourB, o) : M().planoVideo(tour, o);
    if (!plano.ok) return Promise.reject(new Error(plano.motivo));

    return fotosDoPlano(plano, tour, tourB).then(function (r) {
      var mapa = r.mapa;

      /* nenhuma foto resolvida: gravar renderizaria a esfera vazia e
         entregaria um arquivo preto com a duração certa — o pior defeito
         possível, porque parece que funcionou */
      var alguma = false, i;
      for (i = 0; i < r.pids.length; i++) {
        if (pegar(mapa, chaveFoto("a", r.pids[i]))) { alguma = true; break; }
      }
      if (!alguma) {
        throw new Error("Nenhuma das fotos deste tour está neste aparelho — o vídeo sairia em preto. Abra o tour com internet para que elas desçam e tente de novo.");
      }

      var cursor = 0;          /* ⚠ ver o comentário dentro de desenhar() */
      var pidNaTela = "";
      var pontoNaTela = null;
      var carregando = false;
      var falhou = {};
      var perdidos = 0;

      var ctxDes = {
        largura: num(o.largura, 1280),
        altura: num(o.altura, 720),
        bitrate: num(o.bitrate, 6000000),
        /* o BimVideo lê `rodape` DEPOIS de chamar desenhar() (js/bimvideo.js,
           dentro de passo()). É por isso que dá para trocá-lo a cada quadro
           aqui dentro e ter o nome do ponto acompanhando a imagem; se fosse
           lido antes, a faixa inteira sairia com o nome de um ponto só. */
        rodape: "",
        aoAndar: typeof o.aoAndar === "function" ? o.aoAndar : null,

        desenhar: function (data) {
          /* ⚠ O CONTRATO COM O BimVideo, E O DEFEITO QUE ELE EVITA.
             `BimVideo.gravar` chama desenhar(data) UMA vez por quadro, em
             ordem, e só passa a DATA — que é o que a faixa escreve. A câmera
             de cada quadro anda num array PARALELO (plano.poses), então o
             cursor daqui é o único elo entre os dois.
             Se ele deixar de andar num quadro que falhou (foto que não abriu,
             viewer que devolveu null), as poses seguintes passam a valer para
             quadros anteriores: o vídeo sai girando fora de hora, mostrando o
             ponto errado com a data certa, e nada acusa. Por isso o cursor
             anda AQUI, antes de qualquer linha que possa falhar. */
          var i = cursor;
          cursor++;

          var pose = plano.poses[i];
          if (!pose) { perdidos++; return null; }

          if (Object.prototype.hasOwnProperty.call(falhou, "#" + pose.pid)) { perdidos++; return null; }

          if (pose.pid !== pidNaTela) {
            pidNaTela = pose.pid;
            pontoNaTela = M().pontoDe(tour, pose.pid);
            carregando = true;
            var dA = pegar(mapa, chaveFoto("a", pose.pid));
            var dB = tourB ? pegar(mapa, chaveFoto("b", pose.pid)) : "";
            var pr;
            if (tourB && dA && dB && typeof vw.abrirComparativo === "function") {
              pr = vw.abrirComparativo(dA, dB, pontoNaTela);
            } else if (dA) {
              pr = vw.abrir(dA, pontoNaTela);
            } else {
              pr = Promise.resolve({ ok: false });
            }
            /* ⚠ NÃO SE PRÉ-DECODIFICA TUDO (item 4 do cabeçalho): a textura
               troca aqui, no meio da gravação, e por isso os quadros que caem
               na espera são PULADOS — devolver o canvas antigo poria a foto
               do ponto anterior debaixo do nome do ponto novo, que é mentir
               com imagem. Quadro pulado encurta o vídeo; ele é contado e
               devolvido em `quadrosPerdidos` para a tela poder dizer isso. */
            pr.then(function (res) {
              carregando = false;
              if (!res || res.ok === false) falhou["#" + pose.pid] = true;
            })["catch"](function () {
              carregando = false;
              falhou["#" + pose.pid] = true;
            });
          }

          if (carregando) { perdidos++; return null; }

          try {
            /* ⚠ O YAW DO PLANO É O CORRIGIDO; O VIEWER GIRA NO BRUTO.
               `Tour360.corrigir` faz bruto − nortear = corrigido, e
               `aplicarGiroDoPonto` (tour360view.js) abre a estação em
               S.yaw = nortear. Somar de volta é o que faz duas visitas
               olharem para a MESMA parede — sem isso, a cortina do
               comparativo abre em paredes opostas quando o fotógrafo começou
               o giro de lados diferentes, e o cliente vê "mudança" onde não
               houve nenhuma. */
            var pt = pontoNaTela || {};
            var yawTela = M().normalizarYaw(num(pose.yaw, 0) + num(pt.nortear, 0));
            var pitchTela = num(pose.pitch, 0) + num(pt.horizonte, 0);
            vw.olharPara(yawTela, pitchTela, o.fov);
            if (pose.cortina !== undefined && typeof vw.cortina === "function") vw.cortina(pose.cortina);
          } catch (e) { perdidos++; return null; }

          ctxDes.rodape = txt(pose.nome);

          /* ⚠ `quadro()` renderiza SÍNCRONO de propósito (tour360view.js): aba
             oculta não recebe requestAnimationFrame, e sem esse render o vídeo
             sairia em branco sem erro nenhum. Não troque por pose()+canvas. */
          var cv = vw.quadro();
          if (!cv) { perdidos++; return null; }
          return { canvas: cv };
        }
      };

      return vid.gravar(plano, ctxDes).then(function (res) {
        return {
          blob: res.blob,
          ext: res.ext,
          nome: nomeArquivo(tour, tourB, res.ext),
          formato: res.nome,
          quadros: res.quadros,
          duracaoSeg: res.duracaoSeg,
          quadrosPerdidos: perdidos,
          pontos: plano.pontos
        };
      });
    });
  };

  /* Para uma gravação em andamento. `BimVideo.cancelar` é trocado a cada
     gravação, então chamar o de agora é o certo. */
  Rel.cancelar = function () {
    var vid = VID();
    if (vid && typeof vid.cancelar === "function") { try { vid.cancelar(); } catch (e) {} return true; }
    return false;
  };

  /* Oferece o arquivo ao usuário. Recebe o que `Rel.gravar` resolveu. */
  Rel.baixar = function (res, nome) {
    if (!res || !res.blob) return { ok: false, motivo: "Não há vídeo para baixar." };
    var doc = global.document;
    if (!doc || !global.URL || typeof global.URL.createObjectURL !== "function") {
      return { ok: false, motivo: "Este navegador não deixa salvar o arquivo direto." };
    }
    var url = global.URL.createObjectURL(res.blob);
    var a = doc.createElement("a");
    a.href = url;
    a.download = txt(nome) || txt(res.nome) || ("tour360." + (res.ext || "webm"));
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    /* ⚠ REVOGAR, MAS NÃO AGORA. O blob de um vídeo segura dezenas de MB
       enquanto a URL existir, e nunca revogar deixa isso preso até a aba
       fechar. Revogar na linha seguinte ao clique, porém, cancela o download
       que o navegador ainda nem começou — o arquivo sai com 0 byte. O atraso
       é a única saída; 30 s cobre a partida do download com folga. */
    global.setTimeout(function () {
      try { global.URL.revokeObjectURL(url); } catch (e) {}
    }, 30000);
    return { ok: true, nome: a.download };
  };

  global.Tour360Rel = Rel;
  if (typeof module !== "undefined" && module.exports) module.exports = Rel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
