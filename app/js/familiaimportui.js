/* =====================================================================
 * familiaimportui.js — IMPORTAR FAMÍLIAS DO MERCADO no BIM (a TELA;
 *                      prévia `?previa=modelador`)
 *
 * Pedido do Rogério (09/10/2026): "reconhecer as famílias que já existem no
 * mercado e usar as próprias famílias — com todos os parâmetros". O motor é o
 * js/familiamalha.js (puro); aqui só a fiação:
 *   • arrastar no BIM (ou "Importar" na biblioteca) um ou vários .opfam (v2,
 *     do plugin OrçaPRO for Revit; v1, do próprio OrçaPRO), .rfa (com o .txt
 *     do catálogo de tipos, se vier junto) ou um .zip com a pasta;
 *   • a família LEVE vai para a biblioteca do PROJETO (Store "bim_familias",
 *     registro com a obra) e, se a pessoa marcar, também para a MINHA
 *     biblioteca (registro com o dono, aparece em todas as obras dela);
 *   • a GEOMETRIA (malhas por tipo) vai para o IndexedDB do aparelho e para
 *     a nuvem de arquivos da obra (js/arquivosnuvem.js) — na família fica só
 *     a referência (`importada.ref`). Motivo: a lista de famílias da nuvem
 *     tem teto de 1 MiB e recusa lista dentro de lista;
 *   • malha grande (> 2 MB) avisa e oferece simplificar;
 *   • o .rfa entra com tipos e parâmetros e uma CAIXA — "geometria pendente";
 *     o botão "Converter geometria" explica o passo no plugin, e o .opfam
 *     convertido de MESMO nome entra no lugar (mesmo id: as peças seguem).
 * ===================================================================== */
