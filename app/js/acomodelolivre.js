/* =====================================================================
 * acomodelolivre.js — O MODELO DE CÁLCULO DE QUALQUER ESTRUTURA DE AÇO
 * DESENHADA À MÃO (motor PURO, ES5, sem DOM, Node-testável). 13/10/2026.
 *
 * Pedido do Rogério: "calcular qualquer estrutura de aço" — mezanino,
 * passarela, plataforma, pórtico avulso, cobertura simples —, não só o
 * galpão do assistente (js/acomodelo.js). Aqui o sistema LÊ as peças que o
 * engenheiro desenhou na Metálica (js/metalcriar.js / js/metalpeca.js:
 * caixas com `metal.kind = "perfil"`) e monta o modelo de cálculo no MESMO
 * formato do galpão ({nos, barras, apoios, casos} do js/acoanalise.js +
 * membros com flambagem e travamentos), para reaproveitar análise,
 * verificação (NBR 8800 / NBR 14762), vista 3D e exportação CYPE.
 *
 *   ler(caixas, op)       peças → { pecas, semPerfil, ignoradas, ligacoes }
 *   montar(lido, op)      nós por coincidência de pontas e interseções
 *                         (tolerância), barras, rótulas, apoios, membros,
 *                         comprimentos de flambagem e travamentos
 *   estabilidade(G)       mecanismo / conjunto sem apoio / barra solta
 *   cargas(G, cfg)        casos G, G (revestimentos), Q (NBR 6120), pontuais,
 *                         vento (js/acovento.js) — áreas por FAIXAS
 *   USOS / usoCarga(id)   NBR 6120:2019, Tabela 10 (valores conferidos no
 *                         PDF da biblioteca da RA, página impressa citada)
 *
 * REGRAS DE LEITURA (o "sistema é o conhecimento" — e o que ele decidiu vai
 * para `decisoes`, com o motivo):
 *  · LINHA DE CÁLCULO de cada peça = a linha que o engenheiro clicou
 *    (MetalCriar.linhaAtual: o topo da viga no nível, o eixo do pilar);
 *    peça sem receita usa o eixo do perfil.
 *  · NÓS: pontas que se tocam (distância ≤ 1 cm + metade das seções) viram
 *    um nó; ponta que cai no meio de outra peça vira nó DESSA peça (a outra
 *    continua contínua por ele); duas vigas que se cruzam se ligam no
 *    cruzamento. Diagonais e tirantes NÃO se ligam no cruzamento do X.
 *  · PAPEL: vertical (≤ 15°) = pilar; "Contraventamento"/barra redonda =
 *    diagonal (articulada nas duas pontas; barra redonda só de tração);
 *    "Terça" = terça (articulada); o resto = viga.
 *  · LIGAÇÕES: a desenhada manda (chapa de topo → rígida; cantoneira dupla,
 *    clip, gusset, nó de treliça → rotulada; cobrejunta → contínua); sem
 *    ligação desenhada: viga × pilar POR DIREÇÃO da viga na planta (X e Y
 *    do modelo — vigaPilarX/vigaPilarY; "auto" = rígida no plano do pórtico
 *    identificado e rotulada na outra; sem plano identificado, rotulada) e
 *    viga × viga ROTULADA (padrão, o usuário troca); viga que continua
 *    colinear sem nada no nó = contínua (emenda) — avisado.
 *  · APOIOS: a ponta de baixo de pilar que não encosta em nada é BASE
 *    (ENGASTADA por padrão desde 15/10/2026 — pedido do Rogério: "em galpão
 *    a maioria são engastados"; rotulada por escolha, pilar a pilar). Outras
 *    pontas livres viram apoio só se o usuário disser (parede, pilar de
 *    concreto…).
 *  · FLAMBAGEM (K = 1, análise de 2ª ordem com imperfeições — NBR 8800,
 *    4.9.7): comprimento entre os pontos travados na direção de cada eixo
 *    (peça que chega com componente nessa direção, ou apoio); ponta livre
 *    (balanço) → 2 × o trecho. FLT: a viga que chega trava a mesa de CIMA
 *    da viga; no pilar, as duas mesas.
 * Nada inventado: peça sem perfil do catálogo, aço desconhecido, mecanismo,
 * barra solta — viram PROBLEMA com o que fazer, nunca número.
 *
 * Coordenadas e unidades: as do modelador (m, Y para cima), kN.
 * Teste: node tools/test-aco-livre.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mod() { return dep("AcoModelo", "./acomodelo.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Met() { return dep("BimMetal", "./metalpeca.js"); }
  function Cri() { return dep("MetalCriar", "./metalcriar.js"); }
  function Ana() { return dep("AcoAnalise", "./acoanalise.js"); }
  function Car() { return dep("AcoCargas", "./acocargas.js"); }
  function Ven() { return dep("AcoVento", "./acovento.js"); }
  function Iso() { return dep("AcoIsopletas", "./acoisopletas.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace(".", ","); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function dist(a, b) { return len(sub(a, b)); }
  function V(o) { return Array.isArray(o) ? [num(o[0], 0), num(o[1], 0), num(o[2], 0)] : null; }
  var UP = [0, 1, 0];
  var TOL = 0.01;                    /* 1 cm: pontas "no mesmo lugar" além da seção */
  var COS_PILAR = Math.cos(15 * Math.PI / 180);
  var EDICAO_6120 = "ABNT NBR 6120:2019";

  /* ================================================================ USOS — NBR 6120:2019, Tabela 10
   * Valores conferidos no PDF da biblioteca técnica da RA (OneDrive › BIBLIOTECA TÉCNICA - NORMAS › 01 Ações e
   * Segurança Estrutural), página IMPRESSA da norma em `pag`. `psi` = categoria do ψ (NBR 8800:2008, Tabela 2 —
   * a da NBR 8681): "Q-uso-a" sem predominância de equipamentos fixos nem elevada concentração de pessoas;
   * "Q-uso-b" com predominância de equipamentos fixos ou elevada concentração de pessoas; "Q-cobertura" bibliotecas,
   * arquivos, depósitos, oficinas, garagens e coberturas. A classificação do ψ por uso é DECISÃO do sistema
   * (marcada "conferir"): a Tabela 2 não lista os usos um a um. */
  var USOS = [
    { id: "escritorio", grupo: "Edifícios comerciais, corporativos e de escritórios", local: "Salas de uso geral e sanitários", q: 2.5, pag: 21, psi: "Q-uso-a" },
    { id: "escritorio-corredor", grupo: "Edifícios comerciais, corporativos e de escritórios", local: "Corredores de uso comum", q: 3, pag: 21, psi: "Q-uso-a" },
    { id: "callcenter", grupo: "Edifícios comerciais, corporativos e de escritórios", local: "Call center", q: 3, pag: 21, psi: "Q-uso-b" },
    { id: "arquivo-deslizante", grupo: "Edifícios comerciais, corporativos e de escritórios", local: "Regiões de arquivos deslizantes", q: 5, pag: 21, psi: "Q-cobertura" },
    { id: "industrial-adm", grupo: "Edificações industriais", local: "Salas administrativas", q: 2.5, pag: 21, psi: "Q-uso-a", nota: "Edificações industriais: as cargas devem ser validadas caso a caso, com os mínimos da Tabela 10 (nota s)." },
    { id: "industrial-corredor", grupo: "Edificações industriais", local: "Corredores", q: 3, pag: 21, psi: "Q-uso-a", nota: "Edificações industriais: validar caso a caso (nota s)." },
    { id: "industrial-refeitorio", grupo: "Edificações industriais", local: "Refeitórios", q: 3, pag: 21, psi: "Q-uso-b", nota: "Edificações industriais: validar caso a caso (nota s)." },
    { id: "industrial-producao", grupo: "Edificações industriais", local: "Áreas de produção, processos, manufatura etc.", q: null, pag: 21, psi: "Q-uso-b", nota: "A Tabela 10 remete a 6.8 (cargas em fábricas e armazéns): o valor é do projeto — informe a carga do equipamento/processo (do fabricante)." },
    { id: "deposito", grupo: "Depósitos de uso geral", local: "Depósito (validar caso a caso)", q: 7.5, pag: 20, psi: "Q-cobertura", estoque: { ate: 2.5, base: 7.5, porMetro: 3 }, nota: "7,5 kN/m² até 2,5 m de altura de estoque + 3 kN/m² por metro de estoque excedente (nota p: altura de estoque = pé-direito disponível para empilhar). Tráfego de empilhadeira: verificar 6.6.2 (nota q)." },
    { id: "deposito-mercadorias", grupo: "Depósitos de uso geral", local: "Locais sujeitos ao acúmulo de mercadorias, incluindo zonas de acesso", q: 7.5, pag: 20, psi: "Q-cobertura" },
    { id: "residencial", grupo: "Edifícios residenciais", local: "Dormitórios, sala, copa, cozinha, sanitários", q: 1.5, pag: 20, psi: "Q-uso-a" },
    { id: "residencial-servico", grupo: "Edifícios residenciais", local: "Despensa, área de serviço e lavanderia", q: 2, pag: 20, psi: "Q-uso-a" },
    { id: "residencial-comum", grupo: "Edifícios residenciais", local: "Corredores de uso comum; depósitos", q: 3, pag: 20, psi: "Q-uso-a" },
    { id: "loja", grupo: "Lojas, centros comerciais, shopping centers", local: "Circulações e lojas em geral", q: 4, pag: 24, psi: "Q-uso-b" },
    { id: "loja-mezanino", grupo: "Lojas, centros comerciais, shopping centers", local: "Mezanino metálico (apenas carga de uso)", q: 2, pag: 24, psi: "Q-uso-b" },
    { id: "loja-deposito", grupo: "Lojas, centros comerciais, shopping centers", local: "Depósitos", q: 5, pag: 24, psi: "Q-cobertura" },
    { id: "loja-adm", grupo: "Lojas, centros comerciais, shopping centers", local: "Salas administrativas", q: 2.5, pag: 24, psi: "Q-uso-a" },
    { id: "passarela-sem-publico", grupo: "Escadas e passarelas", local: "Sem acesso público", q: 2.5, pag: 21, psi: "Q-uso-a", nota: "Nota t: passarelas NÃO inseridas nas edificações não fazem parte do escopo da NBR 6120 — consultar a ABNT NBR 7188." },
    { id: "passarela-publico", grupo: "Escadas e passarelas", local: "Com acesso público", q: 3, pag: 21, psi: "Q-uso-b", nota: "Nota t: passarelas NÃO inseridas nas edificações não fazem parte do escopo da NBR 6120 — consultar a ABNT NBR 7188." },
    { id: "passarela-comercial", grupo: "Escadas e passarelas", local: "Edifícios comerciais, clubes, escritórios, bibliotecas", q: 3, pag: 21, psi: "Q-uso-a", nota: "Nota t: passarelas NÃO inseridas nas edificações → ABNT NBR 7188." },
    { id: "passarela-shopping", grupo: "Escadas e passarelas", local: "Cinemas, centros comerciais, shopping centers", q: 4, pag: 21, psi: "Q-uso-b", nota: "Nota t: passarelas NÃO inseridas nas edificações → ABNT NBR 7188." },
    { id: "area-tecnica", grupo: "Áreas técnicas", local: "Áreas técnicas em geral (fora da projeção dos equipamentos), exceto barrilete", q: 3, pag: 17, psi: "Q-uso-b", nota: "Áreas técnicas: validar caso a caso; o peso dos equipamentos é à parte (carga pontual ou permanente)." },
    { id: "forro-manutencao", grupo: "Edifícios residenciais", local: "Forro acessível apenas para manutenção e sem estoque de materiais", q: 0.1, pag: 20, psi: "Q-uso-a" },
    { id: "cobertura", grupo: "Coberturas", local: "Cobertura com acesso só para manutenção (NBR 6120:2019, 6.4)", q: null, pag: null, psi: "Q-cobertura", cobertura: true },
    { id: "outro", grupo: "Outro", local: "Valor informado pelo engenheiro", q: null, pag: null, psi: "Q-uso-b", informado: true }
  ];
  function usoDe(id) { for (var i = 0; i < USOS.length; i++) if (USOS[i].id === id) return USOS[i]; return null; }
  /* a sobrecarga de uma área: o valor da tabela (ou o informado) com o texto e a referência */
  function usoCarga(a) {
    a = a || {};
    var u = usoDe(a.uso) || usoDe("outro"), avisos = [], q = null, texto = "", ref = "";
    if (u.cobertura) {
      var C = Car(), s = C ? C.sobrecargaCobertura(num(a.inclinacaoPct, 3), { empocamentoVerificado: !!a.empocamentoVerificado }) : null;
      if (!s || !s.ok) return { ok: false, motivo: s ? s.motivo : "AcoCargas não carregado." };
      q = s.q; texto = s.texto; ref = s.referencia; avisos = avisos.concat(arr(s.avisos));
    } else if (u.informado || u.q == null) {
      q = num(a.qInformado, null);
      if (q == null || !(q >= 0)) return { ok: false, motivo: u.id === "outro" ? "Informe a sobrecarga de uso (kN/m²)." : "\"" + u.local + "\": " + (u.nota || "a Tabela 10 não dá o valor — informe a carga.") };
      texto = "q = " + br(q, 2) + " kN/m² informado pelo engenheiro" + (u.id !== "outro" ? " (" + u.grupo + " — " + u.local + ": " + (u.nota || "") + ")" : "");
      ref = u.pag ? EDICAO_6120 + ", Tabela 10 (p. " + u.pag + ")" : "valor do projeto";
    } else if (u.estoque) {
      var h = num(a.alturaEstoque, u.estoque.ate), ex = Math.max(0, h - u.estoque.ate);
      q = u.estoque.base + u.estoque.porMetro * ex;
      texto = u.grupo + " — " + u.local + ": q = " + br(u.estoque.base, 1) + " + " + br(u.estoque.porMetro, 0) + " × " + br(ex, 2) + " = " + br(q, 2) + " kN/m² (altura de estoque " + br(h, 2) + " m)";
      ref = EDICAO_6120 + ", Tabela 10 (p. " + u.pag + ")";
    } else {
      q = u.q; texto = u.grupo + " — " + u.local + ": q = " + br(q, q < 1 ? 2 : 1) + " kN/m²"; ref = EDICAO_6120 + ", Tabela 10 (p. " + u.pag + ")";
    }
    if (u.nota) avisos.push(u.nota);
    if (a.qInformado != null && !u.informado && u.q != null && num(a.qInformado, 0) > q) { q = num(a.qInformado, q); texto += " — adotado " + br(q, 2) + " kN/m² (informado, maior que o da norma)"; }
    return { ok: true, q: q, texto: texto, referencia: ref, psi: u.psi, uso: u, avisos: avisos,
             psiTexto: "ψ da categoria \"" + (Car() && Car().PSI[u.psi] ? Car().PSI[u.psi].nome : u.psi) + "\" (NBR 8800:2008, Tabela 2 — classificação do uso conferir)" };
  }
  /* permanentes de piso com fonte (o engenheiro soma os que usar) */
  var PERMANENTES = [
    { id: "chapa-aco", nome: "Chapa de aço (piso)", porEsp: 78.5, unidade: "mm", texto: "78,5 kN/m³ × espessura", ref: EDICAO_6120 + ", Tabela 1 (aço 77 a 78,5 kN/m³; adotado 78,5)" },
    { id: "concreto", nome: "Laje de concreto armado (espessura média)", porEsp: 25, unidade: "cm", texto: "25 kN/m³ × espessura", ref: EDICAO_6120 + ", Tabela 1 (concreto armado 25 kN/m³)" },
    { id: "rev-com-5", nome: "Revestimento de piso residencial/comercial 5 cm", valor: 1.0, ref: EDICAO_6120 + ", Tabela 4 (γ = 20 kN/m³)" },
    { id: "rev-com-7", nome: "Revestimento de piso residencial/comercial 7 cm", valor: 1.4, ref: EDICAO_6120 + ", Tabela 4 (γ = 20 kN/m³)" },
    { id: "rev-ind-5", nome: "Revestimento de piso industrial 5 cm", valor: 1.7, ref: EDICAO_6120 + ", Tabela 4 (γ = 34 kN/m³)" },
    { id: "rev-ind-7", nome: "Revestimento de piso industrial 7 cm", valor: 2.4, ref: EDICAO_6120 + ", Tabela 4 (γ = 34 kN/m³)" }
  ];
  /* categoria do γf dos permanentes de área (NBR 8800:2008, Tabela 1 — js/acocargas.js) */
  var CAT_G = { "G-industrializado": { id: "GI", nome: "Permanente — elementos industrializados (γ 1,35)" }, "G-insitu": { id: "GL", nome: "Permanente — industrializados com adições in loco (γ 1,40)" },
                "G-geral": { id: "GE", nome: "Permanente — elementos construtivos em geral e equipamentos (γ 1,50)" } };

  /* ================================================================ LER AS PEÇAS */
  function papelDe(papelBim, X, sec) {
    var p = String(papelBim || "");
    if (sec && sec.forma === "circ") return "diagonal";
    if (/contravent|diagonal|tirante|m[aã]o.?francesa/i.test(p)) return "diagonal";
    if (Math.abs(dot(X, UP)) >= COS_PILAR) return "pilar";
    if (/ter[cç]a|travessa/i.test(p)) return "terca";
    return "viga";
  }
  var PREF = { pilar: "P", viga: "V", terca: "T", diagonal: "D" };
  var PAPEL_CALC = { pilar: 1, viga: 1, terca: 1, diagonal: 1 };
  /* PÓRTICOS M4: I soldado por chapas (m na peça → mm no cálculo), na forma do AcoModelo.secaoDe */
  function secaoSoldada(pf) {
    var S = dep("AcoSecao", "./acosecao.js"); if (!S || !pf) return null;
    var d = num(pf.d, 0) * 1000, bf = num(pf.bf, 0) * 1000, tw = num(pf.tw, 0) * 1000, tf = num(pf.tf, 0) * 1000;
    var nome = String(pf.rotulo || pf.nome || ("PS " + Math.round(d) + " x " + Math.round(bf) + " x " + br(tw, 1) + " x " + br(tf, 1)));
    var cat = { nome: nome, forma: "I", d: d, bf: bf, tw: tw, tf: tf, r: 0, soldado: true };
    var p = S.dePerfil(cat, "I"); if (!p || !(p.A > 0)) return null;
    cat.massa = p.massa;
    return { nome: nome, mm: p, A: p.A * 1e-6, Iz: p.Ix * 1e-12, Iy: p.Iy * 1e-12, J: p.J * 1e-12, massa: p.massa, forma: "I", cat: cat, soldado: true };
  }
  var NOME_PAPEL = { pilar: "pilar", viga: "viga", terca: "terça", diagonal: "diagonal" };
  function tipoLig(papeis) {
    if (papeis["Chapa de topo"] || papeis["Chapa de extremidade"] || papeis["Chapa de mesa (superior)"] || papeis["Mata-junta (mesa superior)"]) return "rigida";   /* + talas de mesa e viga soldada (METÁLICA › L) */
    /* M2 (1.2.145): a cantoneira de topo da ligação SEMIRRÍGIDA é lida como nó rígido (o momento da ligação é o do cálculo; a rigidez não
       é calculada — dito no memorial); a chapa de cabeça (viga contínua sobre o pilar) rotula o pilar */
    if (papeis["Cantoneira de topo (momento)"]) return "rigida";
    if (papeis["Chapa de cabeça"]) return "rotulada";
    if (papeis["Tala da alma"] || papeis["Tala da mesa"]) return "continua";
    /* METÁLICA › L (14/10/2026, js/acoligsugere.js): chapa simples, chapa de topo curta e assentos (flexíveis) também rotulam */
    if (papeis["Cantoneira de ligação"] || papeis["Clip de terça"] || papeis["Chapa gusset"] || papeis["Gusset de nó"] || papeis["Chapa simples"] || papeis["Chapa de topo curta"] || papeis["Cantoneira de assento"] || papeis["Chapa de assento"]) return "rotulada";
    if (papeis["Placa de base"]) return "base";
    return null;
  }
  var NOME_LIG = { rigida: "chapa de extremidade/topo (rígida)", continua: "emenda por cobrejunta (contínua)", rotulada: "rotulada (cantoneira/clip/gusset)", base: "placa de base" };
  function ler(caixas, op) {
    op = op || {};
    var C = Cat(), Mo = Mod(), Mt = Mat(), BM = Met(), MC = Cri();
    var o = { ok: true, pecas: [], semPerfil: [], semAco: [], ignoradas: [], curtas: [], ligacoes: {}, avisos: [], estrutura: { aco: 0, outros: 0, semClasse: [], adotado: 0 }, naoVerificados: [], tipologias: [] };
    if (!C || !Mo || !Mt || !BM || !MC) { o.ok = false; o.motivo = "Motores não carregados (perfisaco, acomodelo, acomateriais, metalpeca, metalcriar)."; return o; }
    var so = null; if (arr(op.ids).length) { so = {}; op.ids.forEach(function (id) { so[String(id)] = 1; }); }
    function lig(id) { return o.ligacoes[id] || (o.ligacoes[id] = { id: id, papeis: {}, membros: {}, pecas: [] }); }
    arr(caixas).forEach(function (c) {
      /* FRENTE S5 (14/10/2026): pilar e viga de AÇO da aba Estrutura (js/bimarq.js pilarPerfil/vigaPerfil) também são barras
         (antes: "nenhuma barra de aço desenhada" — o Rogério desenhou pela Estrutura e o cálculo não via nada) */
      if (c && (c.tipo === "pilar" || c.tipo === "viga") && !c.metal) { lerEstrutura(c); return; }
      if (!c || c.tipo !== "metal" || !c.metal) return;
      var m = c.metal, id = String(c.id);
      if (m.lig) { var L0 = lig(String(m.lig)); L0.papeis[m.papel] = true; L0.pecas.push(id); if (m.soldadaEm != null) L0.membros[String(m.soldadaEm)] = true; if (c.ligInfo && c.ligInfo.tipologia) L0.tipologia = String(c.ligInfo.tipologia); if (c.ligInfo && c.ligInfo.entrada && !L0.entrada) L0.entrada = c.ligInfo.entrada;
        /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): a ligação lançada só pelo peso próprio (A CONFIRMAR, origem
           "lancar-viga") é PROVISÓRIA — não manda no nó: vale a escolha da tela (rotulada/rígida) e o cálculo confirma ou troca
           a ligação depois. Ela mandando, o joelho marcado rígido virava rótula e o pórtico, mecanismo (e2e da simulação) */
        if (c.ligInfo && c.ligInfo.aConfirmar && c.ligInfo.origem === "lancar-viga") L0.provisoria = true;
        return; }
      if (m.kind !== "perfil") { if (m.kind === "chapa" || m.kind === "mecanica") o.ignoradas.push({ id: id, nome: BM.nome(c), motivo: "não é barra (chapa/peça mecânica fora de ligação): não entra no modelo de barras" }); return; }
      arr(c.metalFuros).concat(arr(m.furos)).forEach(function (f) { if (f && f.lig != null) lig(String(f.lig)).membros[id] = true; });
      if (so && !so[id]) return;
      var nome = BM.nome(c), cat = m.perfil && m.perfil.cat, reg = cat ? C.obter(cat) : null;
      var sec = reg ? Mo.secaoDe(reg.nome) : null;
      /* PÓRTICOS M4 (14/10/2026, js/metalporticos.js): perfil I SOLDADO por chapas declarado pela peça (o degrau da mísula):
         d, bf, tw, tf explícitos → a seção pela geometria (js/acosecao.js perfilI, r = 0). Só com `soldadoCalc` — o perfil
         paramétrico comum continua "sem perfil do catálogo" */
      if (!reg && m.perfil && m.perfil.soldadoCalc) { var ss = secaoSoldada(m.perfil); if (ss) { sec = ss; reg = ss.cat; } }
      if (!sec || !sec.mm) { o.semPerfil.push({ id: id, nome: nome, perfil: cat || (m.perfil && m.perfil.forma) || "?", motivo: cat ? "perfil \"" + cat + "\" sem propriedades no catálogo" : "perfil paramétrico (sem nome do catálogo)" }); return; }
      var li = MC.linhaAtual(c), a = V(li.a), b = V(li.b), L = dist(a, b);
      if (!(L > 0.05)) { o.curtas.push({ id: id, nome: nome, L: L }); return; }
      var X = unit(sub(b, a)), q = BM.quadro(c), ey = V(q.Y);
      ey = unit(sub(ey, mul(X, dot(ey, X)))) || (Math.abs(X[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
      var ds = BM.secao(m.perfil) || {}, alt = num(ds.alt, 0.2), larg = num(ds.larg, 0.1);
      var aco = Mt.aco(m.aco);
      if (!aco) { o.semAco.push({ id: id, nome: nome, aco: m.aco || "(vazio)" }); return; }
      /* PÓRTICOS M4: a peça gerada pela tipologia declara o papel no cálculo (o montante da treliça é barra de nó
         articulado, não pilar), as ligações das pontas e a base — `metal.calc` (ver montar: condicao/apoioDe) */
      var calc = m.calc && typeof m.calc === "object" ? JSON.parse(JSON.stringify(m.calc)) : null;
      var papel = calc && PAPEL_CALC[calc.papel] ? calc.papel : papelDe(m.papel, X, sec);
      if (calc) {
        arr(calc.naoVerificado).forEach(function (nv) { if (nv && nv.tema && !o.naoVerificados.some(function (q) { return q.tema === nv.tema && q.motivo === nv.motivo; })) o.naoVerificados.push({ tema: String(nv.tema), motivo: String(nv.motivo || "") }); });
        if (calc.tipologia && o.tipologias.indexOf(String(calc.tipologia)) < 0) o.tipologias.push(String(calc.tipologia));
      }
      o.pecas.push({ id: id, nome: nome, cat: reg.nome, sec: sec, reg: reg, aco: { id: aco.id, fy: aco.fy, fu: aco.fu }, papelBim: m.papel, papel: papel,
                     a: a, b: b, L: L, X: X, ey: ey, ez: cross(X, ey), alt: alt, larg: larg, h: Math.max(alt, larg),
                     tracao: sec.forma === "circ" || !!(calc && calc.tracao), calc: calc });   /* PÓRTICOS M4: o X de cantoneira da tipologia, só tração */
    });
    function lerEstrutura(c) {
      var id = String(c.id), pf = c.perfil || {}, est = o.estrutura;
      if (c.material !== "aco") { est.outros++; return; }
      est.aco++;
      if (so && !so[id]) return;
      var nome = (c.nome || (c.tipo === "pilar" ? "Pilar" : "Viga")) + (pf.cat ? " " + pf.cat : "") + " (Estrutura)";
      var reg = pf.cat ? C.obter(pf.cat) : null, sec = reg ? Mo.secaoDe(reg.nome) : null;
      if (!sec || !sec.mm) { o.semPerfil.push({ id: id, nome: nome, perfil: pf.cat || pf.forma || "?", motivo: pf.cat ? "perfil \"" + pf.cat + "\" sem propriedades no catálogo" : "medidas digitadas na aba Estrutura (sem perfil do catálogo)", estrutura: true }); return; }
      var a, b, ey, th = num(c.rotY, 0), co = Math.cos(th), si = Math.sin(th);
      if (c.tipo === "pilar") {
        var H = num(c.altura, 0), y0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - H / 2, inc = c.estilo === "inclinado";
        a = [num(c.cx, 0), y0, num(c.cz, 0)]; b = [a[0] + (inc ? num(c.topoDx, 0) : 0), y0 + H, a[2] + (inc ? num(c.topoDz, 0) : 0)];
        ey = [si, 0, co];   /* a altura da seção (espessura da caixa) vai no z local do pilar */
      } else {
        var Lh = num(c.comprimento, 0), topo = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
        a = [num(c.cx, 0) - co * Lh / 2, topo + num(c.dIni, 0), num(c.cz, 0) + si * Lh / 2]; b = [num(c.cx, 0) + co * Lh / 2, topo + num(c.dFim, 0), num(c.cz, 0) - si * Lh / 2];
        ey = UP;
      }
      var L = dist(a, b); if (!(L > 0.05)) { o.curtas.push({ id: id, nome: nome, L: L }); return; }
      var X = unit(sub(b, a)); ey = unit(sub(ey, mul(X, dot(ey, X)))) || (Math.abs(X[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
      var acoId = c.aco || op.acoEstrutura || null, aco = acoId ? Mt.aco(acoId) : null;
      if (!aco) { o.semAco.push({ id: id, nome: nome, aco: acoId || "(a aba Estrutura não guarda a classe do aço)", estrutura: true }); est.semClasse.push(id); return; }
      if (!c.aco) est.adotado++;   /* REVISÃO S5 M2: a classe veio da escolha do engenheiro (premissa → decisão no memorial) */
      var ds = BM.secao(C.paraPerfil ? C.paraPerfil(reg.nome) : pf) || {}, alt = num(ds.alt, num(c.tipo === "pilar" ? c.espessura : c.altura, 0.2)), larg = num(ds.larg, num(c.tipo === "pilar" ? c.comprimento : c.espessura, 0.1));
      var papel = papelDe(c.tipo === "pilar" ? "Pilar" : "Viga", X, sec);
      o.pecas.push({ id: id, nome: nome, cat: reg.nome, sec: sec, reg: reg, aco: { id: aco.id, fy: aco.fy, fu: aco.fu }, papelBim: c.tipo === "pilar" ? "Pilar" : "Viga", papel: papel,
                     a: a, b: b, L: L, X: X, ey: ey, ez: cross(X, ey), alt: alt, larg: larg, h: Math.max(alt, larg), tracao: sec.forma === "circ", origem: "estrutura" });
    }
    if (o.estrutura.outros) o.avisos.push(o.estrutura.outros + " pilar(es)/viga(s) de concreto ou madeira da aba Estrutura não entram no cálculo de aço.");
    Object.keys(o.ligacoes).forEach(function (k) { var L1 = o.ligacoes[k]; L1.tipo = tipoLig(L1.papeis); L1.membros = Object.keys(L1.membros); });
    if (o.semPerfil.length || o.semAco.length) o.ok = false;
    /* nomes curtos e estáveis: P1, V1, T1, D1 — na ordem do modelo */
    var cont = {}; o.pecas.forEach(function (p) { cont[p.papel] = (cont[p.papel] || 0) + 1; p.mid = PREF[p.papel] + cont[p.papel]; });
    return o;
  }

  /* ================================================================ MONTAR
   * op = { bases: {pecaId: "rotulada"|"engastada"}, basePadrao, apoios: {"pecaId:ini|fim": "fixo"|"movel"|"engaste"},
   *        ligacoes: {"pecaId:ini|fim": "rigida"|"rotulada"}, vigaPilarX / vigaPilarY ("rotulada"|"rigida"|"auto": a viga × pilar
   *        pela direção da viga na planta — X do mundo / Y da planta = Z do mundo), vigaPilar (chamadas antigas: vale para as duas), vigaViga,
   *        pontos: [{peca, s}] (cargas pontuais: o ponto vira nó), acrescimo }
   */
  function projSeg(P, a, X, L) { var t = dot(sub(P, a), X); var tc = Math.max(0, Math.min(L, t)); return { t: t, tc: tc, d: dist(P, add(a, mul(X, tc))) }; }
  /* menor distância entre dois segmentos (s, t ao longo de cada um) */
  function segSeg(p, q) {
    var d1 = mul(p.X, p.L), d2 = mul(q.X, q.L), r = sub(p.a, q.a), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b, s, t;
    if (den < 1e-12 * a * e) return null;   /* paralelos */
    s = Math.max(0, Math.min(1, (b * f - c * e) / den)); t = (b * s + f) / e;
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    var P = add(p.a, mul(d1, s)), Q = add(q.a, mul(d2, t));
    return { s: s * p.L, t: t * q.L, d: dist(P, Q), P: P, Q: Q };
  }
  var PRIO = { pilar: 4, viga: 3, terca: 2, diagonal: 1 };
  function prioridade(p) { return PRIO[p.papel] * 10 + p.alt; }

  /* REVISÃO C4 (14/10/2026): onde fica a carga pontual na peça de HOJE.
   * pt.P = o ponto no espaço e pt.ref = {a, b} a linha da peça QUANDO a carga foi lançada (a tela guarda os dois).
   * · a peça está na MESMA reta (só encurtou/alongou pela ligação, ou a linha de cálculo passou do topo ao eixo — afastamento
   *   paralelo dentro da seção): a carga fica no ponto do espaço (a ligação que recua a ponta não a leva junto);
   * · a peça MUDOU DE LUGAR (Mover, girar, outra reta): a carga acompanha a peça na mesma FRAÇÃO do comprimento, com aviso;
   * · sem ref: vale o "s" do início (vazio = meio da peça), como sempre foi.
   * Achado da revisão: o pórtico movido 10 m levava a carga para o nó do pilar e aprovava (M na viga 0,04 × 16,47 kN·m). */
  function posicaoPontual(pt, p) {
    var P0 = Array.isArray(pt.P) ? V(pt.P) : null, ref = pt.ref && Array.isArray(pt.ref.a) && Array.isArray(pt.ref.b) ? { a: V(pt.ref.a), b: V(pt.ref.b) } : null;
    var sInf = pt.s == null || pt.s === "" ? null : num(pt.s, null);
    if (P0 && ref) {
      var D0 = sub(ref.b, ref.a), L0 = len(D0); if (!(L0 > 1e-6)) return sInf != null ? sInf : p.L / 2;
      var X0 = mul(D0, 1 / L0), t0 = dot(sub(P0, ref.a), X0), paralela = Math.abs(dot(p.X, X0)) > 0.9999;
      function afast(Q) { var d = sub(Q, ref.a); return len(sub(d, mul(X0, dot(d, X0)))); }
      /* mesma peça no mesmo lugar: mesma reta (afastamento dentro da seção) e cada ponta andou no máximo 0,6 m (o recuo de
         uma ligação) — deslizar a peça ao longo da própria reta (Mover) NÃO é isso */
      var mesmoSent = dot(p.X, X0) >= 0, ea = mesmoSent ? ref.a : ref.b, eb = mesmoSent ? ref.b : ref.a;
      if (paralela && afast(p.a) <= 0.5 * p.h + 0.01 && afast(p.b) <= 0.5 * p.h + 0.01 && dist(p.a, ea) <= 0.6 + 0.5 * p.h && dist(p.b, eb) <= 0.6 + 0.5 * p.h) return projSeg(P0, p.a, p.X, p.L).t;
      var f = t0 / L0, sN = dot(p.X, X0) >= 0 ? f * p.L : (1 - f) * p.L;
      avisosPontual.push("Carga pontual \"" + (pt.nome || "") + "\": a peça " + p.mid + " mudou de lugar desde que a carga foi lançada — a carga a acompanhou na mesma fração do comprimento (" + br(f * 100, 1) + " %, " + br(sN, 2) + " m do início); confira a posição.");
      return sN;
    }
    return sInf != null ? sInf : p.L / 2;
  }
  var avisosPontual = [];
  /* #49 c) chave do travamento por conectividade — false só no controle negativo dos testes */
  var OPC_TRAV = { pendular: true };
  /* #49 e) chave das linhas de corrente no eixo fraco da verificação local — false só no controle negativo dos testes */
  var OPC_COR = { correntes: true, sentido: true };
  /* teste de mecanismo: tirante sem par fora e o fator do deslocamento (OPC_EST.semPar = false / fator = 100 só nos controles) */
  /* fator 100 × a diagonal (o de antes): 0,1 × (pedido do revisor) marcou como mecanismo estruturas que fecham (o pilar livre de
     8 m do test-metal-lig-auto [14], a mão-francesa do test-metal-mecanismo-resolver, as simulações do mezanino/pórtico); o
     treliçado sem contraventamento volta a ser mecanismo só por tirar o tirante sem par (u ≈ 3,7·10⁹ contra 1 670) */
  var OPC_EST = { semPar: true, fator: 100 };
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function montar(lido, op) {
    op = op || {};
    var Mt = Mat(), E = Mt ? Mt.CONST.E * 1000 : 2e8, G = Mt ? Mt.CONST.G * 1000 : 7.7e7;
    var pecas = lido.pecas, decisoes = [], avisos = [], problemas = [];
    var n = pecas.length;
    /* ---------- 1. pontas que se tocam */
    var ends = []; pecas.forEach(function (p, ip) { ends.push({ P: p.a, ip: ip, lado: "ini" }, { P: p.b, ip: ip, lado: "fim" }); });
    var pai = ends.map(function (e, i) { return i; });
    function raiz(i) { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; }
    function unir(a, b) { a = raiz(a); b = raiz(b); if (a !== b) pai[Math.max(a, b)] = Math.min(a, b); }
    function tolPar(i, j) { return TOL + 0.5 * (pecas[i].h + pecas[j].h); }
    for (var i = 0; i < ends.length; i++) for (var j = i + 1; j < ends.length; j++) {
      if (ends[i].ip === ends[j].ip) continue;
      if (dist(ends[i].P, ends[j].P) <= tolPar(ends[i].ip, ends[j].ip)) unir(i, j);
    }
    /* ---------- 2. grupos de pontas e o que passa por eles (ponta no meio de outra peça); ponta perto da ponta de outra
       peça (pela tolerância desta peça) também se une — repete até estabilizar */
    var grupos = null;
    function agrupar() {
      var g = {}, lista = [];
      ends.forEach(function (e, k) { var r = raiz(k); if (!g[r]) { g[r] = { ends: [], passa: [] }; lista.push(g[r]); } g[r].ends.push(k); });
      lista.forEach(function (gr) {
        var c = [0, 0, 0], h = 0; gr.ends.forEach(function (k) { c = add(c, ends[k].P); h = Math.max(h, pecas[ends[k].ip].h); });
        gr.c = mul(c, 1 / gr.ends.length); gr.h = h; gr.ips = {}; gr.ends.forEach(function (k) { gr.ips[ends[k].ip] = true; });
      });
      return lista;
    }
    for (var rod = 0; rod < 4; rod++) {
      grupos = agrupar();
      var uniu = false;
      grupos.forEach(function (gr) {
        for (var ip = 0; ip < n; ip++) {
          if (gr.ips[ip]) continue;
          var p = pecas[ip], pr = projSeg(gr.c, p.a, p.X, p.L), tol = TOL + 0.5 * (p.h + gr.h), delta = TOL + 0.5 * gr.h;
          if (pr.d > tol) continue;
          if (pr.tc <= delta || pr.tc >= p.L - delta) { var k2 = pr.tc <= delta ? 2 * ip : 2 * ip + 1; if (dist(ends[k2].P, gr.c) <= tol + delta) { unir(gr.ends[0], k2); uniu = true; } }
        }
      });
      if (!uniu) break;
    }
    /* SIMULAÇÃO S2 (14/10/2026): a ponta de DIAGONAL que a ligação desenhada recuou (chapa de apoio da barra redonda,
       gusset) fica solta, a até 60 cm do nó, NA LINHA da diagonal: ela volta ao nó para onde aponta (a ligação leva a força
       até lá). Sem isso, o "calcular de novo" depois das ligações dava barra solta. */
    grupos = agrupar();
    var nRecuo = 0, recuoMax = 0;
    grupos.forEach(function (gr) {
      if (gr.ends.length !== 1) return;
      var k0 = gr.ends[0], e0 = ends[k0], p0 = pecas[e0.ip]; if (p0.papel !== "diagonal") return;
      var sai = e0.lado === "ini" ? mul(p0.X, -1) : p0.X, melhor = null;
      grupos.forEach(function (g2) {
        if (g2 === gr || g2.ips[e0.ip]) return;
        var v = sub(g2.c, e0.P), al = dot(v, sai), pp = len(sub(v, mul(sai, al)));
        if (al > 0 && al <= 0.6 && pp <= TOL + 0.5 * g2.h + 0.02 && (!melhor || al < melhor.al)) melhor = { g: g2, al: al };
      });
      if (melhor) { unir(k0, melhor.g.ends[0]); nRecuo++; recuoMax = Math.max(recuoMax, melhor.al); }
    });
    if (nRecuo) { grupos = agrupar(); decisoes.push({ tema: "Diagonais recuadas", decisao: nRecuo + " ponta(s) de diagonal recuada(s) pela ligação desenhada (até " + br(recuoMax * 1000, 0) + " mm) ligadas ao nó para onde apontam", motivo: "a chapa de apoio/gusset leva a força da diagonal até o nó; a diagonal continua articulada nas pontas" }); }
    grupos.forEach(function (gr) {
      for (var ip = 0; ip < n; ip++) {
        if (gr.ips[ip]) continue;
        var p = pecas[ip], pr = projSeg(gr.c, p.a, p.X, p.L), tol = TOL + 0.5 * (p.h + gr.h), delta = TOL + 0.5 * gr.h;
        if (pr.d <= tol && pr.tc > delta && pr.tc < p.L - delta) gr.passa.push({ ip: ip, t: pr.tc, d: pr.d });
      }
    });
    /* ---------- 3. cruzamentos (vigas, pilares, terças — diagonais e tirantes ficam soltos no cruzamento do X) */
    var nCruz = 0;
    for (var a1 = 0; a1 < n; a1++) for (var b1 = a1 + 1; b1 < n; b1++) {
      var p1 = pecas[a1], p2 = pecas[b1];
      if (p1.papel === "diagonal" || p2.papel === "diagonal") continue;
      var ss = segSeg(p1, p2); if (!ss) continue;
      var tol2 = TOL + 0.5 * (p1.h + p2.h), d1 = TOL + 0.5 * p2.h, d2 = TOL + 0.5 * p1.h;
      if (ss.d > tol2 || ss.s <= d1 || ss.s >= p1.L - d1 || ss.t <= d2 || ss.t >= p2.L - d2) continue;
      /* já ligados por um grupo de pontas? (ponta de uma no meio da outra já foi tratada) */
      var ja = grupos.some(function (gr) { return gr.passa.some(function (x) { return x.ip === a1; }) && gr.passa.some(function (x) { return x.ip === b1; }); });
      if (ja) continue;
      grupos.push({ ends: [], passa: [{ ip: a1, t: ss.s, d: 0 }, { ip: b1, t: ss.t, d: ss.d }], c: mul(add(ss.P, ss.Q), 0.5), h: Math.max(p1.h, p2.h), ips: {}, cruz: true });
      nCruz++;
    }
    if (nCruz) decisoes.push({ tema: "Cruzamentos", decisao: nCruz + " cruzamento(s) de vigas/pilares viraram nó (as peças continuam contínuas e ficam ligadas ali)", motivo: "as linhas de cálculo se cruzam dentro da seção das peças — elas se tocam; se uma passa por baixo da outra sem ligação, afaste as peças no modelo" });
    avisosPontual = [];
    /* ---------- 4. pontos de carga pontual viram nó */
    arr(op.pontos).forEach(function (pt) {
      var ip = -1; for (var q = 0; q < n; q++) if (pecas[q].id === String(pt.peca)) ip = q;
      if (ip < 0) return;
      /* SIMULAÇÃO S1 (14/10/2026): a carga guardada com o PONTO no espaço (pt.P) fica nele mesmo quando a ligação
         encurta a peça (a ponta recua até a chapa) — antes, "s = 2,5 m do início" andava 142 mm junto com a ponta */
      var p = pecas[ip], s0 = posicaoPontual(pt, p);
      var s = Math.max(0, Math.min(p.L, s0)), P = add(p.a, mul(p.X, s));
      if (s0 < -0.005 || s0 > p.L + 0.005) avisos.push("Carga pontual \"" + (pt.nome || "") + "\": a posição (" + br(s0, 2) + " m do início) cai fora da peça " + p.mid + " (" + br(p.L, 2) + " m) — foi levada à ponta; confira.");
      /* perto de um nó existente desta peça: usa o nó */
      var achou = grupos.filter(function (gr) { return (gr.ips[ip] || gr.passa.some(function (x) { return x.ip === ip; })) && dist(gr.c, P) <= TOL + 0.5 * p.h; })[0];
      if (achou) { pt._grupo = achou; return; }
      var gnovo = { ends: [], passa: [{ ip: ip, t: s, d: 0 }], c: P, h: p.h, ips: {}, carga: true };
      grupos.push(gnovo); pt._grupo = gnovo;
    });
    avisosPontual.forEach(function (x) { if (avisos.indexOf(x) < 0) avisos.push(x); });
    /* ---------- 5. posição de cada nó: o hospedeiro (peça contínua por ele) ou a peça de maior prioridade */
    var ajusteMax = 0, nAjuste = 0;
    grupos.forEach(function (gr) {
      var host = null;
      gr.passa.forEach(function (x) { if (!host || prioridade(pecas[x.ip]) > prioridade(pecas[host.ip])) host = x; });
      var pos;
      if (host) { var hp = pecas[host.ip]; pos = add(hp.a, mul(hp.X, host.t)); }
      else {
        /* FRENTE S5 (14/10/2026): `best === null` — com `!best`, a ponta de índice 0 (a 1ª peça do modelo) perdia para
           qualquer outra do grupo: a base do P1 ia para a ponta recuada da diagonal (119 mm, 71 mm acima) e o cálculo de
           novo depois do "Ligar todos os nós" dava mecanismo (e2e S5) */
        var best = null; gr.ends.forEach(function (k) { if (best === null || prioridade(pecas[ends[k].ip]) > prioridade(pecas[ends[best].ip])) best = k; });
        pos = ends[best].P.slice();
      }
      gr.pos = [r6(pos[0]), r6(pos[1]), r6(pos[2])];
      gr.host = host;
    });
    /* SIMULAÇÃO S1 (14/10/2026): o ponto no MEIO de uma peça vai para a reta entre os nós das PONTAS dela. Quando as
       pontas foram levadas a outro nó (a viga que a ligação recuou e cuja linha passou ao eixo do perfil: 155 mm abaixo
       do topo do pilar), o nó do meio ficava na linha antiga e a viga virava um "V" (achado na simulação do pórtico) */
    function grupoPonta(ip, lado) { var k = 2 * ip + (lado === "fim" ? 1 : 0); for (var q = 0; q < grupos.length; q++) if (grupos[q].ends.indexOf(k) >= 0) return grupos[q]; return null; }
    for (var pas = 0; pas < 2; pas++) grupos.forEach(function (gr) {
      if (!gr.host) return;
      var hp = pecas[gr.host.ip], gi = grupoPonta(gr.host.ip, "ini"), gf = grupoPonta(gr.host.ip, "fim"); if (!gi || !gf) return;
      var A0 = gi.pos, B0 = gf.pos, D = sub(B0, A0), LL = dot(D, D); if (!(LL > 1e-12)) return;
      if (dist(A0, hp.a) < 1e-6 && dist(B0, hp.b) < 1e-6) return;   /* pontas no lugar: nada muda */
      var Q = add(hp.a, mul(hp.X, gr.host.t)), t = Math.max(0, Math.min(1, dot(sub(Q, A0), D) / LL)), np = add(A0, mul(D, t));
      gr.pos = [r6(np[0]), r6(np[1]), r6(np[2])];
    });
    grupos.forEach(function (gr) {
      gr.ends.forEach(function (k) { var d = dist(ends[k].P, gr.pos); if (d > 1e-4) { nAjuste++; ajusteMax = Math.max(ajusteMax, d); } });
      gr.passa.forEach(function (x) { if (x.d > 1e-4) { nAjuste++; ajusteMax = Math.max(ajusteMax, x.d); } });
      if (gr.host && gr.host.d <= 1e-4) { var dh = dist(add(pecas[gr.host.ip].a, mul(pecas[gr.host.ip].X, gr.host.t)), gr.pos); if (dh > 1e-4) { nAjuste++; ajusteMax = Math.max(ajusteMax, dh); } }
    });
    if (nAjuste) decisoes.push({ tema: "Nós", decisao: nAjuste + " ponta(s) de peça levadas ao nó vizinho (maior afastamento " + br(ajusteMax * 1000, 0) + " mm)", motivo: "as peças se tocam (afastamento menor que 1 cm + metade das seções): a ligação é tratada no eixo, sem a excentricidade do detalhe" });
    /* ids dos nós: de baixo para cima, depois x e z */
    grupos.sort(function (a, b) { return (a.pos[1] - b.pos[1]) || (a.pos[0] - b.pos[0]) || (a.pos[2] - b.pos[2]); });
    var nos = [], noInfo = {};
    grupos.forEach(function (gr, k) {
      gr.id = "N" + (k + 1);
      nos.push({ id: gr.id, x: gr.pos[0], y: gr.pos[1], z: gr.pos[2] });
      noInfo[gr.id] = { id: gr.id, P: gr.pos, ends: gr.ends.map(function (q) { return { ip: ends[q].ip, lado: ends[q].lado }; }), passa: gr.passa.map(function (x) { return x.ip; }) };
    });
    function grupoDaPonta(ip, lado) { var k = 2 * ip + (lado === "fim" ? 1 : 0); for (var q = 0; q < grupos.length; q++) if (grupos[q].ends.indexOf(k) >= 0) return grupos[q]; return null; }
    arr(op.pontos).forEach(function (pt) { if (pt._grupo) { pt.no = pt._grupo.id; delete pt._grupo; } });

    /* ---------- 6. pontos de cada peça (pontas + o que passa) e as barras */
    var pontosPeca = pecas.map(function () { return []; });
    pecas.forEach(function (p, ip) {
      var gi = grupoDaPonta(ip, "ini"), gf = grupoDaPonta(ip, "fim");
      pontosPeca[ip].push({ s: 0, no: gi.id, ponta: "ini" }, { s: p.L, no: gf.id, ponta: "fim" });
    });
    grupos.forEach(function (gr) { gr.passa.forEach(function (x) { pontosPeca[x.ip].push({ s: x.t, no: gr.id }); }); });
    var barras = [], membros = [], apoios = [], porNo = {};
    function infoNo(id) { return noInfo[id]; }
    function papelNo(id, exceto) {   /* o que há no nó, sem a peça `exceto` */
      var I = noInfo[id], o = { pilar: 0, pilarPassa: 0, viga: 0, vigaPassa: 0, terca: 0, diagonal: 0, ips: [] };
      I.ends.forEach(function (e) { if (e.ip === exceto) return; var pp = pecas[e.ip].papel; o[pp]++; o.ips.push(e.ip); });
      I.passa.forEach(function (ip) { if (ip === exceto) return; var pp = pecas[ip].papel; if (pp === "pilar") o.pilarPassa++; else if (pp === "viga" || pp === "terca") o.vigaPassa++; else o[pp]++; o.ips.push(ip); });
      return o;
    }
    /* ligação desenhada entre esta peça e outra presente no nó */
    function ligDesenhada(ip, noId) {
      var p = pecas[ip], outros = papelNo(noId, ip).ips.map(function (q) { return pecas[q].id; }), achou = null;
      Object.keys(lido.ligacoes || {}).forEach(function (k) {
        var L1 = lido.ligacoes[k]; if (!L1.tipo || L1.tipo === "base" || L1.provisoria) return;
        if (L1.membros.indexOf(p.id) < 0) return;
        if (!L1.membros.some(function (mid) { return outros.indexOf(mid) >= 0; })) return;
        if (!achou || L1.tipo === "rigida" || L1.tipo === "continua") achou = L1;
      });
      return achou;
    }
    /* #51 (15/10/2026, pedido do Rogério): a ligação viga × pilar SEM desenho POR DIREÇÃO da viga na planta (X = x do mundo; Y = Y
       da planta = z do mundo; a viga até 15° do eixo segue o eixo; mais oblíqua que isso não tem direção clara e fica ROTULADA, salvo
       quando X e Y têm a mesma escolha). "auto": o PLANO DO PÓRTICO identificado pela
       geometria fica rígido e a outra direção rotulada (no galpão: rígida no plano do pórtico, rotulada na longitudinal — o X do
       contraventamento segura); sem identificar com segurança, as duas rotuladas (como antes) e a decisão diz por quê.
       Ordem: "Ponta a ponta" (op.ligacoes) > ligação desenhada > tipologia > esta escolha. vigaPilar único (estado/chamada antiga)
       vale para as duas direções. */
    function dirPlanta(X) { return Math.abs(X[0]) >= Math.abs(X[2]) ? "X" : "Y"; }
    /* direção CLARA: até 15° do eixo (revisão 1.2.149 — antes 26,6°, a viga a 24° virava "X") */
    var TAN15 = Math.tan(15 * Math.PI / 180);
    function dirClara(X) { var ax = Math.abs(X[0]), az = Math.abs(X[2]); if (Math.max(ax, az) < 1e-6) return null; return Math.min(ax, az) <= TAN15 * Math.max(ax, az) + 1e-12 ? dirPlanta(X) : null; }
    function angEixo(X) { var ax = Math.abs(X[0]), az = Math.abs(X[2]); return Math.atan2(Math.min(ax, az), Math.max(ax, az)) * 180 / Math.PI; }
    /* o PÓRTICO: o plano vertical (z constante para a direção X; x constante para a Y) cujas vigas vão de pilar a pilar — juntas tocam
       2 ou mais pilares diferentes (as duas águas tocam um pilar cada) */
    function coordPlano(ip, d) { var p = pecas[ip]; return Math.round((d === "X" ? p.a[2] + p.b[2] : p.a[0] + p.b[0]) / 2 * 20) / 20; }
    function pilaresDe(ip) { var s = {}; pontosPeca[ip].forEach(function (q) { var I = noInfo[q.no]; if (!I) return; I.ends.forEach(function (e) { if (e.ip !== ip && pecas[e.ip].papel === "pilar") s[e.ip] = 1; }); I.passa.forEach(function (x) { if (x !== ip && pecas[x].papel === "pilar") s[x] = 1; }); }); return s; }
    function porticos(lista, d) { var pl = {}; lista.forEach(function (ip) { var c = coordPlano(ip, d), o = pl[c] || (pl[c] = {}); Object.keys(pilaresDe(ip)).forEach(function (k) { o[k] = 1; }); }); return Object.keys(pl).filter(function (c) { return Object.keys(pl[c]).length >= 2; }); }
    function planoPortico() {
      var vigas = []; pecas.forEach(function (p, ip) { if (p.papel === "viga" && !/^Longarina/i.test(String(p.papelBim || ""))) vigas.push(ip); });
      if (!vigas.length) return { plano: null, motivo: "não há vigas no modelo" };
      /* 1) cobertura INCLINADA (caimento de 1 % a 50 %) — revisão 1.2.149: UMA viga inclinada (marquise, rampa) não decide a estrutura;
         vale a direção com 2 ou mais PÓRTICOS paralelos de vigas inclinadas (de pilar a pilar) OU em que as inclinadas são a MAIORIA
         das vigas da direção (com pelo menos um pórtico); só uma direção pode atender */
      var incl = vigas.filter(function (ip) { var s0 = Math.abs(pecas[ip].X[1]); return s0 >= 0.01 && s0 <= 0.5; }), notaIncl = "";
      if (incl.length) {
        var porD = { X: [], Y: [] }, todD = { X: 0, Y: 0 }, nObl = 0;
        incl.forEach(function (ip) { var d = dirClara(pecas[ip].X); if (d) porD[d].push(ip); else nObl++; });
        vigas.forEach(function (ip) { var d = dirClara(pecas[ip].X); if (d) todD[d]++; });
        var atende = ["X", "Y"].filter(function (d) { var np = porticos(porD[d], d).length; return np >= 2 || (np >= 1 && porD[d].length > todD[d] / 2); });
        if (atende.length === 2) return { plano: null, motivo: "pórticos de vigas inclinadas nas DUAS direções (telhado de várias águas) — não dá para saber o plano do pórtico" };
        if (atende.length === 1) { var dc = atende[0], npc = porticos(porD[dc], dc).length; return { plano: dc, motivo: npc + " pórtico(s) de vigas de cobertura inclinadas na direção " + dc + " (" + porD[dc].length + " viga(s), de pilar a pilar): o caimento do telhado fica no plano do pórtico", criterio: "cobertura" }; }
        notaIncl = incl.length + " viga(s) inclinada(s) que não formam pórticos repetidos (marquise, rampa ou peça isolada)" + (nObl ? ", " + nObl + " oblíqua(s)" : "") + " — não decidem; ";
      }
      /* 2) sem caimento: o MAIOR VÃO viga × pilar — só com 2 ou mais PÓRTICOS REPETIDOS (planos paralelos) com vão de pelo menos o dobro
         do maior vão da outra direção */
      var vao = { X: 0, Y: 0 }, vaoPl = { X: {}, Y: {} };
      vigas.forEach(function (ip) {
        var d = dirClara(pecas[ip].X); if (!d) return;
        var pts = pontosPeca[ip].slice().sort(function (a, b) { return a.s - b.s; }), sPil = [], c = coordPlano(ip, d);
        pts.forEach(function (q) { var o0 = papelNo(q.no, ip); if (o0.pilar || o0.pilarPassa) sPil.push(q.s); });
        for (var k0 = 0; k0 + 1 < sPil.length; k0++) { var vk = sPil[k0 + 1] - sPil[k0]; vao[d] = Math.max(vao[d], vk); vaoPl[d][c] = Math.max(vaoPl[d][c] || 0, vk); }
      });
      if (!vao.X && !vao.Y) return { plano: null, motivo: notaIncl + "nenhuma viga entre dois pilares — não dá para saber o plano do pórtico" };
      var dm = vao.X >= vao.Y ? "X" : "Y", dn = dm === "X" ? "Y" : "X", nRep = Object.keys(vaoPl[dm]).filter(function (c) { return vaoPl[dm][c] >= 2 * vao[dn] - 1e-9; }).length;
      if (vao[dm] >= 2 * vao[dn] && nRep >= 2) return { plano: dm, motivo: notaIncl + nRep + " pórticos repetidos na direção " + dm + " com vão viga × pilar de " + br(vao[dm], 2) + " m" + (vao[dn] ? ", pelo menos o dobro do vão em " + dn + " (" + br(vao[dn], 2) + " m)" : ""), criterio: "vao" };
      if (vao[dm] >= 2 * vao[dn]) return { plano: null, motivo: notaIncl + "vão maior na direção " + dm + " (" + br(vao[dm], 2) + " m) mas só " + nRep + " pórtico — sem pórticos repetidos não dá para saber o plano do pórtico" };
      return { plano: null, motivo: notaIncl + "vãos viga × pilar parecidos nas duas direções (X " + br(vao.X, 2) + " m, Y " + br(vao.Y, 2) + " m) — não dá para saber o plano do pórtico" };
    }
    function ligVal(v) { return v === "rigida" || v === "rotulada" || v === "auto" ? v : null; }
    var vpAnt = ligVal(op.vigaPilar), vpEsc = { X: ligVal(op.vigaPilarX) || vpAnt, Y: ligVal(op.vigaPilarY) || vpAnt };
    var autoPl = vpEsc.X === "auto" || vpEsc.Y === "auto" ? planoPortico() : null;
    function resolveDir(d) {
      var v = vpEsc[d];
      if (!v) return { tipo: "rotulada", origem: "padrao", txt: "rotulada (padrão)" };
      if (v !== "auto") return { tipo: v, origem: "escolha", txt: (v === "rigida" ? "rígida" : "rotulada") + " (escolha)" };
      if (autoPl.plano) return autoPl.plano === d ? { tipo: "rigida", origem: "auto", txt: "rígida (automático: plano do pórtico)" } : { tipo: "rotulada", origem: "auto", txt: "rotulada (automático: fora do plano do pórtico)" };
      return { tipo: "rotulada", origem: "auto-sem-plano", txt: "rotulada (automático: plano do pórtico não identificado)" };
    }
    var ligDir = { X: resolveDir("X"), Y: resolveDir("Y"), auto: autoPl };
    var ligPadrao = { vigaPilar: ligDir.X.tipo === ligDir.Y.tipo ? ligDir.X.tipo : "X " + ligDir.X.tipo + " / Y " + ligDir.Y.tipo, vigaPilarX: ligDir.X.tipo, vigaPilarY: ligDir.Y.tipo, vigaViga: op.vigaViga === "rigida" ? "rigida" : "rotulada" };
    var contDir = { X: 0, Y: 0, obl: 0 }, angObl = 0;
    var tipoObl = ligDir.X.tipo === ligDir.Y.tipo ? ligDir.X.tipo : "rotulada";
    var condPontas = {};   /* "ip:lado" → { tipo, motivo } */
    var contagem = { rigida: 0, rotulada: 0, continua: 0, livre: 0, apoio: 0, desenhada: 0, emenda: 0, tipologia: 0 };
    function condicao(ip, lado, noId) {
      var p = pecas[ip], chave = p.id + ":" + lado, o = papelNo(noId, ip), forc = (op.ligacoes || {})[chave], des = ligDesenhada(ip, noId);
      var nada = !o.ips.length;
      if (nada) return { tipo: "livre", motivo: "ponta livre" };
      if (p.papel === "diagonal") return { tipo: "rotulada", motivo: "diagonal: articulada nas pontas" };
      if (forc === "rigida" || forc === "rotulada") return { tipo: forc, motivo: "escolha do engenheiro", escolha: true };
      /* FRENTE S5 (14/10/2026): a ligação ROTULADA desenhada (chapa simples, cantoneira, clip) solta a ponta da VIGA, não o
         pilar que a recebe — antes o topo do pilar também virava rótula e, com todas as peças do nó rotuladas, a rotação
         do nó ficava solta: "mecanismo no nó, rz" ao calcular de novo depois do "Ligar todos os nós" (e2e S5) */
      if (des && p.papel === "pilar" && des.tipo === "rotulada" && !o.vigaPassa) des = null;
      /* a tipologia declarada para a ponta (ex.: "emenda sobre o pilar", chapa de cabeça) dá o nome certo à ligação
         desenhada do mesmo tipo — antes o memorial dizia "rotulada (cantoneira/clip/gusset)" para a chapa de cabeça */
      if (des) { contagem.desenhada++; var nomeDes = (p.calc && p.calc.tipologia && p.calc[lado] === des.tipo) ? String(p.calc.tipologia) + " — " + (des.tipo === "rigida" ? "rígida" : des.tipo === "continua" ? "contínua" : "rotulada") : NOME_LIG[des.tipo];
        return { tipo: des.tipo === "continua" ? "continua" : des.tipo, motivo: "ligação desenhada: " + nomeDes, lig: des.id }; }
      /* PÓRTICOS M4 (14/10/2026): a ligação que a TIPOLOGIA do pórtico paramétrico declarou para esta ponta (joelho rígido
         do pórtico de alma cheia, banzo da treliça rotulado no pilar…) — vale depois da escolha da tela e da ligação desenhada */
      var tc = p.calc && (p.calc[lado] === "rigida" || p.calc[lado] === "rotulada" || p.calc[lado] === "continua") ? p.calc[lado] : null;
      if (tc) { contagem.tipologia++; return { tipo: tc, motivo: "ligação " + (tc === "rigida" ? "rígida" : tc === "continua" ? "contínua" : "rotulada") + " da tipologia" + (p.calc.tipologia ? " (" + p.calc.tipologia + ")" : "") + " — detalhar a ligação para valer o que o cálculo considerou", tipologia: true }; }
      if (p.papel === "terca") return { tipo: "rotulada", motivo: "terça: apoiada (clip) — padrão" };
      if (p.papel === "pilar") {
        var outroPilar = o.ips.filter(function (q) { return pecas[q].papel === "pilar" && Math.abs(dot(pecas[q].X, p.X)) > 0.995; }).length;
        if (outroPilar) return { tipo: "continua", motivo: "pilar continua no de cima/baixo" };
        if (o.vigaPassa) {
          var dsP = {}; noInfo[noId].passa.forEach(function (q) { if (q !== ip && (pecas[q].papel === "viga" || pecas[q].papel === "terca")) dsP[dirClara(pecas[q].X) || "obl"] = 1; });
          var dks = Object.keys(dsP), tiposP = dks.map(function (d) { return d === "obl" ? tipoObl : ligDir[d].tipo; });
          if (dks.length === 1 || tiposP.every(function (t) { return t === tiposP[0]; })) { var d1 = dks[0] || "X"; if (d1 === "obl") return { tipo: tipoObl, motivo: "pilar sob/sobre viga contínua OBLÍQUA na planta (sem direção clara) — ligação " + tipoObl }; return { tipo: ligDir[d1].tipo, motivo: "pilar sob/sobre viga contínua na direção " + dks.join(" e ") + " — ligação " + ligDir[d1].txt }; }
          return { tipo: "rotulada", motivo: "pilar sob/sobre vigas contínuas nas direções X (" + ligDir.X.txt + ") e Y (" + ligDir.Y.txt + "): o topo do pilar fica ROTULADO (uma ligação só não é rígida numa direção e rotulada na outra) — use Ponta a ponta para mudar" };
        }
        return { tipo: "continua", motivo: "o pilar recebe as vigas: a rótula, se houver, fica na ponta da viga" };
      }
      /* viga */
      if (o.pilar || o.pilarPassa) {
        var dV = dirClara(p.X);
        if (!dV) { contDir.obl++; angObl = Math.max(angObl, angEixo(p.X)); return { tipo: tipoObl, motivo: "viga × pilar sem ligação desenhada, viga OBLÍQUA na planta (" + br(angEixo(p.X), 1) + "° do eixo mais perto, mais que 15°): sem direção clara — " + (ligDir.X.tipo === ligDir.Y.tipo ? "X e Y com a mesma escolha: " + tipoObl : "ROTULADA"), direcao: null, obliqua: true }; }
        contDir[dV]++; return { tipo: ligDir[dV].tipo, motivo: "viga × pilar sem ligação desenhada, viga na direção " + dV + " — " + ligDir[dV].txt, direcao: dV };
      }
      if (o.vigaPassa) return { tipo: ligPadrao.vigaViga, motivo: "viga apoiada em viga sem ligação desenhada — " + (ligPadrao.vigaViga === "rigida" ? "rígida (escolha)" : "rotulada (padrão)") };
      var vigasPonta = o.ips.filter(function (q) { return pecas[q].papel === "viga"; });
      if (vigasPonta.length === 1 && o.ips.length === 1 && Math.abs(dot(pecas[vigasPonta[0]].X, p.X)) > 0.996) { contagem.emenda++; return { tipo: "continua", motivo: "emenda colinear sem nada no nó: tratada como CONTÍNUA (detalhar a emenda)" }; }
      return { tipo: ligPadrao.vigaViga, motivo: "vigas que se encontram sem pilar — " + (ligPadrao.vigaViga === "rigida" ? "rígida (escolha)" : "rotulada (padrão)") };
    }
    /* apoio da ponta: base de pilar (ponta de baixo, sem nada no nó) ou o que o usuário marcou */
    var basesInfo = [], minY = Infinity; pecas.forEach(function (p) { minY = Math.min(minY, p.a[1], p.b[1]); });
    function apoioDe(ip, lado, noId) {
      var p = pecas[ip], chave = p.id + ":" + lado, o = papelNo(noId, ip), extra = (op.apoios || {})[chave];
      if (extra === "fixo" || extra === "movel" || extra === "engaste") return { tipo: extra, motivo: "apoio marcado pelo engenheiro" };
      /* SIMULAÇÃO S3 (14/10/2026): o PÉ da longarina de ESCADA no nível mais baixo do modelo, sem nada encostado, apoia no
         piso (apoio fixo: o chumbador do pé) — antes a escada que sobe ao mezanino era "barra solta" no cálculo */
      if (/^Longarina/i.test(String(p.papelBim || "")) && p.papel !== "pilar") {
        var baixo = lado === "ini" ? p.a : p.b, cima = lado === "ini" ? p.b : p.a;
        if (baixo[1] < cima[1] - 0.05 && baixo[1] <= minY + 0.05 && !o.ips.length && !noInfo[noId].passa.length) return { tipo: "fixo", motivo: "pé da escada apoiado no piso (apoio fixo)", escada: true };
        return null;
      }
      if (p.papel !== "pilar") return null;
      var outra = lado === "ini" ? p.b : p.a, esta = lado === "ini" ? p.a : p.b;
      if (esta[1] > outra[1]) return null;   /* ponta de cima livre = pilar em balanço */
      /* o que mais chega no pé do pilar: nada passa por ele (senão ele nasce numa viga), nenhum pilar continua
         para baixo; no nível mais baixo do modelo, diagonais e vigas de piso que chegam no pé não o impedem de ser
         base; acima dele, só diagonais que SOBEM (pilar sobre laje/estrutura existente com contraventamento) */
      if (noInfo[noId].passa.length) return null;
      var abaixo = o.ips.some(function (q) { var pq = pecas[q], fora = dist(pq.a, esta) < dist(pq.b, esta) ? pq.b : pq.a; return fora[1] < esta[1] - 0.05; });
      if (abaixo) return null;
      if (esta[1] > minY + 0.05 && o.ips.some(function (q) { return pecas[q].papel !== "diagonal"; })) return null;
      /* PÓRTICOS M4: a base da tipologia (metal.calc.base) vale depois da escolha pilar a pilar da tela e antes do padrão */
      var tbTip = p.calc && (p.calc.base === "engastada" || p.calc.base === "rotulada") ? p.calc.base : null;
      /* #50 (15/10/2026): sem escolha, a base é ENGASTADA (pedido do Rogério: "em galpão a maioria são engastados") — a placa
         engastada pede o fck da fundação (sem ele fica A CONFIRMAR: js/acoligcalc2.js) */
      var tb = (op.bases || {})[p.id] || tbTip || op.basePadrao || "engastada";
      /* SIMULAÇÃO S1 (14/10/2026): a PLACA DE BASE desenhada pela Ligação inteligente manda, como a chapa de topo no nó —
         modelo e ligação ficam coerentes (base engastada no cálculo ⇔ placa engastada no modelo) */
      var pd = placaDesenhada(p.id);
      if (pd) {
        if (pd.tipo !== (tb === "engastada" ? "engastada" : "rotulada")) avisos.push("Pilar " + p.mid + " (" + p.nome + "): a base escolhida na tela é " + tb + ", mas a placa DESENHADA é " + pd.tipo + " (" + pd.tipologia + ") — o cálculo usa a placa desenhada.");
        return { tipo: pd.tipo, motivo: "placa de base desenhada: " + pd.tipo + " (" + pd.tipologia + ")", base: true, desenhada: true };
      }
      return { tipo: tb === "engastada" ? "engastada" : "rotulada", motivo: (op.bases || {})[p.id] ? "base escolhida no pilar" : (tbTip ? "base " + tbTip + " da tipologia" + (p.calc.tipologia ? " (" + p.calc.tipologia + ")" : "") : (op.basePadrao ? "base escolhida para todos os pilares" : "base engastada (padrão)")), base: true };
    }
    function placaDesenhada(pid) {
      var achou = null;
      Object.keys(lido.ligacoes || {}).forEach(function (k) {
        var L1 = lido.ligacoes[k]; if (L1.tipo !== "base" || !L1.tipologia || L1.membros.indexOf(pid) < 0) return;
        var t = /engastada/.test(L1.tipologia) ? "engastada" : (/rotulada|quimico/.test(L1.tipologia) ? "rotulada" : null);
        if (t) achou = { tipo: t, tipologia: L1.tipologia, lig: k };
      });
      return achou;
    }
    function eixoGlobal(X) { var ax = [Math.abs(X[0]), Math.abs(X[1]), Math.abs(X[2])]; return ax[1] >= ax[0] && ax[1] >= ax[2] ? "ry" : (ax[0] >= ax[2] ? "rx" : "rz"); }
    var apoiosNo = {};
    pecas.forEach(function (p, ip) {
      ["ini", "fim"].forEach(function (lado) {
        var noId = grupoDaPonta(ip, lado).id, ap = apoioDe(ip, lado, noId);
        if (!ap) return;
        var A = { no: noId, ux: true, uy: true, uz: true };
        var tors = eixoGlobal(p.X);
        if (ap.tipo === "engastada" || ap.tipo === "engaste") { A.rx = true; A.ry = true; A.rz = true; }
        else if (ap.tipo === "rotulada" || ap.tipo === "fixo") A[tors] = true;
        else if (ap.tipo === "movel") { var ax = Math.abs(p.X[0]) >= Math.abs(p.X[2]) ? "ux" : "uz"; A[ax] = false; A[tors] = true; }
        if (apoiosNo[noId]) return;
        apoiosNo[noId] = { tipo: ap.tipo, peca: p.id, mid: p.mid, motivo: ap.motivo, base: !!ap.base };
        apoios.push(A);
        if (ap.base) { basesInfo.push({ no: noId, peca: p.id, mid: p.mid, tipo: ap.tipo, cota: (lado === "ini" ? p.a : p.b)[1] }); if ((lado === "ini" ? p.a : p.b)[1] > minY + 0.05) avisos.push("Pilar " + p.mid + " (" + p.nome + "): base na cota " + br((lado === "ini" ? p.a : p.b)[1], 2) + " m, acima do ponto mais baixo do modelo (" + br(minY, 2) + " m) — confira se ele nasce mesmo ali."); }
      });
    });
    /* frente D: mola de uma ponta rígida desenhada — a rigidez é a do motor da ligação (js/acoligcalc2.js) com a entrada gravada na ligação;
       sem entrada, sem rigidez válida ou classificada RÍGIDA → a ponta fica rígida (dito nas decisões) */
    var cacheMola = {}, molasUsadas = [], molasRecusadas = [];
    function molaPonta(cond, pc) {
      if (!cond || cond.tipo !== "rigida" || !cond.lig) return null;
      var id = String(cond.lig), ch = id + ":" + (pc && pc.id);
      if (cacheMola[ch] === undefined) {
        var L1 = (lido.ligacoes || {})[id], C2 = dep("AcoLigCalc2", "./acoligcalc2.js"), R = null, mot = null;
        /* a ligação dimensionada com OUTRO perfil de viga (o modelo mudou depois) não dá a mola: fica rígida, desatualizada */
        var mm = pc && pc.sec && pc.sec.mm, ev = L1 && L1.entrada && L1.entrada.viga;
        /* revisão D: o PILAR e os AÇOS também (o otimizador que troca o pilar invalida a mola até recalcular a ligação) */
        var pil = L1 ? pecas.filter(function (q) { return q.papel === "pilar" && arr(L1.membros).indexOf(q.id) >= 0; })[0] : null, mp = pil && pil.sec && pil.sec.mm, ea = L1 && L1.entrada && (L1.entrada.apoio || L1.entrada.pilar);
        function difSec(a, b) { return !a || !b || !(num(a.d, 0) > 0) || Math.abs(num(a.d, 0) - num(b.d, 0)) > 1 || Math.abs(num(a.bf, 0) - num(b.bf, 0)) > 1 || Math.abs(num(a.tw, 0) - num(b.tw, 0)) > 0.5 || Math.abs(num(a.tf, 0) - num(b.tf, 0)) > 0.5; }
        function fyEnt(o, d0) { return num(o && o.fy, d0); }
        if (!L1 || !L1.tipologia || !L1.entrada) mot = "ligação sem tipologia/entrada dimensionada";
        else if (!mm || difSec(ev, mm)) mot = "ligação DESATUALIZADA: a viga do modelo" + (mm ? " (d = " + br(num(mm.d, 0), 0) + " mm)" : "") + " não é a da ligação" + (ev ? " (d = " + br(num(ev.d, 0), 0) + " mm)" : "") + " — redimensionar";
        else if (!mp || difSec(ea, mp)) mot = "ligação DESATUALIZADA: o pilar do modelo" + (mp ? " (d = " + br(num(mp.d, 0), 0) + "; tw = " + br(num(mp.tw, 0), 2) + "; tf = " + br(num(mp.tf, 0), 2) + " mm)" : " não foi achado e") + " não é o da ligação — redimensionar";
        else if (Math.abs(fyEnt(L1.entrada.acoViga, 345) - num(pc.aco && pc.aco.fy, 0)) > 1 || Math.abs(fyEnt(L1.entrada.acoApoio || L1.entrada.acoPilar, 345) - num(pil.aco && pil.aco.fy, 0)) > 1) mot = "ligação DESATUALIZADA: o aço da viga ou do pilar no modelo não é o da ligação — redimensionar";
        else if (!C2) mot = "motor das ligações indisponível";
        else { try { R = C2.verificar(L1.tipologia, L1.entrada).rigidez; } catch (ex) { R = null; mot = "erro no cálculo da ligação"; } }
        if (!mot && !(R && R.calculada)) mot = "rigidez não calculada" + (R && R.motivos && R.motivos[0] ? " (" + R.motivos[0] + ")" : "");
        else if (!mot && !R.valida) mot = "rigidez não vale (" + (R.motivos[0] || "") + ")";
        else if (!mot && R.classe === "rigida") mot = "classificada RÍGIDA (5.2.2.5): fica rígida";
        /* revisão D: a 4ES calculada SEM a nervura é mais mole que a real — como mola tiraria momento da ligação e do pilar: fica rígida */
        else if (!mot && R.tipo === "4ES") mot = "4ES: a rigidez calculada sem a nervura é menor que a real — fica rígida na análise até haver o cálculo próprio";
        else if (!mot && !(isFinite(R.Sj_eta) && R.Sj_eta > 0)) mot = "Sj sem valor finito";
        cacheMola[ch] = mot ? null : { Sj: R.Sj_eta, Sjini: R.Sjini, eta: R.eta, classe: R.classe };
        if (mot) molasRecusadas.push((L1 && L1.tipologia ? L1.tipologia : "ligação " + id) + ": " + mot); else molasUsadas.push((L1.tipologia) + ": Sj,ini/η = " + br(R.Sjini, 0) + "/" + R.eta + " = " + br(R.Sj_eta, 0) + " kN·m/rad (" + R.classe + ")");
      }
      return cacheMola[ch];
    }
    /* barras e membros */
    /* a peça x está ANCORADA além do nó `noExcl`? — busca pelas peças ligadas (sem passar por noExcl nem pela peça `ipExcl`)
       até um nó com APOIO. Guardada por chave (modelos grandes) */
    var _anc = {};
    /* #49 c) (16/10/2026, revisor da 1.2.148) — TRAVAMENTO POR CONECTIVIDADE: chegar a um apoio não basta, a cadeia tem de
       chegar por peça que SEGURA o deslocamento. O PILAR PENDULAR (base rotulada, topo rotulado: todas as peças que chegam no
       topo rotuladas nele, ou o próprio topo rotulado; sem nó no meio) não leva força lateral do topo à base — a viga que vai
       do pilar ao topo de um pendular solto não trava nada (antes: "ancorada" pela base do pendular → K = 1 num pilar que é
       balanço). A cadeia continua pelas OUTRAS peças do topo do pendular (o X que chega nele, a viga ligada a pilar com base
       engastada): é a cadeia até a peça que trava. OPC_TRAV.pendular = false só no controle negativo dos testes. */
    var _pend = {};
    function condSemContar(ip0, lado0, no0) {
      var sc = JSON.stringify(contagem), sd = JSON.stringify(contDir), sa = angObl, t0;
      try { t0 = condicao(ip0, lado0, no0).tipo; } finally {
        var c1 = JSON.parse(sc), d1 = JSON.parse(sd); Object.keys(c1).forEach(function (k) { contagem[k] = c1[k]; }); Object.keys(d1).forEach(function (k) { contDir[k] = d1[k]; }); angObl = sa; }
      return t0;
    }
    function basePendular(y) {
      if (_pend[y] !== undefined) return _pend[y];
      var py = pecas[y], r = null;
      if (OPC_TRAV.pendular && py.papel === "pilar" && arr(pontosPeca[y]).length === 2) {
        var pI = pontosPeca[y].filter(function (q) { return q.ponta === "ini"; })[0], pF = pontosPeca[y].filter(function (q) { return q.ponta === "fim"; })[0];
        var bse = null, top = null;
        [[pI, pF], [pF, pI]].forEach(function (par) { if (!bse && par[0] && par[1] && apoiosNo[par[0].no] && apoiosNo[par[0].no].peca === py.id && apoiosNo[par[0].no].base) { bse = par[0]; top = par[1]; } });
        if (bse && !/engast/.test(String(apoiosNo[bse.no].tipo)) && !apoiosNo[top.no]) {
          var IT = noInfo[top.no], outrosT = IT ? IT.ends.filter(function (e) { return e.ip !== y; }) : [];
          if (IT && !IT.passa.length) {
            var proprio = condSemContar(y, top.ponta, top.no);
            var todasRot = outrosT.length > 0 && outrosT.every(function (e) { return condSemContar(e.ip, e.lado, top.no) === "rotulada"; });
            if (proprio === "rotulada" || todasRot) r = bse.no;
          }
        }
      }
      _pend[y] = r; return r;
    }
    function ancorada(x, noExcl, ipExcl) {
      var ch = x + "|" + noExcl + "|" + ipExcl; if (_anc[ch] != null) return _anc[ch];
      var vistoP = {}, vistoN = {}, fila = [x], achou = false; vistoP[x] = 1; vistoP[ipExcl] = 1; vistoN[noExcl] = 1;
      while (fila.length && !achou) {
        var m0 = fila.shift(), bP = basePendular(m0);
        arr(pontosPeca[m0]).forEach(function (pq) {
          if (bP != null && pq.no === bP) return;   /* o pendular não leva a cadeia à base dele (outra peça pode levar) */
          if (achou || vistoN[pq.no]) return; vistoN[pq.no] = 1;
          if (apoiosNo[pq.no]) { achou = true; return; }
          var I2 = noInfo[pq.no]; if (!I2) return;
          I2.ends.map(function (e) { return e.ip; }).concat(I2.passa).forEach(function (y) { if (!vistoP[y]) { vistoP[y] = 1; fila.push(y); } });
        });
      }
      _anc[ch] = achou; return achou;
    }
    var grp = {}, semTrav = [], travM = {};
    pecas.forEach(function (p, ip) {
      var pts = pontosPeca[ip].slice().sort(function (a, b) { return a.s - b.s; });
      var lst = []; pts.forEach(function (q) { if (lst.length && (lst[lst.length - 1].no === q.no || Math.abs(lst[lst.length - 1].s - q.s) < 1e-4)) { if (q.ponta) lst[lst.length - 1].ponta = q.ponta; return; } lst.push(q); });
      var condI = condicao(ip, "ini", lst[0].no), condF = condicao(ip, "fim", lst[lst.length - 1].no);
      if (apoiosNo[lst[0].no] && apoiosNo[lst[0].no].peca === p.id) condI = { tipo: "apoio", motivo: apoiosNo[lst[0].no].motivo };
      if (apoiosNo[lst[lst.length - 1].no] && apoiosNo[lst[lst.length - 1].no].peca === p.id) condF = { tipo: "apoio", motivo: apoiosNo[lst[lst.length - 1].no].motivo };
      condPontas[p.id + ":ini"] = condI; condPontas[p.id + ":fim"] = condF;
      [condI, condF].forEach(function (c0) { if (contagem[c0.tipo] != null) contagem[c0.tipo]++; });
      var segs = [], nosM = [];
      for (var k = 0; k + 1 < lst.length; k++) {
        var bid = p.mid + "_" + (k + 1), Lb = lst[k + 1].s - lst[k].s;
        var lib = {};
        if (k === 0 && condI.tipo === "rotulada") lib.i = { ry: true, rz: true };
        if (k + 2 === lst.length && condF.tipo === "rotulada") lib.j = { ry: true, rz: true };
        var bar = { id: bid, i: lst[k].no, j: lst[k + 1].no, secao: { A: p.sec.A, Iy: p.sec.Iy, Iz: p.sec.Iz, J: p.sec.J }, E: E, G: G, vy: p.ey.slice(), nElem: p.tracao ? 1 : (Lb > 3 ? 4 : 2), peca: p.id, membro: p.mid };
        if (lib.i || lib.j) bar.libera = lib;
        /* frente D (15/10/2026): RIGIDEZ DAS LIGAÇÕES na análise — ponta de VIGA com ligação rígida desenhada e rigidez válida vira mola
           rotacional em torno do eixo forte (rz local) com Sj = Sj,ini/η (EN 1993-1-8:2005, 5.1.2(4) e Tabela 5.2) */
        if (op.rigidezLigacoes && p.papel === "viga") {
          var mI = k === 0 ? molaPonta(condI, p) : null, mJ = k + 2 === lst.length ? molaPonta(condF, p) : null;
          if (mI || mJ) { bar.mola = {}; if (mI) bar.mola.i = { rz: mI.Sj }; if (mJ) bar.mola.j = { rz: mJ.Sj }; }
        }
        if (p.tracao) { bar.tracao = true; bar.papel = "contravento"; }
        barras.push(bar); segs.push(bid);
        if (!nosM.length) nosM.push(lst[k].no); nosM.push(lst[k + 1].no);
      }
      /* flambagem e travamentos: os pontos (ao longo da peça) travados em y e em z locais */
      var ty = [], tz = [], tMesa = [];
      /* TRAVAMENTO (1.2.148, revisão da frente A — CONTRA A SEGURANÇA antes): a ponta do pilar contava como travada nos DOIS eixos
         quando QUALQUER peça chegava nela — até uma viga em balanço, que não trava nada (pilar livre de 8 m com viga em balanço:
         esbeltez 1,19 no cálculo, 2,38 na conta certa). Regra agora: (1) uma peça só trava se estiver ANCORADA além deste nó —
         sem passar pelo nó nem pela própria peça, a cadeia de peças chega a um APOIO (outro pilar com base, contraventamento…);
         viga em balanço / cadeia solta não trava; (2) no PILAR, trava só na DIREÇÃO da peça que chega (viga em X trava o
         deslocamento em X, não em Z); o eixo sem travamento cai na regra da ponta livre (balanço: 2 × o trecho); (3) sem certeza,
         não travado. Na VIGA, a ponta segue travada nos dois eixos quando chega nela uma peça ancorada (o pilar com base). */
      var ehPilar = p.papel === "pilar";
      lst.forEach(function (q, k) {
        var I = noInfo[q.no], rY = false, rZ = false;
        if (apoiosNo[q.no]) { rY = true; rZ = true; }
        var outros = I.ends.map(function (e) { return e.ip; }).concat(I.passa).filter(function (x) { return x !== ip; });
        var anc = outros.filter(function (x) { return ancorada(x, q.no, ip); });
        anc.forEach(function (x) { var d = pecas[x].X; if (Math.abs(dot(d, p.ey)) > 0.5) rY = true; if (Math.abs(dot(d, p.ez)) > 0.5) rZ = true; });
        if ((k === 0 || k === lst.length - 1) && !ehPilar && anc.length) { rY = true; rZ = true; }
        if (rY) ty.push(q.s); if (rZ) tz.push(q.s);
        if (ehPilar && (k === 0 || k === lst.length - 1) && outros.length && !apoiosNo[q.no] && (!rY || !rZ)) semTrav.push(p.mid + " (" + p.nome + ", " + (k === 0 ? "pé" : "topo") + (anc.length < outros.length ? ": " + (outros.length - anc.length) + " peça(s) que chega(m) sem apoio além do nó — balanço" : "") + (!rY && !rZ ? "; nenhum eixo travado" : "; um eixo sem peça ancorada na direção dele") + ")");
        if (rZ && k > 0 && k < lst.length - 1) tMesa.push(r6(q.s));
      });
      function Lfl(lista) {
        var xs = lista.slice().sort(function (a, b) { return a - b; }), mx = 0;
        if (!xs.length) return 2 * p.L;
        for (var q = 1; q < xs.length; q++) mx = Math.max(mx, xs[q] - xs[q - 1]);
        if (xs[0] > 1e-6) mx = Math.max(mx, 2 * xs[0]);                 /* ponta livre no início: balanço (K = 2) */
        if (xs[xs.length - 1] < p.L - 1e-6) mx = Math.max(mx, 2 * (p.L - xs[xs.length - 1]));
        return mx;
      }
      var balanco = condI.tipo === "livre" || condF.tipo === "livre";
      var fl = { Lx: Lfl(ty), Ly: Lfl(tz) }; fl.Lz = fl.Ly;
      var cima = dot(p.ey, UP) >= 0 ? "mais" : "menos", trav = { mais: [], menos: [] };
      if (p.papel === "pilar") { trav.mais = tMesa.slice(); trav.menos = tMesa.slice(); }
      else trav[cima] = tMesa.slice();
      var papelV = p.tracao ? "tirante" : (p.papel === "diagonal" ? "contravento" : (p.papel === "pilar" ? "pilar" : "viga"));
      var gk = p.papel + "|" + p.cat;
      var m = { id: p.mid, peca: p.id, nome: p.nome, papel: papelV, papelLivre: p.papel, grupo: gk, segs: segs, nos: nosM, L: p.L, secao: p.sec, aco: p.aco, flambagem: fl, travamentos: trav, calc: p.calc || null,
                balanco: balanco, pontas: { ini: condI, fim: condF }, apoiosVao: lst.filter(function (q, k) { if (k === 0 || k === lst.length - 1) return condPontas[p.id + ":" + (k === 0 ? "ini" : "fim")].tipo !== "livre"; var o = papelNo(q.no, ip); return !!apoiosNo[q.no] || o.pilar > 0 || o.pilarPassa > 0; }).map(function (q) { return q.s; }),
                ey: p.ey, X: p.X, a: p.a, b: p.b, frio: p.sec.forma === "frio" };
      if (balanco) m.cb = 1;
      membros.push(m); travM[ip] = { m: m, ty: ty, tz: tz };
      (grp[gk] = grp[gk] || { chave: gk, papel: p.papel, perfil: p.cat, membros: [], pecas: [] }).membros.push(m.id);
      grp[gk].pecas.push(p.id);
    });
    /* EMENDA DE PILAR (1.2.148, revisor da frente A — CONTRA A SEGURANÇA antes): pilar contínuo em dois trechos (4 + 2 m) sem
       nada que trave na emenda dava Le 8 e 4 m — cada trecho visto sozinho. O comprimento destravado ATRAVESSA a emenda (nó de
       pilar sem peça que trave naquela direção) até o próximo ponto travado, nos dois eixos: os trechos colineares emendados
       ponta a ponta viram uma CADEIA, os pontos travados de todos entram no eixo dela e cada trecho leva o maior intervalo
       destravado que o atravessa (o da ponta livre, 2 ×) — no lugar da conta do trecho sozinho, que via a emenda como ponta livre. */
    (function () {
      var pontasDe = {}, porNo = {};
      Object.keys(travM).forEach(function (k) {
        var ip0 = +k; if (pecas[ip0].papel !== "pilar") return;
        var ini = null, fim = null; pontosPeca[ip0].forEach(function (q) { if (q.ponta === "ini") ini = q.no; if (q.ponta === "fim") fim = q.no; });
        pontasDe[ip0] = [ini, fim]; [ini, fim].forEach(function (no) { if (no != null) (porNo[no] = porNo[no] || []).push(ip0); });
      });
      var visto = {};
      Object.keys(pontasDe).forEach(function (k) {
        var ip0 = +k; if (visto[ip0]) return;
        var cad = [], fila = [ip0]; visto[ip0] = 1;
        while (fila.length) {
          var a = fila.shift(); cad.push(a);
          pontasDe[a].forEach(function (no) { arr(porNo[no]).forEach(function (b) { if (!visto[b] && Math.abs(dot(pecas[a].X, pecas[b].X)) > 0.995) { visto[b] = 1; fila.push(b); } }); });
        }
        if (cad.length < 2) return;
        var U = pecas[cad[0]].X[1] >= 0 ? pecas[cad[0]].X : mul(pecas[cad[0]].X, -1), O = null;
        cad.forEach(function (b) { [pecas[b].a, pecas[b].b].forEach(function (P) { var tt = dot(P, U); if (O == null || tt < O) O = tt; }); });
        var seg = {}, Ltot = 0;
        cad.forEach(function (b) { var pb = pecas[b], ta = dot(pb.a, U) - O, tb = dot(pb.b, U) - O; seg[b] = { o: Math.min(ta, tb), dir: tb >= ta ? 1 : -1, L: pb.L }; Ltot = Math.max(Ltot, Math.max(ta, tb)); });
        function naCadeia(b, s) { var g = seg[b]; return g.dir > 0 ? g.o + s : g.o + (g.L - s); }
        function intervalos(lista) {
          var xs = lista.slice().sort(function (a, b) { return a - b; }), out = [];
          var u = []; xs.forEach(function (x) { if (!u.length || Math.abs(x - u[u.length - 1]) > 1e-4) u.push(x); }); xs = u;
          if (!xs.length) return [[0, Ltot, 2]];
          if (xs[0] > 1e-6) out.push([0, xs[0], 2]);
          for (var i = 1; i < xs.length; i++) out.push([xs[i - 1], xs[i], 1]);
          if (xs[xs.length - 1] < Ltot - 1e-6) out.push([xs[xs.length - 1], Ltot, 2]);
          return out;
        }
        ["ty", "tz"].forEach(function (eixo, ie) {
          var pts = []; cad.forEach(function (b) { travM[b][eixo].forEach(function (s) { pts.push(naCadeia(b, s)); }); });
          var iv = intervalos(pts);
          cad.forEach(function (b) {
            var g = seg[b], a0 = g.o, b0 = g.o + g.L, Le = 0;
            iv.forEach(function (v) { if (Math.min(v[1], b0) - Math.max(v[0], a0) > 1e-6) Le = Math.max(Le, v[2] * (v[1] - v[0])); });
            var fl0 = travM[b].m.flambagem, k = ie === 0 ? "Lx" : "Ly";
            /* na cadeia o comprimento é o da CADEIA (a emenda não é ponta livre do trecho: o pilar continua) */
            if (Le > 0 && Math.abs(Le - fl0[k]) > 1e-9) { fl0[k] = r6(Le); if (k === "Ly") fl0.Lz = fl0.Ly; travM[b].m.emenda = true; }
          });
        });
      });
    })();
    /* resumo das condições das pontas */
    var txt = [];
    if (contagem.rotulada) txt.push(contagem.rotulada + " ponta(s) rotulada(s)");
    if (contagem.rigida) txt.push(contagem.rigida + " rígida(s)");
    if (contagem.continua) txt.push(contagem.continua + " contínua(s)");
    if (contagem.livre) txt.push(contagem.livre + " livre(s) (balanço)");
    if (contagem.apoio) txt.push(contagem.apoio + " em apoio");
    decisoes.push({ tema: "Ligações", decisao: txt.join(", ") + (contagem.desenhada ? " — " + contagem.desenhada + " pela ligação desenhada no modelo" : "") + (contagem.tipologia ? (contagem.desenhada ? "; " : " — ") + contagem.tipologia + " pela tipologia do pórtico paramétrico" : ""), motivo: "a ligação desenhada manda; sem ela: viga × pilar na direção X " + ligDir.X.txt + ", na direção Y " + ligDir.Y.txt + "; viga × viga " + ligPadrao.vigaViga + " (padrão rotulada — troque na tela), diagonal articulada, terça apoiada" });
    var AVISO_PADRAO = op.padraoNovo ? " — PADRÃO DESDE A 1.2.149: base engastada e viga × pilar automática — confira" : "";
    if (contDir.X || contDir.Y || contDir.obl) decisoes.push({ tema: "Ligações viga × pilar por direção", decisao: "sem ligação desenhada: vigas na direção X " + ligDir.X.txt + " (" + contDir.X + " ponta(s)); vigas na direção Y " + ligDir.Y.txt + " (" + contDir.Y + " ponta(s))" + (contDir.obl ? "; vigas OBLÍQUAS na planta (mais de 15° do eixo, até " + br(angObl, 1) + "°): " + tipoObl + " (" + contDir.obl + " ponta(s)) — sem direção clara" : "") + AVISO_PADRAO,
      motivo: (autoPl ? (autoPl.plano ? "plano do pórtico identificado na direção " + autoPl.plano + ": " + autoPl.motivo + " — no galpão a ligação é rígida no plano do pórtico e rotulada na longitudinal (o X do contraventamento segura)" : "automático: " + autoPl.motivo + "; as duas direções ficam rotuladas (escolha na tela se o pórtico for rígido)") : "escolha da tela por direção (X e Y da planta)") + "; a viga até 15° do eixo segue o eixo, a mais oblíqua não tem direção clara (rotulada, salvo X e Y iguais); \"Ponta a ponta\" e a ligação desenhada mandam sobre a direção" });
    var nProv = Object.keys(lido.ligacoes || {}).filter(function (k) { return lido.ligacoes[k].provisoria; }).length;
    if (nProv) decisoes.push({ tema: "Ligações a confirmar", decisao: nProv + " ligação(ões) lançada(s) com a viga, pré-dimensionada(s) só pelo peso próprio (A CONFIRMAR NO CÁLCULO): no nó delas vale a escolha da tela (viga × pilar " + ligPadrao.vigaPilar + ", viga × viga " + ligPadrao.vigaViga + ")", motivo: "a ligação de partida não é decisão de projeto — depois do cálculo ela é confirmada ou trocada com os esforços da análise (coerente com o nó)" });
    if (contagem.emenda) avisos.push(contagem.emenda / 2 + " emenda(s) colinear(es) de viga sem ligação desenhada foram tratadas como CONTÍNUAS: detalhe a emenda (cobrejunta) para valer o que o cálculo considerou.");
    if (basesInfo.length) {
      var nEng = basesInfo.filter(function (b) { return b.tipo === "engastada"; }).length;
      decisoes.push({ tema: "Apoios", decisao: basesInfo.length + " base(s) de pilar: " + (basesInfo.length - nEng) + " rotulada(s), " + nEng + " engastada(s)" + AVISO_PADRAO, motivo: "a ponta de baixo do pilar que não encosta em nenhuma peça é a base; a condição é a escolhida na tela (padrão engastada — em galpão a maioria das bases é engastada: a fundação recebe momento e a placa pede o fck da fundação; rotulada por escolha)" });
    }
    var nDiag = pecas.filter(function (p) { return p.papel === "diagonal"; }).length;
    if (nDiag) decisoes.push({ tema: "Diagonais", decisao: nDiag + " diagonal(is) articulada(s) nas pontas" + (pecas.some(function (p) { return p.tracao; }) ? "; as de barra redonda só trabalham à TRAÇÃO (saem do modelo quando comprimidas)" : ""), motivo: "barra de contraventamento ligada por gusset/olhal; barra redonda não resiste à compressão" });
    if (semTrav.length) decisoes.push({ tema: "Travamento dos pilares", decisao: semTrav.length + " ponta(s) de pilar com peça chegando mas SEM travamento em algum eixo — nesse eixo o pilar é tratado em balanço (2 × o trecho): " + semTrav.slice(0, 12).join("; ") + (semTrav.length > 12 ? "…" : ""), motivo: "uma peça só trava o pilar se estiver apoiada além do nó (cadeia até um apoio: outro pilar com base, contraventamento) e só na direção dela — viga em balanço não trava; o pilar PENDULAR (base rotulada e topo rotulado) não leva a cadeia à base dele: só trava pelo que mais chega no topo dele (#49, 16/10/2026); sem certeza, não travado (a favor da segurança; 1.2.148)" });
    decisoes.push({ tema: "Flambagem", decisao: "K = 1 entre os pontos travados de cada eixo (peça ANCORADA que chega na direção do eixo, ou apoio); ponta livre ou sem peça ancorada naquela direção = 2 × o trecho; FLT: a viga que chega trava a mesa de cima (pilar: as duas)", motivo: "análise de 2ª ordem com imperfeições (NBR 8800, 4.9.7): o comprimento de flambagem é o destravado; o engenheiro não configura" });
    var modelo = { nos: nos, barras: barras, apoios: apoios, casos: [] };
    var L = { livre: true };
    /* planos z constante com 2 ou mais barras (a vista 3D mostra os esforços por "pórtico" — aqui, o plano) */
    var zs = {}; barras.forEach(function (b) { var ni = nos.filter(function (x) { return x.id === b.i; })[0], nj = nos.filter(function (x) { return x.id === b.j; })[0]; if (ni && nj && Math.abs(ni.z - nj.z) < 1e-3) { var k3 = Math.round(ni.z * 1000) / 1000; zs[k3] = (zs[k3] || 0) + 1; } });
    L.zs = Object.keys(zs).filter(function (k) { return zs[k] >= 2; }).map(Number).sort(function (a, b) { return a - b; });
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    nos.forEach(function (q) { [q.x, q.y, q.z].forEach(function (v, k) { mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }); });
    L.mn = mn; L.mx = mx; L.vao = mx[0] - mn[0]; L.Lt = mx[2] - mn[2]; L.H = mx[1] - Math.min(0, mn[1]); L.aguas = null;
    if (op.rigidezLigacoes) decisoes.push({ tema: "Rigidez das ligações", decisao: molasUsadas.length ? molasUsadas.length + " ligação(ões) de momento como mola rotacional na ponta da viga: " + molasUsadas.join("; ") : "nenhuma ponta de viga virou mola",
      motivo: "EN 1993-1-8:2005, 5.1.2(4): Sj = Sj,ini/η (Tabela 5.2, η = 2) em torno do eixo forte; o eixo fraco e a torção ficam como estavam (rigidez não calculada)" + (molasRecusadas.length ? ". Ficaram RÍGIDAS: " + molasRecusadas.join("; ") : "") });
    var Gm = { ok: true, livre: true, modelo: modelo, membros: membros, grupos: grp, secoes: {}, layout: L, decisoes: decisoes, avisos: avisos, problemas: problemas,
               pecas: pecas, noInfo: noInfo, apoiosNo: apoiosNo, bases: basesInfo, condPontas: condPontas, par: op, linhasTerca: [], lido: lido, ligDirecao: ligDir };
    pecas.forEach(function (p) { Gm.secoes[p.mid] = p.sec; });
    return Gm;
  }

  /* ================================================================ ESTABILIDADE
   * (1) peça solta (não toca em nada e não tem apoio); (2) conjunto de peças sem apoio; (3) MECANISMO: análise de
   * 1ª ordem com forças de teste em x, y e z em todos os nós (barras só de tração tratadas como normais — o X
   * trabalha nos dois sentidos pelo par): fatoração que falha ou deslocamento absurdo = mecanismo. */
  function estabilidade(G) {
    var A = Ana(), pro = [], mod = G.modelo;
    var viz = {}; mod.nos.forEach(function (n0) { viz[n0.id] = []; });
    mod.barras.forEach(function (b) { viz[b.i].push(b.j); viz[b.j].push(b.i); });
    /* peças soltas: nenhum nó compartilhado e sem apoio */
    var soltas = [];
    G.membros.forEach(function (m) {
      var p0 = m.pontas.ini.tipo, p1 = m.pontas.fim.tipo, temMeio = m.nos.length > 2;
      var nosOutros = m.nos.some(function (id) { var I = G.noInfo[id]; return I.ends.length + I.passa.length > 1; });
      if (!nosOutros && p0 !== "apoio" && p1 !== "apoio") soltas.push(m);
      else if (m.papelLivre === "diagonal" && (p0 === "livre" || p1 === "livre") && !temMeio) soltas.push(m);
    });
    if (soltas.length) pro.push({ tipo: "barra-solta", texto: soltas.length + " peça(s) solta(s) — não encostam em nenhuma outra peça nem num apoio" + (soltas.some(function (m) { return m.papelLivre === "diagonal"; }) ? " (diagonal com uma ponta no ar)" : "") + ": " + soltas.map(function (m) { return m.id + " (" + m.nome + ")"; }).join("; ") + ".",
                                   pecas: soltas.map(function (m) { return m.peca; }), solucoes: [{ id: "ligar", texto: "Encoste a ponta da peça na outra (o encaixe 3D pega a ponta ou o meio da barra)" }, { id: "excluir", texto: "Calcule só as peças selecionadas, sem a solta" }] });
    /* conjuntos sem apoio */
    var visto = {}, comps = [];
    mod.nos.forEach(function (n0) {
      if (visto[n0.id]) return;
      var fila = [n0.id], c = []; visto[n0.id] = true;
      while (fila.length) { var x = fila.shift(); c.push(x); viz[x].forEach(function (y) { if (!visto[y]) { visto[y] = true; fila.push(y); } }); }
      comps.push(c);
    });
    var comApoio = {}; mod.apoios.forEach(function (a) { comApoio[a.no] = true; });
    comps.forEach(function (c) {
      if (c.some(function (id) { return comApoio[id]; })) return;
      var ms = G.membros.filter(function (m) { return m.nos.some(function (id) { return c.indexOf(id) >= 0; }); });
      if (ms.every(function (m) { return soltas.indexOf(m) >= 0; })) return;
      pro.push({ tipo: "sem-apoio", texto: "Conjunto de " + ms.length + " peça(s) sem nenhum apoio (" + ms.slice(0, 6).map(function (m) { return m.id; }).join(", ") + (ms.length > 6 ? "…" : "") + "): ele flutua no modelo.", pecas: ms.map(function (m) { return m.peca; }),
                solucoes: [{ id: "base", texto: "Desça um pilar até a base, ou marque um apoio na ponta que se apoia numa parede/estrutura existente" }] });
    });
    if (pro.length || !A) return { ok: !pro.length, problemas: pro };
    /* mecanismo */
    /* REVISOR (16/10, médio): o tirante SÓ DE TRAÇÃO SEM PAR do sistema de correntes (sem o X que o cruza: corrente, diagonal de ancoragem) não
       entra no teste de mecanismo — ele não segura o movimento nos dois sentidos, e com ele a estrutura sem contraventamento
       passava como "estável" pela flexão das terças. Par = outra barra só de tração que o CRUZA no meio (o X). */
    var semPar = {};
    (function () {
      var tr = arr(G.pecas).filter(function (pc) { return pc && pc.tracao; });
      tr.forEach(function (pc) {
        var par = tr.some(function (q) { if (q === pc) return false; var ss = segSeg(pc, q); return !!ss && ss.d < 0.05 + 0.5 * Math.max(pc.h || 0, q.h || 0) && ss.s > 0.05 * pc.L && ss.s < 0.95 * pc.L && ss.t > 0.05 * q.L && ss.t < 0.95 * q.L; });
        /* só o sistema de CORRENTES (a barra sem par ligada a uma TERÇA: corrente, diagonal de ancoragem) — a diagonal sozinha de
           contraventamento fica no teste e segue o caminho do resolvedor (completar o X / trocar as diagonais) */
        var mm = G.membros.filter(function (q) { return q.peca === pc.id; })[0], naTerca = !!mm && arr(mm.nos).some(function (n0) { var I0 = G.noInfo[n0]; return !!I0 && I0.ends.map(function (e) { return e.ip; }).concat(arr(I0.passa)).some(function (ip) { return G.pecas[ip] && G.pecas[ip].papel === "terca"; }); });
        if (!par && naTerca) semPar[pc.id] = 1;
      });
    })();
    var barrasT = OPC_EST.semPar ? mod.barras.filter(function (b) { return !(b.tracao && semPar[b.peca]); }) : mod.barras;
    var teste = { nos: mod.nos, apoios: mod.apoios, barras: barrasT.map(function (b) { var c = {}; Object.keys(b).forEach(function (k) { c[k] = b[k]; }); delete c.tracao; if (b.tracao) c.libera = { i: { ry: true, rz: true }, j: { ry: true, rz: true } }; return c; }),
                  casos: [{ id: "T", cargas: mod.nos.map(function (n0) { return { tipo: "no", no: n0.id, F: [1, 1, 1, 0, 0, 0] }; }) }] };
    var r = A.analisar(teste, { combinacoes: [{ id: "T", fatores: { T: 1 } }], estacoes: 2 });
    var diag = len(sub(G.layout.mx, G.layout.mn)) || 1, onde = null, umax = 0;
    if (r.ok && r.combinacoes.T && r.combinacoes.T.ok) {
      Object.keys(r.combinacoes.T.desloc).forEach(function (id) { var u = r.combinacoes.T.desloc[id], h = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]); if (h > umax) { umax = h; onde = id; } });
    }
    /* mecanismo: u > OPC_EST.fator × a diagonal do modelo sob 1 kN em cada nó (ver OPC_EST) */
    var mec = !r.ok || umax > OPC_EST.fator * diag;
    if (mec) {
      var noM = onde || (/nó ([^,]+),/.exec(String(r.motivo || "")) || [])[1] || null, real = noM ? String(noM).split("#")[0] : null;
      var ms = real ? G.membros.filter(function (m) { return m.nos.indexOf(real) >= 0 || m.segs.some(function (s) { return String(noM).indexOf(s + "#") === 0; }); }) : [];
      var temRig = G.membros.some(function (m) { return m.pontas.ini.tipo === "rigida" || m.pontas.fim.tipo === "rigida"; });
      var sol = [];
      if (G.bases.some(function (b) { return b.tipo !== "engastada"; })) sol.push({ id: "engastar-bases", texto: "Engastar as bases dos pilares (a fundação passa a receber momento)" });
      if (!temRig) sol.push({ id: "ligacoes-rigidas", texto: "Ligações viga × pilar RÍGIDAS (chapa de topo — pórtico)" });
      sol.push({ id: "contraventar", texto: "Desenhar contraventamento (diagonais em X) nos planos que se movem" });
      pro.push({ tipo: "mecanismo", texto: "A estrutura é um MECANISMO: ela se move sem resistir (faltam travamentos, apoios ou ligações rígidas)" + (real ? " — o movimento aparece no nó " + real + (ms.length ? " (" + ms.slice(0, 4).map(function (m) { return m.id + " " + m.nome; }).join("; ") + ")" : "") : "") + ". O cálculo não segue.",
                no: real, pecas: ms.map(function (m) { return m.peca; }), solucoes: sol });
    }
    return { ok: !pro.length, problemas: pro, deslocTeste: umax };
  }

  /* ================================================================ CARGAS DE ÁREA POR FAIXAS
   * area = { id, nome, poligono: [[x, z], …] (planta), cota (m, opcional), vigas: [pecaId…] (opcional), direcao:
   *          "auto"|"x"|"z"|graus, cobertura (bool) }
   * As vigas que recebem são as paralelas à direção (a placa vence o vão entre elas); cada uma leva a faixa até a
   * metade da distância às vizinhas, recortada pelo polígono — estação a estação ao longo da viga. Devolve as
   * cargas por barra (kN/m em PLANTA, para `projetada`) e o balanço (área coberta × área do polígono). */
  function areaPoligono(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function distContorno(P, x, z) {
    var dm = Infinity;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      var t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      dm = Math.min(dm, Math.sqrt(Math.pow(x - a[0] - t * dx, 2) + Math.pow(z - a[1] - t * dz, 2)));
    }
    return dm;
  }
  function dentro(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  /* intervalos (em w) da reta {origem + u·d + w·nrm} dentro do polígono */
  function cortesReta(P, O, d, nrm, u) {
    var ws = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length];
      var au = (a[0] - O[0]) * d[0] + (a[1] - O[1]) * d[1], aw = (a[0] - O[0]) * nrm[0] + (a[1] - O[1]) * nrm[1];
      var bu = (b[0] - O[0]) * d[0] + (b[1] - O[1]) * d[1], bw = (b[0] - O[0]) * nrm[0] + (b[1] - O[1]) * nrm[1];
      if ((au - u) * (bu - u) < 0 || (Math.abs(au - u) < 1e-12 && Math.abs(bu - u) > 1e-12)) { var t = (u - au) / (bu - au); if (t >= 0 && t <= 1) ws.push(aw + t * (bw - aw)); }
    }
    ws.sort(function (x, y) { return x - y; });
    var o = []; for (var k = 0; k + 1 < ws.length; k += 2) o.push([ws[k], ws[k + 1]]);
    return o;
  }
  function casco(pts) {
    var p = pts.map(function (q) { return [Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e6) / 1e6]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var u = []; p.forEach(function (q) { if (!u.length || u[u.length - 1][0] !== q[0] || u[u.length - 1][1] !== q[1]) u.push(q); }); p = u;
    if (p.length < 3) return p;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  /* vigas horizontais (até ~11°) que podem receber área */
  function horizontal(m) { return (m.papelLivre === "viga" || m.papelLivre === "terca") && Math.abs(m.X[1]) < 0.2; }
  /* uma área por nível: o contorno (fecho convexo) das vigas horizontais de cada cota */
  function areasPorNivel(G, tolCota) {
    tolCota = num(tolCota, 0.6);
    var niveis = [];
    G.membros.filter(horizontal).forEach(function (m) {
      var y = (m.a[1] + m.b[1]) / 2, nv = niveis.filter(function (q) { return Math.abs(q.cota - y) <= tolCota; })[0];
      if (!nv) { nv = { cota: y, ms: [] }; niveis.push(nv); }
      nv.ms.push(m); nv.cota = Math.max(nv.cota, y);
    });
    return niveis.sort(function (a, b) { return a.cota - b.cota; }).map(function (nv, k) {
      var pts = []; nv.ms.forEach(function (m) { pts.push([m.a[0], m.a[2]], [m.b[0], m.b[2]]); });
      return { id: "nivel" + (k + 1), nome: "Nível " + br(nv.cota, 2) + " m", cota: r6(nv.cota), poligono: casco(pts), vigas: nv.ms.map(function (m) { return m.peca; }) };
    }).filter(function (a) { return a.poligono.length >= 3 && areaPoligono(a.poligono) > 0.01; });
  }
  /* área definida pelas vigas escolhidas (o contorno delas em planta) */
  function areaDasVigas(G, pecaIds, nome) {
    var ms = G.membros.filter(function (m) { return pecaIds.indexOf(m.peca) >= 0 && horizontal(m); });
    if (!ms.length) return null;
    var pts = []; ms.forEach(function (m) { pts.push([m.a[0], m.a[2]], [m.b[0], m.b[2]]); });
    var cota = Math.max.apply(null, ms.map(function (m) { return (m.a[1] + m.b[1]) / 2; }));
    var P = casco(pts); if (P.length < 3 || areaPoligono(P) < 0.01) return null;
    return { id: "sel" + Date.now().toString(36), nome: nome || "Área das vigas escolhidas", cota: r6(cota), poligono: P, vigas: ms.map(function (m) { return m.peca; }) };
  }
  function distribuirArea(G, area, valores) {
    /* valores: [{ caso, q (kN/m² em projeção), vetor?: função (x, z) → q }] — devolve { cargas: {caso: [carga…]}, resumo } */
    var P = arr(area.poligono).map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }), A = areaPoligono(P);
    var res = { cargas: {}, resumo: { area: A, vigas: [], direcao: null, aplicada: {}, esperada: {}, perdida: 0, avisos: [] } };
    if (P.length < 3 || !(A > 1e-6)) { res.resumo.avisos.push("Área \"" + (area.nome || area.id) + "\" sem polígono válido."); return res; }
    var lista = arr(area.vigas).length ? G.membros.filter(function (m) { return area.vigas.indexOf(m.peca) >= 0 && horizontal(m); }) :
      G.membros.filter(function (m) {
        if (!horizontal(m)) return false;
        var y = (m.a[1] + m.b[1]) / 2; if (area.cota != null && Math.abs(y - num(area.cota, y)) > num(area.tolCota, 0.6)) return false;
        var mid = [(m.a[0] + m.b[0]) / 2, (m.a[2] + m.b[2]) / 2];
        return dentro(P, mid[0], mid[1]) || distContorno(P, mid[0], mid[1]) <= 0.01;   /* a viga da BORDA (no contorno) também recebe */
      });
    if (!lista.length) { res.resumo.avisos.push("Área \"" + (area.nome || area.id) + "\": nenhuma viga horizontal dentro do contorno — a carga não entrou."); return res; }
    /* direções em planta (grupos de vigas paralelas, 2°) */
    /* direção em planta, sentido normalizado; componente abaixo de 1e-5 vira zero — o ruído de micrômetro das pontas
       (as receitas das peças guardam o µm) inclinava a reta das estações e a faixa da borda perdia carga (achado no teste) */
    function dirPl(m) {
      var d = [m.X[0], m.X[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1]); d = [d[0] / l, d[1] / l];
      if (Math.abs(d[0]) < 1e-5) d = [0, d[1] > 0 ? 1 : -1]; else if (Math.abs(d[1]) < 1e-5) d = [d[0] > 0 ? 1 : -1, 0];
      if (d[0] < 0 || (d[0] === 0 && d[1] < 0)) d = [-d[0], -d[1]];
      return d;
    }
    var gruposD = [];
    lista.forEach(function (m) { var d = dirPl(m), g = gruposD.filter(function (q) { return Math.abs(q.d[0] * d[1] - q.d[1] * d[0]) < 0.035; })[0]; if (!g) { g = { d: d, ms: [] }; gruposD.push(g); } g.ms.push(m); });
    function linhas(g) {
      var nrm = [-g.d[1], g.d[0]], ws = g.ms.map(function (m) { return (m.a[0] + m.b[0]) / 2 * nrm[0] + (m.a[2] + m.b[2]) / 2 * nrm[1]; }), u = [];
      ws.slice().sort(function (a, b) { return a - b; }).forEach(function (w) { if (!u.length || w - u[u.length - 1] > 0.01) u.push(w); });
      return u;
    }
    var esc = null, forc = area.direcao;
    if (forc === "x" || forc === "z") esc = gruposD.filter(function (g) { return forc === "x" ? Math.abs(g.d[0]) > 0.99 : Math.abs(g.d[1]) > 0.99; })[0] || null;
    if (!esc) {
      var cand = gruposD.map(function (g) { var ls = linhas(g), mx = 0; for (var k = 1; k < ls.length; k++) mx = Math.max(mx, ls[k] - ls[k - 1]); return { g: g, n: ls.length, vao: ls.length > 1 ? mx : Infinity }; });
      cand.sort(function (a, b) { return (a.vao - b.vao) || (b.n - a.n); });
      esc = cand[0].g;
      if (forc === "x" || forc === "z") res.resumo.avisos.push("Área \"" + (area.nome || area.id) + "\": não há vigas na direção " + forc + " — usada a direção das vigas mais próximas entre si.");
    }
    var d = esc.d, nrm = [-d[1], d[0]], ls = linhas(esc);
    res.resumo.direcao = d; res.resumo.vigas = esc.ms.map(function (m) { return m.id; });
    res.resumo.vaoPlaca = ls.length > 1 ? Math.max.apply(null, ls.slice(1).map(function (w, k) { return w - ls[k]; })) : null;
    var O = [0, 0], uMin = Infinity, uMax = -Infinity;
    P.forEach(function (q) { var u0 = q[0] * d[0] + q[1] * d[1]; uMin = Math.min(uMin, u0); uMax = Math.max(uMax, u0); });
    /* estação exatamente num vértice do contorno (o início e o fim da viga, quase sempre) não corta o polígono:
       ela é avaliada um micro passo para dentro — senão meia estação de cada ponta se perdia (achado no teste) */
    var EPS = 1e-7 * Math.max(1, uMax - uMin);
    valores.forEach(function (v) { res.cargas[v.caso] = res.cargas[v.caso] || []; res.resumo.aplicada[v.caso] = 0; res.resumo.esperada[v.caso] = v.q != null ? v.q * A : null; });
    var coberta = 0;
    esc.ms.forEach(function (m) {
      var wm = (m.a[0] + m.b[0]) / 2 * nrm[0] + (m.a[2] + m.b[2]) / 2 * nrm[1], k = 0;
      for (var q = 0; q < ls.length; q++) if (Math.abs(ls[q] - wm) <= 0.0101) k = q;
      var lo = k > 0 ? (ls[k - 1] + ls[k]) / 2 : -Infinity, hi = k < ls.length - 1 ? (ls[k] + ls[k + 1]) / 2 : Infinity;
      /* estações ao longo de cada barra do membro */
      var x0 = 0;
      m.segs.forEach(function (sid) {
        var B = G.modelo.barras.filter(function (b) { return b.id === sid; })[0], ni = G.noInfo[B.i].P, nj = G.noInfo[B.j].P;
        var Lb = dist(ni, nj), Lpl = Math.sqrt(Math.pow(nj[0] - ni[0], 2) + Math.pow(nj[2] - ni[2], 2)); if (!(Lpl > 1e-6)) return;
        var nS = Math.max(4, Math.ceil(Lpl / 0.25)), wv = [];
        for (var s = 0; s <= nS; s++) {
          var f = s / nS, x = ni[0] + (nj[0] - ni[0]) * f, z = ni[2] + (nj[2] - ni[2]) * f, u = x * d[0] + z * d[1];
          u = Math.min(Math.max(u + EPS, uMin + EPS), uMax - EPS);
          var ivs = cortesReta(P, O, d, nrm, u), larg = 0, cortes = [];
          ivs.forEach(function (iv) { var a2 = Math.max(iv[0], lo), b2 = Math.min(iv[1], hi); if (b2 > a2) { larg += b2 - a2; cortes.push([a2, b2]); } });
          wv.push({ f: f, larg: larg, cortes: cortes, x: x, z: z });
        }
        valores.forEach(function (v) {
          function intensidade(e) {
            if (typeof v.pressao !== "function") return v.q * e.larg;
            var s2 = 0; e.cortes.forEach(function (iv) { for (var t = 0; t < 4; t++) { var w = iv[0] + (t + 0.5) / 4 * (iv[1] - iv[0]), xp = e.x + (w - (e.x * nrm[0] + e.z * nrm[1])) * nrm[0], zp = e.z + (w - (e.x * nrm[0] + e.z * nrm[1])) * nrm[1]; s2 += v.pressao(xp, zp) * (iv[1] - iv[0]) / 4; } });
            return s2;
          }
          for (var s3 = 0; s3 < wv.length - 1; s3++) {
            var qa = intensidade(wv[s3]), qb = intensidade(wv[s3 + 1]);
            if (Math.abs(qa) < 1e-12 && Math.abs(qb) < 1e-12) continue;
            var dirF = v.direcao || [0, -1, 0];
            res.cargas[v.caso].push({ tipo: "barra", barra: sid, q: mul(dirF, qa), q2: mul(dirF, qb), a: wv[s3].f, b: wv[s3 + 1].f, projetada: true, area: area.id });
            res.resumo.aplicada[v.caso] += (qa + qb) / 2 * Lpl * (wv[s3 + 1].f - wv[s3].f);
          }
        });
        for (var s4 = 0; s4 < wv.length - 1; s4++) coberta += (wv[s4].larg + wv[s4 + 1].larg) / 2 * Lpl * (wv[s4 + 1].f - wv[s4].f);
        x0 += Lb;
      });
    });
    res.resumo.coberta = coberta; res.resumo.perdida = Math.max(0, A - coberta);
    if (res.resumo.perdida > 0.01 * A + 1e-6) res.resumo.avisos.push("Área \"" + (area.nome || area.id) + "\": " + br(res.resumo.perdida, 2) + " m² de " + br(A, 2) + " m² não ficam sobre nenhuma viga na direção da placa — a carga dessa parte NÃO entrou (estenda as vigas ou ajuste o contorno).");
    return res;
  }

  /* ================================================================ ESCADAS (SIMULAÇÃO S3, 14/10/2026)
   * As longarinas de escada (papel "Longarina…", js/metalprontas.js) aos PARES (paralelas, a 0,4–3 m uma da outra em
   * planta): a largura entre elas, o comprimento em planta e o peso REAL dos degraus que ficam entre elas (as chapas do
   * modelo, kg → kN/m²). escadas(caixas, G) → [{ id, nome, pecas: [2 ids], largura, Lplanta, g, nDegraus }]
   * cargas(): cfg.escadas = [{ id, nome, pecas, largura, g, gCategoria, uso, qInformado }] → cada longarina leva
   * (g + q)·largura/2 por metro em PLANTA (carga vertical projetada). */
  function escadas(caixas, G) {
    var lon = arr(G && G.membros).filter(function (m) { var p = arr(G.pecas).filter(function (q) { return q.id === m.peca; })[0]; return p && /^Longarina/i.test(String(p.papelBim || "")); });
    var usados = {}, out = [];
    lon.forEach(function (A) {
      if (usados[A.peca]) return;
      var hA = [A.X[0], A.X[2]], lA = Math.sqrt(hA[0] * hA[0] + hA[1] * hA[1]); if (lA < 1e-6) return; hA = [hA[0] / lA, hA[1] / lA];
      var melhor = null;
      lon.forEach(function (B) {
        if (B === A || usados[B.peca] || Math.abs(dot(A.X, B.X)) < 0.99) return;
        var d = [B.a[0] - A.a[0], B.a[2] - A.a[2]], perp = Math.abs(d[0] * hA[1] - d[1] * hA[0]), yA = Math.min(A.a[1], A.b[1]), yB = Math.min(B.a[1], B.b[1]);
        if (perp < 0.4 || perp > 3 || Math.abs(yA - yB) > 0.1) return;
        if (!melhor || perp < melhor.perp) melhor = { B: B, perp: perp };
      });
      if (!melhor) return;
      usados[A.peca] = usados[melhor.B.peca] = true;
      var Lp = lA * A.L, n0 = [-hA[1], hA[0]], w0 = A.a[0] * n0[0] + A.a[2] * n0[1], w1 = melhor.B.a[0] * n0[0] + melhor.B.a[2] * n0[1], u0 = Math.min(A.a[0] * hA[0] + A.a[2] * hA[1], A.b[0] * hA[0] + A.b[2] * hA[1]);
      var kg = 0, nD = 0;
      arr(caixas).forEach(function (c) {
        if (!c || !c.metal || c.metal.kind !== "chapa" || !/^Degrau/i.test(String(c.metal.papel || ""))) return;
        var x = num(c.cx, NaN), z = num(c.cz, NaN); if (!fin(x) || !fin(z)) return;
        var w = x * n0[0] + z * n0[1], u = x * hA[0] + z * hA[1];
        if (w < Math.min(w0, w1) - 0.05 || w > Math.max(w0, w1) + 0.05 || u < u0 - 0.5 || u > u0 + Lp + 0.5) return;
        kg += num(c.massa, 0); nD++;
      });
      var larg = melhor.perp;
      out.push({ id: "esc" + (out.length + 1), nome: "Escada " + (out.length + 1) + " (" + A.id + " e " + melhor.B.id + ")", pecas: [A.peca, melhor.B.peca], largura: r6(larg), Lplanta: r6(Lp),
                 g: nD ? Math.round(kg * 9.80665 / 1000 / (larg * Lp) * 1000) / 1000 : 0, nDegraus: nD, kgDegraus: Math.round(kg * 10) / 10 });
    });
    return out;
  }

  /* ================================================================ VENTO (opcional — estrutura fechada/coberta)
   * O contorno em planta da estrutura (caixa x × z) é a edificação da NBR 6123: faces frente (z mín.), fundo (z máx.),
   * esquerda (x mín.), direita (x máx.). As paredes fechadas levam o vento aos PILARES da face por faixa de
   * influência; a cobertura (as áreas marcadas "cobertura"), às vigas por faixas, normal à cobertura. */
  function ventoLivre(G, cfg) {
    var Vn = Ven(); if (!Vn) return { ok: false, motivo: "Motor de vento (js/acovento.js) não carregado." };
    /* REVISÃO S5 C2/A3 (14/10/2026): com o envoltório, a caixa é a do contorno dos pilares (cfg.caixa) — não a de todas as
       barras (o beiral e um segundo bloco aumentavam a caixa) */
    var L = G.layout, cxV = cfg.caixa || null, x0 = cxV ? cxV.x0 : L.mn[0], x1 = cxV ? cxV.x1 : L.mx[0], z0 = cxV ? cxV.z0 : L.mn[2], z1 = cxV ? cxV.z1 : L.mx[2], b = x1 - x0, a = z1 - z0;
    if (!(b > 0.5 && a > 0.5)) return { ok: false, motivo: "Vento: a estrutura não tem contorno em planta (largura e comprimento) para a NBR 6123." };
    var pil = G.membros.filter(function (m) { return m.papelLivre === "pilar"; });
    var h = num(cfg.h, pil.length ? Math.max.apply(null, pil.map(function (m) { return Math.max(m.a[1], m.b[1]); })) - Math.min(0, L.mn[1]) : L.H);
    var faces = {}, abertas = 0;
    ["frente", "fundo", "esquerda", "direita"].forEach(function (f) { var fc = (cfg.faces || {})[f] || {}; if (fc.fechada) faces[f] = { fechada: true, vedacao: fc.vedacao || "telha", aberturas: arr(fc.aberturas) }; else { faces[f] = { fechada: false }; abertas++; } });
    var inc = num(cfg.inclinacaoGraus, 0);
    /* PÓRTICOS M4 (14/10/2026): duas águas SIMÉTRICAS (o envoltório conferiu a forma — js/acoenvoltorio.js formaCobertura) vão
       à Tabela 5 do motor, com a cumeeira no meio do vão (b/2); o resto, como sempre, é uma água (Tabela 6) */
    var duasV = cfg.cobertura === "duas-aguas";
    var ent = { local: { lat: cfg.lat, lon: cfg.lon, v0: cfg.v0, descricao: cfg.endereco }, s1: cfg.s1 || { tipo: "plano" }, categoria: cfg.categoria || "II", grupoS3: num(cfg.grupoS3, 2),
                geometria: { a: a, b: b, h: h, hCumeeira: h + (duasV ? b / 2 : b) * Math.tan(inc * Math.PI / 180), inclinacaoGraus: inc, cobertura: duasV ? "duas-aguas" : "uma-agua", ladoAlto: duasV ? undefined : (cfg.ladoAlto === "esquerda" ? "esquerda" : "direita"), aberta: abertas === 4 }, faces: faces };
    var R = Vn.calcular(ent, { isopletas: Iso(), todasDirecoes: true });
    if (!R || !R.ok) return { ok: false, motivo: R && R.erros ? R.erros.join("; ") : "falha no cálculo do vento", resultado: R };
    var casos = [], cont = {};
    R.casos.forEach(function (c) { var base = "W" + c.direcao; cont[base] = (cont[base] || 0) + 1; casos.push({ id: base + String.fromCharCode(96 + cont[base]), nome: c.nome, direcao: c.direcao, cpi: c.cpi, origem: c.id, c: c }); });
    function noIntervalo(u, s0, s1) { return u >= s0 - 1e-6 && u <= s1 + 1e-6; }
    function pParede(c, face, s) { var P = c.pressao.paredes && c.pressao.paredes[face]; if (!P) return 0; for (var j = 0; j < P.length; j++) if (noIntervalo(s, P[j].s0, P[j].s1)) return num(P[j].p, 0); return 0; }
    function pCob(c, x, z) { var Lc = c.pressao.cobertura || []; for (var k = 0; k < Lc.length; k++) { var zz = Lc[k]; if (noIntervalo(x, zz.x0, zz.x1) && noIntervalo(z, zz.z0, zz.z1)) return (zz.p0 != null && zz.p1 != null && zz.x1 > zz.x0) ? zz.p0 + (zz.p1 - zz.p0) * (x - zz.x0) / (zz.x1 - zz.x0) : num(zz.p, 0); } return 0; }
    return { ok: true, resultado: R, casos: casos, x0: x0, z0: z0, b: b, a: a, h: h, pParede: pParede, pCob: pCob, faces: faces, cobertura: duasV ? "duas-aguas" : "uma-agua",
             tg: duasV ? Math.tan(inc * Math.PI / 180) : 0, incGraus: inc, ladoAlto: duasV ? null : (cfg.ladoAlto === "esquerda" ? "esquerda" : "direita"), yBase: cfg.yBase != null && isFinite(+cfg.yBase) ? +cfg.yBase : null, avisos: arr(R.avisos).map(function (x) { return "Vento: " + x; }) };
  }

  /* terças/travessas (papel "terca") que tocam as faixas do cpe médio: cobertura (R.zonas.locais.cobertura, x e z da caixa)
     e paredes (faixas nas pontas de cada face fechada, s ao longo da face) */
  function fcp(v, c) { var s = br(v, c == null ? 2 : c); return v < 0 ? "−" + s.replace("-", "") : s; }
  function tercasNaBorda(G, VL) {
    var lc = VL && VL.resultado && VL.resultado.zonas && VL.resultado.zonas.locais, out = [];
    if (!lc) return out;
    var ipDeP = {}, nosPeca = {}; arr(G.pecas).forEach(function (pc, i) { ipDeP[pc.id] = i; }); G.membros.forEach(function (mm) { if (ipDeP[mm.peca] != null) nosPeca[ipDeP[mm.peca]] = arr(mm.nos); });
    /* 1.2.148 — cada terça/travessa nas faixas, com o PAPEL de cada fechamento que ela segura: travessa (parede), terça
       (cobertura) ou as DUAS (a terça do beiral, na linha da parede e no topo dela: soma as duas cargas, a favor da segurança).
       Por papel: a faixa de influência (metade da distância até a vizinha paralela; na parede, metade até a base, que apoia o
       fechamento; borda livre da cobertura e topo da parede: até a borda), o cpe médio da faixa (já com q da classe A e o cpi
       mais desfavorável) e o cpe da zona de cada caso escalado para a classe A (NBR 6123:2023, 6.1.3) — vale o PIOR. */
    var R = VL.resultado, qA = num(R.qLocal, 0), terc = G.membros.filter(function (m) { return m.papelLivre === "terca"; });
    /* #49 (16/10/2026) — a inclinação REAL da água: na de uma água VL.tg é 0 (o motor de vento usa a Tabela 6 sem ela), mas a
       faixa ao longo da água e a NORMAL da cobertura dependem dela (antes a de uma água via a telha horizontal) */
    var tgR = VL.cobertura === "duas-aguas" ? num(VL.tg, 0) : Math.tan(num(VL.incGraus, 0) * Math.PI / 180);
    var yRef = VL.yBase != null ? VL.yBase : Math.min(0, G.layout.mn[1]), cosT = 1 / Math.sqrt(1 + tgR * tgR), sinT = tgR * cosT, yBeiral = yRef + VL.h;
    /* #49 b) DIREÇÃO de cada papel, para a verificação local decompor a carga nos eixos da peça (antes tudo ia para o eixo
       forte — a parede, horizontal, na terça do beiral de alma normal à água é quase toda EIXO FRACO): sucção = para FORA.
       Parede: a normal externa da face. Cobertura: a normal externa da água (a cumeeira no meio do vão, NBR 6123:2023 Tabela 5;
       uma água subindo para o lado alto, Tabela 6). */
    function dirParede(face) { return face === "esquerda" ? [-1, 0, 0] : face === "direita" ? [1, 0, 0] : face === "frente" ? [0, 0, -1] : [0, 0, 1]; }
    function dirCob(m) {
      var xm = (m.a[0] + m.b[0]) / 2 - VL.x0, sx;
      if (VL.cobertura === "duas-aguas") sx = xm <= VL.b / 2 ? -1 : 1;
      else sx = VL.ladoAlto === "esquerda" ? 1 : -1;
      return [sx * sinT, cosT, 0];
    }
    function sob(a0, a1, b0, b1) { return Math.min(Math.max(a0, a1), b1) - Math.max(Math.min(a0, a1), b0) > 1e-6; }
    function eixoX(m) { return Math.abs(m.b[0] - m.a[0]) >= Math.abs(m.b[2] - m.a[2]); }
    function naFaceDe(m) { var o = null; [["esquerda", 0, VL.x0], ["direita", 0, VL.x0 + VL.b], ["frente", 2, VL.z0], ["fundo", 2, VL.z0 + VL.a]].forEach(function (f) { if (!o && VL.faces[f[0]] && VL.faces[f[0]].fechada && Math.abs(m.a[f[1]] - f[2]) < 0.3 && Math.abs(m.b[f[1]] - f[2]) < 0.3) o = f[0]; }); return o; }
    function noBeiral(m) { return Math.min(m.a[1], m.b[1]) >= yBeiral - 0.3; }
    /* só segura a TELHA a peça que não tem outra terça/viga logo acima (mesma posição em planta): a escora do banzo de baixo,
       o travamento abaixo do telhado etc. não são terças de cobertura */
    var horiz = G.membros.filter(function (o) { return (o.papelLivre === "terca" || o.papelLivre === "viga") && Math.abs(o.a[1] - o.b[1]) < 0.5 + 0.2 * Math.max(Math.abs(o.b[0] - o.a[0]), Math.abs(o.b[2] - o.a[2])); });
    function cobertoPorOutro(m) {
      var ex = eixoX(m), ax = ex ? 0 : 2, pp = ex ? 2 : 0, c = (m.a[pp] + m.b[pp]) / 2, y = (m.a[1] + m.b[1]) / 2, a0 = Math.min(m.a[ax], m.b[ax]), a1 = Math.max(m.a[ax], m.b[ax]);
      return horiz.some(function (o) {
        if (o === m) return false;
        var o0 = Math.min(o.a[ax], o.b[ax]), o1 = Math.max(o.a[ax], o.b[ax]), co0 = Math.min(o.a[pp], o.b[pp]) - 0.3, co1 = Math.max(o.a[pp], o.b[pp]) + 0.3;
        if (Math.min(o1, a1) - Math.max(o0, a0) < 0.05 || c < co0 || c > co1) return false;
        var f = Math.abs(o.b[pp] - o.a[pp]) > 1e-6 ? (c - o.a[pp]) / (o.b[pp] - o.a[pp]) : 0.5, yo = o.a[1] + Math.max(0, Math.min(1, f)) * (o.b[1] - o.a[1]);
        return yo > y + 0.3;
      });
    }
    function sFace(face) { return face === "esquerda" || face === "direita" ? 2 : 0; }
    function pZona(m, face) {
      var pz = 0;
      VL.casos.forEach(function (vc) {
        var fq = qA > 0 && vc.c.q > 0 ? Math.max(1, qA / vc.c.q) : 1;
        for (var k = 0; k < 5; k++) { var f = (k + 0.5) / 5, x = m.a[0] + f * (m.b[0] - m.a[0]) - VL.x0, z = m.a[2] + f * (m.b[2] - m.a[2]) - VL.z0;
          var pv = face ? VL.pParede(vc.c, face, sFace(face) === 2 ? z : x) : VL.pCob(vc.c, x, z); if (pv * fq < pz) pz = pv * fq; }
      });
      return pz;
    }
    function faixaInf(m, face) {
      var ex = eixoX(m), ax = ex ? 0 : 2, pp = face ? 1 : (ex ? 2 : 0), c = (m.a[pp] + m.b[pp]) / 2, a0 = Math.min(m.a[ax], m.b[ax]), a1 = Math.max(m.a[ax], m.b[ax]);
      var lo = face ? yRef : (pp === 0 ? VL.x0 : VL.z0), hi = face ? yBeiral + (VL.tg || 0) * (sFace(face) === 0 ? VL.b / 2 : 0) : (pp === 0 ? VL.x0 + VL.b : VL.z0 + VL.a), dn = null, up = null;
      terc.forEach(function (o) {
        if (o === m || eixoX(o) !== ex) return;
        if (face ? naFaceDe(o) !== face : (naFaceDe(o) && !noBeiral(o))) return;
        if (Math.min(Math.max(o.a[ax], o.b[ax]), a1) - Math.max(Math.min(o.a[ax], o.b[ax]), a0) < 0.05) return;
        var co = (o.a[pp] + o.b[pp]) / 2; if (Math.abs(co - c) < 0.05) return;
        if (co < c && (dn === null || co > dn)) dn = co; if (co > c && (up === null || co < up)) up = co;
      });
      var sDn = dn === null ? (face ? (c - lo) / 2 : c - lo) : (c - dn) / 2, sUp = up === null ? hi - c : (up - c) / 2;
      var s = Math.max(0, sDn) + Math.max(0, sUp); return face ? s : s / cosT;
    }
    terc.forEach(function (m) {
      var xa = m.a[0] - VL.x0, xb = m.b[0] - VL.x0, za = m.a[2] - VL.z0, zb = m.b[2] - VL.z0, face = naFaceDe(m), papeis = [];
      if (face) {
        var sa = sFace(face) === 2 ? za : xa, sb = sFace(face) === 2 ? zb : xb, pw = null;
        arr((lc.paredes || {})[face]).forEach(function (f) { if (isFinite(f.p) && sob(sa, sb, f.s0, f.s1) && (!pw || f.p < pw.p)) pw = { zona: "faixa de borda da parede " + face, cpe: f.cpe, p: f.p }; });
        if (pw) papeis.push({ tipo: "parede", face: face, zona: pw.zona, cpe: pw.cpe, p: pw.p, dir: dirParede(face) });
      }
      if ((!face || noBeiral(m)) && !cobertoPorOutro(m)) {
        var pr = null, xx0 = Math.min(xa, xb), xx1 = Math.max(xa, xb), zz0 = Math.min(za, zb), zz1 = Math.max(za, zb);
        arr(lc.cobertura).forEach(function (r) {
          var toca = (xx1 - xx0 < 1e-6 ? xx0 >= r.x0 - 1e-6 && xx0 <= r.x1 + 1e-6 : sob(xx0, xx1, r.x0, r.x1)) && (zz1 - zz0 < 1e-6 ? zz0 >= r.z0 - 1e-6 && zz0 <= r.z1 + 1e-6 : sob(zz0, zz1, r.z0, r.z1));
          if (isFinite(r.p) && toca && (!pr || r.p < pr.p)) pr = { zona: "cobertura, " + r.zona, cpe: r.cpe, p: r.p };
        });
        if (pr) papeis.push({ tipo: "cobertura", face: null, zona: pr.zona, cpe: pr.cpe, p: pr.p, dir: dirCob(m) });
      }
      if (!papeis.length) return;
      var wL = 0;
      papeis.forEach(function (q) { q.s = faixaInf(m, q.face); q.pZonaA = pZona(m, q.face); q.pUso = Math.min(q.p, q.pZonaA); q.governa = q.pUso < q.p - 1e-9 ? "zona (classe A)" : "cpe médio"; wL += Math.abs(q.pUso) * q.s; });
      var pior = papeis.slice().sort(function (a, b) { return a.p - b.p; })[0];
      /* vão: entre os APOIOS (nós onde passa ou termina viga/pilar, mais as pontas) — nó de diagonal não apoia */
      var ipT = arr(G.pecas).map(function (pc) { return pc.id; }).indexOf(m.peca), nosM = arr(m.nos);
      var apo = nosM.filter(function (id, k) {
        if (k === 0 || k === nosM.length - 1) return true; var I = G.noInfo[id]; if (!I) return false;
        return arr(I.ends).map(function (e) { return e.ip; }).concat(arr(I.passa)).some(function (ip) { if (ip === ipT || !G.pecas[ip]) return false; var pp = G.pecas[ip].papel; return pp === "viga" || pp === "pilar"; });
      });
      /* #49 e) (16/10/2026, decisão da gerência) — EIXO FRACO travado pelas LINHAS DE CORRENTE do modelo: barra redonda/tirante
         ligada à terça (no meio da alma, transversal a ela). Só conta a linha ANCORADA até um ponto rígido — seguindo só pelas
         barras redondas a partir da terça, chegar a um nó com viga/pilar (o pórtico: a corrente diagonal da cumeeira) ou
         contraventamento de perfil, ou a um apoio. Linha que só vai de terça a terça (até a cumeeira sem diagonal) não trava:
         a força dela não tem para onde ir. Vão do eixo fraco = o maior trecho entre apoios e correntes ancoradas. */
      function noEh(ip0) { var pc = G.pecas[ip0]; return pc && (pc.tracao || (pc.sec && pc.sec.forma === "circ")) && pc.papel !== "pilar"; }
      function pecasNo(no0) { var I0 = G.noInfo[no0]; return I0 ? I0.ends.map(function (e) { return e.ip; }).concat(arr(I0.passa)) : []; }
      /* a LINHA: as barras redondas transversais à terça (de terça a terça, ao longo da água) a partir do nó; a ANCORAGEM: um nó
         da linha num ponto rígido (viga/pilar — o pórtico —, contraventamento de perfil, apoio) ou uma barra redonda vizinha à
         linha (a corrente diagonal da cumeeira) que chega a um ponto rígido. Nada além de um salto: o X do telhado não ancora a
         linha por tabela. */
      /* REVISOR (16/10, ALTO — contra a segurança): (1) RÍGIDO é só apoio, pilar, contraventamento de perfil ou a viga que encosta
         num pilar (a do pórtico) — a terça desenhada como "viga" entre vigas não é ponto rígido; (2) a LINHA para na cumeeira:
         segue só pelas barras colineares (a da outra água tem outra direção) — cada água precisa da PRÓPRIA ancoragem; (3) a
         corrente é só de TRAÇÃO: ela tem de puxar a terça CONTRA a carga do eixo fraco (sentido r = −sinal(F·ez)·ez); a ancoragem
         conta só no sentido r e a diagonal só se estiver TRACIONADA nesse sentido (u·r > 0,2) — comprimida, a barra redonda sai
         do modelo e não segura nada. OPC_COR.sentido = false só no controle negativo dos testes. */
      function vigaDoPortico(ip0) { return (nosPeca[ip0] || []).some(function (n2) { return pecasNo(n2).some(function (ip2) { return ip2 !== ip0 && G.pecas[ip2] && G.pecas[ip2].papel === "pilar"; }); }); }
      function rigido(nq) {
        if (G.apoiosNo && G.apoiosNo[nq]) return "apoio";
        var o = null; pecasNo(nq).forEach(function (ip0) { var pc = G.pecas[ip0]; if (o || !pc || noEh(ip0)) return;
          if (pc.papel === "pilar") o = "o pilar (" + pc.mid + ")";
          else if (pc.papel === "diagonal") o = "o contraventamento (" + pc.mid + ")";
          else if (pc.papel === "viga" && vigaDoPortico(ip0)) o = "o pórtico (" + pc.mid + ")"; });
        return o;
      }
      function posNo(n2) { return G.noInfo[n2] ? G.noInfo[n2].P : null; }
      function linhaCorrente(no0, r) {
        var visto = {}, fila = [no0], linha = [], linhaTr = [], nosL = [], anc = false, onde = null, diag = [], Xl = null, P0 = posNo(no0), sent = OPC_COR.sentido !== false;
        function lado(P) { return !r || !P ? 1 : dot3([P[0] - P0[0], P[1] - P0[1], P[2] - P0[2]], r); }
        visto[no0] = 1;
        while (fila.length) {
          var nq = fila.shift(); nosL.push(nq);
          pecasNo(nq).forEach(function (ip0) {
            var pc = G.pecas[ip0]; if (!noEh(ip0) || ip0 === ipT || Math.abs(dot3(pc.X, m.X)) >= 0.5) return;
            if (Xl && sent && Math.abs(dot3(pc.X, Xl)) < 0.95) return;   /* outra direção: a linha da outra água (passou da cumeeira) */
            if (linha.indexOf(pc.mid) < 0) {
              linha.push(pc.mid); if (!Xl) Xl = pc.X;
              var ns = nosPeca[ip0] || [], Pa = posNo(ns[0]), Pb = posNo(ns[ns.length - 1]);
              if (!sent || !r || (Pa && Pb && lado([(Pa[0] + Pb[0]) / 2, (Pa[1] + Pb[1]) / 2, (Pa[2] + Pb[2]) / 2]) > 1e-6)) linhaTr.push(pc.mid);   /* só o trecho do lado da ancoragem leva a reação */
            }
            (nosPeca[ip0] || []).forEach(function (n2) { if (!visto[n2]) { visto[n2] = 1; fila.push(n2); } });
          });
        }
        nosL.forEach(function (nq) {
          var Pq = posNo(nq); if (sent && r && lado(Pq) < -1e-6) return;   /* atrás da terça: não segura no sentido da puxada */
          if (nq !== no0) { var r0 = rigido(nq); if (r0) { anc = true; onde = onde || r0; } }
          var aqui = [];
          pecasNo(nq).forEach(function (ip0) {
            var pc = G.pecas[ip0]; if (!noEh(ip0) || ip0 === ipT || linha.indexOf(pc.mid) >= 0) return;
            var outro = (nosPeca[ip0] || []).filter(function (n2) { return n2 !== nq; }), r1 = null, n1 = null;
            outro.forEach(function (n2) { if (!r1) { r1 = rigido(n2); n1 = n2; } });
            if (!r1) return;
            var P1 = posNo(n1), du = P1 && Pq ? [P1[0] - Pq[0], P1[1] - Pq[1], P1[2] - Pq[2]] : null, nu = du ? Math.sqrt(dot3(du, du)) : 0, u = nu > 0 ? [du[0] / nu, du[1] / nu, du[2] / nu] : null;
            var cosR = u && r ? dot3(u, r) : (u && Xl ? Math.abs(dot3(u, Xl)) : 1);
            if (sent && r && !(cosR > 0.2)) return;   /* comprimida no sentido da puxada: não trabalha */
            aqui.push({ mid: pc.mid, cos: Math.abs(cosR), onde: r1 });
          });
          aqui.forEach(function (d) { anc = true; onde = onde || ("a corrente diagonal " + d.mid + " (tracionada) até " + d.onde); diag.push({ mid: d.mid, cos: d.cos, n: aqui.length }); });
        });
        return { ancorada: anc, onde: onde, barras: linha, barrasTr: linhaTr, diagonais: diag };
      }
      /* o sentido da reação do eixo fraco: a carga dos papéis (sucção para fora) na direção ez da peça; a corrente puxa contra ela */
      var Fv = [0, 0, 0]; papeis.forEach(function (q) { var d = q.dir, w0 = Math.abs(num(q.pUso, 0)) * num(q.s, 0); if (d && d.length === 3) { Fv[0] += w0 * d[0]; Fv[1] += w0 * d[1]; Fv[2] += w0 * d[2]; } });
      var eyM = m.ey || [0, 1, 0], ezM = [m.X[1] * eyM[2] - m.X[2] * eyM[1], m.X[2] * eyM[0] - m.X[0] * eyM[2], m.X[0] * eyM[1] - m.X[1] * eyM[0]], Fz = dot3(Fv, ezM);
      var rPux = Math.abs(Fz) > 1e-9 ? [-Math.sign(Fz) * ezM[0], -Math.sign(Fz) * ezM[1], -Math.sign(Fz) * ezM[2]] : null;
      var corr = [];
      nosM.forEach(function (id, k) {
        if (k === 0 || k === nosM.length - 1) return;
        var liga = pecasNo(id).some(function (ip0) { var pc = G.pecas[ip0]; return ip0 !== ipT && noEh(ip0) && pc && Math.abs(dot3(pc.X, m.X)) < 0.5; });
        if (!liga) return;
        var P = G.noInfo[id].P, sP = dot3([P[0] - m.a[0], P[1] - m.a[1], P[2] - m.a[2]], m.X), ln = linhaCorrente(id, rPux);
        corr.push({ no: id, s: sP, ancorada: ln.ancorada, onde: ln.onde, barras: ln.barras, barrasTr: ln.barrasTr, diagonais: ln.diagonais });
      });
      var ptsZ = apo.map(function (id) { var P = G.noInfo[id].P; return dot3([P[0] - m.a[0], P[1] - m.a[1], P[2] - m.a[2]], m.X); });
      corr.forEach(function (c) { if (c.ancorada) ptsZ.push(c.s); });
      ptsZ.sort(function (a, b) { return a - b; });
      var Lz = 0; for (var kz = 1; kz < ptsZ.length; kz++) Lz = Math.max(Lz, ptsZ[kz] - ptsZ[kz - 1]);
      var nAnc = corr.filter(function (c) { return c.ancorada; }).length;
      var Ls = 0; for (var k2 = 1; k2 < apo.length; k2++) { var P0 = G.noInfo[apo[k2 - 1]].P, P1 = G.noInfo[apo[k2]].P; Ls = Math.max(Ls, Math.sqrt(Math.pow(P1[0] - P0[0], 2) + Math.pow(P1[1] - P0[1], 2) + Math.pow(P1[2] - P0[2], 2))); }
      out.push({ peca: String(m.peca), mid: m.id, zona: papeis.map(function (q) { return q.zona; }).join(" + "), cpe: pior.cpe, p: pior.p, papeis: papeis,
                 wLinha: wL, pUso: Math.min.apply(null, papeis.map(function (q) { return q.pUso; })), s: papeis.reduce(function (a, q) { return a + q.s; }, 0),
                 governa: papeis.map(function (q) { return q.governa; }).join(" + "), Ls: Ls > 0 ? Ls : m.L, continua: apo.length > 2,
                 Lz: OPC_COR.correntes && nAnc && Lz > 0 ? Math.min(Lz, Ls > 0 ? Ls : m.L) : (Ls > 0 ? Ls : m.L), correntes: corr, correntesAncoradas: OPC_COR.correntes ? nAnc : 0 });
    });
    var vistos = {}; return out.filter(function (q) { if (vistos[q.peca]) return false; vistos[q.peca] = true; return true; });
  }

  /* ================================================================ CASOS DE CARGA
   * cfg = { acrescimoLigacoes (0,05), areas: [{ …área, g (kN/m²), gCategoria ("G-geral"|"G-insitu"|"G-industrializado"), gTexto,
   *         uso (id da Tabela 10), qInformado, alturaEstoque, cobertura (bool), inclinacaoPct }],
   *         pontuais: [{ peca, s (m), F: [Fx, Fy, Fz] (kN), caso: "G"|"Q", nome }], vento: { … } | null } */
  function cargas(G, cfg) {
    cfg = cfg || {};
    var mod = G.modelo, casos = [], decisoes = G.decisoes, avisos = G.avisos, resumo = { areas: [], pontuais: [], acrescimo: num(cfg.acrescimoLigacoes, 0.05), usos: [], vento: null };
    var acr = 1 + resumo.acrescimo;
    casos.push({ id: "G", tipo: "G", categoria: "G-metalica", nome: "Permanente — peso próprio da estrutura de aço", cargas: [{ tipo: "pesoProprio", fator: acr }] });
    decisoes.push({ tema: "Peso próprio", decisao: "perfis × 78,5 kN/m³ × " + br(acr, 2) + " (acréscimo de " + br(resumo.acrescimo * 100, 0) + " % de chapas, parafusos e soldas das ligações)", motivo: "NBR 6120:2019, Tabela 1 (aço); o acréscimo é premissa de projeto (o mesmo do galpão), editável" });
    var gCasos = {}, qCasos = {}, nQ = 0;
    function casoG(cat) { var c = CAT_G[cat] || CAT_G["G-geral"], k = cat in CAT_G ? cat : "G-geral"; if (!gCasos[k]) { gCasos[k] = { id: c.id, tipo: "G", categoria: k, nome: c.nome, cargas: [] }; casos.push(gCasos[k]); } return gCasos[k]; }
    function casoQ(u, rotulo) {
      var k = u.psi + "|" + u.id;
      if (!qCasos[k]) { nQ++; qCasos[k] = { id: nQ === 1 ? "Q" : "Q" + nQ, tipo: "Q", categoria: u.psi, nome: "Sobrecarga de uso — " + rotulo, cargas: [] }; casos.push(qCasos[k]); }
      return qCasos[k];
    }
    arr(cfg.areas).forEach(function (ar) {
      var vals = [], ra = { id: ar.id, nome: ar.nome || ar.id, area: areaPoligono(arr(ar.poligono)), g: num(ar.g, 0), gCategoria: ar.gCategoria || "G-geral", gTexto: ar.gTexto || "", uso: null, cobertura: !!ar.cobertura };
      if (ra.g > 0) vals.push({ caso: casoG(ra.gCategoria).id, q: ra.g });
      if (ar.uso) {
        var u = usoCarga(ar);
        if (!u.ok) { G.problemas.push({ tipo: "carga", texto: "Área \"" + ra.nome + "\": " + u.motivo, solucoes: [] }); }
        else {
          ra.uso = { id: u.uso.id, q: u.q, texto: u.texto, referencia: u.referencia, psi: u.psi, psiTexto: u.psiTexto, avisos: u.avisos };
          u.avisos.forEach(function (x) { var t = "Área \"" + ra.nome + "\": " + x; if (avisos.indexOf(t) < 0) avisos.push(t); });
          if (u.q > 0) vals.push({ caso: casoQ(u.uso, u.uso.local.toLowerCase()).id, q: u.q });
        }
      }
      if (!vals.length) { resumo.areas.push(ra); return; }
      var dist0 = distribuirArea(G, ar, vals);
      Object.keys(dist0.cargas).forEach(function (cid) { var c = casos.filter(function (x) { return x.id === cid; })[0]; dist0.cargas[cid].forEach(function (q) { c.cargas.push(q); }); });
      ra.distribuicao = dist0.resumo; dist0.resumo.avisos.forEach(function (x) { avisos.push(x); });
      resumo.areas.push(ra);
    });
    /* SIMULAÇÃO S3: escadas */
    resumo.escadas = [];
    arr(cfg.escadas).forEach(function (es) {
      var L = num(es.largura, 0), g0 = num(es.g, 0), ms = G.membros.filter(function (m) { return arr(es.pecas).indexOf(m.peca) >= 0; });
      if (!(L > 0) || ms.length < 1) { avisos.push("Escada \"" + (es.nome || es.id) + "\": longarinas ou largura não encontradas — a carga dela NÃO entrou."); return; }
      var re = { id: es.id, nome: es.nome || es.id, largura: L, g: g0, uso: null, longarinas: ms.map(function (m) { return m.id; }) };
      var vals = [];
      if (g0 > 0) vals.push({ caso: casoG(es.gCategoria || "G-industrializado").id, w: g0 * L / 2 });
      if (es.uso) { var u = usoCarga(es); if (!u.ok) G.problemas.push({ tipo: "carga", texto: "Escada \"" + re.nome + "\": " + u.motivo, solucoes: [] }); else { re.uso = { id: u.uso.id, q: u.q, texto: u.texto, referencia: u.referencia }; if (u.q > 0) vals.push({ caso: casoQ(u.uso, u.uso.local.toLowerCase() + " (escada)").id, w: u.q * L / 2 }); } }
      vals.forEach(function (v) { var c = casos.filter(function (x) { return x.id === v.caso; })[0]; ms.forEach(function (m) { m.segs.forEach(function (sid) { c.cargas.push({ tipo: "barra", barra: sid, q: [0, -v.w, 0], q2: [0, -v.w, 0], a: 0, b: 1, projetada: true, escada: es.id }); }); }); });
      resumo.escadas.push(re);
    });
    if (resumo.escadas.length) decisoes.push({ tema: "Escadas", decisao: resumo.escadas.map(function (e) { return e.nome + ": largura " + br(e.largura, 2) + " m, degraus " + br(e.g, 3) + " kN/m²" + (e.uso ? ", uso " + br(e.uso.q, 2) + " kN/m² (" + e.uso.referencia + ")" : ""); }).join("; "),
      motivo: "cada longarina leva (g + q)·largura/2 por metro em planta (carga vertical projetada); o peso dos degraus é o das chapas do modelo; o pé apoia no piso" });
    if (resumo.areas.length) decisoes.push({ tema: "Cargas de área", decisao: resumo.areas.map(function (ra) { return ra.nome + ": " + (ra.g ? "g = " + br(ra.g, 2) + " kN/m²" : "sem revestimento") + (ra.uso ? ", q = " + br(ra.uso.q, 2) + " kN/m²" : "") + (ra.distribuicao && ra.distribuicao.vaoPlaca ? " — placa armada na direção " + (Math.abs(ra.distribuicao.direcao[0]) > 0.99 ? "z" : Math.abs(ra.distribuicao.direcao[1]) > 0.99 ? "x" : "inclinada") + " (vão " + br(ra.distribuicao.vaoPlaca, 2) + " m)" : ""); }).join("; "),
                                         motivo: "cada viga paralela à direção da placa leva a faixa até a metade da distância às vizinhas (recortada pelo contorno), estação a estação; a direção é a das vigas mais próximas entre si (a placa vence o menor vão)" });
    /* pontuais */
    arr(cfg.pontuais).forEach(function (pt, k) {
      if (!pt.no) { avisos.push("Carga pontual " + (k + 1) + ": a peça " + pt.peca + " não está no modelo — não entrou."); return; }
      var F = [num((pt.F || [])[0], 0), num((pt.F || [])[1], 0), num((pt.F || [])[2], 0), 0, 0, 0];
      /* PÓRTICOS M4 (ponte rolante): a carga pontual pode trazer o CASO dela — { id, nome, categoria, exclusivo } — para as
         posições da ponte virarem casos variáveis próprios e EXCLUDENTES entre si (js/acocargas.js, `exclusivo`) */
      var cd = pt.casoDef && pt.casoDef.id ? pt.casoDef : null;
      var c = cd ? (qCasos["def:" + cd.id] || (qCasos["def:" + cd.id] = (function () { var cc = { id: String(cd.id), tipo: "Q", categoria: cd.categoria || "Q-uso-b", nome: String(cd.nome || cd.id), cargas: [] }; if (cd.exclusivo) cc.exclusivo = String(cd.exclusivo); casos.push(cc); return cc; })()))
        : pt.caso === "Q" ? (qCasos["pontual"] || (qCasos["pontual"] = (function () { nQ++; var cc = { id: nQ === 1 ? "Q" : "Q" + nQ, tipo: "Q", categoria: "Q-uso-b", nome: "Cargas variáveis pontuais (equipamentos)", cargas: [] }; casos.push(cc); return cc; })())) : casoG("G-geral");
      c.cargas.push({ tipo: "no", no: pt.no, F: F });
      resumo.pontuais.push({ nome: pt.nome || "Carga " + (k + 1), peca: pt.peca, no: pt.no, s: pt.s, F: F.slice(0, 3), caso: c.id });
    });
    /* SIMULAÇÃO S1 (14/10/2026): a natureza da carga pontual vai para as decisões, com o PORQUÊ (pedido: "decida e
       justifique se é permanente de equipamento ou variável") */
    if (resumo.pontuais.length) {
      var gP = resumo.pontuais.filter(function (q) { return !/^Q/.test(q.caso); }), qP = resumo.pontuais.filter(function (q) { return /^Q/.test(q.caso); });
      function lst(L) { return L.map(function (q) { return q.nome + " (" + br(Math.sqrt(q.F[0] * q.F[0] + q.F[1] * q.F[1] + q.F[2] * q.F[2]), 2) + " kN)"; }).join("; "); }
      if (gP.length) decisoes.push({ tema: "Cargas pontuais", decisao: "PERMANENTE de equipamento (γg = 1,50; caso " + gP[0].caso + "): " + lst(gP),
        motivo: "peso de equipamento fixo: NBR 8800:2008, Tabela 1 (\"elementos construtivos em geral e equipamentos\", γg = 1,50 — o mesmo γq = 1,50 de uma variável, então a combinação última não muda; a NBR 8800:2024 passou os equipamentos para a coluna das estruturas de aço, γg = 1,25 — o OrçaPRO mantém 1,50, a favor da segurança, enquanto as combinações seguem a edição de 2008); nas de serviço entra INTEIRA (a quase permanente não a reduz), a favor da segurança. Se a carga puder faltar ou se mover (talha, carga de uso), lance-a como VARIÁVEL: assim ela não alivia o vento de sucção nem o levantamento" });
      if (qP.length) decisoes.push({ tema: "Cargas pontuais", decisao: "VARIÁVEL (" + qP[0].caso + ", categoria Q-uso-b): " + lst(qP), motivo: "carga que pode faltar ou mudar de lugar: entra só quando desfavorável, com os ψ da NBR 8800:2008, Tabela 2" });
    }
    /* vento */
    if (cfg.vento) {
      var VL = ventoLivre(G, cfg.vento);
      if (!VL.ok) G.problemas.push({ tipo: "vento", texto: "Vento: " + VL.motivo, solucoes: [] });
      else {
        resumo.vento = { resultado: VL.resultado, casos: VL.casos.map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, origem: c.origem }; }), perdas: [] };
        VL.avisos.forEach(function (x) { avisos.push(x); });
        var cobs = arr(cfg.areas).filter(function (ar) { return ar.cobertura; }), nAtrito = 0, tiposAtrito = {};
        VL.casos.forEach(function (vc) {
          var cW = [];
          /* paredes → pilares da face */
          [["esquerda", 0, VL.x0, [1, 0, 0]], ["direita", 0, VL.x0 + VL.b, [-1, 0, 0]], ["frente", 2, VL.z0, [0, 0, 1]], ["fundo", 2, VL.z0 + VL.a, [0, 0, -1]]].forEach(function (fc) {
            var face = fc[0]; if (!VL.faces[face].fechada) return;
            var eixo = fc[1], coord = fc[2], sEixo = eixo === 0 ? 2 : 0, s0 = eixo === 0 ? VL.z0 : VL.x0, sTot = eixo === 0 ? VL.a : VL.b;
            var ps = G.membros.filter(function (m) { return m.papelLivre === "pilar" && Math.abs(m.a[eixo] - coord) < 0.3 && Math.abs(m.b[eixo] - coord) < 0.3; });
            if (!ps.length) { var tx = "Vento: a face " + face + " está fechada mas não tem pilar na linha — o vento dessa face não tem caminho no modelo e NÃO entrou."; if (avisos.indexOf(tx) < 0) avisos.push(tx); return; }
            var lin = []; ps.forEach(function (m) { var s = (m.a[sEixo] + m.b[sEixo]) / 2 - s0; if (!lin.some(function (q) { return Math.abs(q.s - s) < 0.05; })) lin.push({ s: s, ms: [m] }); else lin.filter(function (q) { return Math.abs(q.s - s) < 0.05; })[0].ms.push(m); });
            lin.sort(function (a, b) { return a.s - b.s; });
            /* a carga w (kN/m) nos pilares da linha, da base até a cota yt */
            function naColuna(ms, w, yt) {
              ms.forEach(function (m) {
                m.segs.forEach(function (sid) {
                  var B = mod.barras.filter(function (b) { return b.id === sid; })[0], yi = G.noInfo[B.i].P[1], yj = G.noInfo[B.j].P[1], lo = Math.min(yi, yj), hi = Math.max(yi, yj);
                  if (lo >= yt - 1e-6 || hi - lo < 1e-6) return;
                  var fa = Math.max(0, Math.min(1, (Math.min(hi, yt) - yi) / (yj - yi))), fb = Math.max(0, Math.min(1, (lo - yi) / (yj - yi)));
                  cW.push({ tipo: "barra", barra: sid, q: mul(fc[3], w), a: Math.min(fa, fb), b: Math.max(fa, fb) });
                });
              });
            }
            /* REVISÃO M4 C1 (15/10/2026): duas águas — o OITÃO (frente/fundo) é a parede até o TELHADO, não até o beiral: o
               triângulo acima do beiral levava 13 a 23 % da força da face embora (h = o do beiral, que a Tabela 5 pede, servia
               de teto da carga). Cada faixa do pilar vai em 16 tiras: a tira leva p·ds da base até mín(altura da parede na tira,
               topo do pilar); o que passa do topo do pilar (a parede acima dele, na ponta da faixa) vai como força no topo do
               pilar — nada se perde: Σ = ∫ p(s)·h(s) ds. As laterais e a uma água ficam como sempre. */
            var duasV2 = VL.cobertura === "duas-aguas", oitao = duasV2 && (face === "frente" || face === "fundo");
            var yRef = duasV2 && VL.yBase != null ? VL.yBase : Math.min(0, G.layout.mn[1]);
            lin.forEach(function (li, k) {
              var sa = k ? (lin[k - 1].s + li.s) / 2 : 0, sb = k < lin.length - 1 ? (li.s + lin[k + 1].s) / 2 : sTot, soma = 0;
              if (oitao) {
                var topo = -Infinity, noTopo = null, nS = 16, ds = (sb - sa) / nS, exc = 0;
                li.ms.forEach(function (m) { [[m.a[1], m.nos[0]], [m.b[1], m.nos[m.nos.length - 1]]].forEach(function (q) { if (q[0] > topo) { topo = q[0]; noTopo = q[1]; } }); });
                for (var t3 = 0; t3 < nS; t3++) {
                  var sm = sa + (t3 + 0.5) * ds, w3 = VL.pParede(vc.c, face, sm) * ds, hw = yRef + VL.h + VL.tg * Math.min(sm, sTot - sm);
                  if (Math.abs(w3) < 1e-12) continue;
                  naColuna(li.ms, w3, Math.min(hw, topo));
                  if (hw > topo + 1e-6) exc += w3 * (hw - Math.max(topo, yRef));
                }
                if (Math.abs(exc) > 1e-9 && noTopo) { var Fx = mul(fc[3], exc); cW.push({ tipo: "no", no: noTopo, F: [Fx[0], Fx[1], Fx[2], 0, 0, 0], oitao: true }); }
                return;
              }
              for (var t = 0; t < 8; t++) soma += VL.pParede(vc.c, face, sa + (t + 0.5) / 8 * (sb - sa));
              var w = soma / 8 * (sb - sa);
              naColuna(li.ms, w, duasV2 ? yRef + VL.h : VL.h + Math.min(0, G.layout.mn[1]));
            });
          });
          /* cobertura → vigas das áreas marcadas como cobertura (normal ≈ vertical: p > 0 empurra para baixo) */
          cobs.forEach(function (ar) {
            /* PÓRTICOS M4 (14/10/2026): a área que declara a NORMAL externa da água (`ar.normal`, a das duas águas e a das
               tipologias) recebe a pressão NA NORMAL, pela área da SUPERFÍCIE (a faixa é em planta: × 1/cos θ) — sem a normal,
               como sempre foi: vertical, pela área em planta (a componente horizontal da água não entra) */
            var nrmA = Array.isArray(ar.normal) ? unit(V(ar.normal)) : null; if (nrmA && nrmA[1] < 0) nrmA = mul(nrmA, -1);
            var fN = nrmA ? 1 / Math.max(0.2, nrmA[1]) : 1;
            var dW = distribuirArea(G, ar, [{ caso: vc.id, pressao: function (x, z) { return fN * VL.pCob(vc.c, x - VL.x0, z - VL.z0); }, direcao: nrmA ? mul(nrmA, -1) : undefined }]);
            arr(dW.cargas[vc.id]).forEach(function (q) { cW.push(q); });
          });
          if (!cobs.length) { var tx2 = "Vento: nenhuma área marcada como COBERTURA — a pressão na cobertura não entrou (marque a área do telhado)."; if (avisos.indexOf(tx2) < 0) avisos.push(tx2); }
          /* SIMULAÇÃO S2 (14/10/2026): o ATRITO na cobertura (NBR 6123, 6.4 e 8.2.5 — cobertura isolada com vento paralelo à
             geratriz) vinha no caso do vento e NÃO entrava no modelo (o caso ficava com 0 cargas: a direção do contraventamento
             só via a força nocional). Agora: força horizontal por área (0,05·q no 8.2.5), nas vigas da cobertura. */
          /* REVISÃO A2 (14/10/2026): o atrito do 6.4 (edificação longa) só atua no TRECHO [início, fim] ao longo da direção do
             vento (depois de 4h ou 4l1 da face de barlavento) e também nas PAREDES paralelas ao vento (Cf·q·2h·trecho); o do
             8.2.5 (cobertura isolada) na cobertura toda. Antes: a cobertura inteira e sem as paredes (6,41 × 8,97 kN — h5) */
          var at = vc.c && vc.c.atrito;
          if (at && num(at.porArea, 0) > 0) {
            var sg = /^[−-]/.test(String(at.sentido || "")) ? -1 : 1, dA0 = at.eixo === "x" ? [sg, 0, 0] : [0, 0, sg];
            var temTrecho = at.inicio != null && at.fim != null, o0 = at.eixo === "x" ? VL.x0 : VL.z0;
            function noTrecho(x, z) { if (!temTrecho) return true; var u = (at.eixo === "x" ? x : z) - o0; return u >= num(at.inicio, 0) - 1e-6 && u <= num(at.fim, 0) + 1e-6; }
            var cRoof = [], aplic = 0;
            cobs.forEach(function (ar) { var dA = distribuirArea(G, ar, [{ caso: vc.id, pressao: function (x, z) { return noTrecho(x, z) ? num(at.porArea, 0) : 0; }, direcao: dA0 }]); aplic += num(dA.resumo.aplicada[vc.id], 0); arr(dA.cargas[vc.id]).forEach(function (q) { cRoof.push(q); }); });
            /* o degrau no começo do trecho cai entre duas estações da distribuição: a resultante é levada à da norma (Cf·q·l1·trecho) */
            var fR = temTrecho && num(at.telhado, 0) > 0 && aplic > 1e-9 ? num(at.telhado, 0) / aplic : 1;
            cRoof.forEach(function (q) { if (fR !== 1) { q.q = mul(q.q, fR); if (q.q2) q.q2 = mul(q.q2, fR); } cW.push(q); });
            if (temTrecho && num(at.paredes, 0) > 0) {
              /* paredes paralelas ao vento (fechadas): Cf·q por m² × a faixa de cada pilar da face (dentro do trecho), na altura */
              var faces2 = at.eixo === "z" ? [["esquerda", 0, VL.x0], ["direita", 0, VL.x0 + VL.b]] : [["frente", 2, VL.z0], ["fundo", 2, VL.z0 + VL.a]];
              faces2.forEach(function (fc) {
                if (!VL.faces[fc[0]] || !VL.faces[fc[0]].fechada) return;
                var eixo = fc[1], sE = eixo === 0 ? 2 : 0, ps = G.membros.filter(function (m) { return m.papelLivre === "pilar" && Math.abs(m.a[eixo] - fc[2]) < 0.3 && Math.abs(m.b[eixo] - fc[2]) < 0.3; });
                var lin = []; ps.forEach(function (m) { var s1 = (m.a[sE] + m.b[sE]) / 2 - o0; if (!lin.some(function (q) { return Math.abs(q.s - s1) < 0.05; })) lin.push({ s: s1, ms: [m] }); else lin.filter(function (q) { return Math.abs(q.s - s1) < 0.05; })[0].ms.push(m); });
                lin.sort(function (x1, x2) { return x1.s - x2.s; });
                var tot = at.eixo === "z" ? VL.a : VL.b;
                lin.forEach(function (li, k) {
                  var sa = k ? (lin[k - 1].s + li.s) / 2 : 0, sb = k < lin.length - 1 ? (li.s + lin[k + 1].s) / 2 : tot, wv = Math.max(0, Math.min(sb, num(at.fim, tot)) - Math.max(sa, num(at.inicio, 0)));
                  if (!(wv > 0)) return;
                  li.ms.forEach(function (m) { m.segs.forEach(function (sid) { cW.push({ tipo: "barra", barra: sid, q: mul(dA0, num(at.porArea, 0) * wv / li.ms.length), a: 0, b: 1, atrito: true }); }); });
                });
              });
            }
            nAtrito++; tiposAtrito[temTrecho ? "6.4" : "8.2.5"] = at;
          }
          casos.push({ id: vc.id, tipo: "W", nome: vc.nome || vc.id, direcao: vc.direcao, cargas: cW });
        });
        if (nAtrito) {
          var t64 = tiposAtrito["6.4"], t825 = tiposAtrito["8.2.5"];
          decisoes.push({ tema: "Vento — atrito", decisao: nAtrito + " caso(s) de vento com a força de ATRITO" + (t64 ? " (NBR 6123, 6.4: Cf = " + br(t64.cf, 2) + " × q, só no trecho de " + br(t64.inicio, 1) + " a " + br(t64.fim, 1) + " m na direção do vento — depois de 4h/4l1 da face de barlavento —, na cobertura e nas paredes paralelas fechadas, nos pilares delas)" : "") + (t825 ? " (NBR 6123, 8.2.5: cobertura isolada, 0,05·q por m² na cobertura toda)" : ""),
            motivo: t64 ? "F' = Cf·q·l1·(l2 − 4h) + Cf·q·2h·(l2 − 4h) — 6.4.2 e 6.4.3; a cobertura recebe a 1ª parcela pelas vigas da área de cobertura e as paredes a 2ª pelos pilares da face" : "cobertura isolada com vento paralelo à geratriz (8.2.5)" });
        }
        /* REVISÃO F6 (15/10/2026): o cpe MÉDIO das zonas de borda/canto (NBR 6123:2023, 6.1.2) vale para a estrutura
           secundária. Na estrutura desenhada o vento entra como caso GLOBAL (telha → terça → viga → pilar) e o cpe médio
           não pode entrar ali (ele não vale para a estrutura principal); a verificação local das terças/travessas com o
           médio ainda NÃO está no motor desenhado. Nada calado: as peças que caem nas faixas saem listadas, com o cpe. */
        var bordaLivre = tercasNaBorda(G, VL);
        if (bordaLivre.length) {
          var txB = "Vento: " + bordaLivre.length + " terça(s)/travessa(s) desenhada(s) nas faixas de borda/canto da NBR 6123:2023 (6.1.2; Tabela 4 nota c, Tabelas 5/6 e figuras) — o cpe MÉDIO dessas faixas vale para a estrutura secundária e NÃO foi aplicado a estas peças nesta estrutura (o vento delas está pelo cpe da zona): " +
                    bordaLivre.map(function (q) { return q.peca + " (" + q.zona + ", cpe médio " + fcp(q.cpe) + ", p = " + fcp(q.p, 3) + " kN/m²)"; }).join("; ") + ". Verifique estas peças à parte com essa pressão.";
          if (avisos.indexOf(txB) < 0) avisos.push(txB);
          resumo.vento.cpeMedioNaoAplicado = bordaLivre;
        }
        decisoes.push({ tema: "Vento", decisao: VL.casos.length + " casos de vento da NBR 6123 na caixa " + br(VL.b, 2) + " × " + br(VL.a, 2) + " m, h = " + br(VL.h, 2) + " m" + (VL.cobertura === "duas-aguas" ? "; cobertura em DUAS ÁGUAS (Tabela 5), a pressão de cada água na normal dela" : ""), motivo: "paredes fechadas → pilares da face por faixa de influência; cobertura → vigas das áreas de cobertura por faixas (como o galpão: telha → terça → viga)" });
      }
    }
    mod.casos = casos;
    return { casos: casos, resumo: resumo };
  }

  var AcoModeloLivre = { OPC_TRAV: OPC_TRAV, OPC_COR: OPC_COR, OPC_EST: OPC_EST, escadas: escadas, USOS: USOS, PERMANENTES: PERMANENTES, CAT_G: CAT_G, usoDe: usoDe, usoCarga: usoCarga, ler: ler, montar: montar, estabilidade: estabilidade, cargas: cargas,
                         distribuirArea: distribuirArea, areasPorNivel: areasPorNivel, areaDasVigas: areaDasVigas, areaPoligono: areaPoligono, ventoLivre: ventoLivre, horizontal: horizontal,
                         TOL: TOL, _int: { segSeg: segSeg, projSeg: projSeg, casco: casco, cortesReta: cortesReta, papelDe: papelDe, tipoLig: tipoLig } };
  global.AcoModeloLivre = AcoModeloLivre;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoModeloLivre;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
