/* =====================================================================
 * bimabrir.js — PORTAS E JANELAS QUE ABREM (motor puro)
 *
 * O contrato vem do IFC, no pset `RA_Abertura` da IfcDoor/IfcWindow (às vezes
 * IfcRailing — portão de guarda-corpo):
 *   Tipo       GIRO, GIRO_DUPLO, CORRER, CAMARAO, MAXIM_AR, FIXA, VAO
 *   Folhas     TEXTO com uma lista JSON; por folha:
 *                pecas            GlobalIds das peças da folha (IfcMember/IfcPlate
 *                                 agregadas à esquadria; cada uma traz o pset
 *                                 `RA_Folha` com `Esquadria_GUID`)
 *                movimento        "rotacao" | "translacao" | "fixa" | "a definir"
 *                eixo_ponto       [x, y, z]   (rotação; IFC, metros, Z para cima)
 *                eixo_dir         [dx, dy, dz]
 *                angulo_max_graus número
 *                deslocamento     [dx, dy, dz] (translação; IFC)
 *   Convencao  "v1"
 *
 * CONVENÇÃO v1: abrir = girar de 0 até +angulo_max_graus pela REGRA DA MÃO
 * DIREITA em torno de eixo_dir (o sinal de eixo_dir já escolhe o lado), ou
 * transladar de 0 até `deslocamento`. "fixa" e "a definir" não se movem;
 * campos a mais (sentido…) são informativos.
 *
 * ⚠ A FORMA DA PRÓPRIA ESQUADRIA É O MARCO, E O MARCO NÃO SE MEXE. Só as
 * peças listadas nas folhas andam.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DO IFC PARA A CENA. O web-ifc entrega a geometria em Y para cima: o ponto
 * (x, y, z) do IFC vira (x, z, −y) na cena. O visualizador NÃO desloca o
 * modelo para a origem (abre sem COORDINATE_TO_ORIGIN) e o grupo do modelo
 * não tem transformação — medido no modelo real de uma obra: a caixa de uma
 * folha na cena bate com a caixa do IFC convertida (ver a e2e). Por isso a
 * matriz da pose sai NO ESPAÇO DO MODELO e o viewer a aplica como
 * `pose × matriz-fechada` na malha.
 *
 * A troca (x, y, z) → (x, z, −y) é uma ROTAÇÃO própria (determinante +1):
 * girar θ em torno de d no IFC é girar o MESMO θ em torno de d convertido na
 * cena — a regra da mão direita não muda de lado na conversão.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TIPOS = { GIRO: 1, GIRO_DUPLO: 1, CORRER: 1, CAMARAO: 1, MAXIM_AR: 1, FIXA: 1, VAO: 1 };

  function num(x) { var n = +x; return isFinite(n) ? n : NaN; }
  function txt(s) { return String(s == null ? "" : s).trim(); }
  function vet3(v) {
    if (!Array.isArray(v) || v.length !== 3) return null;
    var a = [num(v[0]), num(v[1]), num(v[2])];
    return (isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2])) ? a : null;
  }

  /* ---------------------------------------------------------------
   * ler — o pset RA_Abertura vira uma lista de folhas que o viewer move
   *
   * `props` = { Tipo, Folhas, Convencao } (Folhas é TEXTO JSON, como vem do
   * IFC; aceita também a lista já pronta). Nunca lança: folha estranha vira
   * folha parada, com o motivo em `avisos` — uma porta que não abre é melhor
   * do que uma porta que gira em torno do lugar errado.
   * ------------------------------------------------------------- */
  function ler(props) {
    props = props || {};
    var out = { tipo: txt(props.Tipo || props.tipo).toUpperCase(), convencao: txt(props.Convencao || props.convencao || props.conv),
                folhas: [], moveis: 0, avisos: [] };
    if (out.tipo && !TIPOS[out.tipo]) out.avisos.push("tipo desconhecido: " + out.tipo);
    var bruto = props.Folhas != null ? props.Folhas : (props.folhas != null ? props.folhas : "[]"), lista;
    if (Array.isArray(bruto)) lista = bruto;
    else { try { lista = JSON.parse(String(bruto || "[]")); } catch (e) { lista = []; out.avisos.push("Folhas não é uma lista JSON"); } }
    if (!Array.isArray(lista)) { lista = []; out.avisos.push("Folhas não é uma lista"); }
    /* ⚠ convenção diferente da v1: os eixos podem ter outro sentido. Não
       adivinha — lê, mas avisa (o gerador do modelo carimba "v1") */
    if (out.convencao && out.convencao.toLowerCase() !== "v1") out.avisos.push("convenção " + out.convencao + " (o motor conhece a v1)");
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i] || {}, pecas = (Array.isArray(f.pecas) ? f.pecas : []).map(txt).filter(Boolean);
      var mov = txt(f.movimento).toLowerCase(), folha = { pecas: pecas, movimento: "fixa", motivo: "" };
      if (mov === "rotacao" || mov === "rotação") {
        var p = vet3(f.eixo_ponto), d = vet3(f.eixo_dir), ang = num(f.angulo_max_graus);
        var nd = d ? Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) : 0;
        if (!p || !d || nd < 1e-9) folha.motivo = "rotação sem eixo válido";
        else if (!isFinite(ang) || Math.abs(ang) < 1e-6) folha.motivo = "rotação sem ângulo";
        else { folha.movimento = "rotacao"; folha.eixoPonto = p; folha.eixoDir = [d[0] / nd, d[1] / nd, d[2] / nd]; folha.anguloGraus = ang; }
      } else if (mov === "translacao" || mov === "translação") {
        var v = vet3(f.deslocamento);
        if (!v || (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2])) < 1e-6) folha.motivo = "translação sem deslocamento";
        else { folha.movimento = "translacao"; folha.deslocamento = v; }
      } else folha.motivo = mov ? ("movimento \"" + mov + "\"") : "sem movimento";
      if (folha.movimento !== "fixa" && !pecas.length) { folha.movimento = "fixa"; folha.motivo = "folha sem peças"; }
      if (folha.movimento !== "fixa") out.moveis++;
      else if (folha.motivo && mov !== "fixa" && mov !== "a definir") out.avisos.push("folha " + (i + 1) + ": " + folha.motivo);
      out.folhas.push(folha);
    }
    return out;
  }

  /* IFC (Z para cima) → cena (Y para cima) */
  function ifcParaCena(v) { return [v[0], v[2], -v[1]]; }

  /* ---------------------------------------------------------------
   * pose — a matriz (4×4, coluna-maior, como o three) da folha em t ∈ [0, 1]
   * no espaço da CENA/modelo. O viewer aplica `pose × matriz-fechada`.
   * ------------------------------------------------------------- */
  function pose(folha, t) {
    var k = Math.max(0, Math.min(1, +t || 0));
    var m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    if (!folha || k === 0) return m;
    if (folha.movimento === "translacao") {
      var d = ifcParaCena(folha.deslocamento);
      m[12] = d[0] * k; m[13] = d[1] * k; m[14] = d[2] * k;
      return m;
    }
    if (folha.movimento !== "rotacao") return m;
    var a = ifcParaCena(folha.eixoDir), p = ifcParaCena(folha.eixoPonto);
    var th = folha.anguloGraus * Math.PI / 180 * k, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    var x = a[0], y = a[1], z = a[2];
    /* Rodrigues (regra da mão direita), linhas → colunas */
    var r00 = c + x * x * C, r01 = x * y * C - z * s, r02 = x * z * C + y * s;
    var r10 = y * x * C + z * s, r11 = c + y * y * C, r12 = y * z * C - x * s;
    var r20 = z * x * C - y * s, r21 = z * y * C + x * s, r22 = c + z * z * C;
    m[0] = r00; m[1] = r10; m[2] = r20;
    m[4] = r01; m[5] = r11; m[6] = r21;
    m[8] = r02; m[9] = r12; m[10] = r22;
    /* girar em torno do eixo que passa por p: x' = R(x − p) + p */
    m[12] = p[0] - (r00 * p[0] + r01 * p[1] + r02 * p[2]);
    m[13] = p[1] - (r10 * p[0] + r11 * p[1] + r12 * p[2]);
    m[14] = p[2] - (r20 * p[0] + r21 * p[1] + r22 * p[2]);
    return m;
  }

  /* aplica uma matriz coluna-maior a um ponto (para teste e para o viewer) */
  function aplicar(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
            m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
            m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  }

  /* a curva do movimento: começa e termina devagar (porta não "estala") */
  function suave(t) { var k = Math.max(0, Math.min(1, +t || 0)); return k * k * (3 - 2 * k); }

  /* um passo da animação: aproxima `t` do alvo em `dur` segundos */
  function passo(t, alvo, dt, dur) {
    var d = Math.max(0.05, +dur || 0.7), v = (+dt || 0) / d;
    if (alvo > t) return Math.min(alvo, t + v);
    if (alvo < t) return Math.max(alvo, t - v);
    return t;
  }

  /* ---------------------------------------------------------------
   * indice — quem é porta, e de que porta é cada peça
   *
   * `pecas` = [{ id, globalId, abertura?: props, folhaDe?: GUID da esquadria }]
   * Devolve { portas: { id: { id, globalId, ab, folhas: [{ ids: [], folha }] } },
   *           pecaDaPorta: { idDaPeca: idDaPorta } }.
   * ⚠ A peça pode chegar à porta por dois caminhos: listada em `pecas` da
   * folha, ou pelo `RA_Folha.Esquadria_GUID`. Os dois valem para o clique
   * (clicar no vidro da folha é clicar na porta).
   * ------------------------------------------------------------- */
  function indice(pecas) {
    var porGid = {}, portas = {}, pecaDaPorta = {}, i;
    for (i = 0; i < (pecas || []).length; i++) { var e = pecas[i]; if (e && e.globalId) porGid[txt(e.globalId)] = e; }
    for (i = 0; i < (pecas || []).length; i++) {
      var p = pecas[i]; if (!p || !p.abertura) continue;
      var ab = ler(p.abertura), reg = { id: p.id, globalId: txt(p.globalId), ab: ab, folhas: [] };
      for (var f = 0; f < ab.folhas.length; f++) {
        var fo = ab.folhas[f], ids = [];
        for (var q = 0; q < fo.pecas.length; q++) { var alvo = porGid[fo.pecas[q]]; if (alvo) { ids.push(alvo.id); pecaDaPorta[alvo.id] = p.id; } }
        reg.folhas.push({ ids: ids, folha: fo });
      }
      reg.moveis = reg.folhas.filter(function (x) { return x.folha.movimento !== "fixa" && x.ids.length; }).length;
      portas[p.id] = reg;
    }
    for (i = 0; i < (pecas || []).length; i++) {
      var pc = pecas[i]; if (!pc || !pc.folhaDe || pecaDaPorta[pc.id] != null) continue;
      var dono = porGid[txt(pc.folhaDe)]; if (dono && portas[dono.id]) pecaDaPorta[pc.id] = dono.id;
    }
    return { portas: portas, pecaDaPorta: pecaDaPorta };
  }

  var NOMES = { GIRO: "de giro", GIRO_DUPLO: "de giro, duas folhas", CORRER: "de correr", CAMARAO: "camarão", MAXIM_AR: "maxim-ar", FIXA: "fixa", VAO: "vão livre" };
  function nomeTipo(t) { return NOMES[txt(t).toUpperCase()] || (txt(t) ? txt(t).toLowerCase() : "—"); }

  var BimAbrir = { ler: ler, ifcParaCena: ifcParaCena, pose: pose, aplicar: aplicar, suave: suave, passo: passo, indice: indice, nomeTipo: nomeTipo };
  global.BimAbrir = BimAbrir;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAbrir;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
