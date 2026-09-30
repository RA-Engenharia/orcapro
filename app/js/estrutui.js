/* =====================================================================
 * estrutui.js — A TELA do projeto estrutural no canteiro e do filtro por
 * disciplina/etapa do BIM. Desenho PURO: recebe dados prontos, devolve
 * HTML. Não lê o DOM, não grava, não chama rede — roda em Node
 * (tools/test-estrutui.js). A fiação (arquivo, pdf.js, IndexedDB, 3D) é
 * do js/gestao.js (`_est*`, `_bimDisc*`).
 *
 * O QUE O CANTEIRO VÊ, POR PEÇA (sem prancha):
 *   o RECORTE do desenho do projeto (a vista do calculista, como está no
 *   PDF), a tabela de barras da peça (posição, aço, bitola, quantidade,
 *   espaçamento, comprimento, metro e peso), o cobrimento do tipo de peça,
 *   o concreto (fck, a/c, agregado) e os apoios — e o botão que isola a
 *   peça e a armação dela no 3D.
 *
 * ⚠ O RECORTE É DO PROJETO, NÃO UM DESENHO NOSSO. Redesenhar a armação a
 *   partir do texto seria inventar posição de barra; o que a pessoa vê é o
 *   desenho que o calculista assinou, recortado. Os números da tabela vêm
 *   das chamadas do próprio desenho (js/estrutpdf.js) e a conferência diz
 *   se elas somam a relação do aço.
 *
 * ⚠ O PESO DA PEÇA É NOMINAL (sem os 10 %). Os 10 % de perda são da
 *   compra, e já estão no resumo do projeto (lista de material). Somar
 *   perda por peça e depois de novo no total contaria duas vezes.
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) {
    return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* número BR: 1.234,56 */
  function fmt(v, casas) {
    if (v == null || v === "" || !isFinite(+v)) return "—";
    var n = +v, c = casas == null ? 2 : casas;
    var s = Math.abs(n).toFixed(c), p = s.split("."), int = p[0], dec = p[1] || "";
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-" : "") + int + (c ? "," + dec : "");
  }
  function bitola(d) { return "ø" + (d % 1 ? fmt(d, 1) : fmt(d, 0)); }
  function ic(nome, t) { return (typeof global.Icones !== "undefined" && global.Icones.get) ? global.Icones.get(nome, t || 14) : ""; }
  function norm(s) { return txt(s).toUpperCase().replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }

  /* ------------------------------------------------------------------
   * DISCIPLINAS E ETAPAS (filtro do 3D)
   * ------------------------------------------------------------------ */
  function htmlDisc(grupos, etapas, est) {
    est = est || {};
    var aba = (est.aba === "etapa" || est.aba === "montagem") ? est.aba : "disc", marc = est.marcados || {};
    var lista = aba === "etapa" ? arr(etapas) : (aba === "montagem" ? arr(est.montagens) : arr(grupos));
    var tem = {}; arr(grupos).forEach(function (g) { tem[g.id] = g.n; });
    var atalhos = arr(est.atalhos).filter(function (a) { return tem[a.id] > 0; });
    var h = '<div class="edisc">';
    if (atalhos.length) {
      h += '<div class="edisc-atalhos">' + atalhos.map(function (a) {
        return '<button type="button" class="btn sm" data-edisc="so" data-v="' + esc(a.id) + '">' + esc(a.rotulo) + "</button>";
      }).join("") + "</div>";
    }
    h += '<div class="edisc-abas" role="tablist">' +
      '<button type="button" class="btn sm' + (aba === "disc" ? " primary" : "") + '" data-edisc="aba" data-v="disc" role="tab" aria-selected="' + (aba === "disc") + '">Disciplina</button>' +
      '<button type="button" class="btn sm' + (aba === "etapa" ? " primary" : "") + '" data-edisc="aba" data-v="etapa" role="tab" aria-selected="' + (aba === "etapa") + '">Etapa construtiva</button>' +
      '<button type="button" class="btn sm' + (aba === "montagem" ? " primary" : "") + '" data-edisc="aba" data-v="montagem" role="tab" aria-selected="' + (aba === "montagem") + '">Montagem</button></div>';
    if (!lista.length) {
      h += '<p class="muted edisc-vazio">Carregue um modelo .IFC no visualizador para filtrar por ' + (aba === "etapa" ? "etapa construtiva" : (aba === "montagem" ? "etapa de montagem" : "disciplina")) + ".</p></div>";
      return h;
    }
    /* a SEQUÊNCIA executiva: passo a passo, o que já subiu fica e a etapa do
       passo aparece destacada — é como a equipe vê a ordem de montagem */
    if (aba === "montagem") {
      var sq = est.seq || {}, nEt = lista.filter(function (g) { return g.ordem < 2e9; }).length;
      if (!nEt) {
        h += '<p class="muted edisc-vazio">As peças deste modelo não têm o carimbo <b>OrcaPRO_Montagem</b> — sem ele não dá para montar a sequência. Use a aba Etapa construtiva.</p>';
      } else {
        var kk = sq.k == null ? -1 : sq.k;
        h += '<div class="edisc-seq" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0;padding:6px 8px;border:1px solid var(--borda,#d6dde3);border-radius:6px">' +
          '<button type="button" class="btn sm" data-edisc="seq" data-v="ant"' + (kk <= 0 ? " disabled" : "") + ' title="Etapa anterior">◀</button>' +
          '<span class="edisc-seq-rot" style="flex:1;min-width:150px;font-size:12px">' + (kk < 0 ? "Sequência de montagem: <b>" + nEt + " etapas</b>" : "Passo <b>" + (kk + 1) + " de " + nEt + "</b> — " + esc(sq.nome || "")) + "</span>" +
          '<button type="button" class="btn sm" data-edisc="seq" data-v="prox"' + (kk >= nEt - 1 ? " disabled" : "") + ' title="Próxima etapa">▶</button>' +
          '<button type="button" class="btn sm' + (sq.tocando ? " primary" : "") + '" data-edisc="seq" data-v="' + (sq.tocando ? "parar" : "tocar") + '">' + (sq.tocando ? "■ Parar" : "▶▶ Reproduzir") + "</button></div>";
      }
    }
    h += '<div class="edisc-lista">';
    lista.forEach(function (g) {
      var fonte = "";
      if (aba === "disc") {
        fonte = g.regra && !g.carimbo ? "por regra" : (g.regra ? g.carimbo + " carimbada(s), " + g.regra + " por regra" : "carimbada");
      }
      h += '<div class="edisc-lin">' +
        '<label class="edisc-ck"><input type="checkbox" data-edisc-ck="' + esc(g.id) + '"' + (marc[g.id] ? " checked" : "") + ">" +
        (aba === "disc" ? '<span class="edisc-cor" style="background:' + esc(g.cor) + '"></span>' : "") +
        '<span class="edisc-nome">' + esc(g.nome) + "</span></label>" +
        '<span class="muted edisc-n">' + fmt(g.n, 0) + " peça" + (g.n === 1 ? "" : "s") + (fonte ? " · " + esc(fonte) : "") + "</span>" +
        '<button type="button" class="btn sm" data-edisc="so" data-v="' + esc(g.id) + '" title="Mostra só este grupo">Só</button></div>';
    });
    h += "</div>";
    var nMarc = lista.filter(function (g) { return marc[g.id]; }).length;
    h += '<div class="edisc-acoes">' +
      '<button type="button" class="btn sm primary" data-edisc="isolar"' + (nMarc ? "" : " disabled") + '>' + ic("alvo") + "Mostrar só as marcadas</button>" +
      '<button type="button" class="btn sm" data-edisc="raiox"' + (nMarc ? "" : " disabled") + ' title="As marcadas ficam sólidas; o resto, translúcido — a armação aparece dentro da sapata">' + ic("camadas") + "Raio-X no resto</button>" +
      (aba === "disc" ? '<button type="button" class="btn sm" data-edisc="pintar" title="Pinta cada disciplina com a cor da lista">' + ic("paleta") + "Pintar por disciplina</button>" : "") +
      '<button type="button" class="btn sm" data-edisc="tudo">' + ic("voltar") + "Mostrar tudo</button></div>";
    if (aba === "disc") {
      h += '<p class="muted edisc-nota">"Carimbada" = a peça traz o parâmetro <b>OrcaPRO_Disciplina</b> (plugin Revit ou modelo da obra). "Por regra" = sem carimbo, o grupo foi deduzido do tipo e do nome da peça — confira antes de tirar quantidade daqui.</p>';
    } else if (aba === "montagem") {
      h += '<p class="muted edisc-nota">A etapa de montagem é o carimbo <b>OrcaPRO_Montagem</b> (M01, M02…): a ordem em que as peças sobem na obra. No passo a passo, o que já foi montado fica no modelo e a etapa do passo aparece em laranja.</p>';
    } else {
      h += '<p class="muted edisc-nota">A etapa é o carimbo <b>OrcaPRO_Etapa</b> — a mesma do cronograma 4D. Peça sem etapa aparece em "Sem etapa".</p>';
    }
    return h + "</div>";
  }

  /* ------------------------------------------------------------------
   * PROJETO ESTRUTURAL — alvo 3D de uma vista (peças pelo carimbo)
   * ------------------------------------------------------------------ */
  /* ⚠ CASA POR IDENTIDADE, NUNCA POR SEMELHANÇA: "V1" do baldrame não é a
   * "V1" do topo — a peça carrega "BALDRAMES/V1" e a vista de viga casa com
   * pavimento + nome. Sapata/pilar/laje casam pelo nome exato. */
  function alvoDetalhe(proj, vista) {
    var exatos = {}, prefixos = [], rx = null;
    if (!vista) return { exatos: exatos, prefixos: prefixos, rx: rx };
    if (!vista.folha) {
      arr(vista.elementos).forEach(function (n) {
        if (vista.grupo === "vigas" && vista.pavimento) exatos[norm(vista.pavimento + "/" + n)] = 1;
        else exatos[norm(n)] = 1;
      });
      return { exatos: exatos, prefixos: prefixos, rx: rx };
    }
    if (vista.grupo === "sapatas") rx = "^[SP]\\d+[A-Z]?$";
    /* a planta de locação também é das ESTACAS (E1, E12, E2-3, E1/2-1): fundação
       profunda não tem sapata, e sem isto o "Ver no 3D" da folha de locação de
       um projeto de estacas não achava peça nenhuma (30/09/2026) */
    else if (vista.grupo === "locacao") rx = "^([SP]\\d+[A-Z]?|E\\d+[A-Z]?(/\\d+)?(-\\d+)?)$";
    else if (vista.grupo === "pilares") rx = "^P\\d+[A-Z]?$";
    else if (vista.grupo === "lajes") rx = "/L\\d+[A-Z]?$";
    else if (vista.grupo === "vigas" && vista.pavimento) prefixos.push(norm(vista.pavimento + "/V"));
    else if (vista.pavimento) prefixos.push(norm(vista.pavimento + "/"));
    return { exatos: exatos, prefixos: prefixos, rx: rx };
  }
  function casaDetalhe(alvo, detalhe) {
    var d = norm(detalhe);
    if (!d || !alvo) return false;
    if (alvo.exatos && alvo.exatos[d]) return true;
    for (var i = 0; i < arr(alvo.prefixos).length; i++) if (d.indexOf(alvo.prefixos[i]) === 0) return true;
    if (alvo.rx && new RegExp(alvo.rx, "i").test(d)) return true;
    return false;
  }

  /* rótulo de seção para agrupar as vistas na tela */
  function secaoDaVista(v) {
    if (v.folha) return { ordem: 9, nome: "Pranchas inteiras" };
    if (v.grupo === "sapatas") return { ordem: 1, nome: "Sapatas" };
    if (v.grupo === "pilares") return { ordem: 2, nome: "Pilares" };
    if (v.grupo === "vigas") return { ordem: 3, nome: "Vigas" + (v.pavimento ? " — " + v.pavimento.charAt(0) + v.pavimento.slice(1).toLowerCase() : "") };
    if (v.grupo === "lajes") return { ordem: 4, nome: "Lajes" };
    return { ordem: 8, nome: "Outros detalhes" };
  }
  function secoesDeVistas(proj) {
    var mapa = {}, out = [];
    arr(proj && proj.vistas).forEach(function (v) {
      var s = secaoDaVista(v), k = s.ordem + "|" + s.nome;
      if (!mapa[k]) { mapa[k] = { ordem: s.ordem, nome: s.nome, vistas: [] }; out.push(mapa[k]); }
      mapa[k].vistas.push(v);
    });
    out.sort(function (a, b) { return (a.ordem - b.ordem) || (a.nome < b.nome ? -1 : 1); });
    out.forEach(function (s) {
      s.vistas.sort(function (a, b) {
        var na = parseInt((txt(a.elementos[0]).match(/\d+/) || ["0"])[0], 10), nb = parseInt((txt(b.elementos[0]).match(/\d+/) || ["0"])[0], 10);
        return (na - nb) || (a.pagina - b.pagina);
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------
   * PROJETO ESTRUTURAL — cabeçalho, abas, vistas
   * ------------------------------------------------------------------ */
  function htmlEstVazio(temObra) {
    return '<div class="est-vazio"><p>Carregue o <b>PDF do projeto estrutural</b> (fundação, pilares, vigas, lajes). O OrçaPRO lê as pranchas e monta, para cada sapata, pilar e viga, a <b>vista de detalhamento como está no projeto</b>, a armação, o cobrimento e a <b>lista de material</b> — para executar no canteiro sem prancha.</p>' +
      (temObra ? "" : '<p class="est-aviso">Escolha a obra no alto da tela: o projeto fica guardado nela.</p>') +
      '<p class="muted">Funciona com o PDF vetorial que o programa de cálculo exporta (Eberick, TQS, CAD/TQS e semelhantes). PDF escaneado (foto da prancha) não tem texto para ler.</p></div>';
  }

  function htmlEstCab(regs, selId, proj, st) {
    st = st || {};
    var h = '<div class="est-cab">';
    if (arr(regs).length > 1) {
      h += '<select data-est="sel" class="sel sm" title="Projeto estrutural desta obra">' + arr(regs).map(function (r) {
        return '<option value="' + esc(r.id) + '"' + (r.id === selId ? " selected" : "") + ">" + esc(r.nome || r.arquivo || r.id) + "</option>";
      }).join("") + "</select>";
    }
    h += '<button type="button" class="btn sm primary" data-est="carregar">' + ic("importar") + (proj ? "Carregar outro PDF" : "Carregar PDF do projeto") + "</button>";
    if (proj) h += '<button type="button" class="btn sm danger" data-est="remover" title="Tira este projeto da obra (o PDF guardado neste computador sai junto)">' + ic("lixeira") + "</button>";
    h += "</div>";
    if (proj) {
      var c = st.conferencia || { ok: 0, falhas: 0, total: 0 };
      var rot = c.total ? (c.falhas ? c.falhas + " de " + c.total + " conferências NÃO batem" : "as " + c.total + " conferências batem") : "sem conferência";
      h += '<div class="est-resumo"><b>' + esc(st.nome || proj.codigo || "Projeto estrutural") + "</b>" +
        '<span class="muted">' + arr(proj.folhas).length + " prancha(s)" + (proj.data ? " · " + esc(proj.data) : "") + " · " + arr(proj.pilares).length + " pilar(es) · " + arr(proj.vigas).length + " viga(s) · " + arr(proj.lajes).length + " laje(s)</span>" +
        '<span class="est-selo ' + (c.falhas ? "ruim" : "bom") + '">' + ic(c.falhas ? "alerta" : "check", 13) + esc(rot) + "</span>" +
        (st.semPdf ? '<p class="est-aviso">' + ic("alerta", 13) + 'O PDF deste projeto não está neste computador — os números aparecem, os desenhos não. <button type="button" class="btn sm" data-est="reanexar">Anexar o arquivo ' + esc(st.arquivo || "") + "</button></p>" : "") +
        "</div>";
    }
    return h;
  }

  function htmlEstAbas(aba) {
    var abas = [["vistas", "Vistas do projeto"], ["material", "Lista de material"], ["espec", "Especificações"], ["conf", "Conferência"]];
    return '<div class="est-abas" role="tablist">' + abas.map(function (a) {
      return '<button type="button" class="btn sm' + (aba === a[0] ? " primary" : "") + '" data-est="aba" data-v="' + a[0] + '" role="tab" aria-selected="' + (aba === a[0]) + '">' + a[1] + "</button>";
    }).join("") + "</div>";
  }

  function nBarrasDaVista(v) {
    var n = 0; arr(v.armacao).forEach(function (a) { if (a.definitiva) n += a.quant; }); return n;
  }
  function htmlVistas(proj, pecasPorVista) {
    pecasPorVista = pecasPorVista || {};
    var secs = secoesDeVistas(proj);
    if (!secs.length) return '<p class="muted">Nenhuma vista foi reconhecida nas pranchas.</p>';
    return secs.map(function (s) {
      return '<section class="est-sec"><h4>' + esc(s.nome) + ' <span class="muted">(' + s.vistas.length + ")</span></h4><div class=\"est-grade\">" +
        s.vistas.map(function (v) {
          var nb = nBarrasDaVista(v), np = pecasPorVista[v.id];
          var sub = [];
          if (!v.folha && v.multiplicidade > 1) sub.push(v.multiplicidade + " peças iguais");
          if (nb) sub.push(nb + " barra" + (nb === 1 ? "" : "s") + (v.multiplicidade > 1 ? " cada" : ""));
          if (arr(v.apoios).length > 1) sub.push(v.apoios.join(" → "));
          if (np != null) sub.push(np ? np + " no 3D" : "fora do modelo");
          return '<button type="button" class="est-card" data-est="vista" data-v="' + esc(v.id) + '" title="Abrir a vista ' + esc(v.titulo) + '">' +
            '<canvas class="est-thumb" data-est-thumb="' + esc(v.id) + '" width="1" height="1"></canvas>' +
            '<b class="est-card-tit">' + esc(v.titulo) + "</b>" +
            '<span class="muted est-card-sub">' + esc(sub.join(" · ")) + (v.folha ? " · folha " + esc(v.folhaRot || "") : "") + "</span></button>";
        }).join("") + "</div></section>";
    }).join("");
  }

  /* a tabela de barras de UMA peça da vista (chamadas definitivas do desenho) */
  function htmlArmacao(linhas, mult) {
    if (!arr(linhas).length) return '<p class="muted">Esta vista não tem chamada de armação legível (planta ou corte).</p>';
    var tm = 0, tk = 0;
    var h = '<table class="est-tab"><thead><tr><th>Pos.</th><th>Aço</th><th>Bitola</th><th class="n">Quant.</th><th class="n">Espaç. (cm)</th><th class="n">C (cm)</th><th class="n">Total (m)</th><th class="n">Peso (kg)</th></tr></thead><tbody>';
    arr(linhas).forEach(function (l) {
      if (l.m != null) tm += l.m; if (l.kg != null) tk += l.kg;
      h += "<tr><td><b>N" + esc(l.n) + "</b></td><td>" + esc(l.aco || "—") + "</td><td>" + esc(bitola(l.diam)) + '</td><td class="n">' + fmt(l.quant, 0) + '</td><td class="n">' + (l.espac != null ? fmt(l.espac, l.espac % 1 ? 1 : 0) : "—") +
        '</td><td class="n">' + (l.comp === "VAR" ? "variável" : fmt(l.comp, 0)) + '</td><td class="n">' + (l.m != null ? fmt(l.m, 2) : "—") + '</td><td class="n">' + (l.kg != null ? fmt(l.kg, 2) : "—") + "</td></tr>";
    });
    h += '</tbody><tfoot><tr><td colspan="6">Total de uma peça (peso nominal, sem perda)</td><td class="n">' + fmt(tm, 2) + '</td><td class="n">' + fmt(tk, 2) + "</td></tr>";
    if (mult > 1) h += '<tr><td colspan="6">× ' + mult + " peças iguais nesta vista</td><td class=\"n\">" + fmt(tm * mult, 2) + '</td><td class="n">' + fmt(tk * mult, 2) + "</td></tr>";
    return h + "</tfoot></table>";
  }

  function htmlVistaDetalhe(proj, vista, info) {
    info = info || {};
    var esp = (proj && proj.especificacoes) || {};
    var h = '<div class="est-det" data-modal-largo>';
    h += '<div class="est-crop-wrap"><canvas id="est-crop" class="est-crop" width="1" height="1"></canvas>' +
      (info.semPdf ? '<p class="est-aviso">O PDF não está neste computador: anexe o arquivo para ver o desenho.</p>' : '<p class="muted est-crop-legenda">Recorte da folha ' + esc(info.folha || "") + ' do projeto — como o calculista desenhou. Role/zoom com o navegador; "Folha inteira" abre a prancha toda.</p>') +
      "</div>";
    h += '<div class="est-det-info">';
    var tipo = info.tipoPeca ? info.tipoPeca : "";
    var cob = info.cobrimento;
    var chips = [];
    if (!vista.folha && vista.multiplicidade > 1) chips.push(vista.multiplicidade + " peças: " + vista.elementos.join(", "));
    if (arr(vista.apoios).length > 1) chips.push("apoios " + vista.apoios.join(" → "));
    if (vista.pavimento) chips.push("pavimento " + vista.pavimento);
    if (cob != null) chips.push("cobrimento " + fmt(cob, 1) + " cm" + (tipo ? " (" + tipo + ")" : ""));
    if (esp.fckMPa) chips.push("concreto fck ≥ " + esp.fckMPa + " MPa" + (esp.relacaoAc ? ", a/c ≤ " + fmt(esp.relacaoAc, 2) : "") + (esp.agregadoMaxMm ? ", agregado ≤ " + esp.agregadoMaxMm + " mm" : ""));
    if (chips.length) h += '<div class="est-chips">' + chips.map(function (c) { return '<span class="est-chip">' + esc(c) + "</span>"; }).join("") + "</div>";
    if (info.dimensoes) h += '<p class="est-dim">' + esc(info.dimensoes) + "</p>";
    h += "<h4>Armação" + (vista.multiplicidade > 1 ? " de cada peça" : "") + "</h4>" + htmlArmacao(info.linhas, vista.folha ? 1 : vista.multiplicidade);
    if (info.conferencia) h += '<p class="' + (info.conferencia.ok ? "muted" : "est-aviso") + '">' + esc(info.conferencia.texto) + "</p>";
    h += "</div></div>";
    return h;
  }

  /* ------------------------------------------------------------------
   * LISTA DE MATERIAL, ESPECIFICAÇÕES, CONFERÊNCIA
   * ------------------------------------------------------------------ */
  function htmlLista(L) {
    if (!L) return "";
    var h = '<div class="est-lista">';
    h += "<h4>Aço (do resumo do projeto, já com +10 % de perda)</h4>";
    h += '<table class="est-tab"><thead><tr><th>Aço</th><th>Bitola</th><th class="n">Comprimento (m)</th><th class="n">Peso +10 % (kg)</th><th class="n">Barras de 12 m</th></tr></thead><tbody>' +
      arr(L.aco).map(function (a) { return "<tr><td>" + esc(a.aco) + "</td><td>" + esc(bitola(a.diam)) + '</td><td class="n">' + fmt(a.m, 1) + '</td><td class="n">' + fmt(a.kg, 1) + '</td><td class="n">' + fmt(a.barras12m, 0) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td colspan="3">Total de aço</td><td class="n">' + fmt(L.totais.acoKg, 1) + "</td><td></td></tr></tfoot></table>";
    h += "<h4>Concreto" + (L.fckMPa ? " (fck ≥ " + L.fckMPa + " MPa)" : "") + " e fôrma</h4>";
    h += '<table class="est-tab"><thead><tr><th>Peças</th><th class="n">Aço (kg)</th><th class="n">Concreto (m³)</th><th class="n">Fôrma (m²)</th></tr></thead><tbody>' +
      arr(L.porGrupo).map(function (g) { return "<tr><td>" + esc(g.grupo) + (g.resumoLido ? "" : ' <span class="est-aviso">resumo não lido</span>') + '</td><td class="n">' + fmt(g.acoKg, 1) + '</td><td class="n">' + fmt(g.concretoM3, 2) + '</td><td class="n">' + fmt(g.formaM2, 2) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td>Total</td><td class="n">' + fmt(L.totais.acoKg, 1) + '</td><td class="n">' + fmt(L.totais.concretoM3, 2) + '</td><td class="n">' + fmt(L.totais.formaM2, 2) + "</td></tr></tfoot></table>";
    if (L.totais.taxaKgM3) h += '<p class="muted">Taxa de armadura do projeto: ' + fmt(L.totais.taxaKgM3, 1) + " kg de aço por m³ de concreto.</p>";
    if (arr(L.cobrimentos).length) {
      h += "<h4>Cobrimentos (espaçadores)</h4><table class=\"est-tab\"><tbody>" + arr(L.cobrimentos).map(function (c) {
        return "<tr><td>" + esc(c.elemento) + '</td><td class="n">' + fmt(c.cm, 1) + " cm</td></tr>";
      }).join("") + "</tbody></table>";
      h += '<p class="muted">A quantidade de espaçadores não está no projeto: o OrçaPRO não a estima aqui.</p>';
    }
    return h + "</div>";
  }

  function htmlEspecificacoes(esp) {
    esp = esp || {};
    var linhas = [
      ["Concreto", esp.fckMPa ? "fck ≥ " + esp.fckMPa + " MPa" : null],
      ["Relação água/cimento", esp.relacaoAc ? "≤ " + fmt(esp.relacaoAc, 2) : null],
      ["Consumo mínimo de cimento", esp.consumoMinKgM3 ? esp.consumoMinKgM3 + " kg/m³" : null],
      ["Classe de agressividade", esp.classeAgressividade],
      ["Agregado máximo", esp.agregadoMaxMm ? esp.agregadoMaxMm + " mm" : null],
      ["Tensão admissível do terreno", esp.tensaoAdmKgfCm2 ? "≥ " + fmt(esp.tensaoAdmKgfCm2, 2) + " kgf/cm²" : null],
      ["Cota de assentamento das sapatas", esp.cotaAssentamentoM ? fmt(esp.cotaAssentamentoM, 2) + " m" : null],
      ["Carga permanente", esp.cargaPermanenteKgfM2 ? esp.cargaPermanenteKgfM2 + " kgf/m²" : null],
      ["Carga acidental", esp.cargaAcidentalKgfM2 ? esp.cargaAcidentalKgfM2 + " kgf/m²" : null],
      ["Módulo de elasticidade secante", esp.moduloSecanteKgfCm2 ? fmt(esp.moduloSecanteKgfCm2, 0) + " kgf/cm²" : null]
    ];
    var h = '<table class="est-tab"><tbody>' + linhas.map(function (l) {
      return "<tr><td>" + esc(l[0]) + "</td><td>" + (l[1] ? esc(l[1]) : '<span class="muted">não encontrado no PDF</span>') + "</td></tr>";
    }).join("") + "</tbody></table>";
    if (arr(esp.cobrimentos).length) h += "<h4>Cobrimentos</h4>" + '<table class="est-tab"><tbody>' + arr(esp.cobrimentos).map(function (c) {
      return "<tr><td>" + esc(c.elemento) + '</td><td class="n">' + fmt(c.cm, 1) + " cm</td></tr>";
    }).join("") + "</tbody></table>";
    return h;
  }

  function htmlConferencia(c, resumo) {
    var r = resumo || { ok: 0, falhas: 0, total: 0 };
    var h = '<p class="' + (r.falhas ? "est-aviso" : "muted") + '">' + (r.total ? (r.falhas ? r.falhas + " de " + r.total + " conferências NÃO batem — confira a leitura antes de usar os números." : "As " + r.total + " conferências batem: relação × resumo × detalhes, pesos e (nas sapatas) volume e fôrma.") : "Nada foi conferido.") + "</p>";
    var falhas = arr(c).filter(function (x) { return !x.ok; }), oks = arr(c).filter(function (x) { return x.ok; });
    function linha(x) {
      return '<tr class="' + (x.ok ? "" : "ruim") + '"><td>' + (x.ok ? ic("check", 13) : ic("alerta", 13)) + "</td><td>" + esc(x.grupo) + "</td><td>" + esc(x.item) + '</td><td class="n">' + esc(x.esperado) + '</td><td class="n">' + esc(x.lido) + "</td><td>" + esc(x.nota) + "</td></tr>";
    }
    return h + '<table class="est-tab est-conf"><thead><tr><th></th><th>Tabela</th><th>O que foi conferido</th><th class="n">Conta</th><th class="n">No PDF</th><th>Nota</th></tr></thead><tbody>' +
      falhas.map(linha).join("") + oks.map(linha).join("") + "</tbody></table>";
  }

  /* ------------------------------------------------------------------
   * IMPRESSÃO PARA O CANTEIRO (papel branco)
   * ------------------------------------------------------------------ */
  /* ⚠ CONTEÚDO, NÃO DOCUMENTO: vai para o App._abrirPrint, que põe a folha
   * branca e o botão "Imprimir / Salvar PDF". CSS com escopo `.estp` para não
   * vazar para a tela do app que continua aberta atrás. */
  var CSS_PAPEL = ".estp{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}.estp h1{font-size:20px;margin:0 0 4px}.estp h2{font-size:16px;margin:14px 0 6px}" +
    ".estp .sub{color:#444;margin:0 0 10px}.estp .crop{width:100%;border:1px solid #999;margin:6px 0 10px}.estp table{border-collapse:collapse;width:100%;margin:4px 0 10px}" +
    ".estp th,.estp td{border:1px solid #999;padding:4px 6px;font-size:13px;text-align:left;color:#111;background:#fff}.estp td.n,.estp th.n{text-align:right}.estp tfoot td{font-weight:bold}" +
    ".estp .chips span{display:inline-block;border:1px solid #666;border-radius:10px;padding:2px 8px;margin:0 6px 6px 0;font-size:13px}" +
    ".estp .pag{page-break-after:always}.estp .pag:last-child{page-break-after:auto}.estp .aviso{color:#9a3412}";
  function htmlImpressao(titulo, obra, blocos) {
    return '<div class="estp"><style>' + CSS_PAPEL + "</style>" +
      arr(blocos).map(function (b) {
        return '<div class="pag"><h1>' + esc(b.titulo) + '</h1><p class="sub">' + esc(obra || "") + (b.sub ? " · " + esc(b.sub) : "") + "</p>" +
          (b.img ? '<img class="crop" src="' + esc(b.img) + '" alt="' + esc(b.titulo) + '">' : (b.semImg ? '<p class="aviso">' + esc(b.semImg) + "</p>" : "")) +
          (b.chips && b.chips.length ? '<div class="chips">' + b.chips.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>" : "") +
          (b.html || "") + "</div>";
      }).join("") + "</div>";
  }

  /* CSV da lista de material (Excel BR: ; e vírgula decimal) */
  function csvLista(L) {
    var l = ["Tipo;Descrição;Unidade;Quantidade"];
    arr(L && L.aco).forEach(function (a) { l.push("Aço;" + a.aco + " " + bitola(a.diam) + " mm (+10 %);kg;" + fmt(a.kg, 2).replace(/\./g, "")); });
    arr(L && L.aco).forEach(function (a) { l.push("Aço;" + a.aco + " " + bitola(a.diam) + " mm — barras de 12 m;un;" + a.barras12m); });
    arr(L && L.porGrupo).forEach(function (g) {
      if (g.concretoM3 != null) l.push("Concreto;" + g.grupo + (L.fckMPa ? " (fck " + L.fckMPa + " MPa)" : "") + ";m³;" + fmt(g.concretoM3, 2).replace(/\./g, ""));
      if (g.formaM2 != null) l.push("Fôrma;" + g.grupo + ";m²;" + fmt(g.formaM2, 2).replace(/\./g, ""));
    });
    return l.join("\r\n");
  }

  var EstrutUI = {
    fmt: fmt, bitola: bitola, esc: esc,
    htmlDisc: htmlDisc,
    alvoDetalhe: alvoDetalhe, casaDetalhe: casaDetalhe, secoesDeVistas: secoesDeVistas,
    htmlEstVazio: htmlEstVazio, htmlEstCab: htmlEstCab, htmlEstAbas: htmlEstAbas, htmlVistas: htmlVistas,
    htmlArmacao: htmlArmacao, htmlVistaDetalhe: htmlVistaDetalhe,
    htmlLista: htmlLista, htmlEspecificacoes: htmlEspecificacoes, htmlConferencia: htmlConferencia,
    htmlImpressao: htmlImpressao, csvLista: csvLista
  };
  global.EstrutUI = EstrutUI;
  if (typeof module !== "undefined" && module.exports) module.exports = EstrutUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
