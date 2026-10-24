/* =====================================================================
 * pranchavivaui.js — a TELA da PRANCHA VIVA (fiação fina; a conta é o js/pranchaviva.js)
 *
 * Pedido do Rogério (21/10/2026): "onde encontro no sistema?" — a demonstração do site virou comando do app.
 *   Onde fica: BIM › aba Anotar › painel Documentar › "Prancha Viva"; no Navegador do projeto, Folhas › Prancha Viva;
 *   e o botão "Prancha Viva" no alto da tela Pranchas do projeto (e no painel das folhas).
 *
 * O QUE ELA FAZ (por cima do visualizador do BIM — o MESMO 3D, o mesmo modelo, o mesmo IFC pesado já aberto):
 *   1. as pranchas da obra (Store `bim_pranchas`, as mesmas da tela Pranchas do projeto) numa folha que se arrasta e
 *      aproxima; o que está LIGADO ao modelo aparece com o contorno azul;
 *   2. tocar num ponto: a matriz da própria vista (js/pranchaviva.js) dá o ponto do modelo; a câmera começa
 *      EXATAMENTE onde a folha está na tela (o desenho da vista vai junto, no plano dela) e o prédio "sai da folha":
 *      a fatia cresce do plano da prancha para dentro do modelo enquanto a câmera desce em perspectiva;
 *   3. no 3D: o corte na cota com a alça (e o controle deslizante), disciplinas, a trena do app, tocar na peça
 *      (nome, tipo, GUID, o item do orçamento e a etapa do cronograma ligados a ela), início, realidade aumentada;
 *   4. voltar: o ponto do 3D (a peça escolhida ou o centro da vista) volta para a folha no MESMO lugar.
 *   5. compartilhar: o link e o QR da obra (o caminho da RA/RV, js/gestao.js bimQRImersivo) levam as pranchas leves
 *      (`dados.pranchas`) — no celular do cliente a mesma tela abre pelo botão Pranchas do js/rvvisor.js.
 *
 * ⚠ A TRAVA É NA FUNÇÃO (js/pranchavivamodulo.js): `abrir`, `compartilhar`, `importar` e `ra` passam por `porta()`.
 *   Exceção: a folha que chegou pelo LINK do cliente (fonte "link") — a licença de quem gerou o link já foi conferida
 *   na hora de gerar, e o celular do cliente não tem licença nenhuma.
 * ⚠ A CENA É EMPRESTADA: entrando, guarda o estado inteiro (BIM.estadoVista); saindo, devolve (BIM.aplicarVista) —
 *   câmera, cortes, medidas, visibilidade. O corte da Prancha Viva usa o clippingPlanes do renderer, que o raycast da
 *   seleção e da trena já respeitam (o clique nunca pega peça cortada).
 * ⚠ DESEMPENHO: nada aqui percorre o modelo por quadro. O modelo grande (a creche: ~2 M de triângulos) já vem
 *   mesclado pelo visualizador; a Prancha Viva só mexe na câmera e nos planos. O desenho da vista vira UMA textura.
 * ES5. Sem DOM no carregamento (o teste carrega este arquivo no Node).
 * ===================================================================== */
