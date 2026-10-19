/* =====================================================================
 * climmemorial.js — MEMORIAL DE CÁLCULO DA CLIMATIZAÇÃO. Motor PURO, ES5,
 * sem DOM, Node-testável.
 *
 *   ClimMemorial.gerar(resultado, opcoes) → { ok, html, titulo, secoes, tabelas, avisos, conferencias }
 *   resultado = ClimDimensionar.calcular(...)  (docs/hidro/CONTRATO-CLIMA.md §4)
 *   opcoes    = { obra: {nome}, responsavel: {nome, crea}, documento: {numero, revisao, data} }
 *
 * O memorial APRESENTA, não recalcula: toda carga, solução, equipamento, linha e
 * posição vêm do resultado, com a fonte ao lado. O que o cálculo não fechou sai
 * como "não verificado: falta <chave>" (nunca como atendido) e nenhum valor
 * indefinido chega ao papel. Conferências internas no fim do documento.
 *
 * Seções: objeto · normas · premissas e condições · carga térmica por ambiente
 * (componentes, regras de fabricante, base adotada) · escolha da solução
 * (justificada) · equipamento · rede frigorígena e dreno · posição da
 * condensadora, elétrica e suporte · centrais · verificações · avisos e
 * pendências · responsabilidade técnica.
 * Teste: node tools/test-clim-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  var NB = " ";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var indefinidos = [];
  function t(s, onde) {
    var x = s == null ? "" : String(s);
    if (/\b(undefined|NaN|null|Infinity)\b/.test(x)) { indefinidos.push((onde || "texto") + ": " + x.slice(0, 80)); x = x.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]"); }   // clim:ok corte de mensagem (apresentação)
    return esc(x);
  }
  function br(v, c) {
    if (!fin(v)) return "—";
    var f = Math.pow(10, c == null ? 0 : c), s = (Math.round(v * f) / f).toFixed(c == null ? 0 : c);   // clim:ok potência de 10 para arredondar casas
    return s.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");   // clim:ok agrupamento de milhar (apresentação)
  }
  function un(v, c, u) { return fin(v) ? br(v, c) + NB + u : "—"; }
  function sit(s) {
    if (s === "ok") return '<span class="ok">OK</span>';
    if (s === "reprovado") return '<span class="falha">NÃO ATENDE</span>';
    return '<span class="pend">NÃO VERIFICADO</span>';
  }
  function fonteCurta(f) {
    f = obj(f);
    if (!f.chave && !f.norma && !f.titulo) return "—";
    return t([f.titulo || f.norma, f.edicao ? "ed. " + f.edicao : "", f.pagina ? "p. " + f.pagina : ""].filter(Boolean).join(", "), "fonte") + " <i>(" + (f.tipo === "primaria" ? "primária" : (f.tipo === "secundaria" ? "SECUNDÁRIA" : "não informado")) + ")</i>";
  }
  function lista(l, onde) { l = arr(l); return l.length ? "<ol class=\"regras\">" + l.map(function (x) { return "<li>" + t(x, onde) + "</li>"; }).join("") + "</ol>" : ""; }

  function Doc() { this.nTab = 0; this.conf = []; this.avisos = []; }
  Doc.prototype.tab = function (legenda, cab, linhas, vazio) {
    if (!linhas.length) return vazio ? '<p class="nota">' + vazio + "</p>" : "";
    this.nTab++;
    return '<table class="t"><caption><b>Tabela ' + this.nTab + "</b> — " + legenda + "</caption><thead><tr>" + cab.map(function (c) { return "<th>" + c + "</th>"; }).join("") +
           "</tr></thead><tbody>" + linhas.map(function (r) { return "<tr" + (r.cls ? ' class="' + r.cls + '"' : "") + ">" + r.c.map(function (x) { return "<td>" + (x == null ? "" : x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  };
  Doc.prototype.conferir = function (id, ok, texto) { this.conf.push({ id: id, ok: !!ok, texto: texto }); if (!ok) this.avisos.push("Conferência falhou — " + texto); };
  function row(c, status) { return { c: c, cls: status === "reprovado" ? "linha-falha" : (status === "pendente" ? "linha-alerta" : "") }; }
  function caixa(h, tipo) { return '<div class="caixa' + (tipo ? " " + tipo : "") + '">' + h + "</div>"; }

  var SECOES = [
    { id: "objeto", titulo: "Objeto e situação do cálculo" },
    { id: "normas", titulo: "Normas e tabelas utilizadas, com tipo de fonte" },
    { id: "premissas", titulo: "Premissas, condições de projeto e decisões" },
    { id: "confirmacoes", titulo: "Confirmações do responsável técnico" },
    { id: "carga", titulo: "Carga térmica por ambiente" },
    { id: "escolha", titulo: "Escolha da solução, justificada" },
    { id: "equipamento", titulo: "Equipamento" },
    { id: "rede", titulo: "Rede frigorígena e dreno" },
    { id: "posicao", titulo: "Posição da condensadora, elétrica e suporte" },
    { id: "centrais", titulo: "Soluções centrais (multi-split, VRF)" },
    { id: "verificacoes", titulo: "Verificações" },
    { id: "pendencias", titulo: "Avisos e pendências" },
    { id: "termo", titulo: "Responsabilidade técnica" }
  ];

  function ctx(r, op) {
    return { r: r, op: op || {}, am: arr(r.ambientes), cl: arr(r.ambientes).filter(function (a) { return a.climatizar !== false; }) };
  }
  function selo(c) { return c.r.fixture === true ? caixa("<b>TABELAS DE TESTE — NÃO É NORMA.</b> Este resultado não pode ir a memorial assinado.", "erro") : ""; }

  function secObjeto(c, d) {
    var r = c.r, rs = obj(r.resumo), ob = obj(c.op.obra);
    var h = selo(c);
    h += "<p>Memorial do dimensionamento da climatização" + (ob.nome ? " da obra <b>" + t(ob.nome, "obra") + "</b>" : "") + ": " + br(rs.ambientes != null ? rs.ambientes : c.am.length) + " ambiente(s), " + br(rs.climatizados != null ? rs.climatizados : c.cl.length) + " climatizado(s), carga requerida total " +
         un(rs.carga_BTUh, 0, "BTU/h") + ".</p>";
    h += "<p>Situação: " + (r.ok ? sit("ok") : sit("pendente")) + " — " + (r.ok ? "cálculo completo." : "há pendências ou erros; o que não foi verificado está listado na seção de pendências e NÃO deve ser lido como atendido.") + "</p>";
    return h;
  }
  function secNormas(c, d) {
    var ns = arr(c.r.normas);
    return d.tab("Tabelas de norma, catálogo e literatura usados", ["Fonte", "Edição", "Documento", "Tipo"],
      ns.map(function (n) { n = obj(n); return row([t(n.titulo || n.norma || n.chave, "normas"), t(n.edicao || "—", "normas"), t(n.doc || "—", "normas"), n.tipo === "primaria" ? "primária" : (n.tipo === "secundaria" ? "<b>SECUNDÁRIA</b>" : "não informado")]); }),
      "Nenhuma tabela de norma carregada no cálculo (<b>não verificado</b>).");
  }
  function secPremissas(c, d) {
    var r = c.r, ce = obj(obj(r.condicoes).externa), ci = obj(obj(r.condicoes).interna), h = "";
    h += d.tab("Condições de projeto", ["Condição", "Valores", "Origem / fonte"], [
      row(["Externa — " + t(ce.estacao || "não verificado", "cond"), "TBS " + un(ce.tbs_C, 1, "°C") + " · TBU " + un(ce.tbu_C, 1, "°C") + " · altitude " + un(ce.altitude_m, 0, "m") + (ce.percentil != null ? " · percentil " + t(ce.percentil, "cond") + " %" : ""), fonteCurta(ce.fonte)], ce.tbs_C == null ? "pendente" : "ok"),
      row(["Interna", "TBS " + un(ci.tbs_C, 1, "°C") + " · UR " + un(ci.ur_pct, 1, "%"), t(ci.origem || "—", "cond")], ci.tbs_C == null ? "pendente" : "ok")
    ]);
    h += d.tab("Premissas e decisões de engenharia", ["Item", "Valor", "Origem"],
      arr(r.premissas).filter(function (p) { return obj(p).origem !== "confirmacao_rt"; }).map(function (p) { p = obj(p); return row([t(p.item, "premissa"), t(p.valor, "premissa"), t(p.origem || "—", "premissa") + (p.fonte ? "; " + t(typeof p.fonte === "string" ? p.fonte : (obj(p.fonte).titulo || obj(p.fonte).chave), "premissa") : "")]); }),
      "Nenhuma premissa registrada no resultado.");
    return h;
  }
  function secConfirmacoes(c, d) {
    var cf = arr(c.r.premissas).filter(function (p) { return obj(p).origem === "confirmacao_rt"; });
    if (!cf.length) return "<p>O responsável técnico não registrou confirmações (por exemplo, divergência alta entre a carga por componentes e a regra de fabricante).</p>";
    return "<p>Itens que o cálculo não confere e que o responsável técnico assume, com a justificativa e o nome de quem responde:</p>" +
      d.tab("Confirmações do RT", ["Item", "Justificativa e responsável"], cf.map(function (p) { p = obj(p); return row([t(p.item, "confirmações"), t(p.valor, "confirmações")]); }), "");
  }
  function secCarga(c, d) {
    var h = "";
    c.am.forEach(function (a) {
      var cg = a.carga;
      h += "<h3>" + t(a.nome, "carga") + " <small>(" + t(a.uso || "—", "carga") + ", " + un(a.area_m2, 1, "m²") + ")</small></h3>";
      if (a.climatizar === false) { h += "<p>Ambiente <b>não climatizado</b> por decisão do projeto.</p>"; return; }
      if (!cg) { h += "<p><b>Não verificado:</b> sem carga calculada para este ambiente.</p>"; return; }
      h += "<p>Base adotada: <b>" + t(cg.base || "não verificado", "carga") + "</b> · situação " + sit(cg.status === "ok" ? "ok" : "pendente") +
           " · sensível " + un(cg.sensivel_W, 0, "W") + " · latente " + un(cg.latente_W, 0, "W") + " · total " + un(cg.total_BTUh, 0, "BTU/h") + " (" + un(cg.total_TR, 2, "TR") + ") · <b>requerida " + un(cg.requerida_BTUh, 0, "BTU/h") + "</b>.</p>";
      h += d.tab("Componentes da carga — " + t(a.nome, "carga"), ["Componente", "Alvo", "Sensível (W)", "Latente (W)", "Passos", "Fonte"],
        arr(cg.componentes).map(function (k) {
          var f = k.status === "pendente" ? "<br><b>não verificado: falta</b> " + arr(k.pendencias).map(function (x) { return "<code>" + t(x, "carga") + "</code>"; }).join(", ") : "";
          return row([t(k.tipo, "carga"), t(k.alvo, "carga"), br(k.sensivel_W, 0), br(k.latente_W, 0), arr(k.passos).map(function (x) { return t(x, "carga"); }).join("<br>") + f, fonteCurta(k.fonte)], k.status);
        }), "Sem componentes calculados (<b>não verificado</b>).");
      var rp = obj(cg.rapida);
      h += d.tab("Estimativa por regra de fabricante — " + t(a.nome, "carga"), ["Fabricante", "BTU/h", "Passos", "Fonte"],
        arr(rp.regras).map(function (g) { return row([t(g.fabricante, "carga"), br(g.BTUh, 0), arr(g.passos).map(function (x) { return t(x, "carga"); }).join("<br>"), fonteCurta(g.fonte)]); }));
      if (rp.faixaAshrae) h += "<p>Faixa de referência (ASHRAE, estimativa): " + un(rp.faixaAshrae.BTUh_de, 0, "BTU/h") + " a " + un(rp.faixaAshrae.BTUh_a, 0, "BTU/h") + (fin(rp.divergencia_pct) ? "; divergência entre as regras " + un(rp.divergencia_pct, 1, "%") : "") + ".</p>";
    });
    return h || "<p>Sem ambientes no resultado.</p>";
  }
  function secEscolha(c, d) {
    var h = "";
    c.cl.forEach(function (a) {
      var esc0 = a.escolha;
      h += "<h3>" + t(a.nome, "escolha") + "</h3>";
      h += d.tab("Soluções avaliadas — " + t(a.nome, "escolha"), ["Solução", "Viável", "Justificativa", "Impedimentos"],
        arr(a.solucoes).map(function (s) { return row([t(s.nome || s.tipo, "escolha") + (esc0 && esc0.tipo === s.tipo ? " <b>(escolhida)</b>" : ""), s.viavel ? "sim" : "não", arr(s.justificativa).map(function (x) { return t(x, "escolha"); }).join("<br>"), arr(s.impedimentos).map(function (x) { return t(x, "escolha"); }).join("<br>") || "—"], s.viavel ? "ok" : "pendente"); }),
        "Nenhuma solução avaliada (<b>não verificado</b>).");
      h += esc0 ? "<p>Escolha: <b>" + t(esc0.tipo, "escolha") + "</b>.</p>" : "<p><b>Não verificado:</b> nenhuma solução escolhida (ver pendências).</p>";
    });
    return h || "<p>Sem ambientes climatizados.</p>";
  }
  function secEquip(c, d) {
    return d.tab("Equipamento por ambiente (catálogo)", ["Ambiente", "Tipo", "Fabricante", "Evaporadora / condensadora", "Capacidade (BTU/h)", "Carga requerida (BTU/h)", "Situação"],
      c.cl.map(function (a) {
        var e = a.escolha, q = e && e.equipamento, req = a.carga && a.carga.requerida_BTUh, ok = q && fin(q.capacidade_BTUh) && fin(req) && q.capacidade_BTUh >= req && e.equipamentoStatus !== "pendente";
        return row([t(a.nome, "equip"), e ? t(e.tipo, "equip") : "—", q ? t(q.fabricante, "equip") : "<b>não verificado</b>", q ? t(q.evaporadora, "equip") + " / " + t(q.condensadora, "equip") : "—", q ? br(q.capacidade_BTUh, 0) : "—", br(req, 0), sit(ok ? "ok" : "pendente")], ok ? "ok" : "pendente");
      }), "Nenhum ambiente climatizado.");
  }
  function secRede(c, d) {
    var h = "";
    c.cl.forEach(function (a) {
      var e = a.escolha, rd = e && e.rede, dr = e && e.dreno;
      if (!e) return;
      h += "<h3>" + t(a.nome, "rede") + "</h3>";
      if (rd) h += "<p>Linha frigorígena: líquido " + un(rd.liquido_mm, 2, "mm") + " · sucção " + un(rd.succao_mm, 2, "mm") + " · comprimento " + un(rd.comprimento_m, 2, "m") + " · " + br(rd.conexoes, 0) + " conexão(ões) · desnível " + un(rd.desnivel_m, 2, "m") +
        " · isolamento " + (obj(rd.isolamento).status === "ok" ? un(obj(rd.isolamento).espessura_mm, 1, "mm") : "<b>não verificado</b>") + " (origem do diâmetro: " + t(rd.origem || "—", "rede") + ").</p>" +
        d.tab("Verificações da linha — " + t(a.nome, "rede"), ["Verificação", "Valor", "Limite", "Situação", "Passos"], arr(rd.verificacoes).map(function (v) { return row([t(v.nome, "rede"), br(v.valor, 2) + NB + t(v.unidade || "", "rede"), fin(v.limite) ? br(v.limite, 2) : "—", sit(v.status), arr(v.passos).map(function (x) { return t(x, "rede"); }).join("<br>")], v.status); }));
      else h += "<p><b>Não verificado:</b> linha frigorígena não calculada.</p>";
      h += dr ? "<p>Dreno de condensado: " + t(typeof dr === "string" ? dr : (dr.destino || dr.tipo || JSON.stringify(dr)), "dreno") + ".</p>" : "<p>Dreno de condensado: <b>não verificado</b> (destino não definido).</p>";
    });
    return h || "<p>Sem rede calculada.</p>";
  }
  function secPosicao(c, d) {
    return d.tab("Condensadora, alimentação elétrica e suporte", ["Ambiente", "Condensadora (x; y; z) m", "Montagem", "Alimentação", "Disjuntor / cabo", "Suporte"],
      c.cl.map(function (a) {
        var e = a.escolha || {}, k = obj(e.condensadora), el = obj(e.eletrica), sp = e.suporte;
        var pos = fin(k.x) ? br(k.x, 2) + "; " + br(k.y, 2) + "; " + br(k.z, 2) : "<b>não verificado</b>";
        var disj = fin(el.disjuntor_A) ? un(el.disjuntor_A, 0, "A") + " / " + t(el.caboAlimentacao || "—", "elet") : "<b>não verificado: falta</b> disjuntor e cabo (catálogo)";
        return row([t(a.nome, "pos"), pos, t(k.tipo || obj(e.condensadora).montagem || "—", "pos"), t(el.alimentacao || "—", "pos"), disj, sp ? t(typeof sp === "string" ? sp : JSON.stringify(sp), "pos") : "—"], fin(k.x) ? "ok" : "pendente");
      }), "Nenhum ambiente climatizado.");
  }
  function secCentrais(c, d) {
    return d.tab("Alternativas centrais", ["Tipo", "Ambientes", "Carga (BTU/h)", "Simultaneidade", "Condensadoras", "Fachada evitada", "Justificativa"],
      arr(c.r.centrais).map(function (z) { return row([t(z.nome || z.tipo, "central"), arr(z.ambientes).map(function (x) { return t(x, "central"); }).join(", "), br(z.carga_BTUh, 0), t(z.simultaneidade, "central") + (z.simultaneidadeOrigem ? " (" + t(z.simultaneidadeOrigem, "central") + ")" : ""), br(z.condensadoras, 0), br(z.fachadaEvitada, 0), arr(z.justificativa).map(function (x) { return t(x, "central"); }).join("<br>")], z.recomendada ? "ok" : ""); }),
      "Nenhuma alternativa central avaliada.");
  }
  function secVerif(c, d) {
    var vs = arr(c.r.verificacoes);
    return d.tab("Verificações com passos", ["Id", "Alvo", "Verificação", "Valor", "Limite", "Situação", "Passos"],
      vs.map(function (v) { return row([t(v.id, "verif"), t(v.alvo, "verif"), t(v.nome, "verif"), v.status === "pendente" || !fin(v.valor) ? "não verificado" : br(v.valor, 2) + NB + t(v.unidade || "", "verif"), fin(v.limite) ? br(v.limite, 2) : "—", sit(v.status), arr(v.passos).map(function (x) { return t(x, "verif"); }).join("<br>")], v.status); }),
      "O resultado não trouxe verificações.");
  }
  function secPend(c, d) {
    var r = c.r, h = "";
    h += d.tab("Avisos", ["Gravidade", "Aviso", "Como corrigir"], arr(r.avisos).map(function (a) { return row([t(a.gravidade, "aviso"), t(a.texto, "aviso"), t(obj(a.corrigir).texto || "—", "aviso")], a.gravidade === "erro" ? "reprovado" : "pendente"); }), "Nenhum aviso.");
    var ps = arr(r.pendencias);
    h += ps.length ? d.tab("Não verificado: falta informação (" + ps.length + ")", ["Chave", "Motivo", "Usado em"], ps.map(function (p) { return row(["<b>não verificado: falta</b> <code>" + t(p.chave, "pend") + "</code>", t(p.motivo, "pend"), arr(p.usadoEm).map(function (x) { return t(x, "pend"); }).join("; ") || "—"], "pendente"); })) : "<p>Nenhuma pendência de norma ou de entrada.</p>";
    arr(r.requisitos).length && (h += d.tab("Requisitos do modelo ainda não aceitos", ["Item", "Motivo", "Onde"], arr(r.requisitos).map(function (q) { return row([t(q.item, "req"), t(q.motivo, "req"), t(q.onde, "req")], "pendente"); })));
    return h;
  }
  function ph(v, rot) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function secTermo(c) {
    var rp = obj(c.op.responsavel);
    return "<p>Responsável técnico: " + ph(rp.nome, "RESPONSÁVEL TÉCNICO") + " — CREA " + ph(rp.crea, "CREA") + ".</p><p>Este memorial reproduz o resultado do dimensionamento, com fonte e passos. Antes de emitir, o responsável técnico confere o que consta como <b>não verificado</b>, as fontes secundárias e as estimativas de fabricante.</p>";
  }

  function css() {
    return "body{font:13px/1.45 Arial,Helvetica,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:20px}h2{font-size:16px;border-bottom:2px solid #0b3d5c;padding-bottom:3px;margin-top:26px}h3{font-size:14px}" +
      "table.t{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px}table.t th,table.t td{border:1px solid #999;padding:3px 6px;vertical-align:top;text-align:left}table.t th{background:#0b3d5c;color:#fff}caption{text-align:left;margin-bottom:3px}" +
      ".ok{color:#1b7a3a;font-weight:700}.falha{color:#b00020;font-weight:700}.pend{color:#9a6700;font-weight:700}.ph{color:#c00000}.nota{font-size:12px;opacity:.85}.linha-falha{background:#fde7ea}.linha-alerta{background:#fff6dd}" +
      ".caixa{border:1px solid #999;border-radius:6px;padding:8px 10px;margin:8px 0}.caixa.erro{border-color:#b00020;background:#fde7ea}.regras{margin:4px 0;padding-left:20px}@page{size:A4;margin:16mm}";
  }

  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    indefinidos = [];
    if (!r || typeof r !== "object" || !Array.isArray(r.ambientes)) return { ok: false, motivo: "Sem resultado de climatização para gerar o memorial.", html: "", titulo: "", secoes: [], tabelas: 0, avisos: [], conferencias: [] };
    var c = ctx(r, opcoes), d = new Doc(), dc = obj(opcoes.documento);
    var FN = { objeto: secObjeto, normas: secNormas, premissas: secPremissas, confirmacoes: secConfirmacoes, carga: secCarga, escolha: secEscolha, equipamento: secEquip, rede: secRede, posicao: secPosicao, centrais: secCentrais, verificacoes: secVerif, pendencias: secPend, termo: secTermo };
    var corpo = SECOES.map(function (s, i) {
      var h;
      try { h = FN[s.id](c, d); } catch (e) { d.avisos.push("Seção " + (i + 1) + " (" + s.titulo + ") gerada com erro: " + (e && e.message)); h = caixa("<b>Esta seção não pôde ser gerada:</b> " + esc(e && e.message), "erro"); }
      return '<section id="sec-' + s.id + '"><h2>' + (i + 1) + ". " + esc(s.titulo) + "</h2>" + h + "</section>";
    }).join("");
    d.conferir("ambientes", c.am.every(function (a) { return corpo.indexOf(t(a.nome)) >= 0; }), "todos os " + c.am.length + " ambientes do resultado aparecem no memorial");
    d.conferir("verificacoes", arr(r.verificacoes).every(function (v) { return corpo.indexOf(esc(v.id)) >= 0; }), "todas as " + arr(r.verificacoes).length + " verificações do resultado aparecem no memorial");
    d.conferir("pendencias", arr(r.pendencias).every(function (p) { return corpo.indexOf(esc(p.chave)) >= 0; }), "toda pendência do resultado aparece como 'não verificado: falta'");
    d.conferir("fixture", r.fixture !== true || corpo.indexOf("TABELAS DE TESTE") >= 0, "resultado de fixture leva o selo de tabelas de teste");
    d.conferir("textos", indefinidos.length === 0, "textos sem valor indefinido" + (indefinidos.length ? ": " + indefinidos.length + " ocorrência(s)" : ""));
    var conf = '<section id="sec-conferencias"><h2>Conferências internas</h2><ul>' + d.conf.map(function (k) { return "<li>" + (k.ok ? '<span class="ok">verdadeira</span>' : '<span class="falha">FALSA</span>') + " — " + esc(k.texto) + "</li>"; }).join("") + "</ul>" +
      (d.avisos.length ? caixa("<b>Divergências:</b><ul>" + d.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", "erro") : "<p>Todas as conferências internas passaram.</p>") + "</section>";
    var titulo = "Memorial de cálculo — Climatização" + (obj(opcoes.obra).nome ? " — " + obj(opcoes.obra).nome : "");
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + "</title><style>" + css() + "</style></head><body><h1>" + esc(titulo) + "</h1>" + (obj(opcoes.empresa).nome ? "<p class=\"nota\">" + esc(opcoes.empresa.nome) + (opcoes.empresa.cnpj ? " — CNPJ " + esc(opcoes.empresa.cnpj) : "") + "</p>" : "") + "<p class=\"nota\">Documento " + esc(dc.numero || "") + " " + esc(dc.revisao || "R00") + "</p>" + corpo + conf + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), tabelas: d.nTab, avisos: d.avisos.slice(), conferencias: d.conf.slice() };
  }

  /* CORPO para o MEMORIAL ÚNICO (17/10/2026, "Gerar documentos"): as mesmas seções, como SUBSEÇÕES (h3) de uma seção do
     js/hidmemorial.js — capa, sumário, normas gerais e termo de responsabilidade ficam do documento único. A numeração das
     tabelas continua a do documento (base.tabela) e as conferências voltam para o memorial único somar.
       corpo(resultado, opcoes, { prefixo: "9", tabela: 41 }) → { ok, html, tabelas, conferencias, avisos, pendencias, reprovadas, situacao } */
  var SEM_NO_CORPO = { termo: 1 };
  function corpo(r, opcoes, base) {
    opcoes = opcoes || {}; base = base || {};
    indefinidos = [];
    if (!r || typeof r !== "object" || !Array.isArray(r.ambientes)) return { ok: false, motivo: "Sem resultado de climatização.", html: "", tabelas: 0, conferencias: [], avisos: [], pendencias: 0, reprovadas: 0, situacao: "ausente" };
    var c = ctx(r, opcoes), d = new Doc(), k = 0, pre = base.prefixo ? String(base.prefixo) + "." : "";
    d.nTab = typeof base.tabela === "number" && isFinite(base.tabela) ? base.tabela : 0;
    var FN = { objeto: secObjeto, normas: secNormas, premissas: secPremissas, confirmacoes: secConfirmacoes, carga: secCarga, escolha: secEscolha, equipamento: secEquip, rede: secRede, posicao: secPosicao, centrais: secCentrais, verificacoes: secVerif, pendencias: secPend };
    var h = SECOES.filter(function (s) { return !SEM_NO_CORPO[s.id]; }).map(function (s) {
      var x; k++;
      try { x = FN[s.id](c, d); } catch (e) { d.avisos.push("Climatização — " + s.titulo + " gerada com erro: " + (e && e.message)); x = caixa("<b>Esta parte não pôde ser gerada:</b> " + esc(e && e.message), "erro"); }
      return '<h3 id="clim-' + s.id + '">' + esc(pre + k) + " " + esc(s.titulo) + "</h3>" + x;
    }).join("");
    d.conferir("clima-ambientes", c.am.every(function (a) { return h.indexOf(t(a.nome)) >= 0; }), "climatização: todos os " + c.am.length + " ambientes do resultado aparecem no memorial");
    d.conferir("clima-verificacoes", arr(r.verificacoes).every(function (v) { return h.indexOf(esc(v.id)) >= 0; }), "climatização: todas as " + arr(r.verificacoes).length + " verificações aparecem no memorial");
    d.conferir("clima-pendencias", arr(r.pendencias).every(function (p) { return h.indexOf(esc(p.chave)) >= 0; }), "climatização: toda pendência aparece como 'não verificado: falta'");
    d.conferir("clima-textos", indefinidos.length === 0, "climatização: textos sem valor indefinido" + (indefinidos.length ? ": " + indefinidos.length + " ocorrência(s)" : ""));
    var rep = arr(r.verificacoes).filter(function (v) { return v.status === "reprovado"; }).length + arr(r.avisos).filter(function (a) { return a && a.gravidade === "erro"; }).length;
    var pen = arr(r.pendencias).length + arr(r.verificacoes).filter(function (v) { return v.status === "pendente"; }).length;
    return { ok: true, html: h, tabelas: d.nTab, conferencias: d.conf.slice(), avisos: d.avisos.slice(), pendencias: pen, reprovadas: rep,
             situacao: r.fixture === true ? "fixture" : (rep ? "reprovado" : (pen || r.ok !== true ? "pendente" : "ok")) };
  }

  var ClimMemorial = { gerar: gerar, corpo: corpo, SECOES: SECOES };
  global.ClimMemorial = ClimMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
