/* =====================================================================
 * acocype.js — EXPORTAÇÃO DO GALPÃO CALCULADO PARA O CYPE 3D 2026.a
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 * O CYPE 3D 2026.a NÃO aceita por arquivo cargas, hipóteses, material nem
 * flambagem. O que mais leva configurado é o IFC 2x3 com o MODELO ANALÍTICO
 * ("Nova obra → Entrada automática IFC"). Por isso a exportação tem 3 peças:
 *
 *   AcoCype.ifc(r, opcoes)        IFC 2x3 (StructuralAnalysisView): o
 *       IfcStructuralAnalysisModel com os nós (IfcStructuralPointConnection,
 *       vínculo das bases em IfcBoundaryNodeCondition), as barras
 *       (IfcStructuralCurveMember: rígida, biarticulada ou tirante) com as
 *       RÓTULAS nas pontas (IfcRelConnectsStructuralMember + condição no
 *       sistema da barra), o NOME da seção no padrão do catálogo do CYPE
 *       (IfcGeneralProfileProperties + perfil geométrico) e o aço
 *       (IfcMaterial). A seção chega "Não definido" no assistente do CYPE e o
 *       engenheiro escolhe a do catálogo — por isso o nome tem de ser o dele.
 *   AcoCype.txt(r)                "Geometria → Importar → arquivo de texto"
 *       (NUDOS / BARRAS — só geometria), ASCII, CRLF, como os exemplos que
 *       vêm com o CYPE 3D.
 *   AcoCype.txtEtiquetas(r, op)   o mesmo texto, UM ARQUIVO POR ETIQUETA
 *       (PILAR, VIGA, TAPAMENTO, TERCA…), numeração única: os nós
 *       coincidentes se unem na importação e cada grupo fica selecionável
 *       pela etiqueta (regra da casa: operação própria = etiqueta própria).
 *   AcoCype.roteiro(r, opcoes)    HTML para o engenheiro terminar no CYPE em
 *       minutos. Abre com "Como usar no CYPE 3D" (passos numerados, do zero
 *       até comparar o resultado: onde fica o comando, o que fazer, o que
 *       conferir; o que é manual e por quê; problemas comuns) e traz TUDO o
 *       que o OrçaPRO já calculou e o CYPE não lê por arquivo: seção (nome do
 *       catálogo), aço, vínculos e rótulas, flambagem e flambagem lateral (FLT)
 *       de cada barra, hipóteses e cargas (com as pressões do vento),
 *       combinações, dados do vento para o Gerador de pórticos e o resultado
 *       do OrçaPRO para comparar.
 *   AcoCype.comoUsarHTML(r, op)   o mesmo guia, enxuto (fragmento <section>,
 *       sem estilos externos), para o painel "Como usar no CYPE 3D" da tela;
 *       sem resultado (r nulo) devolve o guia genérico, sem números.
 *   AcoCype.nomeCype(nome)        nome do perfil no catálogo do CYPE:
 *       { nome, catalogo, certeza: "alta"|"media"|"baixa"|"nenhuma", obs }.
 *   AcoCype.arquivos(r, opcoes)   [{ nome, tipo, conteudo }] — tudo junto,
 *       para a tela oferecer o download.
 *
 * EIXOS. OrçaPRO: X ao longo do vão, Y para cima, Z ao longo do comprimento.
 * CYPE e IFC: Z para cima. Conversão usada (rotação própria — permutação
 * cíclica, mantém a regra da mão direita):
 *        X_cype = z_orca  (comprimento)   Y_cype = x_orca  (vão)
 *        Z_cype = y_orca  (vertical)
 * Por que esta e não (x, −z, y): no CYPE 3D a barra VERTICAL tem o z local
 * paralelo ao Y geral (manual do CYPE 3D, "eixos locais da barra"); com os
 * pórticos no plano YZ a alma dos pilares já cai no plano do pórtico e só as
 * colunas de tapamento dos oitões pedem "giro a 90°" — exatamente como no
 * exemplo prático do próprio CYPE (Gerador de pórticos → CYPE 3D). O roteiro
 * manda conferir na primeira importação.
 *
 * O QUE NÃO VAI POR ARQUIVO (o roteiro traz os números): perfil do catálogo
 * (o nome vai), aço (vai no IFC, o CYPE não lê), flambagem, FLT, hipóteses,
 * cargas, combinações, tipo "tirante" do contraventamento.
 *
 * Erros: modelo ausente ou inconsistente → `throw Error("AcoCype: …")` com o
 * motivo (nunca exporta modelo pela metade).
 * Teste: node tools/test-aco-cype.js  (+ tools/conferir-aco-cype.py, IfcOpenShell)
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = "1.0";
  /* IFC 2x3 não tem booleano no vínculo: rigidez "infinita" = 1E+10 (o exemplo
     mínimo validado usa esse valor), 0 = livre. As molas, se houver, vão em
     unidades SI (N/m, N·m/rad: o IFC usa SI quando a unidade derivada não está
     no IfcUnitAssignment). */
  var RIGIDO = 1e10;

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function erro(msg) { return new Error("AcoCype: " + msg); }
  function br(v, c) { if (!fin(v)) return "—"; c = c == null ? 2 : c; var k = Math.pow(10, c), r = Math.round(v * k) / k; if (r === 0) r = 0; return r.toFixed(c).replace(".", ","); }
  function brp(v) { return fin(v) ? br(v * 100, 1) + " %" : "—"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }

  /* ------------------------------------------------------------ vetores */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function unit(a) { var l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; }
  function r6(v) { var x = Math.round(v * 1e6) / 1e6; return x === 0 ? 0 : x; }

  /* =============================================================== EIXOS */
  function paraCype(v) { return [v[2], v[0], v[1]]; }
  /* graus de liberdade do CYPE (DX, DY, DZ, GX, GY, GZ) ← componentes do OrçaPRO */
  var GL_CYPE = ["uz", "ux", "uy", "rz", "rx", "ry"];
  var GL_NOME = ["DX", "DY", "DZ", "GX", "GY", "GZ"];
  /* eixos locais da barra no OrçaPRO (js/acoanalise.js): x de i para j, y = altura da seção (vy), z = x × y */
  function eixosOrca(o) {
    var ex = unit(sub(o.j.o, o.i.o)), vy = Array.isArray(o.b.vy) && o.b.vy.length === 3 ? o.b.vy.map(function (v) { return num(v, 0); }) : null;
    if (!vy || !(len(vy) > 0) || len(cross(ex, unit(vy))) < 1e-3) vy = Math.abs(ex[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var ey = unit(sub(vy, mul(ex, dot(vy, ex)))), ez = cross(ex, ey);
    return { x: ex, y: ey, z: ez };
  }
  /* eixos locais PADRÃO do CYPE 3D (manual): x de 1 para 2; z no plano vertical que contém a barra, para cima;
     barra vertical: z paralelo ao Y geral; y = z × x */
  function eixosCypePadrao(o) {
    var x = unit(sub(o.j.c, o.i.c)), h = Math.sqrt(x[0] * x[0] + x[1] * x[1]);
    var z = h < 1e-6 ? [0, 1, 0] : unit([-x[2] * x[0], -x[2] * x[1], 1 - x[2] * x[2]]);
    return { x: x, y: cross(z, x), z: z };
  }
  /* onde fica a mesa +y do OrçaPRO em relação ao z local padrão do CYPE: +1 (aba superior), −1 (inferior), 0 (seção girada 90°) */
  function ladoMesaMais(o) {
    if (!Array.isArray(o.b.vy)) return null;
    var d = dot(paraCype(eixosOrca(o).y), eixosCypePadrao(o).z);
    return Math.abs(d) < 0.5 ? 0 : (d > 0 ? 1 : -1);
  }

  /* ============================================================ ETIQUETAS */
  var ETIQUETAS = [
    { id: "PILAR", desc: "pilares dos pórticos" },
    { id: "VIGA", desc: "vigas de cobertura (do beiral à cumeeira)" },
    { id: "TAPAMENTO", desc: "colunas de tapamento dos oitões" },
    { id: "TERCA", desc: "terças (escoras da cobertura, biarticuladas)", escora: true },
    { id: "BEIRAL", desc: "escoras do beiral (biarticuladas)", escora: true },
    { id: "TRAVESSA", desc: "travessas das paredes laterais (biarticuladas)", escora: true },
    { id: "TRAVESSA_OITAO", desc: "travessas dos oitões (biarticuladas)", escora: true },
    { id: "PORTICO_TRAV", desc: "vigas do pórtico de travamento (beiral, ligação rígida)" },
    { id: "CONTRAV_PAREDE", desc: "contraventamento em X das paredes (só tração)", tirante: true },
    { id: "CONTRAV_COB", desc: "contraventamento em X da cobertura (só tração)", tirante: true },
    { id: "OUTRAS", desc: "outras barras" }
  ];
  var ETQ = {}; ETIQUETAS.forEach(function (e, i) { e.ordem = i; ETQ[e.id] = e; });
  function etiquetaDe(b, membro) {
    if (membro) return membro.papel === "pilar" ? "PILAR" : membro.papel === "viga" ? "VIGA" : membro.papel === "tapamento" ? "TAPAMENTO" : "OUTRAS";
    var id = String(b.id);
    if (b.papel === "contravento" || b.tracao) return /^XC/.test(id) ? "CONTRAV_COB" : "CONTRAV_PAREDE";
    if (/^ES/.test(id)) return "TERCA";
    if (/^BE/.test(id)) return "BEIRAL";
    if (/^TR[LR]/.test(id)) return "TRAVESSA";
    if (/^TO/.test(id)) return "TRAVESSA_OITAO";
    if (/^PT/.test(id)) return "PORTICO_TRAV";
    return "OUTRAS";
  }

  /* ========================================================= NOME NO CYPE
   * Padrões confirmados (pesquisa de 12/10/2026 na biblioteca do CYPE 3D):
   *   catálogo "Açominas" (laminados Gerdau): "W 310 x 38.7", "W 250 x 73.0" (ponto decimal);
   *   catálogo "USIMINAS" (soldados NBR 5884): "VS 900x139", "CVS 950x404", "CS 250x52".
   * Os demais (frio, tubos, barras, cantoneiras) ficam com certeza "baixa": o nome
   * é sugestão e o roteiro traz as propriedades para conferir/criar a seção. */
  function pontoDec(s, umaCasa) { s = String(s).replace(",", "."); if (umaCasa && s.indexOf(".") < 0) s += ".0"; return s; }
  function nomeCype(nomeOrca) {
    var s = String(nomeOrca == null ? "" : nomeOrca).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""), m, C = Cat();
    if (!s) return { nome: "", catalogo: null, certeza: "nenhuma", obs: "perfil sem nome" };
    m = /^(W|HP) ?(\d+) ?[xX×] ?(\d+(?:[.,]\d+)?) Gerdau$/.exec(s);
    if (m) return { nome: m[1] + " " + m[2] + " x " + pontoDec(m[3], true), catalogo: "Açominas", certeza: "alta",
                    obs: "laminado Gerdau (antiga Açominas): biblioteca de perfis laminados do CYPE, catálogo Açominas" };
    m = /^(\d+) ?x ?(\d+(?:[.,]\d+)?) kg\/m \((I|H|HP)\) ArcelorMittal$/i.exec(s);
    if (m) {
      var c = C && C.obter ? C.obter(s) : null, par = c && c.par ? nomeCype(c.par) : null;
      return { nome: par && par.certeza === "alta" ? par.nome : (m[3].toUpperCase() === "HP" ? "HP" : "W") + " " + m[1] + " x " + pontoDec(m[2], true), catalogo: "Açominas", certeza: "media",
               obs: "perfil ArcelorMittal: mesmo W/HP nominal do catálogo Açominas" + (c && c.par ? " (" + c.par + ")" : "") + " — conferir d, bf, tw e tf" };
    }
    m = /^(W|HP)(\d+)X(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) {
      var tipo = m[1].toUpperCase(), cand = tipo + " " + m[2] + " x " + pontoDec(m[3], true).replace(".", ",") + " Gerdau";
      if (C && C.obter && C.obter(cand)) return { nome: tipo + " " + m[2] + " x " + pontoDec(m[3], true), catalogo: "Açominas", certeza: "media", obs: "perfil da base AISC: o " + tipo + " de mesmo nome do catálogo Açominas tem as mesmas dimensões nominais — conferir" };
      return { nome: tipo + m[2] + "x" + m[3], catalogo: "AISC (conferir no CYPE)", certeza: "baixa", obs: "procure pelo nome/dimensões na biblioteca AISC do CYPE ou crie a seção com as propriedades do roteiro" };
    }
    m = /^(CS|CVS|VS) ?(\d+) ?[xX×] ?(\d+(?:[.,]\d+)?)$/i.exec(s);
    if (m) return { nome: m[1].toUpperCase() + " " + m[2] + "x" + pontoDec(m[3], false), catalogo: "USIMINAS", certeza: "alta", obs: "soldado NBR 5884: biblioteca de perfis soldados do CYPE, catálogo USIMINAS" };
    m = /^(CE|CVE|VE) ?(\d+) ?[xX×] ?(\d+(?:[.,]\d+)?)$/i.exec(s);
    if (m) return { nome: m[1].toUpperCase() + " " + m[2] + "x" + pontoDec(m[3], false), catalogo: "USIMINAS (conferir)", certeza: "baixa", obs: "eletrossoldado: o padrão de nome no CYPE não foi confirmado — procure pelas dimensões" };
    m = /^Barra redonda ?Ø ?(\d+(?:[.,]\d+)?) ?mm$/i.exec(s) || /^BR .*\(D ?(\d+(?:[.,]\d+)?) ?mm\)/i.exec(s);
    if (m) return { nome: "Redondo " + pontoDec(m[1], false) + " mm", catalogo: "barras redondas (tirante)", certeza: "baixa",
                    obs: "no CYPE: tipo TIRANTE com barra redonda (varão) Ø " + br(num(String(m[1]).replace(",", "."), 0), 1) + " mm; se o diâmetro não existir na série, use o comercial igual ou maior ou uma seção genérica de mesma área" };
    m = /^(TC|TQ|TR) (.+?) (VMB|Tuper)$/i.exec(s);
    if (m) return { nome: m[1].toUpperCase() + " " + m[2].replace(/,/g, ".").replace(/ ?x ?/g, "x"), catalogo: "tubos (" + m[3] + ") — conferir", certeza: "baixa", obs: "tubo: o padrão de nome do catálogo do CYPE não foi confirmado — procure pelas dimensões" };
    m = /^(Ue|Ze|U|Z|L) (\d+(?:[.,]\d+)?(?: x \d+(?:[.,]\d+)?)+)( Isoeste)?$/.exec(s);
    if (m && !/"/.test(s)) return { nome: m[1] + " " + m[2].replace(/,/g, ".").replace(/ x /g, "x"), catalogo: "formados a frio (NBR 6355) — conferir", certeza: "baixa", obs: "formado a frio: procure pelas dimensões na série de perfis conformados/formados a frio do CYPE" };
    m = /^(L|U|I) (.+) (Gerdau|ArcelorMittal)$/.exec(s);
    if (m) return { nome: s.replace(/ (Gerdau|ArcelorMittal)$/, "").replace(/,/g, "."), catalogo: "laminados (" + m[3] + ") — conferir", certeza: "baixa", obs: "laminado em polegadas/cantoneira: procure pelas dimensões na biblioteca do CYPE" };
    if (/^Ter[cç]a \(escora\)$/i.test(s)) return { nome: "TERCA (definir no CYPE)", catalogo: null, certeza: "nenhuma", obs: "seção PROVISÓRIA do OrçaPRO (escora só de força normal): o perfil real vem do dimensionamento das terças (NBR 14762)" };
    return { nome: ascii(s), catalogo: null, certeza: "nenhuma", obs: "sem equivalente conhecido no CYPE: crie uma seção genérica com as propriedades do roteiro" };
  }

  /* ============================================================ MODELO */
  function lerModelo(r) {
    if (!r || typeof r !== "object") throw erro("resultado do cálculo ausente.");
    var G = r.modelo && r.modelo.modelo && r.modelo.modelo.nos ? r.modelo : (r.modelo && Array.isArray(r.modelo.nos) && r.layout ? r : null);
    if (!G) throw erro(r.ok === false ? "o cálculo não terminou (" + (r.motivo || (r.problemas && r.problemas[0] && r.problemas[0].texto) || "sem modelo") + ") — não há o que exportar." : "resultado sem o modelo de cálculo (r.modelo.modelo).");
    var mod = G.modelo, M = { r: r === G ? {} : r, G: G, mod: mod, L: G.layout || {}, par: G.par || {}, nos: [], porId: {}, barras: [], barraPorId: {}, membroDaBarra: {}, apoios: [], apoioDoNo: {} };
    arr(mod.nos).forEach(function (n, i) {
      if (!n || typeof n !== "object" || n.id == null) throw erro("nó na posição " + (i + 1) + " inválido — modelo incompleto (amostra enxugada?).");
      if (!fin(n.x) || !fin(n.y) || !fin(n.z)) throw erro("nó " + n.id + " com coordenada inválida.");
      var id = String(n.id); if (M.porId[id]) throw erro("nó repetido: " + id + ".");
      var o = { id: id, num: M.nos.length + 1, o: [n.x, n.y, n.z] }; o.c = paraCype(o.o).map(r6);
      M.nos.push(o); M.porId[id] = o;
    });
    if (!M.nos.length) throw erro("modelo sem nós.");
    arr(mod.barras).forEach(function (b, i) {
      if (!b || typeof b !== "object" || b.id == null) throw erro("barra na posição " + (i + 1) + " inválida — modelo incompleto (amostra enxugada?).");
      var id = String(b.id); if (M.barraPorId[id]) throw erro("barra repetida: " + id + ".");
      var a = M.porId[String(b.i)], c = M.porId[String(b.j)];
      if (!a || !c) throw erro("a barra " + id + " liga um nó que não existe (" + b.i + " → " + b.j + ").");
      if (a === c) throw erro("a barra " + id + " tem as duas pontas no mesmo nó.");
      var Lb = len(sub(c.o, a.o)); if (!(Lb > 1e-6)) throw erro("a barra " + id + " tem comprimento nulo.");
      var o = { id: id, num: M.barras.length + 1, b: b, i: a, j: c, L: Lb };
      M.barras.push(o); M.barraPorId[id] = o;
    });
    if (!M.barras.length) throw erro("modelo sem barras.");
    arr(G.membros).forEach(function (m) { arr(m && m.segs).forEach(function (s) { M.membroDaBarra[String(s)] = m; }); });
    arr(mod.apoios).forEach(function (a) {
      var no = a && M.porId[String(a.no)]; if (!no) throw erro("apoio em nó que não existe: " + (a && a.no) + ".");
      M.apoios.push({ no: no, a: a }); M.apoioDoNo[no.id] = a;
    });
    M.barras.forEach(function (o) {
      o.membro = M.membroDaBarra[o.id] || null;
      o.etiqueta = etiquetaDe(o.b, o.membro);
      o.sec = infoSecao(M, o);
      o.aco = acoDaBarra(M, o);
      o.lado = ladoMesaMais(o);
      o.giro = o.lado === 0 ? 90 : 0;
    });
    return M;
  }
  function acoPorId(id) { var Mt = Mat(), a = Mt && id && Mt.aco ? Mt.aco(id) : null; return a || (id ? { id: id } : null); }
  function acoDaBarra(M, o) {
    var Gr = M.G.grupos || {}, acos = M.par.acos || {};
    if (o.membro && o.membro.aco) return o.membro.aco;
    if (ETQ[o.etiqueta].tirante) return (Gr.contravento && Gr.contravento.aco) || acoPorId(acos.barra || "ASTM A36");
    if (o.etiqueta === "PORTICO_TRAV") return (Gr.viga && Gr.viga.aco) || acoPorId(acos.perfil);
    if (ETQ[o.etiqueta].escora) return acoPorId(acos.frio || "NBR 6650 CF-26");
    return acoPorId(acos.perfil || "ASTM A572 Gr.50");
  }
  /* seção da barra: nome do OrçaPRO, nome no CYPE, se é provisória, geometria (mm) */
  function infoSecao(M, o) {
    var S = M.G.secoes || {}, e = o.etiqueta, s = null;
    if (o.membro && o.membro.secao) s = o.membro.secao;
    else if (ETQ[e].escora) s = S.escora || null;
    else if (e === "PORTICO_TRAV") s = S.viga || null;
    else if (ETQ[e].tirante) s = S.contravento || null;
    var A = s && fin(s.A) ? s.A : num(o.b.secao && o.b.secao.A, null);
    var nomeO = s && s.nome ? String(s.nome) : null;
    var prov = !s || !s.mm;
    var cy = nomeO && !prov ? nomeCype(nomeO) : { nome: e + " (definir no CYPE)", catalogo: null, certeza: "nenhuma",
      obs: nomeO ? "seção PROVISÓRIA do OrçaPRO (\"" + nomeO + "\", escora só de força normal, A = " + br(A * 1e4, 2) + " cm²): o perfil real vem do dimensionamento à parte (NBR 14762)" : "barra sem seção identificada no modelo" };
    if (prov && nomeO) cy.nome = e + " (definir no CYPE)";
    var chave = prov ? "ETQ:" + e : "SEC:" + nomeO;
    return { s: s, nome: nomeO || "(sem seção)", cype: cy, provisoria: prov, chave: chave, A: A, massa: s && fin(s.massa) ? s.massa : null,
             forma: s ? s.forma : null, mm: s && s.mm ? s.mm : null, cat: s && s.cat ? s.cat : null };
  }

  /* ================================================================ IFC */
  var TRANSLIT = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
    "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n",
    "Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A", "É": "E", "Ê": "E", "È": "E", "Í": "I", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O", "Ú": "U", "Ü": "U", "Ç": "C", "Ñ": "N",
    "Ø": "D", "ø": "d", "×": "x", "·": ".", "º": "o", "ª": "a", "°": "o", "²": "2", "³": "3", "—": "-", "–": "-", "−": "-", "→": "->", "’": "'", "‘": "'", "“": "\"", "”": "\"", "…": "...", "µ": "u", "Δ": "D", "λ": "l", "β": "b", "γ": "g", "ψ": "psi" };
  function ascii(s) {
    s = String(s == null ? "" : s); var o = "";
    for (var i = 0; i < s.length; i++) { var ch = s.charAt(i), c = s.charCodeAt(i); if (c >= 32 && c < 127) o += ch; else if (TRANSLIT[ch] != null) o += TRANSLIT[ch]; else if (c === 9 || c === 10 || c === 13) o += " "; else o += "?"; }
    return o;
  }
  function sStr(s) { return s == null ? "$" : "'" + ascii(s).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'"; }
  function sReal(v) {
    if (!fin(v)) throw erro("número inválido no IFC (" + v + ").");
    if (v === 0) return "0.";
    var a = Math.abs(v), s;
    if (a >= 1e-3 && a < 1e9) {
      s = String(Math.round(v * 1e9) / 1e9);
      if (/e/i.test(s)) s = v.toFixed(9).replace(/0+$/, "");
      return s.indexOf(".") < 0 ? s + "." : s;
    }
    var p = v.toExponential(9).split("e"), m = p[0].replace(/0+$/, ""), x = parseInt(p[1], 10);
    if (m.indexOf(".") < 0) m += ".";
    return m + "E" + (x < 0 ? "-" : "+") + (Math.abs(x) < 10 ? "0" : "") + Math.abs(x);
  }
  function sLista(a) { return "(" + a.join(",") + ")"; }
  /* GlobalId determinístico (mesmo modelo + mesma obra → mesmos ids: exportar de novo não "duplica" nada) */
  function mul32(a, b) { var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff; return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) >>> 0; }
  function fmix(h) { h ^= h >>> 16; h = mul32(h, 0x85ebca6b); h ^= h >>> 13; h = mul32(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
  function hash32(s, semente) {
    var h = (0x811c9dc5 ^ semente) >>> 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h = mul32((h ^ (c & 0xff)) >>> 0, 0x01000193); h = mul32((h ^ (c >>> 8)) >>> 0, 0x01000193); }
    return fmix((h ^ s.length) >>> 0);
  }
  var B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  function c64(v, n) { var o = ""; for (var i = 0; i < n; i++) { o = B64.charAt(v % 64) + o; v = Math.floor(v / 64); } return o; }
  function guid(chave) {
    var b = [], sem = [0x9e3779b9, 0x7f4a7c15, 0x94d049bb, 0xbf58476d];
    for (var k = 0; k < 4; k++) { var w = hash32(chave, sem[k]); b.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255); }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;   /* forma de UUID v4 */
    var s = c64(b[0], 2);
    for (var i = 1; i < 16; i += 3) s += c64(b[i] * 65536 + b[i + 1] * 256 + b[i + 2], 4);
    return s;
  }
  function lerData(d) {
    var t = d instanceof Date ? d.getTime() : (typeof d === "number" ? d : (typeof d === "string" ? Date.parse(d) : NaN));
    if (!fin(t)) t = Date.now();
    return new Date(t);
  }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function isoUTC(dt) { return dt.getUTCFullYear() + "-" + dois(dt.getUTCMonth() + 1) + "-" + dois(dt.getUTCDate()) + "T" + dois(dt.getUTCHours()) + ":" + dois(dt.getUTCMinutes()) + ":" + dois(dt.getUTCSeconds()); }
  function dataBR(dt) { return dois(dt.getUTCDate()) + "/" + dois(dt.getUTCMonth() + 1) + "/" + dt.getUTCFullYear(); }

  /* rigidez do vínculo do apoio em eixos do CYPE: true → rígido; número > 0 → mola (kN/m → N/m) */
  function vinculoCype(a) {
    return GL_CYPE.map(function (k) { var v = a[k]; if (v === true) return RIGIDO; if (typeof v === "number" && v > 0) return v * 1000; return 0; });
  }
  function nomeVinculo(v) {
    var t = v.slice(0, 3).every(function (x) { return x === RIGIDO; }), rx = v[3] === RIGIDO, ry = v[4] === RIGIDO, rz = v[5] === RIGIDO;
    if (t && !rx && !ry && !rz) return "Articulado";
    if (t && !rx && !ry && rz) return "Articulado - giro em Z impedido";
    if (t && rx && !ry && rz) return "Engastado no plano YZ (portico) - giro em Y livre";
    if (t && rx && ry && rz) return "Engastado";
    return "Vinculo " + GL_NOME.map(function (n, i) { return n + (v[i] === RIGIDO ? "=fixo" : (v[i] > 0 ? "=mola" : "=livre")); }).join(" ");
  }
  /* condição de ligação na ponta (sistema local da barra do OrçaPRO convertido): translações rígidas; rotação liberada → 0 */
  function liberacao(lib) { return [RIGIDO, RIGIDO, RIGIDO, lib.rx ? 0 : RIGIDO, lib.ry ? 0 : RIGIDO, lib.rz ? 0 : RIGIDO]; }
  function temLiberacao(lib) { return !!(lib && (lib.rx || lib.ry || lib.rz)); }

  /* perfil geométrico IFC (m) — só quando a geometria está completa e respeita as regras do IFC; senão retângulo de mesma área */
  function perfilIfc(W, sec, nome, pos) {
    var mm = sec.mm, cat = sec.cat || {}, f = sec.forma, m = function (v) { return num(v, 0) / 1000; };
    if (mm && f === "I" && mm.bf > 0 && mm.d > 0 && mm.tw > 0 && mm.tf > 0 && mm.tf < mm.d / 2 && mm.tw < mm.bf) {
      var rOk = mm.r > 0 && mm.r <= (mm.bf - mm.tw) / 2 && mm.r <= (mm.d - 2 * mm.tf) / 2;
      return W.add("IFCISHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(mm.bf)) + "," + sReal(m(mm.d)) + "," + sReal(m(mm.tw)) + "," + sReal(m(mm.tf)) + "," + (rOk ? sReal(m(mm.r)) : "$") + ")");
    }
    if (mm && f === "U" && mm.d > 0 && mm.bf > 0 && mm.tw > 0 && mm.tf > 0 && mm.tf < mm.d / 2 && mm.tw < mm.bf)
      return W.add("IFCUSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(mm.d)) + "," + sReal(m(mm.bf)) + "," + sReal(m(mm.tw)) + "," + sReal(m(mm.tf)) + ",$,$,$,$)");
    if (f === "L" && cat.a > 0 && cat.t > 0 && cat.t < cat.a && (!(cat.b > 0) || cat.t < cat.b))
      return W.add("IFCLSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(cat.a)) + "," + (cat.b > 0 ? sReal(m(cat.b)) : "$") + "," + sReal(m(cat.t)) + ",$,$,$,$,$)");
    if (mm && f === "circ" && mm.d > 0) return W.add("IFCCIRCLEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(mm.d) / 2) + ")");
    if (mm && f === "tubo-circ" && mm.D > 0 && mm.t > 0 && mm.t < mm.D / 2)
      return W.add("IFCCIRCLEHOLLOWPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(mm.D) / 2) + "," + sReal(m(mm.t)) + ")");
    if (mm && f === "tubo-ret" && mm.b > 0 && mm.h > 0 && mm.t > 0 && mm.t < Math.min(mm.b, mm.h) / 2)
      return W.add("IFCRECTANGLEHOLLOWPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(mm.b)) + "," + sReal(m(mm.h)) + "," + sReal(m(mm.t)) + ",$,$)");
    if (f === "frio" && cat.bw > 0 && cat.bf > 0 && cat.t > 0) {
      var tf = cat.tipoFrio;
      if (tf === "Ue" && cat.D > 0 && cat.D < cat.bw / 2 && cat.t < cat.bf / 2 && cat.t < cat.bw / 2)
        return W.add("IFCCSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(cat.bw)) + "," + sReal(m(cat.bf)) + "," + sReal(m(cat.t)) + "," + sReal(m(cat.D)) + ",$,$)");
      if (tf === "U" && cat.t < cat.bw / 2 && cat.t < cat.bf)
        return W.add("IFCUSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(cat.bw)) + "," + sReal(m(cat.bf)) + "," + sReal(m(cat.t)) + "," + sReal(m(cat.t)) + ",$,$,$,$)");
      if (/^Z/.test(tf || "") && cat.t < cat.bw / 2)
        return W.add("IFCZSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(cat.bw)) + "," + sReal(m(cat.bf)) + "," + sReal(m(cat.t)) + "," + sReal(m(cat.t)) + ",$,$)");
      if (tf === "L" && cat.t < cat.bw && cat.t < cat.bf)
        return W.add("IFCLSHAPEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(m(cat.bw)) + "," + sReal(m(cat.bf)) + "," + sReal(m(cat.t)) + ",$,$,$,$,$)");
    }
    /* seção provisória ou sem geometria: quadrado de MESMA ÁREA (o nome diz "definir no CYPE") */
    var a = fin(sec.A) && sec.A > 0 ? Math.sqrt(sec.A) : 0.01;
    return W.add("IFCRECTANGLEPROFILEDEF(.AREA.," + sStr(nome) + "," + pos + "," + sReal(r6(a)) + "," + sReal(r6(a)) + ")");
  }

  function Escritor() { this.l = []; this.n = 0; }
  Escritor.prototype.add = function (t) { this.n++; this.l.push("#" + this.n + "=" + t + ";"); return "#" + this.n; };

  function ifc(r, opcoes) {
    var M = lerModelo(r), op = opcoes || {}, W = new Escritor(), dt = lerData(op.data);
    var obra = op.obra || ("Galpao " + br(M.L.vao, 2) + " x " + br(M.L.Lt, 2) + " m");
    var sal = "OrcaPRO|" + ascii(obra) + "|" + M.nos.length + "|" + M.barras.length + "|";
    var comRot = op.comRotulas !== false;
    var arquivo = op.arquivo || "galpao-orcapro.ifc";
    /* cabeçalho e contexto */
    var pe = W.add("IFCPERSON($,$," + sStr(op.autor || "OrcaPRO") + ",$,$,$,$,$)");
    var org = W.add("IFCORGANIZATION($," + sStr(op.organizacao || "RA Engenharia") + ",$,$,$)");
    var po = W.add("IFCPERSONANDORGANIZATION(" + pe + "," + org + ",$)");
    var app = W.add("IFCAPPLICATION(" + org + "," + sStr(VERSAO) + ",'OrcaPRO - exportacao CYPE 3D','OrcaPRO')");
    var oh = W.add("IFCOWNERHISTORY(" + po + "," + app + ",$,.ADDED.,$,$,$," + Math.floor(dt.getTime() / 1000) + ")");
    var uL = W.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), uF = W.add("IFCSIUNIT(*,.FORCEUNIT.,.KILO.,.NEWTON.)");
    var un = W.add("IFCUNITASSIGNMENT((" + uL + "," + uF + "))");
    var p0 = W.add("IFCCARTESIANPOINT((0.,0.,0.))"), ax0 = W.add("IFCAXIS2PLACEMENT3D(" + p0 + ",$,$)");
    var ctx = W.add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05," + ax0 + ",$)");
    var proj = W.add("IFCPROJECT('" + guid(sal + "projeto") + "'," + oh + "," + sStr(obra) + "," + sStr("Exportado do OrcaPRO para o CYPE 3D (modelo analitico)") + ",$,$,$,(" + ctx + ")," + un + ")");
    var modelo = W.add("IFCSTRUCTURALANALYSISMODEL('" + guid(sal + "modelo") + "'," + oh + ",'Modelo analitico'," +
      sStr("OrcaPRO - galpao " + br(M.L.vao, 2) + " x " + br(M.L.Lt, 2) + " m; eixos: X = comprimento, Y = vao, Z = vertical") + ",$,.LOADING_3D.,$,$,$)");
    if (op.comEdificio) {   /* estrutura espacial opcional (se o importador do CYPE exigir um IfcBuilding) */
      var site = W.add("IFCSITE('" + guid(sal + "site") + "'," + oh + ",'Terreno',$,$,$,$,$,.ELEMENT.,$,$,$,$,$)");
      var ed = W.add("IFCBUILDING('" + guid(sal + "edificio") + "'," + oh + "," + sStr(obra) + ",$,$,$,$,$,.ELEMENT.,$,$,$)");
      W.add("IFCRELAGGREGATES('" + guid(sal + "agr1") + "'," + oh + ",$,$," + proj + ",(" + site + "))");
      W.add("IFCRELAGGREGATES('" + guid(sal + "agr2") + "'," + oh + ",$,$," + site + ",(" + ed + "))");
      W.add("IFCRELSERVICESBUILDINGS('" + guid(sal + "serve") + "'," + oh + ",$,$," + modelo + ",(" + ed + "))");
    }
    /* vínculos das bases (um IfcBoundaryNodeCondition por padrão de restrição) */
    var condApoio = {};
    function condicaoApoio(a) {
      var v = vinculoCype(a), k = v.join("|");
      if (!condApoio[k]) condApoio[k] = W.add("IFCBOUNDARYNODECONDITION(" + sStr(nomeVinculo(v)) + "," + v.map(sReal).join(",") + ")");
      return condApoio[k];
    }
    /* nós */
    var refNo = {}, vert = {};
    M.nos.forEach(function (n) {
      var pt = W.add("IFCCARTESIANPOINT((" + n.c.map(sReal).join(",") + "))");
      var vp = W.add("IFCVERTEXPOINT(" + pt + ")"); vert[n.id] = vp;
      var tr = W.add("IFCTOPOLOGYREPRESENTATION(" + ctx + ",'Reference','Vertex',(" + vp + "))");
      var pd = W.add("IFCPRODUCTDEFINITIONSHAPE($,$,(" + tr + "))");
      var lp = W.add("IFCLOCALPLACEMENT($," + ax0 + ")");
      var a = M.apoioDoNo[n.id];
      refNo[n.id] = W.add("IFCSTRUCTURALPOINTCONNECTION('" + guid(sal + "no:" + n.id) + "'," + oh + "," + sStr(n.id) + "," + sStr("no " + n.num + (a ? " - apoio" : "")) + ",$," + lp + "," + pd + "," + (a ? condicaoApoio(a) : "$") + ")");
    });
    /* rótulas: condição por padrão + sistema de coordenadas da barra (x = eixo, z = z local do OrçaPRO) */
    var condLig = {}, sisLig = {}, dirs = {};
    function direcao(v) { var k = v.map(function (x) { return r6(x).toFixed(6); }).join(","); if (!dirs[k]) dirs[k] = W.add("IFCDIRECTION((" + v.map(function (x) { return sReal(r6(x)); }).join(",") + "))"); return dirs[k]; }
    function condicaoLig(lib) {
      var v = liberacao(lib), k = v.join("|");
      if (!condLig[k]) condLig[k] = W.add("IFCBOUNDARYNODECONDITION(" + sStr(v[3] === 0 ? "Rotula (giros livres)" : "Rotula (torcao presa)") + "," + v.map(sReal).join(",") + ")");
      return condLig[k];
    }
    function sistemaLig(o) {
      var e = eixosOrca(o), x = paraCype(e.x), z = paraCype(e.z), k = x.concat(z).map(function (v) { return r6(v).toFixed(6); }).join(",");
      if (!sisLig[k]) sisLig[k] = W.add("IFCAXIS2PLACEMENT3D(" + p0 + "," + direcao(z) + "," + direcao(x) + ")");
      return sisLig[k];
    }
    /* barras */
    var refBarra = {};
    M.barras.forEach(function (o) {
      var ed2 = W.add("IFCEDGE(" + vert[o.i.id] + "," + vert[o.j.id] + ")");
      var tr = W.add("IFCTOPOLOGYREPRESENTATION(" + ctx + ",'Reference','Edge',(" + ed2 + "))");
      var pd = W.add("IFCPRODUCTDEFINITIONSHAPE($,$,(" + tr + "))");
      var lp = W.add("IFCLOCALPLACEMENT($," + ax0 + ")");
      var tipo = ETQ[o.etiqueta].tirante ? ".TENSION_MEMBER." : (ETQ[o.etiqueta].escora ? ".PIN_JOINED_MEMBER." : ".RIGID_JOINED_MEMBER.");
      var desc = "barra " + o.num + " - " + o.etiqueta + (o.membro ? " " + o.membro.id : "") + " - " + o.sec.nome;
      refBarra[o.id] = W.add("IFCSTRUCTURALCURVEMEMBER('" + guid(sal + "barra:" + o.id) + "'," + oh + "," + sStr(o.id) + "," + sStr(desc) + "," + sStr(o.etiqueta) + "," + lp + "," + pd + "," + tipo + ")");
      var lib = o.b.libera || {};
      [["i", o.i], ["j", o.j]].forEach(function (p) {
        var L = comRot && temLiberacao(lib[p[0]]) ? lib[p[0]] : null;
        W.add("IFCRELCONNECTSSTRUCTURALMEMBER('" + guid(sal + "lig:" + o.id + ":" + p[0]) + "'," + oh + "," + (L ? sStr("rotula " + p[0]) : "$") + ",$," + refBarra[o.id] + "," + refNo[p[1].id] + "," +
              (L ? condicaoLig(L) : "$") + ",$,$," + (L ? sistemaLig(o) : "$") + ")");
      });
    });
    /* seções: um perfil por nome (provisórias: um por etiqueta) */
    var pos2 = W.add("IFCAXIS2PLACEMENT2D(" + W.add("IFCCARTESIANPOINT((0.,0.))") + ",$)");
    var perfis = {}, ordemP = [];
    M.barras.forEach(function (o) { var k = o.sec.chave; if (!perfis[k]) { perfis[k] = { sec: o.sec, barras: [] }; ordemP.push(k); } perfis[k].barras.push(refBarra[o.id]); });
    ordemP.forEach(function (k) {
      var P = perfis[k], nome = P.sec.cype.nome || P.sec.nome;
      var def = perfilIfc(W, P.sec, nome, pos2);
      var pp = W.add("IFCGENERALPROFILEPROPERTIES(" + sStr(nome) + "," + def + ",$,$,$,$,$)");
      W.add("IFCRELASSOCIATESPROFILEPROPERTIES('" + guid(sal + "perfil:" + k) + "'," + oh + "," + sStr(P.sec.nome) + ",$," + sLista(P.barras) + "," + pp + ",$,$)");
    });
    /* aço */
    var acos = {}, ordemA = [];
    M.barras.forEach(function (o) { var id = o.aco && o.aco.id ? String(o.aco.id) : "aco"; if (!acos[id]) { acos[id] = []; ordemA.push(id); } acos[id].push(refBarra[o.id]); });
    ordemA.forEach(function (id) {
      var mat = W.add("IFCMATERIAL(" + sStr(id) + ")");
      W.add("IFCRELASSOCIATESMATERIAL('" + guid(sal + "aco:" + id) + "'," + oh + ",$,$," + sLista(acos[id]) + "," + mat + ")");
    });
    /* tudo no modelo analítico */
    var todos = M.nos.map(function (n) { return refNo[n.id]; }).concat(M.barras.map(function (o) { return refBarra[o.id]; }));
    W.add("IFCRELASSIGNSTOGROUP('" + guid(sal + "grupo") + "'," + oh + ",$,$," + sLista(todos) + ",$," + modelo + ")");
    var cab = ["ISO-10303-21;", "HEADER;",
      "FILE_DESCRIPTION(('ViewDefinition [StructuralAnalysisView]'),'2;1');",
      "FILE_NAME(" + sStr(arquivo) + "," + sStr(isoUTC(dt)) + ",(" + sStr(op.autor || "OrcaPRO") + "),(" + sStr(op.organizacao || "RA Engenharia") + "),'OrcaPRO','OrcaPRO acocype.js " + VERSAO + "','');",
      "FILE_SCHEMA(('IFC2X3'));", "ENDSEC;", "DATA;"];
    return cab.concat(W.l).concat(["ENDSEC;", "END-ISO-10303-21;"]).join("\r\n") + "\r\n";
  }

  /* ================================================================ TXT */
  function f4(v) { var s = (Math.round(v * 1e4) / 1e4).toFixed(4); return s === "-0.0000" ? "0.0000" : s; }
  function textoGeometria(M, barras) {
    var usados = {}; barras.forEach(function (o) { usados[o.i.id] = true; usados[o.j.id] = true; });
    var l = ["NUDOS"];
    M.nos.forEach(function (n) { if (usados[n.id]) l.push(n.num + " X=" + f4(n.c[0]) + " Y=" + f4(n.c[1]) + " Z=" + f4(n.c[2])); });
    l.push("BARRAS");
    barras.forEach(function (o) { l.push(o.num + " " + o.i.num + " " + o.j.num); });
    return l.join("\r\n") + "\r\n";
  }
  function txt(r) { var M = lerModelo(r); return textoGeometria(M, M.barras); }
  function txtEtiquetas(r, opcoes) {
    var M = lerModelo(r), base = String((opcoes && opcoes.base) || "galpao").replace(/[^A-Za-z0-9_-]+/g, "_");
    return gruposEtiqueta(M).map(function (g) {
      return { etiqueta: g.id, descricao: ETQ[g.id].desc, arquivo: base + "_" + g.id + ".txt", barras: g.barras.length,
               nos: uniq(g.barras.reduce(function (a, o) { return a.concat([o.i.id, o.j.id]); }, [])).length, texto: textoGeometria(M, g.barras) };
    });
  }
  function gruposEtiqueta(M) {
    var g = {}; M.barras.forEach(function (o) { (g[o.etiqueta] = g[o.etiqueta] || []).push(o); });
    return ETIQUETAS.filter(function (e) { return g[e.id]; }).map(function (e) { return { id: e.id, barras: g[e.id] }; });
  }

  /* ============================================================ ROTEIRO */
  function trechos(L, lista) {
    var xs = [0, L].concat(arr(lista)).filter(function (x) { return fin(x) && x >= -1e-9 && x <= L + 1e-9; }).sort(function (a, b) { return a - b; }), o = [];
    for (var i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 1e-6) o.push([xs[i], xs[i + 1]]);
    return o;
  }
  function maxTrecho(L, lista) { return trechos(L, lista).reduce(function (m, t) { return Math.max(m, t[1] - t[0]); }, 0); }
  function listaX(a) { return a.length ? a.map(function (x) { return br(x, 2); }).join("; ") + " m" : "—"; }
  function tabela(cab, linhas, classeNum) {
    var h = "<div class=\"rola\"><table><thead><tr>" + cab.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>";
    linhas.forEach(function (l) { h += "<tr>" + l.map(function (c, i) { return "<td" + (classeNum && classeNum[i] ? " class=\"n\"" : "") + ">" + (c == null || c === "" ? "—" : c) + "</td>"; }).join("") + "</tr>"; });
    return h + "</tbody></table></div>";
  }
  function coord(c) { return "(" + br(c[0], 3) + "; " + br(c[1], 3) + "; " + br(c[2], 3) + ")"; }
  /* nós agrupados por linha (mesmo Y e Z) — "Y · Z → X …" */
  function descreverNos(nos) {
    var g = {}, ordem = [];
    nos.slice().sort(function (a, b) { return a.c[1] - b.c[1] || a.c[2] - b.c[2] || a.c[0] - b.c[0]; }).forEach(function (n) {
      var k = n.c[1].toFixed(3) + "|" + n.c[2].toFixed(3);
      if (!g[k]) { g[k] = { Y: n.c[1], Z: n.c[2], X: [], nums: [] }; ordem.push(k); }
      g[k].X.push(n.c[0]); g[k].nums.push(n.num);
    });
    return ordem.map(function (k) { var e = g[k]; return "Y " + br(e.Y, 3) + " · Z " + br(e.Z, 3) + " → X " + e.X.map(function (x) { return br(x, 3); }).join("; ") + " <span class=\"nota\">(nós " + e.nums.join(", ") + ")</span>"; }).join("<br>");
  }
  /* barras agrupadas por membro (membro inteiro = "P3L (barras 40–42)"; parte = "TP0_0: barra 240") */
  function faixaNums(nums) { return nums.length > 1 && nums[nums.length - 1] - nums[0] === nums.length - 1 ? nums[0] + "–" + nums[nums.length - 1] : nums.join(", "); }
  function descreverBarras(M, lista) {
    var porM = {}, ordem = [], soltas = [];
    lista.forEach(function (o) { if (o.membro) { if (!porM[o.membro.id]) { porM[o.membro.id] = []; ordem.push(o.membro.id); } porM[o.membro.id].push(o); } else soltas.push(o); });
    var partes = ordem.map(function (id) {
      var bs = porM[id], m = bs[0].membro, todas = arr(m.segs).length === bs.length;
      var nums = bs.map(function (o) { return o.num; }).sort(function (a, b) { return a - b; });
      if (!todas) return id + ": barra" + (nums.length > 1 ? "s " : " ") + faixaNums(nums);
      return id + " <span class=\"nota\">(barras " + faixaNums(nums) + ")</span>";
    });
    if (soltas.length) partes.push(soltas.map(function (o) { return o.id + " <span class=\"nota\">(" + o.num + ")</span>"; }).join(", "));
    return partes.join("; ");
  }
  function nomeHipotese(casos) {
    var o = {}, nW = 0, nG = 0, nQ = 0;
    casos.forEach(function (c) {
      if (c.tipo === "G") { nG++; o[c.id] = nG > 1 ? "CP" + nG : "CP"; }
      else if (c.tipo === "Q") { nQ++; o[c.id] = nQ > 1 ? "SC" + nQ : "SC"; }
      else if (c.tipo === "W") { nW++; o[c.id] = "V" + nW; }
      else o[c.id] = String(c.id);
    });
    return o;
  }
  /* caso que leva o peso próprio dos perfis (no CYPE ele é a hipótese automática "PP") */
  function temPesoProprio(c) { return arr(c && c.cargas).some(function (x) { return x && x.tipo === "pesoProprio"; }); }
  function nomeComPP(c, nomeH) { var n = nomeH[c.id] || String(c.id); return temPesoProprio(c) ? "PP + " + n : n; }
  function textoFatores(fat, nomeH, casos) {
    var porId = {}; casos.forEach(function (c) { porId[c.id] = c; });
    return Object.keys(fat || {}).map(function (k) { var f = fat[k], c = porId[k], n = c ? nomeComPP(c, nomeH) : (nomeH[k] || k); if (/\+/.test(n)) n = "(" + n + ")"; return (f === 1 ? "" : br(f, 2) + "·") + n; }).join(" + ") || "—";
  }
  /* γ (desfavorável/favorável) e ψ de cada caso: as tabelas do js/acocargas.js; sem ele, o γ sai das combinações */
  function Car() { return dep("AcoCargas", "./acocargas.js"); }
  function coeficientes(c, combs) {
    var A = Car(), GF = (A && A.GAMA_F) || {}, PS = (A && A.PSI) || {}, o = { categoria: c.categoria || null, nomeCat: null, desf: null, fav: null, psi: null };
    if (c.tipo === "G") { var g = GF[c.categoria || "G-metalica"]; if (g) { o.desf = g.desf; o.fav = g.fav; o.nomeCat = g.nome; } }
    else { var g2 = c.tipo === "W" ? GF.W : (GF[c.categoria] || GF.Q); if (g2) { o.desf = g2.desf; o.nomeCat = g2.nome || null; } var p = PS[c.tipo === "W" ? "W" : (c.categoria || "Q-cobertura")]; if (p) { o.psi = p; if (!o.nomeCat) o.nomeCat = p.nome; } }
    if (o.desf == null) {   /* das combinações últimas */
      var fs = arr(combs).filter(function (x) { return x.tipo === "ELU" && x.fatores && fin(x.fatores[c.id]); }).map(function (x) { return x.fatores[c.id]; });
      if (fs.length) { o.desf = Math.max.apply(null, fs); if (c.tipo === "G") o.fav = Math.min.apply(null, fs); }
    }
    return o;
  }
  function cargaBarraCype(o, c) {
    var qa = arr(c.q).map(function (v) { return num(v, 0); }), qb = c.q2 ? arr(c.q2).map(function (v) { return num(v, 0); }) : qa.slice();
    while (qa.length < 3) qa.push(0); while (qb.length < 3) qb.push(0);
    if (c.sistema === "local") {
      var e = eixosOrca(o), g = function (v) { return [e.x[0] * v[0] + e.y[0] * v[1] + e.z[0] * v[2], e.x[1] * v[0] + e.y[1] * v[1] + e.z[1] * v[2], e.x[2] * v[0] + e.y[2] * v[1] + e.z[2] * v[2]]; };
      qa = g(qa); qb = g(qb);
    } else if (c.projetada) {
      var d = unit(sub(o.j.o, o.i.o)), fh = Math.sqrt(d[0] * d[0] + d[2] * d[2]); qa = mul(qa, fh); qb = mul(qb, fh);
    }
    return { qa: paraCype(qa), qb: paraCype(qb), a: Math.max(0, Math.min(1, num(c.a, 0))), b: Math.max(0, Math.min(1, num(c.b, 1))) };
  }
  function vet3(v) { return v.map(function (x) { return br(x, 3); }).join("; "); }
  /* cargas de um caso, agrupadas por valor (o engenheiro seleciona o grupo e lança uma vez) */
  function cargasDoCaso(M, caso) {
    var porNo = {}, ordemN = [], gb = {}, ordemB = [], pp = null;
    arr(caso.cargas).forEach(function (c) {
      if (!c || typeof c !== "object") return;
      if (c.tipo === "no") {
        var n = M.porId[String(c.no)]; if (!n) return;
        var F = arr(c.F).map(function (v) { return num(v, 0); }); while (F.length < 6) F.push(0);
        var Fc = paraCype(F.slice(0, 3)).concat(paraCype(F.slice(3, 6)));
        if (!porNo[n.id]) { porNo[n.id] = { no: n, F: [0, 0, 0, 0, 0, 0] }; ordemN.push(n.id); }
        for (var k = 0; k < 6; k++) porNo[n.id].F[k] += Fc[k];
      } else if (c.tipo === "barra") {
        var o = M.barraPorId[String(c.barra)]; if (!o) return;
        var q = cargaBarraCype(o, c), uni = q.qa.every(function (v, i) { return Math.abs(v - q.qb[i]) < 1e-9; });
        var key = q.qa.concat(uni ? [] : q.qb).map(function (v) { return v.toFixed(4); }).join("|") + "|" + q.a.toFixed(4) + "|" + q.b.toFixed(4);
        if (!gb[key]) { gb[key] = { q: q, uniforme: uni, barras: [] }; ordemB.push(key); }
        gb[key].barras.push(o);
      } else if (c.tipo === "pesoProprio") {
        pp = { fator: num(c.fator, 1), barras: c.barras ? arr(c.barras).map(function (id) { return M.barraPorId[String(id)]; }).filter(Boolean) : M.barras.slice() };
      }
    });
    var gn = {}, ordemG = [];
    ordemN.forEach(function (id) {
      var e = porNo[id]; if (e.F.every(function (v) { return Math.abs(v) < 5e-4; })) return;
      var key = e.F.map(function (v) { return v.toFixed(3); }).join("|");
      if (!gn[key]) { gn[key] = { F: e.F, nos: [] }; ordemG.push(key); }
      gn[key].nos.push(e.no);
    });
    return { nos: ordemG.map(function (k) { return gn[k]; }), barras: ordemB.map(function (k) { return gb[k]; }), pp: pp,
             totalNos: ordemN.length, totalBarras: ordemB.reduce(function (s, k) { return s + gb[k].barras.length; }, 0) };
  }
  function resumoVentoCaso(V, caso, L) {
    var vc = V && arr(V.casos).filter(function (x) { return x && x.id === caso.id; })[0];
    if (!vc) return "";
    var h = "<p>q = " + br(vc.q, 4) + " kN/m²" + (fin(vc.cpi) ? " · Cpi = " + br(vc.cpi, 2) : "") + (vc.classe ? " · classe " + esc(vc.classe) : "") +
            (arr(vc.cpiMotivo).length ? "<br><span class=\"nota\">" + esc(vc.cpiMotivo.join(" | ")) + "</span>" : "") + "</p>";
    var faces = { frente: "frente (X = 0)", fundo: "fundo (X = " + br(L.Lt, 2) + ")", esquerda: "esquerda (Y = 0)", direita: "direita (Y = " + br(L.vao, 2) + ")" };
    var lin = [];
    Object.keys((vc.pressao && vc.pressao.paredes) || {}).forEach(function (f) {
      arr(vc.pressao.paredes[f]).forEach(function (z) {
        var eixo = f === "frente" || f === "fundo" ? "Y" : "X";
        lin.push(["parede " + esc(faces[f] || f), esc(z.zona), eixo + " " + br(z.s0, 2) + " a " + br(z.s1, 2), br(z.cpe, 2), br(z.coef, 2), br(z.p, 3)]);
      });
    });
    arr(vc.pressao && vc.pressao.cobertura).forEach(function (z) {
      lin.push(["cobertura" + (z.agua ? " (" + esc(z.agua) + ")" : ""), esc(z.zona), "X " + br(z.z0, 2) + " a " + br(z.z1, 2) + " · Y " + br(z.x0, 2) + " a " + br(z.x1, 2), br(z.cpe, 2), br(z.coef, 2), br(z.p, 3)]);
    });
    if (lin.length) h += "<p class=\"nota\">Pressões por zona (NBR 6123; p = q·(Cpe − Cpi), positivo empurra a face para dentro / a cobertura para baixo):</p>" +
      tabela(["Face", "Zona", "Trecho (m, eixos do CYPE)", "Cpe", "Cpe − Cpi", "p (kN/m²)"], lin, [0, 0, 0, 1, 1, 1]);
    return h;
  }

  /* ===================================================== COMO USAR (guia)
   * O mesmo passo a passo abre o roteiro (seção 1) e vai, enxuto, para o
   * painel "Como usar no CYPE 3D" da tela (AcoCype.comoUsarHTML). Caminhos de
   * menu: os do manual do CYPE 3D em português (Arquivo, Obra, Nó, Barra,
   * Carga, Cálculo, Janela — "Flambagem" = "Encurvadura" na versão de
   * Portugal). O que ainda não foi testado DENTRO do CYPE com o arquivo do
   * OrçaPRO leva "a conferir no CYPE" — o guia não promete o que não foi
   * visto funcionando. */
  var ACF = "<span class=\"acf\">A conferir no CYPE</span>", ACFm = "<span class=\"acf\">a conferir no CYPE</span>";
  function totaisDoCaso(M, c) {
    var g = cargasDoCaso(M, c), n = [0, 0, 0], b = [0, 0, 0];
    g.nos.forEach(function (x) { for (var k = 0; k < 3; k++) n[k] += x.F[k] * x.nos.length; });
    g.barras.forEach(function (x) { x.barras.forEach(function (o) { for (var k = 0; k < 3; k++) b[k] += (x.q.qa[k] + x.q.qb[k]) / 2 * (x.q.b - x.q.a) * o.L; }); });
    return { nos: n, barras: b, temNos: g.nos.length > 0, temBarras: g.barras.length > 0, pp: g.pp };
  }
  function contextoGuia(M, R, op) {
    op = op || {}; R = R || {};
    var c = { M: M, R: R, arqIfc: op.arquivoIfc || "galpao-orcapro.ifc", baseTxt: op.base || "galpao" };
    if (!M) return c;
    var L = M.L;
    c.nNos = M.nos.length; c.nBarras = M.barras.length; c.nApoios = M.apoios.length; c.nPorticos = arr(L.zs).length;
    c.zMax = M.nos.reduce(function (m, n) { return Math.max(m, n.c[2]); }, -Infinity);
    c.grupos = gruposEtiqueta(M);
    c.casos = arr(R.casos).length ? R.casos : arr(M.mod.casos); c.combs = arr(R.combinacoes); c.nomeH = nomeHipotese(c.casos);
    var pv = {}, ordV = [];
    M.apoios.forEach(function (ap) { var v = vinculoCype(ap.a), k = v.join("|"); if (!pv[k]) { pv[k] = { v: v, n: 0 }; ordV.push(k); } pv[k].n++; });
    c.vinculos = ordV.map(function (k) {
      var v = pv[k].v, fixos = [], livres = [];
      GL_NOME.forEach(function (nm, i) { if (v[i] === RIGIDO) fixos.push(nm); else if (!(v[i] > 0)) livres.push(nm); });
      return { nome: nomeVinculo(v), n: pv[k].n, texto: (fixos.length ? fixos.join(", ") + " fixos" : "") + (livres.length ? (fixos.length ? "; " : "") + livres.join(" e ") + " livres" : "") };
    });
    var girar = M.barras.filter(function (o) { return o.giro === 90; });
    c.giro = { n: girar.length, etqs: uniq(girar.map(function (o) { return o.etiqueta; })) };
    var tir = M.barras.filter(function (o) { return ETQ[o.etiqueta].tirante; });
    c.tirante = tir.length ? { n: tir.length, etqs: uniq(tir.map(function (o) { return o.etiqueta; })), secao: tir[0].sec.nome } : null;
    c.articuladas = c.grupos.filter(function (g) { return g.barras.every(function (o) { var l = o.b.libera || {}; return temLiberacao(l.i) && temLiberacao(l.j); }); }).map(function (g) { return g.id; });
    c.pontaSolta = c.grupos.filter(function (g) { return c.articuladas.indexOf(g.id) < 0 && g.barras.some(function (o) { var l = o.b.libera || {}; return temLiberacao(l.i) || temLiberacao(l.j); }); }).map(function (g) { return g.id; });
    c.secoes = [];
    c.grupos.forEach(function (g) {
      var vist = {};
      g.barras.forEach(function (o) { if (vist[o.sec.chave]) return; vist[o.sec.chave] = 1; c.secoes.push({ etq: g.id, n: g.barras.filter(function (x) { return x.sec.chave === o.sec.chave; }).length, sec: o.sec, aco: o.aco }); });
    });
    var acos = {}, ordA = [];
    M.barras.forEach(function (o) { var id = o.aco && o.aco.id ? String(o.aco.id) : null; if (!id) return; if (!acos[id]) { acos[id] = { a: o.aco, etqs: [] }; ordA.push(id); } if (acos[id].etqs.indexOf(o.etiqueta) < 0) acos[id].etqs.push(o.etiqueta); });
    c.acos = ordA.map(function (id) { return { id: id, fy: acos[id].a.fy, etqs: acos[id].etqs }; });
    c.hip = c.casos.map(function (cs) { return { rot: c.nomeH[cs.id], id: cs.id, nome: cs.nome || cs.id, tipo: cs.tipo, co: coeficientes(cs, c.combs), tot: totaisDoCaso(M, cs) }; });
    var exM = function (papel) { return arr(M.G.membros).filter(function (m) { return m.papel === papel; })[0] || null; };
    c.exPilar = exM("pilar"); c.exViga = exM("viga");
    return c;
  }
  function textoCoef(co) { return co && fin(co.desf) ? "γ " + br(co.desf, 2) + (co.psi ? ", ψ0 " + br(co.psi.psi0, 1) : "") : "γ —"; }
  function guiaHTML(c, modo) {
    var rot = modo === "roteiro", M = c.M, R = c.R || {};
    function ref(n, ancora) { return rot ? "<a href=\"#" + ancora + "\">seção " + n + "</a>" : "seção " + n + " do roteiro"; }
    function passo(titulo, onde, faca, confira, extra) {
      return "<li><p class=\"tit\"><b>" + titulo + "</b></p><p class=\"onde\"><b>Onde:</b> " + onde + "</p><p><b>Faça:</b> " + faca + "</p>" + (extra || "") + "<p class=\"conf\"><b>Confira:</b> " + confira + "</p></li>";
    }
    function tab(cab, linhas, nums) { return tabela(cab, linhas, nums); }
    var quant = M ? c.nNos + " nós, " + c.nBarras + " barras e " + c.nApoios + " apoios" : "o número de nós, barras e apoios do roteiro";
    var P = [];
    /* 1 */ P.push(passo("Prepare os arquivos e o CYPE",
      "OrçaPRO → exportar para o CYPE 3D; no CYPE, Arquivo → Salvar como (cópia de segurança).",
      "baixe o IFC (<code>" + esc(c.arqIfc) + "</code>), os arquivos de texto por etiqueta (<code>" + esc(c.baseTxt) + "_PILAR.txt</code>, …) e o roteiro. No CYPE, salve a obra que estiver aberta: abrir ou criar outra obra grava a atual sem perguntar.",
      "o modelo exportado tem " + quant + "."));
    /* 2 */ P.push(passo("Abra o CYPE 3D e crie a obra pelo IFC",
      "menu geral dos programas CYPE → CYPE 3D; Arquivo → Novo → nome da obra → Aceitar → entrada automática por IFC (modelo analítico).",
      "indique o arquivo <code>" + esc(c.arqIfc) + "</code> e siga o assistente. As seções chegam como \"Não definido\": escolha já pela tabela do passo 5 ou deixe para o passo 5.",
      "em Janela → 3D aparecem " + (M ? "os " + c.nPorticos + " pórticos" : "os pórticos") + ". " + ACF + ": a importação deste IFC ainda não foi testada dentro do CYPE. " +
      "<b>Plano B</b> (se o IFC não entrar): obra vazia → Geometria → Importar → arquivo de texto, um arquivo por etiqueta, cada um na etiqueta de mesmo nome (os nós repetidos se unem); aí os vínculos e as rótulas vão à mão no passo 4."));
    /* 3 */ P.push(passo("Normas, aço e unidades",
      "Obra → Dados gerais (normas por material e aço dos perfis).",
      "aço laminado e soldado: ABNT NBR 8800; formados a frio: ABNT NBR 14762; ações e combinações: ABNT NBR 8681; vento: ABNT NBR 6123. Aço: " +
      (M && c.acos.length ? c.acos.map(function (a) { return esc(a.id) + (fin(a.fy) ? " (fy " + br(a.fy, 0) + " MPa)" : "") + " em " + esc(a.etqs.join(", ")); }).join("; ") : "o da tabela da " + ref(3, "dados")) +
      ". Unidades: m e kN (o IFC e o texto estão em metros; as forças do roteiro, em kN).",
      "se o CYPE estiver em outra unidade (t, kgf), ajuste antes de lançar cargas — ou as coordenadas e cargas saem fora de escala."));
    /* 4 */ P.push(passo("Confira geometria, apoios e rótulas",
      "Janela → 3D; Nó → Vinculação exterior; Barra → Articular extremos; Barra → Coeficientes de engastamento; contagem: Arquivo → Imprimir → Listagens da obra.",
      "compare 2 ou 3 nós com o apêndice A do roteiro. Bases: " + (M && c.vinculos.length ? c.vinculos.map(function (v) { return v.n + " nós com " + esc(v.texto) + " (" + esc(v.nome) + ")"; }).join("; ") : "conforme a " + ref(5, "vinculos")) + ". " +
      (M && c.articuladas.length ? "Articuladas nas duas pontas: " + esc(c.articuladas.join(", ")) + ". " : "") + (M && c.pontaSolta.length ? "Só o topo articulado: " + esc(c.pontaSolta.join(", ")) + " (coeficiente de engastamento 0 nos planos xy e xz)." : ""),
      (M ? c.nNos + " nós e " + c.nBarras + " barras; cumeeira em Z = " + br(c.zMax, 2) + " m. " : "contagens iguais às do roteiro. ") + ACF + ": se os vínculos e as rótulas do IFC foram aplicados — se não, lance pela " + ref(5, "vinculos") + "."));
    /* 5 */ var linSec = M ? c.secoes.map(function (s) { return ["<b>" + s.etq + "</b>", String(s.n), esc(s.sec.nome), "<code>" + esc(s.sec.cype.nome) + "</code>", esc(s.sec.cype.catalogo || "—"), esc(s.sec.cype.certeza)]; }) : [];
    P.push(passo("Atribua as seções por etiqueta",
      "assistente da importação, ou Barra → Descrever (selecione as barras e termine com o botão direito do mouse).",
      "Perfil de aço laminado → Duplo T (soldados: perfil soldado) → série → perfil, pela tabela. Se a série não aparecer: Editar a lista de elementos → Importação de séries de perfis pré-definidas → fabricante (Açominas para W/HP, USIMINAS para CS/CVS/VS) → marque a série. Depois, Barra → Agrupar as barras de cada etiqueta do pórtico (pilares, vigas, tapamento): o CYPE trata o grupo com um perfil só, como o OrçaPRO.",
      "o nome escolhido = coluna \"Nome no CYPE\"; certeza baixa ou nenhuma: procure pelas dimensões (" + ref(4, "secoes") + "). As seções \"(definir no CYPE)\" são terças, travessas e beiral: use o perfil real adotado.",
      linSec.length ? tab(["Etiqueta", "Barras", "Perfil no OrçaPRO", "Nome no CYPE", "Catálogo", "Certeza"], linSec, [0, 1, 0, 0, 0, 0]) : ""));
    /* 6 */ P.push(passo("Gire as colunas de tapamento",
      "Barra → Descrever disposição → Rotação de 90 graus.",
      M ? (c.giro.n ? "selecione as " + c.giro.n + " barras da(s) etiqueta(s) " + esc(c.giro.etqs.join(", ")) + " e aplique a rotação de 90 graus." : "nenhuma barra deste modelo precisa de giro.") : "selecione as barras da etiqueta TAPAMENTO e aplique a rotação de 90 graus.",
      "a alma do tapamento perpendicular ao oitão e a dos pilares no plano do pórtico. " + ACF + ": se os pilares chegarem com a alma fora do plano do pórtico, gire os pilares e não o tapamento (" + ref(2, "eixos") + ")."));
    /* 7 */ if (!M || c.tirante) P.push(passo("Contraventamento como tirante",
      "Barra → Descrever → Tirante → barra redonda maciça.",
      (M ? "nas etiquetas " + esc(c.tirante.etqs.join(", ")) + " (" + c.tirante.n + " barras), " + esc(c.tirante.secao) : "nas etiquetas de contraventamento, o diâmetro do roteiro") +
      ". Se a série de barras redondas não estiver na obra: Editar a lista de elementos → Importação de séries de perfis pré-definidas → Gerdau → Barra redonda.",
      "o CYPE articula as pontas do tirante sozinho; cada X fica emoldurado e sem nó no cruzamento (" + ref(5, "vinculos") + ")."));
    /* 8 */ var exF = [];
    if (M && c.exPilar && c.exPilar.flambagem) exF.push("pilares: Lk " + br(c.exPilar.flambagem.Lx, 2) + " m (xz) e " + br(c.exPilar.flambagem.Ly, 2) + " m (xy); Lb da mesa de fora " + br(maxTrecho(c.exPilar.L, (c.exPilar.travamentos || {}).menos), 2) + " m");
    if (M && c.exViga && c.exViga.flambagem) exF.push("vigas: Lk " + br(c.exViga.flambagem.Lx, 2) + " m (xz) e " + br(c.exViga.flambagem.Ly, 2) + " m (xy); Lb da mesa de cima " + br(maxTrecho(c.exViga.L, (c.exViga.travamentos || {}).mais), 2) + " m");
    P.push(passo("Flambagem e flambagem lateral",
      "Barra → Flambagem e Barra → Flambagem lateral (\"Encurvadura\" na versão de Portugal).",
      "informe o comprimento de flambagem Lk nos planos xz e xy de cada membro e, em cada aba, a \"Separação entre travamentos\" = Lb — valores por membro na " + ref(6, "flambagem") + (exF.length ? " (ex.: " + exF.join("; ") + ")" : "") + ".",
      "no cálculo não pode aparecer o aviso de barras com valores \"por defeito\"."));
    /* 9 */ var linHip = M ? c.hip.map(function (h) { return ["<b>" + esc(h.rot) + "</b>", esc(h.id), esc(h.nome), esc(h.co.nomeCat || "—"), esc(textoCoef(h.co))]; }) : [];
    P.push(passo("Crie as hipóteses",
      "Obra → Dados gerais → Ações adicionais → Nova ação adicional (referência e descrição).",
      M ? "crie " + c.hip.map(function (h) { return esc(h.rot); }).join(", ") + " com a categoria de mesmos γ e ψ da tabela (o Peso próprio já existe)." : "uma hipótese permanente por caso do OrçaPRO (CP, CP2), a sobrecarga (SC) e uma de vento por caso (V1, V2, …), cada uma na categoria de mesmos γ e ψ do roteiro.",
      "γ e ψ = tabela da " + ref(7, "cargas") + ".",
      linHip.length ? tab(["CYPE", "OrçaPRO", "Nome", "Categoria (NBR 8681)", "Coeficientes"], linHip, [0, 0, 0, 0, 0]) : ""));
    /* 10 */ var linTot = M ? c.hip.map(function (h) {
      var t = h.tot; return ["<b>" + esc(h.rot) + "</b>", t.temNos ? br(t.nos[0], 2) + "; " + br(t.nos[1], 2) + "; " + br(t.nos[2], 2) : "—", t.temBarras ? br(t.barras[0], 2) + "; " + br(t.barras[1], 2) + "; " + br(t.barras[2], 2) : "—", t.pp ? "+ peso próprio" + (t.pp.fator > 1 + 1e-9 ? " e " + br((t.pp.fator - 1) * 100, 0) + " % de ligações" : "") : ""];
    }) : [];
    P.push(passo("Lance as cargas",
      "Carga → Introduzir cargas sobre nós e cargas sobre barras (na 2026.a: Carga → Nós; Carga → Barras → Nova); para ver: Carga → Hipótese vista.",
      "para cada hipótese, lance os grupos da " + ref(7, "cargas") + ": selecione os nós ou barras do grupo, termine com o botão direito, escolha a hipótese, o valor e a direção (eixos gerais; FZ negativo = para baixo). O vento também pode vir do Gerador de pórticos (passo 11).",
      "a soma das forças de cada hipótese bate com a tabela (kN). Se terças e travessas tiverem perfil no CYPE, desconte o peso delas, que já está nas cargas do OrçaPRO.",
      linTot.length ? tab(["Hipótese", "Σ nós FX; FY; FZ", "Σ barras qX·L; qY·L; qZ·L", "Além disso"], linTot, [0, 1, 1, 0]) : ""));
    /* 11 */ var V = R.vento && fin(R.vento.v0) ? R.vento : null;
    P.push(passo("Vento pelo Gerador de pórticos (alternativa para conferir)",
      "menu geral dos programas CYPE → Gerador de pórticos → Dados gerais da obra → Com sobrecarga de vento.",
      (V ? "V0 = " + br(V.v0, 1) + " m/s; S1 = " + br(V.s1 && V.s1.valor, 2) + "; S2: categoria " + esc((V.s2 && V.s2.categoria) || "—") + ", classe " + esc((V.s2 && V.s2.classe) || "—") + "; S3 = " + br(V.s3, 2) : "V0, S1, categoria e classe de S2 e S3 do local") +
      " e a geometria da " + ref(9, "vento") + "; exporte para o CYPE 3D numa obra NOVA.",
      "as pressões e as cargas de vento do Gerador × as do OrçaPRO (" + ref(7, "cargas") + ")." + (V || !M ? "" : " Este cálculo não trouxe V0, S1, S2 e S3: informe os do local.")));
    /* 12 */ var gamas = M ? c.hip.filter(function (h) { return h.tipo === "G"; }).map(function (h) { return esc(h.rot) + " " + br(h.co.desf, 2); }).join("; ") : "";
    P.push(passo("Combinações",
      "Obra → Dados gerais → Ações adicionais → Mostrar combinações.",
      "deixe o CYPE gerar as combinações pela NBR 8681/8800 com as categorias do passo 9.",
      (gamas ? "γ das permanentes (" + gamas + ") e " : "γ das permanentes e ") + "ψ0 (sobrecarga 0,8; vento 0,6) iguais aos do OrçaPRO — lista na " + ref(8, "combinacoes") + "."));
    /* 13 */ P.push(passo("Calcule",
      "Cálculo → Calcular.",
      "escolha \"Não dimensionar perfis\", com \"Verificar as barras\" ativo — assim o CYPE verifica os perfis do OrçaPRO sem trocá-los.",
      "relatório final sem erro. O aviso de barras com valores \"por defeito\" indica flambagem faltando (passo 8)."));
    /* 14 */ var linCmp = [];
    if (M && R.ok) {
      Object.keys(R.grupos || {}).forEach(function (gk) {
        var g = R.grupos[gk] || {}, cy = nomeCype(g.perfil || "");
        linCmp.push(["Perfil e aproveitamento — " + esc(gk), esc(cy.certeza === "alta" || cy.certeza === "media" ? cy.nome : (g.perfil || "—")) + " · " + brp(g.razao) + (g.membro ? " (" + esc(g.membro) + ")" : "") + (g.governaELS ? " — governa o deslocamento" : ""), "&nbsp;"]);
      });
      var srv = arr(R.servico), pior = function (t) { return srv.filter(function (s) { return s.tipo === t; }).sort(function (a, b) { return b.razao - a.razao; })[0]; };
      var sp = pior("pilarTopo"), sv = pior("viga");
      if (sp) linCmp.push(["Deslocamento do topo dos pilares (ELS)", br(sp.valor * 1000, 1) + " mm (limite " + br(sp.limite * 1000, 1) + " mm, " + esc(sp.membro) + ")", "&nbsp;"]);
      if (sv) linCmp.push(["Flecha das vigas (ELS)", br(sv.valor * 1000, 1) + " mm (limite " + br(sv.limite * 1000, 1) + " mm, " + esc(sv.membro) + ")", "&nbsp;"]);
      var reac = R.reacoes || {}, bMax = null, fMax = -Infinity;
      M.apoios.forEach(function (ap) { var e = reac[ap.no.id]; if (e && e.envELU && e.envELU.Fy && fin(e.envELU.Fy[1]) && e.envELU.Fy[1] > fMax) { fMax = e.envELU.Fy[1]; bMax = ap.no; } });
      if (bMax) {
        var pc = reac[bMax.id].porCaso || {};
        linCmp.push(["Reação vertical da base " + bMax.num + " (" + esc(bMax.id) + "), característica", c.casos.filter(function (cs) { return pc[cs.id]; }).map(function (cs) { return esc(nomeComPP(cs, c.nomeH)) + " " + br(num(pc[cs.id][1], NaN), 1) + " kN"; }).join("; ") + " · máx. ELU " + br(fMax, 1) + " kN", "&nbsp;"]);
      }
      if (fin(R.peso)) linCmp.push(["Peso de aço (sem terças e travessas)", br(R.peso, 0) + " kg (" + br(R.taxa, 2) + " kg/m²)", "&nbsp;"]);
    }
    P.push(passo("Compare com o OrçaPRO",
      "Cálculo → Verificar elementos (cursor sobre a barra: aproveitamento de resistência e de flecha); Cálculo → deslocamentos, esforços e envoltórias; reações: Arquivo → Imprimir → Listagens da obra.",
      "preencha a coluna do CYPE" + (linCmp.length ? " na tabela." : " com os valores da " + ref(10, "resultado") + "."),
      "diferença pequena é esperada (2ª ordem, imperfeições, Lb único por aba, peso de terças e travessas — " + ref(10, "resultado") + "). Perfil aprovado num programa e reprovado no outro, ou diferença grande, indica dado lançado diferente: reveja os passos 4 a 12.",
      linCmp.length ? tab(["O que conferir", "OrçaPRO", "CYPE"], linCmp, [0, 0, 0]) : ""));
    var manual = "<h3>O que vai no arquivo e o que é manual (e por quê)</h3>" + tab(["O quê", "Como chega ao CYPE", "Por quê"], [
      ["Nós e barras", "automático (IFC ou texto)", "—"],
      ["Vínculos das bases e rótulas", "no IFC (" + ACFm + " se o CYPE os lê); no texto não vão", "o arquivo de texto do CYPE só aceita nós, barras e lâminas"],
      ["Seção (perfil)", "só o NOME, no IFC; o engenheiro escolhe no catálogo (passo 5)", "o CYPE não importa a seção pelo IFC: ela chega \"Não definido\""],
      ["Aço", "vai no IFC, mas é escolhido no CYPE (passo 3)", "o CYPE não lê o material do arquivo"],
      ["Giro, tirante, flambagem e flambagem lateral", "à mão (passos 6 a 8)", "o CYPE 3D 2026.a não aceita esses dados por arquivo"],
      ["Hipóteses, cargas e combinações", "à mão (passos 9 a 12) ou vento pelo Gerador de pórticos", "o CYPE 3D 2026.a não importa cargas nem hipóteses (nem por IFC, nem por texto)"]
    ]);
    var problemas = [
      ["O IFC não abre ou chega vazio", "use o plano B do passo 2 (texto por etiqueta) e lance vínculos e rótulas pela " + ref(5, "vinculos") + "."],
      ["A seção não aparece no catálogo", "importe a série (Editar a lista de elementos → Importação de séries de perfis pré-definidas); se o fabricante não tiver o perfil, procure pelas dimensões ou crie uma seção genérica com A, Ix, Iy e J da " + ref(4, "secoes") + "."],
      ["Apoio invertido ou errado (engaste no lugar de rótula, nó solto)", "Nó → Vinculação exterior com os graus do passo 4."],
      ["Alma girada (pilar ou tapamento trabalhando no eixo fraco)", "Barra → Descrever disposição → Rotação de 90 graus (passo 6)."],
      ["O cálculo acusa mecanismo ou estrutura instável", "faltou vínculo ou articulação: confira apoios, terças e travessas articuladas e diagonais como tirante."],
      ["O CYPE recusa o tirante", "o X precisa estar emoldurado (4 lados, ou 3 com dois apoios), em painel retangular, com diagonais iguais e sem nó no cruzamento."],
      ["Aviso de barras com valores \"por defeito\"", "flambagem ou flambagem lateral faltando em alguma barra (passo 8)."],
      ["Permanente maior que a do OrçaPRO", "peso de terças e travessas contado duas vezes (perfil no CYPE + carga do OrçaPRO)."],
      ["A obra aberta mudou ao abrir outra", "o CYPE grava a obra aberta ao abrir outra: trabalhe numa cópia (Arquivo → Salvar como)."],
      ["Coordenadas ou cargas fora de escala", "unidades: m e kN (passo 3)."]
    ];
    var probHTML = "<h3>Problemas comuns</h3><ul class=\"probs\">" + problemas.map(function (p) { return "<li><b>" + p[0] + ":</b> " + p[1] + "</li>"; }).join("") + "</ul>";
    var intro = "<p>Do zero até comparar o resultado. Cada passo diz <b>onde</b> fica o comando no CYPE 3D (caminhos do manual do CYPE em português; na 2026.a os mesmos comandos ficam nas abas da faixa de opções), <b>o que fazer</b> e <b>o que conferir</b>. Marcado \"" + ACFm + "\": ainda não foi visto funcionando dentro do CYPE com o arquivo do OrçaPRO.</p>";
    return intro + "<ol class=\"guia\">" + P.join("") + "</ol>" + manual + probHTML;
  }
  /* o guia, enxuto, para o painel "Como usar no CYPE 3D" da tela (sem estilos externos; cores do tema da tela) */
  function comoUsarHTML(r, opcoes) {
    var M = null; try { M = lerModelo(r); } catch (e) { M = null; }
    var c = contextoGuia(M, M ? M.r : {}, opcoes || {});
    var css = ".acg{font-size:13px;line-height:1.45}.acg h3{font-size:14px;margin:14px 0 6px}.acg .guia{padding-left:22px;margin:6px 0}.acg .guia>li{margin:10px 0}" +
      ".acg p{margin:2px 0}.acg .onde{opacity:.85}.acg .acf{font-style:italic;white-space:nowrap}.acg .rola{overflow-x:auto;margin:4px 0}" +
      ".acg table{border-collapse:collapse;width:100%;font-size:12px}.acg th,.acg td{border:1px solid rgba(127,127,127,.4);padding:3px 5px;text-align:left;vertical-align:top}" +
      ".acg td.n{text-align:right;white-space:nowrap}.acg code{font-family:Consolas,monospace;font-size:12px}.acg .probs li{margin:4px 0}";
    return "<section class=\"acg\" aria-label=\"Como usar no CYPE 3D\"><style>" + css + "</style><h3>Como usar no CYPE 3D</h3>" + guiaHTML(c, "painel") + "</section>";
  }

  function roteiro(r, opcoes) {
    var M = lerModelo(r), op = opcoes || {}, dt = lerData(op.data), L = M.L, par = M.par, R = M.r || {};
    var casos = arr(R.casos).length ? R.casos : arr(M.mod.casos), combs = arr(R.combinacoes), nomeH = nomeHipotese(casos);
    var obra = op.obra || ("Galpão " + br(L.vao, 2) + " × " + br(L.Lt, 2) + " m");
    var arqIfc = op.arquivoIfc || "galpao-orcapro.ifc", baseTxt = op.base || "galpao";
    var grupos = gruposEtiqueta(M), H = [];
    var aprovado = R.aprovado === true, temResultado = R.ok === true;
    function secao(t, corpo) { H.push("<section><h2>" + t + "</h2>" + corpo + "</section>"); }

    /* ---------------------------------------------------------- 0 cabeçalho */
    H.push("<header><h1>Roteiro CYPE 3D — " + esc(obra) + "</h1><p class=\"nota\">Gerado pelo OrçaPRO em " + dataBR(dt) + " · " +
      M.nos.length + " nós · " + M.barras.length + " barras · " + M.apoios.length + " apoios · " + casos.length + " hipóteses · " + combs.length + " combinações</p>" +
      (temResultado ? (aprovado ? "<p class=\"ok\">Cálculo do OrçaPRO: todas as barras e limites passam.</p>" : "<p class=\"erro\">Cálculo do OrçaPRO: " + num(R.falhas, 0) + " barra(s)/limite(s) NÃO passam — confira no CYPE antes de seguir.</p>") : "<p class=\"aviso\">Resultado sem verificação (só o modelo).</p>") +
      "</header>");

    /* ---------------------------------------------------------- 1 como usar no CYPE 3D */
    var temTir = M.barras.some(function (o) { return ETQ[o.etiqueta].tirante; });
    secao("<a id=\"como-usar\"></a>1. Como usar no CYPE 3D", guiaHTML(contextoGuia(M, R, { arquivoIfc: arqIfc, base: baseTxt }), "roteiro"));

    /* ---------------------------------------------------------- 2 eixos e numeração */
    secao("<a id=\"eixos\"></a>2. Eixos e numeração", "<p>Conversão dos eixos do OrçaPRO (X vão, Y para cima, Z comprimento) para os do CYPE (Z para cima), mantendo a regra da mão direita:</p>" +
      tabela(["CYPE", "OrçaPRO", "No galpão"], [["X", "Z", "comprimento (0 = oitão da frente → " + br(L.Lt, 2) + " m = fundo)"], ["Y", "X", "vão (0 = pilar esquerdo → " + br(L.vao, 2) + " m = direito)"], ["Z", "Y", "vertical (0 = topo da base)"]]) +
      "<p>Os pórticos ficam no plano YZ, em X = " + arr(L.zs).map(function (z) { return br(z, 3); }).join("; ") + " m. Pela regra dos eixos locais do CYPE (barra vertical: z local paralelo ao Y geral), a alma dos pilares já cai no plano do pórtico. <b>Conferir na primeira importação</b>: se a alma dos pilares aparecer perpendicular ao pórtico, gire os pilares 90° e NÃO gire o tapamento.</p>" +
      "<p>Numeração: nós 1 a " + M.nos.length + " e barras 1 a " + M.barras.length + " (a mesma no IFC — campo descrição — e nos arquivos de texto). Tabelas completas nos <a href=\"#apendice\">apêndices</a>.</p>");

    /* ---------------------------------------------------------- 3 dados gerais */
    var acosUsados = {}; M.barras.forEach(function (o) { if (o.aco && o.aco.id) { var k = String(o.aco.id); (acosUsados[k] = acosUsados[k] || { a: o.aco, etq: [] }); if (acosUsados[k].etq.indexOf(o.etiqueta) < 0) acosUsados[k].etq.push(o.etiqueta); } });
    var Mt = Mat(), K = Mt && Mt.CONST ? Mt.CONST : { E: 200000, G: 77000, nu: 0.3, gamma: 78.5 };
    var linA = Object.keys(acosUsados).map(function (k) { var a = acosUsados[k].a; return [esc(k), fin(a.fy) ? br(a.fy, 0) : "—", fin(a.fu) ? br(a.fu, 0) : "—", esc(acosUsados[k].etq.join(", "))]; });
    var segOrdem = combs.some(function (c) { return c.segundaOrdem; }), noc = combs.some(function (c) { return c.nocional; });
    secao("<a id=\"dados\"></a>3. Dados gerais da obra",
      "<ul><li>Normas: <b>NBR 8800</b> (aço laminado e soldado), <b>NBR 14762</b> (formados a frio), ações e combinações pela <b>NBR 8681</b>, vento pela <b>NBR 6123</b>.</li>" +
      "<li>Aço: E = " + br(K.E / 1000, 0) + " GPa · G = " + br(K.G / 1000, 0) + " GPa · ν = " + br(K.nu, 1) + " · peso específico " + br(K.gamma, 1) + " kN/m³.</li></ul>" +
      tabela(["Aço", "fy (MPa)", "fu (MPa)", "Etiquetas"], linA, [0, 1, 1, 0]) +
      "<p>Análise do OrçaPRO: " + (segOrdem ? "<b>2ª ordem</b> (P-Δ e P-δ)" : "1ª ordem") + (noc ? " com forças nocionais (imperfeição geométrica, 0,3 % das cargas gravitacionais) em X e em Z do OrçaPRO" : "") +
      (R.deslocabilidade ? "; deslocabilidade " + esc(R.deslocabilidade.classe) + " (Δ2/Δ1 = " + br(R.deslocabilidade.razao, 3) + ")" + (R.deslocabilidade.classe !== "pequena" ? ", rigidez reduzida a 80 % nas combinações últimas" : "") : "") + ". " +
      "Por isso os comprimentos de flambagem da seção 6 usam <b>K = 1</b> (NBR 8800, 4.9.7). No CYPE, ative os efeitos de 2ª ordem (P-Δ) na definição do vento; se a análise do CYPE não incluir as imperfeições, use no plano do pórtico um coeficiente de pórtico deslocável (β &gt; 1) — decisão do engenheiro.</p>");

    /* ---------------------------------------------------------- 4 seções */
    var linS = [], provisorias = [], baixas = [];
    grupos.forEach(function (g) {
      var porSec = {}, ordem = [];
      g.barras.forEach(function (o) { var k = o.sec.chave; if (!porSec[k]) { porSec[k] = { sec: o.sec, aco: o.aco, n: 0, giro: o.giro }; ordem.push(k); } porSec[k].n++; });
      ordem.forEach(function (k) {
        var P = porSec[k], cy = P.sec.cype;
        linS.push(["<b>" + g.id + "</b><br><span class=\"nota\">" + esc(ETQ[g.id].desc) + "</span>", String(P.n), esc(P.sec.nome), "<code>" + esc(cy.nome) + "</code>", esc(cy.catalogo || "—"),
                   "<span class=\"cert " + esc(cy.certeza) + "\">" + esc(cy.certeza) + "</span>", esc(P.aco && P.aco.id ? P.aco.id : "—"),
                   ETQ[g.id].tirante ? "TIRANTE" : "genérica (aço)", P.giro ? "90°" : "0°", esc(cy.obs || "")]);
        if (P.sec.provisoria) provisorias.push(g.id);
        else if (cy.certeza === "baixa" || cy.certeza === "nenhuma") baixas.push(P.sec);
      });
    });
    var htmlProps = "", vistas = {};
    var semEq = baixas.filter(function (s) { if (vistas[s.chave]) return false; vistas[s.chave] = true; return true; });
    function brI(v) { return !fin(v) ? "—" : br(v, Math.abs(v) < 10 ? 3 : (Math.abs(v) < 1000 ? 1 : 0)); }
    if (semEq.length) {
      htmlProps = "<h3>Propriedades das seções sem nome confirmado no CYPE (para conferir ou criar seção genérica)</h3>" +
        tabela(["Perfil (OrçaPRO)", "A (cm²)", "Ix (cm⁴)", "Iy (cm⁴)", "J (cm⁴)", "massa (kg/m)"], semEq.map(function (s) {
          var mm = s.mm || {}; return [esc(s.nome), brI(num(mm.A, NaN) / 100), brI(num(mm.Ix, NaN) / 1e4), brI(num(mm.Iy, NaN) / 1e4), brI(num(mm.J, NaN) / 1e4), br(s.massa, 2)];
        }), [0, 1, 1, 1, 1, 1]);
    }
    secao("<a id=\"secoes\"></a>4. Seções e materiais (por etiqueta)",
      "<p>Certeza do nome: <b>alta</b> = mesmo perfil, nome no padrão confirmado do catálogo do CYPE · <b>media</b> = padrão confirmado, perfil de outra tabela (conferir dimensões) · <b>baixa</b> = catálogo do CYPE não confirmado (procurar pelas dimensões) · <b>nenhuma</b> = seção a definir no CYPE.</p>" +
      tabela(["Etiqueta", "Barras", "Perfil no OrçaPRO", "Nome no CYPE", "Catálogo", "Certeza", "Aço", "Tipo de barra", "Giro", "Observação"], linS, [0, 1, 0, 0, 0, 0, 0, 0, 1, 0]) +
      (provisorias.length ? "<p class=\"aviso\">" + esc(uniq(provisorias).join(", ")) + ": o OrçaPRO modela essas barras como ESCORAS biarticuladas com seção provisória (só força normal) — o perfil real (terça, travessa) vem do dimensionamento à parte pela NBR 14762. No CYPE, atribua o perfil formado a frio adotado" +
        (uniq(provisorias).indexOf("TERCA") >= 0 && fin(L.th) && L.th > 1e-6 ? "; a terça real costuma ficar com a alma perpendicular à telha — no modelo do OrçaPRO ela está na vertical: giro de " + br(L.th * 180 / Math.PI, 2) + "° (inclinação da cobertura) se for o caso" : "") +
        ". Atenção ao peso: veja a nota da seção 7.</p>" : "") + htmlProps);

    /* ---------------------------------------------------------- 5 vínculos */
    var porVinc = {}, ordemV = [];
    M.apoios.forEach(function (ap) { var v = vinculoCype(ap.a), k = v.join("|"); if (!porVinc[k]) { porVinc[k] = { v: v, nos: [] }; ordemV.push(k); } porVinc[k].nos.push(ap.no); });
    var linV = ordemV.map(function (k) {
      var e = porVinc[k]; return [esc(nomeVinculo(e.v)), GL_NOME.map(function (n, i) { return n + " " + (e.v[i] === RIGIDO ? "fixo" : e.v[i] > 0 ? "mola " + br(e.v[i] / 1000, 1) : "livre"); }).join(" · "), String(e.nos.length), descreverNos(e.nos)];
    });
    var linR = [];
    grupos.forEach(function (g) {
      var porPadrao = {}, ordem = [];
      g.barras.forEach(function (o) {
        var lib = o.b.libera || {}, ti = temLiberacao(lib.i), tj = temLiberacao(lib.j);
        if (!ti && !tj) return;
        var k = (ti ? JSON.stringify(lib.i) : "-") + "|" + (tj ? JSON.stringify(lib.j) : "-");
        if (!porPadrao[k]) { porPadrao[k] = { li: ti ? lib.i : null, lj: tj ? lib.j : null, barras: [] }; ordem.push(k); }
        porPadrao[k].barras.push(o);
      });
      ordem.forEach(function (k) {
        var P = porPadrao[k];
        function txtLib(l) { if (!l) return "rígida (1 nos dois planos)"; var p = []; if (l.rz) p.push("xz"); if (l.ry) p.push("xy"); return (p.length ? "0 no" + (p.length > 1 ? "s planos " : " plano ") + p.join(" e ") : "rígida") + (l.rx ? " · torção livre (o CYPE mantém a torção: sem efeito prático)" : ""); }
        linR.push(["<b>" + g.id + "</b>", String(P.barras.length), txtLib(P.li), txtLib(P.lj), P.barras.length === g.barras.length ? "todas as barras da etiqueta" : descreverBarras(M, P.barras)]);
      });
    });
    var tirTxt = temTir ? "<p>Contraventamento (" + esc(grupos.filter(function (g) { return ETQ[g.id].tirante; }).map(function (g) { return g.id; }).join(", ")) + "): tipo de barra <b>TIRANTE</b>. O CYPE exige X (cruz de Santo André) emoldurado nos quatro lados (ou em três com dois apoios), painel retangular e diagonais iguais no mesmo plano; as diagonais NÃO se ligam no cruzamento (não gerar nó no ponto de corte). O OrçaPRO também as trata como só de tração.</p>" : "";
    secao("<a id=\"vinculos\"></a>5. Vínculos e rótulas",
      "<h3>Apoios (Nó → Vinculação exterior) — eixos gerais do CYPE</h3>" + tabela(["Tipo", "Graus de liberdade", "Nós", "Onde (Y · Z → X)"], linV, [0, 0, 1, 0]) +
      "<p class=\"nota\">Base " + esc(par.geometria && par.geometria.base ? par.geometria.base : "rotulada") + " no OrçaPRO. O giro em torno do eixo vertical (GZ) fica preso para o pilar não girar em torno do próprio eixo; no plano do pórtico a base gira livre (rotulada).</p>" +
      "<h3>Rótulas nas pontas (Barra → Coeficientes de engastamento: 0 = articulado, 1 = engastado)</h3>" +
      (linR.length ? tabela(["Etiqueta", "Barras", "Ponta inicial (nó 1 da barra)", "Ponta final (nó 2)", "Quais"], linR, [0, 1, 0, 0, 0]) : "<p>Nenhuma rótula: todas as ligações são rígidas.</p>") +
      "<p class=\"nota\">Plano xz da seção = flexão no eixo forte (alma); plano xy = eixo fraco. No IFC as rótulas vão como condição de ligação na ponta da barra; confira se o CYPE as aplicou.</p>" + tirTxt);

    /* ---------------------------------------------------------- 6 flambagem */
    var linF = [], gruposF = {}, ordemF = [];
    arr(M.G.membros).forEach(function (m) {
      var Lm = num(m.L, 0), fl = m.flambagem || {}, tr = m.travamentos || {};
      var segs = arr(m.segs).map(function (s) { return M.barraPorId[String(s)]; }).filter(Boolean);
      var o0 = segs[0], lado = o0 ? o0.lado : null, etq = o0 ? o0.etiqueta : (m.papel || "").toUpperCase();
      var lbMais = maxTrecho(Lm, tr.mais), lbMenos = maxTrecho(Lm, tr.menos);
      var res = R.membros && R.membros[m.id], cb = res && res.pior && res.pior.flt ? res.pior.flt : null;
      var assin = [etq, br(Lm, 3), br(fl.Lx, 3), br(fl.Ly, 3), br(fl.Lz, 3), listaX(arr(tr.mais)), listaX(arr(tr.menos)), String(lado)].join("|");
      if (!gruposF[assin]) { gruposF[assin] = { etq: etq, L: Lm, fl: fl, mais: arr(tr.mais), menos: arr(tr.menos), lbMais: lbMais, lbMenos: lbMenos, lado: lado, papel: m.papel, membros: [], cbs: [], razoes: [], mf: [] }; ordemF.push(assin); }
      var gF = gruposF[assin]; gF.membros.push(m.id);
      if (cb && fin(cb.cb)) gF.cbs.push(cb.cb);
      if (res && fin(res.razao)) gF.razoes.push(res.razao);
      if (arr(m.maosFrancesas).length) gF.mf.push(m.id);
    });
    function nomeMesa(papel, sinal) {
      if (papel === "viga") return sinal > 0 ? "mesa de CIMA" : "mesa de BAIXO";
      if (papel === "pilar" || papel === "tapamento") return sinal > 0 ? "mesa de DENTRO" : "mesa de FORA";
      return sinal > 0 ? "mesa +y" : "mesa −y";
    }
    function quemTrava(papel, sinal) {
      if (papel === "viga") return sinal > 0 ? "terças" : "mãos-francesas";
      if (papel === "pilar") return sinal > 0 ? "mãos-francesas" : "travessas";
      if (papel === "tapamento") return sinal > 0 ? "—" : "travessas do oitão";
      return "travamentos";
    }
    function abaCype(lado, sinal) { if (lado === 1) return sinal > 0 ? "aba superior (z+)" : "aba inferior (z−)"; if (lado === -1) return sinal > 0 ? "aba inferior (z−)" : "aba superior (z+)"; return "aba: conferir nos eixos locais (seção girada)"; }
    function celulaFLT(g, sinal) {
      var pos = sinal > 0 ? g.mais : g.menos, lb = sinal > 0 ? g.lbMais : g.lbMenos;
      return "<b>Lb = " + br(lb, 2) + " m</b> — " + nomeMesa(g.papel, sinal) + "<br>" + abaCype(g.lado, sinal) +
             "<br><span class=\"nota\">" + (pos.length ? "travada em " + listaX(pos) + " (" + quemTrava(g.papel, sinal) + ")" : "sem travamento intermediário") + "</span>";
    }
    ordemF.forEach(function (k) {
      var g = gruposF[k], fl = g.fl;
      var bxz = g.L > 0 ? num(fl.Lx, NaN) / g.L : NaN, bxy = g.L > 0 ? num(fl.Ly, NaN) / g.L : NaN;
      var cbs = uniq(g.cbs.slice().sort(function (a, b) { return a - b; }).map(function (v) { return br(v, 2); }));
      var cbTxt = !cbs.length ? "—" : (cbs.length === 1 ? cbs[0] : cbs[0] + " a " + cbs[cbs.length - 1]);
      linF.push(["<b>" + esc(g.etq) + "</b> " + esc(g.membros.join(", ")) + (g.mf.length ? "<br><span class=\"nota\">com mão-francesa</span>" : ""), br(g.L, 2),
        "Lk = " + br(fl.Lx, 2) + " m<br><span class=\"nota\">β = " + br(bxz, 3) + "</span>", "Lk = " + br(fl.Ly, 2) + " m<br><span class=\"nota\">β = " + br(bxy, 3) + "</span>", br(num(fl.Lz, fl.Ly), 2),
        celulaFLT(g, 1), celulaFLT(g, -1), cbTxt, g.razoes.length ? brp(Math.max.apply(null, g.razoes)) : "—"]);
    });
    var linE = [];
    grupos.forEach(function (g) {
      if (!ETQ[g.id].escora && g.id !== "PORTICO_TRAV" && g.id !== "OUTRAS") return;
      var Ls = uniq(g.barras.map(function (o) { return br(o.L, 3); }));
      linE.push(["<b>" + g.id + "</b>", String(g.barras.length), Ls.join("; ") + " m", ETQ[g.id].escora ? "β = 1 nos planos xy e xz (biarticulada entre pórticos/colunas)" : "β = 1 (conferir)", "conforme o perfil adotado"]);
    });
    secao("<a id=\"flambagem\"></a>6. Flambagem e flambagem lateral (por barra)",
      "<p><b>Barra → Flambagem</b>: informe o <b>comprimento de flambagem Lk</b> em cada plano — vale qualquer que seja a divisão das barras no CYPE. O β mostrado é Lk ÷ comprimento do membro inteiro (use-o só se as barras do membro estiverem unidas numa peça). Plano <b>xz</b> = eixo forte (no plano da alma; no pórtico, o plano do pórtico); plano <b>xy</b> = eixo fraco.</p>" +
      "<p><b>Barra → Flambagem lateral</b>: comprimento destravado Lb de cada aba (o maior trecho entre travamentos dessa aba; as pontas contam como travadas). O OrçaPRO verifica cada trecho com o seu próprio diagrama de momentos — um Lb único por aba no CYPE é a favor da segurança. Cb: o do OrçaPRO no trecho que governa (o CYPE calcula pelo diagrama; 1,0 é a favor da segurança).</p>" +
      tabela(["Membros", "L (m)", "Plano xz (forte)", "Plano xy (fraco)", "Lz torção (m)", "FLT — aba +y do OrçaPRO", "FLT — aba −y do OrçaPRO", "Cb (OrçaPRO)", "Aproveitamento máx."], linF, [0, 1, 0, 0, 1, 0, 0, 1, 1]) +
      "<p class=\"nota\">Aba superior/inferior pela regra dos eixos locais do CYPE (z local para cima; barra vertical: z local = +Y geral) — o diálogo desenha os eixos: confira o lado. Lz (flexo-torção): o OrçaPRO usa o mesmo vão destravado do eixo fraco.</p>" +
      (linE.length ? "<h3>Escoras, terças e travessas</h3>" + tabela(["Etiqueta", "Barras", "Comprimento", "Flambagem", "Flambagem lateral"], linE, [0, 1, 1, 0, 0]) +
        "<p class=\"nota\">O OrçaPRO não verifica essas barras (seção provisória, só força normal): o perfil real e a sua flambagem saem do dimensionamento das terças/travessas.</p>" : ""));

    /* ---------------------------------------------------------- 7 hipóteses e cargas */
    var casoPP = casos.filter(temPesoProprio)[0] || null;
    function linhaHip(rot, c, nome, tipo, co, dir) {
      var gam = co && fin(co.desf) ? br(co.desf, 2) + (fin(co.fav) ? " / " + br(co.fav, 2) : "") : "—";
      var psi = co && co.psi ? "ψ0 = " + br(co.psi.psi0, 1) + " · ψ1 = " + br(co.psi.psi1, 1) + " · ψ2 = " + br(co.psi.psi2, 1) : "—";
      return ["<b>" + rot + "</b>", c, nome, tipo + (co && co.nomeCat ? "<br><span class=\"nota\">" + esc(co.nomeCat) + "</span>" : ""), gam, psi, dir];
    }
    var linH = [];
    if (casoPP) linH.push(linhaHip("PP", "(parte de " + esc(casoPP.id) + ")", "Peso próprio dos perfis (automático no CYPE)", "Permanente", coeficientes(casoPP, combs), "—"));
    casos.forEach(function (c) {
      var tipo = c.tipo === "G" ? "Permanente" : c.tipo === "Q" ? "Variável — sobrecarga" : c.tipo === "W" ? "Variável — vento" : esc(c.tipo);
      var dir = c.tipo === "W" && fin(c.direcao) ? br(c.direcao, 0) + "° (sopra no sentido " + ({ 0: "+X", 90: "+Y", 180: "−X", 270: "−Y" }[c.direcao] || "?") + ")" : "—";
      linH.push(linhaHip(esc(nomeH[c.id]), esc(c.id), esc(c.nome || c.id) + (temPesoProprio(c) ? " <span class=\"nota\">(sem o peso próprio, que é o PP)</span>" : ""), tipo, coeficientes(c, combs), dir));
    });
    var V = R.vento || null, cfg = (R.parametros && R.parametros.cargas) || {};
    var mT = num(cfg.tercaMassa, 6), esp = num(L.esp, NaN);
    var corpoC = "<p>O <b>Peso próprio (PP)</b> o CYPE gera sozinho (pela seção e pelo aço). Crie as demais hipóteses abaixo, cada uma com a categoria de mesmos γ e ψ, e lance as cargas de cada uma. Todas as cargas estão nos <b>eixos gerais do CYPE</b> (FZ &lt; 0 = para baixo) e agrupadas por valor: selecione os nós/barras do grupo e lance uma vez.</p>" +
      tabela(["CYPE", "OrçaPRO", "Nome", "Tipo / categoria (NBR 8681)", "γ desf. / fav.", "ψ", "Direção"], linH, [0, 0, 0, 0, 1, 0, 0]) +
      "<p class=\"aviso\">Peso de terças e travessas: elas não têm perfil no modelo do OrçaPRO, então o peso delas já está nas cargas permanentes (terças de " + br(mT, 1) + " kg/m → " + br(mT * 0.00981 * esp, 3) +
      " kN por nó de terça nos pórticos internos, metade nos de extremidade; travessas dentro do peso do fechamento lateral dos pilares). Se você atribuir perfis a essas barras no CYPE, o peso próprio delas entra sozinho no PP — desconte essa parcela para não somar duas vezes.</p>";
    casos.forEach(function (c) {
      var C2 = cargasDoCaso(M, c);
      corpoC += "<h3>" + esc(nomeH[c.id]) + " — " + esc(c.nome || c.id) + " <span class=\"nota\">(OrçaPRO \"" + esc(c.id) + "\")</span></h3>";
      if (C2.pp) {
        var porEtq = {}, ordE = [];
        C2.pp.barras.forEach(function (o) { var A = num(o.b.secao && o.b.secao.A, 0), q = (C2.pp.fator - 1) * K.gamma * A, k = o.etiqueta + "|" + q.toFixed(4); if (!porEtq[k]) { porEtq[k] = { etq: o.etiqueta, q: q, n: 0 }; ordE.push(k); } porEtq[k].n++; });
        corpoC += "<p>Peso próprio dos perfis: automático no CYPE (hipótese Peso próprio)." + (C2.pp.fator > 1 + 1e-9 ? " O OrçaPRO soma <b>" + br((C2.pp.fator - 1) * 100, 0) + " %</b> para chapas, parafusos e enrijecedores — lance como carga permanente distribuída (FZ, kN/m):" : "") + "</p>";
        if (C2.pp.fator > 1 + 1e-9) corpoC += tabela(["Etiqueta", "Barras", "qZ (kN/m)"], ordE.map(function (k) { var e = porEtq[k]; return ["<b>" + e.etq + "</b>", String(e.n), br(-e.q, 4)]; }), [0, 1, 1]) +
          (ordE.some(function (k) { return ETQ[porEtq[k].etq].tirante; }) ? "<p class=\"nota\">Tirantes não aceitam carga no CYPE: a parcela deles fica de fora.</p>" : "");
      }
      if (c.tipo === "W") corpoC += resumoVentoCaso(V, c, L) || (V ? "" : "<p class=\"nota\">Pressões do vento: vento informado ao cálculo sem a tabela de zonas (as cargas abaixo já são as resultantes).</p>");
      if (C2.nos.length) corpoC += "<p>Cargas em <b>nós</b> (kN" + (C2.nos.some(function (g) { return g.F.slice(3).some(function (v) { return Math.abs(v) > 5e-4; }); }) ? "; momentos em kN·m" : "") + "):</p>" +
        tabela(["FX", "FY", "FZ", "Nós", "Onde (Y · Z → X)"], C2.nos.map(function (g) {
          var mtxt = g.F.slice(3).some(function (v) { return Math.abs(v) > 5e-4; }) ? "<br><span class=\"nota\">MX; MY; MZ = " + vet3(g.F.slice(3)) + "</span>" : "";
          return [br(g.F[0], 3), br(g.F[1], 3), br(g.F[2], 3) + mtxt, String(g.nos.length), descreverNos(g.nos)];
        }), [1, 1, 1, 1, 0]);
      if (C2.barras.length) corpoC += "<p>Cargas em <b>barras</b> (kN/m, eixos gerais, uniformes salvo indicação):</p>" +
        tabela(["qX", "qY", "qZ", "Trecho", "Barras", "Quais"], C2.barras.map(function (g) {
          var q = g.q, t = (q.a > 1e-6 || q.b < 1 - 1e-6) ? "de " + br(q.a * 100, 0) + " % a " + br(q.b * 100, 0) + " % do comprimento" : "barra inteira";
          var vals = g.uniforme ? [br(q.qa[0], 3), br(q.qa[1], 3), br(q.qa[2], 3)] : [0, 1, 2].map(function (i) { return br(q.qa[i], 3) + " → " + br(q.qb[i], 3); });
          return vals.concat([t, String(g.barras.length), descreverBarras(M, g.barras)]);
        }), [1, 1, 1, 0, 1, 0]);
      if (!C2.nos.length && !C2.barras.length && !C2.pp) corpoC += "<p>Sem cargas neste caso.</p>";
    });
    corpoC += "<p class=\"nota\">Cobertura (premissas do OrçaPRO): telha " + br(num(cfg.telhaPeso, 0.05), 2) + " kN/m² na superfície; permanente extra (instalações, forro) " + br(num(cfg.permanenteExtra, 0.10), 2) + " kN/m² em projeção" +
      (R.sobrecarga && fin(R.sobrecarga.q) ? "; sobrecarga " + br(R.sobrecarga.q, 2) + " kN/m² em projeção" : "") + " — úteis se preferir lançar por panos no CYPE (a distribuição muda um pouco).</p>";
    if (R.sobrecarga && R.sobrecarga.texto) corpoC += "<p class=\"nota\">Sobrecarga: " + esc(R.sobrecarga.texto) + " — " + esc(R.sobrecarga.referencia || "") + ". " + esc(R.sobrecarga.concentradaTexto || "") + "</p>";
    secao("<a id=\"cargas\"></a>7. Hipóteses e cargas", corpoC);

    /* ---------------------------------------------------------- 8 combinações */
    var linCb = combs.map(function (c) {
      var flags = []; if (c.segundaOrdem) flags.push("2ª ordem"); if (c.nocional) flags.push("nocional " + (c.nocional.dir && c.nocional.dir[0] ? "X OrçaPRO (= Y CYPE)" : "Z OrçaPRO (= X CYPE)"));
      return [esc(c.id), esc(c.tipo), esc(c.nome || ""), esc(c.descricao || ""), esc(textoFatores(c.fatores, nomeH, casos)), esc(flags.join("; ")) || "—"];
    });
    secao("<a id=\"combinacoes\"></a>8. Combinações (as do OrçaPRO, para conferir)",
      "<p>No CYPE, use a geração automática de combinações da NBR 8681/8800, com cada hipótese na categoria de mesmos γ e ψ da tabela da seção 7 (" +
      esc(casos.filter(function (c) { return c.tipo === "G"; }).map(function (c) { var co = coeficientes(c, combs); return nomeComPP(c, nomeH) + ": γ = " + br(co.desf, 2); }).join("; ")) +
      "). Se uma permanente entrar no CYPE com outro γ, os esforços dos dois programas não batem.</p>" +
      tabela(["Id", "Tipo", "Nome", "Fatores (OrçaPRO)", "No CYPE (hipóteses)", "Análise"], linCb, [0, 0, 0, 0, 0, 0]));

    /* ---------------------------------------------------------- 9 vento / Gerador de pórticos */
    var g0 = par.geometria || {}, fe = par.fechamentos || {};
    var geo = tabela(["Dado", "Valor"], [
      ["Vão", br(L.vao, 2) + " m"], ["Comprimento", br(L.Lt, 2) + " m"], ["Pórticos", (num(L.nV, 0) + 1) + " (vãos de " + br(L.esp, 3) + " m)"],
      ["Pé-direito (até o beiral)", br(L.H, 2) + " m"], ["Inclinação", br(num(L.i, 0) * 100, 1) + " % (" + br(Math.atan(num(L.i, 0)) * 180 / Math.PI, 2) + "°)"],
      ["Cobertura", (num(L.aguas, 2) === 1 ? "uma água" : "duas águas") + (L.aguas === 2 ? " · cumeeira a " + br(num(L.H, 0) + num(L.i, 0) * num(L.vao, 0) / 2, 2) + " m" : "")],
      ["Fechamentos", ["esquerda", "direita", "frente", "fundo"].map(function (f) { var x = fe[f] || {}; return f + ": " + esc(x.tipo || "—") + (x.tipo === "misto" && fin(x.alturaAlvenaria) ? " (alvenaria até " + br(x.alturaAlvenaria, 2) + " m)" : ""); }).join("; ")],
      ["Base dos pilares", esc(g0.base || "rotulada")], ["Telha", esc((par.cobertura && par.cobertura.telhaNome) || "—")],
      ["Permanente da cobertura", br(num(cfg.telhaPeso, 0.05), 2) + " kN/m² (telha) + " + br(num(cfg.permanenteExtra, 0.10), 2) + " kN/m² (extra)"],
      ["Sobrecarga de cobertura", br(R.sobrecarga ? R.sobrecarga.q : num(cfg.sobrecarga, NaN), 2) + " kN/m²"]
    ]);
    var ventoTxt;
    if (V && fin(V.v0)) {
      var s2 = V.s2 || {}, pd = s2.porDirecao || {};
      var classes = [0, 90, 180, 270].filter(function (d) { return pd[d]; }).map(function (d) { return d + "°: classe " + esc(pd[d].classe) + " (S2 = " + br(pd[d].valor, 3) + ")"; }).join("; ");
      ventoTxt = tabela(["Dado (NBR 6123)", "Valor", "De onde vem"], [
        ["V0", br(V.v0, 1) + " m/s", esc((V.v0Info && V.v0Info.origem) || "") + (V.v0Info && fin(V.v0Info.lat) ? " · " + br(V.v0Info.lat, 5) + "; " + br(V.v0Info.lon, 5) : "") + (V.v0Info && V.v0Info.descricao ? " · " + esc(V.v0Info.descricao) : "")],
        ["S1", br(V.s1 && V.s1.valor, 3), esc((V.s1 && V.s1.formula) || "")],
        ["S2 — categoria", esc(s2.categoria || "—"), "rugosidade do terreno (5.3.1)"],
        ["S2 — classe", esc(s2.classe || "—") + (classes ? "<br><span class=\"nota\">" + classes + "</span>" : ""), "dimensão frontal (5.3.2); z = " + br(s2.z, 2) + " m"],
        ["S3", br(V.s3, 2), V.s3Info ? "grupo " + esc(V.s3Info.grupo) + " — " + esc(V.s3Info.desc || "") : ""],
        ["Vk / q", br(V.vk, 2) + " m/s · " + br(V.q, 4) + " kN/m²", "direção que governa"],
        ["Cpi", uniq(arr(V.cpi).map(function (c) { return br(c.valor, 2); })).join(" ou ") || "—", esc(uniq(arr(V.cpi).map(function (c) { return c.cenarioNome || ""; })).join("; "))]
      ], [0, 1, 0]) + "<p class=\"nota\">" + esc(V.norma || "NBR 6123") + " — " + esc(V.edicao || "") + ".</p>";
    } else if (R.parametros && R.parametros.vento && typeof R.parametros.vento === "object") {
      var pv = R.parametros.vento;
      ventoTxt = "<p>Entrada do vento informada ao cálculo (o resultado detalhado da NBR 6123 não veio junto): V0 = " + br(num(pv.v0, NaN), 1) + " m/s · categoria " + esc(pv.categoria || "—") + " · grupo S3 " + esc(pv.grupoS3 || "—") + (pv.s1 && pv.s1.tipo ? " · S1: " + esc(pv.s1.tipo) : "") + ".</p>";
    } else {
      ventoTxt = "<p class=\"aviso\">Este cálculo não trouxe os dados da NBR 6123 (V0, S1, S2, S3): o vento foi informado já em pressões. Para usar o Gerador de pórticos, informe V0, S1, categoria/classe de S2 e S3 do local.</p>";
    }
    secao("<a id=\"vento\"></a>9. Vento — dados para o Gerador de pórticos do CYPE",
      "<p>Caminho alternativo para CONFERIR o vento: o Gerador de pórticos do CYPE (só pela tela) gera as cargas de vento com estes dados e exporta para uma obra NOVA do CYPE 3D. Compare as pressões com as do OrçaPRO (seção 7).</p>" + ventoTxt + "<h3>Geometria e cargas para o Gerador</h3>" + geo);

    /* ---------------------------------------------------------- 10 resultado */
    var corpoR = "";
    if (temResultado) {
      var linG = Object.keys(R.grupos || {}).map(function (gk) {
        var g = R.grupos[gk] || {}, res = g.membro && R.membros ? R.membros[g.membro] : null, pi = res && res.pior ? res.pior : null;
        return [esc(gk), esc(g.perfil || ""), brp(g.razao), esc(g.membro || ""), esc(g.governaELS ? "deslocamento (ELS)" : (res && res.governante) || (gk === "contravento" ? "tração" : "")),
                pi ? esc(pi.comb || "") + " · x = " + br(pi.x, 2) + " m" : "—", pi ? "N = " + br(pi.N, 1) + " kN · |M| = " + br(Math.abs(num(pi.Mz, NaN)), 1) + " kN·m · V = " + br(Math.abs(num(pi.Vy, NaN)), 1) + " kN" : (gk === "contravento" && R.contravento ? "N = " + br(R.contravento.N, 1) + " kN" : "—")];
      });
      corpoR += "<h3>Barras (aproveitamento máximo por grupo)</h3>" + tabela(["Grupo", "Perfil", "Aproveitamento", "Membro", "Governa", "Combinação", "Esforços no ponto que governa"], linG, [0, 0, 1, 0, 0, 0, 0]);
      var srv = arr(R.servico), pior = function (t) { return srv.filter(function (s) { return s.tipo === t; }).sort(function (a, b) { return b.razao - a.razao; })[0]; };
      var linS2 = [pior("pilarTopo"), pior("viga")].filter(Boolean).map(function (s) { return [esc(s.texto || s.tipo), esc(s.membro), br(s.valor * 1000, 1) + " mm", br(s.limite * 1000, 1) + " mm", brp(s.razao), esc(s.comb || "")]; });
      if (linS2.length) corpoR += "<h3>Deslocamentos (ELS, combinações raras)</h3>" + tabela(["Limite", "Membro", "Valor", "Limite", "Razão", "Combinação"], linS2, [0, 0, 1, 1, 1, 0]);
      var glob = [];
      if (R.deslocabilidade) glob.push("Deslocabilidade: Δ2/Δ1 = " + br(R.deslocabilidade.razao, 3) + " (" + esc(R.deslocabilidade.classe) + ")");
      arr(R.flambagem).forEach(function (f) { glob.push("Flambagem global: λcr = " + br(f.lambda, 2) + " na combinação " + esc(f.combinacao) + " (" + esc(f.nome || "") + ")"); });
      if (fin(R.peso)) glob.push("Peso de aço: " + br(R.peso, 0) + " kg (" + br(R.taxa, 2) + " kg/m²; terças e travessas à parte)" + (R.pesoGrupos ? " — " + Object.keys(R.pesoGrupos).map(function (k) { return esc(k) + " " + br(R.pesoGrupos[k], 0) + " kg"; }).join(", ") : ""));
      if (glob.length) corpoR += "<ul>" + glob.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>";
      /* reações */
      var reac = R.reacoes || {}, idsR = M.apoios.map(function (a) { return a.no.id; }).filter(function (id) { return reac[id]; });
      if (idsR.length) {
        var linEnv = idsR.map(function (id) {
          var e = reac[id].envELU || {}, n = M.porId[id], f = function (a) { return a ? br(a[0], 1) + " / " + br(a[1], 1) : "—"; };
          return [String(n.num) + " <span class=\"nota\">" + esc(id) + "</span>", br(n.c[0], 3) + "; " + br(n.c[1], 3), f(e.Fz), f(e.Fx), f(e.Fy), f(e.Mz), f(e.Mx)];
        });
        corpoR += "<h3>Reações nas bases — envoltória das combinações últimas (mín / máx)</h3><p class=\"nota\">Força do apoio sobre a estrutura, eixos do CYPE (FZ &gt; 0 = para cima); kN e kN·m.</p>" +
          tabela(["Nó", "X; Y", "FX", "FY", "FZ", "MX", "MY"], linEnv, [0, 1, 1, 1, 1, 1, 1]);
        var linPC = [];
        idsR.forEach(function (id) {
          var pc = reac[id].porCaso || {}, n = M.porId[id];
          Object.keys(pc).forEach(function (cid) {
            var v = arr(pc[cid]).map(function (x) { return num(x, NaN); }); while (v.length < 6) v.push(NaN);
            var c = paraCype(v.slice(0, 3)), m = paraCype(v.slice(3, 6)), cs = casos.filter(function (x) { return x.id === cid; })[0];
            var nomeR = cs ? nomeComPP(cs, nomeH) : (nomeH[cid] || cid);
            linPC.push([String(n.num) + " <span class=\"nota\">" + esc(id) + "</span>", esc(nomeR) + " <span class=\"nota\">(" + esc(cid) + ")</span>", br(c[0], 2), br(c[1], 2), br(c[2], 2), br(m[0], 2), br(m[1], 2)]);
          });
        });
        if (linPC.length) corpoR += "<details><summary>Reações por hipótese (valores característicos)</summary>" + tabela(["Nó", "Hipótese", "FX", "FY", "FZ", "MX", "MY"], linPC, [0, 0, 1, 1, 1, 1, 1]) + "</details>";
      }
      if (arr(R.avisos).length) corpoR += "<h3>Avisos do cálculo</h3><ul>" + R.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
    } else corpoR += "<p class=\"aviso\">Sem resultado de verificação neste arquivo.</p>";
    var dec = arr(R.decisoes).length ? R.decisoes : arr(M.G.decisoes);
    if (dec.length) corpoR += "<h3>Decisões do OrçaPRO</h3>" + tabela(["Tema", "Decisão", "Motivo"], dec.map(function (d) { return [esc(d.tema), esc(d.decisao), esc(d.motivo)]; }));
    corpoR += "<h3>Diferenças esperadas entre os dois modelos</h3><ul>" +
      "<li>2ª ordem e imperfeições: o OrçaPRO faz P-Δ e P-δ com forças nocionais e rigidez reduzida; o CYPE amplifica o vento (P-Δ aproximado).</li>" +
      "<li>Acréscimo de ligações sobre o peso próprio (seção 7) e peso de terças/travessas (cargas nodais × peso próprio do perfil no CYPE).</li>" +
      "<li>Terças e travessas: seção provisória no OrçaPRO × perfil real no CYPE (muda pouco o pórtico: são biarticuladas).</li>" +
      "<li>Tirantes: o OrçaPRO tira a diagonal comprimida a cada combinação; o CYPE passa a compressão para a diagonal tracionada (método aproximado do CYPE).</li>" +
      "<li>Flambagem lateral: Lb por trecho (OrçaPRO) × Lb único por aba (CYPE).</li></ul>";
    secao("<a id=\"resultado\"></a>10. Resultado do OrçaPRO, para comparar", corpoR);

    /* ---------------------------------------------------------- apêndices */
    var linNos = M.nos.map(function (n) { var a = M.apoioDoNo[n.id]; return [String(n.num), esc(n.id), br(n.c[0], 4), br(n.c[1], 4), br(n.c[2], 4), a ? esc(nomeVinculo(vinculoCype(a))) : ""]; });
    var linB = M.barras.map(function (o) {
      var lib = o.b.libera || {}; var rt = []; if (temLiberacao(lib.i)) rt.push("início"); if (temLiberacao(lib.j)) rt.push("fim");
      return [String(o.num), esc(o.id), o.i.num + " → " + o.j.num, br(o.L, 3), o.etiqueta, esc(o.sec.cype.nome), rt.join(" e ") || ""];
    });
    secao("<a id=\"apendice\"></a>Apêndices",
      "<details><summary>A. Nós (" + M.nos.length + ") — coordenadas em m, eixos do CYPE</summary>" + tabela(["Nº", "Id OrçaPRO", "X", "Y", "Z", "Apoio"], linNos, [1, 0, 1, 1, 1, 0]) + "</details>" +
      "<details><summary>B. Barras (" + M.barras.length + ")</summary>" + tabela(["Nº", "Id OrçaPRO", "Nós", "L (m)", "Etiqueta", "Seção no CYPE", "Rótula"], linB, [1, 0, 0, 1, 0, 0, 0]) + "</details>" +
      "<details><summary>C. Arquivos de texto por etiqueta</summary>" + tabela(["Arquivo", "Etiqueta", "Barras", "Descrição"], grupos.map(function (g) { return ["<code>" + esc(baseTxt) + "_" + g.id + ".txt</code>", g.id, String(g.barras.length), esc(ETQ[g.id].desc)]; }), [0, 0, 1, 0]) +
      "<p class=\"nota\">Importe cada arquivo com a etiqueta do mesmo nome (Geometria → Importar → arquivo de texto). A numeração é única: os nós coincidentes se unem na importação.</p></details>");

    var css = ":root{--tinta:#1d2733;--suave:#5b6878;--linha:#d3dbe4;--fundo:#fff;--cab:#eef2f6;--zebra:#f6f8fa;--realce:#0b5cad;--aviso:#9a5b00;--erro:#a3241b;--ok:#1e7a3c}" +
      "*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tinta);font:14px/1.45 \"Segoe UI\",Arial,sans-serif}" +
      "main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:30px 0 8px;padding-bottom:4px;border-bottom:2px solid var(--realce)}h3{font-size:15px;margin:18px 0 6px}" +
      ".rola{overflow-x:auto;margin:6px 0 12px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid var(--linha);padding:4px 6px;text-align:left;vertical-align:top}" +
      "th{background:var(--cab)}tbody tr:nth-child(even) td{background:var(--zebra)}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}" +
      ".nota{color:var(--suave);font-size:12.5px}.aviso{border-left:4px solid var(--aviso);background:#fff7e6;padding:8px 12px}.erro{border-left:4px solid var(--erro);background:#fdecea;padding:8px 12px}.ok{border-left:4px solid var(--ok);background:#eaf6ee;padding:8px 12px}" +
      ".cert{padding:1px 6px;border-radius:8px;font-size:12px}.cert.alta{background:#eaf6ee}.cert.media{background:#eef4fb}.cert.baixa{background:#fff7e6}.cert.nenhuma{background:#fdecea}" +
      "ol.guia{padding-left:24px}ol.guia>li{margin:12px 0;padding:6px 10px;border-left:3px solid var(--linha)}ol.guia p{margin:2px 0}ol.guia .tit{font-size:14.5px}.onde{color:var(--suave)}.conf{margin-top:2px}" +
      ".acf{font-style:italic;color:var(--aviso);white-space:nowrap}ul.probs li{margin:5px 0}" +
      "code{font:12.5px Consolas,monospace;background:#f2f4f7;padding:0 3px}details{margin:8px 0}summary{cursor:pointer;font-weight:600}" +
      "@media print{h2{break-after:avoid}tr{break-inside:avoid}details>*{display:block}.rola{overflow:visible}}";
    return "<!doctype html>\n<html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Roteiro CYPE 3D</title><style>" + css + "</style></head><body><main>" + H.join("\n") + "</main></body></html>\n";
  }

  /* tudo junto, para a tela oferecer o download */
  function arquivos(r, opcoes) {
    var op = opcoes || {}, base = String(op.base || "galpao").replace(/[^A-Za-z0-9_-]+/g, "_"), o = {};
    Object.keys(op).forEach(function (k) { o[k] = op[k]; });
    o.base = base; o.arquivoIfc = op.arquivoIfc || base + ".ifc"; o.arquivo = o.arquivoIfc;
    var lista = [{ nome: o.arquivoIfc, tipo: "application/x-step", conteudo: ifc(r, o) }, { nome: base + ".txt", tipo: "text/plain", conteudo: txt(r) }];
    txtEtiquetas(r, o).forEach(function (t) { lista.push({ nome: t.arquivo, tipo: "text/plain", conteudo: t.texto }); });
    lista.push({ nome: base + "-roteiro-cype.html", tipo: "text/html", conteudo: roteiro(r, o) });
    return lista;
  }

  var AcoCype = { VERSAO: VERSAO, RIGIDO: RIGIDO, ETIQUETAS: ETIQUETAS, ifc: ifc, txt: txt, txtEtiquetas: txtEtiquetas, roteiro: roteiro, comoUsarHTML: comoUsarHTML, nomeCype: nomeCype, arquivos: arquivos,
                  paraCype: paraCype, _interno: { lerModelo: lerModelo, guid: guid, sReal: sReal, ascii: ascii, vinculoCype: vinculoCype, liberacao: liberacao, eixosOrca: eixosOrca, eixosCypePadrao: eixosCypePadrao, cargasDoCaso: cargasDoCaso } };
  global.AcoCype = AcoCype;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoCype;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
