/* =====================================================================
 * cadambientesui.js — "Paredes, ambientes e louças do desenho" (fiação fina). 26/11/2026.
 * O motor é o js/cadambientes.js (roteiro do defeito no cabeçalho dele). Aqui:
 *   CadAmbientesUI.analisar(nivelId)   o que o desenho do nível dá (paredes, ambientes, louças) — sem gravar nada
 *   CadAmbientesUI.paredesRef()        as paredes de referência dos vínculos LIGADOS, no formato do js/bim.js
 *                                      (_paredesIfcRef): o hidro as recebe como recebe as do IFC
 *   CadAmbientesUI.aplicar(nivelId, o) liga as paredes (e a volumetria), grava ambientes e louças num lote só (Ctrl+Z desfaz)
 *   CadAmbientesUI.abrir(nivelId)      o diálogo (Propriedades › Vínculos CAD, e logo depois de separar por pavimento)
 * O que fica gravado: no vínculo (Bim2D estado.cad) a marca cadRef = { paredes, vol }; no modelo, os SEPARADORES e
 * AMBIENTES (ids "cadamb-<nível>-…") e as LOUÇAS (ids "cadlc-<nível>-…"). As paredes NUNCA viram parede do modelo:
 * não vão para o quantitativo nem para o orçamento.
 * ===================================================================== */
