/* =====================================================================
 * caepi.js — VALIDAÇÃO DO NÚMERO DO CA (Certificado de Aprovação de EPI) contra a base pública do MTE
 *
 * FONTE: CAEPI (Ministério do Trabalho e Emprego), tgg_export_caepi.zip — índice compacto gerado por
 * tools/gerar-indice-caepi.js em data/caepi-indice.json (dado do programa; a data da base vem DENTRO do arquivo e
 * aparece em toda resposta). Rede nenhuma: o índice é lido do próprio app, então funciona offline.
 *
 * REGRAS (cada uma existe por causa de um erro que a ficha NR-6 não pode cometer):
 *  • Situação "VÁLIDO" mas data de validade JÁ PASSADA (a base envelhece entre atualizações): trata como VENCIDO pela data.
 *  • CANCELADO / SUSPENSO valem mesmo com validade futura (o CA caiu, não importa a data).
 *  • Número que não consta na base NÃO é "inexistente": a base tem data, e um CA emitido depois dela não aparece.
 *    O texto diz "não consta na base de DD/MM/AAAA" e manda conferir online — nunca afirma que o CA é falso.
 *  • Vence em até 60 dias → AVISO (dá tempo de repor o EPI). Parâmetro: AVISO_DIAS.
 *  • Validade do CA ≠ validade do EPI entregue: o CA vencido não invalida o EPI já comprado dentro do prazo, mas a
 *    empresa não pode ENTREGAR equipamento com CA vencido (NR-6). O texto mostra a data e deixa a decisão com o SST.
 * Motor puro, ES5, Node-testável: tools/test-caepi.js (fixture real em tools/dados/apis/caepi-amostra.txt).
 * ===================================================================== */
