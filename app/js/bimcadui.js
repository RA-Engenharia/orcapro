/* =====================================================================
 * bimcadui.js — AS SAÍDAS "ARQUIVO CAD ÚNICO (DXF)" E "DWG" DAS FOLHAS DO BIM (16/11/2026). Fiação fina sobre js/bimcad.js e o servidor local (server/dwg.js).
 *
 *   BimCadUI.opcoesHtml(pref)                 as 2 opções + o botão "Instalar penas RA no AutoCAD" (HTML; pref = prefixo do data-attr, ex. "bcad")
 *   BimCadUI.ligar(raiz)                      sonda o servidor local: habilita o DWG só no app instalado (mesma mensagem da tela de arquitetura)
 *   BimCadUI.baixarCad(o, opc)                ZIP do DXF + CTB + LEIA-ME (o = BimCad.paraCad | paraCadFolhas)
 *   BimCadUI.gerarDwg(o, opc)                 Promise({ ok, zip, nome, avisos } | { ok:false, erro }): manda o DXF ao servidor local, volta o DWG e monta o ZIP
 *   BimCadUI.instalarCtbs(opc)                copia TODOS os CTB RA (RA_Hidrossanitario, RA_Geral e, se houver, o da arquitetura) para as pastas Plot Styles
 *   (a tela do hidro põe as 2 opções direto em js/hidpranchasui.js: opcoesHtml("bcad") + lerQ + aposGerarHidro; sem wrapper de HidPranchasUI.abrir)
 *
 * DWG só no app instalado (o LibreDWG roda no servidor local); no navegador puro/PWA a opção fica desabilitada com o motivo e o DXF continua.
 * Reaproveita a sonda/preparo do conversor de js/arqpranchasui.js (ArqPranchasUI.sondarDwg / prepararDwg), quando carregado.
 * Teste: node tools/test-bimcadui.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function BC() { return dep("BimCad", "./bimcad.js"); }
  function CD() { return dep("ArqCad", "./arqcad.js"); }
  function AU() { return dep("ArqPranchasUI", "./arqpranchasui.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  var DWG_SO_NO_APP = "DWG só no app instalado; o DXF abre no AutoCAD (Salvar como → DWG).";
  var CTB_SO_NO_APP = "Instalar as penas no AutoCAD só funciona no app instalado; copie o .ctb do ZIP para a pasta Plot Styles (comando STYLESMANAGER no AutoCAD).";
  function buscar() { return typeof global.fetch === "function" ? global.fetch.bind(global) : null; }
  function comPrazo(f, url, init, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("prazo")); }, ms);
      f(url, init).then(function (r) { clearTimeout(t); res(r); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) { /* sem UI */ } }
  function baixar(nome, dados, mime) {
    var d = global.document; if (!d) return false;
    if (global.TesteModulo && global.TesteModulo.marcarArquivo) { var w = global.TesteModulo.marcarArquivo(nome, dados, mime, ""); if (!w) return false; nome = w.nome; dados = w.dados; }
    try { var u = URL.createObjectURL(new Blob([dados], { type: mime })), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------ HTML e ligação */
  function opcoesHtml(pref) {
    pref = pref || "bcad";
    return '<label style="display:block"><input type="checkbox" data-' + pref + '-out="cad"> Arquivo CAD único (ZIP: DXF com um layout por folha + CTB das penas)</label>' +
      '<label style="display:block"><input type="checkbox" data-' + pref + '-out="dwg" disabled> <span data-' + pref + '="dwg-rotulo">DWG (ZIP: DWG R2000 com um layout por folha + CTB + LEIA-ME)</span></label>' +
      '<div class="muted" data-' + pref + '="dwg-aviso" style="font-size:12px;margin:0 0 4px 22px">Verificando se este computador gera DWG…</div>' +
      '<div style="margin:2px 0 6px 0"><button type="button" class="btn ghost" data-' + pref + '="instalar-ctb">Instalar penas RA no AutoCAD</button> <span class="muted" data-' + pref + '="ctb-msg" style="font-size:12px">O AutoCAD só acha o .ctb na pasta Plot Styles dele (sem isso: "RA_Hidrossanitario.ctb (missing)"). Instala todos os CTB RA.</span></div>';
  }
  function sondar() { var A = AU(); return A && A.sondarDwg ? A.sondarDwg() : Promise.resolve({ disponivel: false, motivo: DWG_SO_NO_APP }); }
  function ligar(raiz, pref) {
    pref = pref || "bcad";
    if (!raiz || !raiz.querySelector) return Promise.resolve(null);
    var cb = raiz.querySelector('[data-' + pref + '-out="dwg"]'), av = raiz.querySelector('[data-' + pref + '="dwg-aviso"]'), bt = raiz.querySelector('[data-' + pref + '="instalar-ctb"]'), ms = raiz.querySelector('[data-' + pref + '="ctb-msg"]');
    if (bt && !bt.onclick) bt.onclick = function () { bt.disabled = true; instalarCtbs().then(function (r) { bt.disabled = false; if (ms) ms.textContent = r.mensagem; toast(r.mensagem, r.ok ? "ok" : "aviso"); }); };
    return sondar().then(function (s) {
      if (cb) { cb.disabled = !s.disponivel; cb.checked = false; }
      if (av) av.textContent = s.disponivel && s.preparar ? "Na primeira vez o OrcaPRO baixa o conversor DWG (~12 MB, uma só vez) e depois gera. Sem internet, use o DXF." : s.disponivel ? "Gera o DWG neste computador (" + s.conversor + "). Leva alguns segundos." : (s.motivo || DWG_SO_NO_APP);
      return s;
    });
  }

  /* ------------------------------------------------------------ saídas */
  function nomeBase(o, base) { return txt(base) || String(o.dxfNome || "CAD").replace(/\.dxf$/i, ""); }
  function baixarCad(o, opc) {
    opc = opc || {}; var B = BC(); var z = o ? B.zip(o) : null;
    if (!z) { toast("O arquivo CAD não montou.", "erro"); return null; }
    var nome = nomeBase(o, opc.base) + "-CAD.zip";
    if (baixar(nome, z, "application/zip")) toast("Arquivo CAD único: " + nome + " (" + o.resumo.layouts.length + " layout(s) + " + o.ctbNome + ")" + (o.avisos.length ? " · " + o.avisos.length + " aviso(s)" : ""), o.avisos.length ? "aviso" : "ok");
    return { nome: nome, zip: z };
  }
  /* o = BimCad.paraCad/paraCadFolhas(…, { dwgNome }). opc.postar(dxfTexto) → Promise({ ok, bytes | erro }) troca o envio (testes). */
  function gerarDwg(o, opc) {
    opc = opc || {};
    if (!o || !o.dxf) return Promise.resolve({ ok: false, erro: "Sem pranchas geradas para converter em DWG." });
    if (!o.dwgNome) return Promise.resolve({ ok: false, erro: "O arquivo CAD foi montado sem o nome do DWG (dwgNome)." });
    var postar = opc.postar || function (dxf) {
      var f = buscar(); if (!f) return Promise.resolve({ ok: false, erro: DWG_SO_NO_APP });
      var A = AU(), prep = A && A.prepararDwg ? A.prepararDwg({ buscar: f }) : Promise.resolve({ ok: true });
      return prep.then(function (pr) {
        if (!pr.ok) return pr;
        /* o servidor dá mais prazo a DXF grande (server/dwg.js: +90 s por MB acima de 2 MB, teto de 12 min, recusa acima de 6 MB); a espera daqui acompanha */
        var prazoMs = Math.min(740000, Math.round(260000 + 95000 * Math.max(0, String(dxf).length / 1048576 - 2)));   /* o servidor tem teto de 12 min no total */
        return comPrazo(f, "/__dwg/gerar", { method: "POST", headers: { "Content-Type": "application/dxf" }, body: dxf }, prazoMs).then(function (resp) {
          if (!resp.ok) return resp.json().then(function (j) { return { ok: false, erro: (j && j.erro) || ("o conversor respondeu " + resp.status) }; }, function () { return { ok: false, erro: DWG_SO_NO_APP }; });
          return resp.arrayBuffer().then(function (ab) { return { ok: true, bytes: new Uint8Array(ab), avisos: parseInt(resp.headers.get("X-Avisos"), 10) || 0 }; });
        }, function () { return { ok: false, erro: DWG_SO_NO_APP }; });
      });
    };
    return postar(o.dxfDwg || o.dxf).then(function (p) {
      if (!p || !p.ok || !p.bytes) return { ok: false, erro: (p && p.erro) || "O conversor não devolveu o DWG." };
      var b = p.bytes;
      if (b.length < 256 || String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]) !== "AC1015") return { ok: false, erro: "O conversor devolveu um arquivo que não é DWG." };
      var z = BC().zipDwg(o, b);
      return z ? { ok: true, zip: z, nome: nomeBase(o, opc.base) + "-DWG.zip", avisos: p.avisos || 0, dwg: b } : { ok: false, erro: "O ZIP do DWG não montou." };
    }, function (e) { return { ok: false, erro: "Falha ao converter em DWG: " + (e && e.message ? e.message : e) }; });
  }
  /* CONJUNTO GRANDE → DWG EM PARTES. Roteiro do defeito (Casa 487, 42 folhas do hidro, DXF de 9 MB): o LibreDWG leva ~2 min para 3 MB e passou de 15 min com 9 MB; o servidor
     (server/dwg.js) recusa DXF acima de 6 MB. Acima de 4 MB o DWG sai em partes, todas no mesmo ZIP, com o mesmo CTB. As FAIXAS saem do TAMANHO: parte-se o conjunto ao meio
     enquanto o DXF da faixa passar de 4 MB (uma folha pesada fica sozinha; as leves se juntam), nunca por número de folhas.
     opc.partes(i0, i1, nome) → o parcial (as folhas i0..i1-1); a raiz é o próprio `o`. */
  var DXF_MAX_DWG = 4 * 1048576;
  function gerarDwgPartes(o, opc) {
    var N = o.resumo.layouts.length, base = nomeBase(o, opc.base), arq = {}, infos = [], avisos = 0, falha = null, cont = 0;
    var Z = dep("BimBcf", "./bimbcf.js");
    function faixa(i0, i1, po) {
      if (falha) return Promise.resolve();
      po = po || opc.partes(i0, i1, base + "-tmp");
      if (!po) { falha = "Não montei as folhas " + (i0 + 1) + " a " + i1 + " do arquivo CAD."; return Promise.resolve(); }
      if (po.dxfDwg.length > DXF_MAX_DWG && i1 - i0 > 1) { var m = (i0 + i1) >> 1; return faixa(i0, m).then(function () { return faixa(m, i1); }); }
      var k = ++cont, nome = base + "-parte" + k; po.dwgNome = nome + ".dwg";
      return gerarDwg(po, { postar: opc.postar, base: nome }).then(function (d) {
        if (!d.ok) { falha = "Folhas " + (i0 + 1) + " a " + i1 + " (" + nome + "): " + d.erro; return; }
        arq[nome + ".dwg"] = d.dwg; avisos += d.avisos || 0;
        infos.push({ arq: nome + ".dwg", folhas: po.resumo.layouts.map(function (l) { return l.nome; }) });
      });
    }
    return faixa(0, N, o).then(function () {
      if (falha) return { ok: false, erro: falha };
      if (!Z || !Z.zipEscrever) return { ok: false, erro: "O ZIP do DWG não montou." };
      var C = CD(), lo = {}; Object.keys(o).forEach(function (kk) { lo[kk] = o[kk]; });
      lo.dwgNome = infos.map(function (x) { return x.arq; }).join(", ");   /* o LEIA-ME lista os DWG que EXISTEM no ZIP, não o nome do conjunto */
      arq[o.ctbNome] = o.ctb;
      arq["LEIA-ME.txt"] = C.leiame(lo) + "\r\nCONJUNTO GRANDE: o DWG saiu em " + infos.length + " partes, porque o conversor leva muito tempo num arquivo só:\r\n" +
        infos.map(function (x) { return "  " + x.arq + " = folhas " + x.folhas.join(", "); }).join("\r\n") + "\r\nO arquivo CAD unico (DXF) traz todas as folhas juntas.\r\n";
      return { ok: true, zip: Z.zipEscrever(arq), nome: base + "-DWG.zip", avisos: avisos, partes: infos.length, infos: infos };
    });
  }
  function baixarDwg(o, opc) {
    opc = opc || {};
    var gerar = (opc.partes && o && o.dxfDwg && o.dxfDwg.length > DXF_MAX_DWG && o.resumo && o.resumo.layouts.length > 1) ? gerarDwgPartes(o, opc) : gerarDwg(o, opc);
    return gerar.then(function (d) {
      if (d.ok && baixar(d.nome, d.zip, "application/zip")) toast("DWG gerado: " + d.nome + (d.partes ? " (em " + d.partes + " partes: conjunto grande)" : "") + (d.avisos ? " · " + d.avisos + " aviso(s) do conversor" : ""), d.avisos ? "aviso" : "ok");
      else toast("DWG não saiu: " + (d.erro || "falha ao baixar") + (/DWG só no app/.test(d.erro || "") ? "" : " O DXF continua disponível e abre no AutoCAD."), "aviso");
      return d;
    });
  }
  /* TODOS os CTB RA para as pastas Plot Styles (o servidor local copia para todo AutoCAD do usuário, com .bak do que estiver diferente).
     opc.extras = [{ nome, bytes }] (ex.: o CTB da arquitetura de uma geração) · opc.postar(bytes, nome) → Promise({ ok, status, json }) troca o envio (testes). */
  function instalarCtbs(opc) {
    opc = opc || {}; var B = BC(); if (!B) return Promise.resolve({ ok: false, mensagem: "js/bimcad.js não carregou." });
    var lista = B.ctbs().concat(arr(opc.extras));
    var postar = opc.postar || function (bytes, nome) {
      var f = buscar(); if (!f) return Promise.resolve({ ok: false, status: 0, json: null });
      return comPrazo(f, "/__dwg/instalar-ctb", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Ctb-Nome": encodeURIComponent(nome) }, body: bytes }, 20000)
        .then(function (resp) { return resp.json().then(function (j) { return { ok: resp.ok, status: resp.status, json: j }; }, function () { return { ok: false, status: resp.status, json: null }; }); }, function () { return { ok: false, status: 0, json: null }; });
    };
    var rot = { novo: "instalado", igual: "já estava", atualizado: "atualizado (o seu estava diferente: ficou cópia .bak)", erro: "falhou" }, partes = [], falhou = null;
    return lista.reduce(function (p, c) {
      return p.then(function () {
        if (falhou) return null;
        return postar(c.bytes, c.nome).then(function (r) {
          var j = r && r.json;
          if (!j) { falhou = CTB_SO_NO_APP; return null; }
          if (!j.ok) { falhou = String(j.erro || CTB_SO_NO_APP); return null; }
          partes.push(c.nome + ": " + arr(j.instalados).map(function (i) { return i.versao + " — " + (rot[i.acao] || i.acao); }).join("; "));
          return null;
        });
      });
    }, Promise.resolve()).then(function () {
      if (falhou) return { ok: false, mensagem: falhou, instalados: partes };
      return { ok: true, instalados: partes, mensagem: "Penas RA instaladas — " + partes.join(" | ") + ". Feche e abra o DWG de novo." };
    });
  }

  /* ------------------------------------------------------------ tela do hidro (js/hidpranchasui.js chama lerQ antes de gerar e aposGerarHidro depois) */
  /* A tela "Gerar pranchas — hidrossanitário" grava a última geração em HidPranchasUI.ultimo().r (mesmo quando ela FALHA: r.ok = false). Aqui as 2 opções entram na área "Carimbo e saída"
     e o botão "Gerar pranchas" DO MODAL DO HIDRO (nunca outro botão do documento) ganha um gancho: lê as opções, guarda a geração anterior (r0), deixa a tela gerar e só então, se
     a geração for NOVA (≠ r0) e ok, gera o CAD/DWG DELA. Roteiro do defeito (revisão 16/11): a geração nova falhava e o CAD saía da geração ANTERIOR, ainda na memória.
     Se a tela mudar (sem modal, sem botão, sem âncora) o gancho AVISA (toast + console) e desabilita as opções: nunca some em silêncio. */
  function cadDoHidro(r, base) {
    var B = BC(); if (!B || !r || !r.ok) return null;
    return B.paraCad(r, { disciplina: "hidrossanitario", dxfNome: base + ".dxf", dwgNome: base + ".dwg" });
  }
  function partesHidro(r) {
    return function (i0, i1, nome) { return BC().paraCad({ ok: true, folhas: r.folhas.slice(i0, i1) }, { disciplina: "hidrossanitario", dxfNome: nome + ".dxf", dwgNome: nome + ".dwg" }); };
  }
  function lerQ(raiz) {
    var cad = raiz.querySelector('[data-bcad-out="cad"]'), dwg = raiz.querySelector('[data-bcad-out="dwg"]');
    return { cad: !!(cad && cad.checked), dwg: !!(dwg && dwg.checked && !dwg.disabled) };
  }
  /* depois da geração: q = as opções lidas ANTES, r0 = a geração anterior. → true se saiu CAD/DWG. acoes (testes): { cad(o, opc), dwg(o, opc), aviso(t) } */
  function aposGerarHidro(q, r0, HU, acoes) {
    acoes = acoes || {};
    if (!q || (!q.cad && !q.dwg)) return false;
    var r = HU && HU.ultimo ? HU.ultimo().r : null;
    if (!r || r === r0 || !r.ok) { (acoes.aviso || function (t) { toast(t, "aviso"); })("O CAD não saiu: a geração das pranchas não foi concluída (o arquivo anterior não é reaproveitado)."); return false; }
    var base = (r.prefixo || "HID") + "-" + (r.revisao || "R00") + " projeto hidrossanitario", o = cadDoHidro(r, base);
    if (!o) return false;
    if (q.cad) (acoes.cad || baixarCad)(o, { base: base });
    if (q.dwg) (acoes.dwg || baixarDwg)(o, { base: base, partes: partesHidro(r) });
    return true;
  }
  var BimCadUI = { opcoesHtml: opcoesHtml, ligar: ligar, baixarCad: baixarCad, gerarDwg: gerarDwg, gerarDwgPartes: gerarDwgPartes, partesHidro: partesHidro, DXF_MAX_DWG: DXF_MAX_DWG, baixarDwg: baixarDwg, instalarCtbs: instalarCtbs, lerQ: lerQ, aposGerarHidro: aposGerarHidro, cadDoHidro: cadDoHidro, DWG_SO_NO_APP: DWG_SO_NO_APP, CTB_SO_NO_APP: CTB_SO_NO_APP };
  global.BimCadUI = BimCadUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCadUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
