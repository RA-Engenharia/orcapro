/* =====================================================================
 * familiarevit.js — A MESMA FONTE JSON DA FAMÍLIA, PARA O REVIT (B6, 08/10/2026)
 *
 * Pedido do Rogério (PLANO-BIM-MODELADOR.md, fase B6): "a mesma família sai
 * para o OrçaPRO e para o .rfa". Os pipelines de família da RA no Revit
 * (uma pasta de fonte por produto) leem um JSON e constroem a
 * família por IronPython na sessão aberta do Revit. Este motor (puro,
 * Node-testável) faz a ponte nos dois sentidos:
 *
 *   paraFonteRevit(fam)  família do OrçaPRO (.opfam) → JSON no contrato RA
 *   deFonteRevit(json)   JSON no contrato RA → família do OrçaPRO
 *   conferirFonte(json)  o JSON segue o contrato? (lista de erros)
 *
 * O CONTRATO NÃO FOI INVENTADO AQUI: é o do bombup230.json (06/10/2026,
 * construído pelo construtor de família da RA — o único pipeline de família RA de
 * geometria genérica no disco). tools/test-bim-b6.js lê o arquivo real
 * quando o OneDrive está na máquina e cobra que ele passe no conferirFonte;
 * a cópia sem preço em tools/fixtures segura o
 * teste nas outras máquinas e reprova se divergir do real.
 *
 * CONTRATO (o que o construtor lê):
 *   materiais  { "<nome>": { rgb:[r,g,b] 0–255, brilho 0–100, classe, obs } }
 *              (classe "Plástico" pega a aparência de plástico; o resto,
 *               metal/genérico — é o que o construtor da RA faz)
 *   primitivas [{ id (único), tipo, mat (chave de materiais), grupo (vira
 *              subcategoria), nome, ...medidas em MILÍMETROS }], com os
 *              eixos do REVIT: X e Y no plano, Z PARA CIMA, origem no piso.
 *     prisma    origem[3], u[3], v[3] (base do plano), poly [[a,b]…] no
 *               plano (u, v), extrusão de e0 a e1 ao longo de u × v
 *     cilindro  base[3], eixo[3], raio, comp (ao longo do eixo)
 *     anel      cilindro + raio_int (furo)
 *     revolucao centro[cx, cy], perfil [[r, z]…] girado no eixo vertical
 *     curva     ini[3], dir[3], vira[3], rc, raio, ang (graus)
 *     conector  opcional (tubo/elétrico) — só o pipeline de equipamento usa
 *   tipos      [{ nome, … }]   (o construtor de produto lê campos próprios;
 *              aqui vai `valores` com os parâmetros do tipo, em SI)
 *
 * O QUE ESTE ARQUIVO ACRESCENTA (campos a mais; o construtor ignora o que não
 * lê, e o contrato continua o mesmo):
 *   formato/versao/origem, categoria "OST_…" (como o ferragens.json),
 *   hospedagem + abertura_mm por tipo (porta/janela), parametros (com a
 *   fórmula do OrçaPRO e a tradução PROPOSTA para a sintaxe do Revit),
 *   primitivasPorTipo (a geometria de cada tipo) e familiaOrcaPRO (a família
 *   inteira, sem preço: a volta para o OrçaPRO é sem perda).
 *
 * MAPA DE EIXOS (OrçaPRO → Revit): o OrçaPRO é Y para cima, em metros
 *   (js/familia.js: X ao longo da parede, Y para cima, Z para fora). O Revit
 *   é Z para cima. X_r = X, Y_r = −Z, Z_r = Y (mantém a mão direita), × 1000.
 *   O giro `rot` (graus, em torno de Y) vira giro anti-horário em torno de Z_r.
 *
 * ⚠ PENDENTE (sessão principal, com o Revit livre): o construtor GENÉRICO
 *   que lê este JSON e cria os parâmetros com fórmula. O de hoje
 *   (o construtor de família da RA) é do produto BombUp — lê o caminho e os campos
 *   de spec dele. A geometria e os materiais já estão no contrato que ele
 *   usa; a fórmula traduzida é PROPOSTA (unidades de constante a conferir no
 *   Revit), por isso cada tipo leva também os VALORES RESOLVIDOS.
 * ⚠ PREÇO NUNCA (regra do .opfam): nem no spec, nem nos tipos.
 * ===================================================================== */
