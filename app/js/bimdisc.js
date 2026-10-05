/* =====================================================================
 * bimdisc.js — "SÓ A FUNDAÇÃO", "SÓ A ARMAÇÃO", "SÓ OS PAINÉIS DE PAREDE":
 * o filtro por DISCIPLINA e por ETAPA CONSTRUTIVA do modelo (motor PURO)
 *
 * O QUE FALTAVA. O visualizador isolava por tipo IFC da peça selecionada,
 * por pavimento e por modelo inteiro (a "disciplina" de hoje é do ARQUIVO:
 * EST_, ARQ_, HID_). Num modelo federado único — o do canteiro, com
 * fundação, armadura, estrutura de madeira, painéis e cobertura no mesmo
 * .ifc — não havia como ver só a armação da sapata ou só os painéis de
 * parede. Este motor agrupa CADA PEÇA:
 *
 *   1. pelo carimbo `OrcaPRO_Disciplina` ("Fundação", "Armação",
 *      "Painéis de parede"…), gravado pelo plugin Revit ou pelo gerador do
 *      modelo — vale o que está escrito, inclusive grupo que não está na
 *      lista abaixo ("Ducha e vestiário" vira um grupo com esse nome);
 *   2. sem carimbo, pela REGRA de classe IFC + nome + etapa (IfcFooting é
 *      fundação, IfcReinforcingBar é armação, pilar com "madeira" no nome é
 *      estrutura de madeira…). A regra diz "por regra" na tela: é palpite
 *      de visualização, e a pessoa precisa saber quando está vendo um.
 *
 * ⚠ ISTO É FILTRO DE VISTA, NUNCA DE DINHEIRO. A regra por nome/classe é
 *   aceitável aqui porque o erro custa uma peça no grupo errado da tela. O
 *   custo por peça continua casando por carimbo (js/bimelo.js); nenhum
 *   valor sai deste módulo.
 *
 * ⚠ A ETAPA CONSTRUTIVA é o `OrcaPRO_Etapa` que o 4D já lê — agrupada e
 *   ordenada pelo número da etapa ("04 Fundações" antes de "10 Woodframe").
 *   Peça sem etapa vai para "Sem etapa", listada, não escondida.
 *
 * Node-testável: tools/test-bimdisc.js (com controles negativos).
 * ES5: o produto roda em WebView de instalador antigo.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ordem = sequência de obra (é a ordem da lista na tela) */
  var GRUPOS = [
    { id: "entorno", nome: "Terreno e entorno", cor: "#8d7a5f" },
    { id: "fundacao", nome: "Fundação", cor: "#9c8b72" },
    { id: "armacao", nome: "Armação", cor: "#d0342c" },
    { id: "concreto", nome: "Pilares, vigas e lajes de concreto", cor: "#8f959e" },
    { id: "ligacoes", nome: "Ligações metálicas", cor: "#39424e" },
    { id: "metalica", nome: "Estrutura metálica", cor: "#51607a" },
    { id: "madeira", nome: "Pilares e vigas de madeira", cor: "#b07a45" },
    { id: "paineis", nome: "Painéis de parede", cor: "#d9b46c" },
    { id: "vedacoes", nome: "Paredes e vedações", cor: "#c9a58a" },
    { id: "fechamentos", nome: "Fechamentos internos", cor: "#cfd3d6" },
    { id: "cobertura", nome: "Cobertura", cor: "#5c8fb8" },
    { id: "forros", nome: "Forros", cor: "#c79a6b" },
    { id: "pisos", nome: "Pisos e revestimentos", cor: "#a7a39a" },
    { id: "ripados", nome: "Ripados e brises", cor: "#9a6a3c" },
    { id: "esquadrias", nome: "Esquadrias", cor: "#6c8a73" },
    { id: "instalacoes", nome: "Instalações", cor: "#2f7fd1" },
    { id: "loucas", nome: "Louças, metais e bancadas", cor: "#7fb3c9" },
    { id: "mobiliario", nome: "Mobiliário e equipamentos", cor: "#8b6fae" },
    { id: "externo", nome: "Área externa", cor: "#6f9a4f" },
    { id: "outros", nome: "Outros", cor: "#9aa0a6" }
  ];
  var POR_ID = {}; GRUPOS.forEach(function (g, i) { g.ordem = i; POR_ID[g.id] = g; });

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  /* normaliza para casar carimbo com grupo: caixa, acento e espaço */
  function norm(s) {
    return txt(s).toLowerCase().replace(/[áàâã]/g, "a").replace(/[éê]/g, "e").replace(/[í]/g, "i").replace(/[óôõ]/g, "o")
      .replace(/[ú]/g, "u").replace(/ç/g, "c").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  var POR_NOME = {}; GRUPOS.forEach(function (g) { POR_NOME[norm(g.nome)] = g; POR_NOME[g.id] = g; });
  /* sinônimos que o plugin/usuário escreve */
  var SINON = { "fundacoes": "fundacao", "armadura": "armacao", "armaduras": "armacao", "aco": "armacao",
    "estrutura de concreto": "concreto", "concreto armado": "concreto", "estrutura de madeira": "madeira",
    "madeira": "madeira", "woodframe": "paineis", "paineis": "paineis", "paredes": "vedacoes", "alvenaria": "vedacoes",
    "drywall": "fechamentos", "telhado": "cobertura", "forro": "forros", "pisos": "pisos", "revestimentos": "pisos",
    "brises": "ripados", "ripado": "ripados", "portas e janelas": "esquadrias", "hidraulica": "instalacoes",
    "eletrica": "instalacoes", "instalacoes": "instalacoes", "loucas": "loucas", "mobiliario": "mobiliario",
    "paisagismo": "externo", "terreno": "entorno", "topografia": "entorno" };

  function grupoDoCarimbo(v) {
    var n = norm(v);
    if (!n) return null;
    if (POR_NOME[n]) return POR_NOME[n];
    if (SINON[n]) return POR_ID[SINON[n]];
    /* grupo livre: vale o nome escrito (a obra pode ter "Ducha e vestiário") */
    return { id: "c:" + n, nome: txt(v).replace(/^\s+|\s+$/g, ""), cor: corLivre(n), ordem: 500, livre: true };
  }
  function corLivre(n) {
    var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
    return "hsl(" + h + ",38%,52%)";
  }

  /* ------------------------------------------------------------------
   * REGRA (sem carimbo): classe IFC + nome/descrição/família + etapa
   * ------------------------------------------------------------------ */
  function temPalavra(s, rx) { return rx.test(norm(s)); }
  function regra(el) {
    var t = txt(el && el.tipo).toUpperCase().replace(/^IFC/, "");
    var texto = [el && el.nome, el && el.nomeIfc, el && el.descricao, el && el.familia, el && el.etapa].join(" ");
    var madeira = temPalavra(texto, /madeira|wood|itauba|pinus|eucalipt|mlc|clt|glulam/);
    var concreto = temPalavra(texto, /concreto|concrete|c\d{2}\b|fck/);
    var aco = temPalavra(texto, /\baco\b|steel|metalic|perfil|w\d{3}|u enrijecido/);
    if (/^REINFORCING(BAR|MESH)|^TENDON/.test(t)) return "armacao";
    if (/^FOOTING|^PILE|^CAISSON/.test(t)) return "fundacao";
    if (/^SITE|^GEOGRAPHICELEMENT|^ANNOTATION|^EARTHWORKS/.test(t)) return "entorno";
    if (/^MECHANICALFASTENER|^FASTENER|^DISCRETEACCESSORY/.test(t)) return "ligacoes";
    if (/^(PIPE|DUCT|CABLE|FLOW|DISTRIBUTION|ELECTRIC|LIGHTFIXTURE|OUTLET|SWITCHINGDEVICE|LAMP|PROTECTIVEDEVICE|SANITARYTERMINAL|WASTETERMINAL|VALVE|PUMP|TANK|FIRESUPPRESSION|ALARM|SENSOR|AIRTERMINAL)/.test(t)) {
      return /^SANITARYTERMINAL|^WASTETERMINAL/.test(t) ? "loucas" : "instalacoes";
    }
    if (/^DOOR|^WINDOW/.test(t)) return "esquadrias";
    if (/^FURNITURE|^FURNISHING|^SYSTEMFURNITURE/.test(t)) return "mobiliario";
    if (/^ROOF/.test(t)) return "cobertura";
    if (/^STAIR|^RAMP|^RAILING/.test(t)) return temPalavra(texto, /extern|calcada|deck|paisag/) ? "externo" : "outros";
    if (/^(COLUMN|BEAM|MEMBER)/.test(t)) {
      if (madeira) return "madeira";
      if (/^MEMBER/.test(t) && temPalavra(texto, /painel|woodframe|montante|quadro/)) return "paineis";
      if (aco && !concreto) return "metalica";
      if (temPalavra(texto, /baldrame|viga de equilibrio|viga de fundacao/)) return "fundacao";
      return "concreto";
    }
    if (/^SLAB/.test(t)) {
      if (temPalavra(texto, /lastro|concreto magro|radier/)) return "fundacao";
      if (temPalavra(texto, /cobertura|telhado/)) return "cobertura";
      if (temPalavra(texto, /contrapiso|piso|revestimento/) && !temPalavra(texto, /laje/)) return "pisos";
      return "concreto";
    }
    if (/^(WALL|CURTAINWALL)/.test(t)) {
      if (temPalavra(texto, /woodframe|painel|steel ?frame/)) return "paineis";
      if (temPalavra(texto, /drywall|gesso|cimenticia interna/)) return "fechamentos";
      return "vedacoes";
    }
    if (/^COVERING/.test(t)) {
      if (temPalavra(texto, /forro|ceiling/)) return "forros";
      if (temPalavra(texto, /telha|cobertura|roof|vidro da cobertura/)) return "cobertura";
      if (temPalavra(texto, /ripa|brise/)) return "ripados";
      if (temPalavra(texto, /osb|membrana|woodframe/)) return "paineis";
      return "pisos";
    }
    if (/^PLATE/.test(t)) {
      if (temPalavra(texto, /chapa de base|berco|aco|galvaniz/)) return "ligacoes";
      if (temPalavra(texto, /osb|woodframe|painel/)) return "paineis";
      if (temPalavra(texto, /cimenticia|drywall|gesso/)) return "fechamentos";
      return "outros";
    }
    if (temPalavra(texto, /fundac|sapata|baldrame|bloco de coroamento|estaca/)) return "fundacao";
    if (temPalavra(texto, /deck|calcada|cerca|paisag|jardim/)) return "externo";
    return "outros";
  }

  function classificar(el) {
    var c = el && el.disciplinaPeca;
    if (c && txt(c).replace(/\s/g, "")) {
      var g = grupoDoCarimbo(c);
      return { id: g.id, nome: g.nome, cor: g.cor, ordem: g.ordem, fonte: "carimbo" };
    }
    var r = POR_ID[regra(el)] || POR_ID.outros;
    return { id: r.id, nome: r.nome, cor: r.cor, ordem: r.ordem, fonte: "regra" };
  }

  /* chave estável da peça (a do modelo: modeloId::globalId); cai para uid */
  function chaveDe(el) { return (el && (el.chave || el.uid)) || ""; }

  function agrupar(elementos) {
    var mapa = {}, lista = [];
    arr(elementos).forEach(function (el) {
      if (!el) return;
      var c = classificar(el), k = chaveDe(el);
      var g = mapa[c.id];
      if (!g) { g = mapa[c.id] = { id: c.id, nome: c.nome, cor: c.cor, ordem: c.ordem, n: 0, chaves: [], carimbo: 0, regra: 0 }; lista.push(g); }
      g.n++; if (k) g.chaves.push(k);
      if (c.fonte === "carimbo") g.carimbo++; else g.regra++;
    });
    lista.sort(function (a, b) { return (a.ordem - b.ordem) || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0); });
    return lista;
  }

  /* número da etapa no começo do nome ("04 Fundações", "4.2 Pilares") → ordem */
  function ordemEtapa(nome) {
    var m = /^\s*(\d+)(?:[.,](\d+))?/.exec(txt(nome));
    return m ? (parseInt(m[1], 10) * 1000 + (m[2] ? parseInt(m[2], 10) : 0)) : 1e9;
  }
  function agruparPorEtapa(elementos) {
    var mapa = {}, lista = [];
    arr(elementos).forEach(function (el) {
      if (!el) return;
      var nome = txt(el.etapa).replace(/^\s+|\s+$/g, "") || "Sem etapa";
      var k = norm(nome), g = mapa[k];
      if (!g) { g = mapa[k] = { id: "e:" + k, nome: nome, n: 0, chaves: [], ordem: nome === "Sem etapa" ? 2e9 : ordemEtapa(nome) }; lista.push(g); }
      g.n++; var ch = chaveDe(el); if (ch) g.chaves.push(ch);
    });
    lista.sort(function (a, b) { return (a.ordem - b.ordem) || (a.nome < b.nome ? -1 : 1); });
    return lista;
  }

  /* ------------------------------------------------------------------
   * ETAPA DE MONTAGEM — a sequência executiva (carimbo OrcaPRO_Montagem,
   * "M05 · Vigas primárias triplas"). É a ordem em que as peças SOBEM na
   * obra, e não a etapa da EAP: a etapa 09 do orçamento junta pilares (M06)
   * e coberturas (M10, M12) que são montados em dias diferentes.
   * ------------------------------------------------------------------ */
  function ordemMontagem(nome) {
    var m = /^\s*M\s*(\d+)/i.exec(txt(nome));
    if (m) return parseInt(m[1], 10);
    var n = /^\s*(\d+)/.exec(txt(nome));
    return n ? parseInt(n[1], 10) : 1e9;
  }
  function agruparPorMontagem(elementos) {
    var mapa = {}, lista = [];
    arr(elementos).forEach(function (el) {
      if (!el) return;
      var nome = txt(el.montagem).replace(/^\s+|\s+$/g, "") || "Sem etapa de montagem";
      var k = norm(nome), g = mapa[k];
      if (!g) {
        var cod = /^\s*(M\s*\d+)/i.exec(nome);
        g = mapa[k] = { id: "m:" + k, nome: nome, codigo: cod ? cod[1].replace(/\s+/g, "").toUpperCase() : "", n: 0, chaves: [],
                        ordem: nome === "Sem etapa de montagem" ? 2e9 : ordemMontagem(nome) };
        lista.push(g);
      }
      g.n++; var ch = chaveDe(el); if (ch) g.chaves.push(ch);
    });
    lista.sort(function (a, b) { return (a.ordem - b.ordem) || (a.nome < b.nome ? -1 : 1); });
    return lista;
  }
  /* o passo k da sequência (0 = primeira etapa): o que JÁ está montado
     (etapas 0..k), o que entra AGORA (k) e o que ainda não subiu.
     ⚠ "Sem etapa de montagem" nunca entra na sequência — a peça sem carimbo
     não pode aparecer como montada numa etapa que não é a dela. */
  function sequencia(grupos, k) {
    var etapas = arr(grupos).filter(function (g) { return g.ordem < 2e9; });
    var n = etapas.length;
    if (!n) return { n: 0, k: -1, ate: [], atual: [], nome: "", codigo: "" };
    k = Math.max(0, Math.min(n - 1, parseInt(k, 10) || 0));
    var ate = [], vis = {};
    for (var i = 0; i <= k; i++) etapas[i].chaves.forEach(function (c) { if (!vis[c]) { vis[c] = 1; ate.push(c); } });
    return { n: n, k: k, ate: ate, atual: etapas[k].chaves.slice(), nome: etapas[k].nome, codigo: etapas[k].codigo };
  }

  /* união das chaves dos grupos marcados (sem repetição) */
  function chavesDe(grupos, ids) {
    var quer = {}; arr(ids).forEach(function (i) { quer[i] = 1; });
    var vis = {}, out = [];
    arr(grupos).forEach(function (g) {
      if (!quer[g.id]) return;
      g.chaves.forEach(function (k) { if (!vis[k]) { vis[k] = 1; out.push(k); } });
    });
    return out;
  }
  /* pintura por grupo: {chave: '#cor'} (hsl vira hex para o pintarChaves) */
  function pinturaDe(grupos, ids) {
    var quer = null;
    if (ids) { quer = {}; arr(ids).forEach(function (i) { quer[i] = 1; }); }
    var out = {};
    arr(grupos).forEach(function (g) {
      if (quer && !quer[g.id]) return;
      var cor = hex(g.cor);
      g.chaves.forEach(function (k) { out[k] = cor; });
    });
    return out;
  }
  function hex(c) {
    var s = txt(c);
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    var m = /^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/i.exec(s);
    if (!m) return "#9aa0a6";
    var h = +m[1] / 360, sa = +m[2] / 100, l = +m[3] / 100;
    function f(n) { var k = (n + h * 12) % 12, a = sa * Math.min(l, 1 - l); var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); return ("0" + Math.round(v * 255).toString(16)).slice(-2); }
    return "#" + f(0) + f(8) + f(4);
  }

  /* os atalhos "Só …" da tela: o id do grupo e o rótulo curto */
  /* ------------------------------------------------------------------
   * VISTAS PRONTAS: combinações de grupos num clique (pedido do Rogério,
   * 05/10/2026, no modelo do Quiosque: "só a fundação, fundação com a
   * estrutura, sem topografia, só a armação, sem equipamentos e hidráulica,
   * com tudo, com/sem a passarela — para eu só ficar clicando").
   *
   * Cada vista diz o que MOSTRA (inclui) ou o que ESCONDE (exceto). Um termo
   * é o id de um grupo da lista ou "rx:<padrão>", que casa com o NOME de
   * grupo livre carimbado ("Instalações hidrossanitárias", "Passarela
   * existente", "Equipamentos e mobiliário") — o modelo da obra escreve
   * disciplina que não está na lista, e a vista tem de achá-la.
   * ⚠ A vista só aparece quando muda alguma coisa: "Só armação" sem armação
   *   no modelo, ou "Sem a topografia" sem terreno, seria botão que não faz
   *   nada — e botão que não faz nada ensina a desconfiar dos outros.
   * ------------------------------------------------------------------ */
  var ESTRUTURA = ["fundacao", "armacao", "concreto", "metalica", "madeira", "ligacoes", "paineis"];
  var INSTAL = ["instalacoes", "rx:instala|hidrau|hidross|eletric|sanitar"];
  var EQUIP = ["mobiliario", "rx:equipament|mobili"];
  var EXISTENTE = ["rx:existente|a demolir|passarela"];
  var VISTAS = [
    { id: "v:fundacao", rotulo: "Só fundação", inclui: ["fundacao"] },
    { id: "v:estrutura", rotulo: "Fundação + estrutura", inclui: ESTRUTURA },
    { id: "v:fund-terreno", rotulo: "Fundação + topografia", inclui: ["fundacao", "entorno"] },
    { id: "v:armacao", rotulo: "Só armação", inclui: ["armacao"] },
    { id: "v:sem-terreno", rotulo: "Tudo sem a topografia", exceto: ["entorno"] },
    { id: "v:sem-equip", rotulo: "Sem equipamentos e instalações", exceto: EQUIP.concat(INSTAL) },
    { id: "v:sem-existente", rotulo: "Sem o existente (passarela…)", exceto: EXISTENTE }
  ];
  var VISTA_POR_ID = {}; VISTAS.forEach(function (v) { VISTA_POR_ID[v.id] = v; });

  function casaTermo(g, termo) {
    if (termo.indexOf("rx:") !== 0) return g.id === termo;
    /* ⚠ casa pelo NOME normalizado: é como "Instalações hidrossanitárias" (grupo livre, fora da lista)
       entra em "sem instalações" — pelo id ele nunca entraria */
    return new RegExp(termo.slice(3)).test(norm(g.nome));
  }
  function casaAlgum(g, termos) { for (var i = 0; i < termos.length; i++) if (casaTermo(g, termos[i])) return true; return false; }

  /* ids dos grupos que a vista MOSTRA, entre os grupos do modelo aberto; [] = nada a mostrar */
  function idsDaVista(grupos, vistaId) {
    var v = VISTA_POR_ID[vistaId];
    if (!v) return [];
    return arr(grupos).filter(function (g) {
      if (!(g.n > 0)) return false;
      return v.inclui ? casaAlgum(g, v.inclui) : !casaAlgum(g, v.exceto || []);
    }).map(function (g) { return g.id; });
  }

  /* as vistas que fazem diferença NESTE modelo, com o número de grupos que cada uma mostra */
  function vistasDisponiveis(grupos) {
    var comPeca = arr(grupos).filter(function (g) { return g.n > 0; });
    var ja = {};
    return VISTAS.map(function (v) {
      var ids = idsDaVista(comPeca, v.id);
      var util = v.inclui ? ids.length > 0 : (ids.length > 0 && ids.length < comPeca.length);
      /* ⚠ mesma combinação de uma vista anterior = botão repetido ("Fundação + topografia" sem terreno no modelo é
         "Só fundação" de novo — achado na e2e de 05/10/2026) */
      var assin = ids.slice().sort().join("|");
      if (!util || ja[assin]) return null;
      ja[assin] = 1;
      return { id: v.id, rotulo: v.rotulo, grupos: ids.length };
    }).filter(Boolean);
  }

  var ATALHOS = [
    { id: "fundacao", rotulo: "Só fundação" },
    { id: "armacao", rotulo: "Só armação" },
    { id: "concreto", rotulo: "Só pilares, vigas e lajes de concreto" },
    { id: "madeira", rotulo: "Só pilares e vigas de madeira" },
    { id: "paineis", rotulo: "Só painéis de parede" },
    { id: "cobertura", rotulo: "Só cobertura" },
    { id: "instalacoes", rotulo: "Só instalações" }
  ];

  var BimDisc = {
    GRUPOS: GRUPOS, ATALHOS: ATALHOS, VISTAS: VISTAS, idsDaVista: idsDaVista, vistasDisponiveis: vistasDisponiveis, norm: norm,
    regra: regra, classificar: classificar, grupoDoCarimbo: grupoDoCarimbo,
    agrupar: agrupar, agruparPorEtapa: agruparPorEtapa, ordemEtapa: ordemEtapa,
    agruparPorMontagem: agruparPorMontagem, ordemMontagem: ordemMontagem, sequencia: sequencia,
    chavesDe: chavesDe, pinturaDe: pinturaDe, hex: hex
  };
  global.BimDisc = BimDisc;
  if (typeof module !== "undefined" && module.exports) module.exports = BimDisc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
