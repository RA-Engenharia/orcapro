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
    function tiposDe(famId) {
      var f = famRA(famId), out = f ? f.tipos.map(function (t) { return { id: t.id, rotulo: t.nome }; }) : [];
      /* PENDÊNCIAS FINAIS (18/10/2026), só com a prévia hidro: os tipos do motor que a família do master não lista — o registro de
         gaveta de PVC soldável (opcional, sem SINAPI) e a retenção de PVC (pressurização) */
      var Pv = global.BimPrevia, I = BI(), A = I && I.ACESSORIOS && I.ACESSORIO_DA_FAM ? I.ACESSORIOS[I.ACESSORIO_DA_FAM[famId]] : null;
      if (A && Pv && Pv.hidro && Pv.hidro()) Object.keys(A.variantes).forEach(function (v) { if (!out.some(function (t) { return t.id === v; })) out.push({ id: v, rotulo: A.variantes[v].rot.charAt(0).toUpperCase() + A.variantes[v].rot.slice(1) + (A.variantes[v].semSinapi ? " — sem SINAPI (referência de mercado)" : "") }); });
      return out;
    }
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
      var tipos = tiposDe(famId), tipo = tipoId && tipos.some(function (x) { return x.id === tipoId; }) ? tipoId : (I.varianteAuto && global.BimPrevia && BimPrevia.hidro && BimPrevia.hidro() ? I.varianteAuto(I.ACESSORIO_DA_FAM[famId], t) : (tipos[0] ? tipos[0].id : Object.keys(A.variantes)[0]));   /* pendências finais: com a prévia hidro, o tipo pelo lugar (embutido/aparente) */
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
        /* QUALIDADE VISUAL 1: corpo, castelo e volante/canopla paramétricos (js/biminstgeo.js) no lugar das caixas e cilindros
           da família — o face a face continua o da família (a.comprimento, medido nos conectores dela) */
        if (self._nivelFeito === "baixo" && global.BimInstNivel) ms = self._linhaMalhas(THREE, a.id, null);   /* NÍVEL Baixo: o símbolo de válvula */
        else if (global.HidGeo) {
          try {
            var V0 = I.ACESSORIOS[a.acessorio].variantes[a.variante] || {}, rg = global.HidGeo.registro({ centro: a.centro, dir: a.dir, comprimento: a.comprimento, dn: a.dn, material: a.material, variante: a.variante, acessorio: a.acessorio, varMaterial: V0.material }, { lod: self._lod, frente: global.BimInstColocar ? global.BimInstColocar.frenteAcessorio(a) : null });   /* COLOCAÇÃO: o giro do volante (Espaço) */
            ms = rg.partes.map(function (pt) { return self._malhaG(THREE, pt.malha, self._matPeca(THREE, a.material, a.sistema, pt.papel, null)); });
          } catch (eRg) { ms = []; }
        }
        if (!ms.length && self._nivelFeito !== "baixo") {   /* a família não está na biblioteca deste aparelho: o corpo no eixo, honesto */
          var mc = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(a.dn / 1000, 0.015), Math.max(a.dn / 1000, 0.015), a.comprimento, 16), self._mat(THREE, cor));
          mc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u); mc.position.set(a.centro.x, a.centro.y, a.centro.z); ms.push(mc);
        }
        var sp = I.sinapiDe(I.itemAcessorio(a));
        ms.forEach(function (mm) { mm.userData.instPapel = "acessorio"; mm.userData.instNivel = self._nivelFeito; });
        out.push({ id: a.id, ifc: "IFCVALVE", malhas: ms, disciplina: "hidraulica", codigo: sp.codigo || null, nome: a.nome + " · DN " + a.dn + " (" + a.id + ")", qto: { contagem: 1 } });
      });
      if (U._desc) {
        /* QUALIDADE VISUAL 1: a ESFERA vermelha de 12 cm virou um ANEL fino em volta da ponta (marcador discreto), só com a
           vista "problemas" ligada; o aviso continua no painel com Corrigir / Mostrar no 3D. Uma malha por marca (a e2e conta). */
        var G = global.HidGeo, porT = {}; (R.trechos || []).forEach(function (t) { porT[t.id] = t; });
        var marcar = function (p, id, dir, raio) {
          var m;
          if (G) { var mk = G.marcador([p.x, p.y, p.z], dir, raio || 0.01, { lod: self._lod }); m = self._malhaG(THREE, mk.partes[0].malha, self._matAp(THREE, G.aparencia(null, null, "marcador"))); }
          else { m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), self._mat(THREE, VERMELHO)); m.position.set(p.x, p.y, p.z); }
          m.userData.desconexao = true; out.push({ id: id, malhas: [m], marcador: true, desconexao: true });
        };
        R.pontasLivres.forEach(function (p) {
          var t = porT[p.trecho], dir = null;
          if (t) { var a1 = Math.hypot(t.p1.x - p.x, t.p1.y - p.y, t.p1.z - p.z) < 0.03, q0 = a1 ? t.p1 : t.p2, q1 = a1 ? t.p2 : t.p1; dir = [q1.x - q0.x, q1.y - q0.y, q1.z - q0.z]; }
          marcar(p, p.trecho, dir, t && G ? G.cotasTubo(t.material, t.dn).de / 2000 : 0.01);
        });
        (R.conectoresMarcar || R.conectoresLivres).forEach(function (k) { marcar(k, k.famInst, [0, 1, 0], (k.dn || 20) / 2000); });   /* QUALIDADE VISUAL 2: só sistema já traçado */
      }
      return out;
    };

    /* ------------------------------------------------ VERIFICAR, DESCONEXÕES, LEGENDA, TABELA */
    U.verificarSistemas = function () {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!est || !BI()) return null;
      U._verif = BI().verificar(est.estado, b.familiaAvaliar);
      U._crit = U.criterios(est.estado, b.familiaAvaliar);
      U._achados = U.achadosCorr(est);   /* N23: cada achado com o seu Corrigir (js/hidcriterios.js HidCorrigir) */
      U.abrirPainel();
      var r = U._verif, cr = U._crit;
      status((r.total ? "Verificar sistemas: " + r.total + " item(ns) — " + r.erros + " erro(s). A lista está no painel Instalações." : "Verificar sistemas: nada a corrigir (" + r.sistemas.length + " sistema(s)).") +
        (cr && cr.trechos ? " Qualidade do traçado: " + cr.nota + "/100 (" + cr.conceito + ")" + (cr.apontamentos.length ? ", " + cr.apontamentos.length + " apontamento(s) de projetista." : ".") : ""));
      return r;
    };
    /* CRITÉRIO DE PROJETISTA (18/10/2026, js/hidcriterios.js): o auditor de TODO o traçado — automático ou à mão — roda no
       Verificar sistemas e depois do Traçar automaticamente; cada apontamento tem o porquê (regra e fonte), Mostrar no 3D e Corrigir */
    U.criterios = function (estado, avaliarFam, extra) {
      var HCr = global.HidCriterios; if (!HCr || !estado) return null;
      try { return HCr.auditar(HCr.doEstado(estado, avaliarFam, extra)); } catch (e) { return null; }
    };
    U.critMostrar = function (i) {
      var a = U._crit && U._crit.apontamentos[i], b = B(); if (!a || !b) return false;
      var uids = a.ids.concat(a.obstaculo ? [a.obstaculo] : []).map(function (id) { return "edit:" + id; });
      try { if (global.Gestao && global.Gestao._bimVxAtivar) global.Gestao._bimVxAtivar("3d"); } catch (e0) {}
      try { if (b.selecionar) b.selecionar(uids); } catch (e1) {}
      try { if (b.enquadrarUids) b.enquadrarUids(uids); } catch (e2) {}
      status(a.titulo + ": " + a.texto);
      return true;
    };
    /* ⚠ N23 (25/10/2026) — CORRIGIR O TRAÇADO FEITO À MÃO: os achados do Verificar e do critério de projetista com a correção que
       mantém a intenção (js/hidcriterios.js HidCorrigir); a correção abre a prévia (js/hidkitui.js corrigirAchado: Enter aplica num
       lote, um Ctrl+Z desfaz) e "Corrigir tudo neste ambiente" junta as do cômodo */
    U.achadosCorr = function (est) {
      var HC = global.HidCorrigir, b = B(); if (!HC || !est || !b) return null;
      try { return HC.achados({ estado: est.estado, avaliarFam: b.familiaAvaliar, ops: b.editarOps ? b.editarOps() : [] }); } catch (e) { return null; }
    };
    function arrN(a) { return Array.isArray(a) ? a : []; }   /* N23: este escopo não tem o arr() */
    U._achadoDe = function (origem, k) { var pre = origem + k + ":"; return arrN(U._achados).filter(function (a) { return String(a.chave).indexOf(pre) === 0; })[0] || null; };
    U._botaoCorrigir = function (origem, k) {
      var a = U._achadoDe(origem, k); if (!a || !a.correcao || a.correcao.tipo === "rt") return "";
      return ' <button class="btn sm" data-inst="ach-corrigir" data-k="' + esc(a.chave) + '" title="' + esc(a.correcao.texto || "") + '">Corrigir</button>';
    };
    U._htmlAmbientesCorrigir = function () {
      var HC = global.HidCorrigir, b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!HC || !est || !arrN(U._achados).length) return "";
      var ctx = { estado: est.estado, avaliarFam: b.familiaAvaliar }, h = "";
      arrN(est.estado.ambientes).forEach(function (am) {
        var n = arrN(U._achados).filter(function (a) { return a.correcao && /^(inclinacao|ponta|bitola|luva|passante)$/.test(a.correcao.tipo) && HC._int.noAmbiente(ctx, a, am); }).length;
        if (n) h += ' <button class="btn sm" data-inst="amb-corrigir" data-id="' + esc(am.id) + '" title="Corrige, um por um, o que se corrige sozinho neste cômodo (prévia antes; um Ctrl+Z desfaz)">Corrigir tudo neste ambiente: ' + esc(am.nome || am.id) + " (" + n + ")</button>";
      });
      return h ? '<div data-inst="amb-corrigir-lista" style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">' + h + "</div>" : "";
    };
    U.corrigirAchado = function (chave) {
      var K = global.HidKitUI, a = arrN(U._achados).filter(function (x) { return x.chave === chave; })[0];
      if (!a || !K || !K.corrigirAchado) { status("Corrigir: rode o Verificar sistemas de novo (o modelo mudou)."); return null; }
      return K.corrigirAchado(a);
    };
    U.critCorrigir = function (i) {
      var a = U._crit && U._crit.apontamentos[i], K = global.HidKitUI, c = a && a.corrigir; if (!a || !c) return false;
      if (c.tipo === "rt") { status("Decisão do RT/estrutural: " + c.texto + " — " + a.texto); return false; }
      /* N23: com o motor de correção, a mesma prévia do Corrigir (a luva, o passante, as ops do achado; refazer pelo Traçar) */
      /* casa pela REGRA e pelos ids (a posição na lista muda quando o modelo muda) */
      var idsA = arrN(a.ids).map(String).join(","), aC = arrN(U._achados).filter(function (x) { return x.origem === "criterio" && x.regra === a.regra && x.ids.join(",") === idsA; })[0] || null;
      if (aC && aC.correcao && K && K.corrigirAchado) { K.corrigirAchado(aC); return true; }
      if (c.tipo === "juntar" && c.ids.length === 2) return U.critJuntar(c.ids[0], c.ids[1]);
      /* FRENTE H6: o Corrigir do aparelho a gás (NBR 13103) — as ops do achado num lote (Ctrl+Z desfaz) e a lista refeita */
      if (c.tipo === "ops" && Array.isArray(c.ops) && c.ops.length) {
        var bO = B(), okO = false; try { okO = !!(bO && bO.editarLote && bO.editarLote({ op: "lote", id: "hidgas-" + String(new Date().getTime()), origem: "hidcrit", ops: JSON.parse(JSON.stringify(c.ops)) })); } catch (eO) { okO = false; }
        status(okO ? "Corrigido: " + c.texto + " (Ctrl+Z desfaz)." : "O editor recusou a correção (" + c.texto + ").");
        if (okO) { try { var c4 = bO.editarEstado ? bO.editarEstado() : null; if (c4) U._crit = U.criterios(c4.estado, bO.familiaAvaliar); } catch (eC) {} reconstruir(); }
        return okO;
      }
      /* refazer: o traçado do(s) aparelho(s) servido(s) por aquele trecho, pelo motor que já obedece às regras (prévia + Aplicar) */
      if (K && K.tracarAuto && arrN(c.aparelhos).length) { K.tracarAuto({ uids: c.aparelhos.map(function (id) { return "edit:" + id; }), todos: true }); return true; }
      status("Corrigir: " + a.titulo + " — o trecho não está ligado a um aparelho; ajuste à mão (" + c.texto + ").");
      return false;
    };
    /* luva desnecessária: os dois trechos viram um (mesmo id do primeiro), num lote só (Ctrl+Z desfaz) */
    U.critJuntar = function (ida, idb) {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; if (!est) return false;
      var T = arrN(est.estado.instalacoes && est.estado.instalacoes.trechos), ta = T.filter(function (t) { return t.id === ida; })[0], tb = T.filter(function (t) { return t.id === idb; })[0];
      if (!ta || !tb) return false;
      function dd(p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); }
      var ends = [[ta.p1, tb.p2], [tb.p1, ta.p2]].sort(function (u, v) { return dd(v[0], v[1]) - dd(u[0], u[1]); })[0];
      var op = { op: "trecho", id: ida, sistema: ta.sistema, material: ta.material, dn: ta.dn, p1: ends[0], p2: ends[1] };
      var ok = false; try { ok = b.editarLote({ op: "lote", id: "hidcrit-" + String(new Date().getTime()), origem: "hidcrit", ops: [{ op: "apagar", id: ida }, { op: "apagar", id: idb }, op] }); } catch (e) { ok = false; }
      status(ok ? "Trechos " + ida + " e " + idb + " juntados (Ctrl+Z desfaz)." : "O editor recusou juntar " + ida + " e " + idb + ".");
      if (ok) U.verificarSistemas();
      return ok;
    };
    U.alternarDesconexoes = function (on) { U._desc = !!on; reconstruir(); var R = U._ultimaRede; if (on && R) status((R.pontasLivres.length + (R.conectoresMarcar || R.conectoresLivres).length) + " desconexão(ões) marcada(s) em vermelho."); };
    /* ------------------------------------------------ VISTA INSTALAÇÕES (QUALIDADE VISUAL 2)
     * A arquitetura em cinza translúcido (js/bim.js, BIM.vistaInstalacoes) para ver a água dentro da parede e o esgoto
     * sob o piso. AUTOMÁTICA: liga ao entrar na aba Instalações e desliga ao sair — até a pessoa usar o botão
     * "Instalações" da barra da vista; daí vale a escolha dela (manual) nesta sessão. */
    U.vistaInst = { manual: null };
    U.aoTrocarAba = function (aba) {
      var b = B(); if (!U.ativo() || !U._barraHidro() || !b || !b.vistaInstalacoes || U.vistaInst.manual != null) return false;   /* P8: a vista Instalações automática só com a prévia hidro */
      b.vistaInstalacoes(aba === "instalacoes"); U._pintarBotaoVista(); U._corDaVista(aba === "instalacoes"); return true;
    };
    /* PADRÃO DE APRESENTAÇÃO DE INSTALAÇÕES (js/biminstpadrao.js): a vista Instalações nasce com a cor por SISTEMA do
       padrão (água fria, esgoto, ventilação… cada um com a sua) — é o que o projetista lê na hora; fora dela fica a cor do
       MATERIAL (como a peça é na obra). O botão "Cores" troca a qualquer momento e, usado, a escolha da pessoa vale na sessão. */
    U._corDaVista = function (on) {
      var P = global.BimInstPadrao, m = P && P.modoCorPadrao ? P.modoCorPadrao() : null;
      if (!m || U._modoCorManual) return false;
      var alvo = on ? m : "material";
      if (U.modoCor !== alvo) U.alternarModoCor(alvo);
      return true;
    };
    /* FILTROS DE AVISO do padrão (tubo sem inclinação, ponta solta, ponto sem tubo…): pinta na cor do filtro o que o
       Verificar sistemas acusou; desliga e volta ao normal */
    U.filtrosAviso = function (on) {
      var b = B(), P = global.BimInstPadrao, est = b && b.editarEstado ? b.editarEstado() : null;
      if (!on || !P || !est || !BI()) { U._avisos = null; U._corVerif = null; reconstruir(); return null; }
      var v = BI().verificar(est.estado, b.familiaAvaliar), m = P.mapaAvisos(v.itens, BI().rede(est.estado, b.familiaAvaliar).trechos);
      U._avisos = m; U._corVerif = m.mapa; reconstruir();
      var n = Object.keys(m.mapa).length;
      status(n ? "Filtros de aviso: " + n + " peça(s) pintada(s) — " + Object.keys(m.porFiltro).map(function (k) { return P.filtro(k).nome + " " + m.porFiltro[k]; }).join("; ") + "." : "Filtros de aviso: nada a apontar.");
      return m;
    };
    U.alternarVistaInst = function (on) {
      var b = B(); if (!b || !b.vistaInstalacoes) return false;
      var v = on == null ? !b.vistaInstalacoes() : !!on;
      b.vistaInstalacoes(v); U.vistaInst.manual = v; U._pintarBotaoVista(); U._corDaVista(v);
      status(v ? "Vista Instalações: arquitetura em cinza translúcido — tubos dentro da parede e sob o piso à vista." : "Vista Instalações desligada: arquitetura opaca.");
      return v;
    };
    U._pintarBotaoVista = function () {
      try { var b = B(), on = !!(b && b.vistaInstalacoes && b.vistaInstalacoes()); document.querySelectorAll('[data-rv-vb="vista-inst"]').forEach(function (e) { e.setAttribute("aria-pressed", on ? "true" : "false"); }); } catch (e) {}
    };
    /* o botão da barra de baixo da vista (js/bimshell.js), ao lado do "Cores" */
    /* JUNÇÃO 18/10/2026: os botões da barra de baixo que só servem às instalações do hidro (Vista Instalações, Nível de
       detalhe) aparecem SÓ com a prévia ?previa=hidro — sem ela a barra fica como no master (e2e-cara-nova, J4) */
    U._barraHidro = function () { try { return !!(global.BimPrevia && BimPrevia.hidro && BimPrevia.hidro()); } catch (e) { return false; } };
    U.botaoBarra = function (el, ico) {
      if (!U.ativo() || !U._barraHidro()) return null;
      var bt = el("button", "rv-vb"), b = B();
      bt.type = "button"; bt.setAttribute("data-rv-vb", "vista-inst");
      bt.setAttribute("aria-pressed", b && b.vistaInstalacoes && b.vistaInstalacoes() ? "true" : "false");
      bt.setAttribute("aria-label", "Vista Instalações"); bt.title = "Vista Instalações: paredes, pisos e lajes em cinza translúcido para ver os tubos dentro deles";
      bt.innerHTML = ico("camadas", 14);   /* só o ícone: a barra é estreita (o nome está no title) */
      bt.onclick = function () { U.alternarVistaInst(); };
      return bt;
    };
    U.legendaPlanta = function (on) {
      U._legenda = !!on;
      try { var D = global.Bim2D; if (D && D.plantasAbertas) D.plantasAbertas().forEach(function (id) { D.atualizar(id); }); } catch (e) {}
      if (on) status("Legenda de tubulação ligada nas plantas baixas (por sistema e DN).");
    };
    U.tabela = function () { var b = B(), est = b && b.editarEstado ? b.editarEstado() : null; return est && BI() ? BI().tabelaPecas(est.estado, b.familiaAvaliar) : null; };
    U.baixarXlsx = function () {
      var T = U.tabela(); if (!T || !T.linhas.length) { toast("Nada modelado nas instalações.", "aviso"); return false; }
      var X = global.ExcelOrc; if (!X || !X.ensureExcelJS) { toast("O gerador de planilha não carregou.", "erro"); return false; }
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
        /* a placa orçada por parcelas (mista / intermediário de vários módulos): todos os códigos, com a quantidade de cada um */
        q.dispositivos.forEach(function (g) { var cps = Array.isArray(g.composicoes) && g.composicoes.length ? g.composicoes : null; h += "<tr><td>" + esc(g.rotulo) + "</td><td>" + g.n + "</td><td>" + (cps ? cps.map(function (cp) { return spH(cp) + " × " + (g.n * (cp.qtd != null ? cp.qtd : 1)); }).join(" + ") : spH(g.sinapi)) + "</td></tr>"; });
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
          '<ul style="margin:4px 0;padding-left:18px">' + r.itens.slice(0, 60).map(function (i, k) {
            return '<li data-inst-verif="' + esc(i.tipo) + '" style="color:' + (i.gravidade === "erro" ? "var(--vermelho,#b91c1c)" : "var(--amarelo,#b45309)") + '"><b>' + esc(i.rotuloTipo) + ":</b> " + esc(i.texto) +
              (i.ids.length ? ' <button class="btn sm" data-inst="p12-ir" data-id="' + esc(i.ids[0]) + '" title="Mostrar no 3D">ver</button>' : "") + U._botaoCorrigir("v", k) + "</li>";
          }).join("") + "</ul>" + U._htmlAmbientesCorrigir() + "</div>";
      }
      if (U._crit && U._crit.trechos) {
        var Q = U._crit, corG = { dura: "var(--vermelho,#b91c1c)", alerta: "var(--amarelo,#b45309)", sugestao: "var(--texto2,#475569)" }, rotG = { dura: "PROIBIDO", alerta: "Alerta", sugestao: "Sugestão" };
        h += '<div data-inst="criterios" style="font-size:12px;margin:4px 0 10px"><b>Critério de projetista</b> — <span data-inst-nota="' + Q.nota + '">qualidade do traçado <b>' + Q.nota + '/100</b> (' + esc(Q.conceito) + ")</span>" +
          (Q.apontamentos.length ? "" : " · nada que um projetista estranharia") + '<ul style="margin:4px 0;padding-left:18px">' + Q.apontamentos.slice(0, 60).map(function (a, i) {
            return '<li data-inst-crit="' + esc(a.regra) + '" style="color:' + corG[a.gravidade] + ';margin-bottom:3px"><b>' + rotG[a.gravidade] + " · " + esc(a.titulo) + ":</b> " + esc(a.texto) +
              ' <button class="btn sm" data-inst="crit-ver" data-n="' + i + '" title="Mostrar no 3D">Mostrar no 3D</button>' +
              (a.corrigir ? ' <button class="btn sm" data-inst="crit-corrigir" data-n="' + i + '" title="' + esc(a.corrigir.texto || "") + '">' + (a.corrigir.tipo === "rt" ? "Decisão do RT" : "Corrigir") + "</button>" : "") +
              '<details style="color:var(--texto2,#475569)"><summary>Por quê</summary>' + esc(a.porque) + ' <i>Fonte: ' + esc(a.fonte) + "</i></details></li>";
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
        (global.EletIlumUI ? '<button class="btn sm" data-inst="p12-ilum" title="Ponto de luz, interruptores, eletroduto e fiação da iluminação do ambiente">Ligação da iluminação</button>' : "") +
        '<button class="btn sm" data-inst="p12-legenda">' + (U._legenda ? "Tirar a legenda da planta" : "Legenda na planta") + '</button><button class="btn sm" data-inst="p12-tabela">' + (U._tabela ? "Fechar a tabela" : "Tabela de peças") + "</button>" +
        (U._tabela ? '<button class="btn sm primary" data-inst="p12-xlsx">Baixar .xlsx</button>' : "") +
        /* QUALIDADE VISUAL 1: a peça aparece com a cor do MATERIAL (PVC marrom, branco, cinza, cobre…); a cor do
           SISTEMA virou modo de vista (filtro), não a única aparência */
        /* P8: "Cores" e "Filtros de aviso" são do desenho novo das instalações — só com a prévia hidro */
        (U._barraHidro() ? '<button class="btn sm" data-inst="p12-cores" title="Alterna entre a cor real do material e a cor convencional de cada sistema">' + (U.modoCor === "sistema" ? "Cores: por sistema" : "Cores: do material") + "</button>" : "") +
        (U._barraHidro() && global.BimInstPadrao && global.BimInstPadrao.pronto() ? '<button class="btn sm" data-inst="p12-avisos" title="Pinta na cor do filtro de aviso o tubo sem inclinação, a ponta solta e o ponto sem tubo">' + (U._avisos ? "Tirar filtros de aviso" : "Filtros de aviso") + "</button>" : "") + "</div>";
      return h;
    };
    U.cliquePainelP12 = function (a, bt) {
      if (a === "p12-verificar") { U.verificarSistemas(); return true; }
      if (a === "p12-ilum") { if (global.EletIlumUI) global.EletIlumUI.abrir(); return true; }
      if (a === "crit-ver") { U.critMostrar(Number(bt.getAttribute("data-n"))); return true; }
      if (a === "crit-corrigir") { U.critCorrigir(Number(bt.getAttribute("data-n"))); return true; }
      if (a === "ach-corrigir") { U.corrigirAchado(bt.getAttribute("data-k")); return true; }
      if (a === "amb-corrigir") { var Kc = global.HidKitUI; if (Kc && Kc.corrigirAmbiente) Kc.corrigirAmbiente(bt.getAttribute("data-id")); return true; }
      if (a === "p12-desc") { U.alternarDesconexoes(!U._desc); U.renderPainel(); return true; }
      if (a === "p12-cores") { U._modoCorManual = true; U.alternarModoCor(U.modoCor === "sistema" ? "material" : "sistema"); U.renderPainel(); return true; }
      if (a === "p12-avisos") { U.filtrosAviso(!U._avisos); U.renderPainel(); return true; }
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

  /* =====================================================================
   * NÍVEL DE DETALHE (17/10/2026) — Baixo / Médio / Alto, PROPRIEDADE DA VISTA.
   * Pedido do Rogério: o controle da barra da vista de um software BIM de mercado, com o menu Baixo / Médio / Alto
   * ("as pranchas ficam bem bonitinhas na planta baixa e ela fica fácil de modelar"). O motor é o
   * js/biminstnivel.js (puro); aqui: o botão da barra de baixo (ao lado do estilo visual), o menu, o estado de
   * cada vista e a troca que REFAZ SÓ AS MALHAS DAS INSTALAÇÕES (BIM.instNivelRefazer), sem recarregar a cena.
   *   · vista 3D: o nível de cada vista 3D (id da aba, ou o ponto de vista dela) vai em Bim2D.estado().nivel3d —
   *     o mesmo estado que viaja com a obra (.opbim). Padrão: Alto.
   *   · vista 2D (planta, corte): o nível é o campo nivelDetalhe da vista do js/bimmodelovista.js (também no
   *     modelo de vista); o menu da barra muda o da vista ativa por lá. Padrão: Médio.
   * ⚠ A cena 3D é UMA (as abas 3D desenham a mesma cena): ao ativar uma aba 3D, a cena passa ao nível dela; duas
   *   vistas 3D lado a lado mostram o nível da última ativada.
   * ===================================================================== */
  function NIVEL(U) {
    function NV() { return global.BimInstNivel || null; }
    function G() { return global.Gestao || null; }
    U._nivelFeito = null;   /* o nível com que as malhas da cena foram construídas (malhas()) */
    U._ult3d = "3d";
    /* a vista ativa: { id, tipo: "3d" | "2d" | "folha" } */
    U._vistaAtiva = function () {
      var g = G(), id = "3d", v = null;
      try { var st = g && g._bimVxEst ? g._bimVxEst() : null; id = (st && st.ativa) || "3d"; v = g && g._bimVxAchar ? g._bimVxAchar(id) : null; } catch (e) { id = "3d"; }
      return { id: id, tipo: v && (v.tipo === "2d" || v.tipo === "folha") ? v.tipo : "3d", pv: v && v.pvId ? v.pvId : null };
    };
    function chave3d(id) {
      var g = G(), v = null; try { v = g && g._bimVxAchar ? g._bimVxAchar(id) : null; } catch (e) { v = null; }
      return v && v.pvId ? "pv:" + v.pvId : String(id || "3d");
    }
    function mapa3d(criar) {
      var D = global.Bim2D; if (!D || !D.estado) return U._nivelMem || (U._nivelMem = {});
      var e = D.estado(); if (!e.nivel3d || typeof e.nivel3d !== "object" || Array.isArray(e.nivel3d)) { if (!criar) return {}; e.nivel3d = {}; }
      return e.nivel3d;
    }
    U.nivelDaVista3d = function (id) { var N = NV(), v = mapa3d(false)[chave3d(id)]; return N ? N.norm(v, N.padraoVista("3d")) : "alto"; };
    /* o nível da CENA: o da vista 3D ativa (com uma planta na frente, o da última 3D) */
    U.nivelCena = function () {
      var a = U._vistaAtiva(); if (a.tipo === "3d") U._ult3d = a.id;
      return U.nivelDaVista3d(U._ult3d);
    };
    /* o nível da vista 2D (P6) — null quando a vista não é da P6 */
    U.nivelDaVista2d = function (id) {
      var M = global.BimModeloVista; if (!M || !M.ativo || !M.ativo()) return null;
      try { var v = M.estado().vistas[id]; return v ? M.efetivo(v, M.estado()).nivelDetalhe : M.vistaPadrao(/^d2c-/.test(String(id)) ? "corte" : "planta").nivelDetalhe; } catch (e) { return null; }
    };
    U.nivelAtivo = function () { var a = U._vistaAtiva(); if (a.tipo === "2d") { var n2 = U.nivelDaVista2d(a.id); if (n2) return n2; } return U.nivelCena(); };
    /* troca o nível da vista 3D `id` e refaz só as instalações da cena (se a vista é a da cena) */
    U.definirNivel3d = function (id, nivel) {
      var N = NV(); if (!N || !N.NIVEIS[nivel]) return false;
      mapa3d(true)[chave3d(id)] = nivel;
      try { if (global.Bim2D && global.Bim2D._gravar) global.Bim2D._gravar(); } catch (e) {}
      U.aplicarNivelCena();
      U._pintarBotaoNivel();
      status("Nível de detalhe da vista: " + N.NIVEIS[nivel] + " — " + N.DICAS[nivel] + ".");
      return true;
    };
    /* a cena acompanha o nível da vista 3D (ao trocar o nível ou ativar outra aba 3D) */
    U.aplicarNivelCena = function () {
      if (!U._barraHidro()) return false;   /* P8: sem a prévia hidro não há nível de detalhe (o desenho é o do master) */
      var alvo = U.nivelCena(), b = B();
      if (U._nivelFeito === alvo || !b) return false;
      var r = null;
      try { r = b.instNivelRefazer ? b.instNivelRefazer() : null; } catch (e) { r = null; }
      if (!r || !r.ok) { try { if (b.editarReconstruir) b.editarReconstruir(); } catch (e2) {} }
      try { global.dispatchEvent(new CustomEvent("bim:nivel-detalhe", { detail: { nivel: alvo } })); } catch (e3) {}
      return true;
    };
    U.aoAtivarVista = function () { U.aplicarNivelCena(); U._pintarBotaoNivel(); };
    /* o menu e as Propriedades mudam O DA VISTA ATIVA: 2D pela P6, 3D aqui */
    U.definirNivelAtivo = function (nivel) {
      var a = U._vistaAtiva(), N = NV(); if (!N || !N.NIVEIS[nivel]) return false;
      if (a.tipo === "2d" && U.nivelDaVista2d(a.id)) {
        try { if (global.Bim2D && global.Bim2D._mudar) global.Bim2D._mudar(a.id, "p6:nd", nivel); } catch (e) {}
        U._pintarBotaoNivel();
        status("Nível de detalhe da vista: " + N.NIVEIS[nivel] + " — " + N.DICAS[nivel] + ".");
        try { if (global.BimShell && global.BimShell.repintarVista) global.BimShell.repintarVista(); } catch (e2) {}
        return true;
      }
      return U.definirNivel3d(a.id, nivel);
    };
    /* ícone do nível (o quadrado vazio, meio preenchido e cheio do menu) */
    /* o ícone do nível (pedido do Rogério, 17/10/2026: "igual ao do software de referência"): o quadradinho de fundo
       claro e borda escura cuja HACHURA adensa com o nível — vazio (Baixo), xadrez largo (Médio), xadrez miúdo (Alto) */
    U.iconeNivel = function (nivel, tam) {
      tam = tam || 14;
      var h = '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 14 14" aria-hidden="true" focusable="false" data-ico-nivel="' + nivel + '">' +
              '<rect x="1.5" y="1.5" width="11" height="11" fill="#fdfdfd" stroke="#3a3d42" stroke-width="1"/>', q = "", i, j;
      if (nivel === "medio") { for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) if ((i + j) % 2 === 0) q += '<rect x="' + (2 + i * 3.333).toFixed(2) + '" y="' + (2 + j * 3.333).toFixed(2) + '" width="3.33" height="3.33" fill="#6b7076"/>'; }
      if (nivel === "alto") { for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) if ((i + j) % 2 === 0) q += '<rect x="' + (2 + i * 2) + '" y="' + (2 + j * 2) + '" width="2" height="2" fill="#3a3d42"/>'; }
      return h + q + "</svg>";
    };
    /* o MENU compacto da referência: caixa de fundo claro com borda, três linhas (ícone + nome), o atual marcado */
    U._cssMenuNivel = function () {
      if (document.getElementById("rv-css-nivel")) return;
      var st = document.createElement("style"); st.id = "rv-css-nivel";
      st.textContent = ".rv-menu-nivel{position:fixed;z-index:10050;background:#f5f6f7;border:1px solid #8f959c;box-shadow:2px 2px 4px rgba(0,0,0,.22);padding:2px;min-width:92px;font:12px/1.25 'Segoe UI',Arial,sans-serif;color:#1b1d20}" +
        ".rv-menu-nivel button{display:flex;align-items:center;gap:7px;width:100%;height:22px;border:1px solid transparent;background:none;padding:0 12px 0 5px;cursor:pointer;color:inherit;font:inherit;text-align:left;border-radius:0}" +
        ".rv-menu-nivel button:hover,.rv-menu-nivel button:focus-visible{background:#dbe9f7;border-color:#9cc3ea;outline:none}" +
        ".rv-menu-nivel button[aria-checked=true]{background:#cfe3f6;border-color:#7fb0e2}" +
        ".rv-menu-nivel .rv-mn-ico{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center}";
      document.head.appendChild(st);
    };
    U._pintarBotaoNivel = function () {
      try {
        var N = NV(); if (!N) return;
        var n = U.nivelAtivo();
        document.querySelectorAll('[data-rv-vb="nivel-detalhe"]').forEach(function (e) {
          e.innerHTML = U.iconeNivel(n, 14); e.setAttribute("data-nivel", n);
          e.title = "Nível de detalhe: " + N.NIVEIS[n] + " (" + N.DICAS[n].toLowerCase() + ")"; e.setAttribute("aria-label", "Nível de detalhe: " + N.NIVEIS[n]);
        });
      } catch (e) {}
    };
    /* o botão da barra de baixo (js/bimshell.js), logo depois do estilo visual */
    U.botaoNivel = function (el) {
      if (!U.ativo() || !NV() || !U._barraHidro()) return null;
      var bt = el("button", "rv-vb");
      bt.type = "button"; bt.setAttribute("data-rv-vb", "nivel-detalhe"); bt.setAttribute("aria-haspopup", "menu");
      bt.onclick = function () { U.menuNivel(bt); };
      setTimeout(function () { U._pintarBotaoNivel(); }, 0);
      bt.innerHTML = U.iconeNivel("alto", 14);
      return bt;
    };
    U._fecharMenuNivel = function () {
      if (U._menuNivel && U._menuNivel.parentNode) U._menuNivel.parentNode.removeChild(U._menuNivel);
      U._menuNivel = null;
      if (U._menuFora) { document.removeEventListener("pointerdown", U._menuFora, true); U._menuFora = null; }
    };
    U.menuNivel = function (ancora) {
      var N = NV(); if (!N) return false;
      if (U._menuNivel) { U._fecharMenuNivel(); return false; }
      U._cssMenuNivel();
      var atual = U.nivelAtivo(), m = document.createElement("div");
      m.className = "rv-menu-nivel"; m.setAttribute("role", "menu"); m.setAttribute("aria-label", "Nível de detalhe");
      var h = "";
      N.ORDEM.forEach(function (k) {
        h += '<button type="button" role="menuitemradio" aria-checked="' + (k === atual ? "true" : "false") + '" data-nivel="' + k + '" title="' + esc(N.DICAS[k]) + '">' +
             '<span class="rv-mn-ico">' + U.iconeNivel(k, 14) + '</span><span class="rv-mn-tx">' + esc(N.NIVEIS[k]) + "</span></button>";
      });
      m.innerHTML = h;
      document.body.appendChild(m);
      var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 80, bottom: 80, top: 80 };
      var mr = m.getBoundingClientRect(), W = global.innerWidth || 1200, H = global.innerHeight || 800;
      var top = r.top - mr.height - 4; if (top < 6) top = Math.min(H - mr.height - 6, r.bottom + 4);   /* a barra é embaixo: o menu abre para CIMA, como no print */
      m.style.position = "fixed"; m.style.left = Math.max(6, Math.min(r.left, W - mr.width - 6)) + "px"; m.style.top = top + "px";
      Array.prototype.forEach.call(m.querySelectorAll("button[data-nivel]"), function (b) {
        b.onclick = function () { var k = b.getAttribute("data-nivel"); U._fecharMenuNivel(); U.definirNivelAtivo(k); try { if (ancora) ancora.focus(); } catch (e) {} };
      });
      m.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") { ev.preventDefault(); U._fecharMenuNivel(); try { if (ancora) ancora.focus(); } catch (e) {} return; }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          var bs = Array.prototype.slice.call(m.querySelectorAll("button")), i = bs.indexOf(document.activeElement);
          i = ev.key === "ArrowDown" ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length; try { bs[i].focus(); } catch (e) {}
        }
      });
      U._menuNivel = m;
      U._menuFora = function (ev) { if (U._menuNivel && !U._menuNivel.contains(ev.target) && ev.target !== ancora && !(ancora && ancora.contains(ev.target))) U._fecharMenuNivel(); };
      document.addEventListener("pointerdown", U._menuFora, true);
      var foco = m.querySelector('button[aria-checked="true"]') || m.querySelector("button");
      try { if (foco) foco.focus(); } catch (e) {}
      return true;
    };
    /* ATALHO (opcional): Alt+1 / Alt+2 / Alt+3 = Baixo / Médio / Alto na vista ativa — fora de campo de texto */
    U._atalhoNivel = function (ev) {
      if (!ev || !ev.altKey || ev.ctrlKey || ev.metaKey || !U.ativo() || !NV()) return;
      var k = ({ "1": "baixo", "2": "medio", "3": "alto" })[ev.key]; if (!k) return;
      var t = ev.target, tag = t && t.tagName ? t.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
      if (!document.querySelector('[data-rv-vb="nivel-detalhe"]')) return;   /* só com o BIM aberto */
      ev.preventDefault(); U.definirNivelAtivo(k);
    };
    try { if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("keydown", U._atalhoNivel); } catch (e) {}
    /* a linha "Nível de detalhe" de Propriedades › Gráficos da vista 3D (js/gestao.js _bimPropsVista) */
    U.paramNivel3d = function (id) {
      var N = NV(); if (!N || !U.ativo()) return null;
      return { id: "nd3d", rotulo: "Nível de detalhe", tipo: "lista", valor: U.nivelDaVista3d(id), opcoes: N.ORDEM.map(function (k) { return { id: k, rotulo: N.NIVEIS[k] }; }) };
    };
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
                larg: M.larg || 0.40, alt: M.alt || 0.25, aplicacao: "", cota: COTA_PADRAO[sis], inclinacao: this.inclinacaoDn(sis, M.dn),
                peca: (par && par.peca) || (sis === "eletrica" ? "caixa_4x2" : "ralo_sifonado"), pecaDn: "", pecaMat: "pvc", alturaPiso: 0.30, dh: 2.50, cotaAuto: !!S.gravidade && this._previaHidro() };   /* P8: altura automática só com a prévia hidro */
      return c;
    },
    armar: function (ferr, par) {
      var I = BI(), b = B(); if (!I || !b || !b.editarArmar) { toast("O visualizador 3D ainda não abriu.", "aviso"); return false; }
      var ant = this.cfg;
      this.cfg = this._cfgPadrao(ferr === "acessorio" ? "tubo" : ferr, par);
      if (ferr === "acessorio") { this.cfg.ferramenta = "acessorio"; this.cfg.famId = (par && par.famId) || "ra-registro-gaveta"; this.cfg.tipoId = (par && par.tipoId) || ""; }   /* P12 */
      /* trocar de ferramenta guarda o sistema/DN de antes quando cabe */
      if (ant && ferr === "tubo" && ant.ferramenta === "tubo") { ["sistema", "material", "dn", "pn", "classe", "iso", "cota", "cotaAuto", "inclinacao", "aplicacao", "angulo"].forEach(function (k) { this.cfg[k] = ant[k]; }, this); }
      /* pedido explícito de sistema (armar("tubo", { sistema })) vence o de antes */
      if (par && par.sistema && ferr === "tubo" && this.cfg.sistema !== par.sistema) this.mudarCfg("i:sistema", par.sistema);
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
      else if (!this._previaHidro()) t = S.nome + " " + (I.MATERIAIS[c.material] && I.MATERIAIS[c.material].secao === "retangular" ? Math.round(c.larg * 100) + "×" + Math.round(c.alt * 100) + " cm" : "DN " + c.dn) +   /* P8: a dica do master */
        ": clique o INÍCIO e os pontos seguintes (cota inicial " + fmt(c.cota, 2) + " m" + (S.gravidade ? ", descendo " + fmt(c.inclinacao, 2) + "%" : "") + "). Clique num ponto de aparelho, na ponta ou no meio de outro tubo para ligar. Esc encerra.";
      else t = S.nome + " " + (I.MATERIAIS[c.material] && I.MATERIAIS[c.material].secao === "retangular" ? Math.round(c.larg * 100) + "×" + Math.round(c.alt * 100) + " cm" : "DN " + c.dn) +
        ": clique o INÍCIO e os pontos seguintes (altura de trabalho " + fmt(this.alturaTrabalho(false), 2) + " m do nível" + (c.cotaAuto && S.gravidade ? " — automática, logo abaixo do piso" : "") + (S.gravidade ? ", inclinação " + fmt(c.inclinacao, 2) + "%" : "") + "; o traço anda a 90° e 45°" + (c.angulo === "livre" ? " — ÂNGULO LIVRE ligado" : "") + "). Clique num ponto de aparelho, num tubo vertical, na ponta ou no meio de outro tubo para ligar. Esc encerra.";
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
      return base + this.alturaTrabalho(false);
    },
    /* QUALIDADE VISUAL 2 (rodada 2): a ALTURA DE TRABALHO do esgoto/pluvial é AUTOMÁTICA até a pessoa digitar uma —
       logo abaixo do piso acabado: −(cobrimento + DE/2), e a queda acumula com a inclinação a cada trecho. Desenhando
       a partir do tubo de queda (o traço SOBE para o aparelho) começa mais fundo, na cota padrão, para sobrar queda.
       Antes era −0,30 m fixo para tudo: o ramal do lavatório passava por baixo da caixa sifonada e subia nela. */
    COBRIMENTO: 0.02,   /* m de argamassa sobre o tubo no enchimento (geometria, o mesmo do traçado automático) */
    alturaTrabalho: function (sobe) {
      var c = this.cfg, I = BI(); if (!c) return 0;
      var S = I && I.SISTEMAS[c.sistema];
      if (!c.cotaAuto || !S || !S.gravidade || c.ferramenta === "peca") return num(c.cota, 0);
      if (sobe) return num(COTA_PADRAO[c.sistema], -0.3);
      return r4(-(this.COBRIMENTO + num(c.dn, 100) / 2000));
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
    agarrar: function (estado, famAval, p, sistema, raio, yTrab) {
      var I = BI(); raio = raio || 0.15;
      if (!p || !estado) return null;
      function dPlan(a) { var dx = a.x - p.x, dz = a.z - p.z; return Math.sqrt(dx * dx + dz * dz); }
      var melhor = null, dm = raio;
      function ver(alvo, d, prio) { if (d <= dm + 1e-9 && (!melhor || prio < melhor.prio || (prio === melhor.prio && d < dm))) { melhor = alvo; melhor.prio = prio; dm = d; } }
      I.conectoresDoEstado(estado, famAval).forEach(function (k) { if (k.sistema === sistema) ver({ tipo: "aparelho", x: k.x, y: k.y, z: k.z, dn: k.dn, nome: k.nome, famInst: k.famInst, parede: k.parede || null }, dPlan(k), 0); });   /* FAMIMPORT: famInst (o DN do conector importado) */
      var inst = estado.instalacoes || { trechos: [], pecas: [] };
      inst.trechos.forEach(function (t) {
        if (t.sistema !== sistema) return;
        /* ⚠ QUALIDADE VISUAL 2: tubo VERTICAL (tubo de queda, coluna) em planta é um ponto — as duas pontas
           caem no mesmo lugar e a de CIMA ganhava: o esgoto nascia a 2,80 m e descia no vaso (print do
           Rogério). Com a cota de trabalho dentro dele, o alvo é o tubo NAQUELA cota (vira tê/junção). */
        var vert = Math.abs(t.p1.x - t.p2.x) < 1e-6 && Math.abs(t.p1.z - t.p2.z) < 1e-6, y0 = Math.min(t.p1.y, t.p2.y), y1 = Math.max(t.p1.y, t.p2.y);
        if (vert && yTrab != null && isFinite(yTrab) && yTrab > y0 + I.TOL && yTrab < y1 - I.TOL) { ver({ tipo: "vertical", x: t.p1.x, y: r4(yTrab), z: t.p1.z, dn: t.dn, trecho: t.id }, dPlan(t.p1), 1); return; }
        [t.p1, t.p2].forEach(function (q) { ver({ tipo: "ponta", x: q.x, y: q.y, z: q.z, dn: t.dn, trecho: t.id }, dPlan(q), 1); });
      });
      inst.pecas.forEach(function (k) { if (k.sistema === sistema) ver({ tipo: "peca", x: k.x, y: k.y, z: k.z, peca: k.peca, id: k.id, hub: k.hub || null }, dPlan(k), 2); });
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
    clique: function (ctx, p, ev) {
      if (!this._previaHidro()) return this._cliqueMaster(ctx, p);   /* P8: sem a prévia hidro, o traço do master */
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
      var S = I.SISTEMAS[c.sistema], livre = this.livre(ev);
      var alvo = ev && ev._corte && ev._alvo !== undefined ? ev._alvo : this.agarrar(est, ctx.famAval, p, c.sistema, null, ed.p1 ? ed.p1.y : base + this.alturaTrabalho(true));
      /* N23 (23/10/2026): SNAP NO PROLONGAMENTO — sem alvo de ligação perto, o cursor na RETA de um tubo deitado (além da ponta dele, a
         até 15 cm de lado) ALINHA o ponto com ele e toma a cota dele como altura de referência (js/biminstconectar.js). Não é ligação:
         o ponto fica livre, só alinhado (no corte o clique já traz a cota: fica como está) */
      var refP = null;
      if (!alvo && !(ev && ev._corte) && !livre && global.BimInstConectar && global.BimInstConectar.snapProlongamento) {
        refP = global.BimInstConectar.snapProlongamento((est.instalacoes || {}).trechos, p, c.sistema);
        if (refP) { p = { x: refP.x, y: p.y, z: refP.z }; this._ultimoSnap = refP; }
      }   /* CORTE: a peça sob o cursor (js/biminstcon.js pickCorte) */
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
        /* desenhando A PARTIR do destino (tubo de queda, coluna, outro tubo): o esgoto SOBE para o aparelho */
        this._sobe = !!(alvo && S.gravidade && (alvo.tipo === "vertical" || alvo.tipo === "meio" || (alvo.tipo === "ponta" && this._pontaDeCima(est, alvo))));
        var yT = r4(base + this.alturaTrabalho(this._sobe));
        var q0 = alvo ? { x: alvo.x, y: alvo.tipo === "vertical" && !(ev && ev._corte) ? yT : alvo.y, z: alvo.z } : { x: r4(p.x), y: yT, z: r4(p.z) };   /* no corte, o tubo vertical na altura do cursor */
        /* começar numa caixa/ralo: a saída na cota de trabalho, se ela está dentro da captura da peça */
        if (alvo && alvo.tipo === "peca" && alvo.hub && yT >= alvo.hub.yBot && yT <= alvo.hub.yTop) q0.y = yT;
        if (!alvo && ev && ev._corte && isFinite(p.y)) q0.y = r6(p.y);   /* no corte, o clique já diz a cota */
        if (refP) q0.y = refP.y;   /* N23: alinhado no prolongamento de um tubo — a cota de referência é a dele */
        /* começar NUM APARELHO longe da cota de trabalho: toco até dentro da parede (ponto de parede) e
           descida/subida embutida até a cota — o traço segue de lá, nunca na altura da louça */
        /* o ponto JÁ tem tubo (o toco que chega nele): o traço novo sai da outra ponta desse toco (vira tê no
           eixo embutido) — refazer o toco empilhava dois tubos no mesmo lugar (nó de 4 trechos) */
        if (alvo && alvo.tipo === "aparelho") {
          var jaT = ((est.instalacoes || {}).trechos || []).filter(function (t) { return t.sistema === c.sistema && [t.p1, t.p2].some(function (q) { return Math.abs(q.x - alvo.x) + Math.abs(q.z - alvo.z) <= I.TOL + 1e-6 && Math.abs(q.y - alvo.y) <= I.TOL + 1e-6; }); })[0];
          if (jaT) {
            var na = Math.abs(jaT.p1.x - alvo.x) + Math.abs(jaT.p1.z - alvo.z) <= I.TOL + 1e-6 && Math.abs(jaT.p1.y - alvo.y) <= I.TOL + 1e-6, outra = na ? jaT.p2 : jaT.p1;
            alvo = { tipo: "ponta", x: outra.x, y: outra.y, z: outra.z, dn: jaT.dn, trecho: jaT.id, nome: alvo.nome };
            q0 = { x: outra.x, y: outra.y, z: outra.z };
          }
        }
        var saida0 = alvo && alvo.tipo === "aparelho" && (alvo.parede || Math.abs(alvo.y - yT) > I.TOL) ? this.pernaAparelho(alvo, yT, true) : null, nIni = 0;
        if (saida0) {
          var oi = [], ant0 = { x: alvo.x, y: alvo.y, z: alvo.z };
          saida0.forEach(function (q) { var o0 = this._opTrecho(ant0, q, ed.ops); if (I.normTrecho(o0)) { oi.push(o0); ed.ops.push(o0); } ant0 = q; }, this);
          if (oi.length) { ed.ops.pop(); ctx.op(oi[oi.length - 1]); q0 = ant0; ctx.marcar(); nIni = oi.length; }
        }
        /* LIGAR A → B: o ponto de partida fica guardado — se o próximo clique for outro ponto de ligação, o traçado
           liga os dois sozinho (js/hidligar.js). Um clique solto no meio do caminho volta ao desenho ponto a ponto. */
        this._inicio = alvo ? { alvo: JSON.parse(JSON.stringify(alvo)), nIni: nIni, y: q0.y } : null;
        /* começar no MEIO de um tubo: ele é dividido no ponto */
        if (alvo && alvo.tipo === "meio" && I.dividirTrecho) { var dv = I.dividirTrecho(est, alvo.trecho, q0); if (dv.length) { ed.ops.push(dv[0]); ctx.op(dv[1]); } }
        ctx.inicio(q0);
        ctx.hint((alvo ? "Ligado em " + this._rotAlvo(alvo) + (saida0 ? " (desceu embutido até a cota de trabalho)" : "") + ". " : "") + "Altura de trabalho " + fmt(q0.y - base, 2) + " m do nível" +
          (S.gravidade ? (this._sobe ? ", subindo " : ", descendo ") + fmt(c.inclinacao, 2) + "%" : "") + ". Clique o próximo ponto: o traço anda a 90° e 45° (Alt, ou Ângulo livre em Propriedades, para outra direção).");
        this.pintarProps();
        return;
      }
      var p1 = { x: ed.p1.x, y: ed.p1.y, z: ed.p1.z };
      if (this._ligacao) { this.confirmarLigacao(); return; }   /* a prévia A → B aberta: o clique confirma */
      /* NO CORTE: o clique traz a COTA — subir/descer na vertical, inclinado a 45° no plano do corte, ou seguir na horizontal */
      var corteP = ev && ev._corte && !alvo ? this.pontoCorte(p1, p, livre) : null;
      if (corteP && corteP.tipo === "horizontal" && ev._mudaPlano) corteP = null;   /* o Tab trocou o plano: o traço vai ao plano novo a 90° (planta) */
      if (alvo && !livre && this._inicio && this.tentarLigacao(ctx, this._inicio, alvo, base)) return;
      this._inicio = null;   /* clique solto (ou A → B sem rota): segue ponto a ponto */
      /* o comprimento sai das coordenadas JÁ arredondadas e a cota guarda 6 casas: com 4, o
         arredondamento da cota tirava a inclinação gravada de 1% exato em trecho curto */
      var plano = corteP && corteP.tipo === "horizontal" ? [{ x: corteP.p.x, z: corteP.p.z }] : this.caminhoPlanta(p1, p, alvo, { livre: livre, gravidade: !!S.gravidade, estado: est, so90: c.angulo === "orto" });
      if (corteP && corteP.tipo !== "horizontal") plano = [];
      var sinal = S.gravidade ? (this._sobe ? 1 : -1) : 0, yH = p1.y, ant = p1, pts = [];
      if (corteP && corteP.tipo !== "horizontal") { pts.push(corteP.p); yH = corteP.p.y; }
      plano.forEach(function (q) {
        var L = Math.sqrt((q.x - ant.x) * (q.x - ant.x) + (q.z - ant.z) * (q.z - ant.z));
        yH = yH + sinal * num(c.inclinacao, 0) / 100 * L;
        if (L > 0.005) pts.push({ x: r4(q.x), y: r6(yH), z: r4(q.z) });
        ant = q;
      });
      /* o alvo está em outra cota: desce/sobe na vertical até ele (o joelho sai sozinho); no ponto de
         PAREDE a vertical corre embutida e um toco sai perpendicular no ponto */
      var abaixo = alvo && S.gravidade && !this._sobe && (alvo.tipo === "meio" || alvo.tipo === "ponta") && yH < alvo.y - I.TOL;
      if (alvo && alvo.tipo === "aparelho") this.pernaAparelho(alvo, yH, false).forEach(function (q) { pts.push(q); });
      /* caixa/ralo: chega DE LADO, na cota em que está, se ela cai dentro da captura da peça (antes subia por baixo dela) */
      else if (alvo && alvo.tipo === "peca" && alvo.hub && yH >= alvo.hub.yBot && yH <= alvo.hub.yTop) { /* já ligado */ }
      else if (alvo && alvo.tipo !== "vertical" && Math.abs(alvo.y - yH) > I.TOL) pts.push({ x: r4(alvo.x), y: r4(alvo.y), z: r4(alvo.z) });
      if (!pts.length) { ctx.hint("Pontos muito próximos — clique um ponto distinto."); return; }
      var ini = p1, criados = [];
      for (var i = 0; i < pts.length; i++) {
        /* ⚠ o biminst lê o SENTIDO DO ESCOAMENTO de p1 para p2: desenhando para montante (do TQ para o
           aparelho) o trecho é gravado ao contrário, senão ele acusa "sobe no sentido do escoamento" */
        var o = this._sobe && S.gravidade ? this._opTrecho(pts[i], ini, ed.ops) : this._opTrecho(ini, pts[i], ed.ops);
        if (!I.normTrecho(o)) { ctx.hint("Trecho inválido (comprimento zero?)."); return; }
        criados.push(o); ini = pts[i];
      }
      var self = this;
      /* chegou no MEIO de um tubo: ele é DIVIDIDO no ponto (o tê ou a junção fica no nó) */
      if (alvo && alvo.tipo === "meio" && I.dividirTrecho) { var fimD = pts[pts.length - 1]; I.dividirTrecho(est, alvo.trecho, fimD).forEach(function (o) { ed.ops.push(o); }); }
      criados.forEach(function (o, k) { if (k < criados.length - 1) ed.ops.push(o); });
      ctx.op(criados[criados.length - 1]);                        /* um rebuild só, no fim */
      var fim = pts[pts.length - 1];
      var tot = criados.reduce(function (s, o) { var g = I.geometria(o.p1, o.p2); return s + g.comprimento; }, 0);
      var msg = criados.length + (criados.length > 1 ? " trechos" : " trecho") + " (" + fmt(tot, 2) + " m)";
      if (S.gravidade) msg += ", cota de saída " + fmt(fim.y - base, 3) + " m (desnível " + fmt(p1.y - fim.y, 3) + " m)";
      if (corteP && corteP.tipo !== "horizontal" && S.gravidade && ((!this._sobe && corteP.p.y > p1.y + 1e-6) || (this._sobe && corteP.p.y < p1.y - 1e-6))) msg += " ⚠ o trecho SOBE contra o escoamento (o esgoto desce de p1 para p2): confira o sentido";
      if (abaixo) msg += " ⚠ chegou " + fmt((alvo.y - yH) * 100, 1) + " cm ABAIXO do tubo de destino: o trecho sobe para ligar — baixe o ramal de destino ou suba a altura de trabalho";
      if (alvo) { ctx.fim(); this._sobe = false; this._planoCota(); ctx.hint(msg + " — ligado em " + self._rotAlvo(alvo) + ". Clique o início do próximo, ou Esc."); }
      else { ctx.inicio(fim); ctx.hint(msg + ". Continuando do fim — clique o próximo ponto, ou Esc."); }
      this._ultimaSaida = fim.y - base;
      ctx.marcar();
      this.pintarProps();
    },
    /* ------------------------------------------------ LIGAR A → B (modelagem pelos conectores, 17/10/2026)
     * Pedido do Rogério: "clicar numa conexão e ligar até a outra, e ele já ligar, entendendo a inclinação". Com a
     * ferramenta Tubo: clique no ponto A (louça, caixa, ponta, meio ou tubo vertical) e depois no B — o motor do
     * traçado automático (js/hidligar.js → js/hidrota.js) faz a rota (90°/45°, sem atravessar família, esgoto com a
     * declividade do DN, no sentido do escoamento). A prévia aparece em azul; clique ou Enter confirma, Tab troca de
     * opção, Esc cancela. Sem rota (falta altura, sistema sem motor) → avisa e segue o desenho ponto a ponto. */
    /* MUDAR A ALTURA NO MEIO DO DESENHO (pedido do Rogério, 17/10/2026): "estou desenhando a 30 cm do piso, digito 60
       e continuo" — o tubo sobe (ou desce) na VERTICAL no ponto atual (os joelhos saem sozinhos, a rede decide) e o
       próximo trecho segue na cota nova. No esgoto/pluvial, subir contra o escoamento é avisado. */
    mudarAltura: function (cota) {
      if (!this._previaHidro()) return false;   /* P8: só com a prévia hidro */
      var ctx = this._ctx(), c = this.cfg, I = BI(); if (!ctx || !c || !I || !ctx.edit || !ctx.edit.p1 || c.ferramenta === "peca") return false;
      var ed = ctx.edit, base = ed.base || 0, p1 = { x: ed.p1.x, y: ed.p1.y, z: ed.p1.z }, y = r6(base + num(cota, 0));
      if (Math.abs(y - p1.y) <= 1e-3) return false;
      var S = I.SISTEMAS[c.sistema], p2 = { x: p1.x, y: y, z: p1.z };
      var o = this._sobe && S.gravidade ? this._opTrecho(p2, p1, ed.ops) : this._opTrecho(p1, p2, ed.ops);
      if (!I.normTrecho(o)) return false;
      ctx.op(o); ctx.inicio(p2); ctx.marcar(); this._inicio = null;
      var contra = S.gravidade && ((!this._sobe && y > p1.y) || (this._sobe && y < p1.y));
      var t = (y > p1.y ? "Subiu " : "Desceu ") + fmt(Math.abs(y - p1.y), 2) + " m na vertical (joelhos no pé e no topo). Altura de trabalho agora " + fmt(y - base, 2) + " m — continue o traço." +
        (contra ? " ⚠ o esgoto não pode SUBIR no sentido do escoamento: confira (desenhe a partir do tubo de queda para subir até o aparelho)." : "");
      status(t); try { ctx.hint(t); } catch (eH) {}
      return true;
    },
    /* o ponto do CORTE travado no plano dele: vertical, horizontal ou 45° (Alt = livre) */
    pontoCorte: function (p1, p, livre) {
      var dx = p.x - p1.x, dz = p.z - p1.z, h = Math.sqrt(dx * dx + dz * dz), dy = p.y - p1.y;
      if (livre) return { tipo: "livre", p: { x: r4(p.x), y: r6(p.y), z: r4(p.z) } };
      var a = Math.atan2(dy, h), passo = Math.PI / 4, k = Math.round(a / passo), L = Math.sqrt(h * h + dy * dy);
      if (Math.abs(k) >= 2) return { tipo: "vertical", p: { x: p1.x, y: r6(p1.y + (dy >= 0 ? 1 : -1) * Math.abs(dy)), z: p1.z } };
      if (k === 0) return { tipo: "horizontal", p: { x: r4(p.x), y: p1.y, z: r4(p.z) } };
      var s = Math.SQRT1_2 * L, ux = h > 1e-9 ? dx / h : 0, uz = h > 1e-9 ? dz / h : 0;
      return { tipo: "inclinado", p: { x: r4(p1.x + ux * s), y: r6(p1.y + (dy >= 0 ? s : -s)), z: r4(p1.z + uz * s) } };
    },
    /* há ponto de ligação (louça, caixa, ponta, meio, tubo vertical) perto do ponto da planta? */
    alvoEm: function (q) {
      if (!this._previaHidro()) return false;   /* P8: só com a prévia hidro */
      var ctx = this._ctx(), c = this.cfg; if (!ctx || !c || !q || c.ferramenta === "peca") return false;
      var ed = ctx.edit, est = ed.estado || { instalacoes: { trechos: [], pecas: [] }, familias: [] };
      return !!this.agarrar(est, ctx.famAval, { x: q.x, z: q.z }, c.sistema, null, ed.p1 ? ed.p1.y : (ed.base || 0) + this.alturaTrabalho(true));
    },
    /* o clique num CORTE/ELEVAÇÃO (js/bimplantamodelar.js clique2d) → o ponto do mundo no plano do corte */
    cliqueCorte: function (id, ev, p) {
      if (!this._previaHidro()) return false;   /* P8: só com a prévia hidro */
      var D = global.Bim2D, K = global.BimInstCon, def = D && D.def ? D.def(id) : null;
      if (!def || def.tipo === "planta" || !K || !p || !this.cfg) return false;
      var ctx = this._ctx(), c = this.cfg; if (!ctx) return false;
      var ed = ctx.edit, q = { x: p[0], y: p[1] }, flags = { _corte: true, altKey: !!(ev && ev.altKey), shiftKey: !!(ev && ev.shiftKey) };
      /* sem o motor novo (ou peça/acessório): o ponto no plano do corte, como antes */
      if (!K.pickCorte || c.ferramenta === "peca" || c.ferramenta === "acessorio") { var w0 = K.doDesenho(def, q); if (!w0) return false; this.clique(ctx, w0, flags); return true; }
      /* MODELAR PARTINDO DA PEÇA (18/10/2026): a peça sob o cursor NA PROJEÇÃO DO CORTE — o desenho começa (ou termina)
         nela e a PROFUNDIDADE do plano de trabalho passa a ser a do eixo dela */
      var est = ed.estado || { instalacoes: { trechos: [], pecas: [] }, familias: [] };
      var pk = K.pickCorte(est, ctx.famAval, def, q, { sistema: c.sistema, tol: this._tolCorte(id) }), w;
      if (pk) {
        w = pk.P; flags._alvo = pk.alvo;
        if (!ed.p1) this._planoC = { vista: id, t: pk.t, rot: pk.rotulo, modo: "peca" };
      } else {
        var t = this._tPlano(id, def, ed);
        w = K.noPlano(def, q, t); if (!w) return false;
        flags._alvo = null;
        if (ed.p1) flags._mudaPlano = Math.abs(K.profundidade(def, ed.p1) - t) > 0.005;
        /* NUNCA o tubo invisível em silêncio: fora da faixa de vista do corte, pergunta ANTES */
        else if (!K.naFaixa(def, t, (num(c.dn, 50) || 50) / 2000)) { this._avisoFaixa(id, def, q, t); return true; }
      }
      this.clique(ctx, w, flags);
      this._indicadorPlano(id, pk);
      return true;
    },
    /* a tolerância do clique no corte: 10 px do desenho em metros */
    _tolCorte: function (id) {
      var D = global.Bim2D, c = D && D._cache ? D._cache[id] : null, sv = c && (c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null));
      var m = sv && sv.getScreenCTM ? sv.getScreenCTM() : null; return m && m.a > 0 ? 10 / m.a : 0.08;
    },
    /* o plano de trabalho no corte: desenhando, o do ponto atual; antes do 1º clique, o da peça em que se começou
       nesta vista (ou o do próprio corte); o Tab troca para o plano do corte */
    _tPlano: function (id, def, ed) {
      var K = global.BimInstCon, pl = this._planoC && this._planoC.vista === id ? this._planoC : null;
      if (pl && pl.modo === "corte") return 0;
      if (ed && ed.p1) return K.profundidade(def, ed.p1);
      return pl ? pl.t : 0;
    },
    trocarPlanoCorte: function () {
      var tela = typeof document !== "undefined" ? document.querySelector('.bim-tela[data-ativa="1"]') : null, id = tela ? tela.getAttribute("data-vista") : null;
      if (!this.cfg || !id || !/^d2[cv]-/.test(String(id))) return false;
      var pl = this._planoC && this._planoC.vista === id ? this._planoC : (this._planoC = { vista: id, t: 0, rot: "plano do corte", modo: "peca" });
      pl.modo = pl.modo === "corte" ? "peca" : "corte";
      this._indicadorPlano(id, null);
      return true;
    },
    /* o indicador discreto do plano de trabalho, no canto da vista */
    _indicadorPlano: function (id, pk) {
      if (typeof document === "undefined") return;
      var D = global.Bim2D, K = global.BimInstCon, c = D && D._cache ? D._cache[id] : null, def = D && D.def ? D.def(id) : null; if (!c || !c.el || !def || !K) return;
      var ed = this.cfg && this._ctx() ? this._ctx().edit : null, pl = this._planoC && this._planoC.vista === id ? this._planoC : null;
      var t = pk ? pk.t : this._tPlano(id, def, ed), rot = pk ? pk.rotulo : (pl && pl.modo === "corte" ? "plano do corte" : (pl ? pl.rot : "plano do corte"));
      var el = document.querySelector('.bim-inst-plano[data-vista="' + id + '"]');
      if (!el) { el = document.createElement("div"); el.className = "bim-inst-plano"; el.setAttribute("data-vista", id); el.style.cssText = "position:fixed;z-index:41;pointer-events:none;background:rgba(255,255,255,.92);border:1px solid #9cc3ea;border-radius:4px;padding:2px 6px;font:11px sans-serif;color:#0b3b5c"; document.body.appendChild(el); }
      var r = c.el.getBoundingClientRect(); el.style.left = (r.left + 10) + "px"; el.style.top = (r.bottom - 28) + "px";
      el.textContent = (pk ? "Começa em: " : "Plano: ") + rot + ", prof. " + fmt(t, 2) + " m" + (pl || pk ? " · Tab: " + (pl && pl.modo === "corte" ? "plano da peça" : "plano do corte") : "");
      el.setAttribute("data-prof", String(t));
      el.style.display = this.cfg ? "" : "none";
      /* some quando a vista do corte sai da frente ou o Tubo é guardado (uma checagem leve, meio segundo) */
      var self = this;
      if (!this._tIndPlano) this._tIndPlano = setInterval(function () {
        var els = document.querySelectorAll(".bim-inst-plano"); if (!els.length) { clearInterval(self._tIndPlano); self._tIndPlano = null; return; }
        var tela = document.querySelector('.bim-tela[data-ativa="1"]'), vis = tela ? tela.getAttribute("data-vista") : null, PM = global.BimPlantaModelar;
        var armado = !!self.cfg && (!PM || !PM.ferramenta || PM.ferramenta() === "inst");
        for (var i = 0; i < els.length; i++) { var on = armado && els[i].getAttribute("data-vista") === vis; if ((els[i].style.display !== "none") !== on) els[i].style.display = on ? "" : "none"; }
      }, 500);
    },
    /* o clique cairia fora da faixa de vista do corte: avisa ANTES e oferece ajustar a faixa ou o plano da peça mais próxima */
    _avisoFaixa: function (id, def, q, t) {
      if (typeof document === "undefined") { this._ultimoAvisoFaixa = { id: id, t: t }; return; }
      var K = global.BimInstCon, self = this, ctx = this._ctx(), c = this.cfg, Q = K.quadro(def), D = global.Bim2D;
      var mp = ctx ? K.maisPerto(ctx.edit.estado || { instalacoes: { trechos: [], pecas: [] } }, ctx.famAval, def, q, c.sistema) : null;
      var velho = document.querySelector(".bim-inst-faixa"); if (velho) velho.parentNode.removeChild(velho);
      var w = document.createElement("div"); w.className = "bim-inst-faixa"; w.setAttribute("role", "dialog");
      w.style.cssText = "position:fixed;z-index:62;left:50%;bottom:64px;transform:translateX(-50%);max-width:540px;background:#fff;border:2px solid #b45309;border-radius:8px;padding:10px 12px;font:13px/1.35 sans-serif;color:#222;box-shadow:0 4px 18px rgba(0,0,0,.3)";
      var faixa = "de 0 a " + (Q && Q.prof ? fmt(Q.prof, 2) + " m" : "todo o modelo");
      var podeAjustar = /^d2c-/.test(String(id)) && D && D.def && D.def(id) && D.def(id).corte;
      w.innerHTML = '<div style="font-weight:700;margin-bottom:4px">⚠ O tubo vai ficar fora da faixa de vista</div><div data-faixa-msg>No plano a ' + fmt(t, 2) + " m de profundidade o tubo fica " +
        (t < 0.05 ? "em cima do plano do corte (cortado ao meio, não aparece)" : "atrás da profundidade de vista") + " — a faixa do corte vai " + faixa + ". Nada foi criado.</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><button type="button" class="btn sm" data-faixa="ajustar"' + (podeAjustar ? "" : " disabled") + ">Ajustar a faixa</button>" +
        '<button type="button" class="btn sm" data-faixa="peca"' + (mp ? "" : " disabled") + ">Usar o plano da peça mais próxima" + (mp ? " (" + mp.rotulo + ", " + fmt(mp.t, 2) + " m)" : "") + "</button>" +
        '<button type="button" class="btn sm" data-faixa="cancelar">Cancelar</button></div>';
      document.body.appendChild(w);
      w.addEventListener("click", function (e) {
        var bt = e.target && e.target.closest ? e.target.closest("[data-faixa]") : null; if (!bt || bt.disabled) return;
        var k = bt.getAttribute("data-faixa"); if (w.parentNode) w.parentNode.removeChild(w);
        if (k === "cancelar") { status("Nada criado."); return; }
        var tN = t;
        if (k === "peca" && mp) { tN = mp.t; self._planoC = { vista: id, t: mp.t, rot: mp.rotulo, modo: "peca" }; }
        if (k === "ajustar") {
          var cr = D.def(id).corte, r = (num(c.dn, 50) || 50) / 2000;
          if (Q.prof != null && t > Q.prof - r) cr.prof = Math.ceil((t + r + 0.5) * 10) / 10;   /* a profundidade cobre o plano */
          else { var dd = r + 0.15 - t; cr.ax = r4(cr.ax - Q.nx * dd); cr.az = r4(cr.az - Q.nz * dd); cr.bx = r4(cr.bx - Q.nx * dd); cr.bz = r4(cr.bz - Q.nz * dd); tN = t + dd; }   /* o plano do corte recua para a frente do tubo */
          try { if (D._gravar) D._gravar(); if (D.redesenhar) D.redesenhar(id, true); } catch (eA) {}
        }
        var defN = D.def(id), wN = K.noPlano(defN, k === "ajustar" ? K.noDesenho(defN, K.noPlano(def, q, t)) : q, k === "ajustar" ? (K.profundidade(defN, K.noPlano(def, q, t))) : tN);
        if (wN && self._ctx()) { self.clique(self._ctx(), wN, { _corte: true, _alvo: null }); self._indicadorPlano(id, null); }
      });
      status("O tubo ficaria fora da faixa de vista do corte: escolha ajustar a faixa ou o plano da peça mais próxima.");
    },
    /* FLUIDEZ (rodada 3): a instalação mais perto do ponto da TELA no 3D — o clique que não acertou malha (o símbolo do
       nível Baixo é contorno/linha fina). Peça (caixa, ralo) até 14 px do centro; tubo até 8 px do eixo. Só o 3D. */
    pickTela: function (cx, cy) {
      if (!this._previaHidro()) return null;   /* P8: só com a prévia hidro */
      var b = B(); if (!b || !b.telaDe || !b.editarEstado) return null;
      var est = b.editarEstado(), ins = est && est.estado ? est.estado.instalacoes : null; if (!ins) return null;
      var melhor = null, dm = 14;
      (ins.pecas || []).forEach(function (k) { var q = b.telaDe(k.x, k.y, k.z); if (!q || q.atras) return; var d = Math.sqrt((q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy)); if (d < dm) { dm = d; melhor = "edit:" + k.id; } });
      if (melhor) return melhor;
      dm = 8;
      (ins.trechos || []).forEach(function (t) {
        var a = b.telaDe(t.p1.x, t.p1.y, t.p1.z), c = b.telaDe(t.p2.x, t.p2.y, t.p2.z); if (!a || !c || a.atras || c.atras) return;
        var dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy, u = L2 > 0 ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / L2)) : 0;
        var ex = a.x + u * dx - cx, ey = a.y + u * dy - cy, d = Math.sqrt(ex * ex + ey * ey);
        if (d < dm) { dm = d; melhor = "edit:" + t.id; }
      });
      return melhor;
    },
    /* FLUIDEZ (rodada 3, 17/10/2026): a PRÉVIA ELÁSTICA no corte/elevação — o tubo já se desenhava no corte (cliqueCorte,
       vertical/horizontal/45°), mas sem a linha entre o 1º ponto e o cursor não se via o que o 2º clique ia fazer. A linha
       segue a mesma trava do clique (pontoCorte; Alt = livre), na cor do sistema, com o tipo e o comprimento. */
    moverCorte: function (id, ev, p) {
      if (!this._previaHidro()) return false;   /* P8: só com a prévia hidro */
      var D = global.Bim2D, K = global.BimInstCon, def = D && D.def ? D.def(id) : null;
      if (!def || def.tipo === "planta" || !K || typeof document === "undefined") return false;
      var c = D._cache && D._cache[id]; if (!c || !c.svg) return false;
      var g = c.svg.querySelector("g.inst-corte-prev");
      var limpar = function () { if (g && g.parentNode) g.parentNode.removeChild(g); };
      var ctx = this.cfg ? this._ctx() : null, ed = ctx && ctx.edit, I = BI();
      /* MODELAR PARTINDO DA PEÇA: com o Tubo armado, a peça sob o cursor se realça e mostra o ponto em que o traço começa/termina */
      var pkH = this.cfg && this.cfg.ferramenta !== "peca" && this.cfg.ferramenta !== "acessorio" && p && I && ed && K.pickCorte ? this._hoverCorte(id, def, c, ctx, { x: p[0], y: p[1] }) : null;
      if (!this.cfg || this.cfg.ferramenta === "peca" || !ed || !ed.p1 || !p || !I) { limpar(); return !!this.cfg; }
      var w = pkH ? pkH.P : (K.noPlano ? K.noPlano(def, { x: p[0], y: p[1] }, this._tPlano(id, def, ed)) : K.doDesenho(def, { x: p[0], y: p[1] })); if (!w) { limpar(); return true; }
      var r = pkH ? { tipo: "ligar", p: w } : this.pontoCorte(ed.p1, w, !!(ev && ev.altKey)), a = K.noDesenho(def, ed.p1), q = K.noDesenho(def, r.p);
      if (!a || !q) { limpar(); return true; }
      var NS = "http://www.w3.org/2000/svg";
      if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "inst-corte-prev"); g.setAttribute("pointer-events", "none"); g.setAttribute("data-inst-corte-prev", "1"); }
      if (g.parentNode !== c.svg || c.svg.lastChild !== g) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      var S = I.SISTEMAS[this.cfg.sistema] || {}, cor = S.cor || "#2d6a9c";
      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y); ln.setAttribute("x2", q.x); ln.setAttribute("y2", q.y);
      ln.setAttribute("stroke", cor); ln.setAttribute("stroke-width", "2"); ln.setAttribute("stroke-dasharray", "6 4"); ln.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(ln);
      var dx = r.p.x - ed.p1.x, dy = r.p.y - ed.p1.y, dz = r.p.z - ed.p1.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var vb = c.vb || { w: 10 }, tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", (a.x + q.x) / 2); tx.setAttribute("y", (a.y + q.y) / 2); tx.setAttribute("font-size", String(vb.w / 70)); tx.setAttribute("fill", cor);
      tx.setAttribute("paint-order", "stroke"); tx.setAttribute("stroke", "#fff"); tx.setAttribute("stroke-width", String(vb.w / 400));
      tx.textContent = ({ vertical: "vertical", horizontal: "horizontal", inclinado: "45°", livre: "livre", ligar: "liga em " + (pkH ? pkH.rotulo : "") }[r.tipo] || r.tipo) + " · " + fmt(L, 2) + " m";
      g.appendChild(tx);
      this._previaCorte = { id: id, tipo: r.tipo, comprimento: L, p: r.p };
      return true;
    },
    /* o realce da peça sob o cursor no corte (o tubo inteiro, a louça/caixa) e o ponto de partida/chegada */
    _hoverCorte: function (id, def, c, ctx, q) {
      var K = global.BimInstCon, I = BI(), NS = "http://www.w3.org/2000/svg", est = ctx.edit.estado || { instalacoes: { trechos: [], pecas: [] }, familias: [] };
      var pk = K.pickCorte(est, ctx.famAval, def, q, { sistema: this.cfg.sistema, tol: this._tolCorte(id) });
      var g = c.svg.querySelector("g.inst-corte-hover");
      if (!pk) { if (g && g.parentNode) g.parentNode.removeChild(g); this._hoverPk = null; this._indicadorPlano(id, null); return null; }
      if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "inst-corte-hover"); g.setAttribute("pointer-events", "none"); }
      if (g.parentNode !== c.svg) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      g.setAttribute("data-inst-hover", pk.alvo.tipo); g.setAttribute("data-rotulo", pk.rotulo); g.setAttribute("data-prof", String(pk.t));
      var vb = c.vb || { w: 10 }, cor = "#00b4d8";
      var tId = pk.alvo.trecho, tr = tId ? ((est.instalacoes || {}).trechos || []).filter(function (t) { return t.id === tId; })[0] : null;
      if (tr) {
        var a = K.noDesenho(def, tr.p1), b = K.noDesenho(def, tr.p2), ln = document.createElementNS(NS, "line");
        ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y); ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
        ln.setAttribute("stroke", cor); ln.setAttribute("stroke-width", "7"); ln.setAttribute("stroke-opacity", "0.45"); ln.setAttribute("stroke-linecap", "round"); ln.setAttribute("vector-effect", "non-scaling-stroke");
        g.appendChild(ln);
      }
      var m = K.noDesenho(def, pk.P), ci = document.createElementNS(NS, "circle");
      ci.setAttribute("cx", m.x); ci.setAttribute("cy", m.y); ci.setAttribute("r", String(vb.w / 180)); ci.setAttribute("fill", "#fff"); ci.setAttribute("stroke", cor); ci.setAttribute("stroke-width", "2.5"); ci.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(ci);
      this._hoverPk = pk; this._indicadorPlano(id, pk);
      return pk;
    },
    pontoLigacao: function (alvo, c) {
      var a = alvo || {}, base = { x: a.x, y: a.y, z: a.z, sistema: c.sistema, dn: a.dn > 0 ? a.dn : c.dn };
      if (a.tipo === "aparelho") { base.tipo = "conector"; base.famInst = a.famInst; base.parede = a.parede || null; return base; }
      if (a.tipo === "peca") { base.tipo = "peca"; base.id = a.id; base.y = a.hub ? r4(Math.min(a.hub.yTop - 0.03, Math.max(a.hub.yBot + 0.03, a.y - 0.06))) : a.y; return base; }   /* entrada lateral, logo abaixo da grelha */
      if (a.tipo === "vertical") { var t = this._trecho(a.trecho); base.tipo = "vertical"; base.trecho = a.trecho; if (t) { base.yBase = Math.min(t.p1.y, t.p2.y); base.yTopo = Math.max(t.p1.y, t.p2.y); } return base; }
      if (a.tipo === "meio" || a.tipo === "ponta") { base.tipo = a.tipo; base.trecho = a.trecho; return base; }
      return null;
    },
    _trecho: function (id) { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e && e.estado && e.estado.instalacoes ? e.estado.instalacoes.trechos.filter(function (t) { return t.id === id; })[0] : null; },
    tentarLigacao: function (ctx, ini, alvo, base) {
      var L = global.HidLigar, c = this.cfg, I = BI(), b = B(); if (!L || !b || !b.editarPreviaInst || !b.editarLote) return false;
      var A = this.pontoLigacao(ini.alvo, c), Bp = this.pontoLigacao(alvo, c); if (!A || !Bp) return false;
      /* esgoto: A é o lado de MONTANTE — clicou primeiro no destino (tubo de queda, meio de tubo)? troca */
      if ((A.tipo === "vertical" || A.tipo === "meio") && (Bp.tipo === "conector" || Bp.tipo === "peca" || Bp.tipo === "ponta")) { var tx = A; A = Bp; Bp = tx; }
      if (A.tipo === "vertical") return false;
      /* ÁGUA tubo a tubo (ponta/meio → ponta/meio/coluna): a ligação direta — corre na altura do 1º e sobe/desce no 2º —
         é o que se quer; o traçado automático levaria ao ramal da parede (1,20 m) */
      var tubo = { ponta: 1, meio: 1, vertical: 1 };
      if (c.sistema === "agua_fria" && tubo[A.tipo] && tubo[Bp.tipo]) return false;
      var est = ctx.edit.estado, ops0 = (ctx.edit.ops || []).slice(0, (ctx.edit.ops || []).length - ini.nIni);
      var r = null;
      try { r = L.ligar(est, ctx.famAval, A, Bp, { piso: base, opsModelo: ops0.filter(function (o) { return I.ehOp ? I.ehOp(o.op) : (o.op === "trecho" || o.op === "peca"); }), seq: String(Date.now() % 100000) + "-" }); } catch (e) { r = { ok: false, erro: e.message }; }
      if (!r || !r.ok) { ctx.hint("Ligar A → B: " + (r ? r.erro : "sem rota") + ". Seguindo ponto a ponto."); this._inicio = null; return false; }
      this._ligacao = { opcoes: r.opcoes, i: 0, nIni: ini.nIni, ctx: ctx };
      this._previaLigacao();
      return true;
    },
    _previaLigacao: function () {
      var g = this._ligacao, b = B(); if (!g || !b) return;
      var o = g.opcoes[g.i];
      try { b.editarPreviaInst(o.ops); } catch (e) {}
      var t = "Ligar A → B: opção " + (g.i + 1) + " de " + g.opcoes.length + " — " + o.nome + ", " + fmt(o.comprimento, 2) + " m" + (o.avisos.length ? " (" + o.avisos.length + " aviso(s))" : "") +
        ". Clique ou Enter confirma" + (g.opcoes.length > 1 ? "; Tab troca de opção" : "") + "; Esc cancela.";
      status(t); try { g.ctx.hint(t); } catch (eH) {}
    },
    trocarLigacao: function () { var g = this._ligacao; if (!g) return false; g.i = (g.i + 1) % g.opcoes.length; this._previaLigacao(); return true; },
    cancelarLigacao: function () { var b = B(); this._ligacao = null; try { if (b && b.editarPreviaInst) b.editarPreviaInst(null); } catch (e) {} return true; },
    confirmarLigacao: function () {
      var g = this._ligacao, b = B(); if (!g || !b) return false;
      var o = g.opcoes[g.i], ctx = g.ctx, ed = ctx.edit;
      this.cancelarLigacao();
      /* a saída embutida que o 1º clique já criou sai: a rota traz a dela (um lote só, um Ctrl+Z) */
      for (var k = 0; k < g.nIni; k++) ed.ops.pop();
      var ok = b.editarLote({ op: "lote", id: "hid-ligar-" + Date.now(), origem: "hidligar", ops: JSON.parse(JSON.stringify(o.ops)) });
      ctx.fim(); this._inicio = null; this._sobe = false; this._planoCota();
      var t = ok ? "Ligado: " + o.nome + " (" + fmt(o.comprimento, 2) + " m, " + o.ops.length + " operações — um Ctrl+Z desfaz)" + (o.avisos.length ? ". " + o.avisos.join("; ") : ".") : "O editor recusou a ligação.";
      status(t); try { ctx.hint(t); } catch (eH) {}
      this.pintarProps();
      return ok;
    },
    _teclaLigacao: function (ev) {
      if (!BimInstUI._ligacao) { if (ev.key === "Tab" && BimInstUI.trocarPlanoCorte && BimInstUI.trocarPlanoCorte()) { ev.preventDefault(); ev.stopPropagation(); } return; }
      if (ev.key === "Tab") { ev.preventDefault(); ev.stopPropagation(); BimInstUI.trocarLigacao(); }
      else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); BimInstUI.confirmarLigacao(); }
      else if (ev.key === "Escape") BimInstUI.cancelarLigacao();
    },
    /* ------------------------------------------------ QUALIDADE VISUAL 2 (17/10/2026)
     * O traço à mão anda como num projeto de verdade: a 90° e 45° (o eixo travado), nunca na diagonal
     * qualquer — a não ser com Alt ou "Ângulo livre" escolhido em Propriedades. O clique num ponto de
     * aparelho, numa ponta ou no meio de um tubo vira um CAMINHO ortogonal até ele (o esgoto com dois
     * desvios de 45° em vez do joelho de 90° no horizontal), e o ponto de parede é atingido por dentro
     * da parede. Antes a reta ia do último ponto direto ao alvo, atravessando o piso na diagonal e
     * passando por cima da louça (print do Rogério, 17/10/2026). */
    EMBUTIR: 0.05,   /* eixo do tubo embutido atrás da face da parede (m) — o mesmo do traçado automático */
    /* a inclinação do traço pelo DN: a MAIOR entre a regra do modelador e a tabela de declividade mínima do
       esgoto (HidNormas es.declividade_minima, a mesma do traçado automático) — o traço nunca nasce com aviso */
    inclinacaoDn: function (sis, dn) {
      var I = BI(), i = I.inclinacaoMinima(sis, dn), N = global.HidNormas;
      if (sis === "esgoto" && N && N.tabela) {
        try {
          var t = N.tabela("es.declividade_minima"), l = t && t.linhas ? t.linhas.filter(function (x) { return x.dn_max === "*" || Number(x.dn_max) >= dn; })
            .sort(function (a, b) { return (a.dn_max === "*" ? Infinity : Number(a.dn_max)) - (b.dn_max === "*" ? Infinity : Number(b.dn_max)); })[0] : null;
          if (l && isFinite(Number(l.declividade_pct))) i = Math.max(i, Number(l.declividade_pct));
        } catch (e) {}
      }
      return i;
    },
    previaPonto: function (p1, p, ev) { var c = this.cfg; if (!c || !this._previaHidro() || c.ferramenta === "peca" || this.livre(ev)) return null; return this.travar(p1, p, c.angulo === "orto"); },
    /* a ponta clicada é a de CIMA do trecho dela (o lado de montante)? Começar ali é desenhar para montante */
    _pontaDeCima: function (estado, alvo) {
      var t = ((estado.instalacoes || {}).trechos || []).filter(function (x) { return x.id === alvo.trecho; })[0]; if (!t) return false;
      var outra = Math.abs(t.p1.x - alvo.x) < 1e-6 && Math.abs(t.p1.z - alvo.z) < 1e-6 && Math.abs(t.p1.y - alvo.y) < 1e-6 ? t.p2 : t.p1;
      return outra.y < alvo.y - 1e-6;
    },
    livre: function (ev) { var c = this.cfg; return !!((c && c.angulo === "livre") || (ev && ev.altKey)); },
    /* direção travada (planta): o múltiplo de 45° (ou de 90°) mais perto, PROJETANDO o cursor nela */
    travar: function (p1, p, so90) {
      var dx = p.x - p1.x, dz = p.z - p1.z, d = Math.sqrt(dx * dx + dz * dz); if (!(d > 1e-9)) return { x: p.x, z: p.z };
      var passo = Math.PI / (so90 ? 2 : 4), a = Math.round(Math.atan2(dz, dx) / passo) * passo, ux = Math.cos(a), uz = Math.sin(a), L = Math.max(0, dx * ux + dz * uz);
      return { x: r4(p1.x + ux * L), z: r4(p1.z + uz * L) };
    },
    /* o ponto na PLANTA onde o traço chega ao alvo: o ponto de parede, por dentro da parede */
    chegada: function (alvo) {
      /* o eixo embutido nunca deixa o tubo grosso para fora da face: no mínimo o raio + 1 cm */
      var c = this.cfg, e = Math.max(this.EMBUTIR, (c && c.dn ? c.dn : 0) / 2000 + 0.01);   /* 1 cm de reboco sobre o tubo */
      if (alvo.tipo === "aparelho" && alvo.parede) { e += Math.max(0, num(alvo.parede.d, 0)); return { x: r4(alvo.x + alvo.parede.x * e), z: r4(alvo.z + alvo.parede.z * e) }; }   /* da face da parede */
      return { x: alvo.x, z: alvo.z };
    },
    /* os pontos da PLANTA do último ponto até o clique/alvo: travado (90°/45°) e, até um alvo fora do eixo,
       um caminho em L no sistema da parede do aparelho (ou do mundo); com gravidade o canto vira 45° */
    caminhoPlanta: function (p1, p, alvo, o) {
      o = o || {};
      if (!alvo) return [o.livre ? { x: r4(p.x), z: r4(p.z) } : this.travar(p1, p, o.so90)];
      var b = this.chegada(alvo);
      if (o.livre) return [b];
      /* junção no MEIO de um tubo com gravidade: chega a 45° no sentido do escoamento */
      if (alvo.tipo === "meio" && o.gravidade && o.estado) { var j = this.juncao45(o.estado, alvo, p1); if (j) b = j; }
      var u = { x: 1, z: 0 }, v = { x: 0, z: 1 };
      if (alvo.tipo === "aparelho" && alvo.parede) { v = { x: alvo.parede.x, z: alvo.parede.z }; u = { x: -v.z, z: v.x }; }
      var dx = b.x - p1.x, dz = b.z - p1.z, du = dx * u.x + dz * u.z, dv = dx * v.x + dz * v.z, EPSP = 0.005, au = Math.abs(du), avv = Math.abs(dv);
      if (au < EPSP || avv < EPSP || Math.abs(au - avv) < EPSP) return [b];
      var su = du > 0 ? 1 : -1, sv = dv > 0 ? 1 : -1, k;
      if (o.gravidade && !o.so90) {
        /* reto no eixo mais longo e a diferença a 45° — nenhum joelho de 90° no horizontal (NBR 8160) */
        if (au > avv) { k = au - avv; return [{ x: r4(p1.x + u.x * su * k), z: r4(p1.z + u.z * su * k) }, b]; }
        k = avv - au; return [{ x: r4(p1.x + v.x * sv * k), z: r4(p1.z + v.z * sv * k) }, b];
      }
      /* água (ou só 90°): no ponto de PAREDE, primeiro até a linha da parede (v) e depois AO LONGO dela (u) —
         o ramal entra na parede e corre embutido, nunca cruza o ambiente na frente da louça; sem parede,
         o eixo mais longo primeiro */
      if (alvo.tipo === "aparelho" && alvo.parede) return [{ x: r4(p1.x + v.x * dv), z: r4(p1.z + v.z * dv) }, b];
      if (au >= avv) return [{ x: r4(p1.x + u.x * du), z: r4(p1.z + u.z * du) }, b];
      return [{ x: r4(p1.x + v.x * dv), z: r4(p1.z + v.z * dv) }, b];
    },
    /* o ponto da junção a 45° num tubo com gravidade: a jusante do pé da perpendicular, à mesma distância */
    juncao45: function (estado, alvo, p1) {
      var t = ((estado.instalacoes || {}).trechos || []).filter(function (x) { return x.id === alvo.trecho; })[0]; if (!t) return null;
      var a = t.p1.y >= t.p2.y ? t.p1 : t.p2, b = a === t.p1 ? t.p2 : t.p1, ax = b.x - a.x, az = b.z - a.z, L = Math.sqrt(ax * ax + az * az); if (!(L > 1e-6)) return null;
      var wx = ax / L, wz = az / L, s = (p1.x - a.x) * wx + (p1.z - a.z) * wz, h = Math.abs(-(p1.x - a.x) * wz + (p1.z - a.z) * wx), sj = s + h;
      if (!(h > 0.005) || sj < 0.05 || sj > L - 0.05) return null;
      return { x: r4(a.x + wx * sj), z: r4(a.z + wz * sj) };
    },
    /* a perna do traço no aparelho, a partir da cota y (no ponto da planta onde o traço chegou):
       ponto de PAREDE → vertical embutida até a altura do ponto e o toco perpendicular até ele; ponto
       de piso (saída da bacia) → vertical até ele. `sair` = o caminho do aparelho para a cota (início). */
    pernaAparelho: function (alvo, y, sair) {
      var I = BI(), c = this.cfg, S = I.SISTEMAS[c.sistema], out = [], b = this.chegada(alvo);
      if (alvo.parede) {
        /* esgoto: o toco desce com a inclinação (a saída do aparelho fica acima do eixo embutido) */
        var Lt = Math.sqrt((b.x - alvo.x) * (b.x - alvo.x) + (b.z - alvo.z) * (b.z - alvo.z));   /* o comprimento real do toco */
        var yE = S.gravidade ? Math.floor((alvo.y - num(c.inclinacao, 0) / 100 * Lt) * 1e6 - 1e-6) / 1e6 : alvo.y;
        /* ⚠ diferença de cota MENOR que o nó do biminst (2 cm): uma vertical tão curta funde os dois joelhos num
           nó só (virava "cruzeta") e o toco inclinado sai torto no espaço (água a 0,60 m no ponto a 0,58 m).
           Então o toco fica RETO na cota do traço — a ponta cai a menos de 2 cm do ponto, que o biminst liga. */
        if (Math.abs(yE - y) <= I.TOL) {
          if (sair) out.push({ x: b.x, y: r6(alvo.y), z: b.z });
          else out.push({ x: r4(alvo.x), y: r6(y), z: r4(alvo.z) });
          return out;
        }
        if (sair) { out.push({ x: b.x, y: yE, z: b.z }); out.push({ x: b.x, y: r6(y), z: b.z }); }
        else { out.push({ x: b.x, y: yE, z: b.z }); out.push({ x: r4(alvo.x), y: r4(alvo.y), z: r4(alvo.z) }); }
        return out;
      }
      if (sair) return Math.abs(alvo.y - y) > I.TOL ? [{ x: r4(alvo.x), y: r6(y), z: r4(alvo.z) }] : [];
      return Math.abs(alvo.y - y) > I.TOL ? [{ x: r4(alvo.x), y: r4(alvo.y), z: r4(alvo.z) }] : [];
    },
    _rotAlvo: function (a) {
      if (a.tipo === "vertical") return "tubo vertical " + a.trecho + " (na cota de trabalho)";
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
        var cota = [{ id: "i:cota", rotulo: "Altura de trabalho (do nível)" + (c.cotaAuto && S.gravidade ? " — automática" : ""), unidade: "m", tipo: "numero", passo: "0.05", valor: c.cotaAuto && S.gravidade ? this.alturaTrabalho(false) : c.cota },
          { id: "i:angulo", rotulo: "Ângulo do traço", tipo: "lista", valor: c.angulo || "orto45", opcoes: [{ id: "orto45", rotulo: "90° e 45° (padrão)" }, { id: "orto", rotulo: "Só 90°" }, { id: "livre", rotulo: "Livre (qualquer direção)" }] }];
        /* P8: sem a prévia hidro, a linha do master (cota inicial; o traço do master não trava ângulo) */
        if (!this._previaHidro()) cota = [{ id: "i:cota", rotulo: "Cota inicial (do nível)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.cota }];
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
          c.cota = COTA_PADRAO[valor]; c.aplicacao = ""; c.cotaAuto = !!S.gravidade && this._previaHidro();
          c.inclinacao = this.inclinacaoDn(valor, c.dn);
        } else if (I.PECAS[c.peca].sistemas.indexOf(valor) < 0) c.peca = Object.keys(I.PECAS).filter(function (p) { return I.PECAS[p].sistemas.indexOf(valor) >= 0; })[0];
      } else if (k === "material") {
        var M = I.MATERIAIS[valor]; if (!M) return;
        c.material = valor; if (M.dns.length && M.dns.indexOf(c.dn) < 0) c.dn = M.dn;
        if (M.larg) { c.larg = M.larg; c.alt = M.alt; }   /* P12: eletrocalha */
        c.pn = M.pn || ""; c.classe = M.classe || ""; c.iso = M.iso || ""; c.bitola = M.bitola || "";
      } else if (k === "famId" || k === "tipoId") { c[k] = String(valor); if (k === "famId") c.tipoId = "";   /* P12: acessório */
      } else if (k === "dn") { c.dn = num(valor, c.dn); if (I.SISTEMAS[c.sistema].gravidade) c.inclinacao = Math.max(c.inclinacao, this.inclinacaoDn(c.sistema, c.dn)); }
      else if (k === "peca") { c.peca = valor; c.pecaDn = ""; }
      else if (["cota", "inclinacao", "larg", "alt", "alturaPiso", "dh"].indexOf(k) >= 0) { var v = num(valor, NaN); if (isFinite(v)) { c[k] = v; if (k === "cota") { c.cotaAuto = false; if (this.mudarAltura(v)) return; } } }   /* subiu/desceu no meio do traço: o recado dela fica */
      else if (["pn", "classe", "iso", "bitola", "aplicacao", "pecaDn", "pecaMat"].indexOf(k) >= 0) c[k] = String(valor);
      else if (k === "angulo") c.angulo = valor === "livre" || valor === "orto" ? valor : "orto45";
      this._planoCota();
      this.dica();
    },
    /* o NOME da peça vai no recado: a tomada, a luminária e o quadro diziam "Clique onde
       colocar a louça" (auditoria de 12/10/2026) */
    NOMES_FAM: { "ra-tomada": "a tomada", "ra-luminaria": "a luminária", "ra-quadro-distribuicao": "o quadro de distribuição",
      "ra-bacia": "a bacia", "ra-lavatorio": "o lavatório", "ra-chuveiro": "o chuveiro", "ra-caixa-dagua": "a caixa d'água" },
    colocarFamilia: function (famId, tipoId) {
      var b = B(), G = this._G; if (!b || !b.editarArmar) return false;
      try { if (G && G._famSync) G._famSync(); } catch (e) {}
      b.editarArmar("familia", { famId: famId, tipoId: tipoId, inst: {} });
      status("Clique onde colocar " + (this.NOMES_FAM[famId] || "a peça") + " (barra de espaço gira 90°). O ponto de ligação aparece como uma bolinha na cor do sistema.");
      return true;
    },

    /* ------------------------------------------------ P8 (revisão da junção, 18/10/2026): a PRÉVIA HIDRO
     * Decisão da coordenação: o que mudou nas instalações do BIM geral (geometria real do biminstgeo, cor do padrão,
     * nível de detalhe, traço a 90°/45° com altura automática, ligar A → B, tubo no corte, colocação com prévia) só
     * vale com ?previa=hidro. A escolha é feita AQUI, no ponto de chamada; sem a prévia roda o caminho do master
     * (0a2e06d2), copiado abaixo sem mudança. Sem BimPrevia (Node, testes dos motores) vale o caminho novo. */
    _previaHidro: function () {
      var P = global.BimPrevia; if (!P || typeof P.hidro !== "function") return true;
      try { return !!P.hidro(); } catch (e) { return true; }
    },
    /* o desenho das instalações do MASTER (0a2e06d2): cilindro na cor do sistema, conexão em esfera, peça em caixa/cilindro,
       ponto de ligação em bolinha; acessório pelo corpo da família e desconexão em esfera vermelha */
    _malhasMaster: function (st, famAval, THREE) {
      var I = BI(), self = this, out = []; if (!I || !THREE || !st || !st.instalacoes) return out;
      this._nivelFeito = null; this._segsDe = {};   /* sem a prévia não há nível de detalhe: a vista 2D desenha como no master */
      var R = I.rede(st, famAval), Y = new THREE.Vector3(0, 1, 0);
      var discDe = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "eletrica" : (g === "ar" ? "climatizacao" : "hidraulica"); };
      var ifcTubo = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERSEGMENT" : (g === "ar" ? "IFCDUCTSEGMENT" : "IFCPIPESEGMENT"); };
      var ifcCx = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERFITTING" : (g === "ar" ? "IFCDUCTFITTING" : "IFCPIPEFITTING"); };
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
        out.push({ id: k.id, ifc: P.ifc, malhas: [m], disciplina: P.sistemas[0] === "eletrica" ? "eletrica" : "hidraulica", nome: (k.peca === "caixa_inspecao" && I.itemPeca ? (I.itemPeca(k).nome || P.nome) : P.nome + (k.dn && k.dn !== "-" ? " " + k.dn.replace(/x/g, "×") : "")) + " (" + k.id + ")", qto: { contagem: 1 } });
      });
      /* o PONTO DE LIGAÇÃO dos aparelhos: bolinha na cor do sistema, que é parte da família (o clique seleciona a louça) */
      R.conectores.forEach(function (k) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 6), self._mat(THREE, I.SISTEMAS[k.sistema].cor));
        m.position.set(k.x, k.y, k.z); m.userData.marcador = true;   /* RENDER: marcador de tela, não é peça (js/bimrender.js pula) */
        out.push({ id: k.famInst, malhas: [m], marcador: true });
      });
      /* P12: acessórios (o corpo da família, no eixo do tubo) e as desconexões marcadas */
      try { this._malhasP12Master(R, famAval, THREE).forEach(function (x) { out.push(x); }); } catch (eP12) {}
      /* ⚠ a marca de PAPEL (só userData, o desenho não muda): a reconstrução SÓ DAS INSTALAÇÕES do js/bim.js
         (editRebuildInst) tira da cena as malhas marcadas — sem ela os tubos do master se acumulavam a cada op */
      var PAP = { IFCVALVE: "acessorio" };
      out.forEach(function (el) { if (el.marcador) return; var pp = PAP[el.ifc] || (/SEGMENT$/.test(el.ifc || "") ? "tubo" : (/FITTING$/.test(el.ifc || "") ? "conexao" : "peca")); el.malhas.forEach(function (mm) { mm.userData.instPapel = pp; }); });
      this._ultimaRede = R;
      return out;
    },
    /* o traço do MASTER (0a2e06d2), sem mudança: cota inicial fixa, reta até o clique ou o alvo */
    _cliqueMaster: function (ctx, p) {
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
    _malhasP12Master: function (R, famAval, THREE) {
      var I = BI(), out = [], self = this, VERMELHO = "#E0262B";
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
      if (this._desc) {
        var marcar = function (p, id) { var m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), self._mat(THREE, VERMELHO)); m.position.set(p.x, p.y, p.z); m.userData.desconexao = true; out.push({ id: id, malhas: [m], marcador: true, desconexao: true }); };
        R.pontasLivres.forEach(function (p) { marcar(p, p.trecho); });
        R.conectoresLivres.forEach(function (k) { marcar(k, k.famInst); });
      }
      return out;
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
    /* QUALIDADE VISUAL 1 (17/10/2026): material PBR da APARÊNCIA (js/biminstgeo.js: cor do material, rugosidade,
       metálico, verniz). corSobre = cor imposta por um modo de vista (sistema, verificação): troca só a cor e
       mantém o acabamento acetinado. Cache por chave: o replay não cria material novo a cada clique. */
    modoCor: "material",
    _matAp: function (THREE, ap, corSobre) {
      var k = "ap|" + ap.chave + "|" + (corSobre || "");
      if (this._mats[k]) return this._mats[k];
      var cor = new THREE.Color(corSobre || ap.cor), o = { color: cor, roughness: ap.rug, metalness: ap.met, side: THREE.DoubleSide };
      if (ap.emissivo) o.emissive = cor.clone().multiplyScalar(ap.emissivo);
      var M = THREE.MeshPhysicalMaterial && ap.verniz ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o);
      if (ap.verniz && M.isMeshPhysicalMaterial) { M.clearcoat = ap.verniz; M.clearcoatRoughness = 0.42; }
      if (ap.env != null) M.envMapIntensity = ap.env;   /* PVC é plástico: reflexo do ambiente reduzido (sem ele o marrom virava cobre polido) */
      M.name = "inst:" + ap.chave + (corSobre ? ":" + corSobre : "");
      this._mats[k] = M;
      return M;
    },
    /* o material de uma peça: papel (corpo, latão, cromado, grelha…) → aparência; no modo "sistema" o CORPO
       leva a cor do sistema; a cor da verificação (js/hidcalcui.js) vence as duas */
    /* ⚠ manterMaterial (pedido do Rogério, 18/10/2026): no modo "cor por sistema" só TUBOS e CONEXÕES ganham a cor do sistema —
       caixas (inspeção, PV, sifonada, ralo), louças e equipamentos ficam no material da obra (a CI de 0,60 virava um cubo verde) */
    _matPeca: function (THREE, material, sistema, papel, corVerif, manterMaterial) {
      var G = global.HidGeo, I = BI(); if (!G) return this._mat(THREE, corVerif || I.SISTEMAS[sistema].cor);
      var ap = G.aparencia(material, sistema, papel), corpo = !papel || papel === "corpo" || papel === "azul";
      var sobre = corpo ? (corVerif || (this.modoCor === "sistema" && !manterMaterial && I.SISTEMAS[sistema] ? I.SISTEMAS[sistema].cor : null)) : null;
      return this._matAp(THREE, ap, sobre);
    },
    alternarModoCor: function (modo) {
      this.modoCor = modo === "sistema" ? "sistema" : "material";
      try { var b = B(); if (b && b.editarReconstruir) b.editarReconstruir(); } catch (e) {}
      status(this.modoCor === "sistema" ? "Cores por sistema do padrão de apresentação (água fria azul, esgoto verde…): modo de vista." : "Cores do material (como a peça é na obra).");
      return this.modoCor;
    },
    /* NÍVEL DE DETALHE: o material da LINHA ÚNICA — a cor do sistema, chapada (brilho próprio alto: a linha lê igual
       de qualquer lado, como o traço da prancha) */
    _matLinha: function (THREE, cor) {
      var k = "linha|" + cor; if (this._mats[k]) return this._mats[k];
      var c = new THREE.Color(cor);
      var M = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.55), roughness: 1, metalness: 0, side: THREE.DoubleSide });
      M.name = "inst-linha:" + cor;
      this._mats[k] = M; return M;
    },
    /* os segmentos unifilares de um elemento (js/biminstnivel.js) → malhas de prisma fino, uma por estilo (tubo, símbolo,
       contorno); corSobre = a cor da verificação. Marcadas instUnif: a vista 2D (js/bim.js vista2d) não as corta — ela
       desenha os MESMOS segmentos em vetor. */
    _linhaMalhas: function (THREE, id, corSobre) {
      var NV = global.BimInstNivel, segs = (this._segsDe || {})[id] || [], self = this, grupos = {}, ordem = [], out = [];
      if (!NV || !segs.length) return out;
      segs.forEach(function (sg) { if (!grupos[sg.k]) { grupos[sg.k] = []; ordem.push(sg.k); } grupos[sg.k].push(sg); });
      ordem.forEach(function (k) {
        var est = NV.estiloSeg(grupos[k][0]), ml = NV.malhaLinhas(grupos[k], NV.raioPena(est.mm, NV.ESCALA_PADRAO));
        if (!ml.idx.length) return;
        var m = self._malhaG(THREE, ml, self._matLinha(THREE, (grupos[k][0].papel === "tubo" && corSobre) || est.cor));
        m.userData.instUnif = true; out.push(m);
      });
      return out;
    },
    /* uma malha do js/biminstgeo.js (listas em coordenadas do mundo) → THREE.Mesh com a posição no centro da caixa
       (os vértices ficam pequenos: precisão do float32 longe da origem) */
    /* FLUIDEZ — CACHE DE GEOMETRIA (17/10/2026): a troca de DN de UM tubo refazia a geometria de TODAS as peças (e o
       2D recalculava as arestas de cada uma, porque a geometria era outra). A malha com o MESMO conteúdo (posições,
       normais e índices — duas somas de 32 bits sobre os valores) reaproveita a BufferGeometry da reconstrução anterior:
       sem recriar, sem reenviar à placa de vídeo e com as arestas do 2D já calculadas (js/bim.js arestasDe guarda por
       geometria). Geração: o que não foi usado nas duas últimas reconstruções é descartado. A geometria do cache tem
       userData.instGeoCache — o js/bim.js não a descarta ao refazer (quem descarta é o cache). */
    _geoGeracao: function (THREE) {
      var C = this._geoCache;
      if (!C || C.THREE !== THREE) { if (C) C.m.forEach(function (e) { try { e.g.dispose(); } catch (x) {} }); C = this._geoCache = { THREE: THREE, m: new Map(), ger: 0, reusos: 0, novas: 0 }; }
      C.ger++;
      var lim = C.ger - 2;
      C.m.forEach(function (e, k) { if (e.ger < lim) { try { e.g.dispose(); } catch (x) {} C.m.delete(k); } });
      return C;
    },
    _chaveMalha: function (ml, c) {
      /* laço sem chamada de função (a versão com um mix() por valor custava ~60 ms por reconstrução no modelo médio).
         Rodada 4: as posições RELATIVAS ao centro (c) — a mesma forma em outro lugar é a mesma geometria (a posição é da
         malha: a "matriz por instância"); sem c, as absolutas */
      var h1 = -2128831035, h2 = -1640531527, i, v, x, a = ml.pos, n = a.length, c0 = c ? c[0] : 0, c1 = c ? c[1] : 0, c2 = c ? c[2] : 0;
      for (i = 0; i < n; i += 3) {
        x = (a[i] - c0) * 100000; v = (x >= 0 ? x + 0.5 : x - 0.5) | 0; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v, -2048144789) ^ (h2 >>> 13);
        x = (a[i + 1] - c1) * 100000; v = (x >= 0 ? x + 0.5 : x - 0.5) | 0; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v, -2048144789) ^ (h2 >>> 13);
        x = (a[i + 2] - c2) * 100000; v = (x >= 0 ? x + 0.5 : x - 0.5) | 0; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v, -2048144789) ^ (h2 >>> 13);
      }
      a = ml.nrm; n = a.length;
      for (i = 0; i < n; i++) { x = a[i] * 1000; v = (x >= 0 ? x + 0.5 : x - 0.5) | 0; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v, -2048144789) ^ (h2 >>> 13); }
      a = ml.idx; n = a.length;
      for (i = 0; i < n; i++) { v = a[i] | 0; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v, -2048144789) ^ (h2 >>> 13); }
      return ml.pos.length + ":" + ml.idx.length + ":" + (h1 >>> 0).toString(36) + ":" + (h2 >>> 0).toString(36);
    },
    _malhaG: function (THREE, ml, mat) {
      var C = this._geoCache && this._geoCache.THREE === THREE ? this._geoCache : null, chave = null;
      var n = ml.pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], i, k;
      for (i = 0; i < n; i++) for (k = 0; k < 3; k++) { var v = ml.pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      var c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      if (C && ml.pos && ml.nrm && ml.idx) {
        chave = this._chaveMalha(ml, c);
        var e = C.m.get(chave);
        if (e) {
          e.ger = C.ger; C.reusos++;
          var m0 = new THREE.Mesh(e.g, mat); m0.position.set(c[0], c[1], c[2]);   /* a geometria é a da forma; o lugar é desta peça */
          if (mat && mat.metalness > 0.5) m0.userData.famPremium = true;
          return m0;
        }
      }
      var pos = new Float32Array(n * 3);
      for (i = 0; i < n; i++) for (k = 0; k < 3; k++) pos[i * 3 + k] = ml.pos[i * 3 + k] - c[k];
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(ml.nrm), 3));
      g.setIndex(ml.idx);
      g.computeBoundingBox(); g.computeBoundingSphere();
      if (chave) { g.userData.instGeoCache = true; C.m.set(chave, { g: g, c: c, ger: C.ger }); C.novas++; }
      var m = new THREE.Mesh(g, mat); m.position.set(c[0], c[1], c[2]);
      /* peça METÁLICA (latão, cromado, cobre): o modelo mesclado só leva cor por vértice e apagaria o reflexo —
         marca para a tela desenhá-la por si (a mesma marca das louças/metais, js/bim.js _desenhaPorSi) */
      if (mat && mat.metalness > 0.5) m.userData.famPremium = true;
      return m;
    },
    malhas: function (st, famAval, THREE) {
      /* PROJETO INTELIGENTE (js/hidkitui.js): o kit do aparelho que entrou, mudou ou saiu — roda FORA do replay (setTimeout) */
      try { if (global.HidKitUI && global.HidKitUI.aoReconstruir) global.HidKitUI.aoReconstruir(st, famAval); } catch (eKit) {}
      try { if (global.HidPiscinaUI && global.HidPiscinaUI.aoReconstruir) global.HidPiscinaUI.aoReconstruir(st, famAval); } catch (ePisc) {}   /* PISCINA: casa de máquinas arrastada refaz os tubos (js/hidpiscinaui.js) */
      if (!this._previaHidro()) return this._malhasMaster(st, famAval, THREE);   /* P8: sem a prévia hidro, o desenho do master */
      var I = BI(), self = this, out = []; if (!I || !THREE || !st || !st.instalacoes) return out;
      try { this._geoGeracao(THREE); } catch (eG) { this._geoCache = null; }   /* FLUIDEZ: cache de geometria */
      var R = I.rede(st, famAval), Y = new THREE.Vector3(0, 1, 0), G = global.HidGeo;
      var discDe = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "eletrica" : (g === "ar" ? "climatizacao" : "hidraulica"); };
      var ifcTubo = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERSEGMENT" : (g === "ar" ? "IFCDUCTSEGMENT" : "IFCPIPESEGMENT"); };
      var ifcCx = function (s) { var g = I.SISTEMAS[s].grupo; return g === "eletrica" || g === "bandeja" ? "IFCCABLECARRIERFITTING" : (g === "ar" ? "IFCDUCTFITTING" : "IFCPIPEFITTING"); };   /* P12: eletrocalha */
      /* NÍVEL DE DETALHE da vista (js/biminstnivel.js): Baixo = linha única + símbolos; Médio = linha única + peças
         sólidas menos detalhadas; Alto = tudo em 3D. ⚠ Só a REPRESENTAÇÃO muda: id, nome, SINAPI e qto de cada
         elemento saem iguais nos três (o orçamento do modelo não pode depender do nível da vista). */
      var NV = global.BimInstNivel, nivel = NV && this.nivelCena ? NV.norm(this.nivelCena(), "alto") : "alto";
      var unif = NV && nivel !== "alto" ? NV.unifilar(R, nivel, { escala: NV.ESCALA_PADRAO }) : null, segsDe = {};
      if (unif) unif.segs.forEach(function (sg) { (segsDe[sg.id] = segsDe[sg.id] || []).push(sg); });
      this._nivelFeito = nivel; this._segsDe = segsDe;
      /* LOD simples: modelo grande (muitas peças) desenha com menos segmentos — o mesmo para todos, sem trocar na hora;
         o Médio é sempre o "longe" (menos lados) */
      this._lod = nivel === "medio" || (R.trechos.length + R.conexoes.length) > 700 ? "longe" : "perto";
      var lod = this._lod, porId = {}, recuos = {}, cxGeo = {}, bolsasT = {}, deslocsT = {};
      var baixo = nivel === "baixo";
      var papel = function (ms, p) { (ms || []).forEach(function (mm) { mm.userData.instPapel = p; mm.userData.instNivel = nivel; }); return ms; };
      R.trechos.forEach(function (t) { porId[t.id] = t; });
      /* 1) CONEXÕES por nó (joelho + redução no mesmo ponto = um joelho e uma bucha), com os eixos reais dos tubos.
         Cada uma diz quanto o tubo ENCURTA para entrar na bolsa dela (recuos[trecho:ponta]). */
      if (G && !baixo) {   /* no Baixo a conexão é símbolo: a forma (e o recuo do tubo na bolsa) não se calcula */
        var nos = {}, ordem = [];
        R.conexoes.forEach(function (c) { var k = c.x + "," + c.y + "," + c.z + "|" + c.sistema; if (!nos[k]) { nos[k] = []; ordem.push(k); } nos[k].push(c); });
        ordem.forEach(function (k) {
          var lista = nos[k], M = I.MATERIAIS[lista[0].material] || {}, r = null;
          if (M.secao) return;
          try { r = G.no(lista, porId, { lod: lod, tol: I.TOL }); } catch (eNo) { r = null; }
          if (!r) return;
          r.pecas.forEach(function (pc) { cxGeo[pc.id] = pc; });
          Object.keys(r.recuos).forEach(function (kk) { recuos[kk] = Math.max(recuos[kk] || 0, r.recuos[kk]); });
          Object.keys(r.bolsas || {}).forEach(function (kk) { bolsasT[kk] = r.bolsas[kk]; });
          Object.keys(r.deslocs || {}).forEach(function (kk) { deslocsT[kk] = r.deslocs[kk]; });   /* redução excêntrica de esgoto: o tubo menor desce até a bolsa dela */   /* RODADA 2: o tubo de jusante recebe a PONTA do joelho/tê/junção de esgoto na bolsa dele */
        });
      }
      /* 2) PEÇAS (ralo, caixa sifonada): bocas na direção e na altura dos tubos ligados; o tubo para no fundo da bolsa */
      var pecaGeo = {};
      if (G && !baixo) R.pecas.forEach(function (k) {
        var P = I.PECAS[k.peca]; if (!P || P.sistemas[0] === "eletrica" || !/^(ralo_|caixa_sifonada|caixa_inspecao|terminal_ventilacao)/.test(k.peca)) return;
        var lig = R.ligacoes.filter(function (l) { return l.tipo === "peca" && l.alvo === k.id; }).map(function (l) {
          var t = porId[l.trecho]; if (!t) return null;
          var d1 = Math.hypot(t.p1.x - l.x, t.p1.y - l.y, t.p1.z - l.z), d2 = Math.hypot(t.p2.x - l.x, t.p2.y - l.y, t.p2.z - l.z), lado = d1 <= d2 ? 0 : 1;
          var e = lado ? t.p2 : t.p1, f = lado ? t.p1 : t.p2;
          return { trecho: t.id, lado: lado, dn: t.dn, ponto: e, dir: [f.x - e.x, f.y - e.y, f.z - e.z], saida: f.y < e.y - 1e-4 && Math.abs(f.y - e.y) < Math.hypot(f.x - e.x, f.z - e.z) };
        }).filter(Boolean);
        var g = null; try { g = k.peca === "caixa_inspecao" ? (global.HidCI ? global.HidCI.geo(k, lig, { lod: lod }) : null) : k.peca === "terminal_ventilacao" ? (global.HidVentGeo ? global.HidVentGeo.terminal(k, { lod: lod }) : null) : G.peca(k, lig, { lod: lod }); } catch (ePc) { g = null; }   /* a caixa de inspeção = o produto da ficha (js/hidcigeo.js) */
        if (!g) return;
        pecaGeo[k.id] = g;
        g.portas.forEach(function (p) {
          var t = porId[p.trecho]; if (!t) return;
          var E = p.lado ? t.p2 : t.p1, F = p.lado ? t.p1 : t.p2, u = [F.x - E.x, F.y - E.y, F.z - E.z], L = Math.hypot(u[0], u[1], u[2]); if (!(L > 0)) return;
          u = [u[0] / L, u[1] / L, u[2] / L];
          var kk = null;
          if (p.raio != null) {   /* |(E + u·k − C) no plano| = raio */
            var ex = E.x - p.centro[0], ez = E.z - p.centro[2], a = u[0] * u[0] + u[2] * u[2], b = ex * u[0] + ez * u[2], c = ex * ex + ez * ez - p.raio * p.raio;
            if (a > 1e-9 && b * b - a * c >= 0) kk = (-b + Math.sqrt(b * b - a * c)) / a;
          } else if (p.recuoAbs && Math.abs(u[1]) > 1e-6) kk = (p.recuoAbs[1] - E.y) / u[1];
          if (kk != null && kk > 0 && kk < L - 0.01) { var key = p.trecho + ":" + p.lado; recuos[key] = Math.max(recuos[key] || 0, kk); }
        });
      });
      /* PONTO DE ÁGUA: o tubo de PVC soldável de água que chega num aparelho termina no JOELHO 90° COM BUCHA DE LATÃO
         (o azul), com a rosca virada para fora da parede (para o aparelho). O vértice fica no ponto de ligação; a
         boca de rosca sai na direção do aparelho. ⚠ É peça de acabamento da ligação: o biminst ainda não a deduz no
         quantitativo — o nome diz isso. */
      var pontosAgua = [];
      if (G && !baixo) R.ligacoes.forEach(function (l) {
        if (l.tipo !== "aparelho") return;
        var t = porId[l.trecho]; if (!t || t.material !== "pvc_soldavel" || !/^agua_/.test(t.sistema)) return;
        var d1 = Math.hypot(t.p1.x - l.x, t.p1.y - l.y, t.p1.z - l.z), d2 = Math.hypot(t.p2.x - l.x, t.p2.y - l.y, t.p2.z - l.z), lado = d1 <= d2 ? 0 : 1;
        var E = lado ? t.p2 : t.p1, F = lado ? t.p1 : t.p2, u = [F.x - E.x, F.y - E.y, F.z - E.z], Lu = Math.hypot(u[0], u[1], u[2]); if (!(Lu > 0.05)) return;
        u = [u[0] / Lu, u[1] / Lu, u[2] / Lu];
        var k = R.conectores.filter(function (q) { return q.id === l.alvo; })[0], fr = null;
        if (k && k.parede) fr = [-k.parede.x, 0, -k.parede.z];
        else { var fi = (st.familias || []).filter(function (f) { return String(f.id) === String(l.famInst); })[0]; if (fi) { var ry = num(fi.rotY, 0); fr = [Math.sin(ry), 0, Math.cos(ry)]; } }   /* Z local da família = para fora da parede (convenção do js/familia.js) */
        if (!fr) return;
        var dt = fr[0] * u[0] + fr[1] * u[1] + fr[2] * u[2]; fr = [fr[0] - u[0] * dt, fr[1] - u[1] * dt, fr[2] - u[2] * dt];
        var Lf = Math.hypot(fr[0], fr[1], fr[2]); if (!(Lf > 1e-3)) return; fr = [fr[0] / Lf, fr[1] / Lf, fr[2] / Lf];
        var cj = G.cotasConexao("pvc_soldavel", "luva", t.dn), reg = (((global.HidGeoDados || {}).conexoes || {}).pvc_soldavel || {}).joelho_bucha || {}, kk = Object.keys(reg).filter(function (x) { return x.split("x")[0] === String(t.dn); })[0];
        var z = kk ? reg[kk].z : G.PROP.z90(cj.de, cj.pb), Fc = [E.x + u[0] * z / 1000, E.y + u[1] * z / 1000, E.z + u[2] * z / 1000];
        var gj = null; try { gj = G.pecaSimples("joelho_bucha", "pvc_soldavel", t.dn, Fc, [-u[0], -u[1], -u[2]], { saida: fr, lod: lod }); } catch (eJ) { gj = null; }
        if (!gj) return;
        var key = t.id + ":" + lado; recuos[key] = Math.max(recuos[key] || 0, (z - cj.pb) / 1000);
        pontosAgua.push({ id: "pa:" + l.alvo, g: gj, sistema: t.sistema, rot: kk ? "Joelho 90° soldável com bucha de latão " + kk.replace("x", " × ") + "\"" : "Joelho 90° soldável com bucha de latão DN " + t.dn + " (cota a conferir)" });
      });
      var livres = {};
      R.pontasLivres.forEach(function (p) { var t = porId[p.trecho]; if (!t) return; livres[p.trecho + ":" + (Math.hypot(t.p1.x - p.x, t.p1.y - p.y, t.p1.z - p.z) < 0.03 ? 0 : 1)] = true; });
      /* 3) TUBOS: DE e espessura reais, encurtados na bolsa, ponta chanfrada onde fica à vista, luva/bolsa a cada barra */
      R.trechos.forEach(function (t) {
        var a = new THREE.Vector3(t.p1.x, t.p1.y, t.p1.z), b = new THREE.Vector3(t.p2.x, t.p2.y, t.p2.z), u = b.clone().sub(a), L = u.length(); if (!(L > 0)) return;
        u.normalize();
        var M = I.MATERIAIS[t.material], m, corV = self._corVerif && self._corVerif[t.id], extra = [];
        var repT = unif ? NV.representacao({ classe: M.secao === "retangular" ? "duto" : "tubo" }, nivel) : null;
        if (repT && repT.modo === "linha") {   /* NÍVEL: linha única na pena e cor do sistema (a da verificação vence) */
          var lm = self._linhaMalhas(THREE, t.id, corV);
          m = lm[0] || null; extra = lm.slice(1);
        } else if (M.secao === "retangular") {
          m = new THREE.Mesh(new THREE.BoxGeometry(t.larg, t.alt, L), G ? self._matPeca(THREE, t.material, t.sistema, "corpo", corV) : self._mat(THREE, I.SISTEMAS[t.sistema].cor));
          var w = Math.abs(u.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(Y, u).normalize(), v = new THREE.Vector3().crossVectors(u, w);
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, v, u));
          m.position.copy(a).add(b).multiplyScalar(0.5);
        } else if (G) {
          var tg = G.tubo(t, { recuo1: recuos[t.id + ":0"] || 0, recuo2: recuos[t.id + ":1"] || 0, livre1: !!livres[t.id + ":0"], livre2: !!livres[t.id + ":1"], bolsaAtras1: bolsasT[t.id + ":0"], bolsaAtras2: bolsasT[t.id + ":1"], desloc1: deslocsT[t.id + ":0"], desloc2: deslocsT[t.id + ":1"], lod: lod });
          m = self._malhaG(THREE, tg.partes[0].malha, self._matPeca(THREE, t.material, t.sistema, "corpo", corV));   /* HIDROSSANITÁRIO: cor por verificação (ok / não verificado / reprovado) */
          tg.partes.slice(1).forEach(function (pt) { extra.push(self._malhaG(THREE, pt.malha, self._matPeca(THREE, t.material, t.sistema, pt.papel, null))); });   /* anel de borracha das bolsas de emenda */
        } else {
          var r = Math.max(t.dn / 2000, 0.008);
          m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 14, 1, false), self._mat(THREE, corV || I.SISTEMAS[t.sistema].cor));
          m.quaternion.setFromUnitVectors(Y, u);
          m.position.copy(a).add(b).multiplyScalar(0.5);
        }
        var sp = I.sinapiDe({ peca: "tubo", sistema: t.sistema, material: t.material, aplicacao: t.aplicacao, dn: t.material === "duto_chapa" ? "-" : t.dn, pn: t.pn, classe: t.classe, iso: t.iso, bitola: t.bitola, larg: t.larg, alt: t.alt });
        out.push({ id: t.id, ifc: ifcTubo(t.sistema), malhas: papel((m ? [m] : []).concat(extra), "tubo"), disciplina: discDe(t.sistema), codigo: sp.codigo || null,
                   nome: I.SISTEMAS[t.sistema].nome + " · " + (M.secao === "retangular" ? Math.round(t.larg * 100) + "×" + Math.round(t.alt * 100) + " cm" : "DN " + t.dn) + " · " + M.nome + " (" + t.id + ")",
                   qto: { comprimento: t.comprimento, contagem: 1 } });
      });
      R.conexoes.forEach(function (c) {
        var gx = cxGeo[c.id], ms;
        if (baixo) ms = self._linhaMalhas(THREE, c.id, null);   /* NÍVEL Baixo: o símbolo unifilar (joelho = só o vértice: nenhuma malha) */
        else if (gx) ms = gx.partes.map(function (pt) { return self._malhaG(THREE, pt.malha, self._matPeca(THREE, c.material, c.sistema, pt.papel, null)); });
        else {   /* duto, eletrocalha ou material sem família de junta: um bloco do tamanho da seção (nunca mais a bolota) */
          var porT = (c.ramos || []).map(function (id) { return porId[id]; }).filter(Boolean)[0], s0 = porT && porT.larg ? Math.max(porT.larg, porT.alt) * 1.08 : Math.max((c.dn || 40) / 1000, 0.016) * 1.3;
          var mb = new THREE.Mesh(new THREE.BoxGeometry(s0, porT && porT.alt ? porT.alt * 1.08 : s0, s0), G ? self._matPeca(THREE, c.material, c.sistema, "corpo", null) : self._mat(THREE, I.SISTEMAS[c.sistema].cor));
          mb.position.set(c.x, c.y, c.z); ms = [mb];
        }
        out.push({ id: c.id, ifc: ifcCx(c.sistema), malhas: papel(ms, "conexao"), disciplina: discDe(c.sistema), nome: c.nome + " DN " + c.dn + (c.dn2 ? " × " + c.dn2 : "") + " (conexão automática" + (gx && gx.aConferir ? "; forma com cota a conferir" : "") + ")", qto: { contagem: 1 }, derivada: true });
      });
      R.pecas.forEach(function (k) {
        var P = I.PECAS[k.peca], cor = P.sistemas[0] === "eletrica" ? I.COR_CAIXA_ELETRICA : I.SISTEMAS[k.sistema].cor, ms, gp = pecaGeo[k.id];
        if (baixo) ms = self._linhaMalhas(THREE, k.id, null);   /* NÍVEL Baixo: o contorno */
        else if (gp) {
          /* pendências finais (18/10/2026): a caixa de 0,60 m é de ALVENARIA ou de CONCRETO (a tampa de concreto ou o tampão de ferro) */
          var matCx = gp.tipoCaixa === "alvenaria" ? "alvenaria" : (gp.tipoCaixa === "premoldado" ? "concreto" : "pvc_esgoto");
          ms = gp.partes.map(function (pt) { return self._malhaG(THREE, pt.malha, self._matPeca(THREE, matCx, k.sistema, pt.papel === "puxador" ? "ferro" : (pt.papel === "grelha" || pt.papel === "ferro" || pt.papel === "tampaConcreto" ? pt.papel : "corpo"), null, true)); });
        }
        else {
          var m;
          if (P.forma === "caixa") { m = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.hh, P.d), self._mat(THREE, cor)); m.position.set(k.x, k.y, k.z); m.rotation.y = k.rotY || 0; }
          else { var hh = P.profVariavel && k.prof ? k.prof : P.h; m = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, hh, 18), self._mat(THREE, cor)); m.position.set(k.x, k.y - hh / 2, k.z); }   /* caixa de inspeção: o corpo até o fundo (prof da instância) */
          ms = [m];
        }
        out.push({ id: k.id, ifc: P.ifc, malhas: papel(ms, "peca"), disciplina: P.sistemas[0] === "eletrica" ? "eletrica" : "hidraulica", nome: P.nome + (k.dn && k.dn !== "-" ? " " + k.dn.replace(/x/g, "×") : "") + " (" + k.id + ")", qto: { contagem: 1 } });
        /* a caixa de inspeção do produto (js/hidcigeo.js): cada PROLONGADOR é um elemento — entra no quantitativo com o código e o corte */
        if (gp && gp.extras && !baixo) gp.extras.forEach(function (x) { out.push({ id: k.id + "-" + x.suf, ifc: "IFCPIPEFITTING", malhas: papel([self._malhaG(THREE, x.malha, self._matPeca(THREE, "pvc_esgoto", k.sistema, "corpo", null, true))], "peca"), disciplina: "hidraulica", nome: x.nome, qto: { contagem: 1, comprimento: x.comprimento_mm / 1000 }, derivada: true }); });
      });
      pontosAgua.forEach(function (pa) {
        out.push({ id: pa.id, ifc: "IFCPIPEFITTING", malhas: papel(pa.g.partes.map(function (pt) { return self._malhaG(THREE, pt.malha, self._matPeca(THREE, "pvc_soldavel", pa.sistema, pt.papel, null)); }), "pontoAgua"), disciplina: "hidraulica",
                   nome: pa.rot + " — ponto de água (acabamento da ligação; ainda fora do quantitativo)", qto: { contagem: 1 }, derivada: true });
      });
      /* o PONTO DE LIGAÇÃO dos aparelhos: um anel discreto, só enquanto uma ferramenta de traçado está armada (é o
         alvo do clique); fora dela não poluía a vista com bolinhas. Faz parte da família (o clique seleciona a louça). */
      if (this.cfg) R.conectores.forEach(function (k) {
        var m;
        if (G) m = self._malhaG(THREE, G.marcador([k.x, k.y, k.z], [0, 1, 0], Math.max(0.006, (k.dn || 20) / 2600), { lod: lod }).partes[0].malha, self._matAp(THREE, G.aparencia(null, null, "ligacao"), I.SISTEMAS[k.sistema].cor));
        else { m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 6), self._mat(THREE, I.SISTEMAS[k.sistema].cor)); m.position.set(k.x, k.y, k.z); }
        m.userData.marcador = true;   /* RENDER: marcador de tela, não é peça (js/bimrender.js pula) */
        out.push({ id: k.famInst, malhas: [m], marcador: true });
      });
      /* P12: acessórios (o corpo da família, no eixo do tubo) e as desconexões marcadas */
      try { this.malhasP12(R, famAval, THREE).forEach(function (x) { out.push(x); }); } catch (eP12) {}
      this._ultimaRede = R;
      return out;
    },

    /* ------------------------------------------------ PROPRIEDADES do trecho/peça selecionado */
    /* FLUIDEZ (17/10/2026): o trecho/peça do kit, do traçado automático, da rede e de uma cena colada tem id livre
       ("kbac-vd-ramal1", "rM3") — o clique nele caía na paleta genérica ("Tubulação", sem DN nem SINAPI). O id vale
       pelo ESTADO: trechos, peças e acessórios do editor e as conexões deduzidas da última rede (um mapa por estado). */
    ehInst: function (uid) {
      var s = String(uid || "");
      if (/^edit:([tk]|ac)\d+$/.test(s) || /^edit:cx\d/.test(s)) return true;   /* P12: ac = acessório */
      return s.indexOf("edit:") === 0 && !!this._idsInst()[s.slice(5)];
    },
    _idsInst: function () {
      var b = B(), est = null; try { est = b && b.editarEstado ? b.editarEstado() : null; } catch (e) { est = null; }
      var st = est && est.estado, R = this._ultimaRede || null; if (!st) return {};
      var c = this._idsCache; if (c && c.st === st && c.R === R) return c.m;
      var m = {}, i = st.instalacoes || {};
      (i.trechos || []).forEach(function (t) { m[t.id] = 1; }); (i.pecas || []).forEach(function (k) { m[k.id] = 1; }); (i.acessorios || []).forEach(function (a) { m[a.id] = 1; });
      if (R && R.conexoes) R.conexoes.forEach(function (x) { m[x.id] = 1; });
      this._idsCache = { st: st, R: R, m: m };
      return m;
    },
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
        /* QUALIDADE VISUAL 2: a ponta que segue fora do modelo (prumada para outro pavimento, saída para a rede) não é desconexão */
        var ondeP = function (q, o2) { return t.vertical ? (q.y > o2.y ? "de cima" : "de baixo") : (q === t.p1 ? "inicial" : "final"); };
        ps.push({ id: "it:continua", rotulo: "Continua fora do modelo", tipo: "lista", valor: t.continua || "", opcoes: [{ id: "", rotulo: "Não (ponta livre = desconexão)" }, { id: "p1", rotulo: "Na ponta " + ondeP(t.p1, t.p2) }, { id: "p2", rotulo: "Na ponta " + ondeP(t.p2, t.p1) }, { id: "ambos", rotulo: "Nas duas pontas" }] });
        sec.push({ nome: "Identidade", params: ps });
        sec.push({ nome: "Geometria", params: [ro("it:L", "Comprimento (eixo)", fmt(t.comprimento, 3) + " m"), ro("it:Lh", "Em planta", fmt(t.comprimentoH, 3) + " m"),
          ro("it:dy", "Desnível", fmt(t.desnivel, 3) + " m"), ro("it:i", "Inclinação", t.inclinacao == null ? "vertical" : fmt(t.inclinacao, 2) + "%"),
          ro("it:y1", "Cota do início", fmt(t.p1.y, 3) + " m"), ro("it:y2", "Cota do fim (saída)", fmt(t.p2.y, 3) + " m")] });
      } else if (k) {
        var P = I.PECAS[k.peca];
        titulo = P.nome;
        sp = I.sinapiDe({ peca: k.peca, sistema: k.sistema, material: k.material, aplicacao: k.aplicacao, dn: k.dn });
        var pk = [ro("ik:sis", "Sistema", I.SISTEMAS[k.sistema].nome)];
        /* PENDÊNCIAS FINAIS (18/10/2026): a caixa de inspeção — o TIPO (alvenaria/pré-moldada 0,60 m ou o dispositivo de PVC Ø 300) e
           a TAMPA; a composição SINAPI sai da profundidade (o tamanho segue o tipo) */
        if (P.tipos) {
          var itCx = I.itemPeca(k);
          titulo = itCx.nome || P.nome;
          pk.push({ id: "ik:tipoCaixa", rotulo: "Tipo da caixa", tipo: "lista", valor: k.tipoCaixa, opcoes: Object.keys(P.tipos).map(function (x) { return { id: x, rotulo: P.tipos[x] }; }) });
          if (k.tipoCaixa !== "pvc300") pk.push({ id: "ik:tampa", rotulo: "Tampa", tipo: "lista", valor: k.tampa, opcoes: Object.keys(P.tampas).map(function (x) { return { id: x, rotulo: P.tampas[x] }; }) });
          pk.push(ro("ik:prof", "Profundidade (tampa → fundo)", fmt(k.prof, 2) + " m"));
          if (itCx.composicoes) sp = itCx.composicoes.length > 1 ? { status: "ok", codigo: itCx.composicoes.map(function (c) { return c.codigo + (c.qtd != null && c.unidadeQto === "m" ? " (" + fmt(c.qtd, 2) + " m)" : ""); }).join(" + "), unidade: "UN", descricao: itCx.composicoes.map(function (c) { return c.descricao; }).join(" + "), alternativas: 0 } : itCx.composicoes[0];
          else { var rmCx = I.refMercado(itCx); sp = { status: "pendente", motivo: itCx.semTabela + (rmCx ? " — " + rmCx.texto + ": R$ " + fmt(rmCx.valor, 2) : "") }; }
        }
        else if (P.dns.length > 1) pk.push({ id: "ik:dn", rotulo: "Tamanho (mm)", tipo: "lista", valor: k.dn, opcoes: P.dns.map(function (d) { return { id: d, rotulo: d.replace(/x/g, " × ") }; }) });
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
      /* QUALIDADE VISUAL 1 (juntas): a junta onde a conexão de esgoto entrega PONTA — luva (padrão), bolsa do
         próprio tubo ou luva invertida (contra o fluxo, com o motivo registrado) */
      var jtP = this.juntaDoUid(id);
      if (jtP) sec.push(this.secaoJunta(jtP));
      sec.push({ nome: "Orçamento (SINAPI pelo mapa)", params: sp && sp.status === "ok"
        ? [ro("io:cod", "Composição", sp.codigo + " (" + sp.unidade + ")"), ro("io:desc", "Descrição", sp.descricao, sp.descricao), ro("io:alt", "Alternativas na base", String(sp.alternativas || 0), "O desempate é declarado em js/biminst.js (PN/classe, luva antes da bucha, menor código).")]
        : [ro("io:pend", "Situação", "pendente", sp ? sp.motivo : "")] });
      var av = t ? t.avisos : [];
      if (t) sec = sec.concat(this.secoesTrechoP12(t));   /* P12: sistema, acessório neste tubo, paralelos */
      /* FLUIDEZ — PROPRIEDADES COMPLETAS (17/10/2026): tipo, hidráulica do cálculo, obra (fase, comentários) e a aba Tipo */
      var alvoObra = t || k;
      if (t) { var sT = this.secaoTipoTrecho(t, inst); if (sT) sec.unshift(sT); }
      if (t || k) { var sH = this.secaoHidraulica(id); if (sH) sec.push(sH); }
      if (alvoObra) sec.push(this.secaoObra(alvoObra, st));
      return {
        daPeca: true, uid: uid, semEditarTipo: true, icone: "link", titulo: titulo, secoes: sec,
        motivoLeitura: av.length ? av.join(" ") : "",
        onMudar: function (pid, valor) {
          var o = { op: "instAlterar", id: id };
          if (pid === "it:material") { o.material = valor; var M2 = I.MATERIAIS[valor]; if (M2.dns.length && t && M2.dns.indexOf(t.dn) < 0) o.dn = M2.dn; }
          else if (pid === "it:dn") o.dn = num(valor, t ? t.dn : 0);
          else if (pid === "it:aplicacao") o.aplicacao = String(valor);
          else if (pid === "it:continua") o.continua = String(valor);
          else if (pid === "ik:dn") o.dn = String(valor);
          else if (pid === "ik:material") o.material = String(valor);
          else if (pid === "ik:tipoCaixa") o.tipoCaixa = String(valor);
          else if (pid === "ik:tampa") o.tampa = String(valor);
          else if (pid === "iob:fase") o.faseCriada = String(valor);
          else if (pid === "iob:demolida") o.faseDemolida = String(valor) === "Nenhum" ? "" : String(valor);
          else if (pid === "iob:coment") o.comentarios = String(valor == null ? "" : valor).slice(0, 300);
          else if (pid === "itp:material" && t) { self.mudarTipo(t, String(valor)); return self.props(uid); }
          else if (String(pid).indexOf("p12:") === 0) { self.mudarP12(uid, pid, valor); return self.props(uid); }   /* P12 */
          else if (pid === "ij:junta" || pid === "ij:motivo") { if (jtP) self.mudarJunta(jtP, pid === "ij:junta" ? String(valor) : null, pid === "ij:motivo" ? String(valor) : null); return self.props(uid); }
          else return self.props(uid);
          if (b.instOp) b.instOp(o);
          return self.props(uid);
        }
      };
    },

    /* ------------------------------------------------ FLUIDEZ — seções novas de Propriedades (17/10/2026)
     * Aba TIPO: o tipo do tubo (catálogo de tipos, js/biminsttipos.js) e o material DO TIPO — mudar aqui troca TODAS as
     * instâncias deste tipo (mesmo sistema, material e PN), num lote (um Ctrl+Z), com o aviso de quantas. */
    _instanciasDoTipo: function (t, inst) {
      return ((inst && inst.trechos) || []).filter(function (x) { return x.sistema === t.sistema && x.material === t.material && String(x.pn || "") === String(t.pn || ""); });
    },
    secaoTipoTrecho: function (t, inst) {
      var I = BI(), T = global.BimInstTipos, S = I.SISTEMAS[t.sistema], tp = null;
      if (!S) return null;
      try { tp = T && T.tipoDoTrecho ? T.tipoDoTrecho(t) : null; } catch (e) { tp = null; }
      var n = this._instanciasDoTipo(t, inst).length, ro = function (pid, rot, v, m) { return { id: pid, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: m }; };
      return { nome: "Tipo (afeta as " + n + " instância" + (n === 1 ? "" : "s") + " deste tipo)", params: [
        ro("itp:fam", "Família", "Tubulação — " + S.nome),
        ro("itp:nome", "Tipo", tp ? tp.nome : (I.MATERIAIS[t.material] || {}).nome),
        ro("itp:fab", "Fabricante e código", tp && (tp.fabricante || tp.codigo) ? [tp.fabricante, tp.codigo].filter(Boolean).join(" · ") : "genérico (o tipo não tem fabricante)", "O tipo do OrçaPRO não leva nome de produto de terceiro; o fabricante entra pelo catálogo."),
        { id: "itp:material", rotulo: "Material do tipo", tipo: "lista", valor: t.material, opcoes: S.materiais.map(function (m) { return { id: m, rotulo: I.MATERIAIS[m].nome }; }),
          title: "Troca o material de TODAS as " + n + " instâncias deste tipo (um Ctrl+Z desfaz)" },
        ro("itp:aviso", "Atenção", "mudar o tipo afeta as " + n + " instância" + (n === 1 ? "" : "s"), "Para mudar só esta peça, use Material na seção Identidade.")
      ] };
    },
    mudarTipo: function (t, material) {
      var b = B(), I = BI(); if (!b || !I || !I.MATERIAIS[material]) return false;
      var est = b.editarEstado(), inst = est && est.estado ? est.estado.instalacoes : null; if (!inst) return false;
      var M2 = I.MATERIAIS[material], ops = this._instanciasDoTipo(t, inst).map(function (x) {
        var o = { op: "instAlterar", id: x.id, material: material };
        if (M2.dns && M2.dns.length && M2.dns.indexOf(x.dn) < 0) o.dn = M2.dns.filter(function (d) { return d >= x.dn; })[0] || M2.dn;   /* nunca abaixo */
        return o;
      });
      if (!ops.length) return false;
      if (ops.length === 1) b.instOp(ops[0]);
      else if (b.editarLote) b.editarLote({ op: "lote", id: "tipo-" + Date.now().toString(36), origem: "propriedades", pedido: "Tipo do tubo: " + M2.nome + " em " + ops.length + " instâncias", ops: ops });
      else ops.forEach(function (o) { b.instOp(o); });
      status("Tipo trocado em " + ops.length + " instância(s) (um Ctrl+Z desfaz).");
      return true;
    },
    /* HIDRÁULICA: o que o Dimensionar calculou para este trecho (água fria/quente: vazão, velocidade, perda; esgoto:
       UHC, declividade e DN calculado). Sem cálculo, diz como obter. Nada é estimado aqui: só o que o motor gravou. */
    secaoHidraulica: function (id) {
      var H = global.HidCalcUI, E = H && H.estado, R = E && E.resultado;
      var ro = function (pid, rot, v, m) { return { id: pid, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: m }; };
      if (!H) return null;
      if (!R || !R.sistemas) return { nome: "Hidráulica (do Dimensionar)", params: [ro("ih:sem", "Situação", "sem cálculo", "Painel Instalações › Dimensionar: vazão, velocidade, perda e UHC aparecem aqui.")] };
      /* o trecho pode vir em PARTES (dividido nas derivações): vale a parte que governa — a de maior vazão / maior UHC */
      var achar = function (sis, campo) { var S = R.sistemas[sis], l = S && S.trechos ? S.trechos.filter(function (x) { return String(x.id) === String(id); }) : [];
        return l.length ? l.reduce(function (a, b) { return (+b[campo] || 0) > (+a[campo] || 0) ? b : a; }) : null; };
      var af = achar("agua_fria", "vazao_ls") || achar("agua_quente", "vazao_ls"), es = achar("esgoto", "uhc"), ps = [];
      var f = function (v, c) { return v == null || !isFinite(v) ? null : fmt(v, c); };
      var dnTx = function (x) { return x.dn != null ? "DN " + x.dn + (x.dnModelo != null && x.dnModelo !== x.dn ? " (modelo: DN " + x.dnModelo + ")" : "") : null; };
      if (af) {
        ps.push(ro("ih:q", "Vazão", f(af.vazao_ls, 3) != null ? f(af.vazao_ls, 3) + " L/s" : null), ro("ih:v", "Velocidade", f(af.velocidade_ms, 2) != null ? f(af.velocidade_ms, 2) + " m/s" : null),
          ro("ih:hf", "Perda de carga", f(af.perda_m, 3) != null ? f(af.perda_m, 3) + " m" : null), ro("ih:pj", "Pressão a jusante", f(af.pressaoJusante_kpa, 1) != null ? f(af.pressaoJusante_kpa, 1) + " kPa" : null),
          ro("ih:dn", "DN calculado", dnTx(af)), ro("ih:st", "Situação", af.status));
      } else if (es) {
        ps.push(ro("ih:uhc", "UHC", es.uhc != null ? String(es.uhc) : null), ro("ih:i", "Declividade", es.declividade_pct == null ? "vertical" : f(es.declividade_pct, 2) + "%" + (es.declividadeMin_pct != null ? " (mín. " + f(es.declividadeMin_pct, 1) + "%)" : "")),
          ro("ih:dn", "DN calculado", dnTx(es)), ro("ih:st", "Situação", es.status));
      } else ps.push(ro("ih:fora", "Situação", "fora do cálculo", "Este trecho não entrou no último Dimensionar (sistema sem cálculo ou desligado da rede)."));
      return { nome: "Hidráulica (do Dimensionar)", params: ps };
    },
    /* FLUIDEZ — A LOUÇA/EQUIPAMENTO HIDRÁULICO (rodada 3, 17/10/2026): o que a FICHA DA PEÇA diz (js/hidpecas.js: UHC,
       DN mínimo do ramal de descarga, vazão e peso de água, com a fonte) e, depois do Dimensionar, o UHC que o cálculo
       usou neste ponto. Família sem ficha hidráulica (porta, janela…): nada. Nada estimado aqui. */
    secoesFamilia: function (fid) {
      var HP = global.HidPecas, b = B(); if (!HP || !HP.familia || !b || !b.editarEstado) return [];
      var est = b.editarEstado(), fi = est && est.estado ? (est.estado.familias || []).filter(function (f) { return f.id === fid; })[0] : null; if (!fi) return [];
      var fc = null; try { fc = HP.familia(fi.famId); } catch (e) { fc = null; }
      if (!fc || !fc.hidraulica) return [];
      var ro = function (pid, rot, v, m) { return { id: pid, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: m }; };
      var cs = []; try { cs = HP.coeficientes(fc) || []; } catch (eC) { cs = []; }
      var ps = [];
      cs.forEach(function (c, i) { if (/^(UHC|DN mín|vazão|peso|pressão mín)/.test(c.rotulo)) ps.push(ro("ifh:" + i, c.rotulo.charAt(0).toUpperCase() + c.rotulo.slice(1), c.texto, c.fonte ? "Fonte: " + c.fonte : "")); });
      if (!ps.some(function (x) { return x.rotulo === "UHC"; })) {
        var H = fc.hidraulica, u = H.uhc;
        ps.unshift(ro("ifh:uhc", "UHC", u && u.naoSeAplica ? "não se aplica" : (u && u.verPeca ? "pela peça que recebe (ralo/caixa)" : "pendente"), u && u.motivo ? u.motivo : "A ficha da peça não traz o UHC com fonte."));
      }
      var R = global.HidCalcUI && HidCalcUI.estado ? HidCalcUI.estado.resultado : null, pts = R && R.sistemas && R.sistemas.esgoto ? (R.sistemas.esgoto.pontos || []) : [];
      var pt = pts.filter(function (x) { return x.famInst === fid; })[0];
      if (pt) ps.push(ro("ifh:calc", "UHC no cálculo", pt.uhc != null ? String(pt.uhc) + (pt.aparelho ? " (" + String(pt.aparelho).replace(/_/g, " ") + ")" : "") : "pendente", "O que o último Dimensionar usou neste ponto de esgoto."));
      return ps.length ? [{ nome: "Hidráulica do aparelho (ficha da peça)", params: ps }] : [];
    },
    /* OBRA: fase e comentários da instância (instAlterar: um Ctrl+Z cada) */
    secaoObra: function (alvo, st) {
      var F = global.BimFases, fases = null, dem = null;
      try { fases = F && F.opcoesProps ? F.opcoesProps(st, "PHASE_CREATED") : null; dem = F && F.opcoesProps ? F.opcoesProps(st, "PHASE_DEMOLISHED") : null; } catch (e) { fases = null; }
      if (!fases || !fases.length) fases = [{ id: "Existente", rotulo: "Existente" }, { id: "Construção nova", rotulo: "Construção nova" }];
      if (!dem || !dem.length) dem = [{ id: "Nenhum", rotulo: "Nenhum" }].concat(fases);
      return { nome: "Obra", params: [
        { id: "iob:fase", rotulo: "Fase criada", tipo: "lista", valor: alvo.faseCriada || "Construção nova", opcoes: fases },
        { id: "iob:demolida", rotulo: "Fase demolida", tipo: "lista", valor: alvo.faseDemolida || "Nenhum", opcoes: dem },
        { id: "iob:coment", rotulo: "Comentários", tipo: "texto", valor: alvo.comentarios || "" }
      ] };
    },

    /* ------------------------------------------------ JUNTAS NA PONTA (QV1, 17/10/2026)
     * A junta é guardada no TRECHO que sai da conexão (juntaIni/juntaFim, via instAlterar: desfaz/refaz de graça).
     * juntaDoUid: a luva deduzida (cx…, juntaDe) ou o próprio trecho → { trecho, lado, junta, motivo } */
    juntaDoUid: function (id) {
      var R = this._ultimaRede, I = BI(); if (!R || !R.juntas || !I) return null;
      var c = R.conexoes.filter(function (x) { return x.id === id && x.juntaDe != null; })[0], tid = c ? c.juntaDe : id;
      var j = R.juntas.filter(function (x) { return String(x.trecho) === String(tid); })[0]; if (!j) return null;
      var t = R.trechos.filter(function (x) { return x.id === j.trecho; })[0];
      return { trecho: j.trecho, lado: j.lado, junta: j.junta, motivo: (t && t.juntaMotivo) || "", principal: j.principal };
    },
    secaoJunta: function (j) {
      var I = BI(), ps = [{ id: "ij:junta", rotulo: "Tipo de junta", tipo: "lista", valor: j.junta, opcoes: Object.keys(I.JUNTAS).map(function (k) { return { id: k, rotulo: I.JUNTAS[k] }; }) }];
      if (j.junta === "invertida") ps.push({ id: "ij:motivo", rotulo: "Motivo (contra o fluxo)", tipo: "texto", valor: j.motivo || "" });
      return { nome: "Tipo de junta (saída da conexão para o trecho " + j.trecho + ")", params: ps };
    },
    /* REDUÇÃO EXCÊNTRICA: a peça nasce com a geratriz SUPERIOR reta (o traçado automático e o desenho à mão); ESPAÇO, com a
       redução (ou o trecho que sai dela) selecionada, gira para a geratriz inferior e de volta. Guardado no trecho de jusante
       (instAlterar → desfaz/refaz). */
    excentricaDoUid: function (uid) {
      var R = this._ultimaRede; if (!R) return null; uid = String(uid || "").replace(/^edit:/, "");
      var c = (R.conexoes || []).filter(function (x) { return x.id === uid && x.tipo === "reducao" && x.material === "pvc_esgoto"; })[0];
      var tj = null;
      if (c) (c.ramos || []).forEach(function (id) { var t = (R.trechos || []).filter(function (y) { return y.id === id; })[0]; if (t && Math.abs((+t.dn || 0) - (+c.dn || 0)) < 0.5) tj = t; });
      else (R.conexoes || []).forEach(function (x) { if (x.tipo === "reducao" && x.material === "pvc_esgoto" && (x.ramos || []).indexOf(uid) >= 0) { var t = (R.trechos || []).filter(function (y) { return y.id === uid; })[0]; if (t && Math.abs((+t.dn || 0) - (+x.dn || 0)) < 0.5) tj = t; } });
      return tj;
    },
    girarExcentrica: function (uid) {
      var b = B(), tj = this.excentricaDoUid(uid); if (!b || !b.instOp || !tj) return false;
      var nova = tj.excentrica === "inferior" ? "superior" : "inferior";
      b.instOp({ op: "instAlterar", id: tj.id, excentrica: nova });
      status("Redução excêntrica: geratriz " + nova + " reta" + (nova === "superior" ? " (padrão do esgoto por gravidade)." : ". Espaço volta para a superior."));
      return true;
    },
    _teclaEspaco: function (ev) {
      if (ev.key !== " " || ev.ctrlKey || ev.altKey || ev.metaKey || !BimInstUI._previaHidro()) return;   /* P8: só com a prévia hidro */
      var a = typeof document !== "undefined" ? document.activeElement : null; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      var b = B(), sel = []; try { sel = (b && b.selecao ? b.selecao().uids : []) || []; } catch (e) { sel = []; }
      if (sel.length === 1 && BimInstUI.girarExcentrica(sel[0])) { ev.preventDefault(); ev.stopPropagation(); }
    },
    mudarJunta: function (j, junta, motivo) {
      var b = B(); if (!b || !b.instOp) return false;
      var o = { op: "instAlterar", id: j.trecho };
      if (junta) o[j.lado === 1 ? "juntaFim" : "juntaIni"] = junta;
      if (motivo != null) o.juntaMotivo = motivo;
      b.instOp(o);
      status(junta === "invertida" ? "Luva invertida (contra o fluxo): registre o motivo em Propriedades." : (junta === "bolsa" ? "Junta pela bolsa do próprio tubo (a luva saiu do quantitativo)." : "Junta com luva."));
      return true;
    },
    /* o MENU DO CLIQUE DIREITO (o de "Selecionar todas as instâncias", js/bimselinst.js, montado no js/gestao.js — no 3D,
       na planta e no corte): com a peça sob o cursor sendo a luva da ponta ou o tubo que sai dela, entram as 3 juntas */
    itensMenu: function (o) {
      var I = BI(), self = this, uid = o && o.uid ? String(o.uid).replace(/^edit:/, "") : ""; if (!I || !uid) return [];
      var j = this.juntaDoUid(uid); if (!j) return [];
      return Object.keys(I.JUNTAS).map(function (k) { return { id: "inst-junta-" + k, rotulo: (k === j.junta ? "✓ " : "") + "Junta: " + I.JUNTAS[k], fn: function () { self.mudarJunta(j, k, null); } }; });
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
      /* J4/J11: só com a prévia ?previa=hidro; o grupo "hidro" (motores, catálogo, normas, telas) baixa AQUI, na primeira abertura do painel */
      var comHidro = !!(global.BimPrevia && BimPrevia.hidro && BimPrevia.hidro());
      if (comHidro && !global.HidCalcUI && global.Carregar && Carregar.temGrupo && Carregar.temGrupo("hidro")) {
        var selfH = this;
        Carregar.grupo("hidro").then(function () { if (global.HidCalcUI) selfH.renderPainel(); }, function () {});
      }
      try { if (comHidro && global.HidCalcUI && HidCalcUI.montar) HidCalcUI.montar(corpo); } catch (eHid) {}   /* HIDROSSANITÁRIO (js/hidcalcui.js): o painel Dimensionar vem no fim do painel Instalações */
      try { if (comHidro && global.ClimCalcUI && ClimCalcUI.montar) ClimCalcUI.montar(corpo); } catch (eClim) {}   /* CLIMATIZAÇÃO (js/climcalcui.js): o painel Climatização vem depois do hidrossanitário */
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
        /* ⚠ a PALETA (esq.bp1, js/bimpropsui.js) se repinta sozinha (BimPropsUI.aoMudarModelo): repintar aqui trocava a
           paleta pela tela antiga 150 ms depois de cada mudança (FLUIDEZ, 17/10/2026) */
        try {
          var esq = global.BimShell && BimShell._estado ? BimShell._estado.props : null;
          if (esq && esq.uid && !esq.bp1 && self.ehInst(esq.uid)) { var novo = self.props(esq.uid); BimShell.pintarProps(novo); }
        } catch (eP) {}
      }, 150);
    }
  };

  /* P12 — os métodos novos (acessório, eletrocalha, verificar, legenda, tabela): js/biminstui.js parte 2, abaixo */
  P12(BimInstUI);
  NIVEL(BimInstUI);   /* NÍVEL DE DETALHE: Baixo / Médio / Alto por vista */
  BimInstUI.registrarFita();
  try { if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("keydown", BimInstUI._teclaLigacao, true); } catch (eK) {}
  try { if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("keydown", BimInstUI._teclaEspaco, true); } catch (eE) {}   /* ESPAÇO: gira a redução excêntrica */   /* LIGAR A → B: Tab/Enter/Esc da prévia */
  global.BimInstUI = BimInstUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
