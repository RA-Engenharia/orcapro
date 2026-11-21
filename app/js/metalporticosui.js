/* =====================================================================
 * metalporticosui.js — a TELA da BIBLIOTECA DE PÓRTICOS INDUSTRIAIS
 * (Metálica & Mecânica › Pórticos; só com a prévia do modelador).
 * 14/10/2026, frente M4 da 1.2.145.
 *
 * Quem gera e decide é o js/metalporticos.js (motor puro). Aqui:
 *   · o botão da fita (grupo "Pórticos", logo depois do Galpão);
 *   · o DIÁLOGO: os cartões das tipologias (croqui do pórtico típico, o
 *     MOTOR de cálculo de cada uma e o que fica NÃO VERIFICADO), os campos
 *     da escolhida com a prévia ao vivo e o resumo;
 *   · "Criar no modelo" e "Criar e calcular": a alma cheia de uma e duas
 *     águas entra pelo gerador do galpão (BimMetalUI.gerarGalpao, o galpão
 *     fica ligado ao cálculo do galpão) e abre o Cálculo do galpão com a
 *     geometria; o resto entra como peças desenhadas (um lote, um Ctrl+Z) e
 *     abre o Cálculo da estrutura desenhada já preparado — base, áreas de
 *     cobertura por água, piso do mezanino, cargas da ponte, fechamento das
 *     faces e as peças do pórtico (MetalCalcLivreUI.preparar);
 *   · "Atualizar no lugar": com uma peça de um pórtico da biblioteca
 *     selecionada, o diálogo abre com os dados dele e refaz no mesmo lugar.
 * Cores: tokens do css/app.css (tema claro e escuro). Sem backdrop-filter.
 * ===================================================================== */
