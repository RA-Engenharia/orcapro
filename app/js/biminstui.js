/* =====================================================================
 * biminstui.js — a TELA das instalações do modelador (fase B5)
 *
 * O motor é o js/biminst.js (puro). Aqui: a aba "Instalações" da fita (só
 * com a prévia `?previa=modelador`, js/bimprevia.js), o traçado no 3D (o
 * js/bim.js chama clique() com o ponto do plano de trabalho), as malhas
 * (o js/bim.js chama malhas() no replay), as Propriedades da ferramenta e
 * do trecho selecionado, e o painel "Instalações" (quantitativo por
 * sistema, material e DN com a composição SINAPI de cada linha).
 *
 * Tudo o que nasce aqui é uma OP do editor (trecho, peça, instAlterar): o
 * Desfazer, o salvar com a obra e o orçamento do modelo vêm de graça.
 * ===================================================================== */
(function (global) {
  "use strict";

  function BI() { return global.BimInst; }
  function B() { return global.BIM; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n, c) { var U = global.Util; return U && U.fmtNum ? U.fmtNum(n, c == null ? 2 : c) : String(Math.round(Number(n || 0) * 100) / 100).replace(".", ","); }
  function num(v, d) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }

  /* cota inicial padrão (m, a partir do nível): água a 60 cm (sub-ramal na
     parede), esgoto e pluvial 30–40 cm abaixo do piso, ventilação, eletroduto
     e duto no alto (laje/forro). Só o ponto de partida — o usuário muda. */
  var COTA_PADRAO = { agua_fria: 0.60, agua_quente: 0.60, esgoto: -0.30, ventilacao: 2.50, pluvial: -0.40, eletrica: 2.75, ar: 2.60, bandeja: 2.70 };   /* P12: eletrocalha no alto */

  /* =====================================================================
   * P12 — INSTALAÇÕES II na tela (plano do BIM §4 P12)
   *   A) Acessório de tubo (registro/válvula): ferramenta "Acessório de tubo"
   *      — clique no tubo e ele é DIVIDIDO (op `acessorio`, js/biminst.js);
   *      tomada, interruptor, luminária e quadro: famílias RA com conector.
   *      Tubos/eletrodutos/eletrocalhas PARALELOS: Propriedades do trecho.
   *   B) Eletrocalha (ferramenta de traçado), Verificar sistemas, Mostrar
   *      desconexões, nome e numeração de sistema (Propriedades do trecho).
   *   C) Legenda de tubulação por sistema e DN (na planta 2D, ligável) e a
   *      tabela de peças MEP (local; a da P5 a substitui) com .xlsx.
   * Tudo só com a prévia `?previa=modelador`; tudo vira op (desfaz/refaz).
   * ===================================================================== */
  function P12(U) {
    var FAMS_AC = ["ra-registro-gaveta", "ra-registro-esfera", "ra-registro-pressao", "ra-valvula-retencao"];
    U.FAMS_ACESSORIO = FAMS_AC;
    U._p12 = { acFam: "ra-registro-gaveta", acTipo: "", n: 1, esp: 0.15, lado: 1 };
    function famRA(id) { try { return global.FamiliasRA ? global.FamiliasRA.obter(id, true) : null; } catch (e) { return null; } }
    function tiposDe(famId) { var f = famRA(famId); return f ? f.tipos.map(function (t) { return { id: t.id, rotulo: t.nome }; }) : []; }
    function famAvalTela() { var b = B(); return b && b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null; }
    function ro(id, rot, v, motivo) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: motivo }; }
    function reconstruir() { var b = B(); try { if (b && b.editarReconstruir) b.editarReconstruir(); } catch (e) {} }

    U.legendaLigada = function () { return !!U._legenda; };

    /* ------------------------------------------------ a fita (gancho P12 em js/gestao.js) */
    U.registrarP12 = function (reg, G) {
      U._G = G || U._G;
      var R = global.BimRibbon; if (!U.ativo() || !R || !reg) return false;
      R.acrescentar("instalacoes", "Instalações", "Acessórios e dispositivos", [
        { id: "acessorio-tubo", rotulo: "Acessório\nde tubo", icone: "alvo", grande: true, tipo: "alterna", dica: "Registro de gaveta, de esfera, de pressão ou válvula de retenção: clique NO TUBO — ele é dividido e o registro entra no quantitativo com o código SINAPI do mapa (ou pendente)." },
        { id: "dispositivo-eletrico", rotulo: "Tomada e\ninterruptor", icone: "ima", grande: true, dica: "Tomada 2P+T e interruptor (famílias RA com o ponto de ligação do eletroduto). Altura de montagem em Propriedades; a faixa SINAPI (baixa, média, alta) sai dela." },
        { id: "luminaria-mep", rotulo: "Luminária", icone: "estrela", grande: true, dica: "Luminária de teto (plafon LED, spot PAR20, painel 60×60) nos tipos que a SINAPI orça; o eletroduto chega por cima." },
        { id: "quadro-eletrico", rotulo: "Quadro de\ndistribuição", icone: "grade", grande: true, dica: "Quadro de distribuição (PVC de embutir, QDL de PVC ou aço com barramento), com o ponto de entrada do eletroduto." },
        { id: "eletrocalha", rotulo: "Eletrocalha", icone: "regua", grande: true, tipo: "alterna", dica: "Bandeja de cabos (eletrocalha lisa ou perfurada): largura 50 a 800 mm, altura 50 mm, orçada em metro (a emenda já está na composição); curva e tê horizontais 90° e redução saem sozinhos." }
      ]);
      R.acrescentar("instalacoes", "Instalações", "Sistemas", [
        { id: "verificar-sistemas", rotulo: "Verificar\nsistemas", icone: "checklist", grande: true, dica: "Pontas soltas, pontos de aparelho sem tubo, sistemas diferentes se tocando e inclinação abaixo da mínima (NBR 8160/10844) — numa lista, com o lugar de cada um." },
        { id: "desconexoes", rotulo: "Mostrar\ndesconexões", icone: "olho", grande: true, tipo: "alterna", dica: "Marca no 3D, em vermelho, cada ponta de tubo e cada ponto de ligação que ficou sem ligação." },
        { id: "legenda-mep", rotulo: "Legenda de\ntubulação", icone: "lista", grande: true, tipo: "alterna", dica: "Legenda por sistema e DN na planta baixa (cor do sistema, abreviatura e os diâmetros usados)." },
        { id: "tabela-mep", rotulo: "Tabela de\npeças", icone: "tabela", grande: true, dica: "Tabela de peças das instalações (tubos, conexões, acessórios, dispositivos): sistema, tamanho, comprimento e código SINAPI — e o .xlsx." }
      ]);
      ["acessorio-tubo", "eletrocalha", "desconexoes", "legenda-mep"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0 && (k === "acessorio-tubo" || k === "eletrocalha")) R._EXCLUSIVOS.push(k); });
      reg["acessorio-tubo"] = function (e) { if (e && e.ligado === false) { var b = B(); if (b && b.editarArmar) b.editarArmar(null); U.cfg = null; return true; } return U.armar("acessorio", { famId: U._p12.acFam, tipoId: U._p12.acTipo }); };
      reg["eletrocalha"] = function (e) { if (e && e.ligado === false) { var b = B(); if (b && b.editarArmar) b.editarArmar(null); U.cfg = null; return true; } return U.armar("eletrocalha"); };
      reg["dispositivo-eletrico"] = function () { return U.colocarFamilia("ra-tomada", "t10"); };
      reg["luminaria-mep"] = function () { return U.colocarFamilia("ra-luminaria", "pq18e"); };
      reg["quadro-eletrico"] = function () { return U.colocarFamilia("ra-quadro-distribuicao", "pvc6"); };
      reg["verificar-sistemas"] = function () { U.verificarSistemas(); return true; };
      reg["desconexoes"] = function (e) { U.alternarDesconexoes(!(e && e.ligado === false)); return true; };
      reg["legenda-mep"] = function (e) { U.legendaPlanta(!(e && e.ligado === false)); return true; };
      reg["tabela-mep"] = function () { U._tabela = true; U.abrirPainel(); return true; };
      return true;
    };

    /* ------------------------------------------------ ACESSÓRIO NO TUBO */
    /* face a face = a distância entre os dois conectores da família avaliada no DN do tubo */
    U.comprimentoAcessorio = function (famAval, famId, tipoId, dn) {
      var I = BI(), av = typeof famAval === "function" ? famAval(famId, tipoId, { DN: dn }) : null;
      if (!av || !av.conectores || av.conectores.length < 2) return I.ACESSORIO_PADRAO;
      var a = av.conectores[0], b = av.conectores[1], L = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z));
      return r4(Math.min(I.ACESSORIO_MAX, Math.max(I.ACESSORIO_MIN, L)));
    };
    /* a op que põe o acessório no ponto do trecho mais perto de `p` (em planta). Puro: estado e ops na mão. */
    U.opAcessorio = function (estado, famAval, trechoId, p, famId, tipoId, ops) {
      var I = BI(), A = I.ACESSORIOS[I.ACESSORIO_DA_FAM[famId]];
      if (!A) return { ok: false, motivo: "Família de acessório desconhecida: " + famId + "." };
      var t = ((estado && estado.instalacoes && estado.instalacoes.trechos) || []).filter(function (x) { return x.id === trechoId; })[0];
      if (!t) return { ok: false, motivo: "Escolha um tubo (clique em cima dele)." };
      var M = I.MATERIAIS[t.material] || {};
      if (A.sistemas.indexOf(t.sistema) < 0 || M.secao || M.flexivel) return { ok: false, motivo: A.nome + " é de tubo de água (fria ou quente): este trecho é de " + I.SISTEMAS[t.sistema].nome.toLowerCase() + "." };
      var L = U.comprimentoAcessorio(famAval, famId, tipoId, t.dn), Lt = t.comprimento;
      var folga = L / 2 + I.TOL + 0.005;
      if (Lt < 2 * folga) return { ok: false, motivo: "O trecho " + t.id + " (" + fmt(Lt, 3) + " m) é curto demais para o " + A.nome.toLowerCase() + " (" + fmt(L, 3) + " m de face a face)." };
      var tt = 0.5;
      if (!t.vertical && p) {
        var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, L2 = dx * dx + dz * dz;
        if (L2 > 0) tt = ((p.x - t.p1.x) * dx + (p.z - t.p1.z) * dz) / L2;
      }
      tt = Math.max(folga / Lt, Math.min(1 - folga / Lt, tt));
      var q = { x: r6(t.p1.x + (t.p2.x - t.p1.x) * tt), y: r6(t.p1.y + (t.p2.y - t.p1.y) * tt), z: r6(t.p1.z + (t.p2.z - t.p1.z) * tt) };
      var tipos = tiposDe(famId), tipo = tipoId && tipos.some(function (x) { return x.id === tipoId; }) ? tipoId : (tipos[0] ? tipos[0].id : Object.keys(A.variantes)[0]);
      var o = { op: "acessorio", id: U._proxId("ac", ops), famId: famId, tipoId: tipo, trecho: t.id, novoId: U._proxId("t", ops), x: q.x, y: q.y, z: q.z, comprimento: L };
      return { ok: true, op: o, trecho: t, comprimento: L };
    };
    /* o tubo de água mais perto do clique, em planta (até 25 cm) */
    U._tuboPerto = function (estado, p) {
      var I = BI(), melhor = null, dm = 0.25;
      ((estado && estado.instalacoes && estado.instalacoes.trechos) || []).forEach(function (t) {
        if (I.SISTEMAS[t.sistema].grupo !== "agua") return;
        var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, L2 = dx * dx + dz * dz, d;
        if (L2 < 1e-9) d = Math.sqrt((p.x - t.p1.x) * (p.x - t.p1.x) + (p.z - t.p1.z) * (p.z - t.p1.z));
        else { var u = Math.max(0, Math.min(1, ((p.x - t.p1.x) * dx + (p.z - t.p1.z) * dz) / L2)), qx = t.p1.x + dx * u, qz = t.p1.z + dz * u; d = Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz)); }
        if (d < dm) { dm = d; melhor = t; }
      });
      return melhor;
    };
    U.cliqueAcessorio = function (ctx, p) {
      var c = U.cfg, ed = ctx.edit, est = ed.estado;
      if (!p) { ctx.hint("Não achei o ponto — clique em cima do tubo."); return; }
      var t = U._tuboPerto(est, p);
      if (!t) { ctx.hint("Clique EM CIMA de um tubo de água fria ou quente (a até 25 cm dele, em planta)."); return; }
      var r = U.opAcessorio(est, ctx.famAval, t.id, p, c.famId, c.tipoId, ed.ops);
      if (!r.ok) { ctx.hint(r.motivo); return; }
      ctx.op(r.op);
      ctx.hint(BI().ACESSORIOS[BI().ACESSORIO_DA_FAM[c.famId]].nome + " no trecho " + t.id + " (DN " + t.dn + ", " + fmt(r.comprimento, 3) + " m de face a face): o tubo foi dividido em " + t.id + " e " + r.op.novoId + ". Clique em outro tubo, ou Esc.");
      ctx.marcar();
    };
    U.colocarAcessorioNoMeio = function (trechoId, famId, tipoId) {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!est) return { ok: false, motivo: "O 3D ainda não abriu." };
      var r = U.opAcessorio(est.estado, famAvalTela(), trechoId, null, famId, tipoId, b.editarOps ? b.editarOps() : []);
      if (!r.ok) { status(r.motivo); toast(r.motivo, "aviso"); return r; }
      b.instOp(r.op); status("Registro colocado: o trecho " + trechoId + " virou " + trechoId + " e " + r.op.novoId + ".");
      return r;
    };
    U.dicaAcessorio = function () {
      var c = U.cfg, I = BI(), A = I.ACESSORIOS[I.ACESSORIO_DA_FAM[c.famId]];
      return (A ? A.nome : "Acessório") + ": clique EM CIMA de um tubo de água — ele é dividido e o acessório entra com o código SINAPI do mapa (ou pendente). Esc encerra.";
    };
    U.esquemaAcessorio = function () {
      var c = U.cfg, I = BI(), self = U;
      var fams = FAMS_AC.map(function (id) { var f = famRA(id); return { id: id, rotulo: f ? f.nome : id }; });
      var tipos = tiposDe(c.famId);
      return { icone: "link", semEditarTipo: true, titulo: "Acessório de tubo",
        secoes: [{ nome: "Acessório", params: [
          { id: "i:famId", rotulo: "Família", tipo: "lista", valor: c.famId, opcoes: fams },
          { id: "i:tipoId", rotulo: "Tipo", tipo: "lista", valor: c.tipoId || (tipos[0] && tipos[0].id), opcoes: tipos },
          { id: "i:cota", rotulo: "Cota do plano de clique (do nível)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.cota },
          ro("i:ac-regra", "Como entra", "divide o tubo", "O tubo some debaixo do corpo do acessório e as duas metades ficam ligadas nas faces dele. Desfazer devolve o tubo inteiro; apagar o registro emenda.") ] },
          { nome: "Orçamento", params: [ro("i:ac-sinapi", "SINAPI", "pelo mapa", "Latão e bronze são roscáveis: o DN do tubo vira a bitola de rosca pela ABNT NBR 5648 (PVC soldável). Outro material, ou sem composição: pendente com o motivo. Os adaptadores soldável × rosca não são deduzidos.")] }],
        onMudar: function (id, valor) { self.mudarCfg(id, valor); if (id === "i:famId" || id === "i:tipoId") { U._p12.acFam = self.cfg.famId; U._p12.acTipo = self.cfg.tipoId; } return self.esquemaFerramenta(); } };
    };

    /* ------------------------------------------------ Propriedades: acessório e trecho */
    U.propsAcessorio = function (uid, a) {
      var I = BI(), b = B(), est = b.editarEstado(), self = U;
      var sp = I.sinapiDe(I.itemAcessorio(a)), S = I.sistemas(est.estado, b.familiaAvaliar), c = S.de(a.trecho) || S.de(a.novoId);
      var sec = [{ nome: "Identidade", params: [ro("p12:fam", "Família", a.nome), { id: "p12:tipo", rotulo: "Tipo", tipo: "lista", valor: a.variante, opcoes: tiposDe(a.famId) },
          ro("p12:sis", "Sistema", I.SISTEMAS[a.sistema].nome), ro("p12:nsis", "Nome do sistema", c ? c.codigo + " — " + c.nome : "—"),
          ro("p12:dn", "DN do tubo", String(a.dn)), ro("p12:ff", "Face a face", fmt(a.comprimento, 3) + " m"), ro("p12:tr", "Trechos", [a.trecho, a.novoId].filter(Boolean).join(" | "), "O tubo foi dividido aqui; apagar o acessório emenda.")] },
        { nome: "Orçamento (SINAPI pelo mapa)", params: sp.status === "ok"
          ? [ro("io:cod", "Composição", sp.codigo + " (" + sp.unidade + ")"), ro("io:desc", "Descrição", sp.descricao, sp.descricao)]
          : [ro("io:pend", "Situação", "pendente", sp.motivo)] },
        { nome: "Ações", params: [{ id: "p12:apagar", rotulo: "Acessório", tipo: "botao", rotuloBotao: "Apagar (emenda o tubo)", fn: function () { b.instOp({ op: "apagar", id: a.id }); } }] }];
      return { daPeca: true, uid: uid, semEditarTipo: true, icone: "link", titulo: a.nome + " (" + a.id + ")", secoes: sec, motivoLeitura: a.avisos.join(" "),
        onMudar: function (pid, valor) { self.mudarP12(uid, pid, valor); return self.props(uid); } };
    };
    U.secoesTrechoP12 = function (t) {
      var I = BI(), b = B(), est = b.editarEstado(), S = I.sistemas(est.estado, b.familiaAvaliar), c = S.de(t.id), out = [], st = U._p12, self = U;
      out.push({ nome: "Sistema", params: [ro("p12:codSis", "Número do sistema", c ? c.codigo : "—", "Trechos ligados (nó, peça ou acessório no meio) são um sistema, numerado por tipo na ordem do modelo."),
        { id: "p12:nomeSis", rotulo: "Nome do sistema", tipo: "texto", valor: c ? c.nome : "" }] });
      var M = I.MATERIAIS[t.material] || {};
      if (I.SISTEMAS[t.sistema].grupo === "agua" && !M.secao && !M.flexivel) out.push({ nome: "Acessório neste tubo", params: [
        { id: "p12:acFam", rotulo: "Família", tipo: "lista", valor: st.acFam, opcoes: FAMS_AC.map(function (id) { var f = famRA(id); return { id: id, rotulo: f ? f.nome : id }; }) },
        { id: "p12:acTipo", rotulo: "Tipo", tipo: "lista", valor: st.acTipo || (tiposDe(st.acFam)[0] || {}).id, opcoes: tiposDe(st.acFam) },
        { id: "p12:acColocar", rotulo: "No meio do trecho", tipo: "botao", rotuloBotao: "Colocar (divide o tubo)", fn: function () { self.colocarAcessorioNoMeio(t.id, st.acFam, st.acTipo); } }] });
      if (!t.vertical) out.push({ nome: "Paralelos", params: [
        { id: "p12:n", rotulo: "Quantos", tipo: "numero", passo: "1", valor: st.n },
        { id: "p12:esp", rotulo: "Espaçamento (eixo a eixo)", unidade: "m", tipo: "numero", passo: "0.05", valor: st.esp },
        { id: "p12:lado", rotulo: "Lado", tipo: "lista", valor: String(st.lado), opcoes: [{ id: "1", rotulo: "Esquerda do traço" }, { id: "-1", rotulo: "Direita do traço" }] },
        { id: "p12:parCriar", rotulo: "A linha inteira deste trecho", tipo: "botao", rotuloBotao: "Criar paralelos", fn: function () { self.criarParalelos(t.id); } }] });
      return out;
    };
    U.mudarP12 = function (uid, pid, valor) {
      var b = B(), id = String(uid).replace(/^edit:/, ""), k = String(pid).replace(/^p12:/, ""), st = U._p12;
      if (k === "nomeSis") return b.instOp({ op: "instSistema", id: id, nome: String(valor == null ? "" : valor).trim() });
      if (k === "tipo") return b.instOp({ op: "instAlterar", id: id, tipoId: String(valor) });
      if (k === "acFam") { st.acFam = String(valor); st.acTipo = ""; return true; }
      if (k === "acTipo") { st.acTipo = String(valor); return true; }
      if (k === "n") { var n = Math.round(num(valor, 1)); if (n >= 1 && n <= 10) st.n = n; return true; }
      if (k === "esp") { var e = num(valor, 0.15); if (e >= 0.02 && e <= 3) st.esp = e; return true; }
      if (k === "lado") { st.lado = Number(valor) < 0 ? -1 : 1; return true; }
      return false;
    };
    /* PARALELOS: as cópias da linha num LOTE (um Ctrl+Z desfaz todas); os joelhos saem sozinhos */
    U.opsParalelos = function (estado, trechoId, o, ops) {
      var I = BI(), r = I.paralelos(estado, trechoId, o); if (!r.ok) return r;
      var por = {}; estado.instalacoes.trechos.forEach(function (t) { por[t.id] = t; });
      var novas = [], todas = (ops || []).slice();
      r.copias.forEach(function (copia) {
        copia.forEach(function (s) {
          var t = por[s.de], M = I.MATERIAIS[t.material] || {};
          var x = { op: "trecho", id: U._proxId("t", todas), sistema: t.sistema, material: t.material, p1: s.p1, p2: s.p2 };
          if (M.secao === "retangular") { x.larg = t.larg; x.alt = t.alt; if (t.bitola) x.bitola = t.bitola; if (t.iso) x.iso = t.iso; } else x.dn = t.dn;
          ["pn", "classe"].forEach(function (k2) { if (t[k2]) x[k2] = t[k2]; });
          if (t.iso && !M.secao) x.iso = t.iso;
          if (!t.aplicacaoAuto) x.aplicacao = t.aplicacao;
          novas.push(x); todas.push(x);
        });
      });
      return { ok: true, ops: novas, lote: { op: "lote", id: "paralelos-" + trechoId + "-" + novas.length + "-" + (todas.length), origem: "instalacoes", pedido: "Paralelos de " + trechoId + " (" + r.copias.length + " × " + r.cadeia.length + " trecho(s))", ops: novas }, cadeia: r.cadeia, avisos: r.avisos };
    };
    U.criarParalelos = function (trechoId) {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!est) return false;
      var st = U._p12, r = U.opsParalelos(est.estado, trechoId, { n: st.n, espacamento: st.esp, lado: st.lado }, b.editarOps ? b.editarOps() : []);
      if (!r.ok) { status(r.motivo); toast(r.motivo, "aviso"); return false; }
      b.editarLote(r.lote);
      status(r.ops.length + " trecho(s) paralelo(s) a " + r.cadeia.join(", ") + (r.avisos.length ? " — " + r.avisos.join("; ") : "") + ". Ctrl+Z desfaz tudo.");
      return true;
    };

    /* ------------------------------------------------ 3D: o corpo do acessório e as desconexões */
    var VERMELHO = "#E0262B";
    U.malhasP12 = function (R, famAval, THREE) {
      var I = BI(), out = [], self = U;
      (R.acessorios || []).forEach(function (a) {
        var av = typeof famAval === "function" ? famAval(a.famId, a.variante, { DN: a.dn }) : null, cor = I.SISTEMAS[a.sistema].cor, ms = [];
        var u = new THREE.Vector3(a.dir.x, a.dir.y, a.dir.z).normalize(), ref = Math.abs(u.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        var v = ref.clone().sub(u.clone().multiplyScalar(u.dot(ref))).normalize(), w = new THREE.Vector3().crossVectors(u, v);
        var Mx = new THREE.Matrix4().makeBasis(u, v, w).setPosition(a.centro.x, a.centro.y, a.centro.z);
        ((av && av.solidos) || []).forEach(function (s) {
          var m;
          if (s.forma === "caixa") { m = new THREE.Mesh(new THREE.BoxGeometry(s.dx, s.dy, s.dz), self._mat(THREE, cor)); m.position.set(s.x, s.y + s.dy / 2, s.z); }
          else if (s.forma === "cilindro") {
            m = new THREE.Mesh(new THREE.CylinderGeometry(s.raio, s.raio, s.altura, 18), self._mat(THREE, cor));
            if (s.eixo === "x") { m.rotation.z = -Math.PI / 2; m.position.set(s.x + s.altura / 2, s.y, s.z); }
            else if (s.eixo === "z") { m.rotation.x = Math.PI / 2; m.position.set(s.x, s.y, s.z + s.altura / 2); }
            else m.position.set(s.x, s.y + s.altura / 2, s.z);
          } else return;
          m.updateMatrix(); m.applyMatrix4(Mx); ms.push(m);
        });
        if (!ms.length) {   /* a família não está na biblioteca deste aparelho: o corpo no eixo, honesto */
          var mc = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(a.dn / 1000, 0.015), Math.max(a.dn / 1000, 0.015), a.comprimento, 16), self._mat(THREE, cor));
          mc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u); mc.position.set(a.centro.x, a.centro.y, a.centro.z); ms.push(mc);
        }
        var sp = I.sinapiDe(I.itemAcessorio(a));
        out.push({ id: a.id, ifc: "IFCVALVE", malhas: ms, disciplina: "hidraulica", codigo: sp.codigo || null, nome: a.nome + " · DN " + a.dn + " (" + a.id + ")", qto: { contagem: 1 } });
      });
      if (U._desc) {
        var marcar = function (p, id) { var m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), self._mat(THREE, VERMELHO)); m.position.set(p.x, p.y, p.z); m.userData.desconexao = true; out.push({ id: id, malhas: [m], marcador: true, desconexao: true }); };
        R.pontasLivres.forEach(function (p) { marcar(p, p.trecho); });
        R.conectoresLivres.forEach(function (k) { marcar(k, k.famInst); });
      }
      return out;
    };

    /* ------------------------------------------------ VERIFICAR, DESCONEXÕES, LEGENDA, TABELA */
    U.verificarSistemas = function () {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!est || !BI()) return null;
      U._verif = BI().verificar(est.estado, b.familiaAvaliar);
      U.abrirPainel();
      var r = U._verif;
      status(r.total ? "Verificar sistemas: " + r.total + " item(ns) — " + r.erros + " erro(s). A lista está no painel Instalações." : "Verificar sistemas: nada a corrigir (" + r.sistemas.length + " sistema(s)).");
      return r;
    };
    U.alternarDesconexoes = function (on) { U._desc = !!on; reconstruir(); var R = U._ultimaRede; if (on && R) status((R.pontasLivres.length + R.conectoresLivres.length) + " desconexão(ões) marcada(s) em vermelho."); };
    U.legendaPlanta = function (on) {
      U._legenda = !!on;
      try { var D = global.Bim2D; if (D && D.plantasAbertas) D.plantasAbertas().forEach(function (id) { D.atualizar(id); }); } catch (e) {}
      if (on) status("Legenda de tubulação ligada nas plantas baixas (por sistema e DN).");
    };
    U.tabela = function () { var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; return est && BI() ? BI().tabelaPecas(est.estado, b.familiaAvaliar) : null; };
    U.baixarXlsx = function () {
      var T = U.tabela(); if (!T || !T.linhas.length) { toast("Nada modelado nas instalações.", "aviso"); return false; }
      var X = global.Excel; if (!X || !X.ensureExcelJS) { toast("O gerador de planilha não carregou.", "erro"); return false; }
      X.ensureExcelJS(function () {
        var wb = new global.ExcelJS.Workbook(), ws = wb.addWorksheet("Peças MEP");
        ws.addRow(["Tabela de peças das instalações — OrçaPRO (modelo)"]); ws.getRow(1).font = { bold: true, size: 13 };
        var cab = ws.addRow(T.colunas);
        cab.eachCell(function (c) { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2740" } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
        T.linhas.forEach(function (l, i) {
          var r = ws.addRow([l.categoria, l.tipo, l.sistema, l.nomeSistema, l.tamanho, l.comprimento, l.quantidade, l.unidade, l.codigo || "pendente", l.situacao]);
          r.getCell(6).numFmt = "#,##0.000"; r.getCell(7).numFmt = "#,##0.000";
          if (i % 2) r.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } }; });
        });
        [26, 44, 22, 26, 12, 16, 12, 9, 14, 11].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
        ws.views = [{ state: "frozen", ySplit: 2 }];
        wb.xlsx.writeBuffer().then(function (buf) {
          var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = "tabela-pecas-instalacoes.xlsx"; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        });
      });
      return true;
    };
    function corQ(c) { return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c + ';margin-right:5px"></span>'; }
    function spH(sp) { return sp.status === "ok" ? '<span title="' + esc(sp.descricao) + '">' + esc(sp.codigo) + "</span>" : '<span class="muted" title="' + esc(sp.motivo) + '">pendente</span>'; }
    U.htmlP12 = function (est, q) {
      var I = BI(), b = B(), h = "";
      if (q.acessorios && q.acessorios.length) {
        h += '<b>Acessórios de tubo</b><table class="tbl" data-inst="acessorios" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Acessório</th><th>Tipo</th><th>DN</th><th>Qtd</th><th>SINAPI</th></tr></thead><tbody>';
        q.acessorios.forEach(function (g) { h += "<tr><td>" + corQ(I.SISTEMAS[g.sistema].cor) + esc(g.nome) + "</td><td>" + esc(I.ACESSORIOS[g.acessorio].variantes[g.variante].rot) + "</td><td>" + g.dn + (g.dnSinapi && !/^DN/.test(g.dnSinapi) && g.dnSinapi !== String(g.dn) ? " (" + esc(g.dnSinapi) + "\")" : "") + "</td><td>" + g.n + "</td><td>" + spH(g.sinapi) + "</td></tr>"; });
        h += "</tbody></table>";
      }
      if (q.dispositivos && q.dispositivos.length) {
        h += '<b>Dispositivos elétricos, luminárias e quadros</b><table class="tbl" data-inst="dispositivos" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Item</th><th>Qtd</th><th>SINAPI</th></tr></thead><tbody>';
        q.dispositivos.forEach(function (g) { h += "<tr><td>" + esc(g.rotulo) + "</td><td>" + g.n + "</td><td>" + spH(g.sinapi) + "</td></tr>"; });
        h += "</tbody></table>";
      }
      var S = I.sistemas(est.estado, b.familiaAvaliar);
      if (S.lista.length) {
        h += '<b>Sistemas</b><table class="tbl" data-inst="sistemas" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Nº</th><th>Nome</th><th>Trechos</th><th>Metros</th></tr></thead><tbody>';
        S.lista.forEach(function (c) { h += "<tr><td>" + corQ(I.SISTEMAS[c.sistema].cor) + esc(c.codigo) + "</td><td>" + esc(c.nome) + "</td><td>" + c.trechos.length + "</td><td>" + fmt(c.metros, 2) + "</td></tr>"; });
        h += "</tbody></table>";
      }
      if (U._verif) {
        var r = U._verif;
        h += '<div data-inst="verificacao" style="font-size:12px;margin:4px 0 10px"><b>Verificar sistemas</b> — ' + (r.total ? r.total + " item(ns), " + r.erros + " erro(s)" : "nada a corrigir") +
          '<ul style="margin:4px 0;padding-left:18px">' + r.itens.slice(0, 60).map(function (i) {
            return '<li data-inst-verif="' + esc(i.tipo) + '" style="color:' + (i.gravidade === "erro" ? "var(--vermelho,#b91c1c)" : "var(--amarelo,#b45309)") + '"><b>' + esc(i.rotuloTipo) + ":</b> " + esc(i.texto) +
              (i.ids.length ? ' <button class="btn sm" data-inst="p12-ir" data-id="' + esc(i.ids[0]) + '">ver</button>' : "") + "</li>";
          }).join("") + "</ul></div>";
      }
      var L = I.legenda(est.estado);
      if (L.length) {
        h += '<b>Legenda de tubulação</b><div data-inst="legenda" style="font-size:12px;margin:4px 0 10px">' + L.map(function (g) {
          return '<div><span style="display:inline-block;width:22px;height:3px;background:' + g.cor + ';vertical-align:middle;margin-right:6px"></span><b>' + esc(g.abrev) + "</b> — " + esc(g.nome) + ": " + esc(g.tamanhos.join(", ")) + " (" + fmt(g.metros, 2) + " m)</div>";
        }).join("") + "</div>";
      }
      if (U._tabela) {
        var T = I.tabelaPecas(est.estado, b.familiaAvaliar);
        h += '<b>Tabela de peças</b><div style="max-height:320px;overflow:auto;margin:4px 0 10px"><table class="tbl" data-inst="tabela-pecas" style="font-size:11.5px"><thead><tr>' + T.colunas.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          T.linhas.map(function (l) { return '<tr data-id="' + esc(l.id) + '"><td>' + esc(l.categoria) + "</td><td>" + esc(l.tipo) + "</td><td>" + esc(l.sistema) + "</td><td>" + esc(l.nomeSistema) + "</td><td>" + esc(l.tamanho) + "</td><td>" + (l.comprimento != null ? fmt(l.comprimento, 3) : "") + "</td><td>" + (l.quantidade != null ? fmt(l.quantidade, 3) : "") + "</td><td>" + esc(l.unidade) + "</td><td" + (l.motivo ? ' title="' + esc(l.motivo) + '"' : "") + ">" + esc(l.codigo || "pendente") + "</td><td>" + esc(l.situacao) + "</td></tr>"; }).join("") +
          "</tbody></table></div>";
      }
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><button class="btn sm" data-inst="p12-verificar">Verificar sistemas</button><button class="btn sm" data-inst="p12-desc">' + (U._desc ? "Ocultar desconexões" : "Mostrar desconexões") + '</button>' +
        '<button class="btn sm" data-inst="p12-legenda">' + (U._legenda ? "Tirar a legenda da planta" : "Legenda na planta") + '</button><button class="btn sm" data-inst="p12-tabela">' + (U._tabela ? "Fechar a tabela" : "Tabela de peças") + "</button>" +
        (U._tabela ? '<button class="btn sm primary" data-inst="p12-xlsx">Baixar .xlsx</button>' : "") + "</div>";
      return h;
    };
    U.cliquePainelP12 = function (a, bt) {
      if (a === "p12-verificar") { U.verificarSistemas(); return true; }
      if (a === "p12-desc") { U.alternarDesconexoes(!U._desc); U.renderPainel(); return true; }
      if (a === "p12-legenda") { U.legendaPlanta(!U._legenda); U.renderPainel(); return true; }
      if (a === "p12-tabela") { U._tabela = !U._tabela; U.renderPainel(); return true; }
      if (a === "p12-xlsx") { U.baixarXlsx(); return true; }
      if (a === "p12-ir") { var id = bt.getAttribute("data-id"), b = B(); try { if (b && b.enquadrarUids) b.enquadrarUids(["edit:" + id]); if (global.BimShell) global.BimShell.pintarProps(U.props("edit:" + id)); } catch (e) {} return true; }
      return false;
    };
    /* o que a paleta do registro (js/bimpropsui.js, P1-C) mostra embaixo, numa peça de instalação: as seções da B5 + P12 */
    U.extrasPaleta = function (uid) { var p = U.props(uid); return p ? p.secoes : []; };
    U.mudarExtra = function (uid, pid, valor) { var p = U.props(uid); if (p && typeof p.onMudar === "function") p.onMudar(pid, valor); };
  }

  var BimInstUI = {
    cfg: null,

    /* ------------------------------------------------ prévia e fita */
    ativo: function () { try { return !!(global.BimPrevia && BimPrevia.modelador()); } catch (e) { return false; } },
    /* a fita nova (B1) traz tubo/conexão/aparelho/eletroduto "em breve"; com a
       prévia do modelador eles passam a existir (js/bimribbon.js SOBRE_MODELADOR) */
    registrarFita: function () {
      var R = global.BimRibbon; if (!R) return;
      R.SOBRE_MODELADOR = R.SOBRE_MODELADOR || {};
      R.SOBRE_MODELADOR.tubo = { emBreve: false, tipo: "alterna", dica: "Tubo de água fria, água quente, esgoto, ventilação ou pluvial: escolha o material e o DN em Propriedades e clique os pontos. Esgoto e pluvial descem pela inclinação, e a cota de saída aparece a cada clique." };
      R.SOBRE_MODELADOR.conexao = { emBreve: false, dica: "As conexões saem SOZINHAS onde dois trechos se encontram: joelho 90°/45°, tê, junção, luva e redução, pela geometria e pelo DN. Aqui abre a lista, com a composição SINAPI de cada uma." };
      R.SOBRE_MODELADOR.aparelho = { emBreve: false, tipo: "alterna", dica: "Ralo sifonado, ralo seco e caixa sifonada — e as louças da biblioteca RA (bacia, lavatório, chuveiro, caixa d'água) com o ponto de ligação: o tubo que chega no ponto fica ligado." };
      R.SOBRE_MODELADOR.eletroduto = { emBreve: false, tipo: "alterna", rotulo: "Eletroduto,\ncaixa e duto", dica: "Eletroduto (corrugado, reforçado, roscável, soldável), caixas 4×2, 4×4 e octogonal, e duto de ar (retangular de chapa ou flexível) — o mesmo jeito de traçar do tubo." };
    },
    /* o que a Gestao chama para os quatro comandos da fita. G = a Gestao (para abrir painel e família) */
    comando: function (id, e, G) {
      if (!this.ativo()) { toast("Instalações estão na prévia do modelador: abra com ?previa=modelador.", "aviso"); return true; }
      if (e && e.ligado === false) { if (B() && B().editarArmar) B().editarArmar(null); this.cfg = null; return true; }
      this._G = G || this._G;
      if (id === "conexao") { this.abrirPainel(); return true; }
      if (id === "tubo") return this.armar("tubo");
      if (id === "eletroduto") return this.armar("eletroduto");
      if (id === "aparelho") return this.armar("peca", { sistema: "esgoto", peca: "ralo_sifonado" });
      return false;
    },

    /* ------------------------------------------------ ferramenta */
    _cfgPadrao: function (ferr, par) {
      var I = BI(), sis = (par && par.sistema) || (ferr === "eletroduto" ? "eletrica" : (ferr === "duto" ? "ar" : (ferr === "eletrocalha" ? "bandeja" : "agua_fria")));   /* P12: eletrocalha */
      var S = I.SISTEMAS[sis], M = I.MATERIAIS[S.material];
      var c = { ferramenta: ferr, sistema: sis, material: S.material, dn: M.dn, pn: M.pn || "", classe: M.classe || "", iso: M.iso || "", bitola: M.bitola || "",
                larg: M.larg || 0.40, alt: M.alt || 0.25, aplicacao: "", cota: COTA_PADRAO[sis], inclinacao: I.inclinacaoMinima(sis, M.dn),
                peca: (par && par.peca) || (sis === "eletrica" ? "caixa_4x2" : "ralo_sifonado"), pecaDn: "", pecaMat: "pvc", alturaPiso: 0.30, dh: 2.50 };
      return c;
    },
    armar: function (ferr, par) {
      var I = BI(), b = B(); if (!I || !b || !b.editarArmar) { toast("O visualizador 3D ainda não abriu.", "aviso"); return false; }
      var ant = this.cfg;
      this.cfg = this._cfgPadrao(ferr === "acessorio" ? "tubo" : ferr, par);
      if (ferr === "acessorio") { this.cfg.ferramenta = "acessorio"; this.cfg.famId = (par && par.famId) || "ra-registro-gaveta"; this.cfg.tipoId = (par && par.tipoId) || ""; }   /* P12 */
      /* trocar de ferramenta guarda o sistema/DN de antes quando cabe */
      if (ant && ferr === "tubo" && ant.ferramenta === "tubo") { ["sistema", "material", "dn", "pn", "classe", "iso", "cota", "inclinacao", "aplicacao"].forEach(function (k) { this.cfg[k] = ant[k]; }, this); }
      b.editarArmar("inst", {});
      /* na fita, só o botão da ferramenta armada fica aceso */
      try {
        var R = global.BimRibbon, aceso = ferr === "peca" ? (this.cfg.sistema === "eletrica" ? "eletroduto" : "aparelho") : (ferr === "acessorio" ? "acessorio-tubo" : ferr);
        if (R) { ["tubo", "aparelho", "eletroduto", "eletrocalha", "acessorio-tubo"].forEach(function (k) { if (R.comando && R.comando(k)) R.setAtivo(k, k === aceso); }); if (global.BimShell && BimShell.pintarFita) BimShell.pintarFita(); }
      } catch (eR) {}
      this._planoCota();
      this.pintarProps();
      this.dica();
      return true;
    },
    dica: function () {
      var c = this.cfg; if (!c) return;
      var I = BI(), S = I.SISTEMAS[c.sistema];
      var t;
      if (c.ferramenta === "acessorio") t = this.dicaAcessorio();   /* P12 */
      else if (c.ferramenta === "peca") t = I.PECAS[c.peca].nome + ": clique onde colocar" + (S.grupo === "eletrica" ? " (altura do piso em Propriedades)" : " (no piso)") + ". Esc encerra.";
      else t = S.nome + " " + (I.MATERIAIS[c.material] && I.MATERIAIS[c.material].secao === "retangular" ? Math.round(c.larg * 100) + "×" + Math.round(c.alt * 100) + " cm" : "DN " + c.dn) +
        ": clique o INÍCIO e os pontos seguintes (cota inicial " + fmt(c.cota, 2) + " m" + (S.gravidade ? ", descendo " + fmt(c.inclinacao, 2) + "%" : "") + "). Clique num ponto de aparelho, na ponta ou no meio de outro tubo para ligar. Esc encerra.";
      status(t);
      try { var ctx = this._ctx(); if (ctx) ctx.hint(t); } catch (e) {}
    },
    _ctx: function () { var b = B(); return b && b._instCtx ? b._instCtx() : null; },
    /* o plano onde o clique cai = a cota do traço (o raio do mouse acerta o
       ponto certo em perspectiva); sem traço aberto, a cota inicial */
    _planoCota: function () {
      var ctx = this._ctx(), c = this.cfg; if (!ctx || !c || ctx.edit.p1) return;
      ctx.edit.instY = this.planoY(ctx.edit.base || 0);
    },
    /* a cota do plano de clique sem traço aberto (o js/bim.js pergunta aqui depois do Esc) */
    planoY: function (base) {
      var c = this.cfg, I = BI(); base = base || 0; if (!c || !I) return base;
      if (c.ferramenta === "peca") return I.PECAS[c.peca].sistemas[0] === "eletrica" ? (c.peca === "caixa_octogonal" ? base + num(c.cota, 2.75) : base + num(c.alturaPiso, 0.3)) : base;
      return base + num(c.cota, 0);
    },

    /* próximo id livre do prefixo (t = trecho, k = peça) — olhando as ops */
    _proxId: function (pref, ops) {
      var mx = 0, re = new RegExp("^" + pref + "(\\d+)$");
      (ops || []).forEach(function (o) { var m = re.exec(String(o && o.id || "")); if (m) mx = Math.max(mx, parseInt(m[1], 10)); });
      this._seq = this._seq || {};
      var v = Math.max(mx, this._seq[pref] || 0) + 1; this._seq[pref] = v;
      return pref + v;
    },

    /* ------------------------------------------------ AGARRAR (snap)
     * Perto do clique (em planta), nesta ordem: ponto de ligação de aparelho
     * do MESMO sistema, ponta de trecho, peça (ralo/caixa), meio de trecho
     * (vira tê). Devolve o ponto 3D EXATO do alvo. */
    agarrar: function (estado, famAval, p, sistema, raio) {
      var I = BI(); raio = raio || 0.15;
      if (!p || !estado) return null;
      function dPlan(a) { var dx = a.x - p.x, dz = a.z - p.z; return Math.sqrt(dx * dx + dz * dz); }
      var melhor = null, dm = raio;
      function ver(alvo, d, prio) { if (d <= dm + 1e-9 && (!melhor || prio < melhor.prio || (prio === melhor.prio && d < dm))) { melhor = alvo; melhor.prio = prio; dm = d; } }
      I.conectoresDoEstado(estado, famAval).forEach(function (k) { if (k.sistema === sistema) ver({ tipo: "aparelho", x: k.x, y: k.y, z: k.z, dn: k.dn, nome: k.nome, famInst: k.famInst }, dPlan(k), 0); });   /* FAMIMPORT: famInst (o DN do conector importado) */
      var inst = estado.instalacoes || { trechos: [], pecas: [] };
      inst.trechos.forEach(function (t) {
        if (t.sistema !== sistema) return;
        [t.p1, t.p2].forEach(function (q) { ver({ tipo: "ponta", x: q.x, y: q.y, z: q.z, dn: t.dn, trecho: t.id }, dPlan(q), 1); });
      });
      inst.pecas.forEach(function (k) { if (k.sistema === sistema) ver({ tipo: "peca", x: k.x, y: k.y, z: k.z, peca: k.peca, id: k.id }, dPlan(k), 2); });
      if (!melhor) inst.trechos.forEach(function (t) {
        if (t.sistema !== sistema || t.vertical) return;
        var ax = t.p2.x - t.p1.x, az = t.p2.z - t.p1.z, L2 = ax * ax + az * az; if (!(L2 > 0)) return;
        var u = ((p.x - t.p1.x) * ax + (p.z - t.p1.z) * az) / L2; if (u <= 0.02 || u >= 0.98) return;
        var q = { x: t.p1.x + ax * u, y: t.p1.y + (t.p2.y - t.p1.y) * u, z: t.p1.z + az * u };
        ver({ tipo: "meio", x: r4(q.x), y: r4(q.y), z: r4(q.z), dn: t.dn, trecho: t.id }, dPlan(q), 3);
      });
      return melhor;
    },

    /* ------------------------------------------------ CLIQUE no 3D */
    clique: function (ctx, p) {
      var c = this.cfg, I = BI(); if (!c || !ctx || !I) return;
      if (!p) { ctx.hint("Não achei o ponto — clique no plano de trabalho ou no modelo."); return; }
      var ed = ctx.edit, est = ed.estado || { instalacoes: { trechos: [], pecas: [] }, familias: [] }, base = ed.base || 0;
      if (c.ferramenta === "acessorio") { this.cliqueAcessorio(ctx, p); return; }   /* P12: registro/válvula no tubo */
      if (c.ferramenta === "peca") {
        var P = I.PECAS[c.peca], y = P.sistemas[0] === "eletrica" ? base + num(c.alturaPiso, 0.30) : base;
        if (c.peca === "caixa_octogonal") y = base + num(c.cota, 2.75);
        var op = { op: "peca", id: this._proxId("k", ed.ops), peca: c.peca, sistema: P.sistemas.indexOf(c.sistema) >= 0 ? c.sistema : P.sistemas[0],
                   x: r4(p.x), y: r4(y), z: r4(p.z), rotY: 0 };
        if (c.pecaDn) op.dn = c.pecaDn;
        if (P.materiais) op.material = c.pecaMat;
        if (P.sistemas[0] === "eletrica") op.alturaPiso = r4(y - base);
        ctx.op(op);
        ctx.hint(P.nome + " colocada" + (P.sistemas[0] === "eletrica" && c.peca !== "caixa_octogonal" ? " a " + fmt(y - base, 2) + " m do piso" : "") + ". Clique para outra, ou Esc.");
        ctx.marcar(); return;
      }
      var alvo = this.agarrar(est, ctx.famAval, p, c.sistema);
      var S = I.SISTEMAS[c.sistema];
      if (!ed.p1) {
        /* FAMIMPORT: começar no conector de uma família IMPORTADA (js/familiamalha.js) pega o DN dele — a conexão
           da família é feita para aquele diâmetro; DN fora da lista comercial do material fica o do traço (e a rede pede a redução) */
        if (alvo && alvo.tipo === "aparelho" && alvo.dn > 0 && alvo.famInst != null && alvo.dn !== c.dn) {
          var fi0 = (est.familias || []).filter(function (q) { return String(q.id) === String(alvo.famInst); })[0], av0 = fi0 && ctx.famAval ? ctx.famAval(fi0.famId, fi0.tipoId, fi0.inst) : null, M0 = I.MATERIAIS[c.material];
          if (av0 && av0.importada) {
            if (M0 && (M0.dns || []).indexOf(alvo.dn) >= 0) { c.dn = alvo.dn; this.pintarProps(); }
            else ctx.hint("O conector pede DN " + alvo.dn + ", que " + (M0 ? M0.nome : c.material) + " não tem na lista comercial: o tubo segue DN " + c.dn + " e a redução entra no nó.");
          }
        }
        var q0 = alvo ? { x: alvo.x, y: alvo.y, z: alvo.z } : { x: r4(p.x), y: r4(base + num(c.cota, 0)), z: r4(p.z) };
        ctx.inicio(q0);
        ctx.hint((alvo ? "Ligado em " + this._rotAlvo(alvo) + ". " : "") + "Início a " + fmt(q0.y - base, 2) + " m do nível. Clique o próximo ponto (Shift trava na horizontal/vertical; dá para digitar a distância).");
        this.pintarProps();
        return;
      }
      var p1 = { x: ed.p1.x, y: ed.p1.y, z: ed.p1.z };
      /* o comprimento sai das coordenadas JÁ arredondadas e a cota guarda 6 casas: com 4, o
         arredondamento da cota tirava a inclinação gravada de 1% exato em trecho curto */
      var dest = alvo ? { x: r4(alvo.x), z: r4(alvo.z) } : { x: r4(p.x), z: r4(p.z) };
      var Lh = Math.sqrt((dest.x - p1.x) * (dest.x - p1.x) + (dest.z - p1.z) * (dest.z - p1.z));
      var yH = S.gravidade ? p1.y - num(c.inclinacao, 0) / 100 * Lh : p1.y;
      var pts = [];
      if (Lh > 0.005) pts.push({ x: r4(dest.x), y: r6(yH), z: r4(dest.z) });
      /* o alvo está em outra cota: desce/sobe na vertical até ele (o joelho sai sozinho) */
      if (alvo && Math.abs(alvo.y - yH) > I.TOL) pts.push({ x: r4(alvo.x), y: r4(alvo.y), z: r4(alvo.z) });
      if (!pts.length) { ctx.hint("Pontos muito próximos — clique um ponto distinto."); return; }
      var ini = p1, criados = [];
      for (var i = 0; i < pts.length; i++) {
        var o = this._opTrecho(ini, pts[i], ed.ops);
        if (!I.normTrecho(o)) { ctx.hint("Trecho inválido (comprimento zero?)."); return; }
        criados.push(o); ini = pts[i];
      }
      var self = this;
      criados.forEach(function (o, k) { if (k < criados.length - 1) ed.ops.push(o); });
      ctx.op(criados[criados.length - 1]);                        /* um rebuild só, no fim */
      var fim = pts[pts.length - 1];
      var tot = criados.reduce(function (s, o) { var g = I.geometria(o.p1, o.p2); return s + g.comprimento; }, 0);
      var msg = criados.length + (criados.length > 1 ? " trechos" : " trecho") + " (" + fmt(tot, 2) + " m)";
      if (S.gravidade) msg += ", cota de saída " + fmt(fim.y - base, 3) + " m (desnível " + fmt(p1.y - fim.y, 3) + " m)";
      if (alvo) { ctx.fim(); this._planoCota(); ctx.hint(msg + " — ligado em " + self._rotAlvo(alvo) + ". Clique o início do próximo, ou Esc."); }
      else { ctx.inicio(fim); ctx.hint(msg + ". Continuando do fim — clique o próximo ponto, ou Esc."); }
      this._ultimaSaida = fim.y - base;
      ctx.marcar();
      this.pintarProps();
    },
    _rotAlvo: function (a) {
      if (a.tipo === "aparelho") return "\"" + a.nome + "\"";
      if (a.tipo === "peca") return BI().PECAS[a.peca].nome.toLowerCase();
      if (a.tipo === "meio") return "meio do trecho " + a.trecho + " (tê)";
      return "ponta do trecho " + a.trecho;
    },
    _opTrecho: function (p1, p2, ops) {
      var c = this.cfg, o = { op: "trecho", id: this._proxId("t", ops), sistema: c.sistema, material: c.material, p1: { x: r4(p1.x), y: r6(p1.y), z: r4(p1.z) }, p2: { x: r4(p2.x), y: r6(p2.y), z: r4(p2.z) } };
      if (c.material === "duto_chapa") { o.larg = c.larg; o.alt = c.alt; o.bitola = c.bitola; o.iso = c.iso; }
      else if (BI().MATERIAIS[c.material] && BI().MATERIAIS[c.material].secao === "retangular") { o.larg = c.larg; o.alt = c.alt; }   /* P12: eletrocalha */
      else o.dn = c.dn;
      if (c.material === "ppr") o.pn = c.pn;
      if (c.material === "cobre") { o.classe = c.classe; o.iso = c.iso; }
      if (c.aplicacao) o.aplicacao = c.aplicacao;
      return o;
    },
    /* trecho VERTICAL a partir do ponto atual (subir +, descer −) */
    vertical: function (dh) {
      var ctx = this._ctx(), c = this.cfg, I = BI(); if (!ctx || !c || !I) return false;
      var ed = ctx.edit; dh = num(dh, 0);
      if (!ed.p1) { ctx.hint("Clique primeiro o ponto de onde o trecho vertical sai."); return false; }
      if (!(Math.abs(dh) > 0.01)) { ctx.hint("Informe quanto subir (+) ou descer (−), em metros."); return false; }
      var p1 = { x: ed.p1.x, y: ed.p1.y, z: ed.p1.z }, p2 = { x: p1.x, y: r4(p1.y + dh), z: p1.z };
      ctx.op(this._opTrecho(p1, p2, ed.ops));
      ctx.inicio(p2);
      ctx.hint("Trecho vertical de " + fmt(Math.abs(dh), 2) + " m (" + (dh > 0 ? "subindo" : "descendo") + "). Continua do topo — clique o próximo ponto, ou Esc.");
      ctx.marcar(); this.pintarProps();
      return true;
    },

    /* ------------------------------------------------ PROPRIEDADES da ferramenta */
    esquemaFerramenta: function () {
      var c = this.cfg, I = BI(); if (!c || !I) return null;
      if (c.ferramenta === "acessorio") return this.esquemaAcessorio();   /* P12 */
      var self = this, S = I.SISTEMAS[c.sistema], M = I.MATERIAIS[c.material];
      var grupos = c.ferramenta === "eletroduto" ? ["eletrica", "ar", "bandeja"] : (c.ferramenta === "eletrocalha" ? ["bandeja"] : (c.ferramenta === "peca" ? null : ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial"]));   /* P12: eletrocalha */
      var ro = function (id, rot, v, motivo) { return { id: id, rotulo: rot, leitura: true, valor: v, motivo: motivo }; };
      var secoes = [];
      if (c.ferramenta === "peca") {
        var P = I.PECAS[c.peca];
        var pecasLista = Object.keys(I.PECAS).filter(function (k) { return (I.PECAS[k].sistemas[0] === "eletrica") === (c.sistema === "eletrica"); });
        var ps = [
          { id: "i:peca", rotulo: "Peça", tipo: "lista", valor: c.peca, opcoes: pecasLista.map(function (k) { return { id: k, rotulo: I.PECAS[k].nome }; }) },
          { id: "i:sistema", rotulo: "Sistema", tipo: "lista", valor: P.sistemas.indexOf(c.sistema) >= 0 ? c.sistema : P.sistemas[0], opcoes: P.sistemas.map(function (s) { return { id: s, rotulo: I.SISTEMAS[s].nome }; }) }
        ];
        if (P.dns.length > 1) ps.push({ id: "i:pecaDn", rotulo: "Tamanho (mm)", tipo: "lista", valor: c.pecaDn || P.dn, opcoes: P.dns.map(function (d) { return { id: d, rotulo: d.replace(/x/g, " × ") }; }) });
        if (P.materiais) ps.push({ id: "i:pecaMat", rotulo: "Material", tipo: "lista", valor: c.pecaMat, opcoes: P.materiais.map(function (m) { return { id: m, rotulo: m === "pvc" ? "PVC" : "Metálica" }; }) });
        if (P.sistemas[0] === "eletrica" && c.peca !== "caixa_octogonal") ps.push({ id: "i:alturaPiso", rotulo: "Altura do piso", unidade: "m", tipo: "numero", passo: "0.05", valor: c.alturaPiso },
          ro("i:faixa", "Faixa SINAPI", { baixa: "baixa (0,30 m)", media: "média (1,30 m)", alta: "alta (2,00 m)" }[I.alturaCaixa(c.alturaPiso)], "A SINAPI separa a caixa de parede em baixa, média e alta; vale a mais próxima da altura."));
        if (c.peca === "caixa_octogonal") ps.push({ id: "i:cota", rotulo: "Cota (laje)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.cota });
        secoes.push({ nome: "Peça", params: ps });
        if (c.sistema !== "eletrica") secoes.push({ nome: "Louças e caixa d'água (biblioteca RA, com ponto de ligação)", params: [
          { id: "i:fam-bacia", rotulo: "Bacia sanitária", tipo: "botao", rotuloBotao: "Colocar", fn: function () { self.colocarFamilia("ra-bacia", "conv"); } },
          { id: "i:fam-lav", rotulo: "Lavatório", tipo: "botao", rotuloBotao: "Colocar", fn: function () { self.colocarFamilia("ra-lavatorio", "l4535"); } },
          { id: "i:fam-ch", rotulo: "Chuveiro", tipo: "botao", rotuloBotao: "Colocar", fn: function () { self.colocarFamilia("ra-chuveiro", "ch"); } },
          { id: "i:fam-cx", rotulo: "Caixa d'água", tipo: "botao", rotuloBotao: "Colocar", fn: function () { self.colocarFamilia("ra-caixa-dagua", "c1000"); } }] });
        if (c.sistema === "eletrica") secoes.push({ nome: "Traçar", params: [{ id: "i:ir-elet", rotulo: "Eletroduto", tipo: "botao", rotuloBotao: "Traçar eletroduto", fn: function () { self.armar("eletroduto"); } }] });
      } else {
        var trac = [
          { id: "i:sistema", rotulo: "Sistema", tipo: "lista", valor: c.sistema, opcoes: grupos.map(function (s) { return { id: s, rotulo: I.SISTEMAS[s].nome }; }) },
          { id: "i:material", rotulo: "Material", tipo: "lista", valor: c.material, opcoes: S.materiais.map(function (m) { return { id: m, rotulo: I.MATERIAIS[m].nome }; }) }
        ];
        if (M.secao === "retangular" && M.larguras) {
          /* P12: eletrocalha — as larguras e a altura da SINAPI */
          trac.push({ id: "i:larg", rotulo: "Largura", unidade: "m", tipo: "lista", valor: String(c.larg), opcoes: M.larguras.map(function (l) { return { id: String(l / 1000), rotulo: l + " mm" }; }) },
            { id: "i:alt", rotulo: "Altura", unidade: "m", tipo: "lista", valor: String(c.alt), opcoes: M.alturas.map(function (l) { return { id: String(l / 1000), rotulo: l + " mm" }; }) });
        } else if (M.secao === "retangular") {
          trac.push({ id: "i:larg", rotulo: "Largura", unidade: "m", tipo: "numero", passo: "0.05", valor: c.larg }, { id: "i:alt", rotulo: "Altura", unidade: "m", tipo: "numero", passo: "0.05", valor: c.alt },
            { id: "i:bitola", rotulo: "Chapa (bitola)", tipo: "lista", valor: c.bitola, opcoes: M.bitolas.map(function (b) { return { id: b, rotulo: "#" + b }; }) },
            { id: "i:iso", rotulo: "Isolamento", tipo: "lista", valor: c.iso, opcoes: [{ id: "sem", rotulo: "Sem" }, { id: "colada", rotulo: "Manta colada" }] });
        } else trac.push({ id: "i:dn", rotulo: "Diâmetro (DN)", unidade: "mm", tipo: "lista", valor: String(c.dn), opcoes: M.dns.map(function (d) { return { id: String(d), rotulo: "DN " + d }; }) });
        if (M.pns) trac.push({ id: "i:pn", rotulo: "Classe de pressão", tipo: "lista", valor: c.pn, opcoes: M.pns.map(function (x) { return { id: x, rotulo: "PN " + x }; }) });
        if (M.classes) trac.push({ id: "i:classe", rotulo: "Classe", tipo: "lista", valor: c.classe, opcoes: M.classes.map(function (x) { return { id: x, rotulo: "Classe " + x }; }) },
          { id: "i:iso", rotulo: "Isolamento", tipo: "lista", valor: c.iso, opcoes: [{ id: "sem", rotulo: "Sem" }, { id: "com", rotulo: "Com" }] });
        var apls = I.APLICACOES[S.grupo] || {};
        trac.push({ id: "i:aplicacao", rotulo: "Aplicação", tipo: "lista", valor: c.aplicacao, opcoes: [{ id: "", rotulo: "Automática (vertical/horizontal)" }].concat(Object.keys(apls).map(function (k) { return { id: k, rotulo: apls[k] }; })) });
        trac.push(ro("i:norma", "Norma do produto", M.norma));
        secoes.push({ nome: "Traçado", params: trac });
        var cota = [{ id: "i:cota", rotulo: "Cota inicial (do nível)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.cota }];
        if (S.gravidade) {
          var im = I.inclinacaoMinima(c.sistema, c.dn);
          cota.push({ id: "i:inclinacao", rotulo: "Inclinação", unidade: "%", tipo: "numero", passo: "0.1", valor: c.inclinacao },
            ro("i:imin", "Mínima da norma", fmt(im, 2) + "%", c.sistema === "esgoto" ? "ABNT NBR 8160: 2% até DN 75; 1% a partir de DN 100." : "ABNT NBR 10844: condutor horizontal com no mínimo 0,5%."));
        }
        var b = B(), ctx = this._ctx(), ed = ctx && ctx.edit;
        if (ed && ed.p1) cota.push(ro("i:atual", "Cota do ponto atual", fmt(ed.p1.y - (ed.base || 0), 3) + " m"));
        if (this._ultimaSaida != null && S.gravidade) cota.push(ro("i:saida", "Última cota de saída", fmt(this._ultimaSaida, 3) + " m"));
        secoes.push({ nome: "Cota e inclinação", params: cota });
        secoes.push({ nome: "Trecho vertical (prumada, descida)", params: [
          { id: "i:dh", rotulo: "Subir (+) / descer (−)", unidade: "m", tipo: "numero", passo: "0.1", valor: c.dh },
          { id: "i:vert", rotulo: "A partir do ponto atual", tipo: "botao", rotuloBotao: "Criar trecho vertical", fn: function () { self.vertical(self.cfg.dh); } }] });
        if (c.ferramenta === "eletroduto") secoes.push({ nome: "Caixas", params: [{ id: "i:ir-caixa", rotulo: "Caixa 4×2, 4×4, octogonal", tipo: "botao", rotuloBotao: "Colocar caixa", fn: function () { self.armar("peca", { sistema: "eletrica", peca: "caixa_4x2" }); } }] });
      }
      secoes.push({ nome: "Cores por sistema (convenção RA)", params: Object.keys(I.SISTEMAS).map(function (s) { return ro("i:cor-" + s, I.SISTEMAS[s].nome, I.SISTEMAS[s].cor); }).concat([ro("i:cor-cx", "Caixa elétrica", I.COR_CAIXA_ELETRICA)]) });
      return {
        icone: "link", semEditarTipo: true,
        titulo: c.ferramenta === "peca" ? "Aparelho / peça" : (c.ferramenta === "eletroduto" ? "Eletroduto e duto" : (c.ferramenta === "eletrocalha" ? "Eletrocalha" : "Tubo")),
        secoes: secoes,
        onMudar: function (id, valor) { self.mudarCfg(id, valor); return self.esquemaFerramenta(); }
      };
    },
    pintarProps: function () { try { if (global.BimShell && BimShell.pintarProps && this.cfg) BimShell.pintarProps(this.esquemaFerramenta()); } catch (e) {} },
    mudarCfg: function (id, valor) {
      var c = this.cfg, I = BI(); if (!c) return;
      var k = String(id).replace(/^i:/, "");
      if (k === "sistema") {
        var S = I.SISTEMAS[valor]; if (!S) return;
        c.sistema = valor;
        if (c.ferramenta !== "peca") {
          if (S.materiais.indexOf(c.material) < 0) { c.material = S.material; c.dn = I.MATERIAIS[c.material].dn; }
          c.cota = COTA_PADRAO[valor]; c.aplicacao = "";
          c.inclinacao = I.inclinacaoMinima(valor, c.dn);
        } else if (I.PECAS[c.peca].sistemas.indexOf(valor) < 0) c.peca = Object.keys(I.PECAS).filter(function (p) { return I.PECAS[p].sistemas.indexOf(valor) >= 0; })[0];
      } else if (k === "material") {
        var M = I.MATERIAIS[valor]; if (!M) return;
        c.material = valor; if (M.dns.length && M.dns.indexOf(c.dn) < 0) c.dn = M.dn;
        if (M.larg) { c.larg = M.larg; c.alt = M.alt; }   /* P12: eletrocalha */
        c.pn = M.pn || ""; c.classe = M.classe || ""; c.iso = M.iso || ""; c.bitola = M.bitola || "";
      } else if (k === "famId" || k === "tipoId") { c[k] = String(valor); if (k === "famId") c.tipoId = "";   /* P12: acessório */
      } else if (k === "dn") { c.dn = num(valor, c.dn); if (I.SISTEMAS[c.sistema].gravidade) c.inclinacao = Math.max(c.inclinacao, I.inclinacaoMinima(c.sistema, c.dn)); }
      else if (k === "peca") { c.peca = valor; c.pecaDn = ""; }
      else if (["cota", "inclinacao", "larg", "alt", "alturaPiso", "dh"].indexOf(k) >= 0) { var v = num(valor, NaN); if (isFinite(v)) c[k] = v; }
      else if (["pn", "classe", "iso", "bitola", "aplicacao", "pecaDn", "pecaMat"].indexOf(k) >= 0) c[k] = String(valor);
      this._planoCota();
      this.dica();
    },
    colocarFamilia: function (famId, tipoId) {
      var b = B(), G = this._G; if (!b || !b.editarArmar) return false;
      try { if (G && G._famSync) G._famSync(); } catch (e) {}
      b.editarArmar("familia", { famId: famId, tipoId: tipoId, inst: {} });
      status("Clique onde colocar a louça (barra de espaço gira 90°). O ponto de ligação aparece como uma bolinha na cor do sistema.");
      return true;
    },

    /* ------------------------------------------------ MALHAS (o bim.js chama no replay)
     * Devolve [{ id, ifc, nome, malhas:[THREE.Mesh], qto, disciplina, codigo, marcador }]. */
    _mats: {},
    _mat: function (THREE, cor) {
      if (this._mats[cor]) return this._mats[cor];
      /* a cor da CONVENÇÃO é sRGB: new THREE.Color converte para o linear da cena
         (ColorManagement ligado no js/bim.js). O luzNum de lá é para LUZ — numa
         cor de material ele lavava o azul da água fria para um azul-bebê. */
      var c = new THREE.Color(cor);
      /* um pouco de brilho próprio na MESMA cor: com a luz forte da cena o tubo
         fino desbotava e o azul da água fria quase sumia contra o chão claro */
      this._mats[cor] = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.2), metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
      return this._mats[cor];
    },
    malhas: function (st, famAval, THREE) {
      var I = BI(), self = this, out = []; if (!I || !THREE || !st || !st.instalacoes) return out;
      var R = I.rede(st, famAval), Y = new THREE.Vector3(0, 1, 0);
      var discDe = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "eletrica" : (g === "ar" ? "climatizacao" : "hidraulica"); };
      var ifcTubo = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERSEGMENT" : (g === "ar" ? "IFCDUCTSEGMENT" : "IFCPIPESEGMENT"); };
      var ifcCx = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERFITTING" : (g === "ar" ? "IFCDUCTFITTING" : "IFCPIPEFITTING"); };   /* P12: eletrocalha */
      R.trechos.forEach(function (t) {
        var a = new THREE.Vector3(t.p1.x, t.p1.y, t.p1.z), b = new THREE.Vector3(t.p2.x, t.p2.y, t.p2.z), u = b.clone().sub(a), L = u.length(); if (!(L > 0)) return;
        u.normalize();
        var M = I.MATERIAIS[t.material], m;
        if (M.secao === "retangular") {
          m = new THREE.Mesh(new THREE.BoxGeometry(t.larg, t.alt, L), self._mat(THREE, I.SISTEMAS[t.sistema].cor));
          var w = Math.abs(u.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(Y, u).normalize(), v = new THREE.Vector3().crossVectors(u, w);
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, v, u));
        } else {
          var r = Math.max(t.dn / 2000, 0.008);
          m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 14, 1, false), self._mat(THREE, I.SISTEMAS[t.sistema].cor));
          m.quaternion.setFromUnitVectors(Y, u);
        }
        m.position.copy(a).add(b).multiplyScalar(0.5);
        var sp = I.sinapiDe({ peca: "tubo", sistema: t.sistema, material: t.material, aplicacao: t.aplicacao, dn: t.material === "duto_chapa" ? "-" : t.dn, pn: t.pn, classe: t.classe, iso: t.iso, bitola: t.bitola, larg: t.larg, alt: t.alt });
        out.push({ id: t.id, ifc: ifcTubo(t.sistema), malhas: [m], disciplina: discDe(t.sistema), codigo: sp.codigo || null,
                   nome: I.SISTEMAS[t.sistema].nome + " · " + (M.secao === "retangular" ? Math.round(t.larg * 100) + "×" + Math.round(t.alt * 100) + " cm" : "DN " + t.dn) + " · " + M.nome + " (" + t.id + ")",
                   qto: { comprimento: t.comprimento, contagem: 1 } });
      });
      R.conexoes.forEach(function (c) {
        var r = Math.max((c.dn || 40) / 2000, 0.008) * 1.45;
        var m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), self._mat(THREE, I.SISTEMAS[c.sistema].cor));
        m.position.set(c.x, c.y, c.z);
        out.push({ id: c.id, ifc: ifcCx(c.sistema), malhas: [m], disciplina: discDe(c.sistema), nome: c.nome + " DN " + c.dn + (c.dn2 ? " × " + c.dn2 : "") + " (conexão automática)", qto: { contagem: 1 }, derivada: true });
      });
      R.pecas.forEach(function (k) {
        var P = I.PECAS[k.peca], cor = P.sistemas[0] === "eletrica" ? I.COR_CAIXA_ELETRICA : I.SISTEMAS[k.sistema].cor, m;
        if (P.forma === "caixa") { m = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.hh, P.d), self._mat(THREE, cor)); m.position.set(k.x, k.y, k.z); m.rotation.y = k.rotY || 0; }
        else { m = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, P.h, 18), self._mat(THREE, cor)); m.position.set(k.x, k.y - P.h / 2, k.z); }
        out.push({ id: k.id, ifc: P.ifc, malhas: [m], disciplina: P.sistemas[0] === "eletrica" ? "eletrica" : "hidraulica", nome: P.nome + (k.dn && k.dn !== "-" ? " " + k.dn.replace(/x/g, "×") : "") + " (" + k.id + ")", qto: { contagem: 1 } });
      });
      /* o PONTO DE LIGAÇÃO dos aparelhos: bolinha na cor do sistema, que é parte da família (o clique seleciona a louça) */
      R.conectores.forEach(function (k) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 6), self._mat(THREE, I.SISTEMAS[k.sistema].cor));
        m.position.set(k.x, k.y, k.z); m.userData.marcador = true;   /* RENDER: marcador de tela, não é peça (js/bimrender.js pula) */
        out.push({ id: k.famInst, malhas: [m], marcador: true });
      });
      /* P12: acessórios (o corpo da família, no eixo do tubo) e as desconexões marcadas */
      try { this.malhasP12(R, famAval, THREE).forEach(function (x) { out.push(x); }); } catch (eP12) {}
      this._ultimaRede = R;
      return out;
    },

    /* ------------------------------------------------ PROPRIEDADES do trecho/peça selecionado */
    ehInst: function (uid) { return /^edit:([tk]|ac)\d+$/.test(String(uid || "")) || /^edit:cx\d/.test(String(uid || "")); },   /* P12: ac = acessório */
    props: function (uid) {
      var I = BI(), b = B(); if (!I || !b || !b.editarEstado) return null;
      var id = String(uid).replace(/^edit:/, ""), est = b.editarEstado(); if (!est) return null;
      var st = est.estado, inst = st.instalacoes || { trechos: [], pecas: [] }, self = this;
      var ro = function (pid, rot, v, motivo) { return { id: pid, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: motivo }; };
      var t = inst.trechos.filter(function (x) { return x.id === id; })[0], k = inst.pecas.filter(function (x) { return x.id === id; })[0];
      var acP12 = (inst.acessorios || []).filter(function (x) { return x.id === id; })[0];
      if (acP12) return this.propsAcessorio(uid, acP12);   /* P12 */
      var sec = [], titulo = "", sp = null;
      if (t) {
        var S = I.SISTEMAS[t.sistema], M = I.MATERIAIS[t.material], apls = I.APLICACOES[S.grupo] || {};
        sp = I.sinapiDe({ peca: "tubo", sistema: t.sistema, material: t.material, aplicacao: t.aplicacao, dn: t.material === "duto_chapa" ? "-" : t.dn, pn: t.pn, classe: t.classe, iso: t.iso, bitola: t.bitola, larg: t.larg, alt: t.alt });
        titulo = S.nome + " — " + M.nome;
        var ps = [ro("it:sis", "Sistema", S.nome),
          { id: "it:material", rotulo: "Material", tipo: "lista", valor: t.material, opcoes: S.materiais.map(function (m) { return { id: m, rotulo: I.MATERIAIS[m].nome }; }) }];
        if (M.secao !== "retangular") ps.push({ id: "it:dn", rotulo: "Diâmetro (DN)", unidade: "mm", tipo: "lista", valor: String(t.dn), opcoes: M.dns.map(function (d) { return { id: String(d), rotulo: "DN " + d }; }) });
        else ps.push(ro("it:sec", "Seção", Math.round(t.larg * 100) + " × " + Math.round(t.alt * 100) + " cm"));
        ps.push({ id: "it:aplicacao", rotulo: "Aplicação", tipo: "lista", valor: t.aplicacaoAuto ? "" : t.aplicacao, opcoes: [{ id: "", rotulo: "Automática (" + (apls[t.aplicacao] || t.aplicacao) + ")" }].concat(Object.keys(apls).map(function (a) { return { id: a, rotulo: apls[a] }; })) });
        sec.push({ nome: "Identidade", params: ps });
        sec.push({ nome: "Geometria", params: [ro("it:L", "Comprimento (eixo)", fmt(t.comprimento, 3) + " m"), ro("it:Lh", "Em planta", fmt(t.comprimentoH, 3) + " m"),
          ro("it:dy", "Desnível", fmt(t.desnivel, 3) + " m"), ro("it:i", "Inclinação", t.inclinacao == null ? "vertical" : fmt(t.inclinacao, 2) + "%"),
          ro("it:y1", "Cota do início", fmt(t.p1.y, 3) + " m"), ro("it:y2", "Cota do fim (saída)", fmt(t.p2.y, 3) + " m")] });
      } else if (k) {
        var P = I.PECAS[k.peca];
        titulo = P.nome;
        sp = I.sinapiDe({ peca: k.peca, sistema: k.sistema, material: k.material, aplicacao: k.aplicacao, dn: k.dn });
        var pk = [ro("ik:sis", "Sistema", I.SISTEMAS[k.sistema].nome)];
        if (P.dns.length > 1) pk.push({ id: "ik:dn", rotulo: "Tamanho (mm)", tipo: "lista", valor: k.dn, opcoes: P.dns.map(function (d) { return { id: d, rotulo: d.replace(/x/g, " × ") }; }) });
        if (P.materiais) pk.push({ id: "ik:material", rotulo: "Material", tipo: "lista", valor: k.material, opcoes: P.materiais.map(function (m) { return { id: m, rotulo: m === "pvc" ? "PVC" : "Metálica" }; }) });
        if (k.alturaPiso != null) pk.push(ro("ik:h", "Altura do piso", fmt(k.alturaPiso, 2) + " m"), ro("ik:faixa", "Faixa SINAPI", k.aplicacao));
        var lig = (this._ultimaRede && this._ultimaRede.ligacoesPeca[k.id]) || 0;
        pk.push(ro("ik:lig", "Tubos ligados", String(lig)));
        sec.push({ nome: "Identidade", params: pk });
      } else {
        var cx = this._ultimaRede ? this._ultimaRede.conexoes.filter(function (x) { return x.id === id; })[0] : null;
        if (!cx) return null;
        titulo = cx.nome + " (automática)";
        sp = cx.material && /^duto_/.test(cx.material) ? { status: "pendente", motivo: "conexão de duto é orçada em m² de chapa" } : I.sinapiDe({ peca: cx.tipo, sistema: cx.sistema, material: cx.material, aplicacao: cx.aplicacao, dn: cx.dn, dn2: cx.dn2 });
        sec.push({ nome: "Identidade", params: [ro("ic:tipo", "Conexão", cx.nome), ro("ic:dn", "DN", cx.dn + (cx.dn2 ? " × " + cx.dn2 : "")), ro("ic:mat", "Material", (I.MATERIAIS[cx.material] || {}).nome),
          ro("ic:ramos", "Trechos", cx.ramos.join(", "), "A conexão é deduzida da geometria: mude os trechos, ela muda junto. Não se apaga à parte.")] });
      }
      sec.push({ nome: "Orçamento (SINAPI pelo mapa)", params: sp && sp.status === "ok"
        ? [ro("io:cod", "Composição", sp.codigo + " (" + sp.unidade + ")"), ro("io:desc", "Descrição", sp.descricao, sp.descricao), ro("io:alt", "Alternativas na base", String(sp.alternativas || 0), "O desempate é declarado em js/biminst.js (PN/classe, luva antes da bucha, menor código).")]
        : [ro("io:pend", "Situação", "pendente", sp ? sp.motivo : "")] });
      var av = t ? t.avisos : [];
      if (t) sec = sec.concat(this.secoesTrechoP12(t));   /* P12: sistema, acessório neste tubo, paralelos */
      return {
        daPeca: true, uid: uid, semEditarTipo: true, icone: "link", titulo: titulo, secoes: sec,
        motivoLeitura: av.length ? av.join(" ") : "",
        onMudar: function (pid, valor) {
          var o = { op: "instAlterar", id: id };
          if (pid === "it:material") { o.material = valor; var M2 = I.MATERIAIS[valor]; if (M2.dns.length && t && M2.dns.indexOf(t.dn) < 0) o.dn = M2.dn; }
          else if (pid === "it:dn") o.dn = num(valor, t ? t.dn : 0);
          else if (pid === "it:aplicacao") o.aplicacao = String(valor);
          else if (pid === "ik:dn") o.dn = String(valor);
          else if (pid === "ik:material") o.material = String(valor);
          else if (String(pid).indexOf("p12:") === 0) { self.mudarP12(uid, pid, valor); return self.props(uid); }   /* P12 */
          else return self.props(uid);
          if (b.instOp) b.instOp(o);
          return self.props(uid);
        }
      };
    },

    /* ------------------------------------------------ PAINEL "Instalações" */
    abrirPainel: function () {
      var G = this._G; if (G && G._bimAbrirPainel) G._bimAbrirPainel("inst");
      this.renderPainel();
    },
    renderPainel: function () {
      var corpo = document.getElementById("bim-inst-corpo"); if (!corpo) return;
      var I = BI(), b = B(), est = b && b.editarEstado ? b.editarEstado() : null;
      if (!I || !est) { corpo.innerHTML = '<p class="muted">Abra o BIM para ver as instalações.</p>'; return; }
      var q = I.qto(est.estado, b.familiaAvaliar), h = "";
      function sp(g) { return g.sinapi.status === "ok" ? '<span title="' + esc(g.sinapi.descricao) + '">' + esc(g.sinapi.codigo) + "</span>" : '<span class="muted" title="' + esc(g.sinapi.motivo) + '">pendente</span>'; }
      function cor(s) { return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + I.SISTEMAS[s].cor + ';margin-right:5px"></span>'; }
      h += '<div data-inst="resumo" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
      q.porSistema.forEach(function (s) { h += '<div style="border:1px solid rgba(127,127,127,.35);border-radius:9px;padding:6px 9px;font-size:12px">' + cor(s.sistema) + "<b>" + esc(s.nome) + "</b><br>" + fmt(s.metros, 2) + " m · " + s.conexoes + " conexões" + (s.pecas ? " · " + s.pecas + " peças" : "") + "</div>"; });
      if (!q.porSistema.length) h += '<p class="muted" style="font-size:12.5px">Nada modelado ainda. Use Tubo, Aparelho ou Eletroduto na aba Instalações.</p>';
      h += "</div>";
      if (q.tubos.length) {
        h += '<b>Tubos por sistema, material e DN</b><table class="tbl" data-inst="tubos" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Sistema</th><th>Material</th><th>DN</th><th>Aplicação</th><th>Metros</th><th>SINAPI</th></tr></thead><tbody>';
        q.tubos.forEach(function (g) {
          var M = I.MATERIAIS[g.material], apl = (I.APLICACOES[I.SISTEMAS[g.sistema].grupo] || {})[g.aplicacao] || g.aplicacao;
          h += "<tr><td>" + cor(g.sistema) + esc(I.SISTEMAS[g.sistema].abrev) + "</td><td>" + esc(M.nome) + (g.pn ? " PN" + esc(g.pn) : "") + "</td><td>" + (M.secao === "retangular" ? Math.round(g.larg * 100) + "×" + Math.round(g.alt * 100) : g.dn) +
            "</td><td>" + esc(apl) + "</td><td>" + fmt(g.metros, 2) + (g.unidade === "m2" ? " (" + fmt(g.quantidade, 2) + " m²)" : "") + "</td><td>" + sp(g) + "</td></tr>";
        });
        h += "</tbody></table>";
      }
      if (q.conexoes.length) {
        h += '<b>Conexões (automáticas)</b><table class="tbl" data-inst="conexoes" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Conexão</th><th>Material</th><th>DN</th><th>Qtd</th><th>SINAPI</th></tr></thead><tbody>';
        q.conexoes.forEach(function (g) { h += "<tr><td>" + cor(g.sistema) + esc(g.nome) + "</td><td>" + esc((I.MATERIAIS[g.material] || {}).nome || g.material) + "</td><td>" + g.dn + (g.dn2 ? " × " + g.dn2 : "") + "</td><td>" + g.n + "</td><td>" + sp(g) + "</td></tr>"; });
        h += "</tbody></table>";
      }
      if (q.pecas.length) {
        h += '<b>Peças</b><table class="tbl" data-inst="pecas" style="font-size:12px;margin:4px 0 10px"><thead><tr><th>Peça</th><th>Sistema</th><th>Qtd</th><th>SINAPI</th></tr></thead><tbody>';
        q.pecas.forEach(function (g) { h += "<tr><td>" + esc(g.nome) + (g.dn && g.dn !== "-" ? " " + esc(g.dn.replace(/x/g, "×")) : "") + "</td><td>" + cor(g.sistema) + esc(I.SISTEMAS[g.sistema].abrev) + "</td><td>" + g.n + "</td><td>" + sp(g) + "</td></tr>"; });
        h += "</tbody></table>";
      }
      h += '<p style="font-size:12px;margin:4px 0">' + q.ligacoes + " ligação(ões) em aparelho ou peça · " + q.pontasLivres + " ponta(s) livre(s)" + (q.conectoresLivres ? " · " + q.conectoresLivres + " ponto(s) de aparelho sem tubo" : "") + "</p>";
      if (q.avisos.length) h += '<div data-inst="avisos" style="font-size:12px;color:var(--amarelo,#b45309)"><b>Avisos (' + q.avisos.length + ")</b><ul style=\"margin:4px 0;padding-left:18px\">" + q.avisos.slice(0, 30).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></div>";
      h += '<p class="muted" style="font-size:11.5px">Código SINAPI só da tabela do mapa (js/biminstsinapi.js); sem composição = pendente, e entra em "Fora do orçamento" no Orçamento do modelo. Cores: AF azul, AQ vermelho, esgoto marrom, ventilação marrom claro, pluvial verde, eletroduto amarelo, caixa elétrica laranja, duto cinza-azulado.</p>' +
        '<div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm" data-inst="atualizar">Atualizar</button><button class="btn sm primary" data-inst="orc">Orçamento do modelo</button></div>';
      h += this.htmlP12(est, q);   /* P12: acessórios, dispositivos, sistemas, verificação, legenda e tabela de peças */
      corpo.innerHTML = h;
      var self = this;
      corpo.onclick = function (e) {
        var bt = e.target.closest ? e.target.closest("[data-inst]") : null; if (!bt) return;
        var a = bt.getAttribute("data-inst");
        if (self.cliquePainelP12(a, bt)) return;   /* P12 */
        if (a === "atualizar") self.renderPainel();
        else if (a === "orc") { var G = self._G; if (G && G._bimAbrirPainel) { G._bimAbrirPainel("orcmod"); if (global.OrcModeloUI) OrcModeloUI.renderPainel(); } }
      };
      this._ultimoQto = q;
    },
    aoMudarModelo: function () {
      var el = document.getElementById("bim-inst"), self = this;
      clearTimeout(this._t);
      this._t = setTimeout(function () {
        if (el && el.style.display !== "none") self.renderPainel();
        /* Propriedades de um trecho/peça abertas: repinta (o desfazer muda o DN por baixo delas) */
        try {
          var esq = global.BimShell && BimShell._estado ? BimShell._estado.props : null;
          if (esq && esq.uid && self.ehInst(esq.uid)) { var novo = self.props(esq.uid); BimShell.pintarProps(novo); }
        } catch (eP) {}
      }, 150);
    }
  };

  /* P12 — os métodos novos (acessório, eletrocalha, verificar, legenda, tabela): js/biminstui.js parte 2, abaixo */
  P12(BimInstUI);
  BimInstUI.registrarFita();
  global.BimInstUI = BimInstUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