(function (global) {
  "use strict";

  var AVISO_DIAS = 60;
  var ARQUIVO = "data/caepi-indice.json";
  var _indice = null, _promessa = null;

  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function diasDe(d) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2000, 0, 1)) / 86400000); }
  function isoDeDias(n) { var d = new Date(Date.UTC(2000, 0, 1) + n * 86400000); return d.getUTCFullYear() + "-" + dd(d.getUTCMonth() + 1) + "-" + dd(d.getUTCDate()); }
  function brDeIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  function soDigitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }

  /* descomprime o formato colunar em { porCA: {n:[dias,sit,eq,fab]}, fonte, eq, fab } — uma vez só */
  function montar(raw) {
    if (!raw || !raw.c || !raw.v || !raw.fonte) throw new Error("índice do CAEPI inválido");
    var porCA = {}, n = 0, i;
    for (i = 0; i < raw.c.length; i++) { n += raw.c[i]; porCA[n] = [raw.v[i], raw.s.charAt(i), raw.e[i], raw.fb[i]]; }
    return { porCA: porCA, fonte: raw.fonte, eq: raw.eq || [], fab: raw.fab || [] };
  }

  /* lê o índice (fetch, uma vez; guarda em memória). Falha vira erro amigável, nunca trava a tela. */
  function carregar(ctx) {
    ctx = ctx || {};
    var P = ctx.Promise || global.Promise;
    if (_indice) return P.resolve(_indice);
    if (_promessa) return _promessa;
    var f = ctx.fetch || (global.fetch ? function (u) { return global.fetch(u); } : null);
    if (!f) return P.reject(new Error("Este navegador não consegue ler a base de CAs."));
    _promessa = P.resolve().then(function () { return f(ctx.arquivo || ARQUIVO); }).then(function (r) {
      if (!r || !r.ok) throw new Error("A base de CAs não está instalada nesta versão (HTTP " + (r && r.status) + ").");
      return r.json();
    }).then(function (j) { _indice = montar(j); return _indice; }).then(null, function (e) {
      _promessa = null;       /* deixa tentar de novo na próxima ação; sem laço automático */
      throw e;
    });
    return _promessa;
  }

  /* validar("33.547", indice, hoje) — hoje é um Date (injetável) */
  function validar(ca, indice, hoje) {
    hoje = hoje || new Date();
    var n = parseInt(soDigitos(ca), 10);
    var base = indice && indice.fonte ? brDeIso(indice.fonte.baseData) : "";
    var fonteTxt = "CAEPI/MTE, base de " + (base || "data não informada");
    if (!isFinite(n) || n <= 0) return { estado: "formato", ok: false, aviso: false, texto: "Número de CA inválido: use só dígitos (ex.: 33547).", fonte: fonteTxt };
    var r = indice.porCA[n];
    if (!r) return { estado: "naoconsta", ok: false, aviso: true, ca: n, fonte: fonteTxt,
      texto: "CA " + n + " não consta na base de " + (base || "—") + ". Pode ser um CA emitido depois dessa data ou um número digitado errado — confira online antes de entregar." };
    var sit = r[1], dias = r[0], hojeD = diasDe(hoje);
    var equip = indice.eq[r[2]] || "", fab = indice.fab[r[3]] || "";
    var val = dias > 0 ? isoDeDias(dias) : "", valBR = brDeIso(val);
    var out = { ca: n, validade: val, validadeBR: valBR, equipamento: equip, fabricante: fab, situacaoBase: sit, fonte: fonteTxt };
    if (sit === "C") { out.estado = "cancelado"; out.ok = false; out.aviso = true; out.texto = "CA " + n + " CANCELADO pelo MTE (" + fonteTxt + "). Não entregue este equipamento."; return out; }
    if (sit === "S") { out.estado = "suspenso"; out.ok = false; out.aviso = true; out.texto = "CA " + n + " SUSPENSO pelo MTE (" + fonteTxt + "). Não entregue até regularizar."; return out; }
    if (dias > 0 && dias < hojeD) { out.estado = "vencido"; out.ok = false; out.aviso = true; out.texto = "CA " + n + " VENCIDO em " + valBR + " (" + fonteTxt + ")." + (equip ? " " + equip + "." : ""); return out; }
    if (sit === "E") { out.estado = "vencido"; out.ok = false; out.aviso = true; out.texto = "CA " + n + " consta como VENCIDO (" + fonteTxt + ")."; return out; }
    if (sit !== "V") { out.estado = "indefinido"; out.ok = false; out.aviso = true; out.texto = "CA " + n + " com situação não reconhecida na base — confira online."; return out; }
    if (!(dias > 0)) { out.estado = "semvalidade"; out.ok = true; out.aviso = true; out.texto = "CA " + n + " válido, sem data de validade na base (" + fonteTxt + ")."; return out; }
    var falta = dias - hojeD; out.diasParaVencer = falta;
    if (falta <= AVISO_DIAS) { out.estado = "vencendo"; out.ok = true; out.aviso = true; out.texto = "CA " + n + " válido, mas VENCE em " + valBR + " (" + falta + " dia" + (falta === 1 ? "" : "s") + "). " + fonteTxt + "."; return out; }
    out.estado = "valido"; out.ok = true; out.aviso = false;
    out.texto = "CA " + n + " válido até " + valBR + (equip ? " — " + equip : "") + (fab ? " (" + fab + ")" : "") + ". " + fonteTxt + ".";
    return out;
  }

  /* valida uma lista de itens de entrega ({ca, nome}); pula "N/A" e vazios (isso é a regra de js/epi.js, não nossa) */
  function validarItens(itens, indice, hoje) {
    var out = [];
    (itens || []).forEach(function (it, i) {
      var ca = soDigitos(it && it.ca);
      if (!ca) return;
      var r = validar(ca, indice, hoje); r.indice = i; r.nome = it.nome || ""; out.push(r);
    });
    return out;
  }


  /* Pinta o resultado ao lado de cada CA da entrega: espera <div data-eecav="<posição do item>"> no container.
     Uma leitura do índice por sessão (cache em memória); sem a base, uma linha só dizendo isso — a tela segue funcionando. */
  var CORES = { valido: "#166534", vencendo: "#b45309", semvalidade: "#b45309", naoconsta: "#b45309", vencido: "#b91c1c", cancelado: "#b91c1c", suspenso: "#b91c1c", indefinido: "#b45309", formato: "#b45309" };
  function pintar(container, itens, ctx) {
    if (!container || !container.querySelector) return;
    carregar(ctx).then(function (ind) {
      validarItens(itens, ind, ctx && ctx.hoje).forEach(function (r) {
        var el = container.querySelector('[data-eecav="' + r.indice + '"]');
        if (!el) return;
        el.textContent = (r.ok && !r.aviso ? "✔ " : "⚠ ") + r.texto;
        el.style.color = CORES[r.estado] || "#475569";
        el.setAttribute("data-eecav-estado", r.estado);
      });
    }, function (e) {
      var els = container.querySelectorAll("[data-eecav]"), i;
      for (i = 0; i < els.length; i++) { els[i].textContent = "Validação do CA indisponível: " + (e && e.message ? e.message : "base não carregou") + " Use 🔎 consultar."; els[i].style.color = "#64748b"; }
    });
  }

  global.Caepi = { pintar: pintar, AVISO_DIAS: AVISO_DIAS, ARQUIVO: ARQUIVO, montar: montar, carregar: carregar, validar: validar, validarItens: validarItens, brDeIso: brDeIso,
    _zerar: function () { _indice = null; _promessa = null; } };
  if (typeof module !== "undefined" && module.exports) module.exports = global.Caepi;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
