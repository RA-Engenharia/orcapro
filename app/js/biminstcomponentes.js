/* =====================================================================
 * biminstcomponentes.js (HidComponentes) — o catálogo ÚNICO de componentes do hidrossanitário (27/10/2026, frente 3).
 *
 * Pedido do Rogério: "quero encontrar tudo num só lugar para modelar à mão". A modelagem manual estava espalhada em seis lugares
 * (fita Instalações, seletor de tipos, Famílias paramétricas, Banco de famílias, Biblioteca do escritório, Templates RA). Este
 * motor LÊ de todos eles — não copia dado: cada chamada monta o catálogo a partir das fontes que existem carregadas.
 *
 *   todos()                    todos os itens (cópia rasa da lista; o item é o mesmo objeto)
 *   grupos()                   [{ grupo, n }] na ordem da tela (inclui os vazios, com n = 0)
 *   buscar(texto, filtros)     sem acento, por sinônimo simples ("azul" acha o joelho com bucha de latão); filtros
 *                              { sistema, grupo, material, fabricante, soComCota }
 *   item(id)                   um item pelo id, ou null
 *   filtrosDisponiveis()       { sistemas, materiais, fabricantes } para os seletores da tela
 *   alvoDaAcao(acao)           [global, função] que a ação chama (a tela e o teste conferem que existe)
 *
 * Cada item: id, nome, grupo, sistemas[], material, materialNome, dns[], fabricante, fonte (texto com a página), portas[]
 *   ({ id, nome, papel, dir:[x,y,z], dn, junta, opcional, sistema }), selos[] (texto: "sem cota de catálogo", "a conferir"…),
 *   comCota (bool), icone, sinonimos[], acao { tipo: armarTubo | armarPeca | colocarFamilia | armarAcessorio | conexaoManual |
 *   abrirTemplate, + argumentos }, origem.
 *
 * CONEXÃO MANUAL (puro): noEm(rede, p), opsForcar(estado, no, tipo), opsAutomatico(estado, no), escolhaDoNo(estado, no) — a conexão
 * escolhida fica gravada como peça FORÇADA na ponta do trecho (pecaIni/pecaFim, o mesmo campo da união/tê de inspeção); o motor
 * (BimInst.decidir) a honra quando serve ao nó e avisa quando não serve.
 *
 * Teste: node tools/test-hid-componentes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function norm(s) { s = txt(s); return (s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s).toLowerCase(); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HP() { return dep("HidPortas", "./biminstportas.js"); }
  function GD() { return dep("HidGeoDados", "./biminstgeodados.js"); }
  function TI() { return dep("BimInstTipos", "./biminsttipos.js"); }

  var GRUPOS = ["Tubos", "Conexões", "Registros e válvulas", "Louças e metais", "Ralos e caixas", "Reservatórios e tanques",
                "Equipamentos", "Incêndio", "Climatização", "Piscina", "Escritório", "Templates"];
  var PASTA_ICONES = "img/hid-pecas/";

  /* ------------------------------------------------------------- sinônimos (simples, por tipo e por trecho do nome) */
  var SIN_TIPO = {
    joelho90: ["cotovelo"], joelho45: ["cotovelo"], curva90: ["cotovelo"], curva45: ["cotovelo"],
    te: ["tee"], juncao: ["derivacao", "junção simples"], juncao_reducao: ["derivacao"], juncao_dupla: ["derivacao"], juncao_invertida: ["derivacao"],
    luva: ["emenda"], luva_correr: ["emenda"], uniao: ["desmontavel"], uniao_mista: ["desmontavel"],
    uniao_flangeada: ["flange"], adaptador_caixa: ["flange", "caixa dagua", "reservatorio"], adaptador: ["niple", "soldavel rosca"], luva_bucha: ["azul", "ponto de agua", "rosca femea"],
    cap: ["tampao"], plug: ["tampao"], reducao: ["redutor"], bucha: ["redutor"], bucha_longa: ["redutor"], luva_reducao: ["redutor"],
    terminal_ventilacao: ["respiro", "chapeu"], te_inspecao: ["visita", "limpeza"], curva_pe_coluna: ["pe de coluna"], cruzeta: ["quatro vias"]
  };
  /* "azul" é o apelido de obra da peça PVC com bucha de latão (junta azul): joelho/tê/luva com bucha de latão */
  function sinonimosNome(nome) {
    var n = norm(nome), s = [];
    if (/bucha de lat/.test(n)) s.push("azul", "bucha azul", "ponto de agua");
    if (/sifon/.test(n)) s.push("sifao");
    if (/caixa d.?agua|reservatorio|cisterna/.test(n)) s.push("boia", "caixa dagua");
    if (/flang/.test(n)) s.push("flange");
    return s;
  }

  /* ------------------------------------------------------------- utilidades */
  function primeiroNumero(s) { var m = /\d+(\.\d+)?/.exec(txt(s)); return m ? Number(m[0]) : 0; }
  function ordenaDns(l) { return l.slice().sort(function (a, b) { return primeiroNumero(a) - primeiroNumero(b) || (a < b ? -1 : a > b ? 1 : 0); }); }
  function unicos(l) { return l.filter(function (v, i, a) { return v !== "" && a.indexOf(v) === i; }); }
  function fabricanteDe(fonteTxt) {
    var t = norm(fonteTxt);
    if (/amanco|wavin/.test(t)) return "Amanco Wavin";
    if (/tigre/.test(t)) return "Tigre";
    if (/krona/.test(t)) return "Krona";
    if (/deca/.test(t)) return "Deca";
    return "";
  }
  function sistemasDoMaterial(mat) {
    var B = BI(); if (!B) return [];
    return Object.keys(B.SISTEMAS).filter(function (s) { return arr(B.SISTEMAS[s].materiais).indexOf(mat) >= 0; });
  }
  function mk(o) {
    var it = { id: "", nome: "", grupo: "", sistemas: [], material: "", materialNome: "", dns: [], fabricante: "", fonte: "", portas: [],
               selos: [], comCota: false, icone: "", sinonimos: [], acao: null, origem: "RA", descricao: "" };
    Object.keys(o).forEach(function (k) { it[k] = o[k]; });
    it.sinonimos = unicos(arr(it.sinonimos).concat(sinonimosNome(it.nome)));
    return it;
  }

  /* ------------------------------------------------------------- 1) TUBOS */
  function itensTubos() {
    var B = BI(), T = TI(), out = [];
    if (!B || !T) return out;
    arr(T.TUBOS).forEach(function (t) {
      var M = B.MATERIAIS[t.material], S = B.SISTEMAS[t.sistema], selos = [];
      var ok = !!(M && S && arr(S.materiais).indexOf(t.material) >= 0);
      if (!ok) selos.push("indisponível: " + (t.semMaterial || ("material " + t.material + " fora do sistema " + t.sistema)));
      if (t.pn && M && arr(M.pns).indexOf(t.pn) < 0) selos.push("a conferir: série PN" + t.pn + " fora das séries do material");
      out.push(mk({ id: "tubo:" + t.id, nome: t.nome, grupo: "Tubos", sistemas: [t.sistema], material: t.material, materialNome: M ? M.nome : t.material,
        dns: M ? arr(M.dns).map(String) : [], fonte: M && M.norma ? M.norma : "", selos: selos, comCota: ok,
        icone: PASTA_ICONES + "tubo-" + t.material.replace(/_/g, "-") + "-256.png", sinonimos: ["tubulacao", "cano"],
        acao: { tipo: "armarTubo", sistema: t.sistema, material: t.material, pn: t.pn || "", tuboId: t.id, disponivel: ok } }));
    });
    return out;
  }

  /* ------------------------------------------------------------- 2) CONEXÕES (HidPortas × catálogo dos fabricantes) */
  function itensConexoes() {
    var B = BI(), P = HP(), G = GD(), out = [];
    if (!B || !P) return out;
    var mats = ["pvc_soldavel", "pvc_esgoto", "pvc_serie_r"];
    if (G) [G.conexoes, G.conexoesBrutas].forEach(function (q) { Object.keys(q || {}).forEach(function (m) { if (mats.indexOf(m) < 0) mats.push(m); }); });
    var Pec = dep("HidPecas", "./hidpecas.js"), icones = {};
    try { arr(Pec && Pec.todas ? Pec.todas() : []).forEach(function (f) { if (f.classe === "conexao" && f.icone) icones[f.tipo + "|" + f.material] = f.icone; }); } catch (e) {}
    P.tipos().forEach(function (tipo) {
      var achou = false;
      mats.forEach(function (mat) {
        var cota = G && G.conexoes && G.conexoes[mat] && G.conexoes[mat][tipo] ? Object.keys(G.conexoes[mat][tipo]) : [];
        var brut = G && G.conexoesBrutas && G.conexoesBrutas[mat] && G.conexoesBrutas[mat][tipo] ? Object.keys(G.conexoesBrutas[mat][tipo]) : [];
        var sem = G ? arr(G.semCota).filter(function (s) { return s.material === mat && s.tipo === tipo; }) : [];
        var dns = ordenaDns(unicos(cota.concat(brut, sem.map(function (s) { return txt(s.dn); }))));
        if (!dns.length) return;
        achou = true;
        var ref = cota.length ? G.conexoes[mat][tipo][cota[0]] : (brut.length ? G.conexoesBrutas[mat][tipo][brut[0]] : sem[0]);
        var fonteTxt = ref && ref.f && G.fontes && G.fontes[ref.f] ? G.fontes[ref.f] : "", pag = ref && ref.pag ? ref.pag : null;
        var selos = [];
        if (!cota.length) selos.push("sem cota de catálogo");
        if (!cota.length && brut.length && G.conexoesBrutas[mat][tipo][brut[0]].interpretacao) selos.push("a conferir: letras brutas da ficha");
        var M = B.MATERIAIS[mat], nome = B.nomeConexao(tipo, mat) + " — " + (M ? M.nome : mat);
        out.push(mk({ id: "conexao:" + tipo + ":" + mat, nome: nome, grupo: "Conexões", sistemas: sistemasDoMaterial(mat), material: mat, materialNome: M ? M.nome : mat,
          dns: dns, fabricante: fabricanteDe(fonteTxt), fonte: fonteTxt ? fonteTxt + (pag ? ", p. " + pag : "") : "", portas: P.portasDe(tipo, mat, dns[0]),
          selos: selos, comCota: cota.length > 0, icone: icones[tipo + "|" + mat] ? PASTA_ICONES + icones[tipo + "|" + mat] + "-256.png" : "",
          sinonimos: SIN_TIPO[tipo] || [], descricao: "DN de exemplo das portas: " + dns[0],
          acao: { tipo: "conexaoManual", conexao: tipo, material: mat } }));
      });
      if (!achou) {
        out.push(mk({ id: "conexao:" + tipo + ":", nome: B.nomeConexao(tipo, "") + " — sem catálogo", grupo: "Conexões", portas: P.portasDe(tipo, "", ""),
          selos: ["sem peça no catálogo dos fabricantes", "sem cota de catálogo"], comCota: false, sinonimos: SIN_TIPO[tipo] || [],
          acao: { tipo: "conexaoManual", conexao: tipo, material: "" } }));
      }
    });
    return out;
  }

  /* ------------------------------------------------------------- 3) REGISTROS E VÁLVULAS (BimInst.ACESSORIOS × variantes) */
  var SIN_ACESSORIO = { registro_gaveta: ["gaveta"], registro_esfera: ["bola"], registro_pressao: ["chuveiro", "pressao"], valvula_retencao: ["retencao", "pe de crivo"] };
  function itensAcessorios() {
    var B = BI(), out = [];
    if (!B) return out;
    Object.keys(B.ACESSORIOS).forEach(function (k) {
      var A = B.ACESSORIOS[k];
      Object.keys(A.variantes).forEach(function (v) {
        var V = A.variantes[v], junta = V.rosca ? "rosca" : "soldavel";
        out.push(mk({ id: "acessorio:" + A.fam + ":" + v, nome: A.nome + " — " + V.rot, grupo: "Registros e válvulas", sistemas: arr(A.sistemas), material: V.material,
          materialNome: V.material, dns: [], fabricante: "", fonte: "Família RA " + A.fam + " (entra no eixo do tubo; o DN é o do tubo)", comCota: true,
          portas: [{ id: "face1", nome: "Face 1", papel: "entrada", dir: [-1, 0, 0], dn: "= DN do tubo", junta: junta, opcional: false },
                   { id: "face2", nome: "Face 2", papel: "saida", dir: [1, 0, 0], dn: "= DN do tubo", junta: junta, opcional: false }],
          icone: PASTA_ICONES + "ac-" + k.replace(/_/g, "-") + "-256.png", sinonimos: SIN_ACESSORIO[k] || [],
          acao: { tipo: "armarAcessorio", famId: A.fam, tipoId: v } }));
      });
    });
    return out;
  }

  /* ------------------------------------------------------------- 4) PEÇAS DO TRAÇADO (BimInst.PECAS) */
  var GRUPO_PECA = { ralo_sifonado: "Ralos e caixas", ralo_seco: "Ralos e caixas", caixa_sifonada: "Ralos e caixas", caixa_inspecao: "Ralos e caixas",
    terminal_ventilacao: "Ralos e caixas", hidrante_abrigo: "Incêndio", extintor: "Incêndio", chuveiro_automatico: "Incêndio", registro_recalque: "Incêndio",
    lira_expansao: "Registros e válvulas", purgador: "Registros e válvulas", valvula_bloqueio: "Registros e válvulas", reservatorio_ar: "Equipamentos" };
  function itensPecas() {
    var B = BI(), out = [];
    if (!B) return out;
    Object.keys(B.PECAS).forEach(function (k) {
      var P = B.PECAS[k], mats = arr(P.materiais);
      out.push(mk({ id: "peca:" + k, nome: P.nome, grupo: GRUPO_PECA[k] || "Equipamentos", sistemas: arr(P.sistemas), material: mats.length ? mats[0] : txt(P.material),
        materialNome: mats.length ? mats.join(" / ") : txt(P.material), dns: arr(P.dns).map(String), fonte: "Peça do traçado (BimInst.PECAS)", comCota: true,
        icone: PASTA_ICONES + "pc-" + k.replace(/_/g, "-") + "-256.png", sinonimos: k === "caixa_sifonada" ? ["sifao", "caixa sifonada"] : [],
        acao: { tipo: "armarPeca", peca: k, sistema: arr(P.sistemas)[0] } }));
    });
    return out;
  }

  /* ------------------------------------------------------------- 5) FAMÍLIAS */
  function grupoHid(f) {
    var id = txt(f.id), n = norm(f.nome);
    if (/registro|valvula/.test(id) && !/descarga/.test(id)) return "Registros e válvulas";
    if (/caixa-dagua|cisterna|reservatorio|base-caixa|tanque-ret|tanque-cil|sumidouro|vala/.test(id) && !/tanque-lavar/.test(id)) return "Reservatórios e tanques";
    if (/hidrante|extintor|sprinkler/.test(id)) return "Incêndio";
    if (/caixa-sifonada|ralo|caixa-gordura|caixa-inspecao|caixa-areia/.test(id)) return "Ralos e caixas";
    if (f.categoria === "loucas" || /torneira|misturador|chuveiro|ducha|bacia|lavatorio|cuba|pia|tanque-lavar|mictorio|descarga/.test(id)) return "Louças e metais";
    if (/pisc/.test(id) || /piscina/.test(n)) return "Piscina";
    return "Equipamentos";
  }
  function junta0(c) { return txt(c.junta || ""); }
  function portasDaFamilia(f) {
    var tp = arr(f.tipos)[0], v = tp && tp.valores ? tp.valores : {};
    return arr(f.conectores).map(function (c) {
      var dn = c.dn;
      if (typeof dn === "string" && v[dn] != null) dn = v[dn];
      var d = c.dir || {};
      return { id: txt(c.id), nome: txt(c.nome), papel: txt(c.papel), sistema: txt(c.sistema), dir: [Number(d.x) || 0, Number(d.y) || 0, Number(d.z) || 0],
               dn: dn == null ? "" : dn, junta: junta0(c), opcional: !!c.opcional, aConferir: !!c.aConferir };
    });
  }
  function itemFamilia(f, grupo, origem) {
    var tipos = arr(f.tipos), v0 = null, i;
    for (i = 0; i < tipos.length; i++) if (tipos[i] && tipos[i].valores && (tipos[i].valores.Fabricante || tipos[i].valores.Cotas_ficha)) { v0 = tipos[i].valores; break; }
    var fab = v0 ? txt(v0.Fabricante) : "", fonte = v0 ? [txt(v0.Fabricante), txt(v0.Edicao_ficha), v0.Pagina_ficha ? "p. " + v0.Pagina_ficha : ""].filter(function (s) { return s; }).join(", ") : "";
    var dns = [];
    tipos.forEach(function (t) { var v = t && t.valores; if (!v) return; Object.keys(v).forEach(function (k) { if (/^DN_/.test(k) && typeof v[k] === "number" && v[k] > 0) dns.push(String(v[k])); }); });
    var portas = portasDaFamilia(f), selos = [];
    var comCota = tipos.some(function (t) { return t && t.valores && t.valores.Cotas_ficha; });
    if (!comCota) selos.push("sem cota de catálogo");
    if (portas.some(function (p) { return p.aConferir; }) || tipos.some(function (t) { return t && t.valores && t.valores.A_conferir; })) selos.push("a conferir: posição de bocas ou cotas");
    if (!portas.length && !/^(Escritório)$/.test(grupo)) selos.push("sem ponto de ligação declarado");
    var tipo0 = tipos[0] ? tipos[0].id : "";
    return mk({ id: "familia:" + f.id, nome: txt(f.nome), grupo: grupo, sistemas: arr(f.sistemas), material: "", dns: ordenaDns(unicos(dns)), fabricante: fab, fonte: fonte,
      portas: portas, selos: selos, comCota: comCota, icone: PASTA_ICONES + "fam-" + txt(f.id).replace(/^hid-/, "").replace(/^ra-/, "") + "-256.png",
      origem: origem, descricao: txt(f.descricao), sinonimos: [],
      acao: { tipo: "colocarFamilia", famId: f.id, tipoId: tipo0 } });
  }
  function itensFamilias() {
    var vistos = {}, out = [];
    function juntar(lista, grupoFn, origem) {
      arr(lista).forEach(function (f) {
        if (!f || !f.id || vistos[f.id]) return;
        var g = grupoFn(f); if (!g) return;
        vistos[f.id] = 1; out.push(itemFamilia(f, g, origem));
      });
    }
    var HF = dep("HidFamilias", "./hidfamilias.js"), CF = dep("ClimFamilias", "./climfamilias.js"), HT = dep("HidTanques", "./hidtanques.js"), PF = dep("HidPiscinaFam", "./hidpiscinafam.js"), FR = dep("FamiliasRA", "./familiasra.js");
    var B = BI(), noAcessorio = B ? B.ACESSORIO_DA_FAM || {} : {};
    try { if (HF && HF.todas) juntar(HF.todas(), grupoHid, "HidFamilias"); } catch (e1) {}
    try { if (HT && HT.familias) juntar(HT.familias(), function () { return "Reservatórios e tanques"; }, "HidTanques"); } catch (e2) {}
    try { if (PF && PF.todas) juntar(PF.todas(), function () { return "Piscina"; }, "HidPiscinaFam"); } catch (e3) {}
    try { if (CF && CF.todas) juntar(CF.todas(), function () { return "Climatização"; }, "ClimFamilias"); } catch (e4) {}
    /* as famílias RA que são do hidro (louça e caixa d'água); os registros já entram em "Registros e válvulas" pela variante */
    try { if (FR && FR.lista) juntar(FR.lista(), function (f) { if (noAcessorio[f.id]) return null; return /^ra-(bacia|lavatorio|chuveiro|pia|tanque|torneira)/.test(f.id) ? "Louças e metais" : (/^ra-caixa-dagua/.test(f.id) ? "Reservatórios e tanques" : null); }, "FamiliasRA"); } catch (e5) {}
    /* o que o escritório importou (FamiliaUI.biblioteca, via BimInstTipos.fontesEscritorio) — com a origem */
    var T = TI();
    try {
      arr(T && T.fontesEscritorio ? T.fontesEscritorio() : []).forEach(function (f) {
        if (!f || !f.id || vistos[f.id]) return;
        vistos[f.id] = 1;
        var it = itemFamilia(f, "Escritório", f.origemImportacao || f.fabricante || "Escritório");
        it.selos.unshift("do escritório");
        out.push(it);
      });
    } catch (e6) {}
    return out;
  }

  /* ------------------------------------------------------------- 6) TEMPLATES (abrir, não inserir) */
  function itensTemplates() {
    var HT = dep("HidTemplates", "./hidtemplates.js"), out = [];
    try {
      arr(HT && HT.disciplinas ? HT.disciplinas() : []).forEach(function (d) {
        out.push(mk({ id: "template:" + d.id, nome: "Template RA — " + d.nome, grupo: "Templates", sistemas: arr(d.sistemas), fonte: "Templates RA (js/hidtemplates.js)",
          comCota: true, selos: ["abre a lista de templates; não insere peça"], descricao: txt(d.descricao), sinonimos: ["modelo", "projeto novo"],
          acao: { tipo: "abrirTemplate", id: d.id } }));
      });
    } catch (e) {}
    return out;
  }

  /* ------------------------------------------------------------- catálogo (cache por assinatura das fontes) */
  var _cache = null, _sig = "";
  function assinatura() {
    var B = BI(), T = TI(), P = HP(), G = GD(), HF = global.HidFamilias, CF = global.ClimFamilias, HT = global.HidTanques, PF = global.HidPiscinaFam;
    var n = 0; try { n = T && T.fontesEscritorio ? T.fontesEscritorio().length : 0; } catch (e) {}
    function q(f) { try { return f ? f().length : 0; } catch (e2) { return -1; } }
    return [B ? Object.keys(B.PECAS).length : 0, P ? P.tipos().length : 0, G ? 1 : 0, q(HF && HF.todas ? function () { return HF.todas(); } : null), q(CF && CF.todas ? function () { return CF.todas(); } : null),
            q(HT && HT.familias ? function () { return HT.familias(); } : null), q(PF && PF.todas ? function () { return PF.todas(); } : null), n,
            global.HidTemplates ? 1 : 0, global.FamiliasRA && global.FamiliasRA.lista ? global.FamiliasRA.lista().length : 0].join("|");
  }
  function todos() {
    var s = assinatura();
    if (_cache && s === _sig) return _cache.slice();
    var l = [].concat(itensTubos(), itensConexoes(), itensAcessorios(), itensPecas(), itensFamilias(), itensTemplates());
    var ids = {}; l = l.filter(function (it) { if (ids[it.id]) return false; ids[it.id] = 1; return true; });
    l.sort(function (a, b) { var ga = GRUPOS.indexOf(a.grupo), gb = GRUPOS.indexOf(b.grupo); if (ga !== gb) return ga - gb; return norm(a.nome) < norm(b.nome) ? -1 : norm(a.nome) > norm(b.nome) ? 1 : 0; });
    _cache = l; _sig = s;
    return l.slice();
  }
  function grupos() {
    var c = {}; todos().forEach(function (it) { c[it.grupo] = (c[it.grupo] || 0) + 1; });
    return GRUPOS.map(function (g) { return { grupo: g, n: c[g] || 0 }; });
  }
  function item(id) { var l = todos(), i; for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function haystack(it) {
    return norm([it.nome, it.grupo, it.materialNome, it.material, it.fabricante, it.origem, it.sistemas.join(" "), it.sinonimos.join(" "), it.dns.join(" ")].join(" "));
  }
  function buscar(texto, filtros) {
    var f = filtros || {}, pal = norm(texto).split(/\s+/).filter(function (p) { return p; });
    var fab = norm(f.fabricante);
    var l = todos().filter(function (it) {
      if (f.grupo && it.grupo !== f.grupo) return false;
      if (f.sistema && it.sistemas.indexOf(f.sistema) < 0) return false;
      if (f.material && it.material !== f.material) return false;
      if (fab && norm(it.fabricante) !== fab) return false;
      if (f.soComCota && !it.comCota) return false;
      return true;
    });
    if (!pal.length) return l;
    var pont = [];
    l.forEach(function (it) {
      var h = haystack(it), nome = norm(it.nome), s = 0, i;
      for (i = 0; i < pal.length; i++) { if (h.indexOf(pal[i]) < 0) return; s += nome.indexOf(pal[i]) >= 0 ? 2 : 1; }
      pont.push({ it: it, s: s });
    });
    pont.sort(function (a, b) { return b.s - a.s; });   /* estável o bastante: a ordem de grupo/nome já vem de todos() */
    return pont.map(function (p) { return p.it; });
  }
  function filtrosDisponiveis() {
    var B = BI(), s = {}, m = {}, fab = {};
    todos().forEach(function (it) {
      it.sistemas.forEach(function (x) { s[x] = 1; });
      if (it.material) m[it.material] = it.materialNome || it.material;
      if (it.fabricante) fab[it.fabricante] = 1;
    });
    return { sistemas: Object.keys(s).sort().map(function (x) { return { id: x, nome: B && B.SISTEMAS[x] ? B.SISTEMAS[x].nome : x }; }),
             materiais: Object.keys(m).sort().map(function (x) { return { id: x, nome: m[x] }; }), fabricantes: Object.keys(fab).sort() };
  }
  /* o alvo (global, função) que cada ação chama — a tela executa por aqui e o teste confere que existe */
  var ALVOS = { armarTubo: ["BimInstUI", "armar"], armarPeca: ["BimInstUI", "armar"], armarAcessorio: ["BimInstUI", "armar"], colocarFamilia: ["BimInstUI", "colocarFamilia"],
                conexaoManual: ["BimInstUI", "armarConexaoManual"], abrirTemplate: ["HidComponentesUI", "abrirTemplate"] };
  function alvoDaAcao(acao) { return acao && ALVOS[acao.tipo] ? ALVOS[acao.tipo].slice() : null; }

  /* ============================================================= CONEXÃO MANUAL (puro) */
  var TOL_PONTA = 0.021;     /* o mesmo raio de "mesmo nó" do motor (BimInst.TOL = 2 cm) */
  function dist3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  /* o nó (conexão da rede) mais perto de `p` em planta (até `tol`, 25 cm), desempate pela cota; rede = BimInst.rede(...) */
  function noEm(rede, p, tol) {
    var melhor = null, dm = tol == null ? 0.25 : tol;
    if (!rede || !p) return null;
    arr(rede.conexoes).forEach(function (c) {
      var dx = c.x - p.x, dz = c.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (p.y != null && isFinite(p.y)) d += Math.abs(c.y - p.y) * 0.01;
      if (d < dm) { dm = d; melhor = c; }
    });
    return melhor;
  }
  /* as pontas de trecho que se tocam neste nó: [{ trecho, campo: "pecaIni"|"pecaFim", valor }] */
  function pontasDoNo(estado, no) {
    var out = [], ids = arr(no && no.ramos).map(String);
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (ids.indexOf(String(t.id)) < 0) return;
      if (t.sistema !== no.sistema) return;
      if (dist3(t.p1, no) <= TOL_PONTA) out.push({ trecho: t.id, campo: "pecaIni", valor: t.pecaIni || "" });
      if (dist3(t.p2, no) <= TOL_PONTA) out.push({ trecho: t.id, campo: "pecaFim", valor: t.pecaFim || "" });
    });
    return out;
  }
  function escolhaDoNo(estado, no) {
    var p = pontasDoNo(estado, no), i;
    for (i = 0; i < p.length; i++) if (p[i].valor) return p[i].valor;
    return null;
  }
  function enc(ops) { return ops.length === 1 ? ops[0] : { op: "lote", id: "cm" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), origem: "conexao-manual", pedido: "Conexão escolhida no nó", ops: ops }; }
  /* a(s) op(s) que gravam `tipo` como a peça forçada do nó. Grava numa ponta só (a primeira) e limpa as outras; devolve { ok, op, motivo } */
  function opsForcar(estado, no, tipo) {
    var B = BI(), P = HP();
    if (!B || !P) return { ok: false, motivo: "O motor de conexões ainda não carregou." };
    if (!no) return { ok: false, motivo: "Clique num nó da rede (onde dois ou mais trechos se encontram)." };
    if (!P.info(tipo)) return { ok: false, motivo: "Tipo de conexão desconhecido: " + tipo + "." };
    var grupo = (B.SISTEMAS[no.sistema] || {}).grupo;
    var pl = B.PECAS_LINHA[tipo];
    if (pl && pl.indexOf(grupo) < 0) return { ok: false, motivo: B.nomeConexao(tipo, no.material) + " só vale em " + pl.join(", ") + "; este nó é de " + ((B.SISTEMAS[no.sistema] || {}).nome || no.sistema).toLowerCase() + "." };
    if (!pl && ["agua", "esgoto", "ventilacao", "pluvial"].indexOf(grupo) < 0) return { ok: false, motivo: "A conexão manual vale nos sistemas de água, esgoto, ventilação e pluvial." };
    var pts = pontasDoNo(estado, no);
    if (!pts.length) return { ok: false, motivo: "Este nó não tem ponta de trecho para guardar a escolha (tubo que passa direto não vale)." };
    var ops = pts.map(function (q, i) { var o = { op: "instAlterar", id: q.trecho }; o[q.campo] = i === 0 ? tipo : ""; return o; })
                 .filter(function (o, i) { return i === 0 || pts[i].valor; });
    return { ok: true, op: enc(ops), ponta: pts[0].trecho + "/" + pts[0].campo };
  }
  function opsAutomatico(estado, no) {
    var ops = pontasDoNo(estado, no).filter(function (q) { return q.valor; }).map(function (q) { var o = { op: "instAlterar", id: q.trecho }; o[q.campo] = ""; return o; });
    if (!ops.length) return { ok: false, motivo: "Este nó já está no automático." };
    return { ok: true, op: enc(ops) };
  }

  var HidComponentes = { GRUPOS: GRUPOS, todos: todos, grupos: grupos, buscar: buscar, item: item, filtrosDisponiveis: filtrosDisponiveis, alvoDaAcao: alvoDaAcao, ALVOS: ALVOS,
                         noEm: noEm, pontasDoNo: pontasDoNo, escolhaDoNo: escolhaDoNo, opsForcar: opsForcar, opsAutomatico: opsAutomatico,
                         esquecer: function () { _cache = null; _sig = ""; } };
  global.HidComponentes = HidComponentes;
  if (typeof module !== "undefined" && module.exports) module.exports = HidComponentes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
