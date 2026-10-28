/* =====================================================================
 * hidpressao.js — PRESSURIZAÇÃO DA ÁGUA FRIA (motor PURO, ES5, Node-testável).
 *
 * Pedido do Rogério (18/10/2026): "Num projeto, a pressão não ficou boa porque a
 * caixa d'água está baixa. A gente tem a opção de colocar um equipamento que aumenta
 * a pressão. Do catálogo dos fabricantes, modela o equipamento, modela tudo o que
 * precisa."
 *
 *   HidPressao.diagnosticar(res, entrada, R)   ← chamado pelo js/hiddimensionar.js
 *       os avisos "pressão insuficiente" da água fria ganham corrigir.opcoes =
 *       (a) elevar o reservatório (altura calculada pelo próprio HidAF),
 *       (b) aumentar o DN do caminho (HidAF de novo, sem trava),
 *       (c) PRESSURIZADOR escolhido NA CURVA do fabricante (ponto de operação,
 *           NPSH, altura de sucção, pressão máxima do corpo) com a instalação
 *           inteira em ops (bombas, base, uniões, registros, retenção, by-pass,
 *           dreno, ponto de força),
 *       (d) conjunto de pressurização predial (quando o catálogo tem e o caso pede).
 *       Cada opção leva custo estimado (SINAPI real ou "pendente" com o motivo) e a
 *       consequência. res.pressurizacao guarda o memorial parametrizado.
 *   HidPressao.selecionar(cfg)        → comparativo de TODOS os candidatos na curva
 *   HidPressao.instalacao(cfg)        → ops da instalação (traçado ortogonal)
 *   HidPressao.familias()             → famílias .opfam de cada modelo (VOLUMETRIA do
 *                                       produto pelas partes lidas da ficha) + base,
 *                                       união e ponto de força
 *   HidPressao.equipamento(famId)     → o HidGrafo trata a bomba como ARESTA com ganho
 *   HidPressao.ganho(famId, tipoId, q)→ o HidAF soma a altura da curva na vazão do trecho
 *   HidPressao.fechado(idAcessorio)   → by-pass e entrada da reserva: normalmente FECHADOS
 *
 * ⚠ Nenhum número de PRODUTO ou de NORMA aqui (tools/test-hid-sem-numero-magico.js):
 *   curva, cotas, bocais, tensão → js/hidpressaodados.js (fichas com página);
 *   folgas de desenho da instalação → _instalacao.json (decisão da RA com o porquê);
 *   pressão mínima, nº de bombas, margem de NPSH → HidNormas (faltou = pendente).
 * ⚠ Opção sem ação automática vira NOTA (sem botão): botão que não faz nada é o defeito
 *   que o js/problemacard.js existe para impedir.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("HidPressaoDados", "./hidpressaodados.js") || { modelos: [], geometria: {}, decisoes: {}, sinapi: { itens: {} }, dnDaPol: {}, fabricantes: [] }; }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function HP() { return dep("HidPerda", "./hidperda.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function AFm() { return dep("HidAF", "./hidaf.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function txt(v) { return v == null ? "" : String(v); }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function f1(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }   // hid:ok 1 casa decimal (texto)
  function rs(v) { return v == null || !isFinite(v) ? "—" : "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }   // hid:ok milhar do texto
  var MM = 1000, S_H = 3600, LS = 1000;
  var PREF = "hid-pz-";
  var CASAS = 10000;   // hid:ok o biminst grava 4 casas (0,1 mm)
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  var EPS = 1e-6;      // hid:ok tolerância numérica

  function geo(k) { var g = D().geometria[k]; return g && isFinite(Number(g.valor)) ? Number(g.valor) : null; }
  function decisao(k) { return txt(D().decisoes[k]); }

  /* ======================================================== CATÁLOGO */
  function modelos() { return arr(D().modelos); }
  function modelo(id) { var l = modelos(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function famIdDe(m) { return PREF + m.id; }
  /* o traçado da instalação sabe ligar: sucção no eixo (−X) e recalque para cima ou para os lados (±X) */
  function rotavel(m) { var c = m && m.conexoes; return !!(m && m.modelavel && c && c.succao && c.recalque && c.succao.dir === "-x" && /^(\+y|-x|\+x)$/.test(txt(c.recalque.dir))); }
  function motivoNaoModela(m) { return m.modelavel ? (rotavel(m) ? "" : "bocais " + txt(m.conexoes.succao.dir) + "/" + txt(m.conexoes.recalque.dir) + " fora do traçado automático (sucção no eixo −X)") : arr(m.naoModelavel).join("; "); }
  function ehPressurizador(m) { return m && m.tipo !== "centrifuga"; }
  function modeloDoFam(famId) { var s = txt(famId); if (s.indexOf(PREF) !== 0) return null; return modelo(s.slice(PREF.length)); }
  function dnDaPol(p) { var v = D().dnDaPol[txt(p).replace(/"/g, "").trim()]; return v == null ? null : v; }
  function fonteTxt(m, f) {
    if (!m || !f) return "sem fonte";
    var c = m.catalogosDoItem && m.catalogosDoItem[f.catalogo];
    return m.fabricante + " — " + (c ? c.arquivo : f.catalogo) + ", pág. " + f.pagina + (f.como ? " (" + f.como + ")" : "");
  }
  function pontosCurva(m) { return arr(m && m.curva && m.curva.pontos).map(function (p) { return { Q: Number(p.Q), H: Number(p.H) }; }).sort(function (a, b) { return a.Q - b.Q; }); }
  function interp(pts, x, kx, ky) {
    for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i]; if (x <= b[kx] + EPS) return b[kx] === a[kx] ? b[ky] : a[ky] + (b[ky] - a[ky]) * (x - a[kx]) / (b[kx] - a[kx]); }
    return null;
  }
  /* altura (mca) da curva na vazão Q (m³/h). Abaixo da menor vazão TABELADA: a altura dessa vazão (a curva real
     sobe para a esquerda — usar a da ponta é o lado seguro, e diz-se). Acima da maior: null (fora do catálogo). */
  function altura(m, Q) {
    var p = pontosCurva(m); if (p.length < 2) return null;
    if (Q < p[0].Q) return { H: p[0].H, abaixo: true };
    if (Q > p[p.length - 1].Q + EPS) return null;
    return { H: interp(p, Q, "Q", "H"), abaixo: false };
  }
  function alturaMax(m) { var p = pontosCurva(m); return p.length ? Math.max.apply(null, p.map(function (x) { return x.H; })) : null; }
  function vazaoMax(m) { var p = pontosCurva(m); return p.length ? p[p.length - 1].Q : null; }
  function npshr(m, Q) {
    var p = arr(m && m.npshr && m.npshr.pontos).map(function (x) { return { Q: Number(x.Q), H: Number(x.H) }; }).sort(function (a, b) { return a.Q - b.Q; });
    if (p.length < 2) return null;
    if (Q < p[0].Q) return p[0].H;
    if (Q > p[p.length - 1].Q + EPS) return null;
    return interp(p, Q, "Q", "H");
  }
  function sinapi(chave) { var x = D().sinapi.itens[chave]; return x ? x : { pendente: true, motivo: "sem regra SINAPI para " + chave }; }

  /* ======================================================== FAMÍLIAS (volumetria do produto)
   * Uma família POR MODELO: as partes da ficha (corpo, voluta, motor, fluxostato/controlador, tanque, pés, bocais)
   * nas posições lidas do desenho dimensional, em metros; origem no piso sob a boca de sucção, X ao longo do eixo da
   * bomba (para o motor), Y para cima, Z lateral. Os conectores são os bocais (rosca → DN do soldável, NBR 5648). */
  var COR = { azul: "Azul", preto: "Preto", cinza: "Cinza escuro", inox: "Metal cromado", latao: "Metal cromado", concreto: "Concreto" };
  function S(v) { return String(r4(v)); }
  /* hid:geometria-inicio — perfil da CÚPULA (tampa abaulada do tanque de expansão): fração do raio × fração da altura */
  var PERFIL_CUPULA = [[1, 0], [1, 0.45], [0.92, 0.7], [0.72, 0.88], [0.4, 0.98], [0, 1]];
  /* caixa do ponto de força (caixa 4"×2" com tomada) e a união roscável: proporção de desenho */
  var CAIXA_PF = { dx: 0.075, dy: 0.12, dz: 0.05 };
  var UNIAO_FATOR_D = 1.6, UNIAO_PORCA = 0.4;
  /* aletas: começam/terminam a 6 % das pontas do motor; não há aleta no quarto de baixo (o pé) */
  var ALETA_PONTA = 0.06, ALETA_FUNDO = 0.5;
  /* hid:geometria-fim */
  /* cor da parte = a da FOTO do catálogo (paleta do _instalacao.json): o que é redondo vira REVOLUÇÃO com a cor em hex
     (o 3D e o ícone usam a mesma cor — antes o 3D saía cinza porque o nome "verde"/"bege" não estava na biblioteca);
     a caixa usa o nome do material da paleta (preto, branco, laranja, verde, bege…) */
  function corDe(nome) { var c = (D().cores || {})[nome]; return c && c.hex ? c : { hex: "", material: COR[nome] || "Cinza escuro" }; }
  function rev(id, nome, base, eixo, perfil, cor) {
    var sg = eixo.charAt(0) === "-" ? -1 : 1, e = eixo.replace("-", "");
    var o = { id: id, nome: nome, forma: "revolucao", eixo: e, x: S(base.x), y: S(base.y), z: S(base.z), perfil: perfil.map(function (q) { return [S(Math.max(0, q[1])), S(sg * q[0])]; }), material: cor.material };
    return o;
  }
  /* parte da ficha (mm, centro) → sólido(s) da família (m) */
  function solidosDaParte(p) {
    var c = p.centro || p.base || {}, cx = num(c.x, 0) / MM, cy = num(c.y, 0) / MM, cz = num(c.z, 0) / MM, cr = corDe(p.cor), nm = p.nome || p.id;
    if (p.forma === "caixa") { var o = { id: p.id, nome: nm, forma: "caixa", x: S(cx), y: S(cy - num(p.dy, 0) / MM / 2), z: S(cz), dx: S(num(p.dx, 0) / MM), dy: S(num(p.dy, 0) / MM), dz: S(num(p.dz, 0) / MM), material: cr.material }; return [o]; }
    if (p.forma === "torno") return [rev(p.id, nm, { x: cx, y: cy, z: cz }, txt(p.eixo || "y"), arr(p.perfil).map(function (q) { return [num(q[0], 0) / MM, num(q[1], 0) / MM]; }), cr)];
    var e = p.eixo === "x" || p.eixo === "z" ? p.eixo : (p.forma === "motor_aletado" ? "x" : "y"), L = num(p.comprimento, 0) / MM, r = num(p.diametro, 0) / MM / 2;
    if (p.forma === "cilindro" || p.forma === "motor_aletado") {
      var b0 = { x: e === "x" ? cx - L / 2 : cx, y: e === "y" ? cy - L / 2 : cy, z: e === "z" ? cz - L / 2 : cz };
      var out = [rev(p.id, nm, b0, e, [[0, 0], [0, r], [L, r], [L, 0]], cr)];
      if (p.forma === "motor_aletado") {
        /* as ALETAS de refrigeração do motor: nervuras ao longo do eixo, em volta da carcaça (n e altura da ficha/foto) */
        var n = Math.max(1, num(p.aletas, 0)), ha = num(p.alturaAleta, 0) / MM, ra = ha / 2, Ra = r + ha / 2, k;
        for (k = 0; k < n; k++) {
          var an = 2 * Math.PI * k / n, dy = Ra * Math.cos(an), dz = Ra * Math.sin(an);
          if (dy < -r * ALETA_FUNDO) continue;   /* embaixo fica o pé: sem aleta */
          var a = { id: p.id + "-aleta" + k, nome: "Aleta", forma: "cilindro", eixo: "x", x: S(b0.x + L * ALETA_PONTA), y: S(cy + dy), z: S(cz + dz), raio: S(ra), altura: S(L * (1 - 2 * ALETA_PONTA)), material: cr.material };
          out.push(a);
        }
      }
      return out;
    }
    var R = num(p.diametro, 0) / MM / 2, Hc = num(p.altura, 0) / MM;
    return [rev(p.id, nm, { x: cx, y: cy, z: cz }, "y", PERFIL_CUPULA.map(function (q) { return [Hc * q[1], R * q[0]]; }), cr)];
  }
  function P(nome, tipoDado, valor, desc, escopo) { return { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: "RA_Hidro", descricao: desc }; }
  var PARAMS_BOMBA = [
    P("Fabricante", "texto", "", "Fabricante"), P("Modelo", "texto", "", "Modelo do catálogo"), P("Codigo", "texto", "", "Código/modelo do fabricante (não é código SINAPI)"),
    P("Pagina_ficha", "inteiro", 0, "Página da ficha com a tabela de seleção"), P("Tipo_controle", "texto", "", "fluxostato / pressostato com tanque / inversor"),
    P("Potencia_cv", "numero", 0, "Potência do motor (cv) da ficha"), P("Potencia_W", "numero", 0, "Potência elétrica (W) da ficha (0 = a ficha não dá)"),
    P("Tensao_V", "texto", "", "Tensão(ões) da ficha"), P("Corrente_A", "texto", "", "Corrente da ficha (vazio = não dá)"),
    P("Pressao_max_mca", "numero", 0, "Pressão máxima admissível do sistema (ficha)"), P("Bocal_succao", "texto", "", "Rosca do bocal de sucção"), P("Bocal_recalque", "texto", "", "Rosca do bocal de recalque"),
    P("Arquivo_ficha", "texto", "", "PDF do fabricante (biblioteca técnica)"), P("Link_ficha", "texto", "", "Endereço público da ficha"), P("Pagina_curva", "inteiro", 0, "Página da tabela de seleção"),
    P("Pagina_cotas", "inteiro", 0, "Página do desenho dimensional"), P("Conferir", "texto", "", "O que conferir na ficha"), P("A_conferir", "simnao", true, "Partes da volumetria lidas do desenho")
  ];
  /* direção de saída do tubo no bocal (papel/dir — frente 2, 27/10/2026): a ficha traz "dir" ("-x", "+y"…) em 12 dos 19 modelos; nos demais fica
     o padrão do desenho (sucção no eixo −X, recalque para cima) e a pendência vai em aConferir. Convenção local do js/familia.js. */
  function dirDoBocal(t, padrao) {
    var m = /^([+-])([xyz])$/.exec(txt(t)), o = { x: 0, y: 0, z: 0 };
    if (!m) o[padrao.eixo] = padrao.sinal; else o[m[2]] = m[1] === "-" ? -1 : 1;
    return { dir: o, lido: !!m };
  }
  function conectorBocal(id, rotulo, b, papel, padrao) {
    var d = dirDoBocal(b.dir, padrao);
    return { id: id, nome: rotulo + txt(b.rosca), sistema: "agua_fria", dn: String(dnDaPol(b.pol) || 0), x: S(num(b.x, 0) / MM), y: S(num(b.y, 0) / MM), z: S(num(b.z, 0) / MM),
             papel: papel, dir: d.dir, origemPos: "catalogo", aConferir: d.lido ? "" : "a ficha não diz a direção do bocal: padrão do desenho (sucção no eixo −X, recalque para cima)" };
  }
  function familiaBomba(m) {
    var cs = m.conexoes || {}, s = cs.succao || {}, r = cs.recalque || {}, el = m.eletrica || {}, cat0 = m.curva && m.curva.fonte ? m.catalogosDoItem[m.curva.fonte.catalogo] : null;
    var valores = { Fabricante: m.fabricante, Modelo: m.modelo, Codigo: txt(m.codigo || m.modelo), Pagina_ficha: num(m.curva && m.curva.fonte && m.curva.fonte.pagina, 0), Tipo_controle: txt(m.controle && m.controle.tipo || m.tipo), Potencia_cv: num(el.potencia_cv, 0), Potencia_W: num(el.potencia_W, 0),
                    Tensao_V: arr(el.tensao_V).join(" ou ") + (arr(el.tensao_V).length ? " V" : ""), Corrente_A: el.corrente_A ? Object.keys(el.corrente_A).map(function (k) { return k + " V: " + el.corrente_A[k] + " A"; }).join("; ") : "",
                    Pressao_max_mca: num(m.limites && m.limites.pressao_max_sistema_mca, 0), Bocal_succao: txt(s.rosca), Bocal_recalque: txt(r.rosca),
                    Arquivo_ficha: cat0 ? cat0.arquivo : "", Link_ficha: cat0 ? (cat0.url || "biblioteca técnica: " + cat0.arquivo) : "", Pagina_curva: num(m.curva && m.curva.fonte && m.curva.fonte.pagina, 0),
                    Pagina_cotas: num(m.dimensoes && m.dimensoes.fonte && m.dimensoes.fonte.pagina, 0), Conferir: txt(m.partesOrigem), A_conferir: true };
    return {
      id: famIdDe(m), nome: "Pressurizador " + m.fabricante + " " + m.modelo, categoria: "equipamento", hospedagem: "livre", pset: "RA_Hidro", origem: "HidPressao",
      descricao: "Pressurizador de água fria " + m.fabricante + " " + m.modelo + " com a volumetria da ficha (" + fonteTxt(m, m.dimensoes && m.dimensoes.fonte) + "). Origem no piso sob a boca de sucção; X ao longo do eixo da bomba. [Gerada do catálogo — regerar por HidPressao.]",
      avisos: [txt(m.partesOrigem)], sistemas: ["agua_fria"], parametros: copia(PARAMS_BOMBA),
      tipos: [{ id: "t-" + m.id, nome: m.fabricante + " " + m.modelo, valores: valores, fonte: fonteTxt(m, m.curva && m.curva.fonte), avisos: [], conferir: [txt(m.partesOrigem)] }],
      solidos: arr(m.partes).reduce(function (l, p) { return l.concat(solidosDaParte(p)); }, []),
      conectores: [conectorBocal("succao", "Sucção ", s, "succao", { eixo: "x", sinal: -1 }), conectorBocal("recalque", "Recalque ", r, "recalque", { eixo: "y", sinal: 1 })],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Pressurizador " + m.fabricante + " " + m.modelo },
      pressurizador: { modelo: m.id }
    };
  }
  /* BASE DE CONCRETO (a base NÃO é produto de catálogo: é a laje de concreto que o projeto põe sob o equipamento, com os chumbadores nos cantos dos pés da ficha).
     27/10/2026 ("uma família por peça"): eram 12 famílias de mesma forma, uma por modelo; agora é UMA, `hid-pz-base`, parametrizada pelo contorno dos pés do modelo
     (cada modelo é um TIPO "t-<id do modelo>"). As 12 antigas (`hid-pz-base-<modelo>`) continuam definidas como ALIAS (ocultas do menu) para o projeto antigo abrir —
     a migração (js/famhidmigra.js, tabela do JSON) leva cada uma ao tipo do seu modelo, na mesma posição (a base não tem conector: a origem não se move). */
  function pesDoModelo(m) {
    var pe = arr(m.partes).filter(function (p) { return p.id === "pes"; })[0] || { centro: { x: num(m.dimensoes && m.dimensoes.comprimento, 0) / 2, y: 0, z: 0 }, dx: num(m.dimensoes && m.dimensoes.comprimento, 0), dz: num(m.dimensoes && m.dimensoes.largura, 0) };
    return { cx: num(pe.centro.x, 0) / MM, cz: num(pe.centro.z, 0) / MM, dx: num(pe.dx, 0) / MM, dz: num(pe.dz, 0) / MM };
  }
  /* a base de UM modelo, sob o id antigo (alias oculto) */
  function familiaBase(m) {
    var pe = pesDoModelo(m), fol = geo("baseFolga"), hB = geo("baseAltura"), dCh = geo("chumbadorDiametro");
    var sol = [{ id: "laje", nome: "Base de concreto", forma: "caixa", x: S(pe.cx), y: "0", z: S(pe.cz), dx: S(pe.dx + 2 * fol), dy: S(hB), dz: S(pe.dz + 2 * fol), material: "Concreto" }];
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (q, i) {
      sol.push({ id: "chumbador" + i, nome: "Chumbador", forma: "cilindro", eixo: "y", x: S(pe.cx + q[0] * (pe.dx / 2 - dCh)), y: S(hB), z: S(pe.cz + q[1] * (pe.dz / 2 - dCh)), raio: S(dCh / 2), altura: S(dCh * 2), material: "Metal cromado" });
    });
    return { id: PREF + "base-" + m.id, oculta: true, substituidaPor: PREF + "base", nome: "Base do pressurizador " + m.fabricante + " " + m.modelo, categoria: "equipamento", hospedagem: "livre", pset: "RA_Hidro", origem: "HidPressao",
             descricao: decisao("pz.base") + " Contorno dos pés da ficha + " + f2(fol * CASAS / CASAS) + " m de borda; altura " + f2(hB) + " m. [Substituída por " + PREF + "base: tipo t-" + m.id + ".]", avisos: [], sistemas: [], parametros: [P("Modelo", "texto", m.modelo, "Equipamento apoiado")],
             tipos: [{ id: "t-generico", nome: "Base " + m.modelo, valores: { Modelo: m.modelo }, fonte: "", avisos: [], conferir: [] }], solidos: sol, conectores: [],
             quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Base de concreto para pressurizador" } };
  }
  /* a base ÚNICA: um tipo por modelo (contorno dos pés da ficha), laje + 4 chumbadores. Mesmos sólidos e mesmas medidas das 12 antigas. */
  function familiaBaseUnica() {
    var ms = modelos().filter(function (m) { return m.modelavel; }), fol = geo("baseFolga"), hB = geo("baseAltura"), dCh = geo("chumbadorDiametro");
    var ps = [P("Modelo", "texto", "", "Equipamento apoiado", "tipo"), P("Pes_cx", "comprimento", 0, "Centro dos pés da ficha, ao longo do eixo da bomba (m)", "tipo"), P("Pes_cz", "comprimento", 0, "Centro dos pés da ficha, lateral (m)", "tipo"),
              P("Pes_dx", "comprimento", 0, "Comprimento do contorno dos pés (ficha)", "tipo"), P("Pes_dz", "comprimento", 0, "Largura do contorno dos pés (ficha)", "tipo"),
              P("Borda", "comprimento", fol, "Folga da laje além dos pés (decisão do projeto)", "tipo"), P("Altura_base", "comprimento", hB, "Altura da laje (decisão do projeto)", "tipo"), P("Chumbador_d", "comprimento", dCh, "Diâmetro do chumbador (decisão do projeto)", "tipo")];
    var sol = [{ id: "laje", nome: "Base de concreto", forma: "caixa", x: "Pes_cx", y: "0", z: "Pes_cz", dx: "Pes_dx + 2*Borda", dy: "Altura_base", dz: "Pes_dz + 2*Borda", material: "Concreto" }];
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (q, i) {
      sol.push({ id: "chumbador" + i, nome: "Chumbador", forma: "cilindro", eixo: "y", x: "Pes_cx " + (q[0] < 0 ? "-" : "+") + " (Pes_dx/2 - Chumbador_d)", y: "Altura_base", z: "Pes_cz " + (q[1] < 0 ? "-" : "+") + " (Pes_dz/2 - Chumbador_d)", raio: "Chumbador_d/2", altura: "Chumbador_d*2", material: "Metal cromado" });
    });
    return { id: PREF + "base", nome: "Base de concreto do pressurizador", categoria: "equipamento", hospedagem: "livre", pset: "RA_Hidro", origem: "HidPressao",
             descricao: decisao("pz.base") + " Um tipo por modelo (contorno dos pés da ficha + borda). Origem: a mesma do pressurizador (sob a boca de sucção).", avisos: [], sistemas: [], parametros: ps,
             tipos: ms.map(function (m) { var pe = pesDoModelo(m); return { id: "t-" + m.id, nome: "Base " + m.fabricante + " " + m.modelo, valores: { Modelo: m.modelo, Pes_cx: pe.cx, Pes_cz: pe.cz, Pes_dx: pe.dx, Pes_dz: pe.dz }, fonte: fonteTxt(m, m.dimensoes && m.dimensoes.fonte), avisos: [], conferir: [] }; }),
             solidos: sol, conectores: [], quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Base de concreto para pressurizador" } };
  }
  /* união roscável (h = eixo X; v = eixo Y): dois conectores nas faces, porca no meio */
  function familiaUniao(vertical) {
    var L = geo("comprimentoUniao"), e = vertical ? "y" : "x";
    var ps = [P("DN", "numero", 25, "DN do tubo (mm)", "instancia"), P("Comprimento", "comprimento", L, "Comprimento da união", "instancia")];   // hid:ok DN de partida; a instância recebe o DN real
    var corpo = { id: "corpo", nome: "Corpo da união", forma: "cilindro", eixo: e, x: "0", y: "0", z: "0", raio: "DN/1000*" + UNIAO_FATOR_D + "/2*0.8", altura: "Comprimento", material: corDe("pvc_roscavel").material };   // hid:ok proporção de desenho
    var porca = { id: "porca", nome: "Porca", forma: "cilindro", eixo: e, x: vertical ? "0" : "Comprimento*" + (1 - UNIAO_PORCA) / 2, y: vertical ? "Comprimento*" + (1 - UNIAO_PORCA) / 2 : "0", z: "0", raio: "DN/1000*" + UNIAO_FATOR_D + "/2", altura: "Comprimento*" + UNIAO_PORCA, material: corDe("pvc_roscavel").material };
    return { id: PREF + "uniao-" + (vertical ? "v" : "h"), nome: "União roscável (" + (vertical ? "vertical" : "horizontal") + ")", categoria: "acessorio_tubo", hospedagem: "livre", pset: "RA_Hidro", origem: "HidPressao",
             descricao: decisao("pz.uniao"), avisos: [], sistemas: ["agua_fria"], parametros: ps, tipos: [{ id: "t-generico", nome: "União roscável", valores: {}, fonte: "", avisos: [], conferir: [] }], solidos: [corpo, porca],
             conectores: [{ id: "a", nome: "Face 1 (entrada)", sistema: "agua_fria", dn: "DN", x: "0", y: "0", z: "0", papel: "entrada", dir: vertical ? { x: 0, y: -1, z: 0 } : { x: -1, y: 0, z: 0 }, bidirecional: true, origemPos: "extremidade" },
                          { id: "b", nome: "Face 2 (saída)", sistema: "agua_fria", dn: "DN", x: vertical ? "0" : "Comprimento", y: vertical ? "Comprimento" : "0", z: "0", papel: "saida", dir: vertical ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }, bidirecional: true, origemPos: "extremidade" }],
             quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "União roscável" } };
  }
  function familiaPontoForca() {
    var ps = [P("Tensao_V", "texto", "", "Tensão do equipamento (ficha)", "instancia"), P("Potencia_W", "numero", 0, "Potência elétrica (W; 0 = a ficha não dá)", "instancia"), P("Potencia_cv", "numero", 0, "Potência do motor (cv)", "instancia"),
              P("Corrente_A", "texto", "", "Corrente da ficha", "instancia"), P("Equipamento", "texto", "", "Equipamento atendido", "instancia")];
    return { id: PREF + "ponto-forca", nome: "Ponto de força do pressurizador", categoria: "dispositivo_eletrico", hospedagem: "livre", pset: "RA_Hidro", origem: "HidPressao",
             descricao: decisao("pz.eletrica"), avisos: ["Circuito, disjuntor e DR: pendência do projeto elétrico."], sistemas: [], parametros: ps,
             tipos: [{ id: "t-generico", nome: "Ponto de força (tomada 2P+T)", valores: {}, fonte: "", avisos: [], conferir: [] }],
             solidos: [{ id: "caixa", nome: "Caixa 4x2 com tomada", forma: "caixa", x: "0", y: "0", z: "0", dx: S(CAIXA_PF.dx), dy: S(CAIXA_PF.dy), dz: S(CAIXA_PF.dz), material: "Branco" }], conectores: [],
             quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Ponto de força (pendente: projeto elétrico)" } };
  }
  var CACHE_F = null;
  function familias() {
    if (CACHE_F) return CACHE_F;
    var out = [];
    modelos().forEach(function (m) { if (m.modelavel) { out.push(familiaBomba(m)); out.push(familiaBase(m)); } });
    out.push(familiaBaseUnica());
    out.push(familiaUniao(false)); out.push(familiaUniao(true)); out.push(familiaPontoForca());
    CACHE_F = out; return out;
  }
  function familia(famId) { var l = familias(); for (var i = 0; i < l.length; i++) if (l[i].id === famId) return l[i]; return null; }

  /* ======================================================== GANCHOS DO CÁLCULO (HidGrafo / HidAF) */
  /* a família é equipamento EM LINHA? bomba (ganho pela curva) ou passagem (união: sem ganho, perda de luva) */
  function equipamento(famId) {
    var m = modeloDoFam(famId);
    if (m && m.modelavel) return { papel: "bomba", entrada: "succao", saida: "recalque", modelo: m };
    if (famId === PREF + "uniao-h" || famId === PREF + "uniao-v") return { papel: "passagem", entrada: "a", saida: "b" };
    return null;
  }
  /* ⚠ by-pass e entrada da bomba RESERVA: registros NORMALMENTE FECHADOS — no cálculo não existem (senão o by-pass e as
     duas bombas em paralelo viram ANEL e o HidAF não calcula a rede ramificada). O id é dado por instalacao(). */
  var RE_FECHADO = /^pz\d+-(bp-rg|u[1-9]\d*-rs)$/;   // hid:ok dígito da regex (u1, u2…), não número de norma
  function fechado(id) { return RE_FECHADO.test(txt(id)); }
  /* ganho da bomba na vazão q (L/s) do trecho — { H, Q, abaixo, passos } ou null (fora da curva) */
  function ganho(famId, q) {
    var m = modeloDoFam(famId); if (!m) return null;
    var Q = num(q, 0) * S_H / LS, a = altura(m, Q);
    if (!a) return { H: null, Q: Q, passos: ["vazão " + f2(Q) + " m³/h acima da maior vazão da tabela de seleção (" + f2(vazaoMax(m)) + " m³/h): fora da curva — " + fonteTxt(m, m.curva.fonte)] };
    return { H: a.H, Q: Q, abaixo: a.abaixo, modelo: m,
             passos: ["ganho do pressurizador " + m.fabricante + " " + m.modelo + ": H(" + f2(Q) + " m³/h) = " + f2(a.H) + " m pela curva (" + fonteTxt(m, m.curva.fonte) + ")" +
                      (a.abaixo ? "; vazão abaixo da menor tabelada: usada a altura dela (a curva sobe à esquerda — lado seguro)" : "")] };
  }
  function ganhoMax(famId) { var m = modeloDoFam(famId); return m ? alturaMax(m) : 0; }

  /* ======================================================== SELEÇÃO NA CURVA
   * cfg = { Q_m3h (vazão de projeto), Hnec(Q) → m (altura que a bomba precisa dar, com a curva do sistema),
   *         NAmin, NAmax (m), yEixo(m) → cota do eixo da sucção, hfSuc(Q) → m, altitude_m, temperatura_C, margemNpsh, ctx,
   *         filtro(m) }
   * Ponto de operação = cruzamento da curva da bomba com Hnec(Q) (bisseção); aprovada se Q_op ≥ Q de projeto e as
   * condições da ficha passam (afogada, sucção, pressão máxima do corpo, NPSH). */
  function selecionar(cfg) {
    var H = HH(), fl = H.agua(cfg.temperatura_C == null ? H.T_PADRAO_C : cfg.temperatura_C), patm = H.pressaoAtmosferica(num(cfg.altitude_m, 0));
    var Hatm = H.kpaParaM(patm - fl.pv_kpa, fl.rho), Qd = num(cfg.Q_m3h, 0), margem = cfg.margemNpsh;
    var linhas = [];
    modelos().filter(cfg.filtro || function () { return true; }).forEach(function (m) {
      var L = { id: m.id, modelo: m, nome: m.fabricante + " " + m.modelo, tipo: m.tipo, uso: m.uso, potencia_cv: num(m.eletrica && m.eletrica.potencia_cv, null), Qop: null, Hop: null,
                Hd: null, HnecD: cfg.Hnec(Qd), npshd: null, npshr: null, hs: null, pCorpo: null, aprovada: false, motivos: [], verifs: [], fonte: fonteTxt(m, m.curva && m.curva.fonte) };
      function vf(nome, ok, texto, fonte) { L.verifs.push({ nome: nome, ok: ok, texto: texto, fonte: fonte || null }); if (ok === false) L.motivos.push(texto); }
      var p = pontosCurva(m);
      if (p.length < 2) { vf("curva", false, "curva com menos de 2 pontos"); linhas.push(L); return; }
      var ad = altura(m, Qd); L.Hd = ad ? ad.H : null;
      /* ponto de operação: f(Q) = Hbomba(Q) − Hnec(Q), decrescente */
      function f(Q) { var a = altura(m, Q); return a ? a.H - cfg.Hnec(Q) : null; }
      var a0 = Math.min(Qd, p[0].Q), z0 = p[p.length - 1].Q, fa = f(a0), fz = f(z0);
      if (fa == null || fa < 0) vf("ponto de operação", false, "não vence a altura necessária nem na menor vazão (" + f2(altura(m, a0) && altura(m, a0).H) + " m < " + f2(cfg.Hnec(a0)) + " m)", L.fonte);
      else {
        if (fz > 0) { L.Qop = z0; L.alemDaCurva = true; }
        else { var a = a0, z = z0, TOLQ = 1e-6; while (z - a > TOLQ) { var mid = (a + z) / 2; if (f(mid) > 0) a = mid; else z = mid; } L.Qop = (a + z) / 2; }   // hid:ok precisão da bisseção (m³/h)
        L.Hop = altura(m, L.Qop).H;
        var okQ = L.Qop >= Qd - EPS;
        vf("ponto de operação", okQ, "Q = " + f2(L.Qop) + " m³/h, H = " + f2(L.Hop) + " m " + (okQ ? "≥" : "<") + " projeto " + f2(Qd) + " m³/h (Hnec " + f2(L.HnecD) + " m)" + (L.alemDaCurva ? " — o cruzamento passa do fim da tabela: vale o último ponto tabelado" : ""), L.fonte);
      }
      /* altura de sucção e instalação afogada */
      var lim = m.limites || {}, fLim = fonteTxt(m, lim.fonte), yE = cfg.yEixo(m), Qn = L.Qop != null ? L.Qop : Qd;
      L.hs = cfg.NAmin - yE;
      var exigeAfogada = /afogad/i.test(txt(lim.instalacao));
      if (exigeAfogada) vf("instalação afogada", L.hs > 0, "nível d'água mínimo " + f2(cfg.NAmin) + " m " + (L.hs > 0 ? ">" : "≤") + " eixo da sucção " + f2(yE) + " m (" + txt(lim.instalacao) + ")", fLim);
      if (num(lim.succao_max_mca, null) != null && L.hs < 0) vf("altura de sucção", -L.hs + cfg.hfSuc(Qn) <= num(lim.succao_max_mca, 0), "sucção " + f2(-L.hs + cfg.hfSuc(Qn)) + " m ≤ " + f2(lim.succao_max_mca) + " mca", fLim);
      /* NPSH: disponível × requerido (curva da ficha) + margem (HidNormas ou premissa do RT) */
      L.npshd = Hatm + L.hs - cfg.hfSuc(Qn); L.npshr = npshr(m, Qn);
      if (L.npshr == null) vf("NPSH", null, "NPSHr não publicado na ficha (" + txt(m.npshr && m.npshr.motivo) + "): NPSHd = " + f2(L.npshd) + " m; vale a condição do fabricante (afogada/sucção máxima)", fonteTxt(m, m.npshr && m.npshr.fonte));
      else if (margem == null) vf("NPSH", null, "NPSHd " + f2(L.npshd) + " m × NPSHr " + f2(L.npshr) + " m: margem de NPSH pendente (bombas.npsh.margem)", fonteTxt(m, m.npshr.fonte));
      else vf("NPSH", L.npshd >= L.npshr + margem, "NPSHd " + f2(L.npshd) + " m " + (L.npshd >= L.npshr + margem ? "≥" : "<") + " NPSHr " + f2(L.npshr) + " + margem " + f2(margem) + " m", fonteTxt(m, m.npshr.fonte));
      /* pressão no corpo: carga estática máxima na sucção + a maior altura da curva ≤ pressão máxima admissível da ficha */
      var hMax = alturaMax(m);
      if (num(lim.pressao_max_sistema_mca, null) != null) { L.pCorpo = (cfg.NAmax - yE) + hMax; vf("pressão máxima do corpo", L.pCorpo <= num(lim.pressao_max_sistema_mca, 0), "estática na sucção " + f2(cfg.NAmax - yE) + " m + maior altura da curva " + f2(hMax) + " m = " + f2(L.pCorpo) + " mca " + (L.pCorpo <= num(lim.pressao_max_sistema_mca, 0) ? "≤" : ">") + " " + f2(lim.pressao_max_sistema_mca) + " mca da ficha", fLim); }
      if (num(lim.pressao_max_succao_mca, null) != null) vf("pressão máxima de sucção", cfg.NAmax - yE <= num(lim.pressao_max_succao_mca, 0), "estática na sucção " + f2(cfg.NAmax - yE) + " mca ≤ " + f2(lim.pressao_max_succao_mca) + " mca", fLim);
      if (num(lim.temperatura_max_C, null) != null) vf("temperatura", fl.T <= num(lim.temperatura_max_C, 0), "água a " + f1(fl.T) + " °C ≤ " + f1(lim.temperatura_max_C) + " °C", fLim);
      L.aprovada = L.Qop != null && L.verifs.every(function (v) { return v.ok !== false; });
      L.pendente = L.aprovada && L.verifs.some(function (v) { return v.ok === null; });
      linhas.push(L);
    });
    var ap = linhas.filter(function (l) { return l.aprovada; }).sort(ordemEscolha);
    return { Q_m3h: Qd, linhas: linhas, escolha: ap[0] || null, Hatm_m: Hatm, fluido: { T: fl.T, rho: fl.rho, pv_kpa: fl.pv_kpa }, patm_kpa: patm };
  }

  /* escolha entre os aprovados: menor potência; empate → a menor SOBRA de altura na vazão de projeto (pressão a mais
     no ponto é ruído e consumo); empate → menor vazão no ponto de operação */
  function ordemEscolha(x, y) { return (num(x.potencia_cv, 0) - num(y.potencia_cv, 0)) || ((num(x.Hd, 0) - num(x.HnecD, 0)) - (num(y.Hd, 0) - num(y.HnecD, 0))) || (x.Qop - y.Qop); }
  /* tubo do RAMO de cada bomba (do coletor ao bocal e de volta): DN do BOCAL do fabricante — o HidAF não troca */
  var RE_RAMO = /^pz\d+-u\d+-/;
  function travado(id) { return RE_RAMO.test(txt(id)); }

  /* ======================================================== TRAÇADO DA INSTALAÇÃO (ops) */
  function soma(p, u, s) { return { x: p.x + u.x * s, y: p.y + u.y * s, z: p.z + u.z * s }; }
  function pt(p) { return { x: r4(p.x), y: r4(p.y), z: r4(p.z) }; }
  function unit(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; return { x: dx / L, y: dy / L, z: dz / L }; }
  function dist(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  var UP = { x: 0, y: 1, z: 0 };
  /* ⚠ no tubo de PVC soldável: REGISTRO DE ESFERA de PVC soldável (o usual na sucção/recalque de bomba; SINAPI 9448x) e
     RETENÇÃO de PVC — nunca a válvula de gaveta/retenção de latão de padrão industrial (paridade da loja, 2ac41a96) */
  var REG = { fam: "ra-registro-esfera", tipo: "soldavel" }, RET = { fam: "ra-valvula-retencao", tipo: "pvc" };
  /* comprimento equivalente fora da tabela principal (registro de esfera, união de PVC): tabela do fabricante, com página */
  function leqExtra(conexao, material, dn) {
    var P0 = (D().perdas || {})[conexao]; if (!P0 || (P0.material && P0.material !== material)) return null;
    var pol = null, dp = D().dnDaPol || {}; Object.keys(dp).forEach(function (k) { if (dp[k] === num(dn, -1)) pol = k; });
    var v = pol != null && P0.leq_m_por_pol ? P0.leq_m_por_pol[pol] : null;
    if (v == null && P0.leq_m_por_pol) {
      /* N23 (26/10/2026, revisão do barrilete): o DN 20 (1/2") não tem linha nesta tabela do fabricante (Schneider 2026-09, p. 88 — só
         3/4" a 2"), e o registro de esfera DN 20 dos ramais do banheiro ficava SEM perda localizada: o trecho virava "pendente" e o
         dimensionamento não podia subir o DN (o chuveiro ficou a -5,86 kPa sem reprovar). Adota-se o Leq do DN IMEDIATAMENTE MAIOR que
         tem valor (conservador: mais perda) e a adoção sai como PREMISSA visível no cálculo (`premissa`). A tabela do Tigre
         (af.perda.localizada.leq, registro_gaveta DE 20) traz 0,1 m, mas a decisão do coordenador é o do DN maior. */
      var cand = null; Object.keys(dp).forEach(function (k) { if (dp[k] > num(dn, -1) && P0.leq_m_por_pol[k] != null && (cand == null || dp[k] < cand.dn)) cand = { dn: dp[k], pol: k, v: P0.leq_m_por_pol[k] }; });
      if (cand && num(dn, -1) > 0) return { leq_m: Number(cand.v), fonte: D().perdas.fonte, linha: P0.linha, pol: cand.pol,
        premissa: { item: conexao + " DN " + dn + ": comprimento equivalente", valor: "Leq do DN " + cand.dn + " (" + String(cand.v).replace(".", ",") + " m) adotado — a fonte (Schneider/Franklin, Tabela de Seleção 2026-09, p. 88) não traz DN " + dn } };
    }
    return v == null ? null : { leq_m: Number(v), fonte: D().perdas.fonte, linha: P0.linha, pol: pol };
  }
  /* cfg = { R (BimInst.rede), trecho (id), s1 (m de p1 até a derivação de entrada), modelo, n, lado (+1|−1), yPiso, pref, origemPiso } */
  function instalacao(cfg) {
    var m = cfg.modelo, B = BI(), out = { ok: false, ops: [], pecas: [], avisos: [], decisoes: [], itens: [], geometria: null, motivo: null };
    var t = arr(cfg.R && cfg.R.trechos).filter(function (x) { return x.id === cfg.trecho; })[0];
    if (!t || !m) { out.motivo = "trecho " + cfg.trecho + " ou modelo não encontrado"; return out; }
    /* o pedaço do trecho no sentido do ESCOAMENTO (de → para, do HidAF): S1 a montante, S2 a jusante */
    var A0 = cfg.de || t.p1, B0 = cfg.para || t.p2, Lseg = dist(A0, B0);
    var u = unit(A0, B0); u = { x: u.x, y: 0, z: u.z }; var Lu0 = Math.sqrt(u.x * u.x + u.z * u.z); u = { x: u.x / Lu0, y: 0, z: u.z / Lu0 };
    var vL = { x: -u.z, y: 0, z: u.x }, lado = cfg.lado < 0 ? -1 : 1, v = { x: vL.x * lado, y: 0, z: vL.z * lado };
    var rot = Math.atan2(-u.z, u.x);
    var pref = cfg.pref || "pz1", n = Math.max(1, num(cfg.n, 1)), mat = t.material, dnL = t.dn;
    var cs = m.conexoes, sc = cs.succao, rc = cs.recalque, dnS = dnDaPol(sc.pol) || dnL, dnR = dnDaPol(rc.pol) || dnL;
    var LuN = geo("comprimentoUniao"), nip = geo("folgaAcessorio") / 2 + EPS, tAS = geo("trechoAntesSuccao"), tDB = geo("trechoDepoisBomba"), esp = geo("esperaSaida");
    var hBase = geo("baseAltura"), w0 = geo("afastamentoLinha"), Lac = B.ACESSORIO_PADRAO, fol = geo("folgaAcessorio"), hMinAc = geo("alturaMinimaAcessorios");
    var dim = m.dimensoes || {}, Lp = num(dim.comprimento, 0) / MM, Wp = num(dim.largura, 0) / MM, Hp = num(dim.altura, 0) / MM, passo = Wp + geo("passoEntreBombas");
    var yBase = cfg.yPiso + hBase, ys = yBase + num(sc.y, 0) / MM;
    /* ao longo de u, a partir de S1: derivação → curva de descida → trecho reto → niple → união → boca de sucção */
    var aSuc = tAS + LuN + nip, aFim = aSuc + Lp, s2 = aFim + tDB;
    var S1 = soma(A0, u, cfg.s1), S2 = soma(S1, u, s2), yt = S1.y;
    function W(O, lx, ly, lz) { return { x: O.x + u.x * lx + vL.x * lz, y: O.y + ly, z: O.z + u.z * lx + vL.z * lz }; }
    var dirRec = txt(rc.dir), recY = dirRec === "+y";
    var yRec0 = recY ? yBase + num(rc.y, 0) / MM + nip + LuN : yBase + num(rc.y, 0) / MM;
    /* ⚠ só o RECALQUE sobe ao coletor de saída (yh); a SUCÇÃO fica na cota do barrilete (afogada): na 1ª versão os dois
       coletores subiam a yh e o de entrada passava acima do nível d'água — pressão negativa, a bomba perde a escorva */
    var yh = Math.max(yt, yRec0 + hMinAc, yBase + Hp + fol);
    if (cfg.s1 < fol - EPS || cfg.s1 + s2 > Lseg - fol) { out.motivo = "o trecho " + t.id + " (" + f2(Lseg) + " m livres) não comporta o conjunto (" + f2(s2 + 2 * fol) + " m)"; return out; }
    var ops = out.ops, k = 0;
    function trecho(id, a, b, dn) { if (dist(a, b) < EPS) return null; var o = { op: "trecho", id: id, sistema: "agua_fria", material: mat, dn: dn, p1: pt(a), p2: pt(b), pz: pref }; ops.push(o); out.pecas.push(id); return o; }
    function acess(id, fam, tipo, tr, centro) { var o = { op: "acessorio", id: id, famId: fam, tipoId: tipo, trecho: tr.id, novoId: id + "-t", x: r4(centro.x), y: r4(centro.y), z: r4(centro.z), comprimento: Lac, pz: pref }; ops.push(o); out.pecas.push(id); return o; }
    function fam(id, famId, tipoId, p, rotY, inst) { var o = { op: "familia", id: id, famId: famId, tipoId: tipoId, x: r4(p.x), y: r4(p.y), z: r4(p.z), rotY: r4(rotY), inst: inst || {}, pz: pref }; ops.push(o); out.pecas.push(id); return o; }
    /* by-pass: o trecho original entre S1 e S2, com registro normalmente fechado no meio */
    acess(pref + "-bp-rg", REG.fam, REG.tipo, t, soma(S1, u, s2 / 2));
    /* subida/descida até a cota dos coletores */
    var H1 = S1, H2 = S2;
    if (yh > yt + EPS) { H2 = { x: S2.x, y: yh, z: S2.z }; trecho(pref + "-cs-v", H2, S2, dnL); }
    var ultimo = w0 + (n - 1) * passo;
    trecho(pref + "-ce", H1, soma(H1, v, ultimo), dnL);   /* coletor de entrada (sucção) */
    trecho(pref + "-cs", soma(H2, v, ultimo), H2, dnL);   /* coletor de saída (recalque) */
    var bombas = [];
    for (k = 0; k < n; k++) {
      var w = w0 + k * passo, D0 = soma(H1, v, w), C0 = { x: D0.x, y: ys, z: D0.z }, pu = pref + "-u" + k;
      /* bomba: a boca de sucção cai em S1 + v·w + u·aSuc, na cota do eixo */
      var Psuc = soma({ x: S1.x, y: ys, z: S1.z }, v, w); Psuc = soma(Psuc, u, aSuc);
      var O = { x: Psuc.x - u.x * num(sc.x, 0) / MM - vL.x * num(sc.z, 0) / MM, y: yBase, z: Psuc.z - u.z * num(sc.x, 0) / MM - vL.z * num(sc.z, 0) / MM };
      fam(pu + "-base", PREF + "base", "t-" + m.id, { x: O.x, y: cfg.yPiso, z: O.z }, rot, {});
      fam(pu + "-bomba", famIdDe(m), "t-" + m.id, O, rot, k === 0 && cfg.selecao ? { pzSel: cfg.selecao } : {});
      bombas.push({ id: pu + "-bomba", origem: O, reserva: k > 0 });
      /* sucção: (sobe/desce do coletor à cota do eixo), reto com o registro de entrada, união, niple até a boca */
      if (Math.abs(D0.y - C0.y) > EPS) trecho(pu + "-sd", D0, C0, dnS); else C0 = D0;
      var Ua = soma(Psuc, u, -(nip + LuN));
      var hz = trecho(pu + "-sh", C0, Ua, dnS);
      acess(pu + "-rs", REG.fam, REG.tipo, hz, soma(C0, u, dist(C0, Ua) / 2));
      fam(pu + "-us", PREF + "uniao-h", "t-generico", Ua, rot, { DN: dnS, Comprimento: LuN });
      trecho(pu + "-sn", soma(Ua, u, LuN), Psuc, dnS);
      /* recalque: bocal → niple → união → (toco) → subida com retenção e registro → coletor de saída */
      var Prec = W(O, num(rc.x, 0) / MM, num(rc.y, 0) / MM, num(rc.z, 0) / MM), topoSub;
      if (recY) {
        var Ub = soma(Prec, UP, nip);
        trecho(pu + "-rn", Prec, Ub, dnR);
        fam(pu + "-ur", PREF + "uniao-v", "t-generico", Ub, 0, { DN: dnR, Comprimento: LuN });
        topoSub = soma(Ub, UP, LuN);
      } else {
        var sx = dirRec === "-x" ? -1 : (dirRec === "+x" ? 1 : 0), dr = { x: u.x * sx, y: 0, z: u.z * sx };
        if (!sx) { out.motivo = "bocal de recalque com direção " + dirRec + " não suportada pelo traçado"; return out; }
        var Pn = soma(Prec, dr, nip);
        trecho(pu + "-rn", Prec, Pn, dnR);
        fam(pu + "-ur", PREF + "uniao-h", "t-generico", sx < 0 ? soma(Pn, dr, LuN) : Pn, rot, { DN: dnR, Comprimento: LuN });
        var E0 = soma(Pn, dr, LuN + esp);
        trecho(pu + "-rt", soma(Pn, dr, LuN), E0, dnR);
        topoSub = E0;
      }
      var T0 = { x: topoSub.x, y: yh, z: topoSub.z }, sub = trecho(pu + "-rv", topoSub, T0, dnR);
      acess(pu + "-rr", RET.fam, RET.tipo, sub, soma(topoSub, UP, fol + Lac / 2));
      /* o registro vai no PEDAÇO DE CIMA (o acessório anterior partiu a subida em pu-rv e pu-rr-t) */
      ops.push({ op: "acessorio", id: pu + "-rg", famId: REG.fam, tipoId: REG.tipo, trecho: pu + "-rr-t", novoId: pu + "-rg-t", x: r4(topoSub.x), y: r4(topoSub.y + fol * 2 + Lac * 1.5), z: r4(topoSub.z), comprimento: Lac, pz: pref });   // hid:ok 2 folgas + 1,5 acessório acima do início da subida
      out.pecas.push(pu + "-rg");
      /* da subida ao coletor de saída (na cota yh, ao longo de u e depois de v) */
      var R0 = soma(H2, v, w), meio = { x: T0.x + u.x * ((R0.x - T0.x) * u.x + (R0.z - T0.z) * u.z), y: yh, z: T0.z + u.z * ((R0.x - T0.x) * u.x + (R0.z - T0.z) * u.z) };
      trecho(pu + "-ra", T0, meio, dnR);
      trecho(pu + "-rb", meio, R0, dnR);
      /* ponto de força ao lado do fundo do motor */
      var el = m.eletrica || {};
      fam(pu + "-pf", PREF + "ponto-forca", "t-generico", W(O, Lp + geo("pontoForcaAfastamento"), geo("pontoForcaAltura") - hBase, 0), rot,
          { Tensao_V: arr(el.tensao_V).join(" ou ") + " V", Potencia_W: num(el.potencia_W, 0), Potencia_cv: num(el.potencia_cv, 0), Corrente_A: el.corrente_A ? Object.keys(el.corrente_A).map(function (q) { return q + " V: " + el.corrente_A[q] + " A"; }).join("; ") : "", Equipamento: m.fabricante + " " + m.modelo });
    }
    /* dreno: ralo seco ao lado da base da última bomba (lado de fora) */
    var Od = soma(soma({ x: S1.x, y: cfg.yPiso, z: S1.z }, v, ultimo + Wp / 2 + geo("drenoAfastamento")), u, aSuc + Lp / 2);
    var dr0 = { op: "peca", id: pref + "-dreno", peca: "ralo_seco", sistema: "esgoto", x: r4(Od.x), y: r4(Od.y), z: r4(Od.z), pz: pref };
    ops.push(dr0); out.pecas.push(dr0.id);
    out.geometria = { S1: pt(S1), S2: pt(S2), u: u, v: v, yh: r4(yh), ys: r4(ys), yBase: r4(yBase), comprimento: r4(s2), bombas: bombas, rotY: rot,
                      caixa: { a: pt(soma({ x: S1.x, y: cfg.yPiso, z: S1.z }, v, w0 - Wp)), b: pt(soma(soma({ x: S1.x, y: yh, z: S1.z }, v, ultimo + Wp), u, s2)) } };
    out.ok = true;
    return out;
  }

  /* ======================================================== DIAGNÓSTICO + CORRIGIR */
  /* caminho (arestas) da alimentação até o nó, pelos trechos do resultado (de → para) */
  function arvore(af) {
    var porPara = {}; arr(af.trechos).forEach(function (t) { if (t.para != null) porPara[t.para] = t; });
    return function caminho(no) { var l = [], g = 0; while (porPara[no] && g++ < arr(af.trechos).length + 1) { l.unshift(porPara[no]); no = porPara[no].de; } return l; };
  }
  function reservatorioDe(est, af) {
    var fi = af && af.alimentacao && af.alimentacao.famInst; if (!fi) return null;
    return arr(est && est.familias).filter(function (f) { return f.id === fi; })[0] || null;
  }
  function pisoEm(est, p, yRes) {
    var amb = arr(est && est.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length > 2 && isFinite(Number(a.calc.base)) && Number(a.calc.base) <= p.y + EPS && dentro(p, a.calc.contorno); })
      .sort(function (a, b) { return Number(b.calc.base) - Number(a.calc.base); })[0];
    if (amb) return { y: Number(amb.calc.base), origem: "piso do ambiente " + (amb.nome || amb.id), ambiente: amb };
    /* laje do BIM sob o trecho (o topo mais alto que não passa do tubo) */
    var laje = null;
    arr(est && est.caixas).forEach(function (c) {
      if (!c || c.tipo !== "laje") return;
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, hw = num(c.espessura, 0) / 2, dx = p.x - c.cx, dz = p.z - c.cz;
      var lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, topo = num(c.cy, 0) + num(c.altura, 0) / 2;
      if (Math.abs(lx) <= h + EPS && Math.abs(lz) <= hw + EPS && topo <= p.y + EPS && (!laje || topo > laje.y)) laje = { y: topo, origem: "topo da laje " + c.id };
    });
    if (laje) return laje;
    if (yRes != null && yRes <= p.y + EPS) return { y: yRes, origem: "base do reservatório (mesmo nível)" };
    return null;
  }
  function dentro(p, poli) {
    var c = false;
    for (var i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      var xi = Number(poli[i].x != null ? poli[i].x : poli[i][0]), zi = Number(poli[i].z != null ? poli[i].z : poli[i][1]), xj = Number(poli[j].x != null ? poli[j].x : poli[j][0]), zj = Number(poli[j].z != null ? poli[j].z : poli[j][1]);
      if ((zi > p.z) !== (zj > p.z) && p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  var RE_BANHEIRO = /banh|wc\b|lavabo|sanit/i;

  function custoItens(itens) {
    var tot = 0, pend = [], merc = 0;
    itens.forEach(function (it) { if (it.preco != null) { tot += it.preco * it.qtd; if (it.mercado) merc++; } else pend.push(it.descricao + " (" + it.motivo + ")"); });
    return { total: tot, pendentes: pend, mercado: merc,
             texto: rs(tot) + " em SINAPI " + D().sinapi.uf + " " + D().sinapi.competencia + (merc ? " e referência de mercado (" + merc + " item(ns), o maior preço público de varejo)" : "") + (pend.length ? " + " + pend.length + " item(ns) sem preço: " + pend.join("; ") : "") };
  }
  /* PENDÊNCIAS FINAIS (18/10/2026): o item sem SINAPI (o pressurizador, a retenção de PVC) leva a REFERÊNCIA DE MERCADO
     (js/hidprecomercado.js: o maior de 3 lojas, com data e loja; regra RA — 100 % orçado, na incerteza o mais alto). Sem
     levantamento, continua sem preço, com o motivo (nunca um preço inventado) */
  function comMercado(it, idMerc) {
    if (!it || it.preco != null) return it;
    var PM = dep("HidPrecoMercado", "./hidprecomercado.js"), r = PM && PM.ref ? PM.ref(idMerc) : null;
    if (!r) { it.motivo = (it.motivo ? it.motivo + "; " : "") + "sem referência de mercado levantada para " + idMerc; return it; }
    it.preco = r.valor; it.mercado = { id: r.id, texto: r.texto, criterio: r.criterio, url: r.url, data: r.data, loja: r.loja, estimativa: !!r.estimativa };
    it.sinapiDescricao = r.texto; it.motivo = null;
    return it;
  }
  function item(chave, qtd, descricao) {
    var s = sinapi(chave);
    return { chave: chave, qtd: qtd, descricao: descricao, codigo: s.pendente ? null : s.codigo, sinapiDescricao: s.descricao || null, unidade: s.unidade || "UN", preco: s.pendente ? null : s.preco, motivo: s.pendente ? s.motivo : null, tipo: s.tipo || null };
  }
  /* lista de material do conjunto (o que NÃO sai do quantitativo de tubos do BimInst) */
  function itensConjunto(m, n) {
    var sp = txt(m.conexoes.succao.pol), rp = txt(m.conexoes.recalque.pol), lst = [];
    lst.push(comMercado(item("pressurizador|-", n, "Pressurizador " + m.fabricante + " " + m.modelo + " (" + n + " un: " + (n > 1 ? "1 em operação + " + (n - 1) + " reserva" : "operação") + ")"), "pressurizador|" + m.id));
    var dS = dnDaPol(sp), dR = dnDaPol(rp);
    lst.push(item("registro_esfera_pvc|" + dS, n, "Registro de esfera PVC soldável DN " + dS + " (entrada de cada bomba)"));
    lst.push(item("registro_esfera_pvc|" + dR, n + 1, "Registro de esfera PVC soldável DN " + dR + " (saída de cada bomba + by-pass)"));
    lst.push(comMercado({ chave: "retencao_pvc", qtd: n, descricao: "Válvula de retenção de PVC soldável DN " + dR + " (saída de cada bomba)", codigo: null, preco: null, motivo: "sem composição SINAPI de retenção de PVC (a SINAPI só tem a de bronze)" }, "retencao_pvc|" + dR));
    lst.push(item("uniao|" + sp, n, "União roscável " + sp + "\" (sucção)"));
    lst.push(item("uniao|" + rp, n, "União roscável " + rp + "\" (recalque)"));
    lst.push(item("adaptador|" + sp, n, "Adaptador soldável curto com rosca " + sp + "\" (bocal de sucção)"));
    lst.push(item("adaptador|" + rp, n, "Adaptador soldável curto com rosca " + rp + "\" (bocal de recalque)"));
    lst.push({ chave: "base", qtd: n, descricao: "Base de concreto com chumbadores", codigo: null, preco: null, motivo: "sem composição SINAPI de base de equipamento: orçar como concreto + forma no orçamento da obra" });
    lst.push({ chave: "eletrica", qtd: n, descricao: "Ponto de força + circuito + DR " + (m.limites && m.limites.dr_mA ? "≤ " + m.limites.dr_mA + " mA" : "(ficha)"), codigo: null, preco: null, motivo: "pendente do projeto elétrico (referência: DR bipolar 25 A, SINAPI " + (sinapi("dr|-").codigo || "—") + ")" });
    return lst;
  }

  function diagnosticar(res, entrada, R) {
    var af = res && res.sistemas && res.sistemas.agua_fria; if (!af || !arr(af.pontos).length) return null;
    var falhos = arr(af.pontos).filter(function (p) { return p.ok === false; });
    var est = (entrada && entrada.modelo && entrada.modelo.estado) || {}, avaliarFam = entrada && entrada.modelo && entrada.modelo.avaliarFam;
    var info = { casos: [], instalados: [] };
    instalados(info, af, est);
    if (!falhos.length) { res.pressurizacao = info.instalados.length ? info : null; return res.pressurizacao; }
    var H = HH(), fl = H.agua(af.temperatura_C), caminho = arvore(af), ctx = NR().contexto(), PD = HP().criar(ctx, fl, (entrada && entrada.opcoes && entrada.opcoes.formulaPerda) || "auto", function () {});   /* ⚠ af.formulaPerda é o TEXTO das fórmulas usadas, não a opção */
    var al = af.alimentacao || {}, Hsrc = num(al.carga_m, null), NAmin = num(al.nivelAgua, Hsrc), NAmax = num(al.nivelAguaMax, NAmin);
    var caso = { pontos: falhos.map(function (p) { return { famInst: p.famInst, aparelho: p.aparelho, cota: p.cota, p_kpa: p.pressaoDinamica_kpa, pmin_kpa: p.pressaoMinima_kpa, deficit_kpa: p.pressaoMinima_kpa - p.pressaoDinamica_kpa, fontePmin: p.fontePmin }; }),
                 entradas: null, opcoes: [], comparativo: null, escolha: null, decisoes: [] };
    /* caminho comum (até o ancestral comum dos pontos sem pressão) */
    var cams = falhos.map(function (p) { return caminho(p.no); }), comum = cams[0].slice();
    cams.forEach(function (c) { var i = 0; while (i < comum.length && i < c.length && comum[i].aresta === c[i].aresta) i++; comum = comum.slice(0, i); });
    var res0 = reservatorioDe(est, af), yRes = res0 ? num(res0.y, null) : null, faixa = geo("faixaNivelReservatorio");
    var Bi = BI(), Rr = R || Bi.rede(est, avaliarFam), trPorId = {}; arr(Rr.trechos).forEach(function (t) { trPorId[t.id] = t; });
    var mins = modelos(), Lmin = Infinity;
    mins.forEach(function (m) { Lmin = Math.min(Lmin, geo("trechoAntesSuccao") + geo("comprimentoUniao") + geo("folgaAcessorio") + num(m.dimensoes && m.dimensoes.comprimento, 0) / MM + geo("trechoDepoisBomba") + geo("folgaAcessorio") * 2); });
    /* trecho de inserção: o MAIS FUNDO do caminho comum que é tubo horizontal, comporta o conjunto, está na faixa do nível do
       reservatório ("junto à saída") e não fica dentro de banheiro/lavabo */
    var cand = null;
    comum.forEach(function (t) {
      var g = trPorId[t.id]; if (!g || t.tipo !== "tubo" || g.vertical || !t.pDe || !t.pPara || Math.abs(t.pDe.y - t.pPara.y) > EPS || dist(t.pDe, t.pPara) < Lmin) return;
      if (yRes != null && Math.abs(g.p1.y - yRes) > faixa) return;
      var meio = { x: (g.p1.x + g.p2.x) / 2, y: g.p1.y, z: (g.p1.z + g.p2.z) / 2 }, amb = pisoEm(est, meio, yRes);
      if (amb && amb.ambiente && RE_BANHEIRO.test(txt(amb.ambiente.nome))) return;
      cand = { t: t, g: g, piso: amb };
    });
    var Qd = cand ? num(cand.t.vazao_ls, 0) * S_H / LS : null;
    /* curva do sistema: tudo escalado pela vazão do trecho de inserção (s = Q/Qd) */
    function Jrel(t, s) { if (!(t.vazao_ls > 0) || t.di_mm == null) return 1; var a = PD.distribuida(t.vazao_ls * s, t.di_mm / MM, 1, t.material, "pressurização"), b = PD.distribuida(t.vazao_ls, t.di_mm / MM, 1, t.material, "pressurização"); return a && b && b.J > 0 ? a.J / b.J : 1; }
    function hfCam(cam, s) { return cam.reduce(function (sm, t) { return sm + num(t.perda_m, 0) * Jrel(t, s); }, 0); }
    var dnI = cand ? cand.g.dn : null, matI = cand ? cand.g.material : null, LISTA_INST = ["te_saida_lateral", "te_saida_lateral", "joelho90", "registro_gaveta", "valvula_retencao", "registro_gaveta", "joelho90", "joelho90", "te_saida_lateral", "te_saida_lateral"];
    function hfInst(Q) {
      if (!cand) return 0; var di0 = PD.di(matI, dnI, "pressurização"); if (di0 == null) return 0;
      var ds = PD.distribuida(Q * LS / S_H, di0, 0, matI, "pressurização"); if (!ds) return 0;
      return LISTA_INST.reduce(function (sm, c) { var pl = PD.local(c, matI, dnI, ds.J, ds.v, "pressurização"); return sm + (pl ? pl.perda_m : 0); }, 0);
    }
    function Hnec(Q) {
      var s = Qd > 0 ? Q / Qd : 1;
      return caso.pontos.reduce(function (mx, p, i) {
        var pm = H.kpaParaM(p.pmin_kpa, fl.rho) + p.cota - Hsrc + hfCam(cams[i], s) + hfInst(Q);
        return Math.max(mx, pm);
      }, -Infinity);
    }
    var altitude = num(entrada && entrada.opcoes && entrada.opcoes.altitude_m, num(entrada && entrada.recalque && entrada.recalque.altitude_m, null));
    var cM = NR().consulta("bombas.npsh.margem", null, "valor"), margem = cM.ok ? num(cM.valor, null) : num(entrada && entrada.opcoes && entrada.opcoes.margemNpsh_m, null);
    var cB = NR().consulta("bombas.minimo", null, "valor"), nB = cB.ok ? num(cB.valor, 1) : 1;
    var yPiso = cand ? (cand.piso ? cand.piso.y : (yRes != null ? yRes : null)) : null;
    caso.entradas = { Q_m3h: Qd, trecho: cand ? cand.t.id : null, dn: dnI, material: matI, NAmin: NAmin, NAmax: NAmax, Hsrc: Hsrc, yPiso: yPiso, origemPiso: cand && cand.piso ? cand.piso.origem : (yRes != null ? "base do reservatório" : null),
                      HnecQd: cand ? Hnec(Qd) : null, perdasCaminho_m: cand ? hfCam(cams[0], 1) : null, perdasInstalacao_m: cand ? hfInst(Qd) : null, altitude_m: altitude, margemNpsh: margem, fonteMargem: cM.ok ? cM.fonte : (margem != null ? "premissa do RT (entrada.opcoes.margemNpsh_m)" : null),
                      nBombas: nB, fonteBombas: cB.ok ? cB.fonte : null, temperatura_C: fl.T };
    if (altitude == null) caso.decisoes.push("Altitude do local não informada: NPSH disponível ao nível do mar (otimista — informe entrada.opcoes.altitude_m).");
    var defMax = Math.max.apply(null, caso.pontos.map(function (p) { return p.deficit_kpa; })), defM = H.kpaParaM(defMax, fl.rho);
    var nomes = caso.pontos.map(function (p) { return p.famInst + " (" + p.aparelho + ")"; }).join(", ");

    /* (a) ELEVAR O RESERVATÓRIO: o HidAF refeito com o nível d'água subindo até os pontos atenderem */
    var opA = { id: "a", titulo: "Elevar o reservatório", ops: [], custo: null, consequencia: "", resolve: false };
    (function () {
      if (!AFm() || !entrada) return;
      function rodar(dh) {
        var e2 = copia(entrada); e2.modelo = entrada.modelo; e2.alimentacao = e2.alimentacao || {};
        e2.alimentacao.nivelAgua = NAmin + dh; e2.alimentacao.nivelAguaMax = NAmax + dh;
        var r2 = AFm().calcular(e2, NR().contexto(), Rr);
        var ok = caso.pontos.every(function (p) { var q = arr(r2.pontos).filter(function (x) { return x.famInst === p.famInst; })[0]; return q && q.ok === true; });
        return { ok: ok, r: r2 };
      }
      var hi = geo("elevacaoMaxima"), lo = 0, passo = geo("elevacaoPasso");
      if (!rodar(hi).ok) { opA.consequencia = "não resolve nem com " + f1(hi) + " m de elevação"; return; }
      while (hi - lo > passo) { var mid = (hi + lo) / 2; if (rodar(mid).ok) hi = mid; else lo = mid; }
      var dh = Math.ceil(hi / passo) * passo, rr = rodar(dh), pe = arr(rr.r.pontos).reduce(function (mx, p) { return Math.max(mx, num(p.pressaoEstatica_kpa, 0)); }, 0);
      opA.resolve = true; opA.elevacao_m = dh;
      var tb = sinapi("tubo|" + (al.dn || dnI || "")); var custoT = tb.pendente ? null : tb.preco * dh;
      opA.custo = { total: custoT, texto: (custoT != null ? rs(custoT) + " de tubo a mais (SINAPI " + tb.codigo + ", " + f2(dh) + " m)" : "tubo a mais " + f2(dh) + " m") + " + estrutura de apoio do reservatório: PENDENTE (depende do projeto estrutural — a caixa cheia pesa sobre a nova torre/laje)" };
      opA.consequencia = "subir o nível d'água mínimo " + f2(dh) + " m (de " + f2(NAmin) + " para " + f2(NAmin + dh) + " m): torre/laje elevada para a caixa cheia; a pressão estática sobe " + f2(dh) + " m em todos os pontos (maior estática " + f1(pe) + " kPa); sem consumo de energia";
    })();
    caso.opcoes.push(opA);

    /* (b) AUMENTAR O DN do caminho: HidAF sem trava nenhuma */
    var opB = { id: "b", titulo: "Aumentar o DN do trecho crítico", ops: [], custo: null, consequencia: "", resolve: false };
    (function () {
      if (!AFm() || !entrada) return;
      var e2 = copia(entrada); e2.modelo = entrada.modelo; e2.opcoes = e2.opcoes || {}; e2.opcoes.travados = [];
      var r2 = AFm().calcular(e2, NR().contexto(), Rr);
      var ok = caso.pontos.every(function (p) { var q = arr(r2.pontos).filter(function (x) { return x.famInst === p.famInst; })[0]; return q && q.ok === true; });
      var carga = caso.pontos.map(function (p) { return H.mParaKpa(Hsrc - p.cota, fl.rho) - p.pmin_kpa; }), semDn = carga.some(function (c) { return c < 0; });
      if (!ok) { opB.consequencia = semDn ? "não resolve: a carga ESTÁTICA (nível d'água − cota do ponto) já é menor que a pressão mínima — falta altura, não diâmetro" : "não resolve: mesmo com os maiores DN do material a perda não cai o bastante"; return; }
      opB.resolve = true; opB.ops = arr(r2.ops).filter(function (o) { return o.op === "instAlterar"; });
      var tot = 0, pend = 0;
      opB.ops.forEach(function (o) { var tr = trPorId[o.id], s0 = sinapi("tubo_ramal|" + o.dn), s1 = tr ? sinapi("tubo_ramal|" + tr.dn) : { pendente: true }; if (tr && !s0.pendente && !s1.pendente) tot += (s0.preco - s1.preco) * num(tr.comprimento, 0); else pend++; });
      opB.custo = { total: tot, texto: rs(tot) + " de diferença de tubo (SINAPI ramal de distribuição)" + (pend ? " + " + pend + " trecho(s) sem preço" : "") };
      opB.consequencia = opB.ops.length + " trecho(s) com DN maior (" + opB.ops.map(function (o) { return o.id + " → DN " + o.dn; }).join(", ") + "); nada elétrico";
    })();
    caso.opcoes.push(opB);

    /* (c)/(d) PRESSURIZADOR na curva */
    var opC = { id: "c", titulo: "Pressurizador (catálogo do fabricante)", ops: [], custo: null, consequencia: "", resolve: false };
    var opD = { id: "d", titulo: "Sistema de pressurização predial (conjunto com tanque)", ops: [], custo: null, consequencia: "", resolve: false };
    if (!cand) {
      opC.consequencia = "não há trecho HORIZONTAL junto à saída do reservatório (faixa de ±" + f2(faixa) + " m do nível dele), fora de banheiro, com " + f2(Lmin) + " m livres no caminho até " + nomes + ": desenhe esse trecho (barrilete) e dimensione de novo";
      opD.consequencia = opC.consequencia;
    } else if (yPiso == null) {
      opC.consequencia = "sem piso conhecido sob o trecho " + cand.t.id + " (ambiente do BIM ou base do reservatório): o pressurizador não tem onde apoiar"; opD.consequencia = opC.consequencia;
    } else {
      var hfS0 = hfCam(comum.slice(0, comum.indexOf(cand.t) + 1), 1);
      var cfgSel = { Q_m3h: Qd, Hnec: Hnec, NAmin: NAmin, NAmax: NAmax, altitude_m: altitude, temperatura_C: fl.T, margemNpsh: margem,
                     yEixo: function (m) { return yPiso + geo("baseAltura") + num(m.conexoes.succao.y, 0) / MM; },
                     hfSuc: function (Q) { var s = Qd > 0 ? Q / Qd : 1; return hfS0 * Math.pow(s, 2) + hfInst(Q) / 2; } };   // hid:ok sucção ≈ metade das perdas da instalação; perda ∝ Q² (memorial diz)
      cfgSel.filtro = ehPressurizador;
      var sel = selecionar(cfgSel);
      caso.comparativo = sel; caso.decisoes.push("Curva do sistema escalada pela vazão do trecho de inserção: perdas do caminho por J(Q)/J(Qd) de cada trecho e as da instalação pelas conexões (tês, joelhos, registros, retenção) no DN do trecho.");
      function preencher(op, filtro, rot) {
        var ls = sel.linhas.filter(function (l) { return filtro(l.modelo); }), aps = ls.filter(function (l) { return l.aprovada; }).sort(ordemEscolha);
        var esc = aps.filter(function (l) { return rotavel(l.modelo); })[0];
        if (!ls.length) { op.consequencia = "nenhum " + rot + " no catálogo extraído (dados-fonte/hidro/catalogos/pressurizadores)"; return; }
        if (!esc && aps.length) { op.consequencia = "atendem na curva mas não dá para modelar com a volumetria do produto: " + aps.map(function (l) { return l.nome + " (" + motivoNaoModela(l.modelo) + ")"; }).join(" · "); return; }
        if (!esc) { op.consequencia = "nenhum " + rot + " do catálogo atende Q = " + f2(Qd) + " m³/h com H = " + f2(Hnec(Qd)) + " m: " + ls.map(function (l) { return l.nome + " (" + l.motivos.join("; ") + ")"; }).join(" · "); return; }
        var lados = [1, -1], inst = null, ladoOk = null;
        for (var i = 0; i < lados.length && !inst; i++) {
          var s1 = geo("folgaAcessorio");
          var tent = instalacao({ R: Rr, trecho: cand.t.id, de: cand.t.pDe, para: cand.t.pPara, s1: s1, modelo: esc.modelo, n: nB, lado: lados[i], yPiso: yPiso, pref: "pz1", selecao: retrato(caso, sel, esc, [opA, opB]) });
          if (tent.ok && !colide(est, tent.geometria)) { inst = tent; ladoOk = lados[i]; }
          else if (tent.ok && !inst && i === lados.length - 1) { inst = tent; inst.avisos.push("as duas laterais da linha têm parede/equipamento na faixa de manutenção (" + f2(geo("acessoManutencao")) + " m): conferir o acesso"); }
          else if (!tent.ok && i === lados.length - 1 && !inst) op.consequencia = tent.motivo;
        }
        if (!inst) return;
        op.resolve = true; op.ops = inst.ops; op.pecas = inst.pecas; op.escolha = esc; op.instalacao = inst;
        op.itens = itensConjunto(esc.modelo, nB);
        op.custo = custoItens(op.itens);
        var el = esc.modelo.eletrica || {};
        op.consequencia = nB + " × " + esc.nome + " (" + (nB > 1 ? "1 + " + (nB - 1) + " reserva, NBR 5626:2020 6.5.11.2" : "1") + "), ponto de operação " + f2(esc.Qop) + " m³/h × " + f2(esc.Hop) + " m; ponto de força " + arr(el.tensao_V).join("/") + " V" +
          (el.potencia_W ? ", " + el.potencia_W + " W" : (el.potencia_cv ? ", " + el.potencia_cv + " cv" : "")) + " (circuito/DR: projeto elétrico); consumo de energia e manutenção; by-pass mantém a gravidade na falta de energia";
        caso.escolha = caso.escolha || esc;
      }
      preencher(opC, function (m) { return m.tipo !== "booster_predial" && m.uso !== "predial"; }, "pressurizador residencial");
      /* ⚠ (d) só com CONJUNTO predial no catálogo (tipo booster_predial): motobomba centrífuga de recalque não é pressurizador */
      preencher(opD, function (m) { return m.tipo === "booster_predial"; }, "conjunto predial");
      if (opC.resolve && opD.resolve) opD.consequencia = "também atende, mas o pressurizador residencial (c) basta para " + f2(Qd) + " m³/h — o conjunto predial é para a vazão do prédio inteiro. " + opD.consequencia;
    }
    caso.opcoes.push(opC); caso.opcoes.push(opD);
    caso.opcoes.forEach(function (o) { o.texto = "(" + o.id + ") " + o.titulo + (o.resolve ? "" : " — não resolve") + (o.custo ? " · custo: " + o.custo.texto : ""); });
    info.casos.push(caso);
    /* os avisos "pressão insuficiente" da água fria recebem as opções (um Corrigir com várias soluções) */
    arr(res.avisos).forEach(function (a) {
      if (a.sistema !== "agua_fria" || !/^pressão insuficiente em /.test(txt(a.texto))) return;
      if (!caso.pontos.some(function (p) { return txt(a.texto).indexOf(p.famInst) >= 0; })) return;
      a.corrigir = a.corrigir || {};
      a.corrigir.texto = (a.corrigir.texto ? a.corrigir.texto + " — " : "") + "ver as opções (a)–(d) com custo e consequência";
      a.corrigir.opcoes = caso.opcoes.map(function (o) { return { id: o.id, titulo: o.titulo, texto: o.texto, consequencia: o.consequencia, custo: o.custo ? o.custo.texto : null, ops: o.ops || [], pecas: o.pecas || [], resolve: o.resolve,
                                                                  modelo: o.escolha ? o.escolha.nome : null, n: o.escolha ? nB : null, elevacao_m: o.elevacao_m != null ? o.elevacao_m : null }; });
    });
    res.pressurizacao = info;
    return info;
  }
  /* parede ou equipamento dentro da faixa de manutenção do conjunto */
  function colide(est, g) {
    if (!g) return false;
    var a = g.caixa.a, b = g.caixa.b, f = geo("acessoManutencao") / 2;
    var x0 = Math.min(a.x, b.x) - f, x1 = Math.max(a.x, b.x) + f, z0 = Math.min(a.z, b.z) - f, z1 = Math.max(a.z, b.z) + f;
    return arr(est && est.caixas).some(function (c) {
      if (!c || c.tipo !== "parede") return false;
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, base = num(c.cy, 0) - num(c.altura, 0) / 2, topo = num(c.cy, 0) + num(c.altura, 0) / 2;
      if (topo < Math.min(a.y, b.y) || base > Math.max(a.y, b.y)) return false;
      var p1 = { x: c.cx - h * cs, z: c.cz + h * sn }, p2 = { x: c.cx + h * cs, z: c.cz - h * sn };
      for (var i = 0; i <= 10; i++) { var x = p1.x + (p2.x - p1.x) * i / 10, z = p1.z + (p2.z - p1.z) * i / 10; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true; }   // hid:ok amostragem do segmento (10 partes)
      return false;
    });
  }
  /* RETRATO da escolha (vai na instância da bomba, inst.pzSel): depois de modelado o ponto deixa de falhar e o caso
     some do diagnóstico — sem o retrato, o memorial perdia a seleção na curva, as entradas e as opções descartadas */
  function retrato(caso, sel, esc, ops) {
    return { data: new Date().toISOString().slice(0, 10), pontos: copia(caso.pontos), entradas: copia(caso.entradas), decisoes: caso.decisoes.slice(),   // hid:ok desenho/formatação (posição de texto, data AAAA-MM-DD)
             opcoes: arr(ops).map(function (o) { return { id: o.id, titulo: o.titulo, resolve: o.resolve, custo: o.custo ? { texto: o.custo.texto } : null, consequencia: o.consequencia }; }),
             linhas: sel.linhas.map(function (l) { return { id: l.id, nome: l.nome, tipo: l.tipo, Qop: l.Qop, Hop: l.Hop, npshd: l.npshd, npshr: l.npshr, aprovada: l.aprovada, pendente: l.pendente, motivos: l.motivos.slice(), fonte: l.fonte }; }),
             escolha: { id: esc.id, nome: esc.nome, Qop: esc.Qop, Hop: esc.Hop, fonte: esc.fonte, verifs: copia(esc.verifs) } };
  }
  /* pressurizadores JÁ modelados: ponto de operação da rede recalculada (o HidAF devolve af.bombas) + o retrato da escolha */
  function instalados(info, af, est) {
    var porId = {}; arr(est && est.familias).forEach(function (f) { porId[f.id] = f; });
    arr(af.bombas).forEach(function (b) {
      var m = modeloDoFam(b.famId); if (!m) return;
      var fi = porId[b.famInst], sel = fi && fi.inst && fi.inst.pzSel && typeof fi.inst.pzSel === "object" ? fi.inst.pzSel : null;
      info.instalados.push({ famInst: b.famInst, modelo: m, nome: m.fabricante + " " + m.modelo, Q_m3h: b.Q_m3h, H_m: b.H_m, reserva: !!b.reserva, status: b.status, passos: b.passos || [], fonte: fonteTxt(m, m.curva && m.curva.fonte), selecao: sel });
    });
  }

  /* ======================================================== MEMORIAL PARAMETRIZADO
   * a MESMA estrutura serve à bomba de recalque: entradas → comparativo na curva → escolhido com ponto de operação →
   * verificação final da rede → especificação de instalação. Devolve dados; a tela/memorial formata. */
  function memorial(res) {
    var pz = res && res.pressurizacao; if (!pz) return null;
    var secoes = [], casos = arr(pz.casos).slice();
    /* modelado: o caso vem do RETRATO guardado na bomba (a seleção feita na hora da escolha) */
    arr(pz.instalados).forEach(function (b) {
      var r = b.selecao; if (!r || b.reserva) return;
      var mE = modelo(r.escolha && r.escolha.id) || b.modelo;
      casos.push({ retrato: true, data: r.data, pontos: arr(r.pontos), entradas: r.entradas || {}, decisoes: arr(r.decisoes),
                   opcoes: arr(r.opcoes).concat([{ id: "c", titulo: "Pressurizador (catálogo do fabricante)", resolve: true, custo: { texto: custoItens(itensConjunto(mE, num(r.entradas && r.entradas.nBombas, 1))).texto }, consequencia: "modelado: " + b.nome, itens: itensConjunto(mE, num(r.entradas && r.entradas.nBombas, 1)) }]),
                   comparativo: { linhas: arr(r.linhas).map(function (l) { var o = copia(l); o.modelo = modelo(l.id) || {}; o.verifs = []; return o; }) },
                   escolha: { nome: r.escolha.nome, Qop: r.escolha.Qop, Hop: r.escolha.Hop, fonte: r.escolha.fonte, verifs: arr(r.escolha.verifs), modelo: mE } });
    });
    casos.forEach(function (c, i) {
      var e = c.entradas || {};
      var s = { titulo: "Pressurização da água fria" + (casos.length > 1 ? " — caso " + (i + 1) : "") + (c.retrato ? " — seleção feita em " + txt(c.data) + " (antes de modelar)" : ""), paragrafos: [], tabelas: [] };
      s.tabelas.push({ titulo: "Pontos sem pressão (antes da correção)", cab: ["Ponto", "Aparelho", "Cota (m)", "Pressão (kPa)", "Mínima (kPa)", "Falta (kPa)"],
                       linhas: c.pontos.map(function (p) { return [p.famInst, p.aparelho, f2(p.cota), f1(p.p_kpa), f1(p.pmin_kpa), f1(p.deficit_kpa)]; }) });
      s.tabelas.push({ titulo: "Dados de entrada", cab: ["Grandeza", "Valor", "Origem"], linhas: [
        ["Vazão de projeto no trecho de inserção", f2(e.Q_m3h) + " m³/h", "HidAF (método da vazão de projeto) no trecho " + txt(e.trecho)],
        ["Altura necessária na vazão de projeto", f2(e.HnecQd) + " m", "pressão mínima do ponto − (nível d'água − cota) + perdas"],
        ["Perdas no caminho até o ponto crítico", f2(e.perdasCaminho_m) + " m", "HidAF, trecho a trecho"],
        ["Perdas da instalação do conjunto", f2(e.perdasInstalacao_m) + " m", "comprimentos equivalentes (HidNormas) no DN " + txt(e.dn)],
        ["Nível d'água mínimo / máximo", f2(e.NAmin) + " / " + f2(e.NAmax) + " m", "alimentação do HidAF"],
        ["Piso do conjunto", f2(e.yPiso) + " m", txt(e.origemPiso)],
        ["Altitude", e.altitude_m == null ? "não informada (nível do mar)" : f1(e.altitude_m) + " m", "entrada"],
        ["Margem de NPSH", e.margemNpsh == null ? "pendente" : f2(e.margemNpsh) + " m", txt(e.fonteMargem) || "bombas.npsh.margem (HidNormas)"],
        ["Bombas independentes", String(e.nBombas), e.fonteBombas ? (e.fonteBombas.norma || "") + " " + (e.fonteBombas.tabela || "") : "—"]] });
      if (c.comparativo) s.tabelas.push({ titulo: "Seleção na curva — todos os candidatos", cab: ["Modelo", "Tipo", "Q op (m³/h)", "H op (m)", "NPSHd/NPSHr (m)", "Situação", "Fonte"],
        linhas: c.comparativo.linhas.map(function (l) { return [l.nome, l.tipo, f2(l.Qop), f2(l.Hop), f2(l.npshd) + " / " + (l.npshr == null ? "—" : f2(l.npshr)), (l.aprovada ? (l.pendente ? "atende (com pendência)" : "atende") : "não atende: " + arr(l.motivos).join("; ")) + (!l.modelo || !l.modelo.id || rotavel(l.modelo) ? "" : " · não modelável: " + motivoNaoModela(l.modelo)), l.fonte]; }) });
      var sc0 = arr(D().semCurva);
      if (sc0.length) s.paragrafos.push("Fora da seleção (a ficha só traz a curva em gráfico — ponto de gráfico não vira dado): " + sc0.map(function (x) { return x.fabricante + " " + x.modelo; }).join(", ") + ".");
      s.tabelas.push({ titulo: "Opções de correção", cab: ["Opção", "Resolve", "Custo estimado", "Consequência"], linhas: c.opcoes.map(function (o) { return ["(" + o.id + ") " + o.titulo, o.resolve ? "sim" : "não", o.custo ? o.custo.texto : "—", o.consequencia]; }) });
      if (c.escolha) {
        var es = c.escolha, m = es.modelo;
        s.paragrafos.push("Escolhido: " + es.nome + " — ponto de operação Q = " + f2(es.Qop) + " m³/h, H = " + f2(es.Hop) + " m (curva: " + es.fonte + "). " + es.verifs.map(function (v) { return v.nome + ": " + v.texto + (v.ok === false ? " ✗" : (v.ok === null ? " (pendente)" : " ✓")); }).join(" · "));
        var opc = c.opcoes.filter(function (o) { return o.id === "c" && o.resolve; })[0] || c.opcoes.filter(function (o) { return o.id === "d" && o.resolve; })[0];
        if (opc) s.tabelas.push({ titulo: "Especificação da instalação e quantitativo do conjunto", cab: ["Item", "Qtd", "Código SINAPI", "Preço unit.", "Observação"],
          linhas: opc.itens.map(function (it) { return [it.descricao, String(it.qtd), it.codigo || (it.mercado ? "ref. de mercado" : "pendente"), it.preco != null ? rs(it.preco) : "—", it.motivo || (it.sinapiDescricao || "")]; }) });
        s.paragrafos.push(["pz.local", "pz.afogado", "pz.bypass", "pz.reserva", "pz.uniao", "pz.retencao", "pz.base", "pz.dreno", "pz.eletrica", "pz.flexivel", "pz.tanque"].map(decisao).join(" "));
        if (m.eletrica) s.paragrafos.push("Elétrica (pendência do projeto elétrico): " + arr(m.eletrica.tensao_V).join(" ou ") + " V, " + (m.eletrica.potencia_W ? m.eletrica.potencia_W + " W, " : "") + m.eletrica.potencia_cv + " cv" + (m.eletrica.corrente_A ? ", " + Object.keys(m.eletrica.corrente_A).map(function (k) { return k + " V: " + m.eletrica.corrente_A[k] + " A"; }).join("; ") : "") + " — " + fonteTxt(m, m.eletrica.fonte) + ".");
      }
      c.decisoes.forEach(function (d0) { s.paragrafos.push(d0); });
      secoes.push(s);
    });
    if (pz.instalados.length) {
      secoes.push({ titulo: "Pressurizadores na rede — verificação final", paragrafos: ["A rede de água fria foi recalculada com o ganho de cada bomba tirado da curva na vazão do trecho (HidAF)."], tabelas: [
        { titulo: "Ponto de operação na rede", cab: ["Equipamento", "Modelo", "Q (m³/h)", "H (m)", "Situação"], linhas: pz.instalados.map(function (b) { return [b.famInst, b.nome, f2(b.Q_m3h), f2(b.H_m), b.reserva ? "reserva (registro fechado)" : txt(b.status)]; }) }] });
    }
    return { secoes: secoes };
  }

  /* ======================================================== PRANCHA: DETALHE DO PRESSURIZADOR
   * Folha própria (js/hidpranchas.js chama quando o modelo tem pressurizador): esquema da instalação SEM ESCALA à
   * esquerda (barrilete, by-pass NF, cada bomba com RG / união / bomba / união / retenção / RG, base, dreno, ponto de
   * força) e, à direita, a ficha do modelo (fonte e página) e a CURVA com o ponto de operação da rede recalculada. */
  function temNoModelo(modeloBim) { return arr(modeloBim && modeloBim.estado && modeloBim.estado.familias).some(function (f) { return !!modeloDoFam(f.famId) && /-u0-bomba$/.test(txt(f.id)); }); }
  /* hid:geometria-inicio — proporções do esquema (frações da área útil da folha; mm de papel nos símbolos) */
  var PR = { larg: 0.55, topo: 0.16, barr: 0.24, base: 0.74, ramo0: 0.18, r: 3.2, tick: 2.2, leque: 6, alt: 14, voluta: 5, motorW: 16, motorH: 9, sobe: 12, baseW: 32, baseH: 3, ralo: 8, entre: 1.6, passoV: 30,
             grafX: 0.62, grafY: 0.5, grafW: 0.33, grafH: 0.34, ptR: 1.4, posUn: 0.15, posRt: 0.45, posRg: 0.72 };
  /* hid:geometria-fim */
  function folhaPrancha(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, h = T.minimo, est = c.modelo && c.modelo.estado;
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "ESQUEMÁTICO - SEM ESCALA");   // hid:ok desenho/formatação (posição de texto, data AAAA-MM-DD)
    var bombas = arr(est && est.familias).filter(function (f) { return !!modeloDoFam(f.famId) && /-u\d+-bomba$/.test(txt(f.id)); });
    if (!bombas.length) { D.texto(a.x + PR.leque, a.y + a.h * PR.topo, "Sem pressurizador no modelo.", T.nota, {}); return { escala: "SEM ESCALA" }; }
    var m = modeloDoFam(bombas[0].famId), n = bombas.length, af = c.r && c.r.sistemas && c.r.sistemas.agua_fria, op = arr(af && af.bombas).filter(function (b) { return !b.reserva; })[0];
    var x0 = a.x + PR.ralo, x1 = a.x + a.w * PR.larg, yB = a.y + a.h * PR.barr, yBase = a.y + a.h * PR.base, r = PR.r, tk = PR.tick;
    function RG(x, y, nf) { D.poli([[x - r, y - r], [x + r, y + r], [x + r, y - r], [x - r, y + r]], "HID-SIMBOLO", true); if (nf) D.texto(x + r + 1, y - r - 1, "NF", h, {}); }
    function UN(x, y, vert) { if (vert) { D.linha(x - PR.entre, y - tk, x + PR.entre, y - tk, "HID-SIMBOLO"); D.linha(x - PR.entre, y + tk, x + PR.entre, y + tk, "HID-SIMBOLO"); } else { D.linha(x - tk, y - PR.entre, x - tk, y + PR.entre, "HID-SIMBOLO"); D.linha(x + tk, y - PR.entre, x + tk, y + PR.entre, "HID-SIMBOLO"); } }
    function RT(x, y) { D.poli([[x - r, y + r], [x + r, y + r], [x, y - r]], "HID-SIMBOLO", true); }
    D.linha(x0, yB, x1, yB, "HID-AF-TUBO");
    D.texto(x0, yB - r - 2, "DO RESERVATÓRIO", h, {}); D.texto(x1, yB - r - 2, "AOS PONTOS", h, { al: "D" });
    var xa = x0 + (x1 - x0) * PR.ramo0, xb = x1 - (x1 - x0) * PR.ramo0;
    RG((xa + xb) / 2, yB, true); D.texto((xa + xb) / 2, yB - r * 3, "BY-PASS (registro normalmente fechado)", h, { al: "C" });   // hid:ok desenho/formatação (posição de texto, data AAAA-MM-DD)
    for (var k = 0; k < n; k++) {
      var xs = xa + k * PR.leque, xr = xb - k * PR.leque, yP = yBase - PR.alt - k * PR.passoV, xm = (xs + xr) / 2, yS = yP - PR.sobe;
      D.linha(xs, yB, xs, yP, "HID-AF-TUBO"); D.linha(xs, yP, xm - PR.voluta * 2, yP, "HID-AF-TUBO");
      RG(xs, (yB + yP) / 2, k > 0); UN(xm - PR.voluta * 3, yP, false);   // hid:ok desenho/formatação (posição de texto, data AAAA-MM-DD)
      D.circ(xm - PR.voluta, yP, PR.voluta, "HID-SIMBOLO"); D.ret(xm, yP - PR.motorH / 2, PR.motorW, PR.motorH, "HID-SIMBOLO");
      D.linha(xm - PR.voluta, yP - PR.voluta, xm - PR.voluta, yS, "HID-AF-TUBO"); D.linha(xm - PR.voluta, yS, xr, yS, "HID-AF-TUBO"); D.linha(xr, yS, xr, yB, "HID-AF-TUBO");
      UN(xr, yS + (yB - yS) * PR.posUn, true); RT(xr, yS + (yB - yS) * PR.posRt); RG(xr, yS + (yB - yS) * PR.posRg, false);
      D.ret(xm - PR.baseW / 2, yP + PR.motorH / 2, PR.baseW, PR.baseH, "HID-CONTEXTO");
      D.texto(xm, yP + PR.motorH / 2 + PR.baseH + h * PR.entre, (k ? "RESERVA" : "OPERAÇÃO") + " - " + m.modelo, h, { al: "C" });
    }
    D.linha(x0, yBase, x1, yBase, "HID-TITULO");
    D.circ(x1 - PR.ralo, yBase - PR.entre, PR.entre, "HID-SIMBOLO"); D.texto(x1 - PR.ralo, yBase + h * PR.entre * 2, "RALO (DRENO)", h, { al: "C" });
    var el = m.eletrica || {}, yL = yBase + h * PR.entre * 4;   // hid:ok desenho/formatação (posição de texto, data AAAA-MM-DD)
    ["PF: ponto de força " + arr(el.tensao_V).join("/") + " V" + (el.potencia_W ? ", " + el.potencia_W + " W" : "") + " - circuito e DR no projeto elétrico",
     "RG: registro de gaveta bruto na entrada e na saída de cada bomba", "União roscável nos dois bocais (desmontar sem cortar tubo)",
     "Retenção vertical na saída de cada bomba; by-pass mantém a gravidade na manutenção", "Sucção afogada, na cota do barrilete (nunca acima do nível d'água)"]
      .forEach(function (t0, i) { D.texto(x0, yL + i * h * PR.entre, t0, h, {}); });
    var gx = a.x + a.w * PR.grafX, gy = a.y + a.h * PR.topo, larg = a.w * (1 - PR.grafX) - PR.ralo, li = 0;
    [m.fabricante + " " + m.modelo + " (" + txt(m.tipo) + ") - " + n + " un (" + (n > 1 ? "1 + " + (n - 1) + " reserva" : "1") + ")",
     "Curva: " + fonteTxt(m, m.curva && m.curva.fonte), "Cotas: " + fonteTxt(m, m.dimensoes && m.dimensoes.fonte),
     "Bocais: sucção " + txt(m.conexoes.succao.rosca) + " / recalque " + txt(m.conexoes.recalque.rosca),
     "Elétrica: " + arr(el.tensao_V).join(" ou ") + " V" + (el.potencia_cv != null ? ", " + el.potencia_cv + " cv" : "") + (el.potencia_W ? ", " + el.potencia_W + " W" : ""),
     op ? "Ponto de operação na rede: Q = " + f2(op.Q_m3h) + " m³/h, H = " + f2(op.H_m) + " m" : "Ponto de operação: dimensionar a rede"]
      .forEach(function (t0) { c.AP.quebrar(t0, h, larg).forEach(function (ln) { D.texto(gx, gy + li * h * PR.entre, ln, h, {}); li++; }); });
    var p = pontosCurva(m), qM = Math.max.apply(null, p.map(function (x) { return x.Q; })) || 1, hM = Math.max.apply(null, p.map(function (x) { return x.H; })) || 1;
    var GX = gx, GY = a.y + a.h * (PR.grafY + PR.grafH), GW = a.w * PR.grafW, GH = a.h * PR.grafH;
    D.linha(GX, GY, GX + GW, GY, "HID-TITULO"); D.linha(GX, GY, GX, GY - GH, "HID-TITULO");
    D.texto(GX + GW, GY + h * PR.entre * 2, "Q (m³/h) - máx. " + f2(qM), h, { al: "D" }); D.texto(GX, GY - GH - h, "H (mca) - máx. " + f2(hM) + " - curva do catálogo", h, {});
    D.poli(p.map(function (x) { return [GX + x.Q / qM * GW, GY - x.H / hM * GH]; }), "HID-AF-TUBO", false);
    if (op && op.Q_m3h != null && op.H_m != null) {
      var px = GX + Math.min(op.Q_m3h, qM) / qM * GW, py = GY - Math.min(op.H_m, hM) / hM * GH;
      D.ponto(px, py, PR.ptR, "#c00000"); D.texto(px + PR.r, py + PR.r * 2, "ponto de operação", h, { cor: "#c00000" });
    }
    return { escala: "SEM ESCALA" };
  }

  /* motobombas centrífugas do catálogo (tipo "centrifuga") no formato do js/hidbombas.js */
  function bombasRecalque() {
    return modelos().filter(function (m) { return m.tipo === "centrifuga"; }).map(function (m) {
      return { id: m.id, nome: m.fabricante + " " + m.modelo, fabricante: m.fabricante, potencia_cv: num(m.eletrica && m.eletrica.potencia_cv, null), fonte: fonteTxt(m, m.curva && m.curva.fonte),
               curva: pontosCurva(m).map(function (p) { return { q_m3h: p.Q, h_m: p.H }; }),
               npshr: arr(m.npshr && m.npshr.pontos).map(function (p) { return { q_m3h: Number(p.Q), npshr_m: Number(p.H) }; }) };
    });
  }

  var HidPressao = { VERSAO: 1, bombasRecalque: bombasRecalque, temNoModelo: temNoModelo, folhaPrancha: folhaPrancha, modelos: modelos, modelo: modelo, famIdDe: famIdDe, modeloDoFam: modeloDoFam, altura: altura, alturaMax: alturaMax, npshr: npshr,
                     familias: familias, familia: familia, equipamento: equipamento, fechado: fechado, travado: travado, ganho: ganho, ganhoMax: ganhoMax,
                     rotavel: rotavel, leqExtra: leqExtra, selecionar: selecionar, instalacao: instalacao, diagnosticar: diagnosticar, memorial: memorial, itensConjunto: itensConjunto, fonteTxt: fonteTxt, dnDaPol: dnDaPol,
                     _int: { pontosCurva: pontosCurva, colide: colide, RE_FECHADO: RE_FECHADO } };
  global.HidPressao = HidPressao;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPressao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
