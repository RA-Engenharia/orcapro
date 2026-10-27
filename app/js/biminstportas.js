/* =====================================================================
 * biminstportas.js — as PORTAS (entrada/saída) de cada conexão do hidrossanitário. Motor PURO, ES5, Node-testável.
 * Global: HidPortas.
 *
 * POR QUE (27/10/2026, pedido do Rogério: "entenda de onde é a entrada e a saída de cada coisa, isso precisa ser assertivo").
 * Até aqui a entrada e a saída de uma conexão eram IMPLÍCITAS: o nó juntava os tubos que chegavam e decidia o tipo pelo
 * ângulo e pelo DN, mas ninguém dizia qual boca da peça é a de montante, qual é a derivação, qual é rosca de aparelho.
 * Sem isso o motor não consegue conferir "o tubo entrou pela boca errada" nem dizer o tipo de junta de cada boca.
 *
 * REFERENCIAL LOCAL: o centro da peça na origem; `dir` = vetor unitário APONTANDO PARA FORA da peça, no plano XZ horizontal
 * (Y é para cima). Papéis:
 *   passagem  — sem sentido fixo (joelho, luva, tê de água);
 *   montante  — por aqui ENTRA o escoamento (peças de gravidade);
 *   jusante   — por aqui SAI;
 *   derivacao — entra pelo ramal (junção/tê);
 *   ponto     — rosca que liga ao aparelho/registro/reservatório (não é boca de tubo soldado);
 *   tampa     — inspeção: não liga tubo.
 * `dnIdx`: 0 = DN maior/principal da chave ("100x50" → 100), 1 = DN menor/derivação (→ 50).
 *
 * ⚠ A JUNÇÃO é a peça de gravidade a 45°: o ramal entra A FAVOR do fluxo (o vetor da derivação aponta para fora da peça, do lado
 *   do montante, a 45° com a linha; o escoamento do ramal segue para a jusante). A junção INVERTIDA tem o ramal contra o
 *   fluxo: uso só em ventilação; marcada `aConferir` e NUNCA deduzida pelo motor.
 * ⚠ Esta tabela é DADO DE GEOMETRIA da peça (direções), não valor de norma.
 * ===================================================================== */
