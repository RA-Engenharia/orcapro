/* =====================================================================
 * projtriagem.js — TRIAGEM das pranchas e JUNÇÃO das disciplinas (motor PURO, Node-testável). window.ProjTriagem.
 *
 * Antes de extrair qualquer coisa, decide a DISCIPLINA de cada arquivo / folha / vista, por pontuação:
 *   campo do carimbo («PROJETO:», «DISCIPLINA:») · título da folha/vista · prefixo do nome do arquivo (ARQ, ELE, HID…)
 *   · vocabulário dominante (disjuntor/circuito vs. tubo/DN vs. fck/estribo) · nomes de camadas do DXF.
 *   A maior pontuação vence; empate (diferença < 15 %) → as duas, cada uma no seu extrator.
 * Depois, JUNTA o que cada extrator devolveu SEM CONTAR DUAS VEZES: a louça que aparece na arquitetura e no
 * hidrossanitário é uma só (mesma posição, ou — sem posição — o maior número por tipo, nunca a soma); a parede vem
 * SÓ da arquitetura. Revisões repetidas da mesma folha: fica a mais recente (R/REV do carimbo, depois a data).
 * Cada item leva a ORIGEM (arquivo, folha, vista). Regras em dados (DADOS abaixo); sem IA. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function sa(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* */ } return t.toLowerCase(); }

  /* ---------------------------------------------------------------- regras em dados */
  var DADOS = {
    disciplinas: ["arquitetura", "eletrica", "hidrossanitaria", "estrutural", "spda", "incendio", "climatizacao", "implantacao", "detalhes"],
    /* extratores existentes; o resto é declarado «não suportado» */
    suportadas: { arquitetura: "js/projler.js (DXF)", eletrica: "js/projeletr.js (texto do PDF)", estrutural: "js/estrutpdf.js (já existente)" },
    prefixo: [
      [/^(arq|ar|a)[-_ .]/, "arquitetura"], [/^(ele|el|e)[-_ .]|eletric/, "eletrica"], [/^(hid|hs|san|plu|af|esg)[-_ .]|hidro|sanit/, "hidrossanitaria"],
      [/^(est|es|e[sf])[-_ .]|estrut|forma|armac/, "estrutural"], [/^spda|para.?raio/, "spda"], [/^(pci|ppci|pscip|inc)[-_ .]|incendio|pscip/, "incendio"],
      [/^(clim|ac|hvac)[-_ .]|climatiz/, "climatizacao"], [/implant|situac/, "implantacao"]
    ],
    titulo: [
      [/circuito|forca|iluminac|eletric|diagrama unifilar|quadro de cargas|tomadas/, "eletrica", 6],
      [/agua fria|agua quente|esgoto|pluvial|isometric|hidraul|sanitari|drenagem/, "hidrossanitaria", 6],
      [/planta de forma|forma do|armac|armadura|fundac|sapata|estaca|pilar|viga|laje|baldrame/, "estrutural", 6],
      [/spda|para.?raio|captor|aterramento/, "spda", 6], [/incendio|hidrante|extintor|rota de fuga|ppci|pscip|sprinkler/, "incendio", 6],
      [/climatiz|ar.?condicionado|dutos|exaust/, "climatizacao", 5], [/situacao|implantac|locacao/, "implantacao", 4],
      [/^detalhe|detalhes/, "detalhes", 3],
      [/planta baixa|planta - pav|layout|fachada|corte|cobertura|pavimento|terreo|arquitet/, "arquitetura", 4]
    ],
    vocab: [
      [/\bdisjuntor|\bcircuito|\bqd\d|\bqgbt|\btomada|\binterruptor|\bkva\b|\bdr\b|\bdps\b|\beletroduto|\bmm2|\bmm²/g, "eletrica"],
      [/\btubo|\bdn ?\d|ø ?\d{2,3}\b|\bregistro|\bjoelho|\bluva|\bcaixa sifonada|\bcaixa de inspec|\bralo|\breservatorio|\bpvc\b/g, "hidrossanitaria"],
      [/\bfck|\bestribo|\bc\/\d|\bkgf|\bcobrimento|\barmadura|\bbitola|\bresumo do aco|\bca-?50|\bca-?60/g, "estrutural"],
      [/\bcaptor|\bdescida|\bmalha de aterr|\bspda/g, "spda"],
      [/\bhidrante|\bextintor|\bsprinkler|\bbrigada|\bsaida de emerg/g, "incendio"],
      [/\bbtu|\bsplit|\bevaporad|\bcondensad|\bduto/g, "climatizacao"],
      [/\bsala\b|\bquarto|\bbanheiro|\bcozinha|\bcirculac|\bporta|\bjanela|\bpiso\b|\bpe.?direito|\bm²/g, "arquitetura"]
    ],
    camadas: [
      [/^a-|alvn|alvenaria|parede|esquadr|^es-|ambiente|^tx-ambt/, "arquitetura"], [/^el-|^e-|eletr|ilumin|tomada/, "eletrica"],
      [/^hid|^hs-|esgot|pluvi|agua|^p-/, "hidrossanitaria"], [/^s-|estrut|pilar|viga|forma/, "estrutural"]
    ],
    carimbo: /(?:projeto|disciplina|conteudo)\s*:?\s*(.{3,60})/
  };

  function pontuar(fonte) {
    var p = {}, motivos = {};
    function soma(d, v, m) { p[d] = (p[d] || 0) + v; (motivos[d] = motivos[d] || []).push(m); }
    var nomeArq = sa(fonte.nomeArquivo || "").replace(/^.*[\\/]/, "");
    DADOS.prefixo.forEach(function (r) { if (r[0].test(nomeArq)) soma(r[1], 5, "nome do arquivo «" + fonte.nomeArquivo + "»"); });
    var texto = sa([].concat(fonte.texto || []).join("\n"));
    var tit = sa(fonte.titulo || "");
    DADOS.titulo.forEach(function (r) { if (tit && r[0].test(tit)) soma(r[1], r[2] * 2, "título «" + fonte.titulo + "»"); });
    var mc = DADOS.carimbo.exec(texto);
    if (mc) DADOS.titulo.forEach(function (r) { if (r[0].test(mc[1])) soma(r[1], r[2], "carimbo «" + mc[1].trim() + "»"); });
    DADOS.vocab.forEach(function (r) { var n = (texto.match(r[0]) || []).length; if (n) soma(r[1], Math.min(10, Math.log(1 + n) * 2), n + " termo(s) de " + r[1]); });
    (fonte.camadas || []).forEach(function (L) { var l = sa(L); DADOS.camadas.forEach(function (r) { if (r[0].test(l)) soma(r[1], 0.5, "camada «" + L + "»"); }); });
    return { pontos: p, motivos: motivos };
  }

  /* fonte: { nomeArquivo, titulo?, texto (linhas), camadas? } → { disciplinas:[…], principal, pontos, porque, suportado } */
  function triar(fonte) {
    var r = pontuar(fonte || {}), ks = Object.keys(r.pontos).sort(function (a, b) { return r.pontos[b] - r.pontos[a]; });
    if (!ks.length) return { disciplinas: [], principal: "", pontos: {}, porque: "sem sinal de disciplina (sem texto, título, nome nem camada reconhecível — PDF escaneado sem texto?)", suportado: false, semTexto: !(fonte && [].concat(fonte.texto || []).join("").trim()) };
    var top = r.pontos[ks[0]], ds = ks.filter(function (k) { return r.pontos[k] >= top * 0.85; });
    return {
      disciplinas: ds, principal: ds[0], pontos: r.pontos,
      porque: ds.map(function (d) { return d + ": " + r.motivos[d].slice(0, 3).join("; ") + " (" + Math.round(r.pontos[d] * 10) / 10 + " pts)"; }).join(" · "),
      suportado: ds.map(function (d) { return !!DADOS.suportadas[d]; })
    };
  }

  /* revisão do carimbo: «R03», «REV. 2», «REVISÃO 04» + data dd/mm/aaaa → chave comparável */
  function revisao(texto, nomeArquivo) {
    var t = sa([].concat(texto || []).join(" ") + " " + (nomeArquivo || ""));
    var m = /\brev(?:isao)?\.?\s*:?\s*(\d{1,3})\b|[_\- ]r(\d{2,3})\b/.exec(t), rv = m ? +(m[1] || m[2]) : -1;
    var ds = [], re = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g, d;
    while ((d = re.exec(t))) ds.push(d[3] + d[2] + d[1]);
    ds.sort();
    return { rev: rv, data: ds.length ? ds[ds.length - 1] : "" };
  }
  /* várias versões da mesma folha → a mais recente (rev, depois data). folhas: [{ chave, texto, nomeArquivo, … }] */
  function maisRecentes(folhas) {
    var por = {};
    (folhas || []).forEach(function (f, i) {
      var r = revisao(f.texto, f.nomeArquivo); f._rev = r; f._i = i;
      var a = por[f.chave];
      if (!a || r.rev > a._rev.rev || (r.rev === a._rev.rev && r.data > a._rev.data)) por[f.chave] = f;
    });
    var fica = {}; Object.keys(por).forEach(function (k) { fica[por[k]._i] = 1; });
    return { ficam: (folhas || []).filter(function (f, i) { return fica[i]; }), descartadas: (folhas || []).filter(function (f, i) { return !fica[i]; }) };
  }

  /* ---------------------------------------------------------------- junção sem dupla contagem */
  /* modelos: [{ modelo (saída de projler/projeletr/ifcler), origem: { arquivo, folha, vista, disciplina } }] */
  function juntar(lista) {
    var el = [], esp = [], pav = {}, avisos = [], dup = [];
    var temArq = (lista || []).some(function (x) { return x.origem && x.origem.disciplina === "arquitetura"; });
    (lista || []).forEach(function (x, k) {
      var m = x.modelo || {}, o = x.origem || {};
      (m.elementos || []).forEach(function (e) {
        /* parede vem SÓ da arquitetura */
        if (/^parede/.test(e.papel || "") && temArq && o.disciplina !== "arquitetura") { dup.push({ id: e.id, motivo: "parede de " + o.disciplina + " ignorada: a geometria de parede vem só da arquitetura" }); return; }
        var c = JSON.parse(JSON.stringify(e)); c.id = "f" + k + ":" + e.id; c.origem = o;
        c.ambientes = (c.ambientes || []).map(function (a) { return "f" + k + ":" + a; });
        if (c.hospedeiro) c.hospedeiro = "f" + k + ":" + c.hospedeiro;
        el.push(c);
      });
      (m.espacos || []).forEach(function (s) { var c = JSON.parse(JSON.stringify(s)); c.id = "f" + k + ":" + s.id; c.origem = o; esp.push(c); });
      ((m.modelo && m.modelo.pavimentos) || []).forEach(function (p) { if (p && p.nome && !pav[p.nome]) pav[p.nome] = p; });
      (m.avisos || []).forEach(function (a) { avisos.push((o.arquivo || "fonte " + (k + 1)) + ": " + a); });
    });
    /* louça/aparelho repetido entre fontes */
    var fica = [], porSub = {};
    el.forEach(function (e) {
      if (e.papel !== "louca") { fica.push(e); return; }
      var g = e.geo || {}, igual = null;
      if (g.x != null) igual = fica.filter(function (f) { return f.papel === "louca" && f.sub === e.sub && f.origem !== e.origem && f.geo && f.geo.x != null && Math.abs(f.geo.x - g.x) < 0.3 && Math.abs(f.geo.y - g.y) < 0.3; })[0];
      if (igual) { dup.push({ id: e.id, igualA: igual.id, motivo: "louça «" + e.sub + "» na mesma posição em " + (e.origem.disciplina || "") + " e " + (igual.origem.disciplina || "") + ": uma só" }); return; }
      if (g.x == null) { (porSub[e.sub] = porSub[e.sub] || []).push(e); return; }
      fica.push(e);
    });
    /* sem posição: o maior número por tipo entre as fontes, nunca a soma */
    Object.keys(porSub).forEach(function (sub) {
      var porFonte = {}; porSub[sub].forEach(function (e) { var f = JSON.stringify(e.origem); (porFonte[f] = porFonte[f] || []).push(e); });
      var jaTem = fica.filter(function (f) { return f.papel === "louca" && f.sub === sub; }).length;
      var maior = 0, melhor = []; Object.keys(porFonte).forEach(function (f) { if (porFonte[f].length > maior) { maior = porFonte[f].length; melhor = porFonte[f]; } });
      var falta = Math.max(0, maior - jaTem);
      melhor.slice(0, falta).forEach(function (e) { fica.push(e); });
      porSub[sub].forEach(function (e) { if (fica.indexOf(e) < 0) dup.push({ id: e.id, motivo: "louça «" + sub + "» sem posição: vale o maior número entre as disciplinas (" + Math.max(maior, jaTem) + "), não a soma" }); });
    });
    return { ok: true, fonte: "juncao", elementos: fica, espacos: esp, modelo: { pavimentos: Object.keys(pav).map(function (k) { return pav[k]; }) }, avisos: avisos, duplicados: dup, cobertura: { fonte: "juncao", fontes: (lista || []).length, elementos: fica.length } };
  }

  var ProjTriagem = { DADOS: DADOS, triar: triar, revisao: revisao, maisRecentes: maisRecentes, juntar: juntar };
  global.ProjTriagem = ProjTriagem;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjTriagem;
})(typeof window !== "undefined" ? window : globalThis);
