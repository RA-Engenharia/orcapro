/* =====================================================================
 * bimiluminacaoui.js — o painel LUZES do render ao vivo (frente I,
 * maquete viva, 21/10/2026). Módulo ES importado por import() do
 * js/bimrendervivoui.js quando a aba abre.
 *
 *  · os COMANDOS da obra (js/bimluzcircuitos.js): ligar/desligar cada um,
 *    tudo ligado/desligado, o andamento da luz gravada por comando;
 *  · DIA / ENTARDECER / NOITE pela posição do sol da obra (sem hora fixa:
 *    o entardecer é o sol a ~4° e a noite a −10°, na data da obra);
 *  · teclas: L = tudo ligado/desligado, N = dia ⇄ noite (fora de campo de texto);
 *  · "SUGERIR ILUMINAÇÃO" (js/iluminacaosugerir.js): calcula por ambiente, mostra
 *    lux médio, quantidade e potência, deixa editar e só muda o projeto no
 *    Aplicar (desfaz de uma vez, op de lote); "Apagar sugestão" tira só o que
 *    ela pôs;
 *  · todo problema vem com o que é + Corrigir + Mostrar no 3D.
 * ===================================================================== */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }));
const CSS_BTN = 'background:rgba(10,12,16,.85);color:#eef0f4;border:1px solid rgba(255,255,255,.22);border-radius:7px;padding:3px 8px;font-size:12px;cursor:pointer';

/* o sol da obra numa data: a hora em que a elevação cruza `alvo` (graus), de 14:00 a 23:00 */
function horaDoSol(G, alvo) {
  try {
    const b = G.BimRender, R = G.RenderMat, c = b.cfg(), L = b.local(), fz = b.fuso(L);
    for (let m = 14 * 60; m <= 23 * 60; m += 5) {
      const h = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
      const s = R.sol({ lat: L.lat, lon: L.lon, data: c.data, hora: h, fuso: fz, norte: L.norte });
      if (s && s.elevacao <= alvo) return h;
    }
  } catch (e) { /* sem local: horas usuais */ }
  return alvo > 0 ? '17:30' : '20:30';
}

/* a refletância (albedo) do acabamento pelo nome — a biblioteca de materiais do render (data/materiais-render-ra.json) */
function rhoDe(G, nome) {
  try {
    const R = G.RenderMat, c = R.casar(nome), p = R.parametros(c ? c.id : null, { nome });
    if (p && p.cor) return Math.max(0.05, Math.min(0.9, 0.2126 * p.cor[0] + 0.7152 * p.cor[1] + 0.0722 * p.cor[2]));
  } catch (e) { /* sem biblioteca */ }
  return null;
}

