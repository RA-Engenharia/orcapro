/* =====================================================================
 * rvvisor.js — o VISOR DO LINK da RA/RV no celular de qualquer pessoa.
 * Fiação fina: as regras moram em js/rvnuvem.js (link), js/bim4dsim.js
 * (4D) e js/bimusdz.js (RA nativa); aqui é tela e rede.
 *
 * Quem abre: App.iniciar → App._abrirRVCloud(token) → RvVisor.abrir(token).
 * O que tem:
 *   - cabeçalho com a MARCA da empresa e o nome da obra;
 *   - barra própria (Vistas · Camadas · 4D · Apontar · Medir · RA/RV · Mais)
 *     — a barra do computador não aparece (modo visitante do bim.js);
 *   - trena com o mesmo ímã do computador (lupa no dedo, eixo travado),
 *     desfazer e limpar — só na tela, nada sai do aparelho;
 *   - toque na peça mostra o que ela é (sem preço);
 *   - pontos de vista, disciplina/pavimento/corte, obra no tempo (4D);
 *   - apontamento de campo com foto — SEM SINAL ele fica guardado no
 *     aparelho e vai sozinho quando a internet volta (com o link aberto);
 *   - RA do iPhone (Quick Look) e do Android (app do Google);
 *   - abre SEM INTERNET depois da primeira vez (Cache API), até o link vencer.
 *
 * ⚠ O CELULAR NÃO TEM LOGIN NEM Store. Tudo o que ele sabe vem do link
 *   (/rv/t, /rv/d, /rv/f, /rv/notas) — e o que ele manda de volta é só o
 *   apontamento (/rv/nota) e o .glb do Android (/rv/glb). O apontamento que
 *   espera sinal mora no cache orcapro-rv-fila-v1, deste aparelho só.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CACHE = "orcapro-rv-v1";
  var TOPO = 60, BASE = 74, TRENA_H = 46;
  var st = null;

  function I(n, px) { return (global.Icones && global.Icones.get) ? global.Icones.get(n, px || 18) : ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function $(id) { return document.getElementById(id); }
  function RV() { return global.RvNuvem; }
  function B() { return global.BIM; }

  /* ---------------- recado curto no topo ---------------- */
  var _recT = 0;
  function recado(t, erro) {
    var r = $("rvv-recado"); if (!r) return;
    r.textContent = t || ""; r.style.display = t ? "block" : "none";
    r.style.background = erro ? "rgba(153,27,27,.95)" : "rgba(15,39,64,.95)";
    clearTimeout(_recT); if (t) _recT = setTimeout(function () { r.style.display = "none"; }, erro ? 7000 : 4200);
  }

  /* ---------------- ABRIR SEM INTERNET (Cache API) ----------------
     manifesto e dados: rede primeiro, cache se não houver rede;
     o .ifc: cache primeiro (o conteúdo de um id nunca muda).
     ⚠ o cache some quando o link vence — a Política promete que o modelo
     some junto com o link, e isso vale também para este aparelho. */
  function cacheAberto() { return (global.caches && global.caches.open) ? global.caches.open(CACHE) : Promise.reject(new Error("sem cache")); }
  function buscarJson(url, guardar) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (r.status === 404 || r.status === 410) { var e = new Error("expirado"); e.expirado = true; throw e; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (guardar) { var cp = r.clone(); cacheAberto().then(function (c) { return c.put(guardar, cp); }).catch(function () {}); }
      return r.json();
    }).catch(function (e) {
      if (e && e.expirado) throw e;
      return cacheAberto().then(function (c) { return c.match(guardar || url); }).then(function (r) {
        if (!r) throw new Error("offline");
        return r.json().then(function (j) { j._offline = true; return j; });
      });
    });
  }
  function buscarBytes(url) {
    return cacheAberto().then(function (c) {
      return c.match(url).then(function (r) {
        if (r) return r.arrayBuffer();
        return fetch(url).then(function (r2) {
          if (!r2.ok) throw new Error(r2.status === 410 ? "link expirado" : "modelo indisponível (HTTP " + r2.status + ")");
          return c.put(url, r2.clone()).catch(function () {}).then(function () { return r2.arrayBuffer(); });
        });
      });
    }).catch(function (e) {
      if (e && /expirado|indisponível/.test(e.message)) throw e;
      return fetch(url).then(function (r3) { if (!r3.ok) throw new Error("modelo indisponível"); return r3.arrayBuffer(); });
    });
  }
  /* índice do que este aparelho guardou, para apagar o que venceu */
  function indiceCache(fn) {
    return cacheAberto().then(function (c) {
      return c.match("/rv/__indice").then(function (r) { return r ? r.json() : {}; }).then(function (ix) {
        var novo = fn(ix || {}, c);
        return c.put("/rv/__indice", new Response(JSON.stringify(novo), { headers: { "Content-Type": "application/json" } }));
      });
    }).catch(function () {});
  }
  function limparVencidos() {
    return indiceCache(function (ix, c) {
      var agora = Date.now(), vivosIds = {};
      Object.keys(ix).forEach(function (tk) { if (ix[tk].expira > agora) (ix[tk].ids || []).forEach(function (id) { vivosIds[id] = 1; }); });
      Object.keys(ix).forEach(function (tk) {
        if (ix[tk].expira > agora) return;
        c.delete("/rv/t/" + tk); c.delete("/rv/d/" + tk); c.delete("/rv/notas/" + tk);
        /* ⚠ a FILA não sai aqui: esta limpeza roda ao abrir, ANTES de o
           manifesto dizer que o link venceu — apagar aqui fazia o apontamento
           que esperava sinal sumir calado. Ela sai pelo caminho do "venceu",
           que diz quantos se perderam. (É texto da própria pessoa, no
           aparelho dela.) */
        (ix[tk].ids || []).forEach(function (id) { if (!vivosIds[id]) c.delete("/rv/f/" + id); });
        delete ix[tk];
      });
      return ix;
    });
  }
  function esquecerLink(tk) {
    return indiceCache(function (ix, c) {
      c.delete("/rv/t/" + tk); c.delete("/rv/d/" + tk); c.delete("/rv/notas/" + tk);
      (ix[tk] && ix[tk].ids || []).forEach(function (id) { c.delete("/rv/f/" + id); });
      delete ix[tk]; return ix;
    });
  }

  /* ---------------- apontamento SEM SINAL ----------------
     ⚠ No canteiro o sinal cai o tempo todo. Antes, sem internet o envio
     falhava e a pessoa tinha de lembrar de mandar de novo depois — na
     prática, apontamento perdido. Agora ele fica guardado NESTE aparelho
     (Cache API, como o modelo; o sw.js preserva os caches orcapro-rv-*) e
     vai sozinho quando o sinal volta, com o link aberto.
     ⚠ Cada apontamento leva um `cid` gerado aqui: se a resposta da 1ª
     tentativa se perder no caminho de volta, o servidor já gravou — e o
     reenvio com o mesmo cid devolve o mesmo apontamento (bim-rv v5), em vez
     de a obra receber dois. */
  var FILA = "orcapro-rv-fila-v1";
  function novoCid() {
    var a = [], i;
    try { var u = new Uint8Array(12); global.crypto.getRandomValues(u); for (i = 0; i < u.length; i++) a.push(u[i]); }
    catch (e) { a = []; for (i = 0; i < 12; i++) a.push(Math.floor(Math.random() * 256)); }
    return a.map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function filaUrl(tk, cid) { return "/rv/fila/" + tk + "/" + cid; }
  function filaCache() { return (global.caches && global.caches.open) ? global.caches.open(FILA) : Promise.reject(new Error("sem cache")); }
  function doLink(tk) { var pre = "/rv/fila/" + tk + "/"; return function (rq) { try { return new URL(rq.url).pathname.indexOf(pre) === 0; } catch (e) { return false; } }; }
  function filaGravar(tk, item) {
    return filaCache().then(function (c) { return c.put(filaUrl(tk, item.nota.cid), new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json" } })); });
  }
  function filaTirar(tk, cid) { return filaCache().then(function (c) { return c.delete(filaUrl(tk, cid)); }).catch(function () {}); }
  function filaLer(tk) {
    return filaCache().then(function (c) {
      return c.keys().then(function (ks) {
        return Promise.all(ks.filter(doLink(tk)).map(function (rq) { return c.match(rq).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; }); }));
      });
    }).then(function (l) {
      return (l || []).filter(function (x) { return x && x.nota && x.nota.cid; }).sort(function (a, b) { return (a.guardado || 0) - (b.guardado || 0); });
    }, function () { return []; });
  }
  function filaApagarLink(tk) {
    return filaCache().then(function (c) { return c.keys().then(function (ks) { return Promise.all(ks.filter(doLink(tk)).map(function (rq) { return c.delete(rq); })); }); }).catch(function () {});
  }
  /* {ok, id} | {temporario, rede?, erro} | {erro} — este último é RECUSA do
     servidor (link vencido, limite, texto inválido): não adianta reenviar */
  function postarNota(tk, nota) {
    return fetch("/rv/nota/" + tk, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nota) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j && j.ok) return { ok: true, id: j.id, repetido: !!j.repetido };
        /* ⚠ 200 SEM o "ok" do servidor é wi-fi de portal (canteiro, hotel)
           respondendo uma página no lugar dele: não chegou — tenta de novo */
        if (r.ok) return { temporario: true, erro: "a resposta não veio do servidor — o wi-fi está pedindo login?" };
        if (r.status === 429 || r.status >= 500) return { temporario: true, erro: (j && j.erro) || ("o servidor respondeu " + r.status) };
        return { erro: (j && j.erro) || ("o servidor recusou (" + r.status + ")") };
      });
    }, function (e) { return { temporario: true, rede: true, erro: (e && e.message) || "sem rede" }; });
  }
  var _filaRodando = false, _filaT = 0, _filaEspera = 15000;
  function agendarFila(ms) { clearTimeout(_filaT); _filaT = setTimeout(function () { enviarFila(); }, ms); }
  function enviarFila() {
    if (_filaRodando) return Promise.resolve(-1);   /* já está mandando: quem pediu não ganha recado */
    if (!st || !st.token || !st.man || !st.man.aceitaNotas) return Promise.resolve(0);
    _filaRodando = true;
    /* quem manda AGORA desarma o relógio de antes: o "Tentar agora" (ou o
       sinal voltando) deixava armado o reenvio de 15 s agendado quando o
       apontamento foi guardado, e ele disparava depois à toa */
    clearTimeout(_filaT); _filaT = 0;
    var tk = st.token, foram = 0, recusados = 0, parou = false;
    return filaLer(tk).then(function (l) {
      var seq = Promise.resolve();
      l.filter(function (x) { return !x.erro; }).forEach(function (it) {
        seq = seq.then(function () {
          if (parou) return;
          return postarNota(tk, it.nota).then(function (r) {
            if (r.ok) { foram++; return filaTirar(tk, it.nota.cid); }
            if (r.temporario) { parou = true; return; }
            /* recusado: FICA na lista com o motivo (a pessoa decide descartar);
               sumir com ele calado seria perder o que ela escreveu */
            recusados++; it.erro = r.erro; it.erroEm = Date.now();
            return filaGravar(tk, it).catch(function () {});
          });
        });
      });
      return seq;
    }).then(function () { return filaLer(tk); }).then(function (l) {
      _filaRodando = false;
      if (!st || st.token !== tk) return foram;
      st.fila = l; pintarFila();   /* o selo acompanha já, sem esperar a lista do servidor */
      var pend = l.filter(function (x) { return !x.erro; }).length;
      if (pend) { _filaEspera = parou ? Math.min(_filaEspera * 2, 300000) : 15000; agendarFila(_filaEspera); }
      else _filaEspera = 15000;
      if (recusados) recado(recusados === 1 ? "Um apontamento guardado sem sinal foi RECUSADO pelo servidor — veja o motivo em Apontar." : recusados + " apontamentos guardados foram RECUSADOS pelo servidor — veja o motivo em Apontar.", true);
      else if (foram) recado(foram === 1 ? "O apontamento guardado sem sinal foi enviado." : foram + " apontamentos guardados sem sinal foram enviados.", false);
      if (foram) carregarNotas(st.folha !== "notas");
      return foram;
    }, function () { _filaRodando = false; return 0; });
  }
  function pintarFila() {
    if (!st) return;
    var n = (st.fila || []).length, b = document.querySelector('#rvv-barra [data-f="notas"]');
    if (b) { if (n) b.setAttribute("data-n", String(n)); else b.removeAttribute("data-n"); }
    if (B() && B().pinos) desenharPinos();
    if (st.folha === "notas" && !st.apontando) listarNotas(st._notasOffline);
  }

  /* ---------------- montagem da tela ---------------- */
  function estilo() {
    if ($("rvv-estilo")) return;
    var s = document.createElement("style"); s.id = "rvv-estilo";
    s.textContent =
      "#rvfull{position:fixed;inset:0;background:#0b1a2b;font-family:Inter,system-ui,sans-serif;color:#dbe8f5;overflow:hidden;-webkit-text-size-adjust:100%}" +
      "#rvv-topo{position:absolute;left:0;right:0;top:0;height:" + TOPO + "px;padding:calc(env(safe-area-inset-top,0px) + 6px) 8px 6px;box-sizing:border-box;display:flex;align-items:center;gap:8px;background:linear-gradient(rgba(8,20,34,.94),rgba(8,20,34,.78));z-index:2147483000}" +
      "#rvv-topo img{height:34px;max-width:68px;object-fit:contain;border-radius:6px;background:#fff;padding:2px}" +
      "#rvv-tit{flex:1;min-width:0;line-height:1.2}#rvv-tit b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#rvv-tit span{display:block;font-size:11.5px;color:#9fb2c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".rvv-bt{border:1px solid #2e4a66;background:rgba(15,39,64,.92);color:#dbe8f5;border-radius:10px;padding:7px 10px;font-size:12.5px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:inherit;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}" +
      ".rvv-bt.pri{background:#16a34a;border-color:#16a34a;color:#fff}.rvv-bt.azul{background:#2563eb;border-color:#2563eb;color:#fff}.rvv-bt.on{background:#0e7490;border-color:#0e7490;color:#fff}.rvv-bt:disabled{opacity:.5}" +
      "#rvv-barra{position:absolute;left:0;right:0;bottom:0;height:" + BASE + "px;padding:4px 4px calc(env(safe-area-inset-bottom,0px) + 4px);box-sizing:border-box;display:flex;justify-content:space-around;align-items:stretch;background:rgba(8,20,34,.96);border-top:1px solid #1d3550;z-index:2147483000}" +
      "#rvv-barra button{flex:1;min-width:0;border:0;background:transparent;color:#9fb2c8;font-size:10.5px;font-family:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:2px 0}" +
      "#rvv-barra button.on{color:#fff;background:rgba(37,99,235,.35)}#rvv-barra button[hidden]{display:none}" +
      /* selo do Apontar: quantos esperam sinal neste aparelho */
      "#rvv-barra button{position:relative}#rvv-barra button[data-n]::after{content:attr(data-n);position:absolute;top:3px;left:calc(50% + 6px);min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#f59e0b;color:#111;font-size:10px;font-weight:700;line-height:16px;text-align:center}" +
      ".rvv-fila{font-size:12px;color:#fcd34d;margin:8px 0;line-height:1.45}" +
      "#rvv-folha{position:absolute;left:0;right:0;bottom:" + BASE + "px;max-height:62%;overflow:auto;background:#0f2740;border-top:1px solid #24435f;border-radius:16px 16px 0 0;padding:14px 14px 16px;box-sizing:border-box;z-index:2147482990;display:none;box-shadow:0 -10px 30px rgba(0,0,0,.45)}" +
      "#rvv-folha h3{margin:0 0 10px;font-size:15px;display:flex;justify-content:space-between;align-items:center}" +
      ".rvv-lin{display:flex;align-items:center;gap:8px;padding:10px 8px;border-bottom:1px solid #1d3550;cursor:pointer}.rvv-lin:last-child{border-bottom:0}.rvv-lin small{color:#8fa3b8;display:block}" +
      ".rvv-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}.rvv-chip{border:1px solid #2e4a66;background:#0b1e33;color:#cbd8e6;border-radius:999px;padding:7px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}.rvv-chip.on{background:#2563eb;border-color:#2563eb;color:#fff}" +
      ".rvv-rot{font-size:11.5px;color:#8fa3b8;margin:10px 0 4px}" +
      "#rvv-card{position:absolute;left:10px;right:10px;bottom:" + (BASE + 10) + "px;background:#0f2740;border:1px solid #24435f;border-radius:14px;padding:12px;z-index:2147482995;display:none;box-shadow:0 10px 30px rgba(0,0,0,.5)}" +
      "#rvv-card table{width:100%;font-size:12.5px;border-collapse:collapse}#rvv-card td{padding:3px 0;vertical-align:top}#rvv-card td:first-child{color:#8fa3b8;width:38%}" +
      "#rvv-recado{position:absolute;left:10px;right:10px;top:" + (TOPO + 8) + "px;display:none;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.35;z-index:2147483001;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.4)}" +
      "#rv-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px;background:#0b1a2b;z-index:2147483002}" +
      ".rvv-inp{width:100%;box-sizing:border-box;padding:10px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:15px;font-family:inherit}" +
      ".rvv-nota-foto{width:54px;height:54px;object-fit:cover;border-radius:8px;flex:none}" +
      /* a faixa da trena: logo acima da barra; a barra do eixo do bim.js sobe
         para cima dela (opção eixoBase no montar) */
      "#rvv-trena{position:absolute;left:10px;right:10px;bottom:" + (BASE + 8) + "px;height:" + TRENA_H + "px;box-sizing:border-box;display:none;align-items:center;gap:6px;padding:5px 6px 5px 10px;background:rgba(15,39,64,.95);border:1px solid #24435f;border-radius:12px;z-index:2147482994;box-shadow:0 6px 18px rgba(0,0,0,.4)}" +
      "#rvv-trena .tx{flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#rvv-trena .tx svg{vertical-align:-3px}" +
      "#rvv-trena .v{color:#86efac;margin-left:6px;font-weight:700}#rvv-trena .rvv-bt{padding:7px 9px}";
    document.head.appendChild(s);
  }

  function montarTela() {
    estilo();
    document.body.innerHTML =
      '<div id="rvfull">' +
      /* ⚠ LARGURA E ALTURA EXPLÍCITAS: o BIM.montar troca o position do
         contêiner para relative, e o `inset:0` deixava de valer — o 3D
         desenhava só no terço de cima da tela (a e2e mede posições e não viu;
         a captura mostrou). */
      '<div id="bim-canvas" style="position:absolute;left:0;top:0;width:100%;height:100%"></div>' +
      '<div id="rvv-topo"><span id="rvv-logo"></span><div id="rvv-tit"><b>Projeto 3D</b><span></span></div>' +
      /* os ids rv-reun / rv-audio / rv-upd são os que App._rvReuniao e o AutoUpdate conhecem */
      '<button id="rv-reun" class="rvv-bt" style="display:none">' + I("pessoas", 15) + ' Reunião</button>' +
      '<button id="rv-audio" class="rvv-bt" style="display:none">' + I("microfone", 15) + '</button>' +
      /* trava da câmera (tablet deitado na mesa): encostar a mão não gira nem dá zoom */
      '<button class="rvv-bt" data-a="trava" title="Travar a câmera">' + I("destravado", 15) + '</button>' +
      '<button id="rv-upd" class="rvv-bt" title="Buscar atualização">' + I("ciclo", 15) + '</button></div>' +
      '<div id="rvv-recado"></div>' +
      '<div id="rvv-card"></div>' +
      '<div id="rvv-trena" role="toolbar" aria-label="Trena"></div>' +
      '<div id="rvv-folha"></div>' +
      '<nav id="rvv-barra">' +
      '<button data-f="vistas">' + I("camera", 20) + 'Vistas</button>' +
      '<button data-f="camadas">' + I("camadas", 20) + 'Camadas</button>' +
      '<button data-f="4d" hidden>' + I("calendario", 20) + 'Obra no tempo</button>' +
      /* escondido até o manifesto dizer que o link recebe (aceitaNotas) */
      '<button data-f="notas" hidden>' + I("nota", 20) + 'Apontar</button>' +
      /* a trena na BARRA, não em Mais: é ferramenta de campo (o mestre de obra
         mede a peça na frente dele), e lá dentro ninguém achava — nem achava
         onde parar */
      '<button data-f="medir">' + I("medir", 20) + 'Medir</button>' +
      '<button data-f="ra">' + I("vr", 20) + 'RA/RV</button>' +
      '<button data-f="mais">' + I("mais", 20) + 'Mais</button>' +
      '</nav>' +
      '<div id="rv-load"><div id="rvv-load-logo"></div><div style="font-size:34px">' + I("nuvem", 34) + '</div><div id="rv-load-txt" style="font-size:15px">Baixando o projeto…</div>' +
      '<div style="font-size:12px;color:#8fa3b8;max-width:320px">Depois: toque numa peça para ver o que ela é, ou em RA/RV para ver o projeto no seu ambiente.</div></div>' +
      '</div>';
    $("rv-upd").onclick = function () { if (global.AutoUpdate && global.AutoUpdate.forcar) global.AutoUpdate.forcar(); else location.reload(); };
    $("rvv-barra").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return;
      var f = b.getAttribute("data-f");
      /* ⚠ o recado mora no topo, por cima de tudo: aberto junto com o painel
         da RA, ele cobria o ✕ do painel (a e2e de 29/09 pegou o
         "Apontamento enviado" em cima do fechar) */
      if (f === "medir") { ligarMedir(!st.medindo); return; }
      /* na RA a tela é do imersivo: toque ali anda/olha, não marca ponto */
      if (f === "ra") { recado(""); fecharFolha(); fecharCard(); if (st.medindo) ligarMedir(false); if (B().abrirXR) B().abrirXR(); return; }
      if (st.folha === f) fecharFolha(); else abrirFolha(f);
    });
  }
  /* o botão acompanha a trava — ela também se desfaz pelo aviso do próprio 3D */
  function pintarTrava() {
    var b = document.querySelector('#rvv-topo [data-a="trava"]'); if (!b) return;
    var on = !!(B().travado && B().travado());
    if (b.getAttribute("data-on") === (on ? "1" : "0")) return;
    b.setAttribute("data-on", on ? "1" : "0");
    b.innerHTML = I(on ? "cadeado" : "destravado", 15);
    b.style.background = on ? "#15803d" : "";
    b.title = on ? "Câmera travada — toque para destravar" : "Travar a câmera";
  }
  function marcarBarra() {
    var bs = document.querySelectorAll("#rvv-barra [data-f]");
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-f") === st.folha || (bs[i].getAttribute("data-f") === "medir" && !!st.medindo));
  }

  /* ---------------- trena ----------------
     O ímã, a lupa (segurar o dedo) e o eixo são os do bim.js — os mesmos do
     computador. Aqui é só ligar/desligar e a faixa com o que foi medido.
     Nada disto sai do aparelho: a medida é de quem está olhando. */
  function fmtM(m) { return m >= 1 ? m.toFixed(2).replace(".", ",") + " m" : Math.round(m * 100) + " cm"; }
  function ligarMedir(on) {
    st.medindo = !!on;
    if (on) {
      recado(""); fecharFolha(); fecharCard();
      if (B().painelXRAberto && B().painelXRAberto()) B().abrirXR();
    }
    if (B().medir) B().medir(st.medindo);
    marcarBarra(); pintarTrena();
  }
  function pintarTrena() {
    var el = $("rvv-trena"); if (!el || !st) return;
    var e = (B() && B().trenaEstado) ? B().trenaEstado() : null;
    /* a trena também se desliga por dentro do 3D (abrir a RA, Esc num
       computador): a faixa acompanha em vez de mostrar uma ferramenta morta */
    if (st.medindo && e && !e.on) { st.medindo = false; marcarBarra(); }
    if (!st.medindo || !e) { if (el.style.display !== "none") { el.style.display = "none"; el.removeAttribute("data-k"); } return; }
    el.style.display = "flex";
    var k = [e.n, e.pendente, e.ultima ? e.ultima.valor.toFixed(4) + e.ultima.eixo : ""].join("|");
    if (el.getAttribute("data-k") === k) return;   /* repinta só quando muda (o relógio passa a cada 300 ms) */
    el.setAttribute("data-k", k);
    var algo = e.n > 0 || e.pendente > 0;
    var txt = e.pendente ? "1º ponto marcado" : e.n ? e.n + (e.n === 1 ? " medida" : " medidas") : "Toque em 2 pontos";
    var ult = (!e.pendente && e.ultima) ? '<span class="v" data-a="trena-valor">' + fmtM(e.ultima.valor) + (e.ultima.eixo ? " (" + esc(e.ultima.eixo) + ")" : e.ultima.horizontal ? " (horizontal)" : "") + "</span>" : "";
    el.innerHTML = '<div class="tx">' + I("medir", 16) + " <b>" + txt + "</b>" + ult + "</div>" +
      '<button class="rvv-bt" data-a="trena-desfazer"' + (algo ? "" : " disabled") + ">↶ Desfazer</button>" +
      '<button class="rvv-bt" data-a="trena-limpar"' + (algo ? "" : " disabled") + ">Limpar</button>" +
      '<button class="rvv-bt" data-a="trena-parar" title="Parar de medir" aria-label="Parar de medir">' + I("fechar", 15) + "</button>";
  }
  function txtCarga(t) { var e = $("rv-load-txt"); if (e) e.textContent = t; }
  function erroCarga(t) {
    var l = $("rv-load"); if (!l) { recado(t, true); return; }
    txtCarga(t);
    var ic = l.children[1]; if (ic) ic.innerHTML = I("alerta", 34);
  }

  /* ---------------- marca ---------------- */
  function aplicarMarca(m) {
    if (!m) return;
    var tit = $("rvv-tit");
    if (tit) { tit.querySelector("b").textContent = m.obra || st.man.nome || "Projeto 3D"; tit.querySelector("span").textContent = m.empresa || ""; }
    if (m.logo) {
      var im = '<img alt="" src="' + esc(m.logo) + '">';
      if ($("rvv-logo")) $("rvv-logo").innerHTML = im;
      if ($("rvv-load-logo")) $("rvv-load-logo").innerHTML = '<img alt="" src="' + esc(m.logo) + '" style="max-height:64px;max-width:180px;background:#fff;border-radius:8px;padding:4px">';
    }
    document.title = (m.obra || st.man.nome || "Projeto 3D") + (m.empresa ? " — " + m.empresa : "");
  }

  /* ---------------- folhas (painéis de baixo) ---------------- */
  function abrirFolha(f) {
    st.folha = f; marcarBarra(); fecharCard(); recado("");
    if (B().painelXRAberto && B().painelXRAberto()) B().abrirXR();
    var el = $("rvv-folha"); el.style.display = "block";
    var html = "";
    if (f === "vistas") html = folhaVistas();
    else if (f === "camadas") html = folhaCamadas();
    else if (f === "4d") html = folha4D();
    else if (f === "notas") html = folhaNotas();
    else if (f === "mais") html = folhaMais();
    el.innerHTML = html;
    if (f === "4d") ligar4D();
    /* a lista sai NA HORA com o que já se sabe (inclusive o que espera
       sinal); a volta do servidor só atualiza. Sem sinal essa volta cai no
       cache e demora — a pessoa via "Carregando…" logo depois de guardar. */
    if (f === "notas") { listarNotas(st._notasOffline); carregarNotas(false); }
  }
  function fecharFolha() {
    st.folha = ""; marcarBarra();
    var el = $("rvv-folha"); if (el) { el.style.display = "none"; el.innerHTML = ""; }
    if (st.apontando) cancelarApontar();
  }
  function cabecalho(t) { return '<h3>' + t + '<button class="rvv-bt" data-a="fechar-folha">' + I("fechar", 15) + '</button></h3>'; }

  // ---- Vistas ----
  function folhaVistas() {
    var vs = (st.dados && st.dados.vistas) || [];
    var h = cabecalho(I("camera", 17) + " Pontos de vista");
    h += '<div class="rvv-lin" data-a="vista-inicio"><span>' + I("alvo", 18) + '</span><div><b>Visão geral</b><small>Enquadra o projeto inteiro</small></div></div>';
    if (!vs.length) h += '<p style="font-size:12.5px;color:#9fb2c8">Quem enviou o link não incluiu pontos de vista.</p>';
    vs.forEach(function (v, i) {
      h += '<div class="rvv-lin" data-a="vista" data-i="' + i + '"><span>' + I("camera", 18) + '</span><div><b>' + esc(v.nome) + '</b>' +
        (v.completa ? '' : '<small>só a posição da câmera</small>') + '</div></div>';
    });
    return h;
  }
  function irVista(i) {
    var v = st.dados && st.dados.vistas && st.dados.vistas[i]; if (!v) return;
    if (B().imersivoAtivo && B().imersivoAtivo()) B().sairImersivo();
    if (st.em4d) sair4D();
    B().tetoVisitante(null);
    var r = B().aplicarVista(v) || {};
    fecharFolha();
    var nl = (r.naoLocalizadas || []).length;
    recado(esc(v.nome) + (nl ? " — " + nl + " peça(s) desta vista não estão neste modelo." : ""), false);
  }

  // ---- Camadas ----
  function folhaCamadas() {
    var h = cabecalho(I("camadas", 17) + " Camadas");
    var ds = B().disciplinas ? B().disciplinas() : [];
    if (ds.length > 1) {
      h += '<div class="rvv-rot">Disciplinas (toque para ligar/desligar)</div><div class="rvv-chips">';
      ds.forEach(function (d) { h += '<button class="rvv-chip' + (d.oculta ? '' : ' on') + '" data-a="disc" data-k="' + esc(d.chave) + '">' + esc(d.nome) + '</button>'; });
      h += '</div>';
    }
    var ps = B().pavimentos || [];
    if (ps.length > 1) {
      var iso = B().pavimentoIsolado;
      h += '<div class="rvv-rot">Pavimento</div><div class="rvv-chips"><button class="rvv-chip' + (iso ? '' : ' on') + '" data-a="pav" data-k="">Todos</button>';
      ps.forEach(function (p) { h += '<button class="rvv-chip' + (iso === p.nome ? ' on' : '') + '" data-a="pav" data-k="' + esc(p.nome) + '">' + esc(p.nome) + '</button>'; });
      h += '</div>';
    }
    var cf = st.corte == null ? 100 : st.corte;
    h += '<div class="rvv-rot">Cortar a altura (ver por dentro): <b data-a="corte-v">' + (cf >= 100 ? "inteiro" : cf + "%") + '</b></div>' +
      '<input type="range" min="0" max="100" value="' + cf + '" data-a="corte" style="width:100%;accent-color:#22c55e">';
    h += '<div style="margin-top:12px"><button class="rvv-bt" data-a="tudo">' + I("olho", 15) + ' Mostrar tudo</button></div>';
    return h;
  }

  // ---- 4D ----
  function folha4D() {
    var s = st.simCel; if (!s) return cabecalho("Obra no tempo") + '<p>Este link não trouxe cronograma.</p>';
    var h = cabecalho(I("calendario", 17) + " Obra no tempo");
    h += '<div style="font-size:13px;margin-bottom:6px"><b data-a="4d-data"></b> <span data-a="4d-dia" style="color:#9fb2c8"></span></div>';
    h += '<input type="range" min="0" max="' + (s.eixo.dias.length - 1) + '" value="' + st.dia4d + '" data-a="4d-slider" style="width:100%;accent-color:#f59e0b">';
    h += '<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap"><button class="rvv-bt" data-a="4d-play">' + I("avancar", 15) + ' Animar</button>' +
      '<button class="rvv-bt" data-a="4d-hoje">Hoje</button>' +
      '<button class="rvv-bt' + (st.op4d.futuro === "fantasma" ? " on" : "") + '" data-a="4d-fantasma">Mostrar o que falta (fantasma)</button>' +
      '<button class="rvv-bt" data-a="4d-sair">Sair do 4D</button></div>';
    h += '<div data-a="4d-leg" style="font-size:12px;line-height:1.6"></div>';
    if (s.naoLocalizadas) h += '<p style="font-size:11px;color:#f0b94a">' + s.naoLocalizadas + ' peça(s) do cronograma não estão neste modelo.</p>';
    h += '<p style="font-size:11px;color:#8fa3b8">As cores seguem o cronograma de quem enviou: âmbar = em execução, roxo = no caminho crítico, vermelho = atrasado; sem cor = pronto.</p>';
    return h;
  }
  function ligar4D() { st.em4d = true; aplicar4D(); }
  function aplicar4D() {
    var s = st.simCel; if (!s || !global.BIM4DSim) return;
    var M = global.BIM4DSim, d = s.eixo.dias[Math.max(0, Math.min(s.eixo.dias.length - 1, st.dia4d))].data;
    var est = M.estadoEm(s, d), cena = M.cena(s, est, st.op4d);
    st.est4d = est;
    B().aplicar4DSim({ ocultos: cena.ocultos, pinturas: cena.pinturas });
    var f = $("rvv-folha"); if (!f) return;
    var q = function (a) { return f.querySelector('[data-a="' + a + '"]'); };
    if (q("4d-data")) q("4d-data").textContent = est.br || d;
    if (q("4d-dia")) q("4d-dia").textContent = (est.diaSemana || "") + (est.motivoNaoUtil ? " · " + est.motivoNaoUtil : "");
    if (q("4d-leg")) q("4d-leg").innerHTML = (cena.legenda || []).map(function (l) {
      return '<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;background:' + (l.cor || "#e5e7eb") + '"></span>' + esc(l.rotulo) + ': <b>' + l.n + '</b>';
    }).join("<br>") + (est.marcos && est.marcos.length ? '<br>' + est.marcos.map(function (m) { return (m.atingido ? "✓ " : "◇ ") + esc(m.nome); }).join(" · ") : "");
  }
  function sair4D() {
    st.em4d = false; if (st.play) { clearInterval(st.play); st.play = 0; }
    if (B().mostrarTudo) B().mostrarTudo();
  }
  function diaHoje() {
    var s = st.simCel; if (!s) return 0;
    var hoje = new Date(), h = hoje.getFullYear() + "-" + ("0" + (hoje.getMonth() + 1)).slice(-2) + "-" + ("0" + hoje.getDate()).slice(-2);
    var i = s.eixo.idx && s.eixo.idx[h]; if (i != null) return i;
    return h < s.eixo.dias[0].data ? 0 : s.eixo.dias.length - 1;
  }

  // ---- Apontamentos ----
  function folhaNotas() {
    var h = cabecalho(I("nota", 17) + " Apontamentos de campo");
    h += '<button class="rvv-bt pri" data-a="nota-nova" style="width:100%;justify-content:center;padding:11px">' + I("mais", 16) + ' Novo apontamento (toque no modelo)</button>';
    h += '<p style="font-size:11.5px;color:#8fa3b8;margin:8px 0">Quem tem este link vê os apontamentos. Eles vão para a obra de quem enviou.</p>';
    h += '<div data-a="notas-lista"><p style="font-size:12.5px;color:#9fb2c8">Carregando…</p></div>';
    return h;
  }
  function carregarNotas(soPinos) {
    var tk = st.token;
    return Promise.all([buscarJson("/rv/notas/" + tk, "/rv/notas/" + tk).catch(function () { return null; }), filaLer(tk)]).then(function (rs) {
      if (!st || st.token !== tk) return;
      var j = rs[0];
      if (j) st.notas = j.notas || [];
      st._notasOffline = !j || !!j._offline;
      /* o que JÁ está no servidor sai da fila (a resposta se perdeu, mas chegou) */
      var noServ = {}; (st.notas || []).forEach(function (n) { if (n.cid) noServ[n.cid] = 1; });
      st.fila = (rs[1] || []).filter(function (it) { if (noServ[it.nota.cid]) { filaTirar(tk, it.nota.cid); return false; } return true; });
      pintarFila();
      if (!soPinos) listarNotas(st._notasOffline);
    });
  }
  function desenharPinos() {
    var tipos = { problema: 0xdc2626, duvida: 0x2563eb, obs: 0xf59e0b };
    B().pinos((st.notas || []).map(function (n, i) {
      return { id: n.id, p: n.ponto, rotulo: String(i + 1), cor: tipos[n.tipo] || 0xf59e0b };
    }).concat((st.fila || []).map(function (it) {
      /* o que espera sinal: cinza com reticências (vermelho se foi recusado) */
      return { id: "fila-" + it.nota.cid, p: it.nota.ponto, rotulo: "…", cor: it.erro ? 0xdc2626 : 0x64748b };
    })));
  }
  function listarNotas(offline) {
    var box = document.querySelector('#rvv-folha [data-a="notas-lista"]'); if (!box) return;
    var ns = st.notas || [], fl = st.fila || [];
    var h = offline ? '<p style="font-size:11.5px;color:#f0b94a">Sem internet: mostrando o que este aparelho guardou.</p>' : "";
    var pend = fl.filter(function (x) { return !x.erro; }).length;
    if (pend) h += '<div class="rvv-fila" data-a="fila-aviso"><b>' + pend + (pend === 1 ? ' apontamento guardado' : ' apontamentos guardados') + ' neste aparelho</b> — ' + (pend === 1 ? 'vai' : 'vão') + ' sozinho' + (pend === 1 ? '' : 's') + ' quando o sinal voltar, com este link aberto. ' +
      '<button class="rvv-bt" data-a="fila-enviar" style="margin-top:6px">' + I("ciclo", 14) + ' Tentar agora</button></div>';
    fl.forEach(function (it) {
      var n = it.nota;
      h += '<div class="rvv-lin" data-a="fila-ir" data-cid="' + esc(n.cid) + '"><b style="width:28px;text-align:center">' + I(it.erro ? "alerta" : "relogio", 18) + '</b>' +
        '<div style="min-width:0"><b>' + esc(RV().rotuloTipo(n.tipo)) + '</b> — ' + esc(n.texto) +
        '<small' + (it.erro ? ' style="color:#fca5a5"' : '') + '>' + (it.erro ? 'Não enviado: ' + esc(it.erro) : 'Esperando sinal · guardado ' + esc(RV().tempoRelativo(it.guardado))) + (n.foto ? ' · com foto' : '') + '</small>' +
        (it.erro ? '<button class="rvv-bt" data-a="fila-descartar" data-cid="' + esc(n.cid) + '" style="margin-top:6px">' + I("lixeira", 14) + ' Descartar</button>' : '') + '</div></div>';
    });
    if (!ns.length && !fl.length) h += '<p style="font-size:12.5px;color:#9fb2c8">Nenhum apontamento ainda.</p>';
    ns.forEach(function (n, i) {
      h += '<div class="rvv-lin" data-a="nota-ir" data-i="' + i + '">' +
        (n.foto ? '<img class="rvv-nota-foto" alt="" src="/rv/nf/' + esc(st.token) + '/' + esc(n.id) + '">' : '<b style="width:28px;text-align:center">' + (i + 1) + '</b>') +
        '<div style="min-width:0"><b>' + (i + 1) + '. ' + esc(RV().rotuloTipo(n.tipo)) + '</b> — ' + esc(n.texto) +
        '<small>' + esc(n.autor) + ' · ' + esc(RV().tempoRelativo(n.criado)) + (n.elemento ? ' · ' + esc(n.elemento) : '') + '</small></div></div>';
    });
    box.innerHTML = h;
  }
  function comecarApontar() {
    /* ⚠ com a trena ligada o toque vira PONTO DE MEDIDA e o apontamento nunca
       recebia o toque — a pessoa tocava no modelo e nada acontecia */
    if (st.medindo) ligarMedir(false);
    st.apontando = true;
    var f = $("rvv-folha"); if (f) f.style.display = "none";
    recado("Toque no ponto do modelo onde fica o apontamento.", false);
    B().aoTocar(function (pt) {
      if (!st.apontando) return;
      if (!pt) { recado("Toque em cima de uma peça do modelo.", true); comecarApontar(); return; }
      formNota(pt);
    });
  }
  function cancelarApontar() { st.apontando = false; if (B().aoTocar) B().aoTocar(null); }
  function formNota(pt) {
    st.apontando = false; recado("");
    var g = guest();
    var f = $("rvv-folha"); f.style.display = "block"; st.folha = "notas"; marcarBarra();
    var tipos = RV().TIPOS_NOTA.map(function (t, i) { return '<button class="rvv-chip' + (i === 0 ? ' on' : '') + '" data-a="nota-tipo" data-k="' + t.id + '">' + esc(t.rotulo) + '</button>'; }).join("");
    f.innerHTML = cabecalho(I("nota", 17) + " Novo apontamento") +
      (pt.nome ? '<div style="font-size:12.5px;color:#9fb2c8;margin-bottom:6px">Em: <b>' + esc(pt.nome) + '</b></div>' : '') +
      '<div class="rvv-chips">' + tipos + '</div>' +
      '<textarea class="rvv-inp" data-a="nota-texto" rows="3" maxlength="1000" placeholder="O que você viu? (ex.: fissura na viga, cano passando aqui)"></textarea>' +
      '<div class="rvv-rot">Foto (opcional)</div>' +
      '<label class="rvv-bt" style="justify-content:center;padding:10px 14px">' + I("camera", 16) + ' <span data-a="nota-foto-rot">Tirar ou escolher foto</span>' +
      '<input type="file" accept="image/*" capture="environment" data-a="nota-foto" style="display:none"></label>' +
      '<img data-a="nota-foto-prev" alt="" style="display:none;max-height:90px;border-radius:8px;margin-top:8px">' +
      '<div class="rvv-rot">Seu nome</div><input class="rvv-inp" data-a="nota-autor" maxlength="60" value="' + esc(g.nome || "") + '" placeholder="Como quem enviou vai te identificar">' +
      /* quem aponta não tem o OrçaPRO e não aceitou termo nenhum: diz na hora
         para onde vão o nome e a foto, e onde ler a regra (Política, 4.3) */
      '<div style="font-size:11px;color:#8fa3b8;margin-top:8px;line-height:1.4">O texto, a foto e o seu nome ficam com quem enviou o link e com quem tem o link, e são apagados quando o link vence. <a href="documentos/POLITICA-DE-PRIVACIDADE.txt" target="_blank" rel="noopener" style="color:#7dd3fc">Política de privacidade</a></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="rvv-bt pri" data-a="nota-enviar" style="flex:1;justify-content:center;padding:11px">' + I("enviar", 16) + ' Enviar</button><button class="rvv-bt" data-a="fechar-folha">Cancelar</button></div>';
    st.notaPt = pt; st.notaTipo = "obs"; st.notaCid = "";
    B().pinos((st.notas || []).map(function (n, i) { return { id: n.id, p: n.ponto, rotulo: String(i + 1) }; }).concat([{ id: "novo", p: pt.p, rotulo: "novo", cor: 0x22c55e }]));
  }
  /* foto do celular vira JPEG ≤ 1280 px e ≤ 700 KB antes de sair do aparelho */
  function comprimirFoto(arq) {
    return new Promise(function (ok, falha) {
      if (!arq) return ok("");
      var fr = new FileReader();
      fr.onerror = function () { falha(new Error("não consegui ler a foto")); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { falha(new Error("a foto não abriu")); };
        im.onload = function () {
          var mx = 1280, r = Math.min(1, mx / Math.max(im.width, im.height)), cv = document.createElement("canvas");
          cv.width = Math.round(im.width * r); cv.height = Math.round(im.height * r);
          cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
          var q = 0.72, d = cv.toDataURL("image/jpeg", q);
          while (d.length * 0.75 > RV().MAX_FOTO && q > 0.3) { q -= 0.12; d = cv.toDataURL("image/jpeg", q); }
          if (d.length * 0.75 > RV().MAX_FOTO) { cv.width = Math.round(cv.width / 2); cv.height = Math.round(cv.height / 2); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); d = cv.toDataURL("image/jpeg", 0.6); }
          ok(d);
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(arq);
    });
  }
  function enviarNota() {
    var f = $("rvv-folha"), q = function (a) { return f.querySelector('[data-a="' + a + '"]'); };
    var texto = q("nota-texto").value, autor = q("nota-autor").value, arq = q("nota-foto").files && q("nota-foto").files[0];
    var bt = q("nota-enviar"); bt.disabled = true; bt.textContent = "Enviando…";
    var tk = st.token, nota = null;
    comprimirFoto(arq).then(function (foto) {
      var pt = st.notaPt;
      if (!st.notaCid) st.notaCid = novoCid();
      nota = { texto: texto, autor: autor, tipo: st.notaTipo, ponto: pt.p, elemento: pt.nome || "",
        /* a chave vai no formato do COMPUTADOR — é lá que o apontamento vira ponto de vista */
        chave: pt.chave ? RV().traduzir(pt.chave, st.inverso) : "", foto: foto, cid: st.notaCid };
      var erro = RV().validarNota(nota);
      if (erro) throw new Error(erro);
      guest({ nome: String(autor).trim() });
      return postarNota(tk, nota);
    }).then(function (r) {
      /* ⚠ A FOLHA ANTES DO RECADO: abrirFolha começa com recado("") — na
         ordem antiga o "Apontamento enviado" era apagado no mesmo instante e
         a pessoa nunca via a confirmação */
      if (r.ok) {
        st.notaCid = "";
        abrirFolha("notas");
        recado("Apontamento enviado. Quem compartilhou o projeto vai ver na obra.", false);
        return;
      }
      if (!r.temporario) throw new Error(r.erro);
      var item = { nota: nota, guardado: Date.now() };
      return filaGravar(tk, item).then(function () {
        st.notaCid = "";
        /* na memória JÁ, não quando a lista do servidor voltar: sem sinal essa
           volta demora (cai no cache), e até lá o selo e a lista diziam 0 */
        st.fila = (st.fila || []).filter(function (x) { return x.nota.cid !== nota.cid; }).concat([item]);
        pintarFila();
        abrirFolha("notas");
        recado(r.rede ? "Sem sinal: o apontamento ficou guardado neste aparelho e vai sozinho quando a internet voltar, com este link aberto."
          : "Não deu para confirmar o envio (" + r.erro + "): o apontamento ficou guardado neste aparelho e vai sozinho na próxima tentativa.", false);
        _filaEspera = 15000; agendarFila(_filaEspera);
      }, function () {
        throw new Error("Sem sinal agora, e este navegador não deixou guardar o apontamento no aparelho. Tente de novo quando tiver sinal (o texto continua aqui).");
      });
    }).catch(function (e) {
      bt.disabled = false; bt.innerHTML = I("enviar", 16) + " Enviar";
      recado(e.message, true);
    });
  }
  function guest(novo) {
    var g = {}; try { g = JSON.parse(localStorage.getItem("orcapro:rv:guest") || "{}"); } catch (e) {}
    if (novo) { for (var k in novo) if (novo[k]) g[k] = novo[k]; try { localStorage.setItem("orcapro:rv:guest", JSON.stringify(g)); } catch (e) {} }
    return g;
  }

  // ---- Mais ----
  function folhaMais() {
    var h = cabecalho(I("mais", 17) + " Mais");
    h += '<div class="rvv-lin" data-a="enquadrar"><span>' + I("alvo", 18) + '</span><div><b>Enquadrar o projeto</b></div></div>';
    h += '<div class="rvv-lin" data-a="reuniao"><span>' + I("pessoas", 18) + '</span><div><b>Reunião no modelo</b><small>Todos com este link se veem dentro do projeto</small></div></div>';
    var m = st.man || {};
    h += '<div class="rvv-rot">Sobre este link</div><div style="font-size:12.5px;line-height:1.5;color:#cbd8e6">' +
      (st.dados && st.dados.marca && st.dados.marca.empresa ? 'Enviado por <b>' + esc(st.dados.marca.empresa) + '</b><br>' : '') +
      (m.expira ? 'Vale até ' + new Date(m.expira).toLocaleDateString("pt-BR") + ' às ' + new Date(m.expira).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + '<br>' : '') +
      (st.guardado ? I("check", 13) + ' Guardado neste aparelho: abre sem internet até vencer.' : 'Ainda não guardado neste aparelho para uso sem internet.') +
      '<br><a href="documentos/POLITICA-DE-PRIVACIDADE.txt" target="_blank" rel="noopener" style="color:#7dd3fc">Política de privacidade</a></div>';
    return h;
  }

  /* ---------------- ficha da peça (toque) ---------------- */
  function fecharCard() { var c = $("rvv-card"); if (c) { c.style.display = "none"; c.innerHTML = ""; } }
  function aoTocarPeca(p) {
    if (st.apontando) return;
    recado("");
    if (!p) { fecharCard(); return; }
    fecharFolha();
    var el = null, els = B().elementos || [];
    for (var i = 0; i < els.length; i++) if (els[i].uid === p.uid) { el = els[i]; break; }
    var q = (el && el.qto) || p.qto || {};
    var linhas = [];
    function ln(r, v) { if (v != null && v !== "") linhas.push('<tr><td>' + r + '</td><td>' + esc(v) + '</td></tr>'); }
    ln("Tipo", (el && el.nome) || p.tipo);
    var titulo = (el && (el.familia || el.nome)) || p.nome || "";
    if (((el && el.familia) || p.familia) !== titulo) ln("Família", (el && el.familia) || p.familia);
    ln("Disciplina", el && el.disciplina ? el.disciplina.charAt(0).toUpperCase() + el.disciplina.slice(1) : "");
    ln("Pavimento", el && el.pavimento);
    ln("Etapa", (el && el.etapa) || p.etapa);
    ln("Fase", (el && el.fase) || p.fase);
    if (q.comprimento > 0) ln("Comprimento", q.comprimento.toFixed(2).replace(".", ",") + " m");
    if (q.area > 0) ln("Área", q.area.toFixed(2).replace(".", ",") + " m²");
    if (q.volume > 0) ln("Volume", q.volume.toFixed(3).replace(".", ",") + " m³");
    if (st.em4d && st.est4d && st.simCel) {
      var ae = null; (st.simCel.elementos || []).forEach(function (x) { if (x.id === p.uid) ae = x; });
      var at = ae && ae.atv != null && st.simCel.porId[ae.atv] != null ? st.simCel.atividades[st.simCel.porId[ae.atv]] : null;
      if (at) { var s4 = st.est4d.porAtv[at.id]; ln("Cronograma", at.nome + " · " + (global.BIM4DSim.ROTULO[s4 && s4.estado] || (s4 && s4.estado) || "") + " (" + global.BIM4DSim.br(at.inicio) + " a " + global.BIM4DSim.br(at.termino) + ")"); }
    }
    st.pecaTocada = { p: p, el: el };
    var c = $("rvv-card");
    c.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:6px"><b style="font-size:14px">' + esc((el && (el.familia || el.nome)) || p.nome || "Peça") + '</b>' +
      '<button class="rvv-bt" data-a="card-fechar">' + I("fechar", 14) + '</button></div>' +
      '<table>' + linhas.join("") + '</table>' +
      (st.man && st.man.aceitaNotas ? '<div style="margin-top:8px"><button class="rvv-bt pri" data-a="card-apontar">' + I("nota", 14) + ' Apontar nesta peça</button></div>' : '');
    c.style.display = "block";
  }

  /* ---------------- RA do Android (Scene Viewer) ----------------
     ⚠ DOIS TOQUES DE PROPÓSITO. O Chrome do Android só deixa abrir outro
     app (o do Google) de dentro de um toque do usuário; montar o .glb e
     subir leva segundos, e a navegação no fim disso seria bloqueada em
     silêncio. Então: 1º toque monta e sobe; o botão vira "Abrir"; o 2º
     toque abre. */
  function sceneViewer(modo, btn) {
    if (btn && btn.getAttribute("data-url")) { location.href = btn.getAttribute("data-url"); return; }
    var rot = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = "Preparando o modelo para o app do Google…"; }
    setTimeout(function () {
      var r = B().arquivoRA("glb", modo);
      if (!r || !r.ok) {
        if (btn) { btn.disabled = false; btn.innerHTML = rot; }
        recado(r && r.erro === "grande" ? "Este modelo tem " + Math.round(r.tri / 1000) + " mil triângulos visíveis; a RA aguenta até " + Math.round(r.limite / 1000) + " mil. Desligue disciplinas e tente de novo." : "Não consegui montar o modelo para a RA: " + (r && r.erro), true);
        return;
      }
      var b = r.bytes, amostra = [b.length, modo];
      for (var i = 0; i < b.length; i += 997) amostra.push(b[i]);
      var h = RV().hashCurto(amostra.join(","));
      fetch("/rv/glb/" + st.token + "?h=" + h, { method: "POST", headers: { "Content-Type": "model/gltf-binary" }, body: b })
        .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.erro || "falha no envio"); return j; }); })
        .then(function (j) {
          var arq = location.origin + j.url, titulo = (st.dados && st.dados.marca && st.dados.marca.obra) || st.man.nome || "Projeto";
          var url = "intent://arvr.google.com/scene-viewer/1.0?file=" + encodeURIComponent(arq) + "&mode=ar_preferred&title=" + encodeURIComponent(titulo) +
            /* tamanho real nunca muda de escala; a maquete, só com a trava da RA desligada */
            (modo === "real" || (B().raTravada && B().raTravada()) ? "&resizable=false" : "") +
            "#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=" + encodeURIComponent(location.href) + ";end;";
          st.ultimoIntent = url;
          if (btn) { btn.disabled = false; btn.setAttribute("data-url", url); btn.innerHTML = I("avancar", 15) + " Abrir na RA do Google"; btn.classList.add("azul"); }
        })
        .catch(function (e) { if (btn) { btn.disabled = false; btn.innerHTML = rot; } recado(/fetch|Network|Load failed/i.test(e.message) ? "Sem internet: a RA do Android precisa enviar o modelo ao app do Google." : e.message, true); });
    }, 40);
  }

  /* ---------------- cliques da folha e do cartão ---------------- */
  function ligarCliques() {
    document.getElementById("rvfull").addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return;
      var a = b.getAttribute("data-a");
      if (a === "fechar-folha") return fecharFolha();
      if (a === "trava") { if (B().travar) B().travar(); pintarTrava(); recado(B().travado && B().travado() ? "Câmera travada: encostar a mão não gira nem dá zoom. Toque no cadeado para destravar." : "Câmera livre.", false); return; }
      if (a === "vista-inicio") { if (B().home) B().home(); return fecharFolha(); }
      if (a === "vista") return irVista(+b.getAttribute("data-i"));
      if (a === "disc") { var k = b.getAttribute("data-k"), liga = !b.classList.contains("on"); B().disciplinaVisivel(k, liga); b.classList.toggle("on", liga); return; }
      if (a === "pav") { var nm = b.getAttribute("data-k"); if (nm) B().isolarPavimento(nm); else B().restaurarVisibilidade(); return abrirFolha("camadas"); }
      if (a === "tudo") {
        (B().disciplinas() || []).forEach(function (d) { B().disciplinaVisivel(d.chave, true); });
        B().restaurarVisibilidade(); B().tetoVisitante(null); st.corte = 100; if (st.em4d) sair4D();
        return abrirFolha("camadas");
      }
      if (a === "4d-play") {
        if (st.play) { clearInterval(st.play); st.play = 0; b.innerHTML = I("avancar", 15) + " Animar"; return; }
        b.textContent = "Pausar";
        st.play = setInterval(function () {
          var s = st.simCel; if (!s) return;
          do { st.dia4d++; } while (st.dia4d < s.eixo.dias.length - 1 && !s.eixo.dias[st.dia4d].util);
          if (st.dia4d >= s.eixo.dias.length - 1) { st.dia4d = s.eixo.dias.length - 1; clearInterval(st.play); st.play = 0; }
          var sl = document.querySelector('#rvv-folha [data-a="4d-slider"]'); if (sl) sl.value = st.dia4d;
          aplicar4D();
        }, 260);
        return;
      }
      if (a === "4d-hoje") { st.dia4d = diaHoje(); var sl2 = document.querySelector('#rvv-folha [data-a="4d-slider"]'); if (sl2) sl2.value = st.dia4d; return aplicar4D(); }
      if (a === "4d-fantasma") { st.op4d.futuro = st.op4d.futuro === "fantasma" ? "oculto" : "fantasma"; b.classList.toggle("on", st.op4d.futuro === "fantasma"); return aplicar4D(); }
      if (a === "4d-sair") { sair4D(); return fecharFolha(); }
      if (a === "nota-nova") return comecarApontar();
      if (a === "nota-ir") { var n = st.notas[+b.getAttribute("data-i")]; if (n) { fecharFolha(); B().olharPara(n.ponto, 5); recado((+b.getAttribute("data-i") + 1) + ". " + n.texto, false); } return; }
      if (a === "nota-tipo") { st.notaTipo = b.getAttribute("data-k"); var cs = b.parentNode.querySelectorAll(".rvv-chip"); for (var i = 0; i < cs.length; i++) cs[i].classList.toggle("on", cs[i] === b); return; }
      if (a === "nota-enviar") return enviarNota();
      if (a === "fila-enviar") {
        _filaEspera = 15000; b.disabled = true;
        /* só diz "sem sinal" se ainda há o que mandar — a recusa tem recado próprio, que não pode ser coberto */
        enviarFila().then(function (n) { if (n === 0 && (st.fila || []).some(function (x) { return !x.erro; })) recado("Ainda sem sinal — continua guardado e vai sozinho depois.", false); });
        return;
      }
      if (a === "fila-descartar") {
        var cidD = b.getAttribute("data-cid");
        if (!global.confirm("Descartar este apontamento? Ele NÃO foi enviado e some deste aparelho.")) return;
        return filaTirar(st.token, cidD).then(function () { return carregarNotas(false); });
      }
      if (a === "fila-ir") { var itF = (st.fila || []).filter(function (x) { return x.nota.cid === b.getAttribute("data-cid"); })[0]; if (itF) { fecharFolha(); B().olharPara(itF.nota.ponto, 5); recado("Esperando sinal: " + itF.nota.texto, false); } return; }
      if (a === "trena-desfazer") { if (B().desfazerMedida) B().desfazerMedida(); return pintarTrena(); }
      if (a === "trena-limpar") { if (B().limparMedidas) B().limparMedidas(); return pintarTrena(); }
      if (a === "trena-parar") return ligarMedir(false);
      if (a === "enquadrar") { if (B().home) B().home(); return fecharFolha(); }
      if (a === "reuniao") { fecharFolha(); var rb = $("rv-reun"); if (rb) rb.click(); return; }
      if (a === "card-fechar") return fecharCard();
      if (a === "card-apontar") {
        var pc = st.pecaTocada; fecharCard(); if (!pc || !pc.el || !pc.el.aabb) return comecarApontar();
        var mn = pc.el.aabb.min, mx = pc.el.aabb.max;
        return formNota({ p: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], chave: pc.el.chave || "", nome: pc.el.familia || pc.el.nome || "" });
      }
    });
    document.getElementById("rvfull").addEventListener("change", function (e) {
      if (!e.target.getAttribute || e.target.getAttribute("data-a") !== "nota-foto") return;
      var arq = e.target.files && e.target.files[0], f = $("rvv-folha");
      var prev = f && f.querySelector('[data-a="nota-foto-prev"]'), rot = f && f.querySelector('[data-a="nota-foto-rot"]');
      if (!arq || !prev) return;
      try { prev.src = URL.createObjectURL(arq); prev.style.display = "block"; } catch (e2) {}
      if (rot) rot.textContent = "Trocar a foto";
    });
    document.getElementById("rvfull").addEventListener("input", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "corte") {
        st.corte = +e.target.value; B().tetoVisitante(st.corte >= 100 ? null : st.corte / 100);
        var v = document.querySelector('#rvv-folha [data-a="corte-v"]'); if (v) v.textContent = st.corte >= 100 ? "inteiro" : st.corte + "%";
      }
      if (a === "4d-slider") { st.dia4d = +e.target.value; aplicar4D(); }
    });
  }

  /* ---------------- imersivo: a barra sai da frente ---------------- */
  function vigiarImersivo() {
    setInterval(function () {
      var on = !!(B() && B().imersivoAtivo && B().imersivoAtivo());
      var br = $("rvv-barra"), tp = $("rvv-topo");
      if (br) br.style.display = on ? "none" : "flex";
      if (tp) tp.style.display = on ? "none" : "flex";
      if (on && st.medindo) ligarMedir(false);
      if (on && st.folha) fecharFolha();
    }, 500);
  }

  /* ---------------- depois que os modelos abriram ---------------- */
  function aposCarga() {
    var l = $("rv-load"); if (l) l.remove();
    var rb = $("rv-reun"); if (rb) rb.style.display = "inline-flex";
    var mods = (B().modelos || []).map(function (m) { return { arquivoId: m.arquivoId, modeloId: m.modeloId }; });
    if (st.dadosBrutos) {
      var tr = RV().traduzirDados(st.dadosBrutos, mods);
      st.dados = tr.dados; st.mapa = tr.mapa; st.inverso = RV().inverter(tr.mapa);
      if (st.dados.crono) {
        var porChave = {};
        (B().elementos || []).forEach(function (e) { if (e.chave) porChave[e.chave] = e.uid; });
        st.simCel = RV().cronoNoCelular(st.dados.crono, function (ch) { return porChave[ch] || ""; });
        if (st.simCel && st.simCel.eixo && st.simCel.eixo.dias.length) {
          st.dia4d = diaHoje();
          var b4 = document.querySelector('#rvv-barra [data-f="4d"]'); if (b4) b4.hidden = false;
        }
      }
    } else { st.dados = {}; st.inverso = {}; }
    recado("Toque numa peça para ver o que ela é. RA/RV mostra o projeto no seu ambiente.", false);
    carregarNotas(true).then(function () { if ((st.fila || []).some(function (x) { return !x.erro; })) enviarFila(); });
  }

  /* ---------------- ABRIR ---------------- */
  var RvVisor = {
    abrir: function (token, app) {
      st = { token: token, man: null, dados: null, dadosBrutos: null, mapa: {}, inverso: {}, simCel: null, notas: [], fila: [], notaCid: "", folha: "", est4d: null,
        op4d: { futuro: "oculto" }, dia4d: 0, em4d: false, play: 0, corte: 100, apontando: false, medindo: false, guardado: false };
      app = app || global.App || {};
      document.title = "Projeto 3D";
      montarTela();
      ligarCliques();
      /* a SALA da reunião é derivada do próprio token do link: todos que abrem
         o mesmo link/QR caem na mesma sala e se veem (avatares). O token vem de
         crypto (18 hex) → sala não-adivinhável. */
      var sala = "nuvem-" + String(token).slice(0, 18);
      if (app._rvReuniao) app._rvReuniao(sala);
      limparVencidos();
      if (!global.__rvFilaOnline) {   /* um só ouvinte, mesmo que o visor reabra */
        global.__rvFilaOnline = 1;
        global.addEventListener("online", function () { _filaEspera = 15000; if (st && st.fila && st.fila.length) enviarFila(); });
      }
      var t0 = 0, espera = setInterval(function () {
        t0++;
        if (!(global.BIM && global.BIM.montar && global.RvNuvem)) { if (t0 > 100) { clearInterval(espera); erroCarga("O visualizador não carregou. Recarregue a página."); } return; }
        clearInterval(espera);
        try {
          global.BIM.montar(document.getElementById("bim-canvas"), {
            visitante: true, topoReservado: TOPO, baseReservada: BASE, eixoBase: BASE + 8 + TRENA_H + 8,
            onPick: aoTocarPeca,
            onSceneViewer: sceneViewer,
            onReuniao: function (n) { if (app._rvReunBadge) app._rvReunBadge(n); },
            onReuniaoFalha: function () { if (app._rvReunBadge) app._rvReunBadge(0); recado("A reunião caiu (sem internet?). O modelo segue normal — toque em Reunião para reconectar.", true); },
            onReuniaoCheia: function () { if (app._rvReunBadge) app._rvReunBadge(0); recado("Sala cheia — o limite é de 20 pessoas nesta reunião.", true); },
            onVoz: function (on) { if (app._rvAudioBadge) app._rvAudioBadge(on); },
            onFala: function (falando) { var b = $("rv-audio"); if (b && global.BIM.reuniao.audioAtiva) b.style.boxShadow = falando ? "0 0 0 3px rgba(22,163,74,.9)" : "none"; },
            onVozErro: function (nm) { if (app._rvAudioBadge) app._rvAudioBadge(false); recado(nm === "NotAllowedError" ? "Você negou o microfone. Toque em Áudio de novo e permita." : "Não consegui abrir o microfone: " + nm, true); }
          });
        } catch (e) { erroCarga("Falha ao iniciar o visualizador."); return; }
        vigiarImersivo();
        setInterval(pintarTrava, 700);   /* a trava também se desfaz pelo aviso do 3D */
        setInterval(pintarTrena, 300);
        buscarJson("/rv/t/" + token, "/rv/t/" + token).then(function (man) {
          if (!man.ok) throw new Error(man.erro || "link inválido");
          st.man = man;
          /* ⚠ LINK DE APP ANTIGO NÃO RECEBE APONTAMENTO: o dono não tem como
             trazê-lo para a obra, e "quem compartilhou vai ver" seria mentira
             (o servidor recusa do mesmo jeito, com 403) */
          var bN = document.querySelector('#rvv-barra [data-f="notas"]'); if (bN) bN.hidden = !man.aceitaNotas;
          if (man._offline) recado("Sem internet: abrindo o que este aparelho guardou.", false);
          var pDados = man.temDados ? buscarJson("/rv/d/" + token, "/rv/d/" + token).catch(function () { return null; }) : Promise.resolve(null);
          return pDados.then(function (d) {
            st.dadosBrutos = d;
            aplicarMarca((d && d.marca) || { obra: man.nome });
            var arqs = man.arquivos || [], i = 0;
            return new Promise(function (fim, falha) {
              (function prox() {
                if (i >= arqs.length) return fim();
                var a = arqs[i], antes = (global.BIM.modelos || []).length;
                txtCarga("Baixando " + (a.nome || "modelo") + " (" + (i + 1) + "/" + arqs.length + ")…");
                buscarBytes("/rv/f/" + a.id).then(function (ab) {
                  txtCarga("Montando " + (a.nome || "modelo") + " (" + (i + 1) + "/" + arqs.length + ")…");
                  global.BIM.abrirBytes(ab, a.nome, a.disc);
                  /* espera ESTE modelo entrar na cena antes do próximo (a fila do
                     viewer é serial, mas a tradução das chaves precisa de todos) */
                  var k = 0, iv = setInterval(function () {
                    k++;
                    if ((global.BIM.modelos || []).length > antes || k > 240) { clearInterval(iv); i++; prox(); }
                  }, 250);
                }).catch(falha);
              })();
            });
          }).then(function () {
            aposCarga();
            indiceCache(function (ix) { ix[token] = { expira: man.expira, ids: (man.arquivos || []).map(function (a) { return a.id; }) }; return ix; }).then(function () { st.guardado = true; });
          });
        }).catch(function (e) {
          if (e && e.expirado) {
            /* ⚠ o que esperava sinal não tem mais para onde ir: diz QUANTOS se
               perderam, em vez de sumir com eles calado */
            filaLer(token).then(function (fl) {
              esquecerLink(token); filaApagarLink(token);
              erroCarga("Este link venceu ou foi revogado. Peça um novo a quem enviou." +
                (fl.length ? " " + (fl.length === 1 ? "1 apontamento feito sem sinal neste aparelho não chegou" : fl.length + " apontamentos feitos sem sinal neste aparelho não chegaram") + " a ser enviado" + (fl.length === 1 ? "" : "s") + " — avise quem enviou o link." : ""));
            });
          }
          else if (e && /offline/.test(e.message)) erroCarga("Sem internet, e este link ainda não foi aberto neste aparelho. Abra uma vez com internet para ele ficar guardado.");
          else erroCarga("Não deu pra abrir o projeto: " + ((e && e.message) || e));
        });
      }, 100);
    },
    /* para as e2e e para depurar no celular */
    _estado: function () { return st; },
    _filaAgendada: function () { return !!_filaT; }
  };

  global.RvVisor = RvVisor;
  if (typeof module !== "undefined" && module.exports) module.exports = RvVisor;
})(typeof window !== "undefined" ? window : this);