(function (global) {
  "use strict";

  function FM() { return global.FamiliaMalha || null; }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ext(nome) { var m = /\.([a-z0-9]+)$/i.exec(String(nome || "")); return m ? m[1].toLowerCase() : ""; }
  function base(nome) { return String(nome || "").replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, ""); }
  function bytesDe(file) {
    if (file && typeof file.arrayBuffer === "function") return file.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    return new Promise(function (ok, falha) { var fr = new FileReader(); fr.onload = function () { ok(new Uint8Array(fr.result)); }; fr.onerror = function () { falha(fr.error || new Error("não consegui ler o arquivo")); }; fr.readAsArrayBuffer(file); });
  }
  function texto(b) { var s = new TextDecoder("utf-8").decode(b); return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }
  function inflar() {
    if (typeof DecompressionStream === "undefined") return null;
    return function (b) { var ds = new DecompressionStream("deflate-raw"); return new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); };
  }
  function usuario() { try { var u = global.Auth && Auth._usuario; return u ? String(u._usuarioId || u.uid || u.email || "") : ""; } catch (e) { return ""; } }
  function obraAtual() { try { return (global.Gestao && Gestao._bimSel) || ""; } catch (e) { return ""; } }

  var FamiliaImportUI = {
    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && FM()); } catch (e) { return false; } },

    /* separa o que é família (importa, assíncrono) do resto (volta já). O .zip só se sabe abrindo: o que não tiver família volta por `devolver` */
    interceptar: function (lista, devolver) {
      var self = this, fam = [], zips = [], resto = [];
      (lista || []).forEach(function (f) {
        var e = ext(f && f.name);
        if (e === "opfam" || e === "rfa") fam.push(f);
        else if (e === "zip") zips.push(f);
        else if (e === "txt") fam.push(f);   /* catálogo de tipos do .rfa — sem o .rfa, avisa */
        else resto.push(f);
      });
      if (fam.length) self.receber(fam);
      zips.forEach(function (z) {
        bytesDe(z).then(function (b) {
          return global.BimBcf.zipLer(b, { inflar: inflar() }).then(function (arq) {
            var nomes = Object.keys(arq).filter(function (n) { return /\.(opfam|rfa|txt)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n); });
            if (!nomes.some(function (n) { return /\.(opfam|rfa)$/i.test(n); })) { if (typeof devolver === "function") devolver([z]); return; }
            self.receber(nomes.map(function (n) { return { name: n.replace(/^.*\//, ""), _bytes: arq[n] }; }));
          });
        })["catch"](function () { if (typeof devolver === "function") devolver([z]); });
      });
      return resto;
    },

    /* importa uma lista de arquivos → Promise { importadas, erros, avisos } */
    receber: function (arquivos, opts) {
      var self = this; opts = opts || {};
      if (!FM()) { toast("O leitor de famílias importadas não carregou.", "erro"); return Promise.resolve({ importadas: [], erros: ["sem leitor"], avisos: [] }); }
      var lista = (arquivos || []).slice(), catalogos = {};
      lista.forEach(function (f) { if (ext(f.name) === "txt") catalogos[base(f.name).toLowerCase()] = f; });
      var alvos = lista.filter(function (f) { return ext(f.name) !== "txt"; });
      Object.keys(catalogos).forEach(function (k) { if (!alvos.some(function (f) { return base(f.name).toLowerCase() === k; })) toast("\"" + catalogos[k].name + "\": catálogo de tipos sem o .rfa de mesmo nome — arraste os dois juntos.", "aviso", 7000); });
      var out = { importadas: [], erros: [], avisos: [] }, i = 0;
      return new Promise(function (fim) {
        (function prox() {
          if (i >= alvos.length) { self._concluir(out, opts); fim(out); return; }
          var f = alvos[i++];
          var bp = f._bytes ? Promise.resolve(f._bytes) : bytesDe(f);
          var cat = catalogos[base(f.name).toLowerCase()];
          var cp = cat ? (cat._bytes ? Promise.resolve(cat._bytes) : bytesDe(cat)).then(function (b) { return texto(b); }) : Promise.resolve(null);
          Promise.all([bp, cp]).then(function (r) { return self._lerUm(f.name, r[0], r[1]); }).then(function (res) {
            if (!res) return null;
            if (!res.ok) { out.erros.push(f.name + ": " + res.erros.join("; ")); return null; }
            (res.avisos || []).forEach(function (a) { out.avisos.push(res.familia.nome + ": " + a); });
            return self._guardar(res, opts).then(function (fam) { if (fam) out.importadas.push(fam); });
          })["catch"](function (e) { out.erros.push(f.name + ": " + (e && e.message ? e.message : e)); }).then(prox);
        })();
      });
    },

    /* um arquivo → { ok, familia, geometria, avisos } */
    _lerUm: function (nome, bytes, catalogo) {
      var M = FM(), e = ext(nome);
      if (e === "rfa") {
        var pend = this._pendentePorNome(base(nome));
        return M.lerRfa(bytes, nome, { catalogo: catalogo, id: pend ? pend.id : null });
      }
      var s = texto(bytes), o;
      try { o = JSON.parse(s); } catch (x) { return { ok: false, erros: ["o arquivo não é JSON"] }; }
      if (M.ehOpfamV2(o)) {
        /* a conversão de uma família que entrou pelo .rfa (geometria pendente) entra NO LUGAR dela: mesmo id e mesmos ids de tipo */
        var p = this._pendentePorNome(o.familia && o.familia.nome), ids = null;
        if (p) { ids = {}; (p.tipos || []).forEach(function (t) { ids[String(t.nome).toLowerCase()] = t.id; }); }
        return M.lerOpfamV2(o, { id: p ? p.id : null, idsTipo: ids });
      }
      /* .opfam v1 (Família OrçaPRO): o caminho de sempre, com a malha embutida de volta ao registro */
      var r = global.OpFormato ? OpFormato.lerFamilia(s, global.Familia.validar) : { ok: false, erros: ["o formato .opfam não carregou"] };
      if (!r.ok) return r;
      var fam = M.desembutir(r.familia);
      var g = fam.importada && fam.importada.ref ? M.geometria(fam.importada.ref) : null;
      return { ok: true, familia: fam, geometria: g, avisos: r.avisos || [], v1: true };
    },
    _pendentePorNome: function (nome) {
      var n = String(nome || "").trim().toLowerCase(); if (!n || !global.FamiliaUI) return null;
      var l = []; try { l = FamiliaUI.biblioteca(); } catch (e) { l = []; }
      for (var i = 0; i < l.length; i++) if (l[i].importada && l[i].importada.geometriaPendente && String(l[i].nome).trim().toLowerCase() === n) return l[i];
      return null;
    },

    /* malha grande → pergunta; depois guarda a geometria (aparelho + nuvem) e a família (biblioteca) */
    _guardar: function (res, opts) {
      var self = this, M = FM(), fam = res.familia, geo = res.geometria;
      var passo = Promise.resolve(res);
      if (fam.importada && fam.importada.bytes > M.LIMITE_BYTES && geo) passo = this._perguntarGrande(fam).then(function (esc) {
        if (esc === "cancelar") return null;
        if (esc === "simplificar") { var s = M.simplificar(fam, geo); toast("\"" + fam.nome + "\" simplificada: " + Math.round(s.antes / 1024) + " kB → " + Math.round(s.depois / 1024) + " kB.", "ok"); return { familia: s.familia, geometria: s.geometria }; }
        return res;
      });
      return passo.then(function (r) {
        if (!r) return null;
        var f = r.familia, g = r.geometria;
        f._origem = "importada";
        f._escopo = { obraId: obraAtual() || null };
        return self._guardarGeometria(f, g).then(function () {
          if (!global.FamiliaUI || !FamiliaUI._salvar(f)) return null;
          if (opts && opts.minha) self._guardarMinha(f);
          return f;
        });
      });
    },
    _perguntarGrande: function (fam) {
      var mb = String(Math.round(fam.importada.bytes / 104857.6) / 10).replace(".", ",");
      if (!(global.UI && UI.modal)) return Promise.resolve("simplificar");
      return new Promise(function (ok) {
        UI.modal("Malha grande: " + esc(fam.nome), "<p>A geometria tem <b>" + mb + " MB</b> (" + (fam.importada.triangulos || 0).toLocaleString("pt-BR") + " triângulos). Acima de 2 MB o modelo fica pesado para abrir no celular e para subir para a nuvem.</p>" +
          "<p class=\"muted\" style=\"font-size:12.5px\">Simplificar junta os vértices muito próximos até caber em ~2 MB. Detalhe pequeno (parafuso, puxador) pode sumir; as medidas e os parâmetros não mudam.</p>", [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); ok("cancelar"); } },
          { texto: "Manter assim", classe: "ghost", onClick: function () { UI.fecharModal(); ok("manter"); } },
          { texto: "Simplificar", classe: "primary", onClick: function () { UI.fecharModal(); ok("simplificar"); } }
        ]);
      });
    },
    /* a geometria vai para o IndexedDB (abre sem rede) e sobe para a nuvem de arquivos da obra */
    _guardarGeometria: function (fam, geo) {
      var M = FM(), ref = fam.importada && fam.importada.ref;
      if (!ref || !geo) return Promise.resolve(true);
      M.registrarGeometria(ref, geo);
      var txt = M.geometriaParaTexto(geo, fam.id), bytes = new TextEncoder().encode(txt);
      if (typeof global.Idb === "undefined") return Promise.resolve(true);
      var copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return Idb.set(ref, { nome: fam.nome + ".geometria.json", tipo: "application/json", dados: copia }).then(function () {
        try { if (global.ArquivosNuvem) ArquivosNuvem.subir(ref, { obraId: obraAtual() || "biblioteca", pasta: "familias", nome: fam.nome + ".geometria.json", tipo: "application/json" }, bytes); } catch (eN) {}
        return true;
      }, function () { toast("A geometria de \"" + fam.nome + "\" ficou só na memória (este navegador não guardou o arquivo).", "aviso"); return true; });
    },
    /* "minha biblioteca": uma cópia do registro com o DONO (aparece em todas as obras dele); a família é a mesma (mesmo id) */
    _guardarMinha: function (fam) {
      var u = usuario(); if (!u || !global.FamiliaUI || !FamiliaUI._ctx || !FamiliaUI._ctx.salvar) return false;
      var c = JSON.parse(JSON.stringify(fam)); c._escopo = { dono: u, registro: fam.id + "@u:" + u };
      try { return !!FamiliaUI._ctx.salvar(c); } catch (e) { return false; }
    },

    _concluir: function (out, opts) {
      var n = out.importadas.length;
      try { if (global.FamiliaUI) FamiliaUI._sincronizarVisor(); } catch (e) {}
      try { if (global.Gestao && Gestao._famAbrir && n) Gestao._famAbrir("biblioteca"); } catch (e2) {}
      if (n) {
        var pend = out.importadas.filter(function (f) { return f.importada && f.importada.geometriaPendente; }).length;
        toast(n + " família(s) importada(s): " + out.importadas.map(function (f) { return f.nome; }).slice(0, 4).join(", ") + (n > 4 ? "…" : "") + "." +
          (pend ? " " + pend + " com geometria pendente (veio do .rfa: converta pelo plugin OrçaPRO for Revit)." : "") + (out.erros.length ? " Não entrou: " + out.erros.join("; ") + "." : ""), out.erros.length || pend ? "aviso" : "ok", 9000);
      } else if (out.erros.length) toast("Não importei: " + out.erros.join("; "), "erro", 9000);
      this._ultimo = out;
    },
    /* o botão "Minha biblioteca" do cartão da família importada (opcional, por usuário) */
    paraMinha: function (fam) {
      if (!usuario()) { toast("Entre com o seu usuário para ter uma biblioteca só sua.", "aviso"); return false; }
      var ok = this._guardarMinha(fam);
      toast(ok ? "\"" + fam.nome + "\" está na sua biblioteca: aparece em todas as suas obras." : "Não consegui guardar na sua biblioteca.", ok ? "ok" : "erro");
      return ok;
    },

    /* as geometrias que ainda não estão na memória: IndexedDB do aparelho → nuvem; depois redesenha */
    carregarFaltantes: function (lista) {
      var M = FM(); if (!M || typeof global.Idb === "undefined") return Promise.resolve(0);
      var falta = (lista || []).filter(function (f) { return f && f.geometria === "malha" && f.importada && f.importada.ref && !M.geometria(f.importada.ref) && !(f.importada.geometriaPendente && !f.importada.triangulos); });
      var self = this; this._carregando = this._carregando || {};
      falta = falta.filter(function (f) { return !self._carregando[f.importada.ref]; });
      if (!falta.length) return Promise.resolve(0);
      var n = 0;
      return Promise.all(falta.map(function (f) {
        var ref = f.importada.ref; self._carregando[ref] = 1;
        return Idb.get(ref).then(function (v) {
          if (v && v.dados) return new Uint8Array(v.dados);
          if (global.ArquivosNuvem && ArquivosNuvem.ativo()) return ArquivosNuvem.baixar(ref).then(function (b) { var c = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); return Idb.set(ref, { nome: f.nome + ".geometria.json", tipo: "application/json", dados: c }).then(function () { return b; }, function () { return b; }); });
          return null;
        }).then(function (b) {
          if (!b) return;
          var r = M.geometriaDeTexto(texto(b)); if (r.ok) { M.registrarGeometria(ref, r.geometria); n++; }
        }, function () {}).then(function () { delete self._carregando[ref]; });
      })).then(function () { if (n) { try { if (global.BIM && BIM.familiasDefinir && global.FamiliaUI) BIM.familiasDefinir(FamiliaUI.biblioteca()); } catch (e) {} } return n; });
    },

    /* o botão "Converter geometria" da família que veio do .rfa: o passo, na cara */
    explicarConversao: function (fam) {
      var corpo = "<p>\"" + esc(fam.nome) + "\" entrou do <b>.rfa</b> com os tipos e os parâmetros, mas sem a forma 3D: a geometria do .rfa fica num formato fechado do Revit que só o próprio Revit lê. No lugar dela há uma <b>caixa</b> com as medidas do tipo.</p>" +
        "<ol style=\"margin:0 0 10px 18px;padding:0;line-height:1.5\"><li>Abra o Revit com o plugin <b>OrçaPRO for Revit</b>.</li><li>Na aba Integração do plugin, use o comando que converte uma pasta de .rfa em <b>.opfam</b> e escolha a pasta com este .rfa.</li>" +
        "<li>Arraste o <b>.opfam</b> gerado para o BIM do OrçaPRO.</li></ol><p class=\"muted\" style=\"font-size:12.5px\">A família convertida, de mesmo nome, entra NO LUGAR desta: as peças já colocadas ganham a forma, o vão e os conectores sem precisar recolocar.</p>";
      if (global.UI && UI.modal) UI.modal("Geometria pendente — converter pelo plugin", corpo, [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return corpo;
    }
  };

  global.FamiliaImportUI = FamiliaImportUI;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliaImportUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