export function abrirLuzes(o) {
  const G = o.global, vivo = o.vivo, tela = o.tela, V = o.ui;
  const C = vivo.circuitos;
  const box = document.createElement('div');
  box.setAttribute('data-rv', 'luzes');
  box.style.cssText = 'position:absolute;left:10px;top:54px;z-index:5;width:290px;max-height:calc(100% - 110px);overflow:auto;background:rgba(10,12,16,.82);color:#eef0f4;border-radius:10px;padding:8px 10px;font-size:12px;line-height:1.35;box-shadow:0 4px 18px rgba(0,0,0,.35)';
  tela.appendChild(box);
  let aberto = o.aberto !== false;
  const estado = { periodo: null };

  function linhaComando(c) {
    const n = c.luzes.length;
    return '<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer"><input type="checkbox" data-luz-cmd="' + esc(c.id) + '"' + (c.ligado ? ' checked' : '') + '>' +
      '<span style="flex:1">' + esc(c.nome) + '</span><span style="opacity:.7">' + n + ' ' + (n === 1 ? 'ponto' : 'pontos') + '</span></label>';
  }
  function pendentes() {
    const e = G.BimRender && G.BimRender._ext, l = (e && e.luzesPendentes) || [];
    return l.map((q) => '<div style="margin:6px 0;padding:6px 8px;border-radius:8px;background:rgba(255,170,60,.14);border:1px solid rgba(255,170,60,.35)">' +
      '<b>Luminária sem luz</b>: ' + esc(q.nome) + '<br><span style="opacity:.85">' + esc(q.pendente) + '</span>' +
      '<div style="display:flex;gap:6px;margin-top:5px"><button type="button" style="' + CSS_BTN + '" data-luz-corrigir="' + esc(q.id) + '">Corrigir</button>' +
      '<button type="button" style="' + CSS_BTN + '" data-luz-mostrar="' + esc(q.id) + '">Mostrar no 3D</button></div></div>').join('');
  }
  function render() {
    const prog = C && C.info ? (C.info.pronto ? 'Luz de ' + C.comandos.length + ' comando(s) gravada' : (C.info.assados ? 'Gravando a luz: ' + C.info.assados + ' de ' + C.comandos.length : 'A luz por comando é gravada depois do céu')) : '';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b style="flex:1">Luzes</b>' +
        '<button type="button" style="' + CSS_BTN + '" data-luz-acao="recolher">' + (aberto ? '–' : '+') + '</button></div>' +
      (aberto ?
        '<div style="display:flex;gap:4px;margin-bottom:6px">' + ['dia', 'entardecer', 'noite'].map((p) => '<button type="button" style="' + CSS_BTN + (estado.periodo === p ? ';background:#2f6fd6' : '') + '" data-luz-periodo="' + p + '">' + { dia: 'Dia', entardecer: 'Entardecer', noite: 'Noite' }[p] + '</button>').join('') + '</div>' +
        (C ? '<div style="display:flex;gap:4px;margin-bottom:6px"><button type="button" style="' + CSS_BTN + '" data-luz-acao="tudo1">Tudo ligado</button><button type="button" style="' + CSS_BTN + '" data-luz-acao="tudo0">Tudo desligado</button></div>' +
          '<div style="opacity:.75;margin-bottom:4px" data-luz-prog>' + esc(prog) + '</div>' + C.comandos.map(linhaComando).join('')
          : '<div style="opacity:.85;margin:4px 0">Nenhuma luminária no modelo. Use <b>Sugerir iluminação</b> para pôr as do catálogo em cada ambiente.</div>') +
        pendentes() +
        '<div style="margin-top:8px;display:flex;gap:6px"><button type="button" style="' + CSS_BTN + ';background:#2f6fd6" data-luz-acao="sugerir">Sugerir iluminação…</button></div>' +
        '<div style="opacity:.65;margin-top:6px">Clique na luminária ou no interruptor para acender · L: tudo · N: dia/noite</div>'
        : '');
    box.querySelectorAll('[data-luz-cmd]').forEach((cb) => { cb.onchange = () => { C.ligar(cb.getAttribute('data-luz-cmd'), cb.checked); guardar(); }; });
    box.querySelectorAll('[data-luz-periodo]').forEach((b) => { b.onclick = () => periodo(b.getAttribute('data-luz-periodo')); });
    box.querySelectorAll('[data-luz-acao]').forEach((b) => {
      b.onclick = () => {
        const a = b.getAttribute('data-luz-acao');
        if (a === 'recolher') { aberto = !aberto; render(); }
        else if (a === 'tudo1' || a === 'tudo0') { C.tudo(a === 'tudo1'); guardar(); render(); }
        else if (a === 'sugerir') abrirSugerir({ G, V, vivo, tela });
      };
    });
    box.querySelectorAll('[data-luz-mostrar]').forEach((b) => { b.onclick = () => mostrarLuminaria(b.getAttribute('data-luz-mostrar')); });
    box.querySelectorAll('[data-luz-corrigir]').forEach((b) => { b.onclick = () => corrigirLuminaria(b.getAttribute('data-luz-corrigir')); });
  }
  function guardar() { if (V) V._estadoLuzes = C ? C.estado() : null; }
  function periodo(p) {
    estado.periodo = p;
    const h = p === 'noite' ? horaDoSol(G, -10) : (p === 'entardecer' ? horaDoSol(G, 4) : (V._horaDia || '12:00'));
    if (p !== 'dia' && V._am && !V._horaDia) V._horaDia = V._am.hora;
    if (p === 'noite' && C) C.tudo(true);
    render();
    return V.hora(h);
  }
  function mostrarLuminaria(famId) {
    const l = (vivo._luzesCena || []).find((q) => q.famInst === famId);
    try { if (G.BIM && G.BIM.selecionar) G.BIM.selecionar(['edit:' + famId]); } catch (e) { /* sem seleção */ }
    let p = l && l.posicao;
    if (!p) { try { const st = G.BIM.editarEstado().estado, f = (st.familias || []).find((q) => q.id === famId), og = (G.BimRender._ext || {}).origem || [0, 0, 0]; if (f) p = [f.x - og[0], f.y - og[1] + 2.4, f.z - og[2]]; } catch (e) { /* sem estado */ } }
    if (p) vivo.definirCamera({ pos: [p[0] + 1.8, p[1] - 0.9, p[2] + 1.8], alvo: [p[0], p[1] - 0.2, p[2]], fov: 60 });
  }
  function corrigirLuminaria(famId) {
    /* trocar o TIPO por um da mesma família que tenha fluxo no catálogo (ex.: a de soquete com a lâmpada do catálogo) */
    try {
      const st = G.BIM.editarEstado().estado, f = (st.familias || []).find((q) => q.id === famId); if (!f) return;
      const fam = G.FamiliasRA.obter(f.famId, true), FL = G.FamiliasLuz, Fa = G.Familia;
      const bons = (fam.tipos || []).filter((t) => { const av = Fa.avaliar(fam, t.id, f.inst || {}); return av.ok && !FL.pendenteDe(av.valores); });
      if (!bons.length) { alerta('Esta família não tem tipo com fluxo publicado no catálogo. Troque por outra luminária em Propriedades.'); return; }
      const t = bons[0];
      if (!G.confirm || G.confirm('Trocar o tipo para "' + t.nome + '" (fluxo do catálogo)? Dá para desfazer.')) {
        G.BIM.editarLote({ op: 'lote', id: 'ilum-tipo-' + Date.now(), origem: 'luzes-corrigir', ops: [{ op: 'instancia', id: famId, tipoId: t.id }] });
        reabrir();
      }
    } catch (e) { alerta('Não deu para trocar o tipo: ' + (e && e.message || e)); }
  }
  function alerta(t) { try { if (G.UI && G.UI.toast) G.UI.toast(t, 'aviso', 7000); else console.warn(t); } catch (e) { /* sem tela */ } }
  function reabrir() { setTimeout(() => { V.abrir({ camera: vivo.cameraAtual(), modo: vivo.nav.modo, hora: V._am && V._am.hora, estadoLuzes: C ? C.estado() : V._estadoLuzes }); }, 400); }

  /* teclas L e N */
  const tecla = (e) => {
    if (!tela.isConnected || tela.offsetParent === null) return;
    const t = e.target, ed = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (ed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'l' || e.key === 'L') { if (C) { const algum = C.comandos.some((c) => c.ligado); C.tudo(!algum); guardar(); render(); } }
    else if (e.key === 'n' || e.key === 'N') { periodo(estado.periodo === 'noite' ? 'dia' : 'noite'); }
  };
  G.addEventListener('keydown', tecla);
  if (C) {
    C.aoProgresso = () => { const el = box.querySelector('[data-luz-prog]'); if (el) render(); };
    C.aoClique = () => { guardar(); render(); };
  }
  render();
  return {
    box, periodo, render, sugerir: () => abrirSugerir({ G, V, vivo, tela }),
    descartar: () => { G.removeEventListener('keydown', tecla); if (box.parentNode) box.parentNode.removeChild(box); const s = tela.querySelector('[data-rv="sugerir"]'); if (s) s.remove(); }
  };
}