(function (global) {
  "use strict";

  function MP() { return global.MetalPorticos || null; }
  function MU() { return global.BimMetalUI || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }

  var COMANDOS = [
    { id: "met-porticos", rotulo: "Pórticos\nindustriais", icone: "estrutura", grande: true, dica: "Biblioteca de pórticos industriais paramétricos: alma cheia de uma e duas águas, mísula, atirantado, treliçados (banzos paralelos, trapezoidal, tesouras Howe/Pratt/Warren), shed, multivão, ponte rolante, mezanino, coluna treliçada e tesoura leve (coluna treliçada de U com alma em cantoneira). Gera o modelo BIM inteiro e prepara o cálculo." }
  ];

  /* ------------------------------------------------------------ campos [id, rótulo, tipo, opções] */
  var S_PRINC = ["GERDAU", "W", "VS", "CVS", "CS"], S_TUBO = ["VMB-TQ", "VMB-TR", "VMB-TC", "HSSR"], S_TERCA = ["UE", "UFF", "GERDAU"], S_BARRA = ["BARRA-R"], S_L = ["L", "GERDAU-L"], S_LEVE_U = ["UFF", "GERDAU-U", "AM-U"], S_LEVE_L = ["AM-L", "GERDAU-L", "L"], S_LEVE_2L = ["AM-2L"], S_LEVE_TUBO = ["TUPER-TQ", "TUPER-TR", "VMB-TQ"];
  var SN = [["rotulada", "Rotulada"], ["engastada", "Engastada"]];
  function campos(t, modo) {
    var c = [];
    modo = modo === "espacamento" ? "espacamento" : "numero";
    if (t !== "shed" && t !== "multivao") c.push(["vao", "Vão / largura (m)", "num"]);
    c.push(["comprimento", "Comprimento do galpão (m)", "num"]);
    c.push(["peDireito", t === "trelica-paralelos" || t === "trelica-trapezoidal" || t === "tesoura" || t === "tesoura-leve" ? "Altura do banzo de cima no pilar (m)" : "Pé-direito — altura do beiral (m)", "num"]);
    if (t !== "shed") c.push(["inclinacao", "Inclinação do telhado (%)", "num"]);
    c.push(["definirPor", "Definir por", "sel", [["numero", "Número de pórticos"], ["espacamento", "Espaçamento desejado"]]]);
    /* 21/11/2026: por NÚMERO o espaçamento é só leitura (comprimento ÷ (N−1)); por ESPAÇAMENTO o número é só leitura (⌈comprimento ÷ s⌉ + 1) */
    if (modo === "espacamento") c.push(["espacamentoDesejado", "Espaçamento desejado (m)", "num"], ["ajuste", "Sobra do comprimento", "sel", [["iguais", "Vãos todos iguais (nunca maiores que o desejado)"], ["pontas", "Manter o desejado e ajustar os vãos das pontas"]]], ["nPorticos", "Número de pórticos (calculado)", "int", null, "ro"]);
    else c.push(["nPorticos", "Número de pórticos", "int"], ["espacamento", "Espaçamento dos pórticos (calculado, m)", "num", null, "ro"]);
    if (t !== "coluna-trelicada" && t !== "tesoura-leve") c.push(["base", "Base dos pilares", "sel", SN]);   /* coluna de 2 banzos: banzos rotulados, engaste pelo binário */
    c.push(["fechamento", "Fechamento (laterais e oitões)", "sel", [["fechado", "Fechado — telha trapezoidal"], ["aberto", "Aberto"]]]);
    c.push(["contraventamento", "Contraventamento (vãos das pontas)", "sel", [["X-barra", "X de barra redonda"], ["X-cantoneira", "X de cantoneira"], ["nenhum", "Nenhum"]]]);
    /* 21/11/2026 (js/metalparafusos.js): a ligação geral — parafusada põe parafuso, porca e arruela em todo nó com chapa e na mão-francesa */
    c.push(["ligacao", "Ligações da estrutura", "sel", [["padrao", "Padrão (nós soldados, clip de terça parafusado)"], ["parafusada", "Parafusada (nós com chapa e parafusos, mão-francesa parafusada)"], ["soldada", "Soldada (sem parafusos; o cordão vai na lista)"]]]);
    if (t === "trelica-paralelos") c.push(["aguas", "Águas", "sel", [["2", "Duas águas"], ["1", "Uma água"]]]);
    if (t === "tesoura-leve") {
      c.push(["sistemaTrelica", "Sistema da treliça", "sel", [["tubo", "Tubo (nós soldados tubo-tubo)"], ["cantoneira", "Cantoneira (2L costas com costas e chapa de nó)"]]], ["chapaNo", "Chapa de nó / folga da 2L (mm)", "num"]);
      c.push(["forma", "Tesoura", "sel", [["paralelos", "Banzos paralelos (duas águas)"], ["trapezoidal", "Trapezoidal (banzo de baixo reto)"]]], ["padrao", "Alma", "sel", [["howe", "Montante em todo nó, diagonais descendo para o meio"], ["warren", "Warren (montante só nas terças: banzo de cima com painel dobrado)"]]],
             ["alturaTrelica", "Altura da tesoura (m, entre eixos; 0 = vão/15)", "num"], ["subPaineis", "Painéis de alma por painel de terça (0 = automático)", "int"],
             ["banzo", "Perfil dos banzos da tesoura", "cat", S_LEVE_2L.concat(S_LEVE_U, S_LEVE_TUBO)], ["diagonal", "Perfil das diagonais (2L, cantoneira ou tubo)", "cat", S_LEVE_2L.concat(S_LEVE_L, S_LEVE_TUBO)], ["montante", "Perfil dos montantes (2L, cantoneira ou tubo)", "cat", S_LEVE_2L.concat(S_LEVE_L, S_LEVE_TUBO)], ["escora", "Escora do banzo de baixo", "cat", S_LEVE_TUBO.concat(S_TUBO)], ["escoraColuna", "Escora da coluna (no plano da parede)", "cat", S_LEVE_TUBO.concat(S_TUBO)],
             ["secaoColuna", "Seção do pilar", "sel", [["plana", "Plana (2 banzos)"], ["espacial", "Espacial (4 montantes)"]]], ["profColuna", "Profundidade da coluna espacial (m, fora do plano; 0 = a largura)", "num"], ["montanteColuna", "Perfil dos montantes da coluna espacial (cantoneira ou tubo)", "cat", S_LEVE_L.concat(S_LEVE_TUBO, S_TUBO)], ["larguraColuna", "Largura da coluna (m, entre eixos dos banzos)", "num"], ["painelColuna", "Altura do painel do travejamento (m)", "num"], ["banzoColuna", "Perfil dos banzos da coluna", "cat", S_LEVE_U.concat(S_PRINC)], ["travejamento", "Perfil do travejamento (cantoneira ou tubo)", "cat", S_LEVE_L.concat(S_LEVE_TUBO)]);
    }
    else if (/^trelica|^tesoura/.test(t)) {
      c.push(["padrao", "Treliça", "sel", [["pratt", "Pratt"], ["howe", "Howe"], ["warren", "Warren"]]]);
      if (t !== "tesoura") c.push(["alturaTrelica", t === "trelica-paralelos" ? "Altura da treliça (m, entre eixos)" : "Altura no apoio (m, entre eixos)", "num"]);
      c.push(["paineis", "Nº de painéis (0 = automático)", "int"], ["banzo", "Perfil dos banzos", "cat", S_TUBO.concat(S_PRINC)], ["diagonal", "Perfil das diagonais (tubo)", "cat", S_TUBO], ["montante", "Perfil dos montantes (tubo)", "cat", S_TUBO], ["escora", "Escora do banzo de baixo", "cat", S_TUBO]);
    }
    if (t === "shed") c.push(["dentes", "Número de dentes", "int"], ["vaoDente", "Vão de cada dente (m)", "num"], ["alturaDente", "Altura da face envidraçada (m)", "num"]);
    if (t === "multivao") c.push(["vaos", "Número de vãos", "int"], ["vaoCada", "Vão de cada módulo (m)", "num"], ["cobertura", "Cobertura", "sel", [["unica", "Única em duas águas"], ["geminada", "Geminada (duas águas por vão)"]]], ["ligInterna", "Pilar interno no topo", "sel", [["rigida", "Rígido com as vigas"], ["rotulada", "Rotulado (pendular)"]]], ["pilarInterno", "Perfil do pilar interno", "cat", S_PRINC]);
    if (t === "coluna-trelicada") c.push(["secaoColuna", "Seção do pilar", "sel", [["plana", "Plana (2 banzos)"], ["espacial", "Espacial (4 montantes)"]]], ["profColuna", "Profundidade da coluna espacial (m, fora do plano; 0 = a largura)", "num"], ["montanteColuna", "Perfil dos montantes da coluna espacial (cantoneira ou tubo)", "cat", S_TUBO.concat(S_L)], ["larguraColuna", "Largura da coluna (m, entre eixos)", "num"], ["painelColuna", "Altura do painel do travejamento (m)", "num"], ["banzoColuna", "Perfil dos banzos da coluna", "cat", S_PRINC], ["travejamento", "Perfil do travejamento (tubo)", "cat", S_TUBO], ["escora", "Escora longitudinal da coluna", "cat", S_TUBO]);
    else if (t !== "tesoura-leve") c.push(["pilar", "Perfil dos pilares", "cat", S_PRINC]);
    if (!/^trelica|^tesoura/.test(t)) c.push(["viga", "Perfil das vigas", "cat", S_PRINC]);
    if (t === "misula") c.push(["misulaComprimento", "Mísula: comprimento em planta (m; 0 = vão/10)", "num"], ["misulaAltura", "Mísula: altura acrescida no joelho (m; 0 = a da viga)", "num"], ["degraus", "Mísula: degraus do cálculo (2 a 6)", "int"]);
    if (t === "atirantado") c.push(["tirante", "Tirante (barra redonda)", "cat", S_BARRA], ["pendural", "Pendural (barra redonda)", "cat", S_BARRA]);
    if (t === "ponte") c.push(["cotaConsole", "Cota do topo do console (m; 0 = 70 % do pé-direito)", "num"], ["excentricidade", "Do eixo do pilar ao da viga de rolamento (m)", "num"], ["console", "Perfil do console", "cat", S_PRINC], ["vigaRolamento", "Perfil da viga de rolamento", "cat", S_PRINC],
      ["rodaMax", "Reação MÁX. por roda, com impacto (kN) — fabricante", "num"], ["rodaMin", "Reação mín. por roda (kN) — fabricante", "num"], ["rodaTransv", "Força transversal por roda (kN) — fabricante", "num"], ["forcaLong", "Força longitudinal por trilho (kN) — fabricante", "num"], ["entreEixos", "Distância entre as rodas de um lado (m)", "num"], ["capacidade", "Capacidade da ponte (t) — só dado", "num"]);
    if (t === "mezanino") c.push(["largura", "Largura do mezanino (m, da lateral esquerda)", "num"], ["cotaPiso", "Cota do piso — topo do aço (m)", "num"], ["espSec", "Espaçamento das secundárias (m)", "num"], ["vigaMez", "Viga do mezanino", "cat", S_PRINC], ["secMez", "Secundária do mezanino", "cat", S_PRINC], ["pilarMez", "Pilar do mezanino", "cat", S_PRINC.concat(S_TUBO)],
      ["uso", "Uso do piso (NBR 6120, Tabela 10)", "sel", usos()], ["qInformado", "Sobrecarga informada (kN/m²; só se o uso pede)", "num"], ["gPiso", "Permanente do piso (kN/m²)", "num"]);
    if (t === "tesoura-leve") c.push(["tercaBorda", "Terça das faixas de borda (vento local, NBR 6123)", "cat", S_TERCA.concat(["TUPER-TR"])]);
    c.push(["terca", t === "tesoura-leve" ? "Perfil das terças internas" : "Perfil das terças", "cat", t === "tesoura-leve" ? ["TUPER-TR"].concat(S_TERCA) : S_TERCA], ["espTercas", "Espaçamento máx. das terças (m)", "num"], ["correntes", "Linhas de corrente por vão (0 a 3)", "int"]);
    /* 21/11/2026: terça treliçada (pórticos a mais de 9 m — Manual Gerdau de galpões); só na estrutura desenhada */
    if (t !== "alma-cheia-1" && t !== "alma-cheia-2") c.push(["tipoTerca", "Tipo de terça", "sel", [["auto", "Automática (treliçada acima de 9 m entre pórticos)"], ["perfil", "Perfil (Ue / tubo)"], ["trelicada", "Treliçada (banzos + alma em barra redonda)"]]],
      ["tercaTrelBanzo", "Terça treliçada: banzos", "cat", S_LEVE_TUBO.concat(S_LEVE_L, S_TUBO)], ["tercaTrelAlma", "Terça treliçada: alma (barra redonda)", "cat", S_BARRA], ["alturaTercaTrel", "Terça treliçada: altura (m; 0 = vão/20)", "num"]);
    c.push(["tapamento", "Coluna de tapamento (oitão fechado)", "cat", S_TUBO.concat(S_PRINC)]);
    if (true) c.push(["barraCv", "Barra do X (contraventamento)", "cat", S_BARRA], ["cantoneiraCv", "Cantoneira do X (contraventamento)", "cat", S_L]);
    c.push(["x0", "Origem X (m, largura)", "num"], ["z0", "Origem Z (m, comprimento)", "num"], ["cota", "Cota da base (m)", "num"]);
    return c;
  }
  function usos() { var M = global.AcoModeloLivre; return M && M.USOS ? M.USOS.filter(function (u) { return !u.cobertura; }).map(function (u) { return [u.id, u.grupo + " — " + u.local + (u.q != null ? " (" + br(u.q, u.q < 1 ? 2 : 1) + " kN/m²)" : " (informar)")]; }) : [["industrial-adm", "Edificações industriais — salas administrativas (2,5 kN/m²)"]]; }
  var _dl = {};
  function datalist(series) {
    var k = series.join("-"); if (_dl[k]) return _dl[k];
    var A = global.PerfisAco, MC = global.MetalCriar, o = [];
    if (A) series.forEach(function (s) { (A.listar(s) || []).forEach(function (n) { if (!MC || MC.perfilCat(n)) o.push(n); }); });
    _dl[k] = o; return o;
  }

  function css() {
    if (typeof document === "undefined" || document.getElementById("mpo-css")) return;
    var s = document.createElement("style"); s.id = "mpo-css";
    s.textContent = ".mpo-dlg{display:grid;grid-template-columns:250px minmax(0,1fr) 330px;gap:12px;align-items:start}" +
      ".mpo-tipos{display:flex;flex-direction:column;gap:6px;max-height:64vh;overflow:auto;padding-right:4px}" +
      ".mpo-tipo{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;text-align:left;border:1px solid var(--linha);border-radius:9px;background:var(--surface);color:var(--texto);padding:5px 7px;cursor:pointer;font:inherit}" +
      ".mpo-tipo:hover{border-color:var(--aco)}.mpo-tipo[aria-pressed='true']{border-color:var(--aco);box-shadow:inset 3px 0 0 var(--aco)}" +
      ".mpo-tipo svg{width:72px;height:40px;display:block}.mpo-tipo b{display:block;font-size:12px;line-height:1.25}.mpo-tipo small{display:block;font-size:10.5px;color:var(--texto-fraco);line-height:1.25}" +
      ".mpo-tag{display:inline-block;font-size:10px;padding:0 5px;border-radius:5px;margin-top:2px;border:1px solid var(--linha)}.mpo-tag.galpao{color:var(--verde)}.mpo-tag.livre{color:var(--aco)}.mpo-tag.nv{color:var(--amarelo)}" +
      ".mpo-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 12px;max-height:64vh;overflow:auto;padding-right:4px}" +
      ".mpo-campos label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--texto)}.mpo-campos input,.mpo-campos select{min-height:30px}" +
      ".mpo-lado{display:flex;flex-direction:column;gap:8px}.mpo-prev{border:1px solid var(--linha);border-radius:8px;background:var(--surface);padding:6px;color:var(--texto)}.mpo-prev svg{width:100%;height:auto;display:block}" +
      ".mpo-res{font-size:12px;color:var(--texto);margin:0}.mpo-motor{font-size:12px;margin:0;color:var(--texto)}.mpo-nv{font-size:11px;color:var(--amarelo);margin:0;padding-left:16px}" +
      ".mpo-av{font-size:11px;color:var(--texto-fraco);margin:0;padding-left:16px;max-height:110px;overflow:auto}.mpo-erro{font-size:12px;color:var(--vermelho);margin:0;min-height:1.2em}" +
      ".mpo-ro{background:var(--surface-2,transparent);opacity:.8}.mpo-lado [hidden]{display:none!important}.mpo-pos{font-size:12px;color:var(--texto);display:flex;flex-direction:column;gap:5px}.mpo-pos p{margin:0}.mpo-pos button{font-size:11px;margin:0 4px 4px 0}.mpo-pos .mpo-pos-r{font-size:11px;color:var(--texto-fraco)}" +
      ".mpo-ajuda{border:1px solid var(--aco);border-radius:10px;padding:8px 10px;background:var(--surface);color:var(--texto);max-height:64vh;overflow:auto}.mpo-ajuda-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.mpo-ajuda h4{margin:0 0 4px;font-size:13px}.mpo-ajuda-cab button{font-size:11px;white-space:nowrap}" +
      ".mpo-ajuda-svg svg{width:100%;height:auto;display:block}.mpo-ajuda-val{font-size:12px;margin:4px 0}.mpo-ajuda dl{margin:6px 0 0;font-size:12px}.mpo-ajuda dt{font-weight:700;margin-top:6px;color:var(--aco)}.mpo-ajuda dd{margin:2px 0 0;line-height:1.35}" +
      "@media (max-width:980px){.mpo-dlg{grid-template-columns:1fr}.mpo-tipos{max-height:none;flex-direction:row;flex-wrap:wrap}.mpo-tipo{width:220px}.mpo-campos{max-height:none}}";
    document.head.appendChild(s);
  }

  var MetalPorticosUI = {
    COMANDOS: COMANDOS, _n: 0, ultimo: null, _dlg: null, campos: campos,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    novoId: function () { var U = MU(); if (U && U.novoId) return U.novoId(); this._n++; return "mpo-" + Date.now().toString(36) + "-" + this._n; },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    caixas: function () { var st = this.estado(); return (st && st.caixas) || []; },
    registrar: function (reg) {
      if (!previa() || !MP()) return false;
      var self = this;
      reg["met-porticos"] = function () { try { self.abrir(); } catch (e) { toast("Pórticos: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      return true;
    },
    /* os pórticos da biblioteca no modelo (peças com caixa.portico; o de alma cheia é um galpão: caixa.galpao + porticoTipo) */
    porticos: function () {
      var por = {}, ordem = [];
      this.caixas().forEach(function (c) {
        if (!c || !c.portico) return; var g = String(c.portico);
        if (!por[g]) { por[g] = { id: g, pecas: [], info: null }; ordem.push(g); }
        por[g].pecas.push(String(c.id)); if (c.porticoInfo) por[g].info = c.porticoInfo;
      });
      return ordem.map(function (g) { var o = por[g]; o.n = o.pecas.length; return o; });
    },
    /* 21/11/2026: o resultado do DIMENSIONAMENTO DAS LIGAÇÕES (r.ligDim, js/metalligdim.js) volta para o modelo — o pórtico é refeito
       no lugar (um Ctrl+Z) com o nº de parafusos, o diâmetro, a placa e o chumbador calculados; a lista de montagem conta do modelo */
    atualizarLigacoes: function (r) {
      var M = MP(), self = this; if (!M || !r || !r.ligDim || !r.ligDim.modelo) { toast("Calcule a estrutura primeiro: as ligações saem do cálculo.", "aviso"); return null; }
      var pc = {}; arr(r.modelo && r.modelo.membros).forEach(function (m) { pc[String(m.peca)] = 1; });
      var alvo = this.porticos().filter(function (g) { return arr(g.pecas).some(function (id) { return pc[String(id)]; }); })[0];
      if (!alvo || !alvo.info) { toast("O cálculo não é de um pórtico da biblioteca — as ligações ficam só na memória.", "aviso", 8000); return null; }
      var el = global.document && document.body, pg = el && global.UI && UI.progresso ? UI.progresso(el, { titulo: "Atualizar as ligações no modelo", etapas: [{ id: "g", peso: 1, rotulo: "Refazendo o pórtico com as ligações calculadas" }], texto: "Refazendo o pórtico", fundo: true }) : null;
      try { if (pg) pg.etapa("g", 0.3, "Refazendo o pórtico (" + alvo.n + " peças)"); var g = this.criar(alvo.info.tipo, alvo.info.par, { alvo: alvo, ligDim: r.ligDim.modelo }); if (g && g.ok) toast("Ligações do cálculo no modelo: " + (g.fixacao ? g.fixacao.resumo : "") + ". Recalcule para conferir o modelo novo.", "ok", 10000); return g; }
      finally { if (pg) pg.fim(); }
    },
    porticoSelecionado: function () {
      var U = MU(), ids = U && U.selecao ? U.selecao().map(String) : [], gs = this.porticos();
      var c = this.caixas().filter(function (x) { return x && x.portico && ids.indexOf(String(x.id)) >= 0; })[0];
      return c ? gs.filter(function (g) { return g.id === String(c.portico); })[0] || null : null;
    },

    /* ------------------------------------------------------------ diálogo */
    abrir: function (tipo, o) {
      var M = MP(); if (!M || !global.UI) return false;
      css(); o = o || {};
      var alvo = o.alvo || (o.novo ? null : this.porticoSelecionado());
      var par = alvo && alvo.info && alvo.info.par ? clone(alvo.info.par) : null;
      tipo = (alvo && alvo.info && alvo.info.tipo) || tipo || (this._ultimo && this._ultimo.tipo) || "alma-cheia-2";
      if (!par) par = this._ultimoPar && this._ultimoPar[tipo] ? clone(this._ultimoPar[tipo]) : M.padrao(tipo);
      this._dlg = { tipo: tipo, par: this.semear(tipo, par), alvo: alvo };
      var self = this, h = '<div class="mpo-dlg" data-modal-largo data-mpo="dlg"><div class="mpo-tipos" role="list" data-mpo="tipos">' + this.htmlTipos(tipo) + '</div><div class="mpo-campos" data-mpo="campos"></div>' +
        '<div class="mpo-lado"><div data-mpo="lado-resumo" class="mpo-lado"><div class="mpo-prev" data-mpo="previa"></div><div class="mpo-pos" data-mpo="posic"></div><p class="mpo-motor" data-mpo="motor"></p><ul class="mpo-nv" data-mpo="nv"></ul><p class="mpo-res" data-mpo="resumo"></p><p class="mpo-erro" data-mpo="erro" role="alert"></p><ul class="mpo-av" data-mpo="avisos"></ul>' +
        '<p class="muted" style="font-size:11px;margin:0">Os perfis são de <b>partida</b>: o cálculo confere todos e mostra o que não passa (e acha o mais leve, se pedido).</p></div><div data-mpo="ajuda" class="mpo-ajuda-box" hidden></div></div></div>';
      var bts = [];
      if (alvo) bts.push({ texto: "Atualizar no lugar", classe: "primary", onClick: function () { self._confirmar(false, true); } });
      bts.push({ texto: "Criar e calcular", classe: alvo ? "" : "primary", onClick: function () { self._confirmar(true, !!alvo); } });
      if (!alvo) bts.push({ texto: "Criar no modelo", onClick: function () { self._confirmar(false, false); } });
      bts.push({ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); self._dlg = null; } });
      UI.modal(alvo ? "Pórtico da biblioteca — " + M.TIPOS[tipo].rotulo + " (" + alvo.n + " peças)" : "Pórticos industriais", h, bts);
      var raiz = document.querySelector('[data-mpo="dlg"]'); this._dlg.raiz = raiz;
      if (raiz) {
        raiz.addEventListener("click", function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest("[data-mpo-tipo]") : null; if (b && !self._dlg.alvo) self.trocarTipo(b.getAttribute("data-mpo-tipo")); });
        raiz.addEventListener("click", function (ev) {
          var c = ev.target && ev.target.closest, b1 = c ? ev.target.closest("[data-mpo-preset]") : null, b4 = c ? ev.target.closest("[data-mpo-preset4]") : null;
          if (b1) { var q = b1.getAttribute("data-mpo-preset").split(":"); self.usarPreset(q[0], q[1]); }
          if (b4) self.gerarPreset4(b4.getAttribute("data-mpo-preset4"));
          var bc = c ? ev.target.closest("[data-mpo-comparar]") : null; if (bc) self.comparar(bc.getAttribute("data-mpo-comparar"));
        });
        /* 21/11/2026: posições dos pórticos (sugestões, pontas) e AJUDA por campo (cartão no painel da direita ao focar/clicar) */
        raiz.addEventListener("click", function (ev) {
          var c = ev.target && ev.target.closest, bp = c ? ev.target.closest("[data-mpo-pos]") : null, bv = c ? ev.target.closest("[data-mpo-voltar]") : null, bf = c ? ev.target.closest('[data-mpo="campos"] [data-mpo-c]') : null;
          if (bp) self.aplicarPosicao(bp.getAttribute("data-mpo-pos"));
          else if (bv) self.ajuda(null);
          else if (bf) self.ajuda(bf.getAttribute("data-mpo-c"));
        });
        raiz.addEventListener("focusin", function (ev) { var f = ev.target && ev.target.closest ? ev.target.closest('[data-mpo="campos"] [data-mpo-c]') : null; if (f) self.ajuda(f.getAttribute("data-mpo-c")); });
        raiz.addEventListener("focusout", function (ev) { var f = ev.target && ev.target.closest ? ev.target.closest('[data-mpo="campos"] [data-mpo-c]') : null; if (f) setTimeout(function () { var a = document.activeElement; if (!(a && a.closest && a.closest('[data-mpo="campos"] [data-mpo-c]'))) self.ajuda(null); }, 0); });
        raiz.addEventListener("change", function (ev) { var f = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-mpo-c") : null; if (f === "definirPor") self.trocarModoPosicao(); });
        var tm = null;
        raiz.addEventListener("input", function (ev) { if (ev.target && ev.target.closest && ev.target.closest('[data-mpo="campos"]')) { clearTimeout(tm); tm = setTimeout(function () { self.previa(); }, 200); } });
        raiz.addEventListener("change", function (ev) { if (ev.target && ev.target.closest && ev.target.closest('[data-mpo="campos"]')) self.previa(); });
      }
      this.desenharCampos(); this.previa();
      return true;
    },
    htmlTipos: function (sel) {
      var M = MP(), self = this;
      return M.ORDEM.map(function (t) {
        var T = M.TIPOS[t], nv = T.naoVerifica || [];
        return '<button type="button" class="mpo-tipo" role="listitem" data-mpo-tipo="' + t + '" aria-pressed="' + (t === sel) + '"' + (self._dlg && self._dlg.alvo && t !== sel ? " disabled" : "") + ">" + M.esquema(t, M.padrao(t), { w: 144, h: 80 }) +
          "<span><b>" + esc(T.rotulo) + "</b><small>" + esc(T.grupo) + '</small><span class="mpo-tag ' + T.motor + '">' + (T.motor === "galpao" ? "motor do galpão" : "estrutura desenhada") + "</span>" + (nv.length ? ' <span class="mpo-tag nv" title="' + esc(nv.join("; ")) + '">não verificado: ' + nv.length + "</span>" : "") + "</span></button>";
      }).join("");
    },
    trocarTipo: function (t) {
      var M = MP(), d = this._dlg; if (!M || !d || !M.TIPOS[t] || t === d.tipo) return;
      this._ultimoPar = this._ultimoPar || {}; this._ultimoPar[d.tipo] = this.ler();
      d.tipo = t; d.par = this.semear(t, this._ultimoPar[t] || M.padrao(t));
      var tp = d.raiz && d.raiz.querySelector('[data-mpo="tipos"]'); if (tp) Array.prototype.forEach.call(tp.querySelectorAll("[data-mpo-tipo]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mpo-tipo") === t)); });
      this.desenharCampos(); this.previa();
    },
    desenharCampos: function () {
      var d = this._dlg; if (!d || !d.raiz) return;
      var el = d.raiz.querySelector('[data-mpo="campos"]'), p = d.par, h = "";
      campos(d.tipo, p.definirPor).forEach(function (c) {
        var id = c[0], v = p[id];
        h += "<label><span>" + esc(c[1]) + "</span>";
        if (c[2] === "sel") h += '<select data-mpo-c="' + id + '">' + c[3].map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
        else if (c[2] === "cat") h += '<input data-mpo-c="' + id + '" list="mpo-dl-' + id + '" value="' + esc(v) + '" autocomplete="off" spellcheck="false"><datalist id="mpo-dl-' + id + '">' + datalist(c[3]).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
        else h += '<input data-mpo-c="' + id + '" inputmode="decimal"' + (c[4] === "ro" ? ' readonly class="mpo-ro" title="Calculado pelo sistema"' : "") + ' value="' + esc(v === "" || v == null ? "" : br(v, c[2] === "int" ? 0 : 3)) + '">';
        h += "</label>";
      });
      /* pré-configuração "Pedido Gabriel" (tesoura leve): uma variante no formulário, ou as 4 lado a lado no modelo */
      var M0 = MP(), PG = M0 && M0.PRESETS && M0.PRESETS["pedido-gabriel"];
      if (PG && d.tipo === PG.tipo && !d.alvo) h = '<div class="mpo-preset" style="grid-column:1/-1"><b>' + esc(PG.rotulo) + ':</b> ' + PG.variantes.map(function (v) { return '<button type="button" data-mpo-preset="pedido-gabriel:' + v.id + '">' + esc(v.rotulo) + "</button>"; }).join(" ") +
        ' <button type="button" class="primary" data-mpo-preset4="pedido-gabriel">Gerar as 4 variantes</button> <button type="button" data-mpo-comparar="pedido-gabriel">Comparar as 4 variantes</button> <span class="mpo-revisao" data-mpo-revisao="pedido-gabriel" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:4px;background:#2e7d32;color:#fff;font-weight:700">Calculado — conferir e assinar pelo responsável técnico (barras, nós, ligações e placas de base passam nas 4 variantes, NBR 8800:2008 com itens a conferir no texto; os enrijecedores da coluna ainda não estão no 3D)</span></div>' + h;
      if (el) el.innerHTML = h;
    },
    /* a variante no formulário */
    usarPreset: function (id, vid) { var d = this._dlg, M = MP(); if (!d || !M) return false; var p = M.presetPar(id, vid); if (!p) return false; d.par = M.normalizar(M.PRESETS[id].tipo, p); this.desenharCampos(); this.previa(); return true; },
    /* as 4 variantes no modelo (sem calcular: cada uma se calcula pela tela de cálculo, uma por vez) */
    gerarPreset4: function (id) {
      var M = MP(); if (!M) return []; var vs = M.presetVariantes(id), out = [], self = this;
      try { UI.fecharModal(); } catch (e) {} this._dlg = null;
      vs.forEach(function (v) { var r = self.criar(v.tipo, v.par, { calcular: false }); out.push({ id: v.id, ok: !!(r && r.ok !== false) }); });
      toast("Pedido Gabriel: " + out.filter(function (x) { return x.ok; }).length + " de " + vs.length + " variantes criadas lado a lado (PD 8/6 m, com/sem solar).", "ok", 8000);
      return out;
    },
    /* QUADRO COMPARATIVO das variantes (js/metalcomparativo.js): calcula uma por vez (o progresso aparece entre uma e outra),
       guarda o resultado da sessão (reabrir não recalcula) e exporta .xlsx e HTML/PDF para o cliente */
    _comp: {},
    comparar: function (id) {
      var M = MP(), C = global.MetalComparativo, self = this; if (!M || !C) { toast("O comparativo não carregou (js/metalcomparativo.js).", "erro"); return null; }
      var P = M.PRESETS[id], vs = M.presetVariantes(id), memo = this._comp[id] = this._comp[id] || {};
      var O = global.MetalOrc, opO = O && O.UI && O.UI.opcoes && O.UI.cfg ? O.UI.opcoes(O.UI.cfg()) : {};
      function quadro() { return vs.map(function (v) { return memo[v.id] ? memo[v.id].linha : { id: v.id, rotulo: v.rotulo, ok: false, situacao: "nao-calculou", grupos: {}, criticos: [], orcamento: { total: null, provisorios: [], semPreco: [], motivo: "calculando…" } }; }); }
      var t0c = Date.now(), nFila = 0;
      function tela(msg, kFeitas) {
        var h = '<div data-mpo="comp"><div data-mpo="comp-prog"></div><p class="muted" style="font-size:12px">' + esc(msg) + "</p>" + C.html(quadro(), {}) + "</div>";
        try { UI.fecharModal(); } catch (e) {}
        UI.modal("Comparativo — " + P.rotulo, h, [{ texto: "Baixar .xlsx", classe: "primary", onClick: function () { self.compXlsx(id); } }, { texto: "Baixar HTML (PDF pelo imprimir)", onClick: function () { self.compHtml(id); } }, { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        /* progresso (js/progresso.js): uma etapa por variante calculada — o relógio é o da fila inteira */
        var elP = document.querySelector('[data-mpo="comp-prog"]');
        if (elP && UI.progresso && nFila) { var pg = UI.progresso(elP, { titulo: "Comparativo — " + nFila + " variante(s)", etapas: [{ id: "v", peso: 1 }], texto: msg }); pg.etapa("v", kFeitas / nFila, msg); if (kFeitas >= nFila) pg.fim(); }
      }
      var fila = vs.filter(function (v) { return !memo[v.id]; }), k = 0; nFila = fila.length;
      function passo() {
        if (k >= fila.length) { tela("Pronto: " + vs.length + " variantes. Peso = eixo × massa linear (sem ligações); preço = Orçamento da estrutura, itens provisórios marcados.", nFila); return; }
        var v = fila[k]; tela("Calculando " + (k + 1) + " de " + fila.length + ": " + v.rotulo + "… (cada variante leva cerca de 1 minuto)", k);
        setTimeout(function () { try { memo[v.id] = C.calcularVariante(id, v.id, { orcamento: opO }); } catch (e) { memo[v.id] = { linha: { id: v.id, rotulo: v.rotulo, ok: false, situacao: "nao-calculou", motivo: e && e.message, grupos: {}, criticos: [], orcamento: { total: null, provisorios: [], semPreco: [] } } }; } k++; setTimeout(passo, 30); }, 60);
      }
      passo();
      return true;
    },
    compLinhas: function (id) { var M = MP(), memo = this._comp[id] || {}; return M.presetVariantes(id).map(function (v) { return memo[v.id] && memo[v.id].linha; }).filter(Boolean); },
    compHtml: function (id) {
      var C = global.MetalComparativo, M = MP(), U = MU(), d = C.documento(this.compLinhas(id), { titulo: "Comparativo — " + M.PRESETS[id].rotulo, subtitulo: "Galpão 20 m × 30 m, 6 tesouras a cada 6 m — pé-direito 6 e 8 m, com e sem estrutura solar. Vento de Castanhal-PA (NBR 6123)." });
      if (U && U.baixar) U.baixar("comparativo-pedido-gabriel.html", d, "text/html"); return d;
    },
    compXlsx: function (id) {
      var C = global.MetalComparativo, M = MP(), U = MU(), ls = this.compLinhas(id), E = global.ExcelOrc;
      if (!E || !E.ensureExcelJS) { toast("O gerador de Excel não carregou.", "erro"); return; }
      E.ensureExcelJS(function () { var wb = C.xlsx(ls, global.ExcelJS, { titulo: "Comparativo — " + M.PRESETS[id].rotulo, data: Date.now() }); wb.xlsx.writeBuffer().then(function (buf) { if (U && U.baixar) U.baixar("comparativo-pedido-gabriel.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }); });
    },
    /* os parâmetros de partida da tela: sempre com o comprimento e o "definir por" (padrão: número de pórticos) */
    semear: function (tipo, par) {
      var M = MP(), n1 = M.normalizar(tipo, par), q = clone(n1);
      if (q.definirPor !== "espacamento") q.definirPor = "numero";
      if (q.ajuste !== "pontas") q.ajuste = "iguais";
      return M.normalizar(tipo, q);
    },
    trocarModoPosicao: function () {
      var d = this._dlg, M = MP(); if (!d || !M) return;
      var p = this.ler();
      if (p.definirPor === "espacamento" && !(num(p.espacamentoDesejado, 0) > 0)) p.espacamentoDesejado = d.par.espacamento || p.espacamento;
      d.par = M.normalizar(d.tipo, p); this.desenharCampos(); this.previa();
      var sm = d.raiz && d.raiz.querySelector('[data-mpo-c="definirPor"]'); if (sm) sm.focus();
    },
    /* "esp:5" (usar esse espaçamento, vãos iguais) · "pontas" · "iguais" */
    aplicarPosicao: function (acao) {
      var d = this._dlg, M = MP(); if (!d || !M) return;
      var p = this.ler(), q = String(acao).split(":");
      p.definirPor = "espacamento";
      if (q[0] === "esp") { p.espacamentoDesejado = num(q[1], p.espacamentoDesejado); p.ajuste = "iguais"; }
      else if (q[0] === "pontas") p.ajuste = "pontas";
      else p.ajuste = "iguais";
      d.par = M.normalizar(d.tipo, p); this.desenharCampos(); this.previa();
    },
    /* AJUDA POR CAMPO (js/metalporticosajuda.js): id = o campo; null volta ao resumo */
    ajuda: function (id) {
      var d = this._dlg; if (!d || !d.raiz) return false;
      var A = global.MetalPorticosAjuda, box = d.raiz.querySelector('[data-mpo="ajuda"]'), res = d.raiz.querySelector('[data-mpo="lado-resumo"]'); if (!box || !res) return false;
      if (!id || !A) { box.hidden = true; box.innerHTML = ""; res.hidden = false; return true; }
      var el = d.raiz.querySelector('[data-mpo-c="' + id + '"]'), rot = id, sm = d.raiz.querySelector('[data-mpo-c="definirPor"]');
      campos(d.tipo, sm ? sm.value : d.par.definirPor).forEach(function (c) { if (c[0] === id) rot = c[1]; });
      var val = el ? (el.tagName === "SELECT" ? (el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "") : el.value) : "";
      box.innerHTML = A.cartao(id, { rotulo: rot, valor: val }); box.hidden = false; res.hidden = true; return true;
    },
    ler: function () {
      var d = this._dlg; if (!d) return null;
      var p = clone(d.par), raiz = d.raiz; if (!raiz) return p;
      var sm = raiz.querySelector('[data-mpo-c="definirPor"]');
      campos(d.tipo, sm ? sm.value : p.definirPor).forEach(function (c) {
        var el = raiz.querySelector('[data-mpo-c="' + c[0] + '"]'); if (!el) return;
        if (c[2] === "sel" || c[2] === "cat") p[c[0]] = String(el.value).trim();
        else { var s = String(el.value).trim(); if (s === "" && /^(rodaMax|rodaMin|rodaTransv|forcaLong|qInformado)$/.test(c[0])) p[c[0]] = ""; else { var v = num(s, NaN); if (isFinite(v)) p[c[0]] = v; } }
      });
      if (p.aguas != null) p.aguas = num(p.aguas, 2);
      return p;
    },
    previa: function () {
      var d = this._dlg, M = MP(); if (!d || !M || !d.raiz || !d.raiz.isConnected) return null;
      var p = this.ler(), T = M.TIPOS[d.tipo], el = function (s) { return d.raiz.querySelector('[data-mpo="' + s + '"]'); };
      var e = M.validar(d.tipo, p), m = e ? null : M.modelo(d.tipo, p);
      el("previa").innerHTML = M.esquema(d.tipo, p, { w: 320, h: 170 }) + (e ? "" : M.esquemaPlanta(d.tipo, p, { w: 320, h: 78 }));
      var pnP = e ? null : M.normalizar(d.tipo, p);
      el("posic").innerHTML = pnP ? this.htmlPosicoes(pnP, T) : "";
      /* 21/11/2026: os campos "calculado" (Nº de pórticos no modo espaçamento; espaçamento no modo número) acompanham a conta —
         antes ficavam com o valor do preset (6) enquanto o texto dizia 9 pórticos */
      if (pnP) ["nPorticos", "espacamento"].forEach(function (k) { var f = d.raiz.querySelector('[data-mpo="campos"] input.mpo-ro[data-mpo-c="' + k + '"]'); if (f && pnP[k] != null) f.value = br(pnP[k], k === "nPorticos" ? 0 : 3); });
      el("motor").innerHTML = "<b>Cálculo:</b> " + (T.motor === "galpao" ? "motor do galpão (pórtico, terças, travessas, vento da NBR 6123, ligações e placas de base) — abre o Cálculo do galpão" : "estrutura desenhada (todas as barras, envoltório e vento da NBR 6123) — abre o Cálculo da estrutura desenhada");
      var nv = (T.naoVerifica || []).slice();
      if (d.tipo === "multivao" && p.cobertura !== "geminada") nv = [];
      if (d.tipo === "ponte" && num(p.rodaMax, 0) > 0) nv = nv.filter(function (x) { return !/sem as cargas/.test(x); });   /* com as cargas do fabricante a ponte entra */
      el("nv").innerHTML = nv.map(function (x) { return "<li>Não verificado: " + esc(x) + "</li>"; }).join("");
      el("erro").textContent = e || "";
      el("resumo").textContent = m && m.ok ? m.resumo : "";
      el("avisos").innerHTML = m && m.ok ? m.avisos.concat(m.decisoes).slice(0, 5).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") : "";
      d.parLido = p;
      return m;
    },
    /* o texto das posições: a conta do espaçamento, os divisores exatos e a opção de ajustar as pontas */
    htmlPosicoes: function (pn, T) {
      var M = MP(), r = pn && pn.posicoesInfo; if (!r) return "";
      var h = "<p><b>Pórticos:</b> " + esc(r.explicacao) + "</p>";
      if (pn.definirPor === "espacamento") {
        var s = num(pn.espacamentoDesejado, pn.espacamento), semSobra = Math.abs(pn.comprimento / s - Math.round(pn.comprimento / s)) < 1e-9;
        (r.sugestoes || []).forEach(function (x) { h += '<button type="button" data-mpo-pos="esp:' + x.v + '">Usar ' + br(x.v, 2) + " (" + x.m + " vãos)</button>"; });
        if (!semSobra && T && T.motor !== "galpao") {
          var pp = M.posicoesPorticos(pn.comprimento, { modo: "espacamento", s: s, ajuste: "pontas" });
          if (pp.ok && pp.pontas) {
            if (pn.ajuste === "pontas") h += '<button type="button" data-mpo-pos="iguais">Voltar a vãos todos iguais</button>';
            else h += '<button type="button" data-mpo-pos="pontas">Manter ' + br(s, 2) + " e ajustar os vãos das pontas</button>";
            h += '<p class="mpo-pos-r">' + pp.pontas.internos + " vãos de " + br(s, 2) + " + 2 vãos de pontas de " + br(pp.pontas.ponta, 3) + " m (" + pp.n + " pórticos)" + (pp.pontas.juntou ? " — ponta menor que metade do espaçamento, juntada ao vão vizinho" : "") + ".</p>";
          }
        } else if (!semSobra && T && T.motor === "galpao") h += '<p class="mpo-pos-r">Neste tipo o motor do galpão só faz vãos iguais.</p>';
      }
      return h;
    },
    _confirmar: function (calcular, atualizar) {
      var d = this._dlg, M = MP(); if (!d || !M) return false;
      var p = this.ler(), e = M.validar(d.tipo, p);
      if (e) { var er = d.raiz && d.raiz.querySelector('[data-mpo="erro"]'); if (er) er.textContent = e; return false; }
      this._ultimoPar = this._ultimoPar || {}; this._ultimoPar[d.tipo] = clone(p); this._ultimo = { tipo: d.tipo };
      UI.fecharModal();
      var tipo = d.tipo, alvo = atualizar ? d.alvo : null; this._dlg = null;
      return this.criar(tipo, p, { calcular: calcular, alvo: alvo });
    },

    /* ------------------------------------------------------------ criar (e calcular) */
    criar: function (tipo, par, op) {
      op = op || {};
      var M = MP(), U = MU(), self = this; if (!M || !U) { toast("O modelador da metálica não carregou.", "erro"); return null; }
      var T = M.TIPOS[tipo], p = M.normalizar(tipo, par);
      if (T.motor === "galpao") {
        var rg = U.gerarGalpao(M.parGalpaoBIM(tipo, p), {});
        if (!rg || !rg.ok) return rg;
        /* a alma cheia é um GALPÃO do assistente no modelo (caixa.galpao): o Cálculo do galpão o atualiza ("Atualizar o galpão no
           modelo"), sem marca própria da biblioteca */
        this.ultimo = { tipo: tipo, motor: "galpao", galpaoId: rg.galpaoId, resumo: rg.resumo };
        if (op.calcular && global.MetalCalcUI && MetalCalcUI.preparar) {
          /* o gerador do galpão abre a janela de avisos do modelador (Conferência — NBR 8800): no "Criar e calcular" ela ficaria
             por cima do cálculo — fecha e resume num aviso (a lista inteira continua em Ligações › Conferir furos) */
          var nAv = (rg.avisos || []).length + (rg.avisosLigacoes || []).length;
          if (nAv) { try { UI.fecharModal(); } catch (eF) {} toast(rg.resumo + ' — ' + nAv + ' aviso(s) do modelador: Ligações › Conferir furos lista cada um.', 'aviso', 9000); }
          MetalCalcUI.preparar({ geometria: { vao: p.vao, comprimento: p.comprimento, espacamento: p.espacamento, peDireito: p.peDireito, inclinacaoPct: p.inclinacao, aguas: p.aguas, base: p.base }, fechamento: p.fechamento, contraventamento: p.contraventamento, galpaoId: rg.galpaoId, modelo: null });
          MetalCalcUI.abrir(99);
          try { MetalCalcUI.calcular(); } catch (eC) {}
        }
        return rg;
      }
      var g = M.gerar(tipo, p, function () { return self.novoId(); }, { ligDim: op.ligDim || null, porticoId: op.alvo ? op.alvo.id : null, edicoes: op.alvo && global.MetalElemento ? global.MetalElemento.edicoesDe(this.caixas(), op.alvo.id) : null });   /* 21/11: as edições por tipo voltam no pórtico refeito */
      if (!g.ok) { toast(T.rotulo + ": " + g.motivo, "aviso", 9000); status(g.motivo); return g; }
      if (op.alvo) { g.op.ops = op.alvo.pecas.map(function (id) { return { op: "apagar", id: id }; }).concat(g.op.ops); g.op.pedido = "Atualizar o pórtico (" + op.alvo.n + " peças refeitas)"; }
      if (!U.enviar(g.op)) { toast("O editor recusou o pórtico.", "erro"); g.ok = false; return g; }
      this.ultimo = { tipo: tipo, motor: "livre", porticoId: g.porticoId, resumo: g.resumo, n: g.pecas.length, naoVerificados: g.naoVerificados };
      var tx = (op.alvo ? "Pórtico atualizado no lugar — " : "") + g.resumo + " Ctrl+Z desfaz.";
      status(tx); toast(tx, "ok", 9000);
      try { var PU = global.MetalProntasUI; if (PU && PU.enquadrar) { var fin = {}; g.pecas.forEach(function (c) { fin[c.id] = c; }); PU.enquadrar({ finais: fin }); } } catch (eE) {}
      if (op.calcular && global.MetalCalcLivreUI && MetalCalcLivreUI.preparar) {
        var pre = M.presetLivre(tipo, p, g, this.caixas());
        /* 20/11/2026 (achado na e2e): o vento da tipologia (Pedido Gabriel: Castanhal-PA) vai para a tela do cálculo — sem ele o
           "Criar e calcular" parava em "falta o local da obra" */
        if (p.vento) { pre.vento = {}; Object.keys(p.vento).forEach(function (k) { pre.vento[k] = p.vento[k]; }); pre.vento.ativo = true; }
        MetalCalcLivreUI.preparar(pre);
        MetalCalcLivreUI.abrir(3);
        try { MetalCalcLivreUI.calcular(); } catch (eL) {}
      }
      return g;
    }
  };
  global.MetalPorticosUI = MetalPorticosUI;
})(typeof window !== "undefined" ? window : this);
