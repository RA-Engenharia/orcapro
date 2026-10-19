/* =====================================================================
 * biminstbiblioteca.js — BIBLIOTECA DO ESCRITÓRIO: as famílias de instalações
 * que o escritório JÁ TEM (Tigre, DarivaBIM e outras), exportadas do Revit
 * dele pelo plugin (.opfam v2, js/familiamalha.js), viram PEÇA DE VERDADE:
 * os conectores ligam tubos, a peça entra no quantitativo com o código e a
 * descrição do fabricante, e o reconhecimento por nome/categoria leva cada
 * uma ao tipo equivalente do motor (joelho, junção, caixa sifonada, bacia…)
 * para entrar no CÁLCULO (js/hidgrafo.js, js/hidaf.js, js/hides.js), não só
 * no desenho. Motor puro, ES5, Node-testável.
 *
 * Pedido do Rogério (17/10/2026): "não dava só para a gente ajustar desse
 * modelo do Revit que já tem, onde o nosso sistema seria capaz de reconhecer
 * as famílias RFA?".
 *
 * ⚠ LICENÇA: a família é do escritório (licenciada por ele). Ela mora na
 *   biblioteca DELE; NUNCA no repositório nem no pacote do produto (termos da
 *   Tigre/BIMobject e do DarivaBIM). A biblioteca embutida do produto continua
 *   a NOSSA (js/hidlouca.js, js/biminstgeo.js). Os testes usam .opfam
 *   SINTÉTICOS (tools/fixtures/opfam-escritorio).
 * ⚠ NUNCA código SINAPI inventado: só entra o código que a PRÓPRIA família
 *   traz num parâmetro SINAPI (ex.: "INS_Código(SINAPI)") e que tem cara de
 *   código (4 a 6 dígitos); o resto fica pendente, como no resto do OrçaPRO.
 * ⚠ NUNCA cálculo por palpite: o que não é reconhecido com segurança fica
 *   "peça genérica" — não entra no cálculo como aparelho (pendência honesta)
 *   e a tela pede o mapeamento UMA vez (fica gravado na família).
 * ⚠ NOME: era js/hidbiblioteca.js. É biminst* (grupo bim do index.html, J11 do
 *   test-hid-integracao) porque o BIM o usa SEM a prévia hidro: o replay que importa
 *   a família do escritório chama lembrar() antes de o grupo hidro (sob demanda)
 *   chegar. O global continua HidBiblioteca (como o HidGeo do biminstgeo.js).
 * Teste: node tools/test-hid-biblioteca.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function semAcento(s) { return txt(s).toLowerCase().replace(/[áàâã]/g, "a").replace(/[éê]/g, "e").replace(/[í]/g, "i").replace(/[óôõ]/g, "o").replace(/[úü]/g, "u").replace(/ç/g, "c"); }

  /* ------------------------------------------------------------ O MOTOR
   * classe: conexao (passagem: os conectores se unem num nó do grafo),
   *         peca (nó com papel na norma: caixa sifonada, CI, CG…),
   *         aparelho (ponto de utilização: entra pela tabela da norma),
   *         acessorio (só quantitativo; se tiver conectores, passagem).
   * pecaGrafo: o que o js/hidgrafo.js põe no nó (as mesmas chaves das peças
   * do biminst / famílias hid-*). aparelho: a chave das tabelas de norma
   * (CONTRATO §1.1 — a mesma do js/hidaf.js). grupo: o do HidPrograma. */
  var MOTORES = {
    joelho90:        { rotulo: "Joelho / curva 90°", classe: "conexao", pecaGrafo: "conexao" },
    joelho45:        { rotulo: "Joelho / curva 45°", classe: "conexao", pecaGrafo: "conexao" },
    te:              { rotulo: "Tê", classe: "conexao", pecaGrafo: "conexao" },
    juncao:          { rotulo: "Junção simples", classe: "conexao", pecaGrafo: "conexao" },
    juncao_dupla:    { rotulo: "Junção dupla", classe: "conexao", pecaGrafo: "conexao" },
    luva:            { rotulo: "Luva", classe: "conexao", pecaGrafo: "conexao" },
    reducao:         { rotulo: "Redução / bucha", classe: "conexao", pecaGrafo: "conexao" },
    cap:             { rotulo: "Cap / tampão", classe: "conexao", pecaGrafo: "conexao" },
    cruzeta:         { rotulo: "Cruzeta", classe: "conexao", pecaGrafo: "conexao" },
    uniao:           { rotulo: "União / adaptador / niple / conector", classe: "conexao", pecaGrafo: "conexao" },
    terminal_ventilacao: { rotulo: "Terminal de ventilação", classe: "conexao", pecaGrafo: "conexao" },
    flexivel:        { rotulo: "Ligação flexível", classe: "acessorio", pecaGrafo: "conexao" },
    valvula:         { rotulo: "Válvula (retenção, esfera, globo, alívio, redutora, admissão de ar)", classe: "acessorio", pecaGrafo: "conexao" },
    hidrometro:      { rotulo: "Hidrômetro", classe: "acessorio", pecaGrafo: "conexao" },
    torneira_boia:   { rotulo: "Torneira de boia", classe: "acessorio", pecaGrafo: "conexao" },
    tampa_grelha:    { rotulo: "Tampa / grelha (só quantitativo)", classe: "acessorio", pecaGrafo: null },
    tubo_ligacao:    { rotulo: "Tubo de ligação / descida", classe: "conexao", pecaGrafo: "conexao" },
    caixa_sifonada:  { rotulo: "Caixa sifonada", classe: "peca", pecaGrafo: "caixa_sifonada" },
    ralo_sifonado:   { rotulo: "Ralo sifonado", classe: "peca", pecaGrafo: "ralo_sifonado" },
    ralo_seco:       { rotulo: "Ralo seco", classe: "peca", pecaGrafo: "ralo_seco" },
    caixa_inspecao:  { rotulo: "Caixa de inspeção", classe: "peca", pecaGrafo: "caixa_inspecao" },
    caixa_gordura:   { rotulo: "Caixa de gordura", classe: "peca", pecaGrafo: "caixa_gordura" },
    caixa_areia:     { rotulo: "Caixa de areia (pluvial)", classe: "peca", pecaGrafo: "caixa_areia" },
    passagem:        { rotulo: "Caixa de passagem (sem papel na norma)", classe: "peca", pecaGrafo: "conexao" },
    prolongador:     { rotulo: "Prolongador / anel de caixa", classe: "acessorio", pecaGrafo: "conexao" },
    sifao:           { rotulo: "Sifão", classe: "acessorio", pecaGrafo: "conexao" },
    registro:        { rotulo: "Registro", classe: "acessorio", pecaGrafo: "conexao" },
    valvula_descarga:{ rotulo: "Válvula de descarga", classe: "aparelho", aparelho: "bacia_valvula", grupo: null },
    /* P2 (pendências finais, 18/10/2026): o "tubo de descida para válvula de descarga com joelho" das bibliotecas (1 conector, o de
       cima) é o TERMINAL do sub-ramal da válvula — o ponto de utilização da bacia com válvula —, não um joelho (era ponta morta) */
    sub_ramal_valvula: { rotulo: "Descida da válvula de descarga (ponto de utilização / sub-ramal da válvula)", classe: "aparelho", aparelho: "bacia_valvula", grupo: null },
    bacia_valvula:   { rotulo: "Bacia (com válvula de descarga)", classe: "aparelho", aparelho: "bacia_valvula", grupo: "bacia" },
    bacia_caixa:     { rotulo: "Bacia com caixa acoplada", classe: "aparelho", aparelho: "bacia_caixa_acoplada", grupo: "bacia" },
    mictorio:        { rotulo: "Mictório", classe: "aparelho", aparelho: "mictorio", grupo: "mictorio" },
    lavatorio:       { rotulo: "Lavatório", classe: "aparelho", aparelho: "lavatorio", grupo: "lavatorio" },
    pia:             { rotulo: "Pia de cozinha", classe: "aparelho", aparelho: "pia_cozinha", grupo: "pia" },
    tanque:          { rotulo: "Tanque", classe: "aparelho", aparelho: "tanque", grupo: "tanque" },
    chuveiro:        { rotulo: "Chuveiro", classe: "aparelho", aparelho: "chuveiro", grupo: "chuveiro" },
    bebedouro:       { rotulo: "Bebedouro", classe: "aparelho", aparelho: "filtro_bebedouro", grupo: null },
    generica:        { rotulo: "Peça genérica (não entra no cálculo)", classe: "generica", pecaGrafo: null }
  };

  /* categorias do Revit (o OST que o plugin manda) */
  var FIT = { OST_PipeFitting: 1 }, ACESS = { OST_PipeAccessory: 1 }, LOUCA = { OST_PlumbingFixtures: 1 };
  var QUALQUER = null;
  /* ⚠ A ORDEM IMPORTA: o mais específico antes (junção dupla antes de junção; caixa sifonada antes de ralo;
     válvula de descarga antes de bacia; o prolongador de caixa antes da caixa). `cats` limita a categoria;
     null = qualquer uma. Reconhecimento por NOME só com a palavra inteira do produto. */
  var REGRAS = [
    { motor: "sub_ramal_valvula", re: /\bdescida\b.*\bdescarga\b/, cats: QUALQUER },   /* P2: antes do joelho e do tubo de ligação */
    { motor: "prolongador", re: /^(?!.*com prolongador)(?:.*)(?:prolongador|prolongament)|\banel\b.*caixa|extens(ao|or).*caixa|caixa sif.*exten/, cats: QUALQUER },
    { motor: "valvula_descarga", re: /^(?!.*(joelho|tubo|descida)).*(valvula.*descarga|flush ?valve|\bhydra\b)/, cats: QUALQUER },
    { motor: "caixa_sifonada", re: /caixa ?sif|\bcx\.? ?sif|sifonada/, cats: QUALQUER },
    { motor: "caixa_gordura", re: /gordura/, cats: QUALQUER },
    { motor: "caixa_areia", re: /caixa.*areia/, cats: QUALQUER },
    { motor: "tampa_grelha", re: /^(z_.*)?\b(tampa|tapa|grelha|porta grelha)\b/, cats: QUALQUER },
    { motor: "te", re: /\bte de inspe/, cats: QUALQUER },
    { motor: "caixa_inspecao", re: /(caixa|\bcx\b).*(inspe(c|ç)ao|inspeccion)|\bci\b/, cats: QUALQUER },
    { motor: "ralo_sifonado", re: /^(?!.*pisc).*ralo.*sif/, cats: QUALQUER },
    { motor: "ralo_seco", re: /^(?!.*pisc).*\bralo\b/, cats: QUALQUER },
    { motor: "juncao_dupla", re: /juncao ?dupla|juncao[ _]?x\b|double (y|wye|junction)/, cats: QUALQUER },
    { motor: "juncao", re: /juncao|\bwye\b/, cats: QUALQUER },
    { motor: "te", re: /(^|[^a-z])tes?([^a-z]|$)|\btee\b/, cats: FIT },
    { motor: "terminal_ventilacao", re: /terminal de ventila/, cats: QUALQUER },
    { motor: "cruzeta", re: /cruzeta|\bcross\b/, cats: QUALQUER },
    { motor: "valvula", re: /valvula (de )?(retencao|esfera|globo|alivio|redutora|admissao|pe\b)|valvula pe\b|admissao de ar/, cats: QUALQUER },
    { motor: "hidrometro", re: /hidrometro/, cats: QUALQUER },
    { motor: "torneira_boia", re: /torneira (de )?boia/, cats: QUALQUER },
    { motor: "flexivel", re: /flexivel|engate/, cats: QUALQUER },
    { motor: "joelho", re: /joelho|cotovelo|\bcurvar?\b|elbow|\bbend\b/, cats: QUALQUER },
    { motor: "uniao", re: /\buniao\b|adaptador|\bniple\b|conector|bujao|\bflange\b|contraporca|\bporca\b|tubete/, cats: FIT },
    { motor: "luva", re: /\bluva\b|coupling/, cats: QUALQUER },
    { motor: "reducao", re: /reducao|reducer|\bbucha\b/, cats: QUALQUER },
    { motor: "cap", re: /\bcap\b|tampao|\bplug\b/, cats: FIT },
    { motor: "tubo_ligacao", re: /tubo.*(descida|ligacao)|tubo de liga/, cats: QUALQUER },
    { motor: "sifao", re: /sifao/, cats: QUALQUER },
    { motor: "registro", re: /registro/, cats: QUALQUER },
    { motor: "mictorio", re: /mictorio|urinal/, cats: QUALQUER },
    { motor: "bacia", re: /bacia|vaso sanitario|toilet|\bwc\b/, cats: QUALQUER },
    { motor: "lavatorio", re: /lavatorio|\bcuba\b|lavabo|\bsink\b.*wash|washbasin/, cats: QUALQUER },
    { motor: "pia", re: /\bpia\b|kitchen sink/, cats: QUALQUER },
    { motor: "tanque", re: /\btanque\b.*(lavar|roupa)|tanque de lavar/, cats: LOUCA },
    { motor: "chuveiro", re: /^(?!.*(misturador|registro|base|derivacao)).*(chuveiro|ducha(?! higien)|shower)/, cats: QUALQUER },
    { motor: "bebedouro", re: /bebedouro|drinking fountain/, cats: QUALQUER },
    { motor: "passagem", re: /caixa.*coletora|caixa.*passagem/, cats: QUALQUER, confianca: "baixa" }
  ];

  /* ---------------------------------------- IDENTIFICAÇÃO (parâmetros da família)
   * o PAPEL de cada parâmetro pelo rótulo original (o plugin manda o nome do Revit). Prefixo de fabricante
   * ("Tigre: Código", "DarivaBIM: Descrição") diz de quem é. A ordem importa: SINAPI antes de "código". */
  var PAPEIS = [
    ["sinapi", /sinapi/],
    ["unifilar", /unifilar|single.?line/],
    ["codigo", /cod(igo|\.)?\b|codigo|product ?code|item ?code|^ref(erencia)?\b|catalog ?number|numero do produto/],
    ["descricao", /descricao|description|^nome comercial/],
    ["fabricante", /fabricante|manufacturer|^marca$/],
    ["material", /(^|[:_\s])material\b/]
  ];
  var PREF_FAB = /^\s*(tigre|amanco|krona|fortlev|deca|docol|astra|dariva(bim)?|celite|incepa)\s*[:_-]/;
  function papel(rotulo) { var n = semAcento(rotulo); for (var i = 0; i < PAPEIS.length; i++) if (PAPEIS[i][1].test(n)) return PAPEIS[i][0]; return null; }
  function fabricantePrefixo(rotulo) {
    var m = PREF_FAB.exec(semAcento(rotulo)); if (!m) return null;
    return /^dariva/.test(m[1]) ? "DarivaBIM" : m[1].charAt(0).toUpperCase() + m[1].slice(1);
  }
  var RE_SINAPI = /^\d{4,6}$/;
  /* { fabricante, porTipo: { tipoId: { codigo, descricao, sinapi, material } }, papeis: { nomeParam: papel } } */
  function identificar(fam) {
    var ps = arr(fam && fam.parametros), papeis = {}, fabs = {};
    ps.forEach(function (p) { var r = p.rotulo || p.nome, pp = papel(r); if (pp) papeis[p.nome] = pp; var f = fabricantePrefixo(r); if (f) fabs[f] = (fabs[f] || 0) + 1; });
    var nomeFam = semAcento(fam && fam.nome), fabNome = /tigre/.test(nomeFam) ? "Tigre" : (/amanco/.test(nomeFam) ? "Amanco" : null);
    /* o fabricante do PRODUTO: o prefixo que não é o do template (DarivaBIM organiza; a Tigre fabrica) */
    var fabPref = Object.keys(fabs).filter(function (f) { return f !== "DarivaBIM"; })[0] || null;
    var out = { fabricante: null, porTipo: {}, papeis: papeis };
    arr(fam && fam.tipos).forEach(function (t) {
      var v = t.valores || {}, d = { codigo: "", descricao: "", sinapi: "", material: "", fabricante: "" };
      Object.keys(papeis).forEach(function (nome) {
        /* "0"/"Produto Inexistente" não são texto (a mesma regra do textosTamanho): a caixa de gordura Amanco da pasta
           de teste do escritório saía no quantitativo como "1 × 0 — Amanco Brazil" (revisão da junção, 18/10/2026) */
        var pp = papeis[nome], val = txt(v[nome] != null ? v[nome] : "").trim(); if (!val || pp === "unifilar" || /^0$|inexistente/i.test(val)) return;
        /* o código do FABRICANTE vence o do template (prefixo DarivaBIM) quando os dois existem */
        var pref = fabricantePrefixo((ps.filter(function (p) { return p.nome === nome; })[0] || {}).rotulo || nome);
        if (pp === "sinapi") { var c = val.replace(/\s+/g, ""); if (RE_SINAPI.test(c) && !d.sinapi) d.sinapi = c; return; }
        if (pp === "codigo") { if (!d.codigo || (pref && pref !== "DarivaBIM")) d.codigo = val; return; }
        if (!d[pp] || (pref && pref !== "DarivaBIM")) d[pp] = val;
      });
      out.porTipo[t.id] = d;
    });
    var fv = Object.keys(out.porTipo).map(function (k) { return out.porTipo[k].fabricante; }).filter(Boolean)[0];
    out.fabricante = fv || fabPref || fabNome || null;
    return out;
  }

  /* os textos de UM tamanho (o plugin manda {nome do parâmetro: valor}): código do fabricante, SINAPI e descrição,
     com a mesma regra da identificação (o do fabricante vence o do template; SINAPI só com cara de código; "Produto
     Inexistente"/"0" não são código) */
  function textosTamanho(fam, textos) {
    var d = { codigo: "", descricao: "", sinapi: "" };
    Object.keys(textos || {}).forEach(function (k) {
      var pp = papel(k), v = txt(textos[k]).trim(), pref = fabricantePrefixo(k);
      if (!pp || !v || /^0$|inexistente/i.test(v)) return;
      if (pp === "sinapi") { var c = v.replace(/\s+/g, ""); if (RE_SINAPI.test(c) && !d.sinapi) d.sinapi = c; return; }
      if (pp === "codigo" || pp === "descricao") { if (!d[pp] || (pref && pref !== "DarivaBIM")) d[pp] = v; }
    });
    return d;
  }

  /* --------------------------------------------------- RECONHECER (classificar)
   * por TIPO: "ESG_Série Normal_Joelho 45_90" tem os dois ângulos na família; o tipo
   * (ou o parâmetro Ângulo) decide. Devolve { motor, confianca, regra, por }. */
  function anguloDe(fam, tipo) {
    var ps = arr(fam && fam.parametros), v = (tipo && tipo.valores) || {}, a = null;
    ps.forEach(function (p) { if (a == null && /^(a|â)ngulo\b|^angle\b|:\s*(a|â)ngulo/i.test(txt(p.rotulo || p.nome)) && isFinite(Number(v[p.nome]))) a = Number(v[p.nome]); });
    return a;
  }
  function classificar(fam, tipoId) {
    var imp = (fam && fam.importada) || {}, ost = txt(imp.categoriaRevit);
    if (imp.mapeamento && MOTORES[imp.mapeamento.motor]) return { motor: imp.mapeamento.motor, confianca: "usuario", regra: "mapeamento da pessoa", por: "usuario" };
    var tipo = arr(fam && fam.tipos).filter(function (t) { return t.id === tipoId; })[0] || arr(fam && fam.tipos)[0] || null;
    var nT = semAcento(tipo && tipo.nome), nF = semAcento(fam && fam.nome).replace(/_/g, " ");
    /* o nome do TIPO primeiro (diz o ângulo/a variante), depois a família */
    /* o TIPO sozinho primeiro ("Te_Juncao" tem tipos Tê e Junção: a família diz as duas), depois tipo + família, depois a família */
    var alvos = nT ? [nT, nT + " " + nF, nF] : [nF];
    for (var a = 0; a < alvos.length; a++) {
      for (var i = 0; i < REGRAS.length; i++) {
        var R = REGRAS[i];
        if (R.cats && !R.cats[ost]) continue;
        if (!R.re.test(alvos[a])) continue;
        var m = R.motor, conf = R.confianca || (a === 0 && nT && R.re.test(nT) ? "alta" : "media");
        if (m === "joelho") {
          var ang = anguloDe(fam, tipo), em = function (s, n) { return new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(s); };
          if (ang != null && Math.abs(ang - 45) <= 1) m = "joelho45";
          else if (ang != null && Math.abs(ang - 90) <= 1) m = "joelho90";
          else if (em(nT, 45) && !em(nT, 90)) m = "joelho45";
          else if (em(nT, 90) && !em(nT, 45)) m = "joelho90";
          else if (em(nF, 45) && !em(nF, 90)) m = "joelho45";
          else { m = "joelho90"; conf = em(nF, 45) ? "baixa" : conf; }
        }
        if (m === "bacia") {
          if (/acoplad|caixa acoplada/.test(alvos[a])) m = "bacia_caixa";
          else if (/convencional|valvula/.test(alvos[a])) m = "bacia_valvula";
          else { m = "bacia_valvula"; conf = "baixa"; }   /* sem dizer o tipo de descarga: a pessoa confirma (o peso de AF muda muito) */
        }
        return { motor: m, confianca: conf, regra: String(R.re), por: "nome" };
      }
    }
    /* categoria sozinha: conexão de tubo com 2 conectores alinhados = luva; o resto genérico */
    return { motor: "generica", confianca: "nenhuma", regra: "sem regra para \"" + txt(fam && fam.nome) + "\"", por: "nada" };
  }

  /* --------------------------------------------- PREPARAR (na importação)
   * grava na família (vai junto para a biblioteca e a nuvem): o reconhecimento automático, a identificação
   * por tipo, a descrição do quantitativo e o código SINAPI que a família traz (tipo.codigo, como o js/familia.js lê). */
  function preparar(fam, opts) {
    if (!fam || !fam.importada) return fam;
    var id = identificar(fam), auto = classificar(fam, null), M = MOTORES[auto.motor] || MOTORES.generica;
    var esc = fam.importada.escritorio || {};
    esc.fabricante = id.fabricante; esc.auto = auto; esc.papeis = id.papeis;
    if (opts && opts.escritorio) { esc.biblioteca = true; esc.aviso = "uso restrito ao licenciado; não redistribuir"; }
    fam.importada.escritorio = esc;
    arr(fam.tipos).forEach(function (t) {
      var d = id.porTipo[t.id] || {}, c = classificar(fam, t.id);
      t.motor = c.motor;
      var partes = [d.descricao || (MOTORES[c.motor] && c.motor !== "generica" ? MOTORES[c.motor].rotulo : fam.nome) + (d.descricao ? "" : " — " + t.nome)];
      if (id.fabricante || d.codigo) partes.push([id.fabricante, d.codigo ? "cód. " + d.codigo : ""].filter(Boolean).join(" "));
      t.descricaoQto = partes.join(" — ");
      if (d.codigo) t.codigoFabricante = d.codigo;
      /* SINAPI: SÓ o que a família traz, e com cara de código */
      if (d.sinapi && !txt(t.codigo).trim()) { t.codigo = d.sinapi; t.fonte = "SINAPI (parâmetro da família do escritório)"; }
    });
    fam.descricao = (fam.importada.categoriaNome || "Família") + " — Biblioteca do escritório" + (id.fabricante ? " (" + id.fabricante + ")" : "") + " · " + (M.rotulo);
    lembrar(fam);
    return fam;
  }
  /* "pede o mapeamento uma vez": a escolha da pessoa fica NA família (vale em todas as obras) */
  function mapear(fam, motor) {
    if (!fam || !fam.importada || !MOTORES[motor]) return false;
    fam.importada.mapeamento = { motor: motor, em: new Date().toISOString() };
    arr(fam.tipos).forEach(function (t) { t.motor = motor; });
    lembrar(fam);
    return true;
  }
  function precisaMapear(fam) {
    if (!fam || !fam.importada || fam.importada.mapeamento) return false;
    var c = classificar(fam, null);
    return c.motor === "generica" || c.confianca === "baixa";
  }

  /* ---------------------------------------------- REGISTRO (famId → família)
   * o cálculo recebe só o famId (js/hidgrafo.js, js/hidaf.js). O js/familiamalha.js lembra a família a cada
   * avaliação (o rede() avalia todas antes do grafo); a tela lembra ao carregar a biblioteca. */
  var REG = {};
  function lembrar(fam) { if (fam && fam.id && fam.importada) REG[fam.id] = fam; return fam; }
  function familia(famId) { return REG.hasOwnProperty(famId) ? REG[famId] : null; }
  function ehEscritorio(famId) { var f = familia(famId); return !!(f && f.importada); }
  function motorDe(famId, tipoId) {
    var f = familia(famId); if (!f) return null;
    return motorEfetivo(f, tipoId);
  }
  /* o motor que o CÁLCULO usa de fato para uma família (não só o reconhecido): a regra de segurança abaixo vale aqui e na etiqueta
     "Cálculo × Só desenho" da lista (a etiqueta nunca promete mais do que o motor faz) */
  function motorEfetivo(f, tipoId) {
    var c = classificar(f, tipoId);
    /* P2: CONEXÃO de passagem com menos de 2 conectores (o plugin exportou só um) não é nó de passagem — vira ponta morta no grafo:
       fica GENÉRICA (a pessoa confere/mapeia), nunca uma conexão que não liga nada. O cap/tampão tem um só de propósito. */
    var M0 = MOTORES[c.motor], t0 = arr(f.tipos).filter(function (x) { return x.id === tipoId; })[0] || arr(f.tipos)[0] || {};
    if (M0 && M0.classe === "conexao" && c.motor !== "cap" && c.motor !== "terminal_ventilacao" && Array.isArray(t0.conectores) && t0.conectores.length < 2 && !f.importada.mapeamento) return "generica";
    return c.confianca === "baixa" && !f.importada.mapeamento ? (c.motor === "bacia_valvula" ? "generica" : c.motor) : c.motor;
  }
  /* o que o js/hidgrafo.js põe no nó; null = a família não é peça do grafo (aparelho ou genérica) */
  function pecaGrafo(famId, tipoId) { var m = motorDe(famId, tipoId); return m && MOTORES[m] ? (MOTORES[m].pecaGrafo || null) : null; }
  /* a chave da tabela da norma (js/hidaf.js / js/hides.js); null = pendente */
  function aparelho(famId, tipoId) { var m = motorDe(famId, tipoId); return m && MOTORES[m] ? (MOTORES[m].aparelho || null) : null; }
  function grupo(famId, tipoId) { var m = motorDe(famId, tipoId); return m && MOTORES[m] ? (MOTORES[m].grupo || null) : null; }
  /* corpo (mm, a largura da caixa pelo nome "150x150") e saída (o maior DN dos conectores do tipo) */
  function dim(famId, tipoId) {
    var f = familia(famId); if (!f) return null;
    var t = arr(f.tipos).filter(function (x) { return x.id === tipoId; })[0] || arr(f.tipos)[0] || {};
    var m = /(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{2,3}))?/i.exec(txt(t.nome) + " " + txt(f.nome));
    /* ⚠ saída: o 3º número do nome ("150x150x50" = corpo x altura x DN de SAÍDA, convenção do catálogo); sem ele, o maior
       DN entre os conectores que NÃO apontam para cima (medido na caixa sifonada real: a boca da grelha é um conector
       DN 150 virado para cima — pelo maior DN a saída virava 150) */
    var dns = arr(t.conectores).filter(function (k) { return !(Number(k.dy) > 0.9); }).map(function (k) { return Number(k.dn) || 0; });
    var saida = m && m[3] ? Number(m[3]) : (dns.length ? Math.max.apply(null, dns) : null);
    return { corpo: m ? Number(m[1]) : null, saida: saida > 0 ? saida : null, diametro_m: null, retencao_L: null };
  }

  /* resumo para a tela e o relatório: por categoria, reconhecidas, genéricas */
  function resumo(lista) {
    var out = { total: 0, porCategoria: {}, reconhecidas: 0, genericas: [], baixa: [], porMotor: {} };
    arr(lista).forEach(function (f) {
      if (!f || !f.importada) return;
      out.total++;
      var cat = f.importada.categoriaNome || f.importada.categoriaRevit || "?"; out.porCategoria[cat] = (out.porCategoria[cat] || 0) + 1;
      var c = classificar(f, null);
      out.porMotor[c.motor] = (out.porMotor[c.motor] || 0) + 1;
      if (c.motor === "generica") out.genericas.push(f.nome);
      else { out.reconhecidas++; if (c.confianca === "baixa") out.baixa.push(f.nome); }
    });
    return out;
  }

  /* =====================================================================
   * FILTRO POR ORIGEM E POR "ENTRA NO CÁLCULO" (pedido do Rogério, 18/10/2026)
   *
   * "Quando eu importar as famílias do Revit (Biblioteca do escritório) e apertar Aparelho sanitário, elas vão estar
   *  misturadas com as outras? Quero um filtro para separar. Nos projetos com memorial de cálculo vou usar só as que
   *  estão parametrizadas."
   *
   * ORIGEM: orcapro (nativa: hid-*, ra-*, clim-*) · escritorio (família importada do Revit: tem `importada`) ·
   *   minha (criada no editor de famílias). Os filtros da tela são Todas | OrçaPRO | Escritório (Minhas só aparece quando existe).
   * CÁLCULO: nativa = "Cálculo". Escritório = "Cálculo" quando o motor a reconhece (por nome, categoria ou mapeamento
   *   da pessoa) e o cálculo a usa de fato (motorEfetivo: a regra de segurança da conexão sem 2 conectores e da bacia
   *   sem tipo de descarga vale aqui também); senão "Só desenho". Minha = "Só desenho" (o motor só conhece o que é do OrçaPRO
   *   ou foi reconhecido/mapeado). A etiqueta NUNCA promete mais do que o cálculo faz.
   * PROJETO COM MEMORIAL: gravado por obra; ligado por padrão quando o projeto já tem dimensionamento. Com ele ligado a lista
   *   abre em "Só as que entram no cálculo", e peça "Só desenho" colocada no modelo vira aviso com Corrigir (mapear ou trocar).
   * ===================================================================== */
  var ORIGENS = [{ id: "todas", rotulo: "Todas" }, { id: "orcapro", rotulo: "OrçaPRO" }, { id: "escritorio", rotulo: "Escritório" }, { id: "minha", rotulo: "Minhas" }];
  var ROTULO_ORIGEM = { orcapro: "OrçaPRO", escritorio: "Escritório", minha: "Minha" };
  /* a categoria do Revit (OST) → a lista do seletor de tipos; categoria fora daqui (porta, móvel…) não é peça de instalação */
  var OST_CAT = { OST_PlumbingFixtures: "aparelho", OST_PipeFitting: "conexao", OST_PipeAccessory: "acessorio",
                  OST_MechanicalEquipment: "equipamento", OST_PlumbingEquipment: "equipamento", OST_Sprinklers: "equipamento", OST_FireProtection: "equipamento" };
  function catSeletor(f) { return OST_CAT[txt(f && f.importada && f.importada.categoriaRevit)] || null; }
  /* nativa: o chamador diz (opts.nativa) ou vale o rótulo `_origem` do FamiliaUI ("ra") ou o prefixo do id das famílias do produto */
  function ehNativa(f, opts) {
    if (!f || f.importada) return false;
    if (opts && opts.nativa != null) return !!opts.nativa;
    return f._origem === "ra" || /^(hid|ra|clim|marc|orc)-/.test(txt(f.id));
  }
  function origemDe(f, opts) { if (f && f.importada) return "escritorio"; return ehNativa(f, opts) ? "orcapro" : "minha"; }
  /* o cálculo é o das INSTALAÇÕES (hidrossanitário, climatização): porta, janela, pilar, bancada… não têm "Cálculo" nem "Só desenho". Elas
     ficam FORA do domínio: sem selo de cálculo e sempre visíveis, mesmo com "Só as que entram no cálculo" ligado (senão a tela de Famílias
     de um projeto com memorial esconderia todas as portas). Domínio = família de instalação do produto (hid-, clim-), com conectores de tubo,
     ou do escritório em categoria de instalação do Revit. */
  function temConectores(f) { return arr(f && f.conectores).length > 0 || arr(f && f.tipos).some(function (t) { return arr(t && t.conectores).length > 0; }); }
  function dominioInstalacoes(f) {
    if (!f) return false;
    if (f.importada) return !!catSeletor(f);
    return /^(hid|clim|ra-clim)-/.test(txt(f.id)) || temConectores(f);
  }
  function calculoDe(f, tipoId, opts) {
    if (!f) return { entra: false, id: "desenho", rotulo: "Só desenho", motor: null, motivo: "família desconhecida" };
    if (!(opts && opts.dominio) && !dominioInstalacoes(f)) return { entra: false, fora: true, id: "fora", rotulo: "", motor: null, motivo: "não é peça de instalação: o cálculo das instalações não se aplica" };
    if (!f.importada) {
      return ehNativa(f, opts) ? { entra: true, id: "calculo", rotulo: "Cálculo", motor: null, motivo: "família do OrçaPRO: entra no cálculo" }
        : { entra: false, id: "desenho", rotulo: "Só desenho", motor: null, motivo: "família criada por você: o cálculo só usa as do OrçaPRO e as do escritório reconhecidas" };
    }
    var m = motorEfetivo(f, tipoId), M = MOTORES[m] || MOTORES.generica, c = classificar(f, tipoId), usuario = !!(f.importada.mapeamento);
    if (m === "generica") return { entra: false, id: "desenho", rotulo: "Só desenho", motor: "generica", motivo: c.motor === "generica" ? "sem tipo do motor: mapear para um tipo ou trocar pela peça equivalente do OrçaPRO" : "reconhecida só com dúvida (" + (MOTORES[c.motor] || M).rotulo + "): confirmar o tipo ou trocar pela peça equivalente do OrçaPRO" };
    return { entra: true, id: "calculo", rotulo: "Cálculo", motor: m, motivo: (usuario ? "mapeada por você para " : "reconhecida como ") + M.rotulo };
  }
  function selos(f, tipoId, opts) { var o = origemDe(f, opts), c = calculoDe(f, tipoId, opts); return { origem: { id: o, rotulo: ROTULO_ORIGEM[o] }, calculo: c }; }

  /* o filtro sobre uma lista de itens { origemFam, calculo: { entra } } */
  function aplicarFiltro(itens, filtro) {
    var f = filtro || {}, o = f.origem || "todas";
    return arr(itens).filter(function (it) {
      if (o !== "todas" && it.origemFam !== o) return false;
      if (f.soCalculo && !(it.calculo && (it.calculo.entra || it.calculo.fora))) return false;
      return true;
    });
  }
  /* quantas há em cada chip (respeitando o interruptor "Só as que entram no cálculo") */
  function contagens(itens, filtro) {
    var c = { todas: 0, orcapro: 0, escritorio: 0, minha: 0 };
    arr(itens).forEach(function (it) {
      if (filtro && filtro.soCalculo && !(it.calculo && (it.calculo.entra || it.calculo.fora))) return;
      c.todas++; if (c[it.origemFam] != null) c[it.origemFam]++;
    });
    return c;
  }

  /* ---- armazenamento: localStorage; sem ele (Node, janela privada), memória. Nada aqui pode derrubar a tela. */
  var MEM = {};
  function lerChave(k) { try { if (global.localStorage) { var v = global.localStorage.getItem(k); return v == null ? null : v; } } catch (e) {} return MEM.hasOwnProperty(k) ? MEM[k] : null; }
  function gravarChave(k, v) { MEM[k] = String(v); try { if (global.localStorage) global.localStorage.setItem(k, String(v)); } catch (e) {} return true; }
  function usuarioAtual() { try { var A = global.Auth && global.Auth._usuario; if (A) return txt(A.uid || A.id || A.email || "local"); } catch (e) {} return "local"; }
  function obraChave() { try { var g = global.Gestao; return String((g && g._bimSel) || "geral"); } catch (e) { return "geral"; } }

  /* A escolha do filtro fica gravada POR USUÁRIO: a origem; e o interruptor separado para projeto com memorial e sem (cada um volta
     como a pessoa deixou; sem escolha ainda, o projeto com memorial abre em "Só as que entram no cálculo"). */
  function chaveFiltro(u) { return "orcapro:bim:filtro-familias:" + (u || usuarioAtual()); }
  function lerFiltro(u, comMemorial) {
    var o = null; try { o = JSON.parse(lerChave(chaveFiltro(u)) || "null"); } catch (e) { o = null; }
    o = o && typeof o === "object" ? o : {};
    var ok = ORIGENS.some(function (x) { return x.id === o.origem; });
    var sc = o.sc && typeof o.sc === "object" ? o.sc[comMemorial ? "sim" : "nao"] : undefined;
    return { origem: ok ? o.origem : "todas", soCalculo: typeof sc === "boolean" ? sc : !!comMemorial };
  }
  function gravarFiltro(u, parcial, comMemorial) {
    var o = null; try { o = JSON.parse(lerChave(chaveFiltro(u)) || "null"); } catch (e) { o = null; }
    o = o && typeof o === "object" ? o : {}; o.sc = o.sc && typeof o.sc === "object" ? o.sc : {};
    if (parcial && parcial.origem && ORIGENS.some(function (x) { return x.id === parcial.origem; })) o.origem = parcial.origem;
    if (parcial && typeof parcial.soCalculo === "boolean") o.sc[comMemorial ? "sim" : "nao"] = parcial.soCalculo;
    gravarChave(chaveFiltro(u), JSON.stringify(o));
    return lerFiltro(u, comMemorial);
  }

  /* ---- PROJETO COM MEMORIAL DE CÁLCULO (por obra). Padrão: ligado quando o projeto já foi dimensionado. */
  function chaveMemorial(obra) { return "orcapro:bim:hid-memorial:" + (obra || obraChave()); }
  function chaveDimensionado(obra) { return "orcapro:bim:hid-dimensionado:" + (obra || obraChave()); }
  function temDimensionamento(obra) { return lerChave(chaveDimensionado(obra)) === "1"; }
  function marcarDimensionado(obra) { if (!temDimensionamento(obra)) gravarChave(chaveDimensionado(obra), "1"); return true; }
  function memorialDoProjeto(obra) { var v = lerChave(chaveMemorial(obra)); if (v === "1") return true; if (v === "0") return false; return temDimensionamento(obra); }
  function definirMemorial(obra, ligado) { gravarChave(chaveMemorial(obra), ligado ? "1" : "0"); return !!ligado; }

  /* ---- a peça equivalente do OrçaPRO (só quando o tipo do motor tem uma família nativa) */
  var EQUIV = { bacia_valvula: "hid-bacia-convencional", bacia_caixa: "hid-bacia-caixa-acoplada", mictorio: "hid-mictorio", lavatorio: "hid-lavatorio-suspenso",
                pia: "hid-pia-cozinha", tanque: "hid-tanque-lavar", chuveiro: "hid-chuveiro", caixa_sifonada: "hid-caixa-sifonada", ralo_sifonado: "hid-ralo",
                ralo_seco: "hid-ralo", caixa_inspecao: "hid-caixa-inspecao", caixa_gordura: "hid-caixa-gordura", caixa_areia: "hid-caixa-areia", valvula_descarga: "hid-valvula-descarga" };
  function dependencia(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function equivalenteNativo(f, tipoId) {
    var c = classificar(f, tipoId), id = EQUIV[c.motor]; if (!id) return null;
    var HF = dependencia("HidFamilias", "./hidfamilias.js"), nat = null;
    try { nat = HF && HF.porId ? HF.porId(id) : null; } catch (e) { nat = null; }
    if (!nat || !arr(nat.tipos).length) return null;
    var tipos = arr(nat.tipos), sel = tipos[0];
    if (c.motor === "ralo_sifonado") sel = tipos.filter(function (t) { return /sif/i.test(txt(t.nome)); })[0] || sel;
    else if (c.motor === "ralo_seco") sel = tipos.filter(function (t) { return !/sif/i.test(txt(t.nome)); })[0] || sel;
    else if (c.motor === "caixa_sifonada") sel = tipos.filter(function (t) { return !/seca/i.test(txt(t.nome)); })[0] || sel;
    return { famId: nat.id, tipoId: sel.id, nome: nat.nome, motor: c.motor };
  }

  /* as peças do modelo que são "Só desenho" (instalação do escritório sem papel no cálculo). Lê a família no registro:
     o replay avalia todas as famílias antes do cálculo. Porta, janela e móvel da biblioteca não entram (categoria fora das instalações). */
  function pecasSemCalculo(estado) {
    var out = [];
    arr(estado && estado.familias).forEach(function (fi) {
      var f = familia(fi.famId); if (!f || !f.importada || !catSeletor(f)) return;
      var c = calculoDe(f, fi.tipoId); if (c.entra) return;
      var t = arr(f.tipos).filter(function (x) { return x.id === fi.tipoId; })[0];
      out.push({ id: fi.id, famId: fi.famId, tipoId: fi.tipoId, nome: txt(f.nome) + (t && t.nome ? " : " + t.nome : ""), cat: catSeletor(f), motivo: c.motivo, equivalente: equivalenteNativo(f, fi.tipoId) });
    });
    return out;
  }

  /* TROCAR a peça pela equivalente do OrçaPRO, mantendo a posição e as ligações: a MESMA instância (mesmo id, x, y, z, giro) passa a ser da
     família nova; cada ponta de tubo que estava num conector da antiga vai para o conector do MESMO SISTEMA mais perto da nova (o tubo
     continua ligado). O que não tem conector equivalente fica sem ligação e AVISA. Devolve { ok, ops, ligadas, perdidas, avisos }. */
  function opsTrocar(estado, avaliarFam, instId, destino) {
    var BI = dependencia("BimInst", "./biminst.js");
    var fi = arr(estado && estado.familias).filter(function (x) { return String(x.id) === String(instId); })[0];
    if (!BI || !fi) return { ok: false, erro: "A peça não está no modelo.", ops: [], ligadas: 0, perdidas: 0, avisos: [] };
    if (!destino || !destino.famId) return { ok: false, erro: "Escolha a peça do OrçaPRO.", ops: [], ligadas: 0, perdidas: 0, avisos: [] };
    var novo = { id: fi.id, famId: destino.famId, tipoId: destino.tipoId || "", x: fi.x, y: fi.y, z: fi.z, rotY: fi.rotY || 0, inst: {} };
    var avV = typeof avaliarFam === "function" ? avaliarFam(fi.famId, fi.tipoId, fi.inst) : null, avN = typeof avaliarFam === "function" ? avaliarFam(novo.famId, novo.tipoId, novo.inst) : null;
    if (!avN) return { ok: false, erro: "Não consegui avaliar a peça do OrçaPRO escolhida.", ops: [], ligadas: 0, perdidas: 0, avisos: [] };
    var kV = avV ? BI.conectoresDe(avV, fi) : [], kN = BI.conectoresDe(avN, novo), tol = BI.TOL_CONECTOR || 0.03;
    var usados = {}, mov = {}, ligadas = 0, perdidas = 0, avisos = [];
    function dist(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
    kV.forEach(function (kv) {
      var pontas = [];
      arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { ["p1", "p2"].forEach(function (p) { if (t[p] && dist(t[p], kv) <= tol) pontas.push({ t: t, p: p }); }); });
      if (!pontas.length) return;
      var best = null;
      kN.forEach(function (kn, i) { if (usados[i] || kn.sistema !== kv.sistema) return; var d = dist(kn, kv); if (!best || d < best.d) best = { i: i, d: d, k: kn }; });
      if (!best) { perdidas += pontas.length; avisos.push("o conector de " + kv.sistema + " da peça antiga não tem equivalente na nova: " + pontas.length + " ponta(s) de tubo ficaram sem ligação"); return; }
      usados[best.i] = 1;
      pontas.forEach(function (pt) {
        var o = mov[pt.t.id] || (mov[pt.t.id] = BI.opDoTrecho(pt.t));
        o[pt.p] = { x: Math.round(best.k.x * 10000) / 10000, y: Math.round(best.k.y * 10000) / 10000, z: Math.round(best.k.z * 10000) / 10000 };
        ligadas++;
      });
    });
    var ops = [{ op: "familia", id: fi.id, famId: novo.famId, tipoId: novo.tipoId, x: fi.x, y: fi.y, z: fi.z, rotY: fi.rotY || 0, inst: {} }];
    if (fi.host && fi.host.id != null) ops[0].host = { id: fi.host.id, t: fi.host.t };
    Object.keys(mov).forEach(function (id) { ops.push(mov[id]); });
    if (ligadas) avisos.unshift(ligadas + " ponta(s) de tubo foram para o conector equivalente da peça nova (a ligação continua)");
    return { ok: true, ops: ops, ligadas: ligadas, perdidas: perdidas, avisos: avisos };
  }

  /* ---- os pedaços de tela (texto puro: quem usa põe no seu contêiner e liga os cliques em [data-fil-origem] e [data-fil-calc]) */
  function escHtml(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function htmlControles(filtro, cont, comMemorial) {
    filtro = filtro || { origem: "todas", soCalculo: false }; cont = cont || { todas: 0, orcapro: 0, escritorio: 0, minha: 0 };
    var chips = ORIGENS.filter(function (o) { return o.id !== "minha" || cont.minha > 0 || filtro.origem === "minha"; }).map(function (o) {
      var on = filtro.origem === o.id;
      return '<button type="button" class="fil-chip' + (on ? " on" : "") + '" data-fil-origem="' + o.id + '" aria-pressed="' + (on ? "true" : "false") + '">' + escHtml(o.rotulo) + " <i>" + (cont[o.id] || 0) + "</i></button>";
    }).join("");
    return '<div class="fil-barra" data-fil="barra"><div class="fil-chips" role="group" aria-label="Origem da família">' + chips + "</div>" +
      '<label class="fil-sw" title="' + (comMemorial ? "Este projeto tem memorial de cálculo: a lista abre só com o que o cálculo usa." : "Mostra só as peças que entram no cálculo (as do OrçaPRO e as do escritório reconhecidas ou mapeadas).") + '">' +
      '<input type="checkbox" data-fil-calc' + (filtro.soCalculo ? " checked" : "") + "> <span>Só as que entram no cálculo</span></label></div>";
  }
  function htmlSelos(it) {
    if (!it || !it.origemFam) return "";
    var c = it.calculo || { entra: false, rotulo: "Só desenho" };
    if (c.fora) return '<span class="fil-selos"><span class="fil-selo fil-o-' + escHtml(it.origemFam) + '">' + escHtml(ROTULO_ORIGEM[it.origemFam] || it.origemFam) + "</span></span>";
    return '<span class="fil-selos"><span class="fil-selo fil-o-' + escHtml(it.origemFam) + '">' + escHtml(ROTULO_ORIGEM[it.origemFam] || it.origemFam) + "</span>" +
      '<span class="fil-selo ' + (c.entra ? "fil-calc" : "fil-desenho") + '"' + (c.motivo ? ' title="' + escHtml(c.motivo) + '"' : "") + ">" + escHtml(c.rotulo) + "</span></span>";
  }
  function cssFiltro() {
    return ".fil-barra{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:6px 0}.fil-chips{display:flex;gap:4px;flex-wrap:wrap}" +
      ".fil-chip{border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:999px;padding:2px 10px;font-size:12px;cursor:pointer}" +
      ".fil-chip i{font-style:normal;opacity:.65;margin-left:2px}.fil-chip.on{background:#0f766e;border-color:#0f766e;color:#fff}.fil-chip.on i{opacity:.9}" +
      ".fil-sw{display:inline-flex;align-items:center;gap:5px;font-size:12px;cursor:pointer}" +
      ".fil-selos{display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle;white-space:nowrap}.fil-selo{font-size:10px;line-height:1;padding:2px 6px;border-radius:999px;border:1px solid rgba(127,127,127,.4);opacity:.85}" +
      ".fil-calc{background:rgba(22,163,74,.16);border-color:#16a34a;color:#15803d;opacity:1}.fil-desenho{background:rgba(127,127,127,.16);color:inherit}" +
      ".fil-o-escritorio{border-style:dashed}";
  }

  var HidBiblioteca = {
    MOTORES: MOTORES, REGRAS: REGRAS, papel: papel, textosTamanho: textosTamanho, fabricantePrefixo: fabricantePrefixo, identificar: identificar, classificar: classificar,
    preparar: preparar, mapear: mapear, precisaMapear: precisaMapear, lembrar: lembrar, familia: familia, ehEscritorio: ehEscritorio,
    motorDe: motorDe, motorEfetivo: motorEfetivo, pecaGrafo: pecaGrafo, aparelho: aparelho, grupo: grupo, dim: dim, resumo: resumo,
    /* filtro por origem e por "entra no cálculo" (18/10/2026) */
    ORIGENS: ORIGENS, catSeletor: catSeletor, dominioInstalacoes: dominioInstalacoes, origemDe: origemDe, calculoDe: calculoDe, selos: selos, aplicarFiltro: aplicarFiltro, contagens: contagens,
    lerFiltro: lerFiltro, gravarFiltro: gravarFiltro, memorialDoProjeto: memorialDoProjeto, definirMemorial: definirMemorial, temDimensionamento: temDimensionamento,
    marcarDimensionado: marcarDimensionado, obraChave: obraChave, usuarioAtual: usuarioAtual, equivalenteNativo: equivalenteNativo, pecasSemCalculo: pecasSemCalculo,
    opsTrocar: opsTrocar, htmlControles: htmlControles, htmlSelos: htmlSelos, cssFiltro: cssFiltro,
    esquecerTudo: function () { REG = {}; }
  };
  global.HidBiblioteca = HidBiblioteca;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBiblioteca;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