(function (global) {
  "use strict";

  var FORMATO = "RA-Familia-Fonte", VERSAO = 1;
  var CAT_REVIT = {
    porta: "OST_Doors", janela: "OST_Windows", pilar: "OST_StructuralColumns", viga: "OST_StructuralFraming",
    mobiliario: "OST_Furniture", equipamento: "OST_MechanicalEquipment", loucas: "OST_PlumbingFixtures",
    estrutural: "OST_StructuralFraming", generico: "OST_GenericModel", parede: "OST_GenericModel", laje: "OST_GenericModel", piso: "OST_GenericModel",
    /* P12: instalações */
    acessorio_tubo: "OST_PipeAccessory", dispositivo_eletrico: "OST_ElectricalFixtures", luminaria: "OST_LightingFixtures", equipamento_eletrico: "OST_ElectricalEquipment"
  };
  var CAT_VOLTA = { OST_Doors: "porta", OST_Windows: "janela", OST_StructuralColumns: "pilar", OST_Columns: "pilar", OST_StructuralFraming: "viga",
    OST_Furniture: "mobiliario", OST_MechanicalEquipment: "equipamento", OST_PlumbingEquipment: "equipamento", OST_PlumbingFixtures: "loucas",
    OST_StructConnections: "estrutural", OST_GenericModel: "generico",
    OST_PipeAccessory: "acessorio_tubo", OST_ElectricalFixtures: "dispositivo_eletrico", OST_LightingFixtures: "luminaria", OST_ElectricalEquipment: "equipamento_eletrico" };   /* P12 */
  var TIPO_REVIT = { comprimento: "Length", area: "Area", volume: "Volume", angulo: "Angle", numero: "Number", inteiro: "Integer", simnao: "YesNo", texto: "Text", material: "Material" };
  var UNID = { comprimento: "m", area: "m2", volume: "m3", angulo: "graus" };
  /* cor por nome de material — a mesma tabela que o 3D do OrçaPRO usa (js/bim.js FAM_CORES), para o .rfa nascer com a cor da tela */
  var CORES = { madeira: [184, 138, 90], "alumínio": [201, 206, 214], aluminio: [201, 206, 214], vidro: [159, 211, 240], concreto: [169, 176, 184],
    granito: [74, 74, 74], inox: [208, 212, 216], "louça branca": [244, 244, 242], "mdf branco": [241, 241, 239], "polietileno azul": [44, 111, 191],
    metal: [138, 143, 150], "aço": [138, 143, 150] };
  var PRIMITIVAS = ["prisma", "cilindro", "anel", "revolucao", "curva"];

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r1(v) { return Math.round(v * 10) / 10; }            /* décimo de milímetro */
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function vet3(a) { return Array.isArray(a) && a.length === 3 && a.every(fin); }
  function norma(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function unit(a) { var n = norma(a); return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function soma(a, b, k) { k = k == null ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function quase(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
  function slug(s) { return txt(s).toLowerCase().normalize ? txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : txt(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

  /* OrçaPRO (m, Y para cima) → Revit (mm, Z para cima) */
  function ponto(x, y, z) { return [r1(x * 1000), r1(-z * 1000), r1(y * 1000)]; }
  /* direção do eixo X local girado `rot` graus em torno de Y (OrçaPRO) → Revit */
  function dirX(rotGraus) { var t = rotGraus * Math.PI / 180; return [r6(Math.cos(t)), r6(Math.sin(t)), 0]; }
  /* o −Z local do OrçaPRO girado → Revit (é o "Y local" do Revit) */
  function dirMenosZ(rotGraus) { var t = rotGraus * Math.PI / 180; return [r6(-Math.sin(t)), r6(Math.cos(t)), 0]; }

  function corDe(nome, corHex) {
    var h = /^#?([0-9a-f]{6})$/i.exec(txt(corHex));
    if (h) { var n = parseInt(h[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var k = txt(nome).toLowerCase().trim();
    if (CORES[k]) return CORES[k].slice();
    for (var c in CORES) if (CORES.hasOwnProperty(c) && k.indexOf(c) >= 0) return CORES[c].slice();
    return [200, 204, 210];
  }
  function classeDe(nome) {
    var k = txt(nome).toLowerCase();
    if (/inox|alum|a[cç]o|metal|ferro|cobre|lat[aã]o/.test(k)) return "Metal";
    if (/vidro/.test(k)) return "Vidro";
    if (/madeira|mdf|tatajuba|pinus|eucalipto|osb|compensado/.test(k)) return "Madeira";
    if (/concreto|cimento|argamassa/.test(k)) return "Concreto";
    if (/lou[cç]a|cer[aâ]mic|porcelanato/.test(k)) return "Cerâmica";
    if (/granito|m[aá]rmore|pedra/.test(k)) return "Pedra";
    if (/pvc|polietileno|pl[aá]stic|poliamida|epdm|borracha|ppr/.test(k)) return "Plástico";
    return "Genérico";
  }

  /* ---------------------------------------------------------------- IDA
   * sólido avaliado (js/familia.js avaliar → números em metros) → primitiva */
  function primitivaDe(s, i) {
    var mat = txt(s.material) || "Genérico", base = { id: txt(s.id) || ("s" + (i + 1)), mat: mat, grupo: "corpo", nome: txt(s.nome) || ("Sólido " + (i + 1)) };
    var rot = fin(s.rot) ? s.rot : 0, o;
    if (s.forma === "caixa") {
      o = { tipo: "prisma", origem: ponto(s.x, s.y, s.z), u: dirX(rot), v: dirMenosZ(rot),
            poly: [[r1(-s.dx * 500), r1(-s.dz * 500)], [r1(s.dx * 500), r1(-s.dz * 500)], [r1(s.dx * 500), r1(s.dz * 500)], [r1(-s.dx * 500), r1(s.dz * 500)]],
            e0: 0, e1: r1(s.dy * 1000) };
    } else if (s.forma === "cilindro") {
      /* js/familia.js: o cilindro não gira (rot só vale para caixa e extrusão) — eixo y em pé, x e z deitados, a partir da base */
      var eixo = s.eixo === "x" ? [1, 0, 0] : (s.eixo === "z" ? [0, -1, 0] : [0, 0, 1]);
      o = { tipo: "cilindro", base: ponto(s.x, s.y, s.z), eixo: eixo, raio: r1(s.raio * 1000), comp: r1(s.altura * 1000) };
    } else {
      var cont = arr(s.contorno);
      if (s.plano === "frente") {
        /* contorno (x, y) de frente, extrudado em +Z local do OrçaPRO = u × v com u = X girado e v = para cima */
        o = { tipo: "prisma", origem: ponto(s.x, s.y, s.z), u: dirX(rot), v: [0, 0, 1], poly: cont.map(function (q) { return [r1(q[0] * 1000), r1(q[1] * 1000)]; }), e0: 0, e1: r1(s.altura * 1000) };
      } else {
        /* contorno (x, z) em planta, extrudado para cima; z local = −(Y local do Revit) */
        o = { tipo: "prisma", origem: ponto(s.x, s.y, s.z), u: dirX(rot), v: dirMenosZ(rot), poly: cont.map(function (q) { return [r1(q[0] * 1000), r1(-q[1] * 1000)]; }), e0: 0, e1: r1(s.altura * 1000) };
      }
    }
    Object.keys(o).forEach(function (k) { base[k] = o[k]; });
    return base;
  }
  function extremos(prims) {
    var b = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
    function p(q) { ["x", "y", "z"].forEach(function (k, i) { if (q[i] < b[k][0]) b[k][0] = q[i]; if (q[i] > b[k][1]) b[k][1] = q[i]; }); }
    prims.forEach(function (pr) {
      if (pr.tipo === "prisma") {
        var n = cruz(unit(pr.u), unit(pr.v));
        pr.poly.forEach(function (ab) {
          var q = soma(soma(pr.origem, unit(pr.u), ab[0]), unit(pr.v), ab[1]);
          p(soma(q, n, pr.e0)); p(soma(q, n, pr.e1));
        });
      } else if (pr.tipo === "cilindro" || pr.tipo === "anel") {
        var d = unit(pr.eixo), a = Math.abs(d[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = unit(cruz(d, a)), e2 = cruz(d, e1);
        [pr.base, soma(pr.base, d, pr.comp)].forEach(function (c) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (k) { p(soma(soma(c, e1, k[0] * pr.raio), e2, k[1] * pr.raio)); }); });
      }
    });
    if (b.x[0] === Infinity) return null;
    return { x: [r1(b.x[0]), r1(b.x[1])], y: [r1(b.y[0]), r1(b.y[1])], z: [r1(b.z[0]), r1(b.z[1])] };
  }

  /* fórmula do OrçaPRO → sintaxe do Revit (PROPOSTA): só troca nome de função e
     operador; o que o Revit não tem (<=, >=, <>, min, max) vira if()/not(). As
     constantes continuam em METROS — o construtor genérico confere a unidade. */
  function formulaRevit(expr, Familia) {
    if (expr == null || expr === "") return { ok: true, texto: "" };
    var ast;
    try { ast = Familia.analisar(String(expr)); } catch (e) { return { ok: false, texto: "", motivo: e.message }; }
    var falha = null;
    function n(v) { var s = String(Math.round(v * 1e9) / 1e9); return s; }
    function f(a) {
      switch (a.k) {
        case "num": return n(a.v);
        case "ref": return a.nome;
        case "neg": return "-(" + f(a.a) + ")";
        case "nao": return "not(" + f(a.a) + ")";
        case "e": return "and(" + f(a.a) + ", " + f(a.b) + ")";
        case "ou": return "or(" + f(a.a) + ", " + f(a.b) + ")";
        case "cmp":
          if (a.op === "<=") return "not(" + f(a.a) + " > " + f(a.b) + ")";
          if (a.op === ">=") return "not(" + f(a.a) + " < " + f(a.b) + ")";
          if (a.op === "<>") return "not(" + f(a.a) + " = " + f(a.b) + ")";
          return "(" + f(a.a) + " " + a.op + " " + f(a.b) + ")";
        case "bin": return "(" + f(a.a) + " " + a.op + " " + f(a.b) + ")";
        case "fn": {
          var g = a.args.map(f);
          switch (a.f) {
            case "se": return "if(" + g[0] + ", " + g[1] + ", " + g[2] + ")";
            case "min": return g.reduce(function (x, y) { return "if(" + x + " < " + y + ", " + x + ", " + y + ")"; });
            case "max": return g.reduce(function (x, y) { return "if(" + x + " > " + y + ", " + x + ", " + y + ")"; });
            case "arred": return g.length > 1 ? "(round(" + g[0] + " * 10 ^ " + g[1] + ") / 10 ^ " + g[1] + ")" : "round(" + g[0] + ")";
            case "raiz": return "sqrt(" + g[0] + ")"; case "abs": return "abs(" + g[0] + ")";
            case "teto": return "roundup(" + g[0] + ")"; case "piso": return "rounddown(" + g[0] + ")";
            case "pi": return "pi()";
            /* seno/cosseno: no OrçaPRO o argumento é número em graus; no Revit, ângulo com unidade — não traduz calado */
            default: falha = "função " + a.f + "() precisa de parâmetro de ângulo no Revit — resolvida por tipo"; return "0";
          }
        }
      }
      falha = "expressão desconhecida"; return "0";
    }
    var t = f(ast);
    return falha ? { ok: false, texto: "", motivo: falha } : { ok: true, texto: t };
  }

  function semPrecoFam(fam) {
    var f = JSON.parse(JSON.stringify(fam || {}));
    var tira = function (o) { if (o && typeof o === "object") ["preco", "custo", "valor", "custoUnitario", "custoMO", "custoMAT", "custoEQ"].forEach(function (k) { delete o[k]; }); };
    tira(f.quantitativo); arr(f.tipos).forEach(tira); arr(f.servicos).forEach(tira);
    delete f._origem;
    return f;
  }

  /* família do OrçaPRO → JSON no contrato RA. opts: { Familia, sha256, agora } */
  function paraFonteRevit(fam, opts) {
    opts = opts || {};
    var F = opts.Familia || global.Familia;
    if (!F) return { ok: false, erros: ["sem o motor de família (js/familia.js)"] };
    var v = F.validar(fam);
    if (!v.ok) return { ok: false, erros: v.erros };
    var limpa = semPrecoFam(fam), erros = [], avisos = [], materiais = {}, porTipo = {}, tipos = [];
    var tiposFam = arr(fam.tipos).length ? arr(fam.tipos) : [{ id: "padrao", nome: "Padrão", valores: {} }];
    tiposFam.forEach(function (t) {
      var av = F.avaliar(fam, t.id, {});
      if (!av.ok) { erros.push("tipo \"" + t.nome + "\": " + av.erros.join("; ")); return; }
      var prims = av.solidos.map(primitivaDe);
      prims.forEach(function (p) { if (!materiais[p.mat]) materiais[p.mat] = { rgb: corDe(p.mat, null), brilho: /vidro|inox|alum|metal/i.test(p.mat) ? 70 : 30, classe: classeDe(p.mat), obs: "material da família OrçaPRO \"" + txt(fam.nome) + "\"" }; });
      porTipo[t.nome] = prims;
      var valores = {}; Object.keys(av.valores).forEach(function (k) { var x = av.valores[k]; valores[k] = typeof x === "number" ? r6(x) : x; });
      var tp = { nome: t.nome, id: t.id, valores: valores, quantidade: r6(av.quantitativo.quantidade), unidade: av.quantitativo.unidade };
      if (av.abertura) tp.abertura_mm = { largura: r1(av.abertura.largura * 1000), altura: r1(av.abertura.altura * 1000), peitoril: r1(av.abertura.peitoril * 1000) };
      if (av.quantitativo.codigo) tp.codigoOrcamento = av.quantitativo.codigo;   /* o código vai; o preço nunca */
      tipos.push(tp);
    });
    if (erros.length) return { ok: false, erros: erros };
    var parametros = arr(fam.parametros).map(function (p) {
      var o = { nome: p.nome, tipoDado: p.tipoDado || "numero", revit: TIPO_REVIT[p.tipoDado] || "Number", escopo: p.escopo === "instancia" ? "instancia" : "tipo", grupo: txt(p.grupo) };
      if (UNID[p.tipoDado]) o.unidade = UNID[p.tipoDado];
      if (p.formula) {
        var fr = formulaRevit(p.formula, F);
        o.formula = String(p.formula);
        if (fr.ok) o.formulaRevit = fr.texto; else { o.formulaRevit = null; avisos.push("fórmula de \"" + p.nome + "\" não traduzida para o Revit (" + fr.motivo + ") — o valor vai resolvido por tipo"); }
      } else o.valorPadrao = p.valor;
      return o;
    });
    var prim0 = porTipo[tipos[0].nome];
    var corpo = {
      formato: FORMATO, versao: VERSAO,
      _leia: "Fonte única da família para o pipeline RA do Revit (contrato do bombup230.json: materiais + primitivas em mm, Z para cima). Gerado pelo OrçaPRO (js/familiarevit.js). Sem preço.",
      origem: { app: txt(opts.app) || "OrçaPRO", familiaId: txt(fam.id), geradoEm: opts.agora || new Date().toISOString(),
                sha256Familia: typeof opts.sha256 === "function" ? opts.sha256(JSON.stringify(limpa)) : "" },
      nome: txt(fam.nome), categoria: CAT_REVIT[fam.categoria] || "OST_GenericModel", categoriaOrcaPRO: fam.categoria || "generico",
      hospedagem: fam.hospedagem === "parede" ? "parede" : "livre",
      spec: { Nome: txt(fam.nome), Descricao: txt(fam.descricao), Quantitativo: txt((fam.quantitativo || {}).descricao), Unidade: txt((fam.quantitativo || {}).unidade) || "un",
              Fonte: "Família OrçaPRO " + txt(fam.id) },
      tipos: tipos, parametros: parametros, materiais: materiais,
      primitivas: prim0, primitivasPorTipo: porTipo, extremos_mm: extremos(prim0),
      familiaOrcaPRO: limpa
    };
    return { ok: true, fonte: corpo, avisos: avisos.concat(v.avisos || []) };
  }

  /* -------------------------------------------------------------- CONFERIR */
  function conferirFonte(o) {
    var erros = [];
    if (!o || typeof o !== "object") return { ok: false, erros: ["não é um objeto JSON"] };
    if (o.formato != null && o.formato !== FORMATO) erros.push("formato \"" + o.formato + "\" não é " + FORMATO);
    if (o.versao != null && !(o.versao >= 1 && o.versao <= VERSAO)) erros.push("versão " + o.versao + " — este OrçaPRO lê até a " + VERSAO);
    var mats = o.materiais;
    if (!mats || typeof mats !== "object" || Array.isArray(mats) || !Object.keys(mats).length) erros.push("materiais: falta o dicionário { nome: { rgb, brilho, classe } }");
    else Object.keys(mats).forEach(function (k) {
      var m = mats[k] || {};
      if (!(Array.isArray(m.rgb) && m.rgb.length === 3 && m.rgb.every(function (c) { return fin(c) && c >= 0 && c <= 255; }))) erros.push("material \"" + k + "\": rgb precisa de 3 números de 0 a 255");
      if (!fin(m.brilho)) erros.push("material \"" + k + "\": brilho precisa ser número");
      if (!txt(m.classe)) erros.push("material \"" + k + "\": falta a classe");
    });
    var ps = o.primitivas, ids = {};
    if (!Array.isArray(ps) || !ps.length) { erros.push("primitivas: lista vazia"); return { ok: false, erros: erros }; }
    ps.forEach(function (p, i) {
      var rot = "primitiva " + (p && p.id ? "\"" + p.id + "\"" : (i + 1));
      if (!p || typeof p !== "object") { erros.push(rot + ": vazia"); return; }
      if (!txt(p.id)) erros.push(rot + ": falta o id"); else if (ids[p.id]) erros.push(rot + ": id repetido"); ids[p.id] = 1;
      if (PRIMITIVAS.indexOf(p.tipo) < 0) { erros.push(rot + ": tipo \"" + txt(p.tipo) + "\" fora do contrato (" + PRIMITIVAS.join(", ") + ")"); return; }
      if (!mats || !mats[p.mat]) erros.push(rot + ": material \"" + txt(p.mat) + "\" não está em materiais");
      if (!txt(p.grupo)) erros.push(rot + ": falta o grupo (subcategoria)");
      if (p.tipo === "prisma") {
        if (!vet3(p.origem) || !vet3(p.u) || !vet3(p.v)) erros.push(rot + ": origem, u e v precisam de 3 números");
        else if (norma(p.u) < 1e-9 || norma(p.v) < 1e-9 || Math.abs(unit(p.u)[0] * unit(p.v)[0] + unit(p.u)[1] * unit(p.v)[1] + unit(p.u)[2] * unit(p.v)[2]) > 1e-3) erros.push(rot + ": u e v precisam ser perpendiculares e não nulos");
        if (!Array.isArray(p.poly) || p.poly.length < 3 || !p.poly.every(function (q) { return Array.isArray(q) && q.length === 2 && fin(q[0]) && fin(q[1]); })) erros.push(rot + ": poly precisa de 3 pontos [a, b] ou mais");
        if (!fin(p.e0) || !fin(p.e1) || !(p.e1 > p.e0)) erros.push(rot + ": extrusão precisa de e0 < e1");
      } else if (p.tipo === "cilindro" || p.tipo === "anel") {
        if (!vet3(p.base) || !vet3(p.eixo) || norma(p.eixo) < 1e-9) erros.push(rot + ": base e eixo precisam de 3 números (eixo não nulo)");
        if (!(fin(p.raio) && p.raio > 0)) erros.push(rot + ": raio precisa ser > 0");
        if (!(fin(p.comp) && p.comp !== 0)) erros.push(rot + ": comp precisa ser número diferente de 0");
        if (p.tipo === "anel" && !(fin(p.raio_int) && p.raio_int > 0 && p.raio_int < p.raio)) erros.push(rot + ": raio_int precisa ficar entre 0 e o raio");
      } else if (p.tipo === "revolucao") {
        if (!(Array.isArray(p.centro) && p.centro.length === 2 && p.centro.every(fin))) erros.push(rot + ": centro precisa de [cx, cy]");
        if (!Array.isArray(p.perfil) || p.perfil.length < 3 || !p.perfil.every(function (q) { return Array.isArray(q) && q.length === 2 && fin(q[0]) && q[0] >= 0 && fin(q[1]); })) erros.push(rot + ": perfil precisa de 3 pontos [r ≥ 0, z] ou mais");
      } else if (p.tipo === "curva") {
        if (!vet3(p.ini) || !vet3(p.dir) || !vet3(p.vira)) erros.push(rot + ": ini, dir e vira precisam de 3 números");
        if (!(fin(p.rc) && p.rc > 0) || !(fin(p.raio) && p.raio > 0) || !(fin(p.ang) && p.ang > 0 && p.ang <= 180)) erros.push(rot + ": rc, raio > 0 e ang de 0 a 180");
      }
    });
    if (o.tipos != null && !(Array.isArray(o.tipos) && o.tipos.every(function (t) { return t && txt(t.nome); }))) erros.push("tipos: cada tipo precisa de nome");
    /* chave que COMEÇA com preço/custo (o "valores" do tipo é o dos parâmetros, não dinheiro) */
    if (/"(preco|custo)[A-Za-z_$]*"\s*:/i.test(JSON.stringify(o.tipos || [])) || (o.familiaOrcaPRO && /"(preco|custo)[A-Za-z_$]*"\s*:/i.test(JSON.stringify(o.familiaOrcaPRO)))) erros.push("a fonte leva preço — família nunca leva preço");
    return { ok: !erros.length, erros: erros };
  }

  /* ---------------------------------------------------------------- VOLTA
   * JSON no contrato RA → família do OrçaPRO. Com `familiaOrcaPRO` (veio daqui)
   * a volta é sem perda; sem ele (fonte feita no Revit, como a do BombUp) a
   * geometria vira os sólidos do OrçaPRO — o que não tem forma equivalente é
   * APROXIMADO e dito em `avisos` (nunca some calado). */
  function opDe(q) { return [q[0] / 1000, q[2] / 1000, -q[1] / 1000]; }   /* Revit mm → OrçaPRO m */
  function n4(v) { return String(Math.round(v * 10000) / 10000); }
  function eixoAlinhado(d) {
    var u = unit(d);
    if (Math.abs(Math.abs(u[2]) - 1) < 1e-6) return "y";
    if (Math.abs(Math.abs(u[0]) - 1) < 1e-6) return "x";
    if (Math.abs(Math.abs(u[1]) - 1) < 1e-6) return "z";
    return null;
  }
  /* segmento reto de a a b (mm, Revit) com raio r → cilindro do OrçaPRO ou null */
  function cilindroEntre(a, b, r, base) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = norma(d), ex = eixoAlinhado(d);
    if (!(L > 0.01) || !ex) return null;
    var pa = opDe(a), pb = opDe(b), k = ex === "x" ? 0 : (ex === "y" ? 1 : 2);
    var ini = pa[k] <= pb[k] ? pa : pb;
    return { id: base.id, nome: base.nome, forma: "cilindro", eixo: ex, x: n4(ini[0]), y: n4(ini[1]), z: n4(ini[2]), raio: n4(r / 1000), altura: n4(L / 1000), material: base.material, cor: base.cor };
  }
  function solidosDe(p, cor, avisos) {
    var base = { id: txt(p.id), nome: txt(p.nome) || txt(p.id), material: txt(p.mat), cor: cor };
    var out = [];
    if (p.tipo === "cilindro" || p.tipo === "anel") {
      var c = cilindroEntre(p.base, soma(p.base, unit(p.eixo), p.comp), p.raio, base);
      if (c) { out.push(c); if (p.tipo === "anel") avisos.push("\"" + base.nome + "\": anel virou cilindro cheio (o furo interno não tem forma no OrçaPRO)"); }
      else avisos.push("\"" + base.nome + "\": cilindro com eixo inclinado ficou de fora");
    } else if (p.tipo === "prisma") {
      var u = unit(p.u), v = unit(p.v), n = cruz(u, v), poly = p.poly;
      var hor = function (w) { return Math.abs(w[2]) < 1e-6; };
      if (Math.abs(Math.abs(n[2]) - 1) < 1e-6) {
        /* plano horizontal → extrusão em planta, para cima */
        var rot = Math.atan2(u[1], u[0]) * 180 / Math.PI, my = dirMenosZ(rot), sv = (v[0] * my[0] + v[1] * my[1]) > 0 ? 1 : -1;
        var o0 = opDe(p.origem), cima = n[2] > 0;
        out.push({ id: base.id, nome: base.nome, forma: "extrusao", plano: "planta", x: n4(o0[0]), y: n4(o0[1] + (cima ? p.e0 : -p.e1) / 1000), z: n4(o0[2]), rot: n4(rot),
                   altura: n4((p.e1 - p.e0) / 1000), contorno: poly.map(function (q) { return [n4(q[0] / 1000), n4(-sv * q[1] / 1000)]; }), material: base.material, cor: cor });
      } else if (hor(n) && (Math.abs(Math.abs(v[2]) - 1) < 1e-6 || Math.abs(Math.abs(u[2]) - 1) < 1e-6)) {
        /* plano vertical → extrusão de frente; o eixo horizontal do plano é o X local */
        var trocou = Math.abs(Math.abs(u[2]) - 1) < 1e-6, h = trocou ? v : u, vz = trocou ? u[2] : v[2];
        var rotF = Math.atan2(h[1], h[0]) * 180 / Math.PI, zLoc = [Math.sin(rotF * Math.PI / 180), -Math.cos(rotF * Math.PI / 180), 0];
        var mesmo = (n[0] * zLoc[0] + n[1] * zLoc[1]) > 0;
        var org = soma(p.origem, n, mesmo ? p.e0 : p.e1), o1 = opDe(org);
        out.push({ id: base.id, nome: base.nome, forma: "extrusao", plano: "frente", x: n4(o1[0]), y: n4(o1[1]), z: n4(o1[2]), rot: n4(rotF), altura: n4((p.e1 - p.e0) / 1000),
                   contorno: poly.map(function (q) { var a = trocou ? q[1] : q[0], b = trocou ? q[0] : q[1]; return [n4(a / 1000), n4(vz * b / 1000)]; }), material: base.material, cor: cor });
      } else avisos.push("\"" + base.nome + "\": prisma em plano inclinado ficou de fora");
    } else if (p.tipo === "revolucao") {
      /* sólido de revolução → cilindros empilhados pelo CONTORNO EXTERNO (os trechos do perfil que sobem);
         trecho cônico em fatias de até 25 mm de raio, cada uma com o raio maior (envelope) */
      var fatias = [], cx = p.centro[0], cy = p.centro[1];
      for (var i = 0; i + 1 < p.perfil.length; i++) {
        var a = p.perfil[i], b = p.perfil[i + 1];
        if (!(b[1] - a[1] > 0.5)) continue;
        var nf = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 25));
        for (var j = 0; j < nf; j++) {
          var z0 = a[1] + (b[1] - a[1]) * j / nf, z1 = a[1] + (b[1] - a[1]) * (j + 1) / nf;
          var ra = a[0] + (b[0] - a[0]) * j / nf, rb = a[0] + (b[0] - a[0]) * (j + 1) / nf, r = Math.max(ra, rb);
          var ult = fatias[fatias.length - 1];
          if (ult && Math.abs(ult.r - r) <= 2 && Math.abs(ult.z1 - z0) < 0.5) ult.z1 = z1; else if (r > 0.5) fatias.push({ r: r, z0: z0, z1: z1 });
        }
      }
      fatias.forEach(function (f, k) {
        var c2 = cilindroEntre([cx, cy, f.z0], [cx, cy, f.z1], f.r, { id: base.id + "_" + (k + 1), nome: base.nome, material: base.material, cor: cor });
        if (c2) out.push(c2);
      });
      if (out.length) avisos.push("\"" + base.nome + "\": revolução aproximada por " + out.length + " cilindro(s) pelo contorno externo");
    } else if (p.tipo === "curva") {
      var d0 = unit(p.dir), w = unit(p.vira), t = Math.tan(p.ang * Math.PI / 360) * p.rc;
      var giro = function (vv, ang) { var c = Math.cos(ang), s = Math.sin(ang); return [vv[0] * c + w[0] * s, vv[1] * c + w[1] * s, vv[2] * c + w[2] * s]; };
      var canto = soma(p.ini, d0, t), fim = soma(canto, unit(giro(d0, p.ang * Math.PI / 180)), t);
      var c3 = cilindroEntre(p.ini, canto, p.raio, { id: base.id + "_1", nome: base.nome, material: base.material, cor: cor }),
          c4 = cilindroEntre(canto, fim, p.raio, { id: base.id + "_2", nome: base.nome, material: base.material, cor: cor });
      if (c3 && c4) { out.push(c3, c4); avisos.push("\"" + base.nome + "\": curva aproximada por 2 trechos retos"); }
      else avisos.push("\"" + base.nome + "\": curva fora dos eixos ficou de fora");
    }
    return out;
  }
  function hex(rgb) { return "#" + rgb.map(function (c) { var h = Math.max(0, Math.min(255, Math.round(c))).toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }

  /* opts: { Familia, grupos: [lista de grupos a trazer] (vazio = todos) } */
  function deFonteRevit(o, opts) {
    opts = opts || {};
    var F = opts.Familia || global.Familia;
    var c = conferirFonte(o);
    if (!c.ok) return { ok: false, erros: c.erros };
    if (o.familiaOrcaPRO && typeof o.familiaOrcaPRO === "object") {
      var fam0 = JSON.parse(JSON.stringify(o.familiaOrcaPRO));
      var v0 = F ? F.validar(fam0) : { ok: true, erros: [] };
      return v0.ok ? { ok: true, familia: fam0, avisos: [], semPerda: true } : { ok: false, erros: v0.erros };
    }
    var avisos = [], solidos = [], so = arr(opts.grupos);
    o.primitivas.forEach(function (p) {
      if (so.length && so.indexOf(p.grupo) < 0) return;
      var m = o.materiais[p.mat] || {};
      solidosDe(p, hex(m.rgb || [200, 204, 210]), avisos).forEach(function (s, i) { s.id = txt(s.id) || ("s" + i); solidos.push(s); });
    });
    var vistos = {};
    solidos.forEach(function (s, i) { if (vistos[s.id]) s.id = s.id + "_" + i; vistos[s.id] = 1; });
    var nome = txt(o.nome) || txt(o.spec && (o.spec.Produto || o.spec.Modelo)) || "Família do Revit";
    var fam = {
      id: "fam-revit-" + (slug(nome) || "sem-nome"), nome: nome, categoria: CAT_VOLTA[o.categoria] || "equipamento", hospedagem: "livre",
      descricao: "Trazida da fonte RA do Revit (geometria fixa" + (avisos.length ? ", aproximada — ver avisos" : "") + ").",
      parametros: [], tipos: arr(o.tipos).map(function (t, i) { return { id: "t" + (i + 1), nome: txt(t.nome), valores: {} }; }),
      solidos: solidos, quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: nome }
    };
    if (!fam.tipos.length) fam.tipos = [{ id: "t1", nome: "Padrão", valores: {} }];
    var v = F ? F.validar(fam) : { ok: true, erros: [] };
    if (!v.ok) return { ok: false, erros: v.erros };
    return { ok: true, familia: fam, avisos: avisos, semPerda: false };
  }

  /* caixa EXATA dos sólidos avaliados (m, OrçaPRO), com o giro aplicado como o
     3D aplica (js/bim.js famMalhas). O caixaDe do familia.js ignora o giro de
     propósito (encaixe rápido); para provar a ida e volta precisa ser exata. */
  function caixaExata(solidos) {
    var b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    function p(x, y, z) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; }
    function gira(s, lx, ly, lz) { var t = (s.rot || 0) * Math.PI / 180, c = Math.cos(t), si = Math.sin(t); p(s.x + lx * c + lz * si, s.y + ly, s.z - lx * si + lz * c); }
    arr(solidos).forEach(function (s) {
      if (s.forma === "caixa") { [-1, 1].forEach(function (i) { [0, 1].forEach(function (j) { [-1, 1].forEach(function (k) { gira(s, i * s.dx / 2, j * s.dy, k * s.dz / 2); }); }); }); }
      else if (s.forma === "cilindro") {
        if (s.eixo === "x") { p(s.x, s.y - s.raio, s.z - s.raio); p(s.x + s.altura, s.y + s.raio, s.z + s.raio); }
        else if (s.eixo === "z") { p(s.x - s.raio, s.y - s.raio, s.z); p(s.x + s.raio, s.y + s.raio, s.z + s.altura); }
        else { p(s.x - s.raio, s.y, s.z - s.raio); p(s.x + s.raio, s.y + s.altura, s.z + s.raio); }
      } else arr(s.contorno).forEach(function (q) {
        if (s.plano === "frente") { gira(s, q[0], q[1], 0); gira(s, q[0], q[1], s.altura); }
        else { gira(s, q[0], 0, q[1]); gira(s, q[0], s.altura, q[1]); }
      });
    });
    return b.x0 === Infinity ? null : b;
  }

  var FamiliaRevit = {
    FORMATO: FORMATO, VERSAO: VERSAO, CAT_REVIT: CAT_REVIT, PRIMITIVAS: PRIMITIVAS,
    paraFonteRevit: paraFonteRevit, deFonteRevit: deFonteRevit, conferirFonte: conferirFonte, formulaRevit: formulaRevit,
    caixaExata: caixaExata, _ponto: ponto, _extremos: extremos
  };
  global.FamiliaRevit = FamiliaRevit;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliaRevit;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