(function (global) {
  "use strict";
  function PV() { return global.PranchaViva; }
  function MOD() { return global.PranchaVivaModulo; }
  function B() { return global.BIM || null; }
  function G() { return global.Gestao || null; }
  function arr(a) { return Object.prototype.toString.call(a) === "[object Array]" ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { var p = Math.pow(10, c == null ? 2 : c); return (Math.round(v * p) / p).toFixed(c == null ? 2 : c).replace(".", ","); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function toast(m, t) { try { if (global.UI && UI.toast) UI.toast(m, t || "info"); } catch (e) {} }
  function ico(n, px) { try { return global.Icones ? Icones.get(n, px || 16) : ""; } catch (e) { return ""; } }
  function agora() { return (global.performance && performance.now) ? performance.now() : Date.now(); }
  function raf(fn) { return (global.requestAnimationFrame || function (f) { return setTimeout(function () { f(agora()); }, 16); })(fn); }
  var MM_PX = 96 / 25.4;
  var FUNDO = "#eef2f6", ACO = "#2d6a9c";

  /* ---------------------------------------------------------------- estilo
     Claro por padrão (pedido de 20/10: "nada escuro"); o MODO ESCURO (23/10) é escolha da pessoa e fica guardado
     neste aparelho (orcapro:pviva:tema). No celular do cliente (fonte "link") o padrão é o escuro do visor.
     As cores moram em variáveis no .pviva-app: o escuro troca as variáveis, não regra por regra. */
  var CSS = [
    ".pviva-app{--pv-fundo:" + FUNDO + ";--pv-cartao:#ffffff;--pv-cartao2:#f8fafc;--pv-borda:#d9e1ea;--pv-texto:#1c2733;--pv-sub:#5b6875;--pv-aco:" + ACO + ";--pv-aco-claro:#e3eef8;--pv-hover:#f2f6fa;--pv-sombra:rgba(28,39,51,.16);" +
      "position:fixed;z-index:9000;display:flex;flex-direction:column;font:13px/1.35 Inter,Segoe UI,Arial,sans-serif;color:var(--pv-texto);pointer-events:none}",
    ".pviva-app.pviva-escuro{--pv-fundo:#0b1a2b;--pv-cartao:#12263b;--pv-cartao2:#0f2236;--pv-borda:#24435f;--pv-texto:#e3edf7;--pv-sub:#9fb2c8;--pv-aco:#5aa9e6;--pv-aco-claro:#173a5a;--pv-hover:#18324d;--pv-sombra:rgba(0,0,0,.5)}",
    /* ⚠ no celular do cliente o visor tem barras com z-index no teto (js/rvvisor.js #rvv-topo, #rv-load): a Prancha Viva
       aberta pelo link fica por cima delas — sem isto a folha abria ESCONDIDA atrás da tela de "Baixando o projeto" */
    ".pviva-app.pviva-link{z-index:2147483005}",
    ".pviva-app.pviva-com-recado .pviva-dica{visibility:hidden}",
    ".pviva-app *{box-sizing:border-box}",
    ".pviva-app [hidden]{display:none!important}",
    ".pviva-app button{font:inherit;cursor:pointer}",
    /* ⚠ a barra do alto NUNCA quebra linha: com o subtítulo do 3D (mais comprido) ela ia para duas linhas, a folha descia 42 px
       na volta e o ponto do 3D voltava fora do centro (e2e de 23/10/2026); no celular ela cobria o controle do corte */
    ".pviva-topo{pointer-events:auto;display:flex;align-items:center;gap:8px;padding:8px 12px;padding-top:calc(env(safe-area-inset-top,0px) + 8px);background:var(--pv-cartao);border-bottom:1px solid var(--pv-borda);min-height:48px;flex-wrap:nowrap;overflow:hidden}",
    ".pviva-topo>*{flex:0 0 auto}",
    ".pviva-topo .pviva-marca{display:flex;align-items:center;gap:6px;font-weight:700;color:var(--pv-aco)}",
    ".pviva-topo .pviva-tit{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw;flex:0 1 auto}",
    ".pviva-topo .pviva-sub{color:var(--pv-sub);font-size:12px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pviva-topo .pviva-esp{flex:1 1 0;min-width:0}",
    /* no celular do cliente a casca do visor sai da frente enquanto a Prancha Viva está aberta: a barra de baixo dele
       aparecia por trás da barra do 3D e o toque ali caía no visor */
    "body.pviva-aberta #rvv-barra,body.pviva-aberta #rvv-topo,body.pviva-aberta #rvv-card,body.pviva-aberta #rvv-recado,body.pviva-aberta #rvv-trena,body.pviva-aberta #rvv-folha{visibility:hidden!important}",
    ".pviva-bt{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--pv-borda);background:var(--pv-cartao);color:var(--pv-texto);border-radius:8px;padding:6px 10px;min-height:34px}",
    ".pviva-bt:hover{background:var(--pv-hover)}.pviva-bt:focus-visible{outline:2px solid var(--pv-aco);outline-offset:2px}",
    ".pviva-bt.prim{background:var(--pv-aco);border-color:var(--pv-aco);color:#fff}.pviva-bt.prim:hover{filter:brightness(.92)}",
    ".pviva-bt.ligado{background:var(--pv-aco-claro);border-color:var(--pv-aco);color:var(--pv-aco)}",
    ".pviva-bt[disabled]{opacity:.5;cursor:default}",
    ".pviva-corpo{flex:1;display:flex;min-height:0}",
    ".pviva-lista{pointer-events:auto;width:250px;flex:0 0 250px;background:var(--pv-cartao2);border-right:1px solid var(--pv-borda);overflow:auto;padding:8px}",
    ".pviva-lista h3{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--pv-sub);margin:10px 4px 4px}",
    ".pviva-folha-bt{display:block;width:100%;text-align:left;border:1px solid transparent;background:transparent;border-radius:8px;padding:7px 8px;margin:2px 0;color:var(--pv-texto)}",
    ".pviva-folha-bt:hover{background:var(--pv-hover)}.pviva-folha-bt[aria-current=true]{background:var(--pv-aco-claro);border-color:var(--pv-aco)}",
    ".pviva-folha-bt small{display:block;color:var(--pv-sub);font-size:11px}",
    ".pviva-folha-bt .pviva-lig{display:inline-block;margin-left:4px;font-size:10px;padding:1px 6px;border-radius:99px;background:#e1f1e7;color:#1d6b3a}",
    ".pviva-folha-bt .pviva-lig.nao{background:#f6ecd9;color:#7a4b00}",
    ".pviva-lista .pviva-acoes-modelo{margin:12px 4px 4px;display:flex;flex-direction:column;gap:6px}",
    ".pviva-lista .pviva-acoes-modelo .pviva-bt{width:100%;justify-content:center}",
    ".pviva-lista .pviva-nota{font-size:11.5px;color:var(--pv-sub)}",
    ".pviva-palco{pointer-events:auto;position:relative;flex:1;overflow:hidden;background:var(--pv-fundo);touch-action:none;cursor:grab;transition:opacity .25s;-webkit-user-select:none;user-select:none}",
    ".pviva-papel{position:absolute;left:0;top:0;transform-origin:0 0;background:#fff;box-shadow:0 2px 14px var(--pv-sombra)}",
    /* o escuro inverte a FOLHA (o traço fica claro no fundo escuro); os marcadores ficam fora do filtro */
    ".pviva-escuro .pviva-papel{filter:invert(.92) hue-rotate(180deg)}",
    ".pviva-ligarea{position:absolute;border:0.6mm dashed rgba(45,106,156,.55);border-radius:1mm;background:rgba(45,106,156,.04);pointer-events:none}",
    ".pviva-ligarea b{position:absolute;left:1mm;top:-6mm;font:bold 4mm Arial,sans-serif;color:" + ACO + ";background:#fff;padding:0 1.5mm;border-radius:1mm;white-space:nowrap}",
    ".pviva-amb{position:absolute;transform:translate(-50%,-50%);border:1px solid #b7cfe6;background:rgba(255,255,255,.92);color:#16324a;border-radius:99px;padding:2px 8px;font-size:11px;white-space:nowrap;pointer-events:auto}",
    ".pviva-amb:hover{background:#e3eef8}",
    /* os marcadores da peça: alvo de toque de 28 px (celular), o desenho do marcador menor dentro */
    ".pviva-mk{position:absolute;transform:translate(-50%,-50%);min-width:28px;height:28px;padding:0;border:0;background:transparent;pointer-events:auto;display:flex;align-items:center;justify-content:center}",
    ".pviva-mk i{display:flex;align-items:center;justify-content:center;font:700 10px/1 Inter,Arial,sans-serif;font-style:normal;color:#fff;background:" + ACO + ";border:2px solid #fff;border-radius:50%;width:20px;height:20px;box-shadow:0 1px 4px rgba(0,0,0,.35)}",
    ".pviva-mk.janela i{background:#3b8b6e}.pviva-mk.escada i,.pviva-mk.rampa i{background:#8a5bb5}",
    ".pviva-mk.comodo{height:auto;min-height:28px}",
    ".pviva-mk.comodo i{width:auto;height:auto;border-radius:99px;padding:3px 9px;background:rgba(255,255,255,.94);color:#16324a;border:1px solid #9fc0de;font-weight:600;font-size:11px;white-space:nowrap}",
    ".pviva-mk:hover i,.pviva-mk:focus-visible i{transform:scale(1.15);outline:none}",
    ".pviva-pulso{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid var(--pv-aco);pointer-events:none;animation:pvivapulso .8s ease-out forwards}",
    "@keyframes pvivapulso{from{transform:scale(.3);opacity:1}to{transform:scale(1.8);opacity:0}}",
    ".pviva-dica{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:99px;padding:6px 14px;color:var(--pv-texto);font-size:12.5px;pointer-events:none;max-width:92%;text-align:center;opacity:.96}",
    ".pviva-barra2d{position:absolute;right:12px;bottom:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:flex;gap:6px;pointer-events:auto}",
    ".pviva-vazio{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px}",
    ".pviva-vazio>div{max-width:540px;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:12px;padding:18px;line-height:1.5}",
    ".pviva-carga{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:99px;padding:6px 14px;font-size:12px;color:var(--pv-texto);pointer-events:none;max-width:92%;text-align:center}",
    /* o recado da própria Prancha Viva (no celular do cliente o toast do app não aparece por cima do visor) */
    ".pviva-recado{position:absolute;left:50%;top:52px;transform:translateX(-50%);max-width:min(560px,92%);background:var(--pv-cartao);border:1px solid var(--pv-borda);border-left:4px solid var(--pv-aco);border-radius:10px;padding:8px 12px;font-size:12.5px;line-height:1.4;color:var(--pv-texto);box-shadow:0 6px 18px var(--pv-sombra);pointer-events:auto;z-index:5}",
    ".pviva-recado.aviso{border-left-color:#d68a00}.pviva-recado.erro{border-left-color:#c0392b}",
    /* a faixa "o 3D ainda não chegou / não está aberto" — sempre com o que fazer */
    ".pviva-faixa{position:absolute;left:12px;right:12px;bottom:60px;bottom:calc(env(safe-area-inset-bottom,0px) + 60px);margin:0 auto;max-width:620px;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.45;color:var(--pv-texto);box-shadow:0 6px 18px var(--pv-sombra);pointer-events:auto;z-index:4}",
    ".pviva-faixa .pviva-bt{margin:6px 6px 0 0;min-height:30px}",
    ".pviva-faixa .pviva-barra-prog{height:4px;border-radius:2px;background:var(--pv-borda);margin-top:6px;overflow:hidden}",
    ".pviva-faixa .pviva-barra-prog i{display:block;height:100%;width:40%;background:var(--pv-aco);animation:pvivaprog 1.2s ease-in-out infinite alternate}",
    "@keyframes pvivaprog{from{margin-left:0}to{margin-left:60%}}",
    /* a DICA DE 3 PASSOS (primeira vez): um cartão, não uma cortina — a folha continua tocável por trás */
    ".pviva-guia{position:absolute;left:12px;bottom:60px;bottom:calc(env(safe-area-inset-bottom,0px) + 60px);width:330px;max-width:calc(100% - 24px);background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px var(--pv-sombra);pointer-events:auto;z-index:6;color:var(--pv-texto)}",
    ".pviva-guia h4{margin:0 0 8px;font-size:14px;color:var(--pv-aco)}",
    ".pviva-guia ol{margin:0;padding:0;list-style:none;counter-reset:pvg}",
    ".pviva-guia li{counter-increment:pvg;position:relative;padding:0 0 8px 30px;line-height:1.4;font-size:12.5px}",
    ".pviva-guia li:before{content:counter(pvg);position:absolute;left:0;top:0;width:21px;height:21px;border-radius:50%;background:var(--pv-aco);color:#fff;font-weight:700;font-size:11.5px;display:flex;align-items:center;justify-content:center}",
    ".pviva-3d{position:absolute;inset:0;pointer-events:none}",
    ".pviva-barra3d{position:absolute;left:50%;bottom:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;pointer-events:auto;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:12px;padding:6px;box-shadow:0 4px 16px var(--pv-sombra);max-width:96%;opacity:.98}",
    ".pviva-cortebox{position:absolute;left:14px;bottom:76px;pointer-events:auto;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:10px;padding:8px 10px;width:230px;opacity:.97}",
    ".pviva-cortebox input{width:100%}",
    ".pviva-disc{position:absolute;left:14px;top:62px;pointer-events:auto;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:10px;padding:8px;min-width:240px;max-height:calc(100% - 160px);overflow:auto}",
    ".pviva-disc label{display:flex;align-items:center;gap:8px;padding:4px 2px;flex:1;min-width:0}",
    ".pviva-disc .pviva-disc-l{display:flex;align-items:center;gap:6px}",
    ".pviva-disc .pviva-so{border:1px solid var(--pv-borda);background:var(--pv-cartao);color:var(--pv-aco);border-radius:6px;font-size:11px;padding:2px 7px;min-height:26px}",
    ".pviva-info{position:absolute;right:14px;top:62px;pointer-events:auto;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:12px;padding:12px;width:330px;max-width:calc(100% - 28px);max-height:calc(100% - 150px);overflow:auto;box-shadow:0 6px 22px var(--pv-sombra)}",
    ".pviva-info h3{margin:2px 0 6px;font-size:15px}",
    ".pviva-info dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:6px 0}",
    ".pviva-info dt{color:var(--pv-sub)}.pviva-info dd{margin:0;word-break:break-word}",
    ".pviva-info .pviva-guid{font-family:Consolas,monospace;font-size:11.5px}",
    ".pviva-info .pviva-sec{border-top:1px solid var(--pv-borda);margin-top:8px;padding-top:8px}",
    ".pviva-info .pviva-sec b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--pv-sub);margin-bottom:3px}",
    ".pviva-info .pviva-pend{background:#fff8e6;border:1px solid #f3c77a;color:#6b4300;border-radius:8px;padding:6px 8px;margin-top:6px}",
    ".pviva-info .pviva-pend .pviva-bt{margin:6px 6px 0 0;min-height:30px;padding:4px 8px}",
    ".pviva-alca{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#fff;border:2px solid " + ACO + ";box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:auto;cursor:ns-resize;display:flex;align-items:center;justify-content:center;touch-action:none}",
    ".pviva-alca svg{width:18px;height:18px;stroke:" + ACO + ";stroke-width:2.4;fill:none}",
    ".pviva-pino{position:absolute;transform:translate(-50%,-100%);pointer-events:none;text-align:center}",
    ".pviva-pino b{display:block;background:var(--pv-cartao);border:1px solid var(--pv-borda);border-radius:8px;padding:3px 8px;font-size:12px;color:var(--pv-texto);white-space:nowrap}",
    ".pviva-pino b small{display:block;font-weight:400;color:var(--pv-sub)}",
    ".pviva-pino i{display:block;width:2px;height:18px;margin:0 auto;background:var(--pv-aco)}",
    /* ⚠ visibility, não display: a lista some mas guarda o lugar — a folha não pula 250 px para a esquerda e volta (a
       volta do 3D punha o ponto fora do centro, e2e de 21/10/2026) */
    ".pviva-app.pviva-em3d .pviva-lista,.pviva-app.pviva-trans .pviva-lista{visibility:hidden}",
    ".pviva-app.pviva-em3d .pviva-palco{opacity:0;pointer-events:none}",
    ".pviva-app.pviva-trans .pviva-palco{transition:none;pointer-events:none}",
    "@media (max-width:760px){.pviva-lista{position:absolute;z-index:2;left:0;right:0;top:auto;width:auto;flex:none;height:auto;max-height:96px;display:flex;gap:4px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--pv-borda);padding:4px}" +
      ".pviva-lista h3,.pviva-lista .pviva-nota{display:none}.pviva-lista .pviva-acoes-modelo{flex-direction:row;margin:0;flex:0 0 auto}.pviva-lista .pviva-acoes-modelo .pviva-bt{width:auto}" +
      ".pviva-folha-bt{flex:0 0 auto;width:auto;max-width:200px}.pviva-corpo{flex-direction:column}.pviva-palco{margin-top:0}" +
      ".pviva-info{left:8px;right:8px;width:auto;top:56px;bottom:auto;max-height:42%}.pviva-cortebox{left:8px;right:8px;width:auto;top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);padding:6px 10px}.pviva-cortebox>div:last-child{display:none}" +
      ".pviva-disc{left:8px;top:56px;max-height:50%}.pviva-barra3d{flex-wrap:nowrap;gap:4px;padding:5px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px)}.pviva-barra3d .pviva-bt{padding:6px 9px}.pviva-barra3d .pviva-bt.prim .pviva-rot{display:inline}" +
      ".pviva-topo .pviva-sub{display:none}.pviva-topo .pviva-tit{max-width:46vw}.pviva-barra3d .pviva-rot,.pviva-barra2d .pviva-rot{display:none}.pviva-barra3d .pviva-bt.prim .pviva-rot{display:inline}" +
      ".pviva-topo .pviva-rot{display:none}.pviva-topo{gap:6px;padding-left:8px;padding-right:8px}.pviva-dica{top:auto;bottom:62px}.pviva-recado{top:104px}.pviva-guia{bottom:auto;top:104px}}"   /* no celular a dica fica no alto: embaixo ela cobria a faixa "o 3D está chegando" */
  ].join("\n");
  function estilo() {
    var d = global.document; if (!d || d.getElementById("pviva-estilo")) return;
    var s = d.createElement("style"); s.id = "pviva-estilo"; s.textContent = CSS; (d.head || d.documentElement).appendChild(s);
  }

  /* as funções que passam pela licença (o teste chama cada uma DIRETO e confere que recusa sem ela) */
  var PUBLICAS = ["abrir", "compartilhar", "importar", "ra", "gerarDoModelo", "baixarPacote"];

  var UIp = {
    PUBLICAS: PUBLICAS,
    _st: null, _G: null,

    /* ------------------------------------------------------------ REGISTRO na fita (quem chama: js/gestao.js) */
    registrar: function (reg, g) {
      var R = global.BimRibbon, self = this;
      if (!reg) return false;
      this._G = g || null;
      if (R && R.acrescentar) R.acrescentar("anotar", "Anotar", "Documentar", [
        { id: "prancha-viva", rotulo: "Prancha\nViva", icone: "prancha", grande: true,
          dica: "A prancha que abre o 3D no ponto tocado: toque na planta, no corte ou na fachada e o prédio sai da folha ali — corte na cota, disciplinas, medir, a peça com o item do orçamento e a etapa do cronograma. Volta para a folha no mesmo ponto." }
      ]);
      reg["prancha-viva"] = function () { return self.abrir(); };
      return true;
    },

    /* ------------------------------------------------------------ LICENÇA */
    porta: function (acao, fn) {
      var M = MOD(), g = M ? M.guarda(acao) : { ok: false, motivo: "módulo não carregado" };   /* sem o js/pranchavivamodulo.js: FECHA */
      if (g.ok) { try { if (global.TesteModulo && TesteModulo.tocar) TesteModulo.tocar("pranchaviva"); } catch (eT) {} return fn(); }
      this.oferta(g);
      return false;
    },
    oferta: function (g) {
      if (g && g.teste1h && global.TesteModuloUI) { try { return TesteModuloUI.oferta("pranchaviva"); } catch (eT) {} }
      var M = MOD(), O = (g && g.oferta) || (M && M.OFERTA) || {};
      var h = '<div style="font-size:13px;line-height:1.5;max-width:560px"><p style="margin:0 0 8px"><b>' + esc(O.subtitulo) + '</b></p><ul style="margin:0 0 10px 18px;padding:0">' +
        arr(O.itens).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + '</ul><div id="pviva-oferta-venda" class="muted">' + (g && g.testeEncerrado ? "O seu teste de 7 dias terminou. " : "") + esc(O.vendaFechada) + "</div></div>";
      var bts = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (g && g.podeTestar && M) bts.unshift({ texto: "Começar o teste de 7 dias", classe: "primary", onClick: function () { M.iniciarTeste(function () {}); UI.fecharModal(); toast("Teste de 7 dias da Prancha Viva começado.", "ok"); } });
      if (global.UI && UI.modal) UI.modal(O.titulo || "Prancha Viva", h, bts);
      try {
        var srv = global.Modela && Modela._servidor ? Modela._servidor() : "";
        if (srv && global.fetch && M) global.fetch(srv + "/api/modela/oferta", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          var pl = M.planosAVenda(d), el = global.document && global.document.getElementById("pviva-oferta-venda"); if (!pl.length || !el) return;
          el.innerHTML = pl.map(function (p) { return '<a class="btn primary" target="_blank" rel="noopener" href="' + esc(srv + "/modelagem?plano=" + encodeURIComponent(p.id)) + '">' + esc(p.nome) + "</a>"; }).join(" ");
        }, function () {});
      } catch (e) {}
      return false;
    },

    /* ==================================================================
     * ABRIR / FECHAR
     *   opts.fonte: "obra" (padrão: as pranchas da obra do BIM) | "link" (opts.folhas = dados.pranchas.folhas do link)
     * ================================================================== */
    abrir: function (opts) {
      opts = opts || {};
      var self = this;
      if (opts.fonte === "link") return this._abrir(opts);
      return this.porta("abrir", function () { return self._abrir(opts); });
    },
    /* ⚠ ACESSO FÁCIL (23/10/2026): o botão fica à vista FORA do BIM também (a tela inicial do BIM, a barra de título). Fora da
       tela do BIM, abrir leva ao BIM primeiro e espera o visualizador subir — antes dizia "Abra o BIM" e parava ali. */
    _esperarBim: function (opts) {
      var self = this, App0 = global.App, t0 = agora();
      if (opts._esperou || !App0 || !App0.irPara) return false;
      try { if (App0.view !== "bim") App0.irPara("bim"); } catch (e) { return false; }
      toast("Abrindo o BIM para a Prancha Viva…", "info");
      (function espera() {
        var b = B();
        if (b && b.pranchaVivaApi && b.pranchaVivaApi()) { var o2 = {}; Object.keys(opts).forEach(function (k) { o2[k] = opts[k]; }); o2._esperou = true; self._abrir(o2); return; }
        if (agora() - t0 > 30000) { toast("O BIM não abriu a tempo. Entre em BIM e toque em Prancha Viva de novo.", "erro"); return; }
        setTimeout(espera, 300);
      })();
      return true;
    },
    /* a cena tem modelo? (o pacote de outro programa e a folha com imagem abrem antes; o toque espera o 3D) */
    _temModelo: function () {
      var b = B(); try { return ((b && b.elementos) || []).length > 0; } catch (e) { return false; }
    },
    _abrir: function (opts) {
      if (!global.document || !PV()) return false;
      var b = B();
      if (!b || !b.pranchaVivaApi || !b.pranchaVivaApi()) {
        if (opts.fonte !== "link" && this._esperarBim(opts)) return true;
        toast("Abra o BIM com o modelo da obra: a Prancha Viva mostra a prancha e o 3D do mesmo projeto.", "aviso"); return false;
      }
      /* ⚠ guardada numa obra e reaberta em OUTRA (revisão, 23/10/2026): as folhas eram as da obra anterior por cima do
         modelo da nova. Outra obra → fecha e monta de novo (tools/test-pranchaviva-rev.js [d]) */
      if (this._st && this._st.el && this._st.fonte === "obra" && this._st.obra !== this._obraAtual()) this.fechar();
      if (this._st && this._st.el) {
        this._mostrar(true); if (this._st.modo === "2d") this._pausar3d(true);
        /* reaberta (ela fica guardada quando a pessoa vai corrigir algo no app): o modelo pode ter mudado */
        if (this._st.fonte === "obra" && this._st.modo === "2d" && this._st.atual >= 0 && this._st.sigModelo !== this.assinaturaModelo()) this.abrirFolha(this._st.atual);
        return true;
      }
      estilo();
      var st = this._st = { fonte: opts.fonte === "link" ? "link" : "obra", obra: this._obraAtual(), folhas: [], atual: -1, modo: "2d", v: { s: 1, tx: 0, ty: 0 }, ligs: [], ocupado: false,
        corteOn: true, off: 0, offMin: -10, offMax: 10, salvo: null, discOff: {}, medindo: false, sel: null, tick: null, tickPos: null,
        /* o 3D ainda não chegou (celular baixando o modelo; obra sem modelo aberto): a folha aparece e o toque espera */
        espera3d: null, pendente: null, uidDaChave: typeof opts.uidDaChave === "function" ? opts.uidDaChave : null, marcasOn: true, visor: !!opts.visor };
      if (opts.esperando3d) st.espera3d = { motivo: "carregando", texto: txt(opts.textoCarga) || "Baixando o modelo 3D…" };
      else if (st.fonte === "obra" && !this._temModelo()) st.espera3d = { motivo: "sem-modelo" };
      /* ⚠ a aba {3D} na frente: com uma folha ou planta 2D na frente o canvas do 3D está escondido (tamanho zero) e a
         Prancha Viva abria espremida no canto (e2e de 21/10/2026). A aba de antes volta ao fechar. */
      try { var g = G(); if (st.fonte === "obra" && g && g._bimVxEst && g._bimVxAtivar && g._bimVxEst().ativa !== "3d") { st.abaAntes = g._bimVxEst().ativa; g._bimVxAtivar("3d"); } } catch (eAb) {}
      this._montarDom();
      if (st.fonte === "link") st.folhas = this._folhasDoLink(opts.folhas);
      else st.folhas = this._folhasDaObra();
      this._pintarLista();
      var ini = 0;
      if (opts.folhaId) st.folhas.forEach(function (f, i) { if (f.id === opts.folhaId) ini = i; });
      if (st.folhas.length) this.abrirFolha(ini);
      else this._vazio();
      this._pintarFaixa();
      /* sem modelo na cena: o modelo que entrar por QUALQUER caminho (os modelos da obra restaurando, o + IFC) destrava o toque */
      if (st.espera3d && st.espera3d.motivo === "sem-modelo") this._vigiarModelo();
      if (st.folhas.length && !this._guiaVista()) this.guia(true);
      try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("prancha-viva", "abrir", { fonte: st.fonte, folhas: st.folhas.length }); } catch (eA) {}
      return true;
    },

    /* ------------------------------------------------------------ o 3D que ainda não chegou
     * "carregando": o celular baixando os modelos do link (js/rvvisor.js chama progresso3d e pronto3d); o toque fica
     *   GUARDADO e abre sozinho quando o 3D chegar — a pessoa já está lendo a prancha enquanto isso.
     * "sem-modelo": a obra aberta no computador sem o modelo na cena; a faixa diz o que fazer, com os botões. */
    progresso3d: function (texto) {
      var st = this._st; if (!st) return;
      if (!st.espera3d) st.espera3d = { motivo: "carregando" };
      st.espera3d.motivo = "carregando"; st.espera3d.texto = txt(texto) || st.espera3d.texto || "Baixando o modelo 3D…";
      this._pintarFaixa();
    },
    pronto3d: function () {
      var st = this._st; if (!st) return false;
      var tinha = !!st.espera3d; st.espera3d = null; this._pintarFaixa();
      /* com o modelo na cena os marcadores da obra passam a existir (a caixa de cada peça vem dele) */
      if (tinha && st.fonte === "obra" && st.modo === "2d" && st.atual >= 0) this.abrirFolha(st.atual);
      var p = st.pendente; st.pendente = null;
      if (p && st.modo === "2d") { this._carga(""); return this.irPara3D(p.lig, p.x, p.y, p.extra || {}); }
      return true;
    },
    _vigiarModelo: function () {
      var self = this, st = this._st, n0 = -1, t0 = agora();
      if (!st || st._vigia) return;
      st._vigia = setInterval(function () {
        if (self._st !== st) { clearInterval(st._vigia); return; }
        var n = 0; try { n = ((B() && B().elementos) || []).length; } catch (e) { n = 0; }
        /* o modelo "chegou" quando a contagem de peças parou de crescer por uma volta (modelo grande entra aos poucos) */
        if (n > 0 && n === n0) { clearInterval(st._vigia); st._vigia = null; self.pronto3d(); return; }
        n0 = n;
        if (agora() - t0 > 600000) { clearInterval(st._vigia); st._vigia = null; }
      }, 1200);
    },
    _pintarFaixa: function () {
      var st = this._st, fx = this.q("faixa"), self = this; if (!fx) return;
      /* a faixa diz mais que a dica da folha (e no celular as duas moram embaixo): com a faixa, a dica sai */
      try { var dq = this.q("dica"); if (dq) setTimeout(function () { if (self._st === st) dq.style.visibility = fx.hidden ? "" : "hidden"; }, 0); } catch (eD) {}
      var e = st.espera3d, fa = st.folhas && st.folhas[st.atual];
      if (!e && fa && fa._desatualizada && st.modo === "2d") {
        fx.innerHTML = "<b>O modelo mudou depois que esta folha foi desenhada.</b> O toque continua levando ao ponto certo do 3D, mas o desenho é o de antes." +
          '<div><button type="button" class="pviva-bt prim" data-pviva-acao="refazer-desenho">' + ico("ciclo", 14) + "Atualizar o desenho com o modelo</button></div>";
        fx.hidden = false; return;
      }
      if (!e) { fx.hidden = true; fx.innerHTML = ""; return; }
      if (e.motivo === "carregando") {
        fx.innerHTML = "<b>O 3D está chegando.</b> " + esc(e.texto || "Baixando o modelo 3D…") + "<br>Já dá para ler e aproximar a prancha. " +
          (st.pendente ? "<b>O ponto que você tocou abre assim que o 3D terminar.</b>" : "Toque num ponto: ele abre no 3D assim que o modelo terminar de chegar.") +
          '<div class="pviva-barra-prog"><i></i></div>';
      } else {
        var temGuardados = false;
        try { var g = G(); temGuardados = !!(g && g._bimSel && global.Store && (Store.listar(global.Auth && Auth.empresaId ? Auth.empresaId() : null, "bim_modelos") || []).some(function (r) { return r && String(r.obraId) === String(g._bimSel); })); } catch (eM) {}
        fx.innerHTML = "<b>O modelo 3D desta obra não está aberto.</b> A prancha aparece, mas o toque precisa do modelo para abrir o 3D no ponto" +
          " — e as vistas posicionadas na folha são desenhadas dele.<div>" +
          (temGuardados ? '<button type="button" class="pviva-bt prim" data-pviva-acao="abrir-modelos">' + ico("abrir", 14) + "Abrir os modelos desta obra</button>" : "") +
          '<button type="button" class="pviva-bt' + (temGuardados ? "" : " prim") + '" data-pviva-acao="abrir-ifc">' + ico("importar", 14) + "Abrir um arquivo IFC</button></div>";
      }
      fx.hidden = false;
    },
    _abrirModelosDaObra: function () {
      var self = this, g = G(), P = global.BimProjetosUI, st = this._st; if (!st) return;
      if (!g || !g._bimSel || !P || !P.abrirModelosDaObra) { this._msg("Não consegui abrir os modelos daqui: use a tela inicial do BIM (Modelos IFC salvos na obra).", "aviso"); return; }
      var obra = g._bimSel;
      /* ⚠ abrir os modelos troca a cena: a Prancha Viva sai da frente (a pergunta "salvar o projeto?" pode aparecer) e volta
         sozinha quando o modelo estiver na cena */
      this.fechar();
      P.abrirModelosDaObra(obra).then(function (ok) {
        if (!ok) return;
        var t0 = agora();
        (function espera() { if (self._temModelo()) { self.abrir(); return; } if (agora() - t0 < 180000) setTimeout(espera, 800); })();
      });
    },
    _abrirIfc: function () {
      var self = this, b = B(), d = global.document; if (!b || !b.abrirArquivo || !d) return;
      var inp = d.createElement("input"); inp.type = "file"; inp.accept = ".ifc,.IFC"; inp.multiple = true;
      inp.onchange = function () {
        var fs = [].slice.call(inp.files || []); if (!fs.length) return;
        fs.forEach(function (f, k) { setTimeout(function () { try { b.abrirArquivo(f); } catch (e) {} }, k * 400); });
        if (self._st) { self.progresso3d("Abrindo " + (fs.length === 1 ? fs[0].name : fs.length + " arquivos IFC") + "…"); self._vigiarModelo(); }
      };
      inp.click();
    },

    /* ------------------------------------------------------------ recado, tema, dica de 3 passos */
    /* o recado na própria tela (no celular do cliente o toast do app fica atrás do visor); no computador vai também ao toast */
    _msg: function (texto, tipo) {
      var st = this._st, r = this.q("recado");
      if (!st || !r) { toast(texto, tipo); return; }
      r.className = "pviva-recado" + (tipo === "aviso" || tipo === "erro" ? " " + tipo : "");
      r.textContent = texto; r.hidden = false;
      /* ⚠ com o recado na tela a dica do alto some: as duas ficavam uma em cima da outra quando a dica quebrava em duas
         linhas (print pv-17 da e2e, 23/10/2026: "Toque num ponto…" por cima de "Pranchas do modelo: …") */
      try { st.el.classList.add("pviva-com-recado"); } catch (eC) {}
      clearTimeout(st._tMsg); st._tMsg = setTimeout(function () { r.hidden = true; try { st.el.classList.remove("pviva-com-recado"); } catch (eC2) {} }, tipo === "erro" ? 9000 : 6000);
      if (st.fonte === "obra") toast(texto, tipo);
    },
    TEMA: "orcapro:pviva:tema",
    _temaEscuro: function (visor) {
      var v = ""; try { v = global.localStorage.getItem(this.TEMA) || ""; } catch (e) { v = ""; }
      if (v === "escuro") return true; if (v === "claro") return false;
      return !!visor;   /* o visor do celular é escuro; o app (e o pacote aberto nele), claro */
    },
    tema: function (escuro) {
      var st = this._st; if (!st || !st.el) return false;
      if (escuro == null) escuro = !st.el.classList.contains("pviva-escuro");
      st.el.classList.toggle("pviva-escuro", !!escuro);
      try { global.localStorage.setItem(this.TEMA, escuro ? "escuro" : "claro"); } catch (e) {}
      Array.prototype.forEach.call(st.el.querySelectorAll('[data-pviva-acao="tema"]'), function (b) { b.setAttribute("aria-pressed", String(!!escuro)); b.classList.toggle("ligado", !!escuro); });
      return !!escuro;
    },
    GUIA: "orcapro:pviva:guia:v1",
    _guiaVista: function () { try { return global.localStorage.getItem(this.GUIA) === "1"; } catch (e) { return true; } },
    guia: function (on) {
      var g = this.q("guia"), self = this; if (!g) return;
      if (on == null) on = g.hidden;
      if (!on) { g.hidden = true; try { global.localStorage.setItem(this.GUIA, "1"); } catch (e) {} return; }
      g.innerHTML = "<h4>Prancha Viva em 3 passos</h4><ol>" +
        "<li><b>Escolha a prancha</b> na lista" + (this._st && this._st.fonte === "link" ? "" : " (as vistas ligadas ao modelo têm o contorno azul)") + ". Arraste para mover; role ou pince com dois dedos para aproximar.</li>" +
        "<li><b>Toque num ponto</b> da planta, do corte ou da fachada — ou num marcador (porta, janela, cômodo): o prédio sai da folha e o 3D abre ali, com o corte na cota certa.</li>" +
        "<li><b>No 3D</b> gire, meça, ligue e desligue as disciplinas, toque numa peça para ver o que ela é. <b>Voltar à prancha</b> leva ao mesmo ponto.</li></ol>" +
        '<div style="display:flex;justify-content:flex-end;gap:6px"><button type="button" class="pviva-bt prim" data-pviva-acao="guia-ok">Entendi</button></div>';
      g.hidden = false;
    },
    aberto: function () { return !!(this._st && this._st.el); },
    fechar: function () {
      var st = this._st; if (!st) return false;
      try { if (st._vigia) clearInterval(st._vigia); clearTimeout(st._tMsg); } catch (eV) {}
      try { this._restaurarCena(); } catch (e) {}
      this._ligarCanvas(false);
      try { if (st.ro) st.ro.disconnect(); } catch (e2) {}
      try { global.removeEventListener("resize", st.onResize); global.removeEventListener("keydown", st.onKey, true); } catch (e3) {}
      if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
      try { global.document.body.classList.remove("pviva-aberta"); } catch (eB) {}
      (st.urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e4) {} });
      this._pausar3d(false);
      try { var g = G(); if (st.abaAntes && g && g._bimVxAtivar && g._bimVxAchar && g._bimVxAchar(st.abaAntes)) g._bimVxAtivar(st.abaAntes); } catch (eAb) {}
      this._st = null;
      return true;
    },

    /* ------------------------------------------------------------ as folhas */
    _folhasDaObra: function () {
      var g = G(), P = global.Prancha, out = [];
      if (!g || !P) return out;
      var regs = []; try { regs = g._prRegs() || []; } catch (e) { regs = []; }
      regs.forEach(function (reg) {
        var pr = P.normalizar(reg), geo = P.geometriaDe(pr);
        pr.folhas.forEach(function (f) {
          var nLig = (f.pv ? 1 : 0) + f.blocos.filter(function (b) { return b.tipo === "viewport" || b.tipo === "vista"; }).length;
          out.push({ id: reg.id + "--" + f.id, regId: reg.id, reg: reg, pr: pr, folha: f, geo: geo, titulo: (P.numeroFolha ? P.numeroFolha(pr, f) + " · " : "") + (f.conteudo || pr.nome || "Folha"),
            grupo: pr.nome || "Pranchas", nLig: nLig, wMm: geo.papel.w, hMm: geo.papel.h });
        });
      });
      return out;
    },
    _folhasDoLink: function (lista) {
      var P = PV();
      return arr(lista).map(function (f) {
        return { id: txt(f.id), titulo: txt(f.titulo) || "Folha", grupo: "Pranchas do projeto", link: f, wMm: +f.wMm, hMm: +f.hMm,
          nLig: arr(f.ligs).length, ligsProntas: arr(f.ligs).map(function (l) { return P.ligacaoDoLink(l); }).filter(Boolean) };
      }).filter(function (f) { return f.wMm > 0 && f.hMm > 0; });
    },

    /* as ligações de UMA folha com o modelo (a matriz de cada vista) */
    ligacoes: function (f, opts0) {
      if (f.ligsProntas) return f.ligsProntas;
      var P = PV(), b2 = global.Bim2D, FU = global.BimFolhaUI, out = [], vistas = [];
      try { vistas = G() && G()._bimVistaDaObra ? G()._bimVistaDaObra() || [] : []; } catch (e) { vistas = []; }
      if (f.folha.pv) {
        var C = null; try { C = B()._coordMatriz ? B()._coordMatriz() : null; } catch (eC) { C = null; }
        if (!(arr(C).length === 16)) C = null;
        var lm = P.ligacaoMatriz(f.folha.pv, C, { nome: f.folha.pv.titulo || f.folha.conteudo || "Folha" });
        if (lm) { lm.textura = { tipo: "img", chave: f.folha.imagemInteira }; out.push(lm); }
      }
      /* ⚠ O DESENHO ACOMPANHA O MODELO (23/10/2026): o desenho da vista é guardado na sessão (js/bimfolhaui.js desenho) e,
         com o modelo editado ou outro IFC aberto depois, a folha mostrava o desenho de ANTES e a matriz casava com ele —
         o toque abria o 3D certo num desenho errado. Mudou a assinatura do modelo → a folha avisa e oferece "Atualizar o
         desenho" (a pessoa decide). ⚠ NÃO redesenha sozinha: o corte 2D é síncrono, e com a creche (4 disciplinas) aberta
         depois do modelo de exemplo o redesenho automático da 1ª folha segurou a página por mais de 2 min (e2e de
         23/10/2026). O desenho de antes e a matriz dele continuam coerentes entre si: o toque cai no ponto certo do modelo. */
      var sig = this.assinaturaModelo(), self = this, refazer = !!(opts0 && opts0.refazer), obraK = this._obraAtual();
      this._sigVista = this._sigVista || {};
      f._desatualizada = false;
      f.folha.blocos.forEach(function (bl, i) {
        if (bl.tipo === "viewport" && b2 && FU && FU.desenho) {
          var d = null, dz = null, dv = null;
          try {
            d = b2.def(bl.vistaId);
            /* a assinatura conhecida é POR OBRA (o id da vista se repete em toda obra: a da obra A não diz nada da B) */
            var kSig = obraK + "|" + bl.vistaId, conhecida = self._sigVista[kSig];
            dz = d ? FU.desenho(bl.vistaId, refazer && self._temModelo()) : null;
            if (dz && self._temModelo()) { if (refazer || !conhecida) self._sigVista[kSig] = sig; else if (conhecida !== sig) f._desatualizada = true; }
            /* ⚠ DESENHO E MATRIZ DA MESMA VISTA (revisão, 23/10/2026): com a vista mudada depois de desenhada (a altura do
               corte da planta, a profundidade ou o lado do corte), o desenho guardado é o de antes e a matriz saía da vista
               nova — o toque abria o 3D fora do ponto desenhado. A matriz é a da vista que desenhou a folha; a folha avisa
               e "Atualizar o desenho" refaz os dois juntos (tools/test-pranchaviva-rev.js [c]) */
            var dv = (dz && dz.def) || d;
            if (dz && dz.def && JSON.stringify(dz.def) !== JSON.stringify(d)) f._desatualizada = true;
          } catch (e2) { d = null; }
          if (!d || !dz || !dz.vb) return;
          var pl = P.planoDaVista(dv || d), vb = P.vbDoBloco(bl, dz.vb);
          var lv = pl ? P.ligacaoViewport(bl, vb, pl, { nome: bl.tituloVista || d.nome || "Vista", vistaId: bl.vistaId, bloco: i }) : null;
          if (lv) { lv.textura = { tipo: "svg", vistaId: bl.vistaId, bloco: bl }; out.push(lv); }
        } else if (bl.tipo === "vista") {
          var v = vistas.filter(function (x) { return x.id === bl.vistaId || (bl.origemVista && x.origemId === bl.origemVista); })[0];
          var lc = v && v.camera ? P.ligacaoCamera(bl, v.camera, { nome: bl.titulo || v.nome || "Ponto de vista", vistaId: v.id, bloco: i }) : null;
          if (lc) out.push(lc);
        }
      });
      return out;
    },

    /* ------------------------------------------------------------ DOM */
    _montarDom: function () {
      var d = global.document, st = this._st, self = this, host = null;
      try { host = B().host ? B().host() : null; } catch (e) { host = null; }
      st.host = host || d.body;
      var el = st.el = d.createElement("div");
      el.className = "pviva-app" + (st.visor ? " pviva-link" : "")   /* por cima da casca SÓ no visor do celular: no app, o pacote aberto não pode cobrir os avisos */ + (this._temaEscuro(st.visor) ? " pviva-escuro" : "");
      el.id = "pviva-app"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Prancha Viva");
      el.innerHTML =
        '<div class="pviva-topo"><span class="pviva-marca">' + ico("prancha", 18) + '<span class="pviva-rot">Prancha Viva</span></span>' +
        '<span class="pviva-tit" data-pviva="tit"></span><span class="pviva-sub" data-pviva="sub"></span><span class="pviva-esp"></span>' +
        (st.fonte === "obra" ? '<button type="button" class="pviva-bt" data-pviva-acao="compartilhar" title="O link e o QR da obra para o celular do cliente, com as pranchas leves">' + ico("celular", 16) + '<span class="pviva-rot">Compartilhar</span></button>' : "") +
        '<button type="button" class="pviva-bt" data-pviva-acao="ra" title="A maquete do projeto em realidade aumentada (no celular)">' + ico("vr", 16) + '<span class="pviva-rot">Realidade aumentada</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="tema" aria-pressed="' + this._temaEscuro(st.visor) + '" title="Modo escuro / claro (fica guardado neste aparelho)">' + ico("tema", 16) + '<span class="pviva-rot">Escuro</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="guia" title="Como usar: os 3 passos">?</button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="fechar" title="Fechar a Prancha Viva (Esc)">' + ico("fechar", 16) + '<span class="pviva-rot">Fechar</span></button></div>' +
        '<div class="pviva-corpo"><aside class="pviva-lista" data-pviva="lista" aria-label="Folhas"></aside>' +
        '<main class="pviva-palco" data-pviva="palco" tabindex="0" aria-label="A folha: toque num ponto para abrir o 3D ali">' +
        '<div class="pviva-papel" data-pviva="papel"></div><div data-pviva="marcas" style="position:absolute;inset:0;pointer-events:none"></div>' +
        '<div class="pviva-dica" data-pviva="dica">Toque num ponto da planta, do corte ou da fachada — ou numa porta, num cômodo: o 3D abre exatamente ali.</div>' +
        '<div class="pviva-barra2d"><button type="button" class="pviva-bt ligado" data-pviva-acao="marcas" aria-pressed="true" title="Mostrar/esconder os marcadores (portas, janelas, cômodos, escadas)">' + ico("alvo", 15) + '<span class="pviva-rot">Marcadores</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="menos" title="Afastar" aria-label="Afastar">−</button><button type="button" class="pviva-bt" data-pviva-acao="mais" title="Aproximar" aria-label="Aproximar">+</button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="ajustar" title="A folha inteira">' + ico("expandir", 15) + '<span class="pviva-rot">Ajustar</span></button></div>' +
        '<div class="pviva-carga" data-pviva="carga" hidden></div>' +
        '<div class="pviva-recado" data-pviva="recado" role="status" aria-live="polite" hidden></div>' +
        '<div class="pviva-faixa" data-pviva="faixa" hidden></div>' +
        '<div class="pviva-guia" data-pviva="guia" hidden></div></main></div>' +
        '<div class="pviva-3d" data-pviva="3d" hidden>' +
        '<div class="pviva-barra3d" role="toolbar" aria-label="Ferramentas do 3D">' +
        '<button type="button" class="pviva-bt prim" data-pviva-acao="voltar" title="Volta para a folha no mesmo ponto (Esc)">' + ico("voltar", 16) + '<span class="pviva-rot">Voltar à prancha</span></button>' +
        '<button type="button" class="pviva-bt ligado" data-pviva-acao="corte" aria-pressed="true" title="O corte na cota da prancha">' + ico("corte", 16) + '<span class="pviva-rot">Corte</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="disc" aria-pressed="false" title="Ligar e desligar disciplinas">' + ico("camadas", 16) + '<span class="pviva-rot">Disciplinas</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="medir" aria-pressed="false" title="A trena: toque em dois pontos do modelo">' + ico("medir", 16) + '<span class="pviva-rot">Medir</span></button>' +
        '<button type="button" class="pviva-bt" data-pviva-acao="inicio" title="O modelo inteiro">' + ico("casa", 16) + '<span class="pviva-rot">Início</span></button></div>' +
        '<div class="pviva-cortebox" data-pviva="cortebox"><div data-pviva="cortetxt" style="font-weight:600;margin-bottom:4px"></div>' +
        '<input type="range" min="0" max="1000" value="500" data-pviva="corterange" aria-label="Posição do corte"><div style="font-size:11px;color:#5b6875;margin-top:2px">Arraste a alça no 3D ou o controle acima.</div></div>' +
        '<div class="pviva-disc" data-pviva="disc" hidden></div>' +
        '<div class="pviva-info" data-pviva="info" hidden></div>' +
        '<div data-pviva="sobre" style="position:absolute;inset:0;pointer-events:none"></div></div>';
      d.body.appendChild(el);
      try { d.body.classList.add("pviva-aberta"); } catch (eB) {}
      this._posicionar();
      st.onResize = function () { self._posicionar(); if (st.modo === "2d") self._pintar2d(); };
      global.addEventListener("resize", st.onResize);
      try { if (global.ResizeObserver && st.host !== d.body) { st.ro = new ResizeObserver(st.onResize); st.ro.observe(st.host); } } catch (eR) {}
      st.onKey = function (ev) {
        if (!self._st || ev.key !== "Escape") return;
        var alvo = ev.target && ev.target.tagName; if (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo || "")) return;
        if (global.document.getElementById("modal-bg")) return;
        ev.stopPropagation(); ev.preventDefault();
        if (st.medindo) self._medir(false); else if (st.modo === "3d") self.voltar(); else if (st.modo === "2d") self.fechar();
      };
      global.addEventListener("keydown", st.onKey, true);
      el.addEventListener("click", function (ev) {
        var bt = ev.target && ev.target.closest ? ev.target.closest("[data-pviva-acao]") : null; if (!bt) return;
        self._acao(bt.getAttribute("data-pviva-acao"), bt);
      });
      this._ligarPalco();
      this._ligarCorte();
    },
    /* esconder/mostrar sem fechar (a pessoa foi corrigir algo, compartilhar, a RA): a casca do visor volta junto */
    _mostrar: function (on) {
      var st = this._st; if (!st || !st.el) return;
      st.el.style.display = on ? "" : "none";
      try { global.document.body.classList.toggle("pviva-aberta", !!on); } catch (e) {}
    },
    q: function (k) { var st = this._st; return st && st.el ? st.el.querySelector('[data-pviva="' + k + '"]') : null; },
    /* com a folha na frente o 3D não precisa desenhar (o PC é compartilhado; o modelo pesado custava GPU à toa por baixo) */
    _pausar3d: function (on) { try { var b = B(); if (b && b.principalOculta) b.principalOculta(!!on); } catch (e) {} },
    _posicionar: function () {
      var st = this._st; if (!st || !st.el) return;
      var r = st.host && st.host !== global.document.body ? st.host.getBoundingClientRect() : null;
      /* host escondido ou espremido (aba 2D na frente, painel recolhido): a tela inteira */
      if (!r || r.width < 320 || r.height < 260) r = { left: 0, top: 0, width: global.innerWidth, height: global.innerHeight };
      var s = st.el.style; s.left = r.left + "px"; s.top = r.top + "px"; s.width = Math.max(200, r.width) + "px"; s.height = Math.max(200, r.height) + "px";
    },
    _pintarLista: function () {
      var st = this._st, el = this.q("lista"); if (!el) return;
      var grupos = {}, ordem = [];
      st.folhas.forEach(function (f, i) { if (!grupos[f.grupo]) { grupos[f.grupo] = []; ordem.push(f.grupo); } grupos[f.grupo].push(i); });
      var h = "";
      ordem.forEach(function (gN) {
        h += "<h3>" + esc(gN) + "</h3>";
        grupos[gN].forEach(function (i) {
          var f = st.folhas[i];
          h += '<button type="button" class="pviva-folha-bt" data-pviva-folha="' + i + '" aria-current="' + (i === st.atual) + '"><span>' + esc(f.titulo) + "</span>" +
            '<small>' + (f.nLig ? '<span class="pviva-lig">' + f.nLig + " vista" + (f.nLig === 1 ? "" : "s") + " ligada" + (f.nLig === 1 ? "" : "s") + "</span>" : '<span class="pviva-lig nao">sem ligação com o modelo</span>') + "</small></button>";
        });
      });
      if (st.fonte === "obra") {
        /* O PACOTE DE QUALQUER PROJETO (23/10/2026): as pranchas saem do modelo aberto num clique (plantas por nível, cortes
           e elevações, com a matriz de cada vista) e "Atualizar" refaz as mesmas folhas quando o projeto muda */
        var temAuto = st.folhas.some(function (f) { return f.folha && f.folha.auto; });
        h += '<div class="pviva-acoes-modelo">' +
          '<button type="button" class="pviva-bt' + (st.folhas.some(function (f) { return f.nLig > 0; }) ? "" : " prim") + '" data-pviva-acao="gerar-modelo" title="Plantas de cada nível, cortes e elevações do modelo aberto, cada vista ligada ao 3D. Gerar de novo ATUALIZA as mesmas folhas (não duplica) e não mexe nas feitas à mão">' +
            ico("prancha", 15) + (temAuto ? "Atualizar do modelo" : "Gerar as pranchas do modelo") + "</button>" +
          '<button type="button" class="pviva-bt" data-pviva-acao="baixar-pacote" title="Um arquivo .json com as folhas ligadas (imagem + matriz de cada vista): abre na Prancha Viva de quem tiver o mesmo modelo">' + ico("baixar", 15) + "Baixar o pacote</button>" +
          '<div class="pviva-nota">Folhas prontas de outro programa, com a matriz de ligação (pranchas.json):</div>' +
          '<button type="button" class="pviva-bt" data-pviva-acao="importar">' + ico("importar", 15) + "Importar pranchas ligadas</button></div>";
      }
      el.innerHTML = h;
      var self = this;
      Array.prototype.forEach.call(el.querySelectorAll("[data-pviva-folha]"), function (b) {
        b.onclick = function () { var i = +b.getAttribute("data-pviva-folha"); if (st.ocupado) return; if (st.modo === "3d") self.voltar(true).then(function () { self.abrirFolha(i); }); else self.abrirFolha(i); };
      });
    },
    _vazio: function () {
      var p = this.q("palco"); if (!p) return;
      var v = global.document.createElement("div"); v.className = "pviva-vazio";
      var st = this._st, link = st && st.fonte === "link", comModelo = this._temModelo();
      v.innerHTML = link ? "<div><b>Este link não trouxe pranchas.</b><br>Peça a quem enviou um link novo com a opção <b>Pranchas (Prancha Viva)</b> marcada. O 3D do projeto continua no visualizador: feche esta tela.</div>" :
        "<div><b>Esta obra ainda não tem prancha.</b><br>" +
        (comModelo ? "O modelo está aberto: <b>Gerar as pranchas do modelo</b> monta as plantas de cada nível, os cortes e as elevações, cada vista ligada ao 3D — é só tocar." :
          "A Prancha Viva abre as folhas da obra e o 3D do mesmo projeto. Abra o modelo da obra (botões abaixo) e gere as pranchas dele num clique.") +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
        (comModelo ? '<button type="button" class="pviva-bt prim" data-pviva-acao="gerar-modelo">' + ico("prancha", 15) + "Gerar as pranchas do modelo</button>" : "") +
        '<button type="button" class="pviva-bt" data-pviva-acao="ir-pranchas">' + ico("prancha", 15) + "Abrir as Pranchas do projeto</button>" +
        '<button type="button" class="pviva-bt" data-pviva-acao="importar">' + ico("importar", 15) + "Importar pranchas ligadas</button></div></div>";
      p.appendChild(v);
      this.q("dica").hidden = true;
      this._tit("Sem folhas", "");
    },
    _tit: function (t, s) { var a = this.q("tit"), b = this.q("sub"); if (a) a.textContent = t || ""; if (b) b.textContent = s || ""; },
    _carga: function (t) { var c = this.q("carga"); if (!c) return; c.hidden = !t; c.textContent = t || ""; },

    /* ------------------------------------------------------------ abrir uma folha */
    abrirFolha: function (i, opts) {
      var st = this._st, self = this, f = st.folhas[i]; if (!f) return Promise.resolve(false);
      st.atual = i;
      Array.prototype.forEach.call(st.el.querySelectorAll("[data-pviva-folha]"), function (b) { b.setAttribute("aria-current", String(+b.getAttribute("data-pviva-folha") === i)); });
      this._tit(f.titulo, f.nLig ? "toque num ponto para abrir o 3D" : "esta folha não tem vista ligada ao modelo");
      this._carga("Montando a folha…");
      var pap = this.q("papel"); pap.style.width = f.wMm + "mm"; pap.style.height = f.hMm + "mm"; pap.innerHTML = "";
      return new Promise(function (ok) { setTimeout(ok, 30); }).then(function () {
        if (self._st !== st || st.atual !== i) return false;
        if (opts && opts.refazer) self._carga("Desenhando a folha com o modelo de agora…");
        st.ligs = self.ligacoes(f, opts);
        st.sigModelo = self.assinaturaModelo();
        try { self._calcMarcas(st.ligs); } catch (eMk) {}
        return self._htmlFolha(f, true).then(function (html) {
          if (self._st !== st || st.atual !== i) return false;
          pap.innerHTML = html + self._htmlLigacoes(st.ligs);
          self._carga("");
          self._posicionar();
          self.ajustar();
          if (st.modo === "2d") self._pausar3d(true);
          self._marcasAmbientes();
          self._pintarFaixa();
          return true;
        });
      })["catch"](function (e) {
        /* ⚠ nunca a tela branca: a folha que não montou diz o que houve e o que fazer */
        self._carga("");
        if (self._st === st) pap.innerHTML = '<div style="padding:24mm;font:16pt Arial,sans-serif;color:#7a4b00">Não consegui montar esta folha (' + esc(e && e.message || e) + ').<br>Escolha outra na lista ou abra a folha em Pranchas do projeto para conferir.</div>';
        self._msg("Não consegui montar a folha: " + (e && e.message || e), "erro"); return false;
      });
    },

    /* ------------------------------------------------------------ a assinatura (o que muda o desenho e o pacote do link) */
    assinaturaModelo: function () {
      var b = B(), els = [], mods = [], ops = 0;
      try { els = (b && b.elementos) || []; mods = ((b && b.modelos) || []).map(function (m) { return (m && (m.modeloId || m.nome)) || ""; }); ops = b && b.editarOps ? (b.editarOps() || []).length : 0; } catch (e) {}
      var ultimo = els.length ? els[els.length - 1].uid : "";
      return PV().assinatura([els.length, ultimo, mods, ops]);
    },
    /* o pacote do link muda quando muda a folha (vistas, imagem, matriz) ou o modelo — js/gestao.js _rvAssinatura */
    assinatura: function () {
      var lista = [], self = this; try { lista = this._folhasDaObra(); } catch (e) { lista = []; }
      return PV().assinatura([lista.map(function (f) { return [f.id, f.folha && f.folha.blocos, self._vistasDaFolha(f), f.folha && f.folha.pv, f.folha && f.folha.imagemInteira, f.wMm, f.hMm]; }), this.assinaturaModelo()]);
    },
    /* ⚠ A VISTA ENTRA NA ASSINATURA (revisão, 23/10/2026): o bloco da folha guarda só o id da vista — a altura do corte da
       planta, o corte (posição, profundidade, lado) e a escala/estilo moram no Bim2D. Sem isto, mudar a vista
       reaproveitava o link guardado e o cliente recebia o pacote velho (tools/test-pranchaviva-rev.js [b]) */
    _vistasDaFolha: function (f) {
      var b2 = global.Bim2D, self = this; if (!b2 || !f || !f.folha) return null;
      return arr(f.folha.blocos).filter(function (bl) { return bl && bl.tipo === "viewport"; }).map(function (bl) {
        var d = null, e = null; try { d = b2.def ? b2.def(bl.vistaId) : null; e = b2.estilo ? b2.estilo(bl.vistaId) : null; } catch (eV) {}
        /* + o desenho guardado é o de ANTES (do modelo ou da vista)? "Atualizar o desenho" muda o pacote (link novo). Um
           sim/não, e não a assinatura da sessão: recarregar o app não pode gerar link novo à toa (cada link gasta cota) */
        return [bl.vistaId, d, e, self._desenhoVelho(bl.vistaId, d) ? 1 : 0];
      });
    },
    /* o desenho guardado desta vista é o de antes da última mudança do modelo ou da própria vista? (sem desenho: não) */
    _desenhoVelho: function (vistaId, d) {
      var FU = global.BimFolhaUI, dz = null;
      try { dz = FU && FU._desenhosObra === FU.obraKey() ? FU._desenhos[vistaId] : null; } catch (e) { dz = null; }
      if (!dz) return false;
      var conhecida = (this._sigVista || {})[this._obraAtual() + "|" + vistaId];
      if (conhecida && this._temModelo() && conhecida !== this.assinaturaModelo()) return true;
      try { return !!(dz.def && d && JSON.stringify(dz.def) !== JSON.stringify(d)); } catch (e2) { return false; }
    },
    _obraAtual: function () { var g = G(); return String((g && g._bimSel) || ""); },

    /* ------------------------------------------------------------ os marcadores das peças (portas, janelas, cômodos, escadas) */
    _itensMarca: function () {
      var b = B(); if (!b) return [];
      var sig = this.assinaturaModelo();
      if (this._cacheMarca && this._cacheMarca.sig === sig) return this._cacheMarca.itens;
      var P = PV(), els = []; try { els = (b.elementos || []).filter(function (e) { return e && e.uid && P.tipoMarca(e.tipo); }); } catch (e) { els = []; }
      /* ⚠ a creche tem ~2 M de triângulos: as caixas saem numa passada só (BIM.caixasDe), e só das peças que viram marcador */
      var cx = {}; try { cx = els.length && b.caixasDe ? b.caixasDe(els.map(function (e) { return e.uid; })) : {}; } catch (e2) { cx = {}; }
      var itens = els.map(function (e) { var c = cx[e.uid]; return c ? { uid: e.uid, chave: e.chave || "", tipo: e.tipo, nome: e.nome || "", min: c.min, max: c.max } : null; }).filter(Boolean);
      this._cacheMarca = { sig: sig, itens: itens };
      return itens;
    },
    _calcMarcas: function (ligs) {
      var st = this._st, P = PV();
      if (st && st.fonte === "link") return;   /* no link elas vieram prontas (com a chave estável da peça) */
      var itens = this._temModelo() ? this._itensMarca() : [];
      /* a folha pronta que já traz os AMBIENTES rotulados (o gerador) não ganha o marcador de cômodo por cima do rótulo */
      arr(ligs).forEach(function (l) { if (l.tipo === "plano") { var mk = P.marcadores(l, itens); l.marcas = arr(l.ambientes).length ? mk.filter(function (m) { return m.tipo !== "comodo"; }) : mk; } });
    },
    /* a folha como a impressão desenha (js/pranchaui.js), com as fotos dos pontos de vista e as imagens guardadas */
    _htmlFolha: function (f, guardar) {
      var st = this._st, self = this;
      if (f.link) return Promise.resolve('<img alt="" src="' + esc(f.link.img) + '" style="position:absolute;left:0;top:0;width:' + f.wMm + "mm;height:" + f.hMm + 'mm">');
      var FU = global.BimFolhaUI, UIx = global.PranchaUI;
      if (!UIx) return Promise.resolve('<div style="padding:20mm">O desenho de prancha não carregou.</div>');
      var rec = { imagens: {}, vistas: {}, viewports: {} };
      try { if (FU && FU.recursos) rec = FU.recursos({ folha: f.folha }, false); } catch (e) {}
      try { if (!rec.logo && global.Empresa && Empresa.logo) rec.logo = Empresa.logo(); if (!rec.empresa && global.Empresa && Empresa.dados) rec.empresa = Empresa.dados(); } catch (e2) {}
      var chaves = {};
      if (f.folha.imagemInteira) chaves[f.folha.imagemInteira] = 1;
      f.folha.blocos.forEach(function (b) { if (b.tipo === "imagem") chaves[b.chave] = 1; });
      arr(f.pr.carimbo && f.pr.carimbo.logos).forEach(function (k) { chaves[k] = 1; });
      st.urls = st.urls || [];
      var pImg = Object.keys(chaves).map(function (k) {
        if (!global.Idb) return Promise.resolve();
        return Idb.get(k).then(function (dado) {
          if (!dado) return;
          if (typeof dado === "string") rec.imagens[k] = dado;
          else { var u = URL.createObjectURL(dado instanceof Blob ? dado : new Blob([dado])); st.urls.push(u); rec.imagens[k] = u; }
        })["catch"](function () {});
      });
      var vistasBl = f.folha.blocos.filter(function (b) { return b.tipo === "vista"; });
      return Promise.all(pImg).then(function () {
        /* as fotos dos pontos de vista: a MESMA rotina da impressão (aplica a vista, fotografa no quadro, devolve a cena) */
        if (!vistasBl.length || !G() || !G()._prFotografarVistas) return null;
        if (!f._fotos) return G()._prFotografarVistas(vistasBl, rec).then(function () { f._fotos = rec.vistas; });
        rec.vistas = f._fotos; return null;
      }).then(function () {
        /* ⚠ só a folha ABERTA guarda os recursos (a textura da folha pronta sai deles): o pacote do link passa por aqui
           com as outras folhas e, sem o `guardar`, trocava a imagem da folha que está na tela */
        if (guardar) st.rec = rec;
        return UIx.folha(f.pr, f.folha, rec, f.geo);
      });
    },
    _htmlLigacoes: function (ligs) {
      return arr(ligs).map(function (l) {
        var R = l.rect;
        return '<div class="pviva-ligarea" style="left:' + R.x + "mm;top:" + R.y + "mm;width:" + R.w + "mm;height:" + R.h + 'mm"><b>' + esc(l.nome || "Vista") + " · 3D</b></div>";
      }).join("");
    },
    _marcasAmbientes: function () {
      var st = this._st, m = this.q("marcas"), self = this; if (!m) return;
      m.innerHTML = "";
      var d = global.document, NOME = { porta: "Porta", janela: "Janela", escada: "Escada", rampa: "Rampa", comodo: "Ambiente" };
      st.ligs.forEach(function (l) {
        arr(l.ambientes).forEach(function (a) {
          if (!isFinite(a.x) || !isFinite(a.y)) return;
          var b = d.createElement("button"); b.type = "button"; b.className = "pviva-amb"; b.textContent = a.nome + (a.area ? " · " + br(a.area) + " m²" : "");
          b.setAttribute("aria-label", a.nome + ": ver no 3D"); b._mm = { x: a.x, y: a.y }; b._nivel = 0.9;
          b.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
          b.addEventListener("click", function (ev) { ev.stopPropagation(); self.tocarMm(a.x, a.y, { ambiente: a }); });
          m.appendChild(b);
        });
        /* as PEÇAS: tocar leva à peça no 3D (a câmera no ponto da folha, a peça escolhida e o cartão dela) */
        arr(l.marcas).forEach(function (mk) {
          if (!isFinite(mk.x) || !isFinite(mk.y)) return;
          var b = d.createElement("button"); b.type = "button"; b.className = "pviva-mk " + mk.tipo; b.setAttribute("data-pviva-mk", mk.tipo);
          var nm = (mk.nome || NOME[mk.tipo] || "Peça");
          b.innerHTML = "<i>" + esc(mk.rotulo || "•") + "</i>"; b.title = (NOME[mk.tipo] || "Peça") + (mk.tipo === "comodo" ? "" : ": " + nm) + " — ver no 3D";
          b.setAttribute("aria-label", b.title);
          /* o cômodo aparece com a folha inteira na tela; porta/janela só com a folha aproximada (senão vira poeira) */
          b._mm = { x: mk.x, y: mk.y }; b._nivel = mk.tipo === "comodo" ? 0.9 : 1.7;
          b.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
          b.addEventListener("click", function (ev) { ev.stopPropagation(); self.tocarMm(mk.x, mk.y, { marca: mk }); });
          m.appendChild(b);
        });
      });
      this._posMarcas();
    },
    _posMarcas: function () {
      var st = this._st, m = this.q("marcas"); if (!m) return;
      var v = st.v, on = st.marcasOn !== false;
      Array.prototype.forEach.call(m.querySelectorAll(".pviva-amb,.pviva-mk"), function (b) {
        b.style.left = (v.tx + b._mm.x * v.s) + "px"; b.style.top = (v.ty + b._mm.y * v.s) + "px"; b.hidden = !on || v.s < (b._nivel || 0.9);
      });
    },

    /* ------------------------------------------------------------ 2D: enquadrar, arrastar, aproximar */
    ajustar: function () {
      var st = this._st, f = st.folhas[st.atual], p = this.q("palco"); if (!f || !p) return;
      var W = p.clientWidth || 800, H = p.clientHeight || 600, m = W < 600 ? 10 : 28;
      var s = Math.min((W - 2 * m) / f.wMm, (H - 2 * m - 30) / f.hMm);
      st.sMin = s * 0.5; st.sMax = 40;
      st.v = { s: s, tx: (W - f.wMm * s) / 2, ty: (H - f.hMm * s) / 2 + 12 };
      this._pintar2d();
    },
    _zoom: function (cx, cy, k) {
      var st = this._st, v = st.v, s2 = clamp(v.s * k, st.sMin || 0.05, st.sMax || 40), q = s2 / v.s;
      v.tx = cx - (cx - v.tx) * q; v.ty = cy - (cy - v.ty) * q; v.s = s2; this._pintar2d();
    },
    _pintar2d: function () {
      var st = this._st, pap = this.q("papel"); if (!pap) return;
      var v = st.v, k = v.s / MM_PX;
      pap.style.transform = "translate(" + v.tx + "px," + v.ty + "px) scale(" + k + ")";
      this._posMarcas();
    },
    /* ponto da tela (cliente) → mm da folha, e a volta */
    mmDe: function (cx, cy) { var st = this._st, r = this.q("palco").getBoundingClientRect(); return { x: (cx - r.left - st.v.tx) / st.v.s, y: (cy - r.top - st.v.ty) / st.v.s }; },
    telaDeMm: function (x, y) { var st = this._st, r = this.q("palco").getBoundingClientRect(); return { x: r.left + st.v.tx + x * st.v.s, y: r.top + st.v.ty + y * st.v.s }; },
    _ligarPalco: function () {
      var p = this.q("palco"), self = this, pts = {}, n = 0, ini = null, pinca = null;
      function lista() { return Object.keys(pts).map(function (k) { return pts[k]; }); }
      p.addEventListener("pointerdown", function (e) {
        var st = self._st; if (!st || st.modo !== "2d" || st.ocupado) return;
        if (e.target && e.target.closest && e.target.closest("button")) return;
        try { p.setPointerCapture(e.pointerId); } catch (eC) {}
        pts[e.pointerId] = { x: e.clientX, y: e.clientY }; n = lista().length;
        var r = p.getBoundingClientRect();
        if (n === 1) ini = { x: e.clientX, y: e.clientY, t: e.timeStamp || agora(), tx: st.v.tx, ty: st.v.ty, moveu: false };   /* o tempo do dedo (ver _ligarCanvas) */
        if (n === 2) { var a = lista()[0], b = lista()[1]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: st.v.s, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, tx: st.v.tx, ty: st.v.ty }; if (ini) ini.moveu = true; }
      });
      p.addEventListener("pointermove", function (e) {
        var st = self._st; if (!st || !pts[e.pointerId]) return;
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var r = p.getBoundingClientRect();
        if (lista().length === 2 && pinca) {
          var a = lista()[0], b = lista()[1], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
          var s2 = clamp(pinca.s * d / pinca.d, st.sMin || 0.05, st.sMax || 40), q = s2 / pinca.s;
          st.v.s = s2; st.v.tx = mx - (pinca.mx - pinca.tx) * q; st.v.ty = my - (pinca.my - pinca.ty) * q; self._pintar2d();
        } else if (ini) {
          var dx = e.clientX - ini.x, dy = e.clientY - ini.y;
          if (Math.hypot(dx, dy) > 7) ini.moveu = true;
          if (ini.moveu) { st.v.tx = ini.tx + dx; st.v.ty = ini.ty + dy; self._pintar2d(); }
        }
      });
      function fim(e) {
        var st = self._st; if (!st || !pts[e.pointerId]) return;
        delete pts[e.pointerId];
        if (lista().length < 2) pinca = null;
        if (lista().length === 1) { var r0 = lista()[0]; ini = { x: r0.x, y: r0.y, t: agora(), tx: st.v.tx, ty: st.v.ty, moveu: true }; }
        if (!lista().length && ini && e.type === "pointerup") {
          var toque = !ini.moveu && (e.timeStamp || agora()) - ini.t < 900; ini = null;
          if (toque) self.tocarTela(e.clientX, e.clientY);
        }
      }
      p.addEventListener("pointerup", fim); p.addEventListener("pointercancel", fim);
      p.addEventListener("wheel", function (e) {
        var st = self._st; if (!st || st.modo !== "2d") return; e.preventDefault();
        var r = p.getBoundingClientRect(); self._zoom(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
      }, { passive: false });
    },
    tocarTela: function (cx, cy) {
      var mm = this.mmDe(cx, cy), p = this.q("palco"), r = p.getBoundingClientRect();
      var pu = global.document.createElement("i"); pu.className = "pviva-pulso"; pu.style.left = (cx - r.left) + "px"; pu.style.top = (cy - r.top) + "px";
      this.q("marcas").appendChild(pu); setTimeout(function () { if (pu.parentNode) pu.parentNode.removeChild(pu); }, 800);
      return this.tocarMm(mm.x, mm.y);
    },
    /* o toque na folha (mm): acha a vista ligada e entra no 3D ali */
    tocarMm: function (x, y, extra) {
      var st = this._st; if (!st || st.ocupado || st.modo !== "2d") return Promise.resolve(false);
      try { if (st.fonte === "obra" && global.TesteModulo && TesteModulo.tocar) TesteModulo.tocar("pranchaviva"); } catch (eT) {}
      this.guia(false);
      var lig = PV().ligacaoEm(st.ligs, x, y);
      if (!lig) {
        var f = st.folhas[st.atual];
        this._msg(st.ligs.length ? "Esse ponto fica fora das vistas ligadas ao modelo (os quadros com o contorno azul). Toque dentro de um deles." :
          (f && f.folha && f.folha.imagemInteira ? "Esta folha é uma imagem pronta sem a matriz de ligação: importe-a com o pranchas.json do gerador (Importar pranchas ligadas)." :
            st.fonte === "link" ? "Esta folha não tem vista ligada ao modelo. Escolha outra prancha na lista." :
            st.espera3d && st.espera3d.motivo === "sem-modelo" ? "As vistas desta folha são desenhadas do modelo: abra o modelo da obra (botões abaixo) para tocar nela." :
            "Esta folha não tem vista do modelo: use Gerar as pranchas do modelo (na lista), posicione uma planta ou um corte nela (Pranchas do projeto), ou monte a prancha com pontos de vista."), "aviso");
        return Promise.resolve(false);
      }
      /* o 3D ainda não chegou: guarda o toque (o último vale) e abre sozinho quando chegar */
      if (st.espera3d) {
        if (st.espera3d.motivo === "carregando") {
          st.pendente = { lig: lig, x: x, y: y, extra: extra || {} };
          this._pintarFaixa();
          this._msg("Guardei o ponto: ele abre no 3D assim que o modelo terminar de chegar.", "info");
        } else this._msg("O modelo 3D desta obra não está aberto: abra os modelos da obra ou um arquivo IFC (botões abaixo).", "aviso");
        return Promise.resolve(false);
      }
      return this.irPara3D(lig, x, y, extra || {});
    },

    /* ==================================================================
     * A CENA: guardar, devolver, os planos de corte, o desenho no plano
     * ================================================================== */
    _api: function () { var b = B(); return b && b.pranchaVivaApi ? b.pranchaVivaApi() : null; },
    _guardarCena: function () {
      var st = this._st, b = B(), api = this._api(); if (st.salvo || !api) return;
      var est = null; try { est = b.estadoVista ? b.estadoVista() : null; } catch (e) { est = null; }
      st.salvo = { est: est, clip: (api.renderer.clippingPlanes || []).slice(), local: !!api.renderer.localClippingEnabled, fov: api.camera.fov,
        pos: api.camera.position.toArray(), alvo: api.orbit ? api.orbit.target.toArray() : null };
      /* os cortes do BIM saem enquanto a Prancha Viva usa o renderer: dois donos no clippingPlanes é o defeito que o
         corte livre e a planta já tiveram ("disputam o clippingPlanes", js/bim.js setCorteL) */
      try { if (b.corteEstado && b.corteEstado().on && b.corte) b.corte(false); } catch (e1) {}
      try { if (b.planta) b.planta(false); } catch (e2) {}
      try { if (b.caixaCorteAtiva && b.caixaCorteAtiva() && b.caixaCorte) b.caixaCorte(false); } catch (e3) {}
      this._ligarTick(true);
      this._ligarCanvas(true);
    },
    _restaurarCena: function () {
      var st = this._st, b = B(), api = this._api(); if (!st || !st.salvo) return;
      this._medir(false);
      this._tirarDesenho();
      this._ligarTick(false);
      var sv = st.salvo; st.salvo = null;
      if (api) {
        api.renderer.clippingPlanes = sv.clip; api.renderer.localClippingEnabled = sv.local;
        api.camera.fov = sv.fov; api.camera.updateProjectionMatrix();
        if (api.orbit) api.orbit.enabled = true;
      }
      /* ⚠ a peça escolhida PELA Prancha Viva sai com ela: no celular, a seleção que ficava pendurada fazia o toque seguinte
         no visor ser lido como gesto da seleção e a ficha da peça não abria (e2e de 23/10/2026) */
      if (st.selFeita) { try { b.selecionar([], "trocar"); } catch (eS) {} st.selFeita = false; }
      Object.keys(st.discOff).forEach(function (k) { try { b.disciplinaVisivel(k, true); } catch (e) {} });
      st.discOff = {};
      try { if (sv.est && b.aplicarVista && global.BimVista) b.aplicarVista(BimVista.vista({ nome: "_antes", completa: true, camera: sv.est.camera, cortes: sv.est.cortes, visibilidade: sv.est.visibilidade, aparencias: sv.est.aparencias, modelos: sv.est.modelos, estilo: sv.est.estilo, medidas: sv.est.medidas, cotaRede: sv.est.cotaRede })); }
      catch (e2) { if (api && sv.alvo) { api.camera.position.fromArray(sv.pos); api.orbit.target.fromArray(sv.alvo); } }
    },
    _planos: function (off, k) {
      var st = this._st, api = this._api(); if (!api) return;
      var T = api.THREE, lig = st.ligCorte || st.lig;
      if (!st.corteOn || !lig) { api.renderer.clippingPlanes = []; return; }
      var pls = PV().planosCorte(lig, off, k);
      st._pl = st._pl || [new T.Plane(), new T.Plane()];
      var out = pls.map(function (p, i) { st._pl[i].normal.set(p.normal[0], p.normal[1], p.normal[2]); st._pl[i].constant = p.constante; return st._pl[i]; });
      api.renderer.localClippingEnabled = true;
      api.renderer.clippingPlanes = out;
    },
    /* o desenho da vista no plano dela (papel branco + traço), uma textura só */
    _desenho: function (lig) {
      var st = this._st, api = this._api(), self = this; if (!api || !lig || lig.tipo !== "plano") return Promise.resolve(null);
      var T = api.THREE, R = lig.enc ? { x: lig.enc.ox, y: lig.enc.oy, w: lig.vb.w * lig.enc.k, h: lig.vb.h * lig.enc.k } : lig.rect;
      var n = lig.n, d = 0.003;   /* um nada além do plano: o corte do renderer não apaga o desenho */
      var cantos = [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]].map(function (c) { var p = PV().doPapel(lig, c[0], c[1]); return new T.Vector3(p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d); });
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute([].concat.apply([], cantos.map(function (v) { return [v.x, v.y, v.z]; })), 3));
      geo.setAttribute("uv", new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      var papel = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, side: T.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
      papel.renderOrder = 9000; papel.raycast = function () {};
      var grp = new T.Group(); grp.add(papel); grp.name = "prancha-viva";
      api.scene.add(grp);
      st.quad = { grp: grp, papel: papel, tinta: null, geo: geo };
      return this._imagemDoDesenho(lig, R).then(function (cv) {
        if (!cv || !st.quad || st.quad.grp !== grp) return null;
        var tex = new T.CanvasTexture(cv); try { tex.colorSpace = T.SRGBColorSpace; } catch (e) {}
        try { tex.anisotropy = api.renderer.capabilities.getMaxAnisotropy(); } catch (e2) {}
        var tinta = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
        tinta.renderOrder = 9001; tinta.raycast = function () {};
        grp.add(tinta); st.quad.tinta = tinta; st.quad.tex = tex;
        if (st.quad.opTinta != null) tinta.material.opacity = st.quad.opTinta;
        return tinta;
      })["catch"](function () { return null; });
    },
    _tirarDesenho: function () {
      var st = this._st, api = this._api(); if (!st || !st.quad) return;
      var q = st.quad; st.quad = null;
      try { if (api) api.scene.remove(q.grp); } catch (e) {}
      try { q.geo.dispose(); q.papel.material.dispose(); if (q.tinta) { q.tinta.material.dispose(); } if (q.tex) q.tex.dispose(); } catch (e2) {}
    },
    /* a textura: o SVG da vista (sem o papel) ou a imagem da folha pronta, num canvas de até 4096 px */
    _imagemDoDesenho: function (lig, R) {
      var st = this._st, f = st.folhas[st.atual], d = global.document;
      var fonte = lig.textura || {};
      function rasterizar(src, w, h, rec) {
        return new Promise(function (ok) {
          var im = new Image(); im.decoding = "async";
          im.onload = function () {
            var cv = d.createElement("canvas"); cv.width = w; cv.height = h;
            var g = cv.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
            try { if (rec) g.drawImage(im, rec.x, rec.y, rec.w, rec.h, 0, 0, w, h); else g.drawImage(im, 0, 0, w, h); } catch (e) { ok(null); return; }
            ok(cv);
          };
          im.onerror = function () { ok(null); };
          im.src = src;
        });
      }
      var k = Math.min(4, 4096 / Math.max(R.w, R.h)), W = Math.max(8, Math.round(R.w * k)), H = Math.max(8, Math.round(R.h * k));
      if (fonte.tipo === "svg" && global.PranchaUI && global.BimFolhaUI) {
        var dz = null; try { dz = BimFolhaUI.desenho(fonte.vistaId); } catch (e) { dz = null; }
        if (!dz) return Promise.resolve(null);
        var bl = fonte.bloco, vb = lig.vb;
        var s = PranchaUI.viewportSvg(dz, bl)
          .replace(/<rect[^>]*class="d2-papel"[^>]*\/>/g, "")
          .replace(/width="100%" height="100%"/, 'width="' + W + '" height="' + H + '"')
          .replace(/viewBox="[^"]*"/, 'viewBox="' + vb.x + " " + vb.y + " " + vb.w + " " + vb.h + '"');
        var url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
        return rasterizar(url, W, H, null).then(function (cv) { try { URL.revokeObjectURL(url); } catch (e) {} return cv; });
      }
      if (fonte.tipo === "img" || (f && f.link)) {
        var src = f && f.link ? f.link.img : (st.rec && st.rec.imagens ? st.rec.imagens[fonte.chave] : "");
        if (!src) return Promise.resolve(null);
        return new Promise(function (ok) {
          var im = new Image(); im.onload = function () {
            /* a imagem é a folha inteira (wMm × hMm): o recorte R em px da imagem */
            var sx = im.naturalWidth / f.wMm, sy = im.naturalHeight / f.hMm;
            var cv = d.createElement("canvas"); cv.width = W; cv.height = H;
            var g = cv.getContext("2d");
            try { g.drawImage(im, R.x * sx, R.y * sy, R.w * sx, R.h * sy, 0, 0, W, H); } catch (e) { ok(null); return; }
            /* o branco do papel vira transparente (o traço fica; o modelo aparece por trás quando o papel some) */
            try { var px = g.getImageData(0, 0, W, H), a = px.data; for (var i = 0; i < a.length; i += 4) { var l = (a[i] + a[i + 1] + a[i + 2]) / 3; if (l > 235) a[i + 3] = 0; else a[i + 3] = Math.min(255, (255 - l) * 1.6); } g.putImageData(px, 0, 0); } catch (e2) {}
            ok(cv);
          };
          im.onerror = function () { ok(null); }; im.src = src;
        });
      }
      return Promise.resolve(null);
    },

    /* ------------------------------------------------------------ o laço (a câmera da transição e os marcadores) */
    _ligarTick: function (on) {
      var st = this._st, api = this._api(), self = this; if (!st || !api) return;
      function tira(lista, fn) { var i = lista.indexOf(fn); if (i >= 0) lista.splice(i, 1); }
      if (!on) { if (st.tick) tira(api.tickExtra, st.tick); if (st.tickPos) tira(api.tickPos, st.tickPos); st.tick = st.tickPos = null; return; }
      if (st.tick) return;
      st.tick = function () { if (st.anim) { try { st.anim(agora()); } catch (e) { st.anim = null; } } };
      st.tickPos = function () { if (st.modo === "3d") { try { self._sobreposicoes(); } catch (e) {} } };
      api.tickExtra.push(st.tick); api.tickPos.push(st.tickPos);
    },
    _aplicarCam: function (e, fov) {
      var api = this._api(); if (!api) return;
      var p = PV().posDe(e), c = api.camera;
      if (fov != null && Math.abs(c.fov - fov) > 1e-6) { c.fov = fov; c.updateProjectionMatrix(); }
      c.up.set(0, 1, 0); c.position.set(p[0], p[1], p[2]); c.lookAt(e.alvo[0], e.alvo[1], e.alvo[2]);
      if (api.orbit) api.orbit.target.set(e.alvo[0], e.alvo[1], e.alvo[2]);
    },
    _camAtual: function () {
      var api = this._api(), c = api.camera, t = api.orbit ? api.orbit.target : null;
      return PV().esferico(t ? [t.x, t.y, t.z] : [0, 0, 0], [c.position.x, c.position.y, c.position.z]);
    },
    _animar: function (ms, passo) {
      var st = this._st;
      ms = ms * (st.lento || 1);   /* st.lento: só o teste, para fotografar o meio da transição */
      return new Promise(function (ok) {
        var t0 = null;
        st.anim = function (t) {
          if (t0 == null) t0 = t;
          /* st.congela: o teste PARA a transição num instante (mede o primeiro quadro: a folha e o 3D no mesmo pixel) */
          var u = st.congela != null ? +st.congela : Math.min(1, (t - t0) / ms);
          passo(u);
          if (u >= 1) { st.anim = null; ok(); }
        };
      });
    },
    _caixa: function () {
      var b = B(), c = null; try { c = b.pavimentos2d ? b.pavimentos2d().caixa : null; } catch (e) { c = null; }
      return c;
    },
    _raio: function (r) {
      var api = this._api(); if (!api) return null;
      var T = api.THREE, rc = new T.Raycaster(new T.Vector3(r.origem[0], r.origem[1], r.origem[2]), new T.Vector3(r.dir[0], r.dir[1], r.dir[2]));
      var hits = rc.intersectObjects(api.modelRoot.children, true);
      for (var i = 0; i < hits.length; i++) { var o = hits[i].object, vis = true; while (o) { if (o.visible === false) { vis = false; break; } o = o.parent; } if (vis) return [hits[i].point.x, hits[i].point.y, hits[i].point.z]; }
      return null;
    },

    /* ==================================================================
     * FOLHA → 3D
     * ================================================================== */
    irPara3D: function (lig, x, y, extra) {
      var st = this._st, self = this, api = this._api(), P0 = PV();
      if (!api) { toast("O visualizador 3D não está aberto.", "erro"); return Promise.resolve(false); }
      st.ocupado = true;
      this._pausar3d(false);
      this._guardarCena();
      var cv = api.canvas.getBoundingClientRect(), P;
      if (lig.tipo === "plano") P = P0.doPapel(lig, x, y);
      else {
        var r = P0.raioDoPapel(lig, x, y);
        P = this._raio(r);
        if (!P) { var dd = Math.sqrt(Math.pow(lig.cam.alvo[0] - lig.cam.pos[0], 2) + Math.pow(lig.cam.alvo[1] - lig.cam.pos[1], 2) + Math.pow(lig.cam.alvo[2] - lig.cam.pos[2], 2)); P = [r.origem[0] + r.dir[0] * dd, r.origem[1] + r.dir[1] * dd, r.origem[2] + r.dir[2] * dd]; }
      }
      var caixa = this._caixa(), tam = caixa ? Math.sqrt(Math.pow(caixa.max[0] - caixa.min[0], 2) + Math.pow(caixa.max[1] - caixa.min[1], 2) + Math.pow(caixa.max[2] - caixa.min[2], 2)) : 40;
      var fovBase = st.salvo && st.salvo.fov ? st.salvo.fov : api.camera.fov, fov0 = fovBase, e0;
      if (lig.tipo === "plano") {
        /* a câmera que mostra o plano EXATAMENTE como a tela mostra a folha agora: o ponto da folha no centro do canvas
           fica no centro, e 1 mm de papel tem os mesmos px nas duas */
        var c0mm = this.mmDe(cv.left + cv.width / 2, cv.top + cv.height / 2);
        e0 = P0.esfericoDaFolha(P0.camDaFolha(lig, c0mm, st.v.s, cv.height, fovBase));
        st.ligCorte = null;
      } else {
        e0 = P0.esferico(lig.cam.alvo, lig.cam.pos);
        var hb = Math.max(20, lig.rect.h * st.v.s);
        fov0 = clamp(2 * Math.atan(Math.tan(lig.cam.fov * Math.PI / 360) * cv.height / hb) * 180 / Math.PI, 5, 150);
        /* o ponto de vista é perspectiva: o corte que ele ganha é o horizontal, 1,10 m acima do ponto tocado (desligado) */
        st.ligCorte = { tipo: "plano", vista: "planta", M: [[1, 0, 0], [0, 0, P[1] + 1.1], [0, 1, 0]], n: [0, -1, 0], rect: { x: P[0] - 1, y: P[2] - 1, w: 2, h: 2 }, mmPorM: 1, cota: P[1] + 1.1 };
      }
      var e1 = P0.camFinal(lig, P, e0, tam);
      var ext = P0.extensao(st.ligCorte || lig, caixa);
      var mk = extra && extra.marca ? extra.marca : null;
      st.lig = lig; st.alvo = { P: P, mm: { x: x, y: y }, nome: extra && extra.ambiente ? extra.ambiente.nome : mk ? (mk.nome || mk.rotulo || "") : "", area: extra && extra.ambiente ? extra.ambiente.area : 0, marca: mk };
      st.off = 0; st.offMin = Math.min(-0.05, ext.kmin + 0.2); st.offMax = Math.max(0.05, ext.kmax - 0.5);
      st.corteOn = lig.tipo === "plano"; st.sel = null;
      this._painelInfo(null);
      if (lig.tipo === "plano") this._desenho(lig);
      st.cam0 = { e: e0, fov: fov0 }; st.fovBase = fovBase;
      this._planos(0, 0.005);
      this._aplicarCam(e0, fov0);
      if (api.orbit) api.orbit.enabled = false;
      st.modo = "trans"; st.el.classList.add("pviva-trans");
      var palco = this.q("palco"), dica = this.q("dica"); if (dica) dica.hidden = true;
      this._tit(st.folhas[st.atual].titulo, "saindo da prancha…");
      return this._animar(2300, function (u) {
        var e = P0.suave(clamp(u / 0.92, 0, 1));
        self._aplicarCam(P0.interp(e0, e1, e), fov0 + (fovBase - fov0) * e);
        palco.style.opacity = String(1 - P0.suave(clamp(u / 0.3, 0, 1)));
        if (st.quad) {
          st.quad.papel.material.opacity = 1 - P0.suave(clamp((u - 0.05) / 0.5, 0, 1));
          var ot = u < 0.7 ? 1 : 1 - 0.85 * P0.suave((u - 0.7) / 0.3); st.quad.opTinta = ot; if (st.quad.tinta) st.quad.tinta.material.opacity = ot;
        }
        if (lig.tipo === "plano") self._planos(0, u >= 1 ? null : Math.max(0.005, ext.kmax * P0.suave(clamp((u - 0.12) / 0.88, 0, 1))));
      }).then(function () {
        if (self._st !== st) return false;
        self._aplicarCam(e1, fovBase);
        if (api.orbit) { api.orbit.enabled = true; try { api.orbit.update(); } catch (e) {} }
        st.modo = "3d"; st.el.classList.remove("pviva-trans"); st.el.classList.add("pviva-em3d");
        palco.style.opacity = "";
        self.q("3d").hidden = false;
        self.moverCorte(0);
        self._pintarBotoes();
        self._tit(st.folhas[st.atual].titulo + " · 3D", "arraste para girar · role ou pince para aproximar · toque numa peça");
        self._montarSobre();
        st.ocupado = false;
        /* o MARCADOR leva à peça: escolhida no 3D e o cartão dela aberto (no celular, a chave estável vira o uid daqui) */
        if (mk) { try { self._escolherMarca(mk); } catch (eMk) {} }
        try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("prancha-viva", "3d", { vista: lig.nome || "", tipo: lig.vista || lig.tipo, marca: mk ? mk.tipo : "" }); } catch (eA) {}
        return true;
      });
    },

    /* ==================================================================
     * 3D → FOLHA (o mesmo ponto)
     * ================================================================== */
    pontoDeVolta: function () {
      var st = this._st, api = this._api();
      if (st.sel && st.sel.P) return st.sel.P;
      var t = api && api.orbit ? api.orbit.target : null;
      return t ? [t.x, t.y, t.z] : (st.alvo ? st.alvo.P : [0, 0, 0]);
    },
    mmDeVolta: function (P) {
      var st = this._st, lig = st.lig, P0 = PV(), mm;
      if (!lig) return null;
      mm = P0.paraPapel(lig, P);
      var R = lig.rect;
      if (!isFinite(mm.x) || !isFinite(mm.y)) mm = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
      return { x: clamp(mm.x, R.x, R.x + R.w), y: clamp(mm.y, R.y, R.y + R.h), fora: !(mm.x >= R.x && mm.y >= R.y && mm.x <= R.x + R.w && mm.y <= R.y + R.h) };
    },
    voltar: function (rapido) {
      var st = this._st, self = this, api = this._api(), P0 = PV();
      if (!st || st.modo !== "3d" || st.ocupado || !api) return Promise.resolve(false);
      st.ocupado = true;
      this._medir(false); this._painelInfo(null); this._abrirDisc(false);
      var P = this.pontoDeVolta(), mm = this.mmDeVolta(P), lig = st.lig;
      var cv = api.canvas.getBoundingClientRect(), pr = this.q("palco").getBoundingClientRect();
      /* a folha volta com o ponto do 3D no centro do canvas, na mesma escala */
      st.v.tx = cv.left + cv.width / 2 - pr.left - mm.x * st.v.s; st.v.ty = cv.top + cv.height / 2 - pr.top - mm.y * st.v.s;
      this._pintar2d();
      var de = this._camAtual(), para, fovPara = st.fovBase;
      if (lig.tipo === "plano") para = P0.esfericoDaFolha(P0.camDaFolha(lig, mm, st.v.s, cv.height, st.fovBase));
      else { para = st.cam0.e; fovPara = st.cam0.fov; }
      this.q("3d").hidden = true; this.q("sobre").innerHTML = "";
      st.el.classList.remove("pviva-em3d"); st.el.classList.add("pviva-trans");
      var palco = this.q("palco"); palco.style.opacity = "0";
      if (api.orbit) api.orbit.enabled = false;
      var off0 = st.off, ext = P0.extensao(lig.tipo === "plano" ? lig : null, this._caixa());
      st.corteOn = lig.tipo === "plano";
      if (!st.quad && lig.tipo === "plano") this._desenho(lig);
      this._tit(st.folhas[st.atual].titulo, "voltando para a folha…");
      return this._animar(rapido ? 650 : 1500, function (u) {
        var e = P0.suave(u);
        self._aplicarCam(P0.interp(de, para, e), st.fovBase + (fovPara - st.fovBase) * e);
        if (lig.tipo === "plano") self._planos(off0 * (1 - e), Math.max(0.005, ext.kmax * (1 - P0.suave(clamp(u / 0.85, 0, 1)))));
        /* o desenho volta junto com o plano (a alça pode tê-lo levado para outra cota; o corte pode estar desligado) */
        if (st.quad && lig.n) { var oq = off0 * (1 - e); st.quad.grp.position.set(lig.n[0] * oq, lig.n[1] * oq, lig.n[2] * oq); st.quad.grp.visible = true; }
        if (st.quad) { st.quad.papel.material.opacity = P0.suave(clamp((u - 0.35) / 0.6, 0, 1)); st.quad.opTinta = 1; if (st.quad.tinta) st.quad.tinta.material.opacity = 1; }
        palco.style.opacity = String(P0.suave(clamp((u - 0.72) / 0.28, 0, 1)));
      }).then(function () {
        if (self._st !== st) return false;
        st.modo = "2d"; st.el.classList.remove("pviva-trans"); palco.style.opacity = "";
        self._tirarDesenho();
        if (api) { api.renderer.clippingPlanes = []; }
        var dica = self.q("dica"); if (dica) dica.hidden = false;
        self._tit(st.folhas[st.atual].titulo, "toque num ponto para abrir o 3D");
        var t = self.telaDeMm(mm.x, mm.y), r = palco.getBoundingClientRect();
        var pu = global.document.createElement("i"); pu.className = "pviva-pulso"; pu.style.left = (t.x - r.left) + "px"; pu.style.top = (t.y - r.top) + "px";
        self.q("marcas").appendChild(pu); setTimeout(function () { if (pu.parentNode) pu.parentNode.removeChild(pu); }, 900);
        st.volta = { mm: mm, P: P };
        self._pausar3d(true);
        st.ocupado = false;
        return true;
      });
    },

    /* ------------------------------------------------------------ o corte na cota (controle + alça) */
    moverCorte: function (off) {
      var st = this._st; if (!st) return;
      st.off = clamp(+off || 0, st.offMin, st.offMax);
      this._planos(st.off, null);
      var lig = st.ligCorte || st.lig, rg = this.q("corterange"), tx = this.q("cortetxt");
      var fr = (st.off - st.offMin) / Math.max(1e-6, st.offMax - st.offMin);
      if (rg) rg.value = String(Math.round(((lig && (lig.vista === "planta")) ? 1 - fr : fr) * 1000));
      if (tx) tx.textContent = st.corteOn ? PV().textoCorte(lig, st.off) : "Corte desligado";
      if (st.quad) {
        var longe = Math.abs(st.off) > 0.02;
        st.quad.opTinta = longe ? 0.12 : 0.15; if (st.quad.tinta) st.quad.tinta.material.opacity = st.quad.opTinta;
        var n = lig.n; st.quad.grp.position.set(n[0] * st.off, n[1] * st.off, n[2] * st.off);
        st.quad.grp.visible = st.corteOn;
      }
    },
    _ligarCorte: function () {
      var self = this, rg = this.q("corterange"); if (!rg) return;
      rg.addEventListener("input", function () {
        var st = self._st; if (!st) return;
        var lig = st.ligCorte || st.lig, fr = (+rg.value) / 1000;
        self.moverCorte(st.offMin + (st.offMax - st.offMin) * ((lig && lig.vista === "planta") ? 1 - fr : fr));
      });
    },
    _pontoAlca: function () {
      var st = this._st, lig = st.ligCorte || st.lig, n = lig.n, P = st.alvo ? st.alvo.P : [0, 0, 0];
      /* o ponto tocado PROJETADO no plano do corte (que andou `off` no sentido do olhar) */
      var pl = PV().planosCorte(lig, st.off, null)[0];
      if (!pl) return P;
      var dist = n[0] * P[0] + n[1] * P[1] + n[2] * P[2] + pl.constante;
      return [P[0] - n[0] * dist, P[1] - n[1] * dist, P[2] - n[2] * dist];
    },
    _montarSobre: function () {
      var st = this._st, so = this.q("sobre"), self = this; if (!so) return;
      so.innerHTML = "";
      var d = global.document, pino = d.createElement("div"); pino.className = "pviva-pino"; pino.setAttribute("data-pviva", "pino");
      var P = st.alvo.P;
      pino.innerHTML = "<b>" + esc(st.alvo.nome || "Ponto tocado na prancha") + "<small>" + (st.alvo.area ? br(st.alvo.area) + " m² · " : "") + "X " + br(P[0]) + " · Y " + br(-P[2]) + " · Z " + br(P[1]) + " m</small></b><i></i>";
      so.appendChild(pino);
      var a = d.createElement("div"); a.className = "pviva-alca"; a.setAttribute("data-pviva", "alca"); a.setAttribute("role", "slider"); a.setAttribute("aria-label", "Arrastar o plano de corte"); a.title = "Arraste para mover o corte";
      a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/></svg>';
      so.appendChild(a);
      var ini = null;
      a.addEventListener("pointerdown", function (ev) {
        ev.stopPropagation(); ev.preventDefault(); try { a.setPointerCapture(ev.pointerId); } catch (e) {}
        var api = self._api(), lig = st.ligCorte || st.lig, p0 = self._pontoAlca(), n = lig.n, b = B();
        var t0 = b.telaDe(p0[0], p0[1], p0[2]), t1 = b.telaDe(p0[0] + n[0], p0[1] + n[1], p0[2] + n[2]);
        var vx = t1.x - t0.x, vy = t1.y - t0.y;
        ini = { x: ev.clientX, y: ev.clientY, off: st.off, vx: vx, vy: vy, l2: vx * vx + vy * vy || 1 };
        if (api && api.orbit) api.orbit.enabled = false;
      });
      a.addEventListener("pointermove", function (ev) { if (!ini) return; self.moverCorte(ini.off + ((ev.clientX - ini.x) * ini.vx + (ev.clientY - ini.y) * ini.vy) / ini.l2); });
      function fim() { if (!ini) return; ini = null; var api = self._api(); if (api && api.orbit) api.orbit.enabled = true; }
      a.addEventListener("pointerup", fim); a.addEventListener("pointercancel", fim);
      this._sobreposicoes();
    },
    _sobreposicoes: function () {
      var st = this._st, b = B(); if (!st || st.modo !== "3d" || !b || !b.telaDe) return;
      var R = st.el.getBoundingClientRect(), pino = this.q("pino"), alca = this.q("alca");
      if (pino && st.alvo) { var t = b.telaDe(st.alvo.P[0], st.alvo.P[1], st.alvo.P[2]); pino.style.left = (t.x - R.left) + "px"; pino.style.top = (t.y - R.top) + "px"; pino.hidden = !!t.atras; }
      if (alca) {
        if (!st.corteOn) { alca.hidden = true; return; }
        var p = this._pontoAlca(), ta = b.telaDe(p[0], p[1], p[2]); alca.style.left = (ta.x - R.left) + "px"; alca.style.top = (ta.y - R.top) + "px"; alca.hidden = !!ta.atras;
      }
    },

    /* ------------------------------------------------------------ disciplinas, medir, início */
    _abrirDisc: function (on) {
      var st = this._st, el = this.q("disc"), b = B(); if (!el) return;
      if (on == null) on = el.hidden;
      el.hidden = !on;
      if (on) {
        var ds = []; try { ds = b.disciplinas ? b.disciplinas() : []; } catch (e) { ds = []; }
        el.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Disciplinas</div>' + (ds.length ? ds.map(function (d) {
          return '<div class="pviva-disc-l"><label><input type="checkbox" data-pviva-disc="' + esc(d.chave) + '"' + (d.oculta ? "" : " checked") + "> " + esc(d.nome) + ' <small style="color:var(--pv-sub)">(' + (d.n || 0) + ")</small></label>" +
            (ds.length > 1 ? '<button type="button" class="pviva-so" data-pviva-so="' + esc(d.chave) + '" title="Mostrar só esta disciplina (isolar)">só esta</button>' : "") + "</div>";
        }).join("") + (ds.length > 1 ? '<div style="margin-top:6px"><button type="button" class="pviva-so" data-pviva-so="*">mostrar todas</button></div>' : "") : '<div style="color:var(--pv-sub)">Só um modelo aberto.</div>');
        function liga(k, on) { try { b.disciplinaVisivel(k, on); } catch (e) {} if (on) delete st.discOff[k]; else st.discOff[k] = 1; }
        Array.prototype.forEach.call(el.querySelectorAll("[data-pviva-disc]"), function (c) {
          c.onchange = function () { liga(c.getAttribute("data-pviva-disc"), c.checked); if (st.sel && !c.checked) self._painelInfo(null); };
        });
        /* ISOLAR: só a disciplina escolhida fica; "mostrar todas" devolve (o fechar da Prancha Viva também devolve tudo) */
        Array.prototype.forEach.call(el.querySelectorAll("[data-pviva-so]"), function (bt) {
          bt.onclick = function () {
            var alvo = bt.getAttribute("data-pviva-so");
            ds.forEach(function (d) { liga(d.chave, alvo === "*" || d.chave === alvo); });
            Array.prototype.forEach.call(el.querySelectorAll("[data-pviva-disc]"), function (c) { c.checked = alvo === "*" || c.getAttribute("data-pviva-disc") === alvo; });
            st.sel = null; self._painelInfo(null);
          };
        });
      }
      var self = this; this._pintarBotoes();
    },
    _medir: function (on) {
      var st = this._st, b = B(); if (!st) return;
      if (on == null) on = !st.medindo;
      if (on === st.medindo) return;
      st.medindo = !!on;
      try { if (b && b.medir) b.medir(!!on); } catch (e) {}
      if (on) { this._painelInfo(null); this._tit(st.folhas[st.atual].titulo + " · 3D", "Medir: toque em dois pontos do modelo (Esc sai)"); }
      else if (st.modo === "3d") this._tit(st.folhas[st.atual].titulo + " · 3D", "arraste para girar · role ou pince para aproximar · toque numa peça");
      this._pintarBotoes();
    },
    _pintarBotoes: function () {
      var st = this._st; if (!st || !st.el) return;
      function liga(a, on) { Array.prototype.forEach.call(st.el.querySelectorAll('[data-pviva-acao="' + a + '"]'), function (b) { b.classList.toggle("ligado", !!on); b.setAttribute("aria-pressed", String(!!on)); }); }
      liga("corte", st.corteOn); liga("medir", st.medindo); var dz = this.q("disc"); liga("disc", dz && !dz.hidden);
      var cb = this.q("cortebox"); if (cb) cb.hidden = !st.corteOn;
    },
    _inicio: function () {
      var st = this._st, self = this, caixa = this._caixa(), P0 = PV(); if (!caixa || st.ocupado) return;
      var c = [(caixa.min[0] + caixa.max[0]) / 2, caixa.min[1] + 1.5, (caixa.min[2] + caixa.max[2]) / 2], tam = Math.sqrt(Math.pow(caixa.max[0] - caixa.min[0], 2) + Math.pow(caixa.max[2] - caixa.min[2], 2));
      var de = this._camAtual(), para = { alvo: c, r: clamp(tam * 1.25, 10, 2000), phi: 52 * Math.PI / 180, theta: de.theta };
      var api = this._api(); if (api.orbit) api.orbit.enabled = false; st.ocupado = true;
      this._animar(1100, function (u) { self._aplicarCam(P0.interp(de, para, P0.suave(u))); }).then(function () { if (api.orbit) api.orbit.enabled = true; st.ocupado = false; });
    },

    /* ------------------------------------------------------------ tocar na peça */
    _ligarCanvas: function (on) {
      var st = this._st, api = this._api(), self = this; if (!st || !api) return;
      var cv = api.canvas;
      if (!on) { if (st.cvDown) { cv.removeEventListener("pointerdown", st.cvDown, true); cv.removeEventListener("pointerup", st.cvUp, true); } st.cvDown = st.cvUp = null; return; }
      if (st.cvDown) return;
      var ini = null;
      /* ⚠ O TEMPO DO TOQUE É O DO DEDO (e.timeStamp), não o do relógio da página: no celular fraco o quadro do 3D leva mais
         de 1 s e o pointerdown só é entregue depois dele — pelo relógio, todo toque virava "segurar" e a peça não era escolhida
         (e2e de 23/10/2026, a mesma lição do visor, js/bim.js _toque.ts) */
      st.cvDown = function (e) { if (e.isPrimary !== false) ini = { x: e.clientX, y: e.clientY, t: e.timeStamp || agora() }; };
      st.cvUp = function (e) {
        if (!ini || !self._st || st.modo !== "3d" || st.medindo) { ini = null; return; }
        var toque = Math.hypot(e.clientX - ini.x, e.clientY - ini.y) < 6 && (e.timeStamp || agora()) - ini.t < 500; ini = null;
        if (!toque) return;
        self.selecionarEm(e.clientX, e.clientY);
      };
      cv.addEventListener("pointerdown", st.cvDown, true); cv.addEventListener("pointerup", st.cvUp, true);
    },
    selecionarEm: function (cx, cy) {
      var st = this._st, b = B(), api = this._api(); if (!st || !b || !api) return null;
      try { if (st.fonte === "obra" && global.TesteModulo && TesteModulo.tocar) TesteModulo.tocar("pranchaviva"); } catch (eT) {}
      var hit = api.raycast ? api.raycast(cx, cy) : null, uid = null;
      try { uid = b.uidEm ? b.uidEm(cx, cy) : null; } catch (e) { uid = null; }
      if (!hit || !uid) { st.sel = null; this._painelInfo(null); return null; }
      var P = [hit.point.x, hit.point.y, hit.point.z];
      st.sel = { uid: uid, P: P };
      try { if (b.selecionar) { b.selecionar([uid], "trocar"); st.selFeita = true; } } catch (e2) {}
      var info = this.infoDaPeca(uid);
      this._painelInfo(info, P);
      return info;
    },
    /* a peça do marcador: o uid (computador) ou a chave estável traduzida (celular, js/rvvisor.js uidDaChave) */
    _escolherMarca: function (mk) {
      var st = this._st, b = B(); if (!st || !b || !mk) return null;
      var uid = st.fonte === "link" ? (st.uidDaChave && mk.chave ? st.uidDaChave(mk.chave) : "") : mk.uid;
      if (!uid) return null;
      var c = null; try { c = b.caixaUids ? b.caixaUids([uid]) : null; } catch (e) { c = null; }
      var P = c ? [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2] : (st.alvo ? st.alvo.P : null);
      st.sel = { uid: uid, P: P };
      try { if (b.selecionar) { b.selecionar([uid], "trocar"); st.selFeita = true; } } catch (e2) {}
      var info = this.infoDaPeca(uid);
      this._painelInfo(info, P);
      return info;
    },
    /* a peça + o orçamento + o cronograma (a regra é do js/pranchaviva.js infoPeca) */
    infoDaPeca: function (uid) {
      var b = B(), g = G(), el = null;
      try { (b.elementos || []).some(function (e) { if (e.uid === uid) { el = e; return true; } return false; }); } catch (e) {}
      el = el || { uid: uid };
      var plano = null, etapas = [], orc = null, vinc = [], categoria = "";
      if (this._st && this._st.fonte === "obra" && g) {
        try { (g._bimPlano && g._bimPlano.elementos || []).some(function (x) { if (x.id === uid) { plano = x; return true; } return false; }); } catch (e1) {}
        try { etapas = (g._b4F && g._b4F.r && g._b4F.r.etapas) || []; } catch (e2) {}
        try {
          var ctx = g._bimOrcCtx ? g._bimOrcCtx() : null;
          if (ctx && !ctx.erro && ctx.orc) {
            var itens = [];
            arr(ctx.orc.etapas).forEach(function (et) { arr(et.itens).forEach(function (it) { if (it) itens.push({ id: it.id, codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, etapaNome: et.nome }); }); });
            orc = { itens: itens }; vinc = ctx.vinculos || [];
          }
        } catch (e3) {}
        try { var cl = global.BimQto && BimQto._classificarTipo ? BimQto._classificarTipo(el.tipo) : null; categoria = cl ? cl.cat : ""; } catch (e4) {}
      }
      return PV().infoPeca({ el: el, plano4d: plano, etapas: etapas, orc: orc, vinculos: vinc, categoria: categoria, nomeCat: function (c) { try { return global.BIM4D ? BIM4D.nomeCat(c) : c; } catch (e) { return c; } } });
    },
    _painelInfo: function (info) {
      var st = this._st, el = this.q("info"), self = this; if (!el) return;
      if (!info) { el.hidden = true; el.innerHTML = ""; return; }
      var link = st.fonte === "link";
      var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><span style="font-size:11px;color:#5b6875">' + esc(info.disciplina || "Peça") + "</span><h3>" + esc(info.tipoPt) + '</h3></div><button type="button" class="pviva-bt" data-pviva-acao="info-fechar" title="Fechar" style="min-height:28px;padding:2px 6px">' + ico("fechar", 14) + "</button></div>" +
        "<dl>" + (info.nome ? "<dt>Nome</dt><dd>" + esc(info.nome) + "</dd>" : "") + "<dt>Classe IFC</dt><dd>" + esc(info.tipo || "—") + "</dd>" +
        '<dt>GUID</dt><dd><span class="pviva-guid" data-pviva="guid">' + esc(info.guid || "—") + "</span>" + (info.guid ? ' <button type="button" class="pviva-bt" data-pviva-acao="copiar-guid" style="min-height:24px;padding:1px 6px;font-size:11px">copiar</button>' : "") + "</dd></dl>";
      if (!link) {
        var it = info.item;
        h += '<div class="pviva-sec" data-pviva="item"><b>Item do orçamento</b>' + (it ? "<div>" + esc(it.descricao || "—") + "</div><div style='color:#5b6875;font-size:12px'>" + (it.codigo ? "código " + esc(it.codigo) + " · " : "") +
          (it.quantidade != null ? br(it.quantidade) + " " + esc(it.unidade) : "") + (it.etapaNome ? " · " + esc(it.etapaNome) : "") + "<br>ligado pelo " + esc(it.como) + "</div>" : "<div style='color:#5b6875'>—</div>") + "</div>";
        var e = info.etapa;
        h += '<div class="pviva-sec" data-pviva="etapa"><b>Etapa do cronograma</b>' + (e ? "<div>" + esc(e.nome) + "</div><div style='color:#5b6875;font-size:12px'>" + (e.inicio != null && e.fim != null ? "semanas " + esc(e.inicio) + " a " + esc(e.fim) + " · " : "") + esc(e.como) + (e.ilustrativa ? " (sequência ilustrativa)" : "") + "</div>" : "<div style='color:#5b6875'>—</div>") + "</div>";
        arr(info.pendencias).forEach(function (p) {
          h += '<div class="pviva-pend" data-pviva-pend="' + esc(p.id) + '">' + esc(p.texto) + '<div><button type="button" class="pviva-bt" data-pviva-acao="corrigir" data-pviva-alvo="' + esc(p.acao) + '">' + ico("editar", 14) + esc(p.rotulo || "Corrigir") + '</button><button type="button" class="pviva-bt" data-pviva-acao="mostrar-3d">' + ico("olho", 14) + "Mostrar no 3D</button></div></div>";
        });
      }
      el.innerHTML = h; el.hidden = false;
      el._info = info;
    },
    _corrigir: function (alvo) {
      var sh = global.BimShell;
      /* a correção abre a ferramenta CERTA do app (a Prancha Viva fica aberta por baixo: o painel vem na frente) */
      try { this._mostrar(false); } catch (e) {}
      this._pausar3d(false);
      var self = this;
      setTimeout(function () { toast("Prancha Viva fica guardada: toque em Prancha Viva de novo para voltar.", "info"); }, 50);
      if (alvo === "quatro-d") { try { sh.executar("quatro-d"); } catch (e1) {} }
      else if (alvo === "orc-obra") { try { sh.executar("orc-modelo"); } catch (e2) {} toast("Ligue a obra a um orçamento em Obras → editar → Vincular a um orçamento.", "aviso"); }
      else { try { sh.executar("orc-modelo"); } catch (e3) {} }
      self._fecharPorCorrecao = true;
    },

    /* ------------------------------------------------------------ ações dos botões */
    _acao: function (a, bt) {
      var st = this._st, self = this, b = B(); if (!st) return;
      if (a === "fechar") return this.fechar();
      if (a === "tema") return this.tema();
      if (a === "guia") return this.guia();
      if (a === "guia-ok") return this.guia(false);
      if (a === "marcas") { st.marcasOn = !st.marcasOn; bt.classList.toggle("ligado", st.marcasOn); bt.setAttribute("aria-pressed", String(st.marcasOn)); return this._posMarcas(); }
      if (a === "abrir-modelos") return this._abrirModelosDaObra();
      if (a === "abrir-ifc") return this._abrirIfc();
      if (a === "gerar-modelo") return this.gerarDoModelo();
      if (a === "refazer-desenho") return this.abrirFolha(st.atual, { refazer: true });
      if (a === "baixar-pacote") return this.baixarPacote();
      if (a === "ajustar") return this.ajustar();
      if (a === "mais" || a === "menos") { var p = this.q("palco"); return this._zoom(p.clientWidth / 2, p.clientHeight / 2, a === "mais" ? 1.5 : 1 / 1.5); }
      if (a === "voltar") return this.voltar();
      if (a === "corte") { st.corteOn = !st.corteOn; this.moverCorte(st.off); this._pintarBotoes(); return; }
      if (a === "disc") return this._abrirDisc();
      if (a === "medir") return this._medir();
      if (a === "inicio") return this._inicio();
      if (a === "info-fechar") { st.sel = null; return this._painelInfo(null); }
      if (a === "copiar-guid") { var gtx = this.q("guid"); try { global.navigator.clipboard.writeText(gtx.textContent).then(function () { bt.textContent = "copiado"; }, function () {}); } catch (e) {} return; }
      if (a === "mostrar-3d") { if (st.sel) { try { b.enquadrarUids([st.sel.uid]); } catch (e) {} } return; }
      if (a === "corrigir") return this._corrigir(bt.getAttribute("data-pviva-alvo"));
      if (a === "compartilhar") return this.compartilhar();
      if (a === "ra") return this.ra();
      if (a === "importar") return this.importar();
      if (a === "ir-pranchas") { this.fechar(); try { if (G() && G().bimPranchas) G().bimPranchas(); } catch (e2) {} return; }
    },

    /* ==================================================================
     * COMPARTILHAR (o caminho da RA/RV e da placa da obra: link + QR) e a REALIDADE AUMENTADA
     * ================================================================== */
    compartilhar: function () {
      var self = this;
      if (this._st && this._st.fonte === "link") return false;
      return this.porta("compartilhar", function () {
        var g = G(); if (!g || !g.bimQRImersivo) { toast("O compartilhamento do projeto não carregou nesta tela.", "erro"); return false; }
        /* ⚠ do 3D, volta à folha antes: o pacote fotografa os pontos de vista (troca a câmera e os cortes da cena) */
        if (self._st && self._st.modo === "3d") { self.voltar(true).then(function () { self.compartilhar(); }); return true; }
        /* a opção "Pranchas (Prancha Viva)" já vem marcada: é por ela que a pessoa chegou aqui */
        try { var o = g._rvOpcoes ? g._rvOpcoes() : {}; o.pranchas = true; if (g._rvGuardarOpcoes) g._rvGuardarOpcoes(o); } catch (e) {}
        try { self._mostrar(false); } catch (e2) {}
        self._pausar3d(false);
        g.bimQRImersivo();
        setTimeout(function () {
          var ov = global.document.getElementById("rv-qr-ov");
          if (!ov) { try { self._mostrar(true); } catch (e3) {} return; }
          /* o modal fecha → a Prancha Viva volta */
          var vig = setInterval(function () { if (!global.document.getElementById("rv-qr-ov")) { clearInterval(vig); try { if (self._st) self._mostrar(true); } catch (e4) {} } }, 400);
        }, 60);
        return true;
      });
    },
    ra: function () {
      var self = this, b = B();
      var fn = function () {
        var toque = false; try { toque = (global.matchMedia && matchMedia("(pointer:coarse)").matches) || (global.navigator && navigator.maxTouchPoints > 1 && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)); } catch (e) {}
        /* no celular: o painel da RA do próprio visualizador (RA do iPhone / do Android, a maquete na mesa);
           no computador: o QR do link — a RA acontece no celular */
        if (toque || self._st.fonte === "link") { try { self._mostrar(false); } catch (e1) {} self._pausar3d(false); try { b.abrirXR(); } catch (e2) {} setTimeout(function () { var vig = setInterval(function () { if (!(b.painelXRAberto && b.painelXRAberto()) && !(b.imersivoAtivo && b.imersivoAtivo())) { clearInterval(vig); try { if (self._st) self._mostrar(true); } catch (e3) {} } }, 500); }, 500); return true; }
        return self.compartilhar();
      };
      if (this._st && this._st.fonte === "link") return fn();
      return this.porta("ra", fn);
    },

    /* o pacote leve das pranchas para o link (js/gestao.js _rvDadosDoLink chama): cb({folhas, bytes, cortadas}) */
    /* ⚠ LEGÍVEL NO CELULAR (23/10/2026): a folha ia a 1800 px de largura — uma A1 (841 mm) com 2 px por mm, e o texto da
       cota virava borrão no primeiro zoom. Agora cada folha vai na MAIOR largura que cabe no orçamento do link
       (PranchaViva.larguraRaster: até 4096 px), dividido pelas folhas que faltam; passou do orçamento, refaz menor
       (0,7×, duas vezes) antes de desistir da folha. */
    pacoteLink: function (cb) {
      var self = this, P0 = PV(), lista = this._folhasDaObra().filter(function (f) { return f.nLig > 0; }).slice(0, P0.MAX_FOLHAS_LINK), out = [], i = 0, usado = 0, desat = 0;
      function proxima() {
        if (i >= lista.length || out.length >= P0.MAX_FOLHAS_LINK) { var pk = P0.pranchasParaLink(out); pk.desatualizadas = desat; pk.cortadas += Math.max(0, self._folhasDaObra().filter(function (f) { return f.nLig > 0; }).length - lista.length); cb(pk); return; }
        var f = lista[i++], ligs = [];
        try { ligs = self.ligacoes(f); self._calcMarcas(ligs); } catch (e) { ligs = []; }
        if (!ligs.length) return proxima();
        /* ⚠ o desenho da folha é o de ANTES da última mudança do modelo (a Prancha Viva não redesenha sozinha): vai, mas o
           link diz quantas (js/gestao.js _modalNuvemRV) — o dono atualiza e gera de novo (a assinatura muda: _vistasDaFolha) */
        if (f._desatualizada) desat++;
        var resta = Math.max(150000, (P0.MAX_BYTES_LINK - usado) / Math.max(1, lista.length - i + 1)), larg = P0.larguraRaster(f.wMm, f.hMm, resta), tent = 0;
        var ligsLink = ligs.map(function (l) { return { tipo: l.tipo, vista: l.vista, rect: l.rect, M: l.M, n: l.n, mmPorM: l.mmPorM, cota: l.cota, nome: l.nome, cam: l.cam, marcas: P0.marcasParaLink(l.marcas) }; });
        function tenta() {
          self._rasterFolha(f, larg).then(function (img) {
            var x = img ? { id: f.id, titulo: f.titulo, wMm: f.wMm, hMm: f.hMm, img: img, ligs: ligsLink, px: larg } : null;
            var t = x ? JSON.stringify(x).length : 0;
            if (x && usado + t > P0.MAX_BYTES_LINK && tent < 2 && larg > 1600) { tent++; larg = Math.max(1600, Math.round(larg * 0.7)); return tenta(); }
            if (x && usado + t <= P0.MAX_BYTES_LINK) { out.push(x); usado += t; }
            setTimeout(proxima, 0);
          }, function () { setTimeout(proxima, 0); });
        }
        tenta();
      }
      proxima();
    },

    /* ORGANIZAR AS VISTAS DO MODELO (23/10/2026): os dois cortes e as quatro elevações pela caixa da EDIFICAÇÃO (a casa, sem o
     * terreno — BIM.pavimentos2d().caixaEdif), não pela do arquivo. O corte longitudinal corre ao longo do lado maior da casa e o
     * transversal ao longo do menor, os dois pelo meio dela.
     * ⚠ IDEMPOTENTE e sem mexer no que a pessoa fez: corte/elevação que o gerador pôs (pvAuto) ou que não toca a casa (foi feito
     *   sobre a caixa do terreno numa geração antiga) vai para o lugar certo; o que cruza a casa e a pessoa criou fica. Sem corte
     *   nenhum: nascem dois. Elevação só com o modelo de vista ligado (a mesma regra do botão Elevação).
     * Devolve { cortesNovos, cortesAjustados, elevNovas, elevAjustadas, caixa } (para a mensagem e para o teste). */
    organizarVistas: function (pd) {
      var b2 = global.Bim2D, out = { cortesNovos: 0, cortesAjustados: 0, elevNovas: 0, elevAjustadas: 0, caixa: null };
      var cx = pd ? (pd.caixaEdif || pd.caixa) : null;
      if (!b2 || !cx || !cx.min || !cx.max) return out;
      out.caixa = cx;
      var mx = (cx.min[0] + cx.max[0]) / 2, mz = (cx.min[2] + cx.max[2]) / 2, lx = cx.max[0] - cx.min[0], lz = cx.max[2] - cx.min[2], m = 1;
      var alongX = [cx.min[0] - m, mz, cx.max[0] + m, mz], alongZ = [mx, cx.min[2] - m, mx, cx.max[2] + m];
      var alvos = lx >= lz ? [alongX, alongZ] : [alongZ, alongX];   /* [longitudinal, transversal] */
      function toca(ax, az, bx, bz) {
        var g = 0.5;
        for (var i = 0; i <= 20; i++) {
          var t = i / 20, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (x >= cx.min[0] - g && x <= cx.max[0] + g && z >= cx.min[2] - g && z <= cx.max[2] + g) return true;
        }
        return false;
      }
      var cortes = b2.cortes ? (b2.cortes() || []) : [];
      if (!cortes.length) {
        if (b2.criarCorte) { alvos.forEach(function (a) { b2.criarCorte(a[0], a[1], a[2], a[3], { silencioso: true, pvAuto: true }); }); out.cortesNovos = 2; }
      } else {
        var k = 0;
        cortes.forEach(function (c) {
          if (!(c.pvAuto || !toca(c.ax, c.az, c.bx, c.bz)) || k >= 2) return;
          var a = alvos[k++];
          if (Math.abs(c.ax - a[0]) + Math.abs(c.az - a[1]) + Math.abs(c.bx - a[2]) + Math.abs(c.bz - a[3]) < 0.01 && c.pvAuto) return;
          if (b2.moverCorte && b2.moverCorte(c.id, a[0], a[1], a[2], a[3], true)) out.cortesAjustados++;
        });
      }
      /* as quatro faces */
      var M = global.BimModeloVista;
      if (M && M.ativo && M.ativo() && b2.criarElevacao && b2.linhaElevacao) {
        var est = M.estado(), vs = est.vistas || {}, tem = {}, mudou = false;
        var ref = Math.max(lx, lz, 5);
        Object.keys(vs).forEach(function (id) {
          var v = vs[id]; if (!v || v.tipo !== "elevacao" || v.interior || !v.linha) return;
          var dir = v.pvDir || ((/Elevação (Norte|Sul|Leste|Oeste)/.exec(v.nome || "") || [])[1] || "").toLowerCase();
          if (["norte", "sul", "leste", "oeste"].indexOf(dir) < 0) return;
          var alvo = b2.linhaElevacao(dir, cx), L = v.linha;
          var d = Math.sqrt(Math.pow((L.ax + L.bx) / 2 - (alvo.ax + alvo.bx) / 2, 2) + Math.pow((L.az + L.bz) / 2 - (alvo.az + alvo.bz) / 2, 2));
          if (!tem[dir]) tem[dir] = id;
          if (d > 0.25 * ref || v.pvAuto) {
            if (d > 0.01) { v.linha = { ax: alvo.ax, az: alvo.az, bx: alvo.bx, bz: alvo.bz, inv: !!alvo.inv, prof: alvo.prof }; out.elevAjustadas++; mudou = true; }
            if (!v.pvAuto) { v.pvAuto = true; v.pvDir = dir; mudou = true; }
          }
        });
        if (mudou) { M.gravar(); try { Object.keys(b2._cache).forEach(function (kk) { if (/^d2v-/.test(kk)) b2.redesenhar(kk, false); }); b2._avisarMudou(); } catch (eR) {} }
        ["norte", "sul", "leste", "oeste"].forEach(function (dir) {
          if (tem[dir]) return;
          if (b2.criarElevacao(dir, { abrir: false, silencioso: true, caixa: cx, pvAuto: true })) out.elevNovas++;
        });
      }
      return out;
    },

    /* ==================================================================
     * GERAR AS PRANCHAS DO MODELO (o pacote de qualquer projeto) e BAIXAR O PACOTE
     * ⚠ Quem monta as folhas é o motor de sempre (js/bimfolhaui.js gerar → js/prancha.js gerarJogo: escala, posição,
     *   número, IDEMPOTENTE — gerar de novo atualiza as mesmas folhas e não mexe nas feitas à mão). Aqui só o que falta
     *   para o modelo de QUALQUER origem (um IFC de outro programa não tem corte nenhum): sem corte na obra, nascem dois
     *   (longitudinal e transversal) pelo meio do modelo.
     * ================================================================== */
    gerarDoModelo: function () {
      var self = this;
      return this.porta("gerar", function () {
        var b = B(), FU = global.BimFolhaUI, b2 = global.Bim2D, st = self._st;
        if (!self._temModelo()) { self._msg("Abra o modelo da obra primeiro: as pranchas são desenhadas dele.", "aviso"); return false; }
        if (!FU || !FU.gerar || !b2) { self._msg("O gerador de pranchas não carregou nesta tela. Recarregue o app.", "erro"); return false; }
        var criados = 0, org = null, pd = null;
        try { pd = b.pavimentos2d ? b.pavimentos2d() : null; org = self.organizarVistas(pd); criados = org ? org.cortesNovos : 0; } catch (eC) { org = null; }
        var r = null;
        try { r = FU.gerar({ abrir: false, pranchaViva: true, formato: "auto" }); } catch (eG) { r = null; self._msg("Não consegui gerar as pranchas: " + (eG && eG.message || eG), "erro"); return false; }
        if (!r || !r.ok) { self._msg("Nenhuma prancha gerada: o modelo não tem planta, corte ou elevação para pôr em folha. Confira os níveis do modelo (Navegador › Vistas).", "aviso"); return false; }
        self._sigVista = {};   /* tudo desenhado de novo com o modelo de agora */
        try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("prancha-viva", "gerar", { criadas: r.criadas, atualizadas: r.atualizadas, cortesNovos: criados }); } catch (eA) {}
        if (st && self._st === st) {
          st.folhas = self._folhasDaObra(); self._pintarLista();
          var vz = st.el.querySelector(".pviva-vazio"); if (vz) vz.parentNode.removeChild(vz);
          var dica = self.q("dica"); if (dica) dica.hidden = false;
          var ix = 0; st.folhas.some(function (f, k) { if (String(f.regId) === String(r.id) && f.folha && f.folha.auto) { ix = k; return true; } return false; });
          if (st.folhas.length) self.abrirFolha(ix);
        }
        self._msg("Pranchas do modelo: " + r.criadas + " folha(s) nova(s), " + r.atualizadas + " atualizada(s)" + (criados ? ", com 2 cortes novos pelo meio da edificação" : "") + (org && org.cortesAjustados ? ", " + org.cortesAjustados + " corte(s) reposto(s) no meio da edificação" : "") + (org && (org.elevNovas || org.elevAjustadas) ? ", elevações das 4 faces (" + org.elevNovas + " nova(s), " + org.elevAjustadas + " reposta(s))" : "") + (r.puladas && r.puladas.length ? "; fora: " + r.puladas.map(function (p) { return p.nome; }).join(", ") : "") + "." + (pd && pd.entorno && pd.entorno.excluidos ? " " + pd.entorno.texto : "") + (r.aviso ? " " + r.aviso : "") + (r.soltas && r.soltas.length ? " Escala solta do modelo de vista RA em " + r.soltas.length + " vista(s) para caber." : ""), r.puladas && r.puladas.length ? "aviso" : "ok");
        return r;
      });
    },
    /* o pacote num arquivo (o mesmo do link): {formato, versao, obra, geradoEm, folhas:[{img, ligs (matriz), marcas}]} */
    FORMATO_PACOTE: "orcapro-prancha-viva",
    baixarPacote: function () {
      var self = this;
      return this.porta("baixar", function () {
        if (self._st && self._st.modo === "3d") { self.voltar(true).then(function () { self.baixarPacote(); }); return true; }
        self._msg("Montando o pacote das pranchas ligadas…", "info");
        self.pacoteLink(function (pk) {
          if (!pk.folhas.length) { self._msg("Nenhuma folha ligada ao modelo para pôr no pacote. Use Gerar as pranchas do modelo primeiro.", "aviso"); return; }
          var g = G(), obra = null; try { obra = g && g._bimSel && global.Store ? Store.obter(global.Auth && Auth.empresaId ? Auth.empresaId() : null, "obras", g._bimSel) : null; } catch (e) {}
          var nome = String((obra && obra.nome) || "projeto").normalize ? String((obra && obra.nome) || "projeto").normalize("NFD").replace(/[̀-ͯ]/g, "") : String((obra && obra.nome) || "projeto");
          var dado = { formato: self.FORMATO_PACOTE, versao: 1, obra: (obra && obra.nome) || "", geradoEm: new Date().toISOString(), assinatura: self.assinatura(), folhas: pk.folhas };
          var arq = "prancha-viva-" + nome.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) + ".json";
          try {
            var u = URL.createObjectURL(new Blob([JSON.stringify(dado)], { type: "application/json" })), a = global.document.createElement("a");
            a.href = u; a.download = arq; global.document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(u); a.parentNode.removeChild(a); } catch (e2) {} }, 1500);
          } catch (e3) { self._msg("Não consegui baixar o pacote: " + (e3 && e3.message || e3), "erro"); return; }
          self._ultimoPacote = dado;
          try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("prancha-viva", "baixar-pacote", { folhas: pk.folhas.length, bytes: pk.bytes }); } catch (eA) {}
          self._msg("Pacote baixado: " + arq + " (" + pk.folhas.length + " folha(s), " + Math.round(pk.bytes / 1024) + " KB" + (pk.cortadas ? "; " + pk.cortadas + " ficaram de fora pelo tamanho" : "") + ").", pk.cortadas ? "aviso" : "ok");
        });
        return true;
      });
    },
    /* a folha numa imagem (JPEG) de `largura` px: o HTML da folha em SVG (foreignObject) — com as imagens em data: */
    _rasterFolha: function (f, largura) {
      var self = this, d = global.document;
      var st0 = this._st, temp = !st0;
      if (temp) this._st = { fonte: "obra", folhas: [f], atual: 0, urls: [] };
      return this._htmlFolha(f).then(function (html) {
        var W = Math.round(largura), H = Math.round(largura * f.hMm / f.wMm), kpx = W / (f.wMm * MM_PX);
        var cx = d.createElement("div"); cx.innerHTML = html;
        /* blob: não entra no SVG-imagem (o navegador não busca recurso de fora): as imagens viram data: antes */
        var imgs = [].slice.call(cx.querySelectorAll("img")).filter(function (im) { return /^blob:/.test(im.getAttribute("src") || ""); });
        return Promise.all(imgs.map(function (im) {
          return global.fetch(im.getAttribute("src")).then(function (r) { return r.blob(); }).then(function (bl) {
            return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { im.setAttribute("src", fr.result); ok(); }; fr.onerror = function () { ok(); }; fr.readAsDataURL(bl); });
          })["catch"](function () {});
        })).then(function () {
          var xh = new XMLSerializer().serializeToString(cx);
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="' + (f.wMm * MM_PX) + '" height="' + (f.hMm * MM_PX) + '" transform="scale(' + kpx + ')">' + xh + "</foreignObject></svg>";
          return new Promise(function (ok) {
            var im = new Image();
            im.onload = function () {
              var cv = d.createElement("canvas"); cv.width = W; cv.height = H; var g = cv.getContext("2d");
              g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
              try { g.drawImage(im, 0, 0); ok(cv.toDataURL("image/jpeg", 0.82)); } catch (e) { ok(null); }
            };
            im.onerror = function () { ok(null); };
            im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          });
        });
      }).then(function (r) { if (temp) self._st = null; return r; }, function () { if (temp) self._st = null; return null; });
    },

    /* ==================================================================
     * IMPORTAR PRANCHAS LIGADAS (o pranchas.json do gerador de pranchas + as imagens das folhas)
     * ================================================================== */
    importar: function () {
      var self = this;
      return this.porta("importar", function () {
        var inp = global.document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".json,.webp,.png,.jpg,.jpeg";
        inp.onchange = function () { self.importarArquivos([].slice.call(inp.files || [])); };
        inp.click();
        return true;
      });
    },
    /* ⚠ os recados vão à PRÓPRIA tela (self._msg; fechada, cai no toast): o toast do app (z-index 100) fica atrás da
       Prancha Viva aberta (9000) e ninguém via "escolha o pranchas.json" (revisão, 23/10/2026; test-pranchaviva-rev [e]) */
    importarArquivos: function (arqs) {
      var self = this, g = G(), json = null, imgs = {};
      arqs.forEach(function (a) { if (/\.json$/i.test(a.name)) json = a; else imgs[a.name.toLowerCase()] = a; });
      if (!json) { self._msg("Escolha o pranchas.json junto com as imagens das folhas.", "aviso"); return Promise.resolve({ ok: false, erro: "sem json" }); }
      if (!g || !global.Store || !global.Idb) { self._msg("O armazenamento das pranchas não carregou.", "erro"); return Promise.resolve({ ok: false, erro: "sem armazenamento" }); }
      return json.text().then(function (t) {
        var d = JSON.parse(t);
        /* o PACOTE da Prancha Viva (Baixar o pacote, de qualquer projeto): abre como o link abre no celular — a folha e a
           matriz de cada vista já vêm prontas; o 3D é o modelo aberto aqui (o mesmo projeto) */
        if (d && d.formato === self.FORMATO_PACOTE && arr(d.folhas).length) {
          if (self._st) self.fechar();
          var b0 = B();
          self.abrir({ fonte: "link", folhas: d.folhas, uidDaChave: function (ch) { var u = ""; try { (b0.elementos || []).some(function (e) { if (e.chave === ch) { u = e.uid; return true; } return false; }); } catch (e) {} return u; } });
          return { ok: true, pacote: true, folhas: d.folhas.length };
        }
        var lista = PV().pranchasDoJson(d), obra = String(g._bimSel || ""), feitas = [], faltou = [];
        var seq = Promise.resolve();
        lista.forEach(function (p, i) {
          var nomeImg = String(p.img || "").split("/").pop().toLowerCase(), arq = imgs[nomeImg];
          var pv = PV().normPv(p);
          if (!pv) { faltou.push((p.titulo || p.id || ("folha " + (i + 1))) + " (matriz inválida)"); return; }
          if (!arq) { faltou.push((p.titulo || p.id) + " (imagem " + nomeImg + " não escolhida)"); return; }
          seq = seq.then(function () {
            var chave = "pviva-img-" + obra + "-" + String(p.id || i).replace(/[^\w-]/g, "_");
            return Idb.set(chave, arq).then(function () {
              feitas.push({ id: "pv" + String(p.id || i).replace(/[^\w-]/g, "_"), n: +p.folha || feitas.length + 1, conteudo: String(p.titulo || p.id || "Folha"), escala: d.escala ? "1:" + d.escala : "indicada", imagemInteira: chave, pv: p });
            });
          });
        });
        return seq.then(function () {
          if (!lista.length) { self._msg("Este pranchas.json não traz folhas com a matriz de ligação (pixel → modelo). Use o do gerador de pranchas.", "erro"); return { ok: false, erro: "sem folhas", faltou: faltou }; }
          if (!feitas.length) { self._msg("Nenhuma folha importada: " + faltou.join("; "), "erro"); return { ok: false, faltou: faltou }; }
          var pap = (feitas[0].pv && feitas[0].pv.papel_mm) || [841, 594], fmt = "A1";
          var F = global.Prancha && Prancha.FORMATOS ? Prancha.FORMATOS : {};
          Object.keys(F).forEach(function (k) { if (Math.abs(F[k][0] - pap[0]) < 2 && Math.abs(F[k][1] - pap[1]) < 2) fmt = k; });
          var reg = Prancha.normalizar({ nome: (d.obra ? String(d.obra) + " — " : "") + "pranchas ligadas", formato: fmt, origem: "pranchaviva", folhas: feitas, carimbo: {} });
          reg.obraId = obra; reg.criadoEm = new Date().toISOString(); delete reg.id;
          var salvo = Store.salvar(global.Auth && Auth.empresaId ? Auth.empresaId() : null, "bim_pranchas", reg);
          if (!salvo) { self._msg("Não consegui salvar as pranchas (armazenamento cheio?).", "erro"); return { ok: false }; }
          try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("prancha-viva", "importar", { folhas: feitas.length, faltou: faltou.length }); } catch (eA) {}
          self._msg(feitas.length + " folha(s) ligada(s) importada(s)" + (faltou.length ? "; ficaram de fora: " + faltou.join("; ") : "") + ".", faltou.length ? "aviso" : "ok");
          if (self._st) { var st = self._st; st.folhas = self._folhasDaObra(); self._pintarLista(); var vz = st.el.querySelector(".pviva-vazio"); if (vz) vz.parentNode.removeChild(vz); var ix = 0; st.folhas.forEach(function (f, k) { if (f.regId === salvo.id && !ix) ix = k; }); self.abrirFolha(ix); }
          return { ok: true, folhas: feitas.length, faltou: faltou, id: salvo.id };
        });
      })["catch"](function (e) { self._msg("Não consegui ler o pranchas.json: " + (e && e.message || e), "erro"); return { ok: false, erro: String(e && e.message || e) }; });
    },

    /* ganchos de teste (a e2e lê o estado sem adivinhar por pixel) */
    _estado: function () {
      var st = this._st; if (!st) return null;
      var api = this._api(), c = api ? api.camera : null, t = api && api.orbit ? api.orbit.target : null;
      return { modo: st.modo, fonte: st.fonte, folhas: st.folhas.length, atual: st.atual, ligs: st.ligs.map(function (l) { return { tipo: l.tipo, vista: l.vista, nome: l.nome, rect: l.rect, origem: l.origem }; }),
        v: st.v, off: st.off, corteOn: st.corteOn, alvo: st.alvo ? { P: st.alvo.P, mm: st.alvo.mm } : null, volta: st.volta || null, sel: st.sel,
        cam: c ? { pos: [c.position.x, c.position.y, c.position.z], alvo: t ? [t.x, t.y, t.z] : null, fov: c.fov } : null,
        planos: api ? (api.renderer.clippingPlanes || []).map(function (p) { return [p.normal.x, p.normal.y, p.normal.z, p.constant]; }) : [], quad: !!(st.quad && st.quad.tinta), ocupado: st.ocupado };
    }
  };

  global.PranchaVivaUI = UIp;
  if (typeof module !== "undefined" && module.exports) module.exports = UIp;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