(function (global) {
  "use strict";
  function A() { return global.CadAmbientes; }
  function B2() { return global.Bim2D; }
  function BIM() { return global.BIM; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function h(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function toast(m, t, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(m, t || "ok", ms || 7000); } catch (e) {} }

  var U = {
    _cache: {},
    niveis: function () { try { return arr(B2().niveis()).slice().sort(function (a, b) { return (+a.y || 0) - (+b.y || 0); }); } catch (e) { return []; } },
    /* o pé-direito do nível: até o nível de cima; o último, 2,80 m (o padrão RA de js/bimambiente.js) */
    peDireito: function (nivelId) {
      var L = this.niveis(), i;
      for (i = 0; i < L.length; i++) if (String(L[i].id) === String(nivelId)) { var a = +L[i].y || 0, b = L[i + 1] ? +L[i + 1].y : null; return b != null && b - a > 1.5 && b - a < 8 ? b - a : 2.8; }
      return 2.8;
    },
    cotaDe: function (nivelId) { var r = 0; this.niveis().forEach(function (n) { if (String(n.id) === String(nivelId)) r = +n.y || 0; }); return r; },
    _chave: function (nivelId) {
      return String(nivelId) + "|" + arr(B2().cadLista(nivelId)).map(function (v) { return [v.id, v.dx, v.dy, v.rot || 0].join(","); }).join(";");
    },
    analisar: function (nivelId) {
      var Cm = A(), b2 = B2(); if (!Cm || !b2 || !b2.cadGeometria) return null;
      var k = this._chave(nivelId); if (this._cache[k]) return this._cache[k];
      var geo = b2.cadGeometria(nivelId, true);
      if (!geo.ids.length) return null;
      /* ⚠ DOIS DESENHOS NO MESMO NÍVEL (27/11/2026 — obra de teste do Rogério com o DWG da Nayara: "PLANTA-BAIXA: PAV SUPERIOR" e "LAYOUT - PAV SUPERIOR"
         separados para o mesmo nível): juntos, as paredes saíam dobradas, os cômodos picados (banheiro de 0,3 m²) e cada nome duas vezes (19 ambientes
         em vez de 9). Paredes e ambientes saem do desenho PRINCIPAL — o que acha mais cômodos com nome (desempate: mais paredes); as louças vêm de
         todos (o bloco costuma estar só no layout), sem repetir o mesmo bloco no mesmo lugar. */
      var par, am, lc;
      if (geo.ids.length > 1) {
        var melhor = null;
        geo.ids.forEach(function (vid) {
          var g1 = b2.cadGeometria(nivelId, true, vid); if (!g1.segs.length) return;
          var p1 = Cm.paredes(g1.segs), a1 = Cm.ambientes(g1.segs, g1.textos, p1);
          var nota = [arr(a1.ambientes).length, arr(p1.paredes).length];
          if (!melhor || nota[0] > melhor.nota[0] || (nota[0] === melhor.nota[0] && nota[1] > melhor.nota[1])) melhor = { id: vid, par: p1, am: a1, nota: nota };
        });
        if (melhor) {
          par = melhor.par; am = melhor.am;
          var vistos = [], insU = geo.ins.filter(function (b) {
            var rep = vistos.some(function (q) { return q.nome === b.nome && Math.abs(q.x - b.x) < 0.3 && Math.abs(q.y - b.y) < 0.3; });   // hid:ok 30 cm: o mesmo bloco desenhado nas duas plantas
            if (!rep) vistos.push(b); return !rep;
          });
          lc = Cm.loucas(insU, par, am.ambientes);
        }
      }
      if (!par) { par = Cm.paredes(geo.segs); am = Cm.ambientes(geo.segs, geo.textos, par); lc = Cm.loucas(geo.ins, par, am.ambientes); }
      var r = { nivelId: nivelId, geo: { linhas: geo.segs.length, textos: geo.textos.length, blocos: geo.ins.length, semCamadas: geo.semCamadas, ids: geo.ids }, paredes: par, ambientes: am, loucas: lc };
      /* um resultado por nível (a chave muda quando o vínculo anda): o hidro pede as paredes a cada traçado e a cada prévia */
      var self = this; Object.keys(this._cache).forEach(function (q) { if (q.split("|")[0] === String(nivelId)) delete self._cache[q]; });
      this._cache[k] = r;
      return r;
    },
    _ligado: function (nivelId, qual) { return arr(B2().cadLista(nivelId)).some(function (v) { return v.cadRef && v.cadRef[qual]; }); },
    paredesRef: function () {
      var self = this, out = [], b2 = B2(); if (!b2 || !b2.cadLista || !A()) return out;
      this.niveis().forEach(function (n) {
        if (!self._ligado(n.id, "paredes")) return;
        var r = null; try { r = self.analisar(n.id); } catch (e) { r = null; }
        if (!r) return;
        var base = +n.y || 0, alt = self.peDireito(n.id), vol = self._ligado(n.id, "vol");
        r.paredes.paredes.forEach(function (p, k) {
          out.push({ id: "cadref-" + n.id + "-" + k, uid: "cad:" + n.id + ":" + k, a: { x: p.x1, z: p.y1 }, b: { x: p.x2, z: p.y2 }, espessura: p.espessura, altura: alt, base: base, cad: true, volume: vol });
        });
      });
      return out;
    },
    atualizar3d: function () { var b = BIM(); try { return b && b.cadRefVolume ? b.cadRefVolume(this.paredesRef()) : 0; } catch (e) { return 0; } },

    /* ------------------------------------------------ gravar */
    _marcar: function (nivelId, paredes, vol) {
      var b2 = B2(), e = b2.estado(), L = (e.cad && e.cad[nivelId]) || [];
      L.forEach(function (v) { v.cadRef = { paredes: !!paredes, vol: !!vol }; });
      b2._gravar();
    },
    _tipo: function (famId) {
      var HF = global.HidFamilias, f = HF && HF.porId ? HF.porId(famId) : null; if (!f) return null;
      var t = arr(f.tipos).filter(function (x) { return !x.oculta; })[0] || arr(f.tipos)[0];
      return t ? { fam: f, tipo: t } : null;
    },
    _medidas: function (famId, tipoId) {
      var b = BIM(), av = null; try { av = b && b.familiaAvaliar ? b.familiaAvaliar(famId, tipoId, {}) : null; } catch (e) { av = null; }
      var cx = av ? (av.caixaObstaculo || av.caixa) : null; if (!cx || !isFinite(cx.x0)) return null;
      return { x0: cx.x0, x1: cx.x1, z0: av.faceParede != null && isFinite(+av.faceParede) ? +av.faceParede : cx.z0 };
    },
    /* o = { paredes, vol, ambientes, loucas, confirmados: { índice da lista de conferência: sub } } → resumo */
    aplicar: function (nivelId, o) {
      o = o || {};
      var self = this, Cm = A(), b = BIM(), r = this.analisar(nivelId);
      if (!r) return { ok: false, erro: "Este nível não tem desenho CAD vinculado." };
      if (!b || !b.editarLote) return { ok: false, erro: "Abra o modelo 3D (BIM) para gravar os ambientes e as louças." };
      this._marcar(nivelId, o.paredes !== false, o.paredes !== false && o.vol !== false);
      var est = null; try { est = b.editarEstado().estado; } catch (e) { est = null; }
      var ids = []; if (est) { arr(est.ambientes).forEach(function (x) { ids.push(String(x.id)); }); arr(est.separadores).forEach(function (x) { ids.push(String(x.id)); }); arr(est.familias).forEach(function (x) { ids.push(String(x.id)); }); }
      var ops = [], res = { ok: true, paredes: r.paredes.paredes.length, ambientes: 0, loucas: [], semParede: [], porAmbiente: {} };
      if (o.ambientes !== false) {
        var pref = "cadamb-" + nivelId + "-";
        Cm.opsAmbientes(r.ambientes.ambientes, nivelId, pref, ids).forEach(function (q) { ops.push(q); });
        res.ambientes = r.ambientes.ambientes.length;
      }
      if (o.loucas !== false) {
        var prefL = "cadlc-" + nivelId + "-", base = this.cotaDe(nivelId);
        ids.forEach(function (id) { if (id.indexOf(prefL) === 0) ops.push({ op: "apagar", id: id }); });
        var lista = r.loucas.auto.map(function (it) { return { it: it, sub: it.sub }; });
        r.loucas.conferir.forEach(function (it, i) { var s = o.confirmados && o.confirmados[i]; if (s) lista.push({ it: it, sub: s }); });
        lista.forEach(function (q, k) {
          var famId = Cm.FAM_DO_SUB[q.sub], tf = famId ? self._tipo(famId) : null;
          if (!tf) { res.semParede.push(q.it.nome + ": família de " + q.sub + " não carregada"); return; }
          var y = base;
          if (q.sub === "pia") { try { var al = global.HidKit && global.HidKit.alturaInstalacao ? global.HidKit.alturaInstalacao(famId, tf.tipo.nome) : null; if (al && al.ok) y = base + al.valor; } catch (eA) {} }
          var op = Cm.opLouca(q.it, prefL + (k + 1), famId, tf.tipo.id, y, self._medidas(famId, tf.tipo.id));
          if (!op) { res.semParede.push(q.it.nome + " (" + (q.it.ambiente || "sem ambiente") + "): sem parede para encostar"); return; }
          ops.push(op);
          var nm = q.it.ambiente || "Fora dos ambientes";
          (res.porAmbiente[nm] = res.porAmbiente[nm] || []).push(Cm.ROT_SUB[q.sub] || q.sub);
          res.loucas.push({ nome: q.it.nome, sub: q.sub, ambiente: nm, id: op.id });
        });
      }
      if (ops.length) {
        var okL = false;
        try { okL = !!b.editarLote({ op: "lote", id: "lcad" + Date.now().toString(36), origem: "cad-ambientes", pedido: "Do desenho: ambientes e louças", ops: ops }); } catch (eL) { okL = false; }
        if (!okL) return { ok: false, erro: "O editor recusou os ambientes/louças do desenho." };
      }
      res.volumetria = this.atualizar3d();
      return res;
    },

    /* ------------------------------------------------ diálogo */
    abrir: function (nivelId) {
      var self = this, UI = global.UI; if (!UI || !UI.modal) return null;
      var r = null; try { r = this.analisar(nivelId); } catch (e) { r = null; }
      var nomeNv = ""; this.niveis().forEach(function (n) { if (String(n.id) === String(nivelId)) nomeNv = n.nome; });
      if (!r) { toast("Este nível não tem desenho CAD vinculado.", "aviso"); return null; }
      var am = r.ambientes, lc = r.loucas, SUBS = ["", "bacia", "lavatorio", "chuveiro", "pia", "tanque"];
      var avisos = [];
      if (r.geo.semCamadas) avisos.push("Este vínculo foi feito antes desta versão e não guardou as camadas nem os blocos: as paredes saem só pela geometria e as louças não aparecem. Para o resultado completo, remova o vínculo e vincule o DWG de novo.");
      if (!r.paredes.paredes.length) avisos.push("Não reconheci parede neste desenho (" + r.geo.linhas + " linhas). O traçado continua sem parede neste nível.");
      else if (r.paredes.criterio !== "camada") avisos.push("O desenho não tem camada de parede (PAREDE, ALVENARIA, REBOCO…): as paredes saíram só pela geometria (pares de linhas paralelas) e podem faltar ou sobrar.");
      if (am.motivo) avisos.push("Ambientes: " + am.motivo + ".");
      var linhasAmb = am.ambientes.map(function (a) {
        var dif = a.areaDesenho ? Math.abs(a.area - a.areaDesenho) / a.areaDesenho : null;
        return "<tr><td>" + h(a.nome) + '</td><td style="text-align:right">' + f2(a.area) + ' m²</td><td style="text-align:right">' + (a.areaDesenho ? f2(a.areaDesenho) + " m²" + (dif > 0.15 ? ' <span title="a área achada difere da escrita no desenho: confira o contorno na planta" style="color:var(--aviso,#a60)">⚠</span>' : "") : '<span class="muted">—</span>') + "</td></tr>";
      }).join("");
      var linhasAb = am.abertos.map(function (a) { return "<li><b>" + h(a.nome) + "</b>: " + h(a.motivo) + "</li>"; }).join("");
      var linhasAuto = lc.auto.map(function (it) { return "<li>" + h(A().ROT_SUB[it.sub] || it.sub) + " — bloco <i>" + h(it.nome) + "</i>" + (it.ambiente ? " em <b>" + h(it.ambiente) + "</b>" : "") + "</li>"; }).join("");
      var linhasConf = lc.conferir.map(function (it, i) {
        return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--linha);font-size:12.5px"><span style="flex:1;min-width:0">' + h(it.regra || it.motivo || it.nome) + "</span>" +
          '<select data-cadlc="' + i + '">' + SUBS.map(function (s) { return '<option value="' + s + '"' + (s === (it.sugestao || it.sub || "") ? " selected" : "") + ">" + (s ? h(A().ROT_SUB[s]) : "Não é louça") + "</option>"; }).join("") + "</select>" +
          '<label style="display:flex;gap:4px;align-items:center;margin:0"><input type="checkbox" data-cadlc-ok="' + i + '"> confirmo</label></div>';
      }).join("");
      var html = '<div id="cad-amb" style="font-size:13px">' +
        '<p class="muted" style="margin:0 0 8px">' + h(nomeNv) + ": o desenho vinculado vira <b>referência</b> do projeto — as paredes entram no Traçado automático e no 3D, mas <b>não</b> são modeladas nem orçadas.</p>" +
        (avisos.length ? '<div style="border:1px solid var(--aviso,#c80);border-radius:10px;padding:6px 10px;margin-bottom:8px">' + avisos.map(h).join("<br>") + "</div>" : "") +
        '<label style="display:flex;gap:6px;align-items:center;margin:0 0 4px"><input type="checkbox" id="cad-amb-par" checked> <b>' + r.paredes.paredes.length + " paredes de referência</b> para o traçado do hidro (pé-direito " + f2(this.peDireito(nivelId)) + " m)</label>" +
        '<label style="display:flex;gap:6px;align-items:center;margin:0 0 8px"><input type="checkbox" id="cad-amb-vol" checked> Mostrar a volumetria dessas paredes no 3D (cinza translúcido, fora do orçamento)</label>' +
        '<label style="display:flex;gap:6px;align-items:center;margin:0 0 4px"><input type="checkbox" id="cad-amb-amb"' + (am.ambientes.length ? " checked" : " disabled") + "> <b>" + am.ambientes.length + " ambientes</b> com o nome do desenho</label>" +
        (am.ambientes.length ? '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:6px"><tr class="muted"><td>Ambiente</td><td style="text-align:right">Área achada</td><td style="text-align:right">No desenho</td></tr>' + linhasAmb + "</table>" : "") +
        (linhasAb ? '<details style="margin-bottom:8px"' + (am.ambientes.length ? "" : " open") + '><summary style="cursor:pointer">Nomes que não viraram ambiente (' + am.abertos.length + ")</summary><ul style=\"margin:4px 0 0 18px;padding:0\">" + linhasAb + "</ul></details>" : "") +
        '<label style="display:flex;gap:6px;align-items:center;margin:0 0 4px"><input type="checkbox" id="cad-amb-lc"' + (lc.auto.length + lc.conferir.length ? " checked" : " disabled") + "> <b>Louças pelos blocos</b>: " + lc.auto.length + " reconhecida(s) pelo nome" + (lc.conferir.length ? ", " + lc.conferir.length + " para conferir" : "") + "</label>" +
        (linhasAuto ? '<ul style="margin:0 0 6px 18px;padding:0;font-size:12.5px">' + linhasAuto + "</ul>" : "") +
        (linhasConf ? '<div id="cad-amb-conf" style="margin:4px 0 6px"><div class="muted" style="font-size:11.5px">Blocos sem nome: a sugestão vem do tamanho e do cômodo — só entra o que você confirmar.</div>' + linhasConf + "</div>" : "") +
        "</div>";
      var bg = UI.modal("Paredes, ambientes e louças do desenho", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () {
          var q = function (id) { var el = document.getElementById(id); return !!(el && el.checked && !el.disabled); };
          var conf = {};
          [].slice.call(document.querySelectorAll("#cad-amb [data-cadlc-ok]")).forEach(function (c) { var i = c.getAttribute("data-cadlc-ok"), s = document.querySelector('#cad-amb select[data-cadlc="' + i + '"]'); if (c.checked && s && s.value) conf[i] = s.value; });
          var o = { paredes: q("cad-amb-par"), vol: q("cad-amb-vol"), ambientes: q("cad-amb-amb"), loucas: q("cad-amb-lc"), confirmados: conf };
          UI.fecharModal();
          var res = self.aplicar(nivelId, o); self._ultimo = res;
          if (!res.ok) { toast(res.erro, "erro", 9000); return; }
          self.resumo(nivelId, res, o);
        } }
      ]);
      return bg;
    },
    /* o resumo final, por ambiente (o que entrou e o que ficou de fora, com o motivo) */
    resumo: function (nivelId, res, o) {
      var UI = global.UI, pa = res.porAmbiente, ks = Object.keys(pa);
      var html = "<p>" + (o.paredes ? "<b>" + res.paredes + " paredes de referência</b> ligadas para o Traçado automático" + (res.volumetria ? " e " + res.volumetria + " na volumetria do 3D" : "") + ". " : "Paredes de referência desligadas. ") +
        (o.ambientes ? "<b>" + res.ambientes + " ambientes</b> gravados com o nome do desenho." : "") + "</p>" +
        (ks.length ? "<p><b>Louças por ambiente</b></p><ul>" + ks.map(function (k) { return "<li><b>" + h(k) + "</b>: " + pa[k].map(h).join(", ") + "</li>"; }).join("") + "</ul>" : (o.loucas ? "<p>Nenhuma louça entrou.</p>" : "")) +
        (res.semParede.length ? '<p style="color:var(--aviso,#a60)">Ficou de fora: ' + res.semParede.map(h).join("; ") + ".</p>" : "") +
        '<p class="muted">Agora rode <b>Hidrossanitário › Traçado automático</b>. Ctrl+Z desfaz ambientes e louças de uma vez.</p>';
      try { if (UI && UI.modal) UI.modal("Do desenho para o projeto", '<div id="cad-amb-resumo">' + html + "</div>", [{ texto: "OK", classe: "primary", onClick: function () { UI.fecharModal(); } }]); } catch (e) {}
    }
  };
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("bim:modelos", function () { setTimeout(function () { try { if (U.paredesRef().length) U.atualizar3d(); } catch (e) {} }, 300); });
  global.CadAmbientesUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