(function (global) {
  "use strict";

  var S = 0.7071;   // bim:geo cos/sen de 45° (a direção das peças de 45°)
  function P(id, papel, dir, dnIdx, extra) {
    var o = { id: id, papel: papel, dir: dir, dnIdx: dnIdx || 0 };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  var A_ = [-1, 0, 0], B_ = [1, 0, 0], C_ = [0, 0, 1];

  var J90 = [P("a", "passagem", A_), P("b", "passagem", [0, 0, 1])];
  var J45 = [P("a", "passagem", A_), P("b", "passagem", [S, 0, S])];
  var LINHA = [P("a", "passagem", A_), P("b", "passagem", B_)];
  function te(c) { return [P("a", "passagem", A_), P("b", "passagem", B_), c]; }
  var MJ = [P("m", "montante", A_), P("j", "jusante", B_)];

  var TABELA = {};
  function def(tipos, portas, extra) {
    tipos.forEach(function (t) {
      var o = { portas: portas.map(function (p) { return P(p.id, p.papel, p.dir.slice(), p.dnIdx, p.junta ? { junta: p.junta } : null); }) };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      TABELA[t] = o;
    });
  }

  /* deflexão de 90° */
  def(["joelho90", "curva90", "curva90_curta", "curva_pe_coluna", "joelho90_bolsa_curta", "joelho90_anel_labial", "joelho90_az_anel"], J90);
  /* ⚠ o joelho com VISITA tem uma abertura de inspeção que NÃO é porta de tubo: não modelada aqui (pendência declarada) */
  def(["joelho90_visita"], J90, { aConferir: true, obs: "a abertura de visita (tampa) do joelho não está modelada como porta" });
  def(["joelho90_reducao"], [P("a", "passagem", A_, 0), P("b", "passagem", [0, 0, 1], 1)]);
  /* deflexão de 45° */
  def(["joelho45", "curva45", "curva45_curta", "joelho45_misto"], J45);
  /* tês */
  def(["te"], te(P("c", "derivacao", C_)));
  def(["te_reducao"], te(P("c", "derivacao", C_, 1)));
  def(["te_bucha", "te_rosca", "te_transicao"], te(P("c", "ponto", C_, 1)));
  def(["te_inspecao"], [P("a", "montante", A_), P("b", "jusante", B_), P("t", "tampa", [0, 1, 0])]);
  /* junções (gravidade): o ramal entra A FAVOR do fluxo */
  def(["juncao"], MJ.concat([P("d", "derivacao", [-S, 0, S])]));
  def(["juncao_reducao"], MJ.concat([P("d", "derivacao", [-S, 0, S], 1)]));
  def(["juncao_dupla"], MJ.concat([P("d1", "derivacao", [-S, 0, S]), P("d2", "derivacao", [-S, 0, -S])]));
  def(["juncao_invertida"], MJ.concat([P("d", "derivacao", [S, 0, S])]), { aConferir: true, usoSo: "ventilacao", naoDeduzir: true,
    obs: "ramal contra o fluxo: uso só em ventilação; nunca deduzida automaticamente" });
  /* peças em linha */
  def(["luva", "luva_correr", "uniao", "uniao_mista", "uniao_flangeada", "transicao", "adaptador_anel_labial", "curva_transposicao"], LINHA);
  def(["luva_rosca", "luva_bucha", "adaptador"], [P("a", "passagem", A_), P("b", "ponto", B_, 1)]);   /* dnIdx 1 da rosca: a chave é "20x1/2" (DN do tubo x rosca) */
  def(["bucha", "bucha_longa", "luva_reducao", "reducao"], [P("a", "passagem", A_, 0), P("b", "passagem", B_, 1)]);
  def(["adaptador_caixa"], [P("a", "passagem", A_), P("b", "ponto", B_, 1, { junta: "flange" })]);
  def(["joelho_bucha", "joelho_rosca"], [P("a", "passagem", A_), P("b", "ponto", C_, 1)]);
  def(["cap", "plug"], [P("a", "passagem", A_)]);
  def(["terminal_ventilacao"], [P("a", "passagem", [0, -1, 0])]);
  def(["cruzeta"], [P("a", "passagem", A_), P("b", "passagem", B_), P("c", "passagem", C_), P("d", "passagem", [0, 0, -1])]);

  /* a EXCÊNTRICA: na gravidade a redução tem a geratriz SUPERIOR alinhada (regra RA de 20/10/2026, já no motor) e o MENOR é o
     montante. Vale para a `reducao` do esgoto/pluvial; na água ela é concêntrica. */
  var GRAVIDADE_REDUCAO = { reducao: 1, luva_reducao: 1, bucha: 1, bucha_longa: 1 };

  function copiaPorta(p) {
    var o = { id: p.id, papel: p.papel, dir: p.dir.slice(), dnIdx: p.dnIdx };
    if (p.junta) o.junta = p.junta;
    return o;
  }
  function tipos() { return Object.keys(TABELA); }
  function portas(tipo) { return TABELA[tipo] ? TABELA[tipo].portas.map(copiaPorta) : []; }
  function info(tipo) {
    var t = TABELA[tipo]; if (!t) return null;
    var o = { tipo: tipo, portas: portas(tipo) };
    ["aConferir", "usoSo", "naoDeduzir", "obs"].forEach(function (k) { if (t[k] != null) o[k] = t[k]; });
    return o;
  }

  /* "100x50" → [100, 50]; "20x1/2" → [20, "1/2"] (a rosca em polegada não é DN em mm); "100" → [100] */
  function partesDn(chave) {
    var s = chave == null ? "" : String(chave).trim();
    return s.split("x").map(function (p) { p = p.trim(); return /^\d+(\.\d+)?$/.test(p) ? Number(p) : p; });
  }

  /* a junta da boca: ponto → rosca (adaptador_caixa → flange); senão pelo material */
  function junta(material, tipo, portaId, descricaoCatalogo) {
    var t = TABELA[tipo], p = null;
    if (t) t.portas.forEach(function (q) { if (q.id === portaId) p = q; });
    if (p && p.papel === "tampa") return null;
    if (p && p.junta) return p.junta;
    if (p && p.papel === "ponto") return "rosca";
    if (material === "ppr") return "termofusao";
    if (material === "cpvc" || material === "pvc_soldavel") return "soldavel";
    if (material === "pvc_esgoto" || material === "pvc_serie_r") {
      var d = String(descricaoCatalogo == null ? "" : descricaoCatalogo).toUpperCase();
      if (/(^|[^A-Z])JE([^A-Z]|$)|ANEL|ELAST|O['’´`]?\s?RING/.test(d)) return "junta_elastica";
      if (/SOLD/.test(d)) return "soldavel";
      return "indefinida";   /* honesto: sem a descrição do catálogo não se palpita */
    }
    return "indefinida";
  }

  /* as portas de UMA peça concreta: o DN em mm de cada boca (pela chave "100x50" e o dnIdx) e a junta */
  function portasDe(tipo, material, dnChave, descricaoCatalogo) {
    var dns = partesDn(dnChave);
    return portas(tipo).map(function (p) {
      var v = dns.length > p.dnIdx ? dns[p.dnIdx] : dns[0];
      if (typeof v === "number") p.dn = v; else { p.dn = null; if (v != null && v !== "") p.rosca = String(v); }
      p.junta = junta(material, tipo, p.id, descricaoCatalogo);
      return p;
    });
  }

  function anguloEntre(u, v) {
    var c = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }
  /* DEFLEXÃO da peça de 2 portas: 180 − o ângulo entre as direções (luva 0°, joelho 45° → 45°, joelho 90° → 90°) */
  function deflexao(tipo) {
    var t = TABELA[tipo]; if (!t || t.portas.length !== 2) return null;
    return Math.round((180 - anguloEntre(t.portas[0].dir, t.portas[1].dir)) * 100) / 100;
  }
  /* quais bocas têm sentido de escoamento */
  function papelNoFluxo(tipo) {
    var t = TABELA[tipo]; if (!t) return null;
    var o = { montante: [], jusante: [], derivacao: [], passagem: [], ponto: [], tampa: [], temSentido: false, gravidadeReducao: !!GRAVIDADE_REDUCAO[tipo] };
    t.portas.forEach(function (p) { o[p.papel].push(p.id); });
    o.temSentido = o.montante.length > 0 || o.jusante.length > 0;
    return o;
  }
  /* quantas bocas LIGAM TUBO: a tampa nunca; o ponto (rosca de aparelho) só quando há conector de aparelho */
  function ligaTubo(tipo, comPonto) {
    var t = TABELA[tipo]; if (!t) return 0;
    return t.portas.filter(function (p) { return p.papel !== "tampa" && (p.papel !== "ponto" || comPonto); }).length;
  }

  var HidPortas = { tipos: tipos, portas: portas, info: info, portasDe: portasDe, junta: junta, deflexao: deflexao, papelNoFluxo: papelNoFluxo, ligaTubo: ligaTubo, partesDn: partesDn };
  global.HidPortas = HidPortas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPortas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