/* =====================================================================
 * SUGERIR ILUMINAÇÃO — o painel (nada muda no projeto antes do Aplicar)
 * ===================================================================== */
export function calcularSugestoes(G, op) {
  op = op || {};
  const S = G.IluminacaoSugerir, FL = G.FamiliasLuz, Fa = G.Familia, RA = G.FamiliasRA, R = G.RenderMat;
  const st = G.BIM && G.BIM.editarEstado && G.BIM.editarEstado(), ambs = (st && st.estado && st.estado.ambientes) || [];
  const famCache = {};
  const fam = (id) => famCache[id] || (famCache[id] = RA.obter(id, true));
  const avaliar = (f, t, i) => { const a = Fa.avaliar(fam(f), t, i); return a.valores; };
  const luzesDe = (v, i, e) => FL.luzes(v, i, e, R);
  const por = op.porAmbiente || {};
  return ambs.filter((a) => a && a.calc && a.calc.contorno && a.calc.contorno.length > 2).map((a) => {
    const c = a.calc, cfg = por[a.id] || {};
    if (/c[eé]u\s*aberto|descoberto|^aberto$/i.test(String(a.acabForro || ''))) return { ambId: a.id, nome: a.nome, pendente: 'Céu aberto: sem forro nem laje para fixar a luminária de teto (use espeto, balizador ou arandela).', motivo: 'ceu' };
    const rho = { teto: rhoDe(G, a.acabForro) || 0.7, paredes: rhoDe(G, a.acabParede) || 0.5, piso: rhoDe(G, a.acabPiso) || 0.3 };
    const s = S.sugerirAmbiente({ id: a.id, nome: a.nome, contorno: c.contorno, furos: c.furos, base: c.base, topo: c.topo, forro: a.acabForro, piso: a.acabPiso },
      { nivel: op.nivel || 'I', fm: op.fm, rho, avaliar, luzesDe, uso: cfg.uso, lux: cfg.lux, tipo: cfg.tipo, familia: cfg.familia, n: cfg.n });
    s.incluir = cfg.incluir !== false; s.rho = rho; s.cfg = cfg;
    return s;
  });
}

function abrirSugerir(o) {
  const { G, V, vivo, tela } = o;
  const S = G.IluminacaoSugerir, FL = G.FamiliasLuz;
  if (!S || !FL || !G.BIM || !G.BIM.editarEstado) { try { G.UI.toast('O Sugerir iluminação precisa do modelo do editor (ambientes).', 'aviso', 7000); } catch (e) { /* sem tela */ } return null; }
  let caixa = tela.querySelector('[data-rv="sugerir"]'); if (caixa) caixa.remove();
  caixa = document.createElement('div'); caixa.setAttribute('data-rv', 'sugerir');
  caixa.style.cssText = 'position:absolute;inset:60px 40px 40px 40px;z-index:8;background:rgba(14,16,21,.96);color:#eef0f4;border-radius:12px;padding:12px 14px;font-size:12.5px;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  tela.appendChild(caixa);
  const cfg = { nivel: 'I', fm: 1, porAmbiente: {} };
  const tiposPlafon = FL.tipos('ra-ilum-plafon').map((t) => ({ f: 'ra-ilum-plafon', t: t.id, nome: t.nome })).concat(FL.tipos('ra-ilum-spot-embutir').map((t) => ({ f: 'ra-ilum-spot-embutir', t: t.id, nome: t.nome })));
  let lista = [];
  const usoOpc = (sel) => '<option value="">(pelo nome)</option>' + Object.keys(S.USOS).map((k) => '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(S.USOS[k].nome) + '</option>').join('');
  function calcular() { lista = calcularSugestoes(G, cfg); render(); }
  function render() {
    const ok = lista.filter((s) => s.n && !s.pendente), W = ok.filter((s) => s.incluir).reduce((t, s) => t + s.W, 0);
    caixa.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap"><b style="font-size:14px;flex:1">Sugerir iluminação</b>' +
        '<label>Nível <select data-sg="nivel" style="' + CSS_BTN + '">' + ['M', 'I', 'S'].map((k) => '<option value="' + k + '"' + (cfg.nivel === k ? ' selected' : '') + '>' + { M: 'Mínimo (M)', I: 'Intermediário (I)', S: 'Superior (S)' }[k] + '</option>').join('') + '</select></label>' +
        '<label title="Fator de manutenção: 1,00 = instalação nova (como a verificação no protótipo da NBR 15575-1)">FM <input data-sg="fm" type="number" step="0.05" min="0.5" max="1" value="' + cfg.fm + '" style="width:60px;' + CSS_BTN + '"></label>' +
        '<button type="button" style="' + CSS_BTN + '" data-sg="fechar">Fechar</button></div>' +
      '<div style="opacity:.8;margin-bottom:8px">Iluminância: ' + esc(S.FONTE) + '. ' + esc(S.AVISO_EDICAO) + ' Método dos lúmens com o fator de utilização calculado (luz direta ponto a ponto + inter-reflexões com as refletâncias dos acabamentos do modelo). Nada muda no projeto antes do <b>Aplicar</b>.</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;opacity:.8">' +
        '<th></th><th>Ambiente</th><th>Uso</th><th>Alvo (lux)</th><th>Luminária</th><th>Qtd</th><th>E médio</th><th>E centro</th><th>W</th><th>W/m²</th><th></th></tr></thead><tbody>' +
      lista.map((s, i) => {
        if (s.pendente) {
          return '<tr style="border-top:1px solid rgba(255,255,255,.08)"><td></td><td>' + esc(s.nome) + '</td><td colspan="8"><div style="padding:5px 8px;border-radius:7px;background:rgba(255,170,60,.13);border:1px solid rgba(255,170,60,.35)">' + esc(s.pendente) +
            (s.motivo !== 'ceu' ? '<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap"><b>Corrigir:</b> usar como <select data-sg-uso="' + i + '" style="' + CSS_BTN + '">' + usoOpc('') + '</select> ou <input data-sg-lux="' + i + '" type="number" min="5" step="5" placeholder="lux" style="width:70px;' + CSS_BTN + '"></div>' : '') +
            '</div></td><td><button type="button" style="' + CSS_BTN + '" data-sg-ver="' + i + '">Mostrar no 3D</button></td></tr>';
        }
        const tipoAt = s.familia + '|' + s.tipo;
        return '<tr style="border-top:1px solid rgba(255,255,255,.08)' + (s.atende ? '' : ';background:rgba(255,80,60,.10)') + '">' +
          '<td><input type="checkbox" data-sg-inc="' + i + '"' + (s.incluir ? ' checked' : '') + '></td>' +
          '<td>' + esc(s.nome) + '<div style="opacity:.6">' + fmt(s.area, 1) + ' m² · pé-direito ' + fmt(s.alturaMontagem, 2) + ' m</div></td>' +
          '<td><select data-sg-uso="' + i + '" style="' + CSS_BTN + '">' + usoOpc(s.cfg.uso || s.uso) + '</select></td>' +
          '<td><input data-sg-lux="' + i + '" type="number" min="5" step="5" value="' + s.alvo.lux + '" title="' + esc(s.alvo.fonte) + '" style="width:62px;' + CSS_BTN + '"></td>' +
          '<td><select data-sg-tipo="' + i + '" style="' + CSS_BTN + ';max-width:230px">' + tiposPlafon.map((t) => '<option value="' + t.f + '|' + t.t + '"' + (tipoAt === t.f + '|' + t.t ? ' selected' : '') + '>' + esc(t.nome) + '</option>').join('') + '</select></td>' +
          '<td><input data-sg-n="' + i + '" type="number" min="1" max="60" value="' + s.n + '" style="width:48px;' + CSS_BTN + '"></td>' +
          '<td' + (s.atende ? '' : ' style="color:#ff9b8a"') + '>' + fmt(s.Emed) + '</td><td>' + fmt(s.Ecentro) + '</td><td>' + fmt(s.W) + '</td><td>' + fmt(s.Wm2, 1) + '</td>' +
          '<td><button type="button" style="' + CSS_BTN + '" data-sg-ver="' + i + '">Mostrar no 3D</button></td></tr>' +
          (s.avisos && s.avisos.length ? '<tr><td></td><td colspan="10" style="opacity:.8;padding-bottom:4px">' + s.avisos.map(esc).join(' ') + '</td></tr>' : '');
      }).join('') + '</tbody></table>' +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" style="' + CSS_BTN + ';background:#2f6fd6;padding:5px 12px" data-sg="aplicar">Aplicar (' + ok.filter((s) => s.incluir).length + ' ambientes, ' + fmt(W) + ' W)</button>' +
        '<button type="button" style="' + CSS_BTN + '" data-sg="apagar">Apagar a sugestão aplicada</button>' +
        '<span style="opacity:.7">O comando de cada ambiente fica gravado nas luminárias (a ligação elétrica usa o mesmo).</span></div>';
    const q = (sel) => caixa.querySelectorAll(sel), amb = (i) => (cfg.porAmbiente[lista[i].ambId] = cfg.porAmbiente[lista[i].ambId] || {});
    caixa.querySelector('[data-sg="nivel"]').onchange = function () { cfg.nivel = this.value; Object.values(cfg.porAmbiente).forEach((c) => { delete c.lux; delete c.n; }); calcular(); };
    caixa.querySelector('[data-sg="fm"]').onchange = function () { cfg.fm = Math.max(0.5, Math.min(1, +this.value || 1)); Object.values(cfg.porAmbiente).forEach((c) => { delete c.n; }); calcular(); };
    caixa.querySelector('[data-sg="fechar"]').onclick = () => caixa.remove();
    q('[data-sg-inc]').forEach((e) => { e.onchange = () => { amb(+e.getAttribute('data-sg-inc')).incluir = e.checked; lista[+e.getAttribute('data-sg-inc')].incluir = e.checked; render(); }; });
    q('[data-sg-uso]').forEach((e) => { e.onchange = () => { const a = amb(+e.getAttribute('data-sg-uso')); a.uso = e.value || undefined; delete a.lux; delete a.n; calcular(); }; });
    q('[data-sg-lux]').forEach((e) => { e.onchange = () => { const a = amb(+e.getAttribute('data-sg-lux')); a.lux = +e.value > 0 ? +e.value : undefined; delete a.n; calcular(); }; });
    q('[data-sg-tipo]').forEach((e) => { e.onchange = () => { const a = amb(+e.getAttribute('data-sg-tipo')), p = e.value.split('|'); a.familia = p[0]; a.tipo = p[1]; delete a.n; calcular(); }; });
    q('[data-sg-n]').forEach((e) => { e.onchange = () => { amb(+e.getAttribute('data-sg-n')).n = Math.max(1, Math.round(+e.value || 1)); calcular(); }; });
    q('[data-sg-ver]').forEach((e) => { e.onclick = () => verAmbiente(lista[+e.getAttribute('data-sg-ver')].ambId); });
    caixa.querySelector('[data-sg="aplicar"]').onclick = () => aplicar();
    caixa.querySelector('[data-sg="apagar"]').onclick = () => apagar();
  }
  function verAmbiente(ambId) {
    try {
      const st = G.BIM.editarEstado().estado, a = (st.ambientes || []).find((x) => x.id === ambId), og = (G.BimRender._ext || {}).origem || [0, 0, 0];
      if (!a || !a.calc) return;
      let cx = 0, cz = 0; a.calc.contorno.forEach((p) => { cx += p.x; cz += p.z; }); cx /= a.calc.contorno.length; cz /= a.calc.contorno.length;
      const y = a.calc.base - og[1];
      caixa.style.display = 'none'; setTimeout(() => { caixa.style.display = ''; }, 4000);
      vivo.definirCamera({ pos: [cx - og[0], y + 1.6, cz - og[2]], alvo: [cx - og[0] + 1, y + 1.4, cz - og[2] + 0.3], fov: 75 });
    } catch (e) { /* sem estado */ }
  }
  function aplicar() {
    const sel = lista.filter((s) => s.incluir && s.n && !s.pendente);
    if (!sel.length) return;
    const st = G.BIM.editarEstado().estado, ops = S.ops(st, sel);
    G.BIM.editarLote({ op: 'lote', id: 'ilum-sug-' + Date.now(), origem: 'sugerir-iluminacao', pedido: 'Sugerir iluminação (' + sel.length + ' ambientes)', ops });
    /* PONTO DE INTEGRAÇÃO com a ligação elétrica (frente EL, js/eletilum.js): se o motor estiver carregado, ele gera a caixa, o
       eletroduto e os interruptores dos ambientes que ganharam luminária (o Comando já está gravado em cada uma) */
    let lig = '';
    try { const E = G.EletIlum, f = E && (E.ligarAmbientes || E.ligar); if (typeof f === 'function') { f.call(E, sel.map((s) => s.ambId)); lig = ' A ligação elétrica foi gerada.'; } } catch (e) { lig = ' A ligação elétrica não foi gerada: ' + (e && e.message || e); }
    try { G.UI.toast(sel.reduce((t, s) => t + s.n, 0) + ' luminárias postas em ' + sel.length + ' ambientes. Desfazer: Ctrl+Z no editor.' + lig, 'ok', 8000); } catch (e) { /* sem tela */ }
    caixa.remove();
    setTimeout(() => { V.abrir({ camera: vivo.cameraAtual(), modo: vivo.nav.modo, hora: V._am && V._am.hora, estadoLuzes: V._estadoLuzes }); }, 600);
  }
  function apagar() {
    const st = G.BIM.editarEstado().estado, ops = S.opsApagar(st);
    if (!ops.length) { try { G.UI.toast('Não há sugestão aplicada nesta obra.', 'info', 5000); } catch (e) { /* sem tela */ } return; }
    if (G.confirm && !G.confirm('Apagar as ' + ops.length + ' luminárias que a sugestão pôs? Dá para desfazer.')) return;
    G.BIM.editarLote({ op: 'lote', id: 'ilum-sug-apagar-' + Date.now(), origem: 'sugerir-iluminacao', ops });
    caixa.remove();
    setTimeout(() => { V.abrir({ camera: vivo.cameraAtual(), modo: vivo.nav.modo, hora: V._am && V._am.hora }); }, 600);
  }
  calcular();
  return { caixa, lista: () => lista, cfg, calcular, aplicar, apagar };
}
export { abrirSugerir };
