/* =====================================================================
 * bimpesado.js — A ENTREGA PESADA DO RENDER, BAIXADA SOB DEMANDA
 *                (módulo ES, 25/10/2026 — docs/render-vivo/ENTREGA-PESADA.md)
 *
 * ⚠ POR QUE ISTO EXISTE. As texturas 2K (img/texturas2k/, 88 MB) e os céus
 *   HDRI (img/ceus/*.hdr, 76 MB) do OrçaPRO Cena entraram no pacote da 1.2.181
 *   e o zip de atualização foi de 38 MB para 191 MB: o GitHub recusou o zip na
 *   landing e cada cliente baixaria 5× mais a cada versão, por arquivos que não
 *   mudam e que só a Cena em Alta/Ultra usa. Agora os pacotes não os levam
 *   (tools/render-pesado.js reprova) e quem precisa baixa aqui, UMA vez.
 *
 * O CAMINHO:
 *   · data/render-pesado.json diz, por peça (caminho igual ao do repositório),
 *     os bytes e o sha256. A URL é <CONFIG.licencaServer> + caminho + rel +
 *     "?h=<sha>" (o servidor da RA: o mesmo que já serve o visor /rvapp/ e a
 *     licença — com CORS e cache imutável, ver server/vps/bim-rv.js /rv/render/).
 *   · o que chega é conferido (tamanho + sha256) e guardado no IndexedDB
 *     "orcapro-render-pesado" com teto (tetoCacheMB, o mais velho sai primeiro).
 *     ⚠ NÃO no Cache Storage: o js/autoupdate.js apaga TODOS os caches a cada
 *     atualização e o sw.js apaga os que não são dele — o cliente baixaria os
 *     164 MB de novo a cada versão, que é justamente o que se quer evitar.
 *   · quem usa (js/bimmat2k.js, js/bimceuhdri.js) pede `disponiveis(rels)`:
 *     o que já está guardado vem como blob: URL; o que falta, `baixar(rels)`
 *     busca em segundo plano com um aviso discreto e o progresso. Enquanto
 *     baixa — ou sem rede — a Cena segue com o 1K e o céu calculado.
 *   · SEM REDE NÃO HÁ PEDIDO: navigator.onLine falso, ou o servidor que falhou
 *     há menos de 10 min, devolve "offline" sem fetch nenhum (nada de 404 ou
 *     ERR_INTERNET_DISCONNECTED no console a cada troca de hora).
 *
 * Preferência `orcapro:render-pesado:base` (localStorage): outra raiz para as
 * peças — "local" = a própria origem do app (árvore de desenvolvimento, que tem
 * img/ inteira) ou uma URL http(s). É o que as e2e usam (servidor próprio).
 * ===================================================================== */

const MAN_URL = 'data/render-pesado.json';
const CHAVE_BASE = 'orcapro:render-pesado:base';
const CHAVE_FALHA = 'orcapro:render-pesado:falhou';
const ESPERA_FALHA_MS = 10 * 60 * 1000;
const FOLGA_BYTES = 20 * 1048576;
const MB = 1048576;

/* ------------------------------------------------------------- o ambiente (injetável no teste em node) */
function g() { return typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {}); }
function hex(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }

function lojaIdb() {
  let dbp = null;
  const abrir = () => dbp || (dbp = new Promise((res, rej) => {
    const r = g().indexedDB.open('orcapro-render-pesado', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('arq', { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
  const tx = (modo, f) => abrir().then((db) => new Promise((res, rej) => {
    const t = db.transaction('arq', modo), s = t.objectStore('arq'); let out = null;
    f(s, (v) => { out = v; });
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  return {
    get: (k) => tx('readonly', (s, put) => { const r = s.get(k); r.onsuccess = () => put(r.result || null); }),
    put: (rec) => tx('readwrite', (s) => { s.put(rec); }),
    del: (k) => tx('readwrite', (s) => { s.delete(k); }),
    todos: () => tx('readonly', (s, put) => { const r = s.getAll(); r.onsuccess = () => put(r.result || []); })
  };
}

function ambientePadrao() {
  const G = g();
  return {
    fetch: (u, o) => G.fetch(u, o),
    loja: G.indexedDB ? lojaIdb() : null,
    online: () => !(G.navigator && G.navigator.onLine === false),
    espaco: async () => { try { const e = await G.navigator.storage.estimate(); return Math.max(0, (e.quota || 0) - (e.usage || 0)); } catch (x) { return Infinity; } },
    urlDeBlob: (b) => G.URL.createObjectURL(b),
    agora: () => Date.now(),
    baseApp: () => { try { return new URL('.', G.document.baseURI).href; } catch (e) { return ''; } },
    servidor: () => { try { return (G.CONFIG && G.CONFIG.licencaServer) || ''; } catch (e) { return ''; } },
    pref: (k) => { try { return G.localStorage.getItem(k); } catch (e) { return null; } },
    gravarPref: (k, v) => { try { if (v == null) G.localStorage.removeItem(k); else G.localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
    /* ⚠ crypto.subtle só existe em contexto seguro (localhost, https). Pelo IP da rede local (http://192.168…) não há: confere só o tamanho */
    sha256: async (buf) => { try { return G.crypto && G.crypto.subtle ? hex(await G.crypto.subtle.digest('SHA-256', buf)) : null; } catch (e) { return null; } },
    aviso: avisoDom
  };
}
let A = null;
function amb() { if (!A) A = ambientePadrao(); return A; }
/* só para o teste: troca partes do ambiente e zera o estado */
export function _configurar(o) { A = Object.assign(ambientePadrao(), o || {}); _man = null; _promessas.clear(); _urls.clear(); _falhouAte = 0; _ultimo = null; }

/* ------------------------------------------------------------- manifesto e endereços */
let _man = null;
export function manifesto() {
  if (!_man) {
    let u = MAN_URL; try { u = new URL(MAN_URL, amb().baseApp() || undefined).href; } catch (e) { /* relativo */ }
    _man = amb().fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(MAN_URL + ' ' + r.status); return r.json(); });
    _man.catch(() => { _man = null; });
  }
  return _man;
}
/* a raiz de onde as peças vêm (termina em /); '' = não há de onde baixar */
export function base(m) {
  const p = amb().pref(CHAVE_BASE);
  if (p === 'local') return amb().baseApp();
  if (p && /^https?:\/\//i.test(p)) return p.replace(/\/?$/, '/');
  const s = amb().servidor(); if (!s) return '';
  return s.replace(/\/+$/, '') + ((m && m.caminho) || '/rv/render/v1/');
}
export function urlRemota(m, rel) {
  const e = m.arquivos[rel];
  return base(m) + rel.split('/').map(encodeURIComponent).join('/') + '?h=' + e[1].slice(0, 12);
}
/* a chave muda com o conteúdo: peça regravada no servidor (sha novo no manifesto) é baixada de novo, a velha sai no aparar */
function chave(rel, e) { return rel + '#' + String(e[1]).slice(0, 16); }
function tipoDe(rel) { return /\.jpe?g$/i.test(rel) ? 'image/jpeg' : /\.png$/i.test(rel) ? 'image/png' : 'application/octet-stream'; }

/* ------------------------------------------------------------- o que já está guardado */
const _urls = new Map();       /* chave → blob: URL desta página (vale até fechar a aba) */
const _promessas = new Map();  /* chave → download em curso (dois pedidos da mesma peça viram um) */
let _falhouAte = 0, _ultimo = null;

export async function disponiveis(rels) {
  const m = await manifesto(), urls = {}, faltam = [], desconhecidos = [];
  let bytesFaltam = 0;
  for (const rel of rels) {
    const e = m.arquivos && m.arquivos[rel];
    if (!e) { desconhecidos.push(rel); continue; }
    const k = chave(rel, e);
    if (_urls.has(k)) { urls[rel] = _urls.get(k); continue; }
    let rec = null;
    try { rec = amb().loja ? await amb().loja.get(k) : null; } catch (x) { rec = null; }
    if (rec && rec.blob && rec.bytes === e[0]) {
      const u = amb().urlDeBlob(rec.blob); _urls.set(k, u); urls[rel] = u;
      /* "usado" anda no máximo uma vez por dia (o aparar tira o mais velho) */
      if (!(rec.usado > amb().agora() - 864e5)) { rec.usado = amb().agora(); try { await amb().loja.put(rec); } catch (x) { /* segue */ } }
    } else { faltam.push(rel); bytesFaltam += e[0]; }
  }
  return { urls, faltam, bytesFaltam, desconhecidos };
}

function falhaRecente() {
  if (amb().agora() < _falhouAte) return true;
  const v = Number(amb().pref(CHAVE_FALHA)) || 0;
  if (v && amb().agora() < v) { _falhouAte = v; return true; }
  return false;
}
function marcarFalha() { _falhouAte = amb().agora() + ESPERA_FALHA_MS; amb().gravarPref(CHAVE_FALHA, String(_falhouAte)); }

async function baixarUm(m, rel, e, k) {
  let r;
  try { r = await amb().fetch(urlRemota(m, rel)); } catch (err) { const x = new Error('sem resposta do servidor (' + (err && err.message || err) + ')'); x.rede = true; throw x; }
  if (!r.ok) { const x = new Error('HTTP ' + r.status); x.rede = r.status === 404 || r.status >= 500; throw x; }
  const buf = await r.arrayBuffer();
  if (buf.byteLength !== e[0]) throw new Error('tamanho diferente (' + buf.byteLength + ' ≠ ' + e[0] + ')');
  const h = await amb().sha256(buf);
  if (h && h !== e[1]) throw new Error('sha256 diferente do manifesto');
  const blob = new Blob([buf], { type: tipoDe(rel) });
  if (amb().loja) await amb().loja.put({ k, rel, blob, bytes: e[0], usado: amb().agora() });
  _urls.set(k, amb().urlDeBlob(blob));
}

/* tira do IndexedDB o que não está mais no manifesto (versão velha) e, passando do teto, o mais velho */
export async function aparar(m) {
  const L = amb().loja; if (!L) return { tirados: 0, bytes: 0 };
  m = m || await manifesto();
  const teto = (m.tetoCacheMB || 400) * MB, validos = {};
  Object.keys(m.arquivos || {}).forEach((rel) => { validos[chave(rel, m.arquivos[rel])] = 1; });
  let todos = [];
  try { todos = await L.todos(); } catch (e) { return { tirados: 0, bytes: 0 }; }
  let tirados = 0, soma = 0;
  const ficam = [];
  for (const r of todos) { if (!validos[r.k]) { try { await L.del(r.k); tirados++; } catch (e) { /* segue */ } } else { ficam.push(r); soma += r.bytes || 0; } }
  ficam.sort((a, b) => (a.usado || 0) - (b.usado || 0));
  while (soma > teto && ficam.length) { const r = ficam.shift(); try { await L.del(r.k); tirados++; soma -= r.bytes || 0; _urls.delete(r.k); } catch (e) { break; } }
  return { tirados, bytes: soma };
}

/* BAIXA o que falta de `rels`. Nunca rejeita: devolve { ok, offline?, semEspaco?, falhas, urls }.
   op: { rotulo: 'texturas de alta qualidade', aviso: false (sem o aviso na tela), aoProgresso(f) } */
export async function baixar(rels, op) {
  op = op || {};
  let m;
  try { m = await manifesto(); } catch (e) { return { ok: false, motivo: 'manifesto: ' + (e && e.message || e), falhas: [], urls: {} }; }
  const d = await disponiveis(rels);
  if (!d.faltam.length) return { ok: true, baixados: 0, falhas: [], urls: d.urls };
  const emCurso = d.faltam.filter((rel) => _promessas.has(chave(rel, m.arquivos[rel])));
  const novos = d.faltam.filter((rel) => emCurso.indexOf(rel) < 0);
  const nada = (o) => Object.assign({ ok: false, baixados: 0, falhas: [], urls: d.urls, faltam: d.faltam, bytesFaltam: d.bytesFaltam }, o);
  if (novos.length) {
    if (!amb().online()) return (_ultimo = nada({ offline: true, motivo: 'sem rede' }));
    if (falhaRecente()) return (_ultimo = nada({ offline: true, motivo: 'o servidor não respondeu há pouco' }));
    if (!base(m)) return (_ultimo = nada({ motivo: 'sem servidor configurado' }));
    const bytesNovos = novos.reduce((s, rel) => s + m.arquivos[rel][0], 0);
    const teto = (m.tetoCacheMB || 400) * MB;
    if (bytesNovos > teto) return (_ultimo = nada({ semEspaco: true, motivo: 'maior que o teto do armazenamento' }));
    let livre = Infinity; try { livre = await amb().espaco(); } catch (e) { /* sem estimativa */ }
    if (livre < bytesNovos + FOLGA_BYTES) return (_ultimo = nada({ semEspaco: true, motivo: 'pouco espaço no aparelho (' + Math.round(livre / MB) + ' MB livres)' }));
  }
  const falhas = [], total = novos.reduce((s, rel) => s + m.arquivos[rel][0], 0);
  let feitos = 0;
  const av = (op.aviso === false || !novos.length) ? null : amb().aviso(op.rotulo || 'texturas de alta qualidade', total);
  const fila = novos.slice();
  let parou = false;
  const trabalhador = async () => {
    while (fila.length) {
      const rel = fila.shift(), e = m.arquivos[rel], k = chave(rel, e);
      let p = _promessas.get(k);
      if (!p) { p = baixarUm(m, rel, e, k); _promessas.set(k, p); p.then(() => _promessas.delete(k), () => _promessas.delete(k)); }
      try { await p; } catch (err) {
        falhas.push({ rel, erro: String(err && err.message || err) });
        if (err && err.rede) { marcarFalha(); fila.length = 0; parou = true; }   /* servidor fora: para tudo, um erro só no console */
      }
      feitos += e[0];
      if (av) av.progresso(feitos / (total || 1));
      if (typeof op.aoProgresso === 'function') { try { op.aoProgresso({ feitos, total }); } catch (x) { /* quem ouve não derruba */ } }
    }
  };
  /* a 1ª peça vai SOZINHA (é a sonda: servidor fora = um erro só no console); depois, duas por vez */
  const primeira = fila.splice(1);
  await trabalhador();
  if (!parou) fila.push.apply(fila, primeira);
  await Promise.all([trabalhador(), trabalhador()]);
  /* o que outro pedido já estava baixando */
  for (const rel of emCurso) { try { await _promessas.get(chave(rel, m.arquivos[rel])); } catch (err) { falhas.push({ rel, erro: String(err && err.message || err) }); } }
  if (av) av.fim(falhas.length ? 'erro' : 'ok');
  if (!falhas.length) { try { await aparar(m); } catch (e) { /* segue */ } }
  const d2 = await disponiveis(rels);
  _ultimo = { ok: !d2.faltam.length, baixados: d.faltam.length - d2.faltam.length, falhas, urls: d2.urls, faltam: d2.faltam, mb: Math.round(total / MB) };
  return _ultimo;
}

/* diagnóstico (e2e, suporte) */
export function estado() { return { emCurso: _promessas.size, falhouAte: _falhouAte, ultimo: _ultimo ? { ok: _ultimo.ok, baixados: _ultimo.baixados, offline: !!_ultimo.offline, semEspaco: !!_ultimo.semEspaco, motivo: _ultimo.motivo || null, falhas: (_ultimo.falhas || []).length } : null }; }

/* ------------------------------------------------------------- o aviso discreto (um só na tela, soma os downloads) */
const _av = { el: null, jobs: [], t: 0 };
function avisoDom(rotulo, total) {
  const doc = g().document; if (!doc || !doc.body) return { progresso() {}, fim() {} };
  const job = { rotulo, total, frac: 0 };
  _av.jobs.push(job); clearTimeout(_av.t);
  if (!_av.el || !_av.el.isConnected) {
    const el = _av.el = doc.createElement('div');
    el.setAttribute('data-pesado', 'aviso'); el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9600;max-width:320px;background:rgba(10,12,16,.82);color:#e9edf3;font:12px/1.35 system-ui,sans-serif;border-radius:8px;padding:7px 11px 8px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .4s';
    el.innerHTML = '<div data-pesado="txt"></div><div style="height:3px;background:rgba(255,255,255,.18);border-radius:2px;margin-top:5px;overflow:hidden"><div data-pesado="barra" style="height:100%;width:0;background:#5aa9ff;transition:width .3s"></div></div>';
    doc.body.appendChild(el);
  }
  _av.el.style.opacity = '1';
  const pintar = () => {
    const el = _av.el; if (!el) return;
    const ativos = _av.jobs, tot = ativos.reduce((s, j) => s + j.total, 0), fe = ativos.reduce((s, j) => s + j.total * j.frac, 0);
    const nomes = ativos.map((j) => j.rotulo).filter((x, i, a) => a.indexOf(x) === i).join(' e ');
    const pct = tot ? Math.min(100, Math.round(100 * fe / tot)) : 0;
    el.querySelector('[data-pesado="txt"]').textContent = 'Baixando ' + nomes + ' (' + Math.max(1, Math.round(tot / MB)) + ' MB) · ' + pct + '%';
    el.querySelector('[data-pesado="barra"]').style.width = pct + '%';
  };
  pintar();
  return {
    progresso(f) { job.frac = Math.max(0, Math.min(1, f)); pintar(); },
    fim(est) {
      _av.jobs = _av.jobs.filter((j) => j !== job);
      if (_av.jobs.length) { pintar(); return; }
      const el = _av.el; if (!el) return;
      el.querySelector('[data-pesado="txt"]').textContent = est === 'ok' ? 'Alta qualidade pronta (guardada neste aparelho)' : 'Sem conexão com o servidor: seguindo com a qualidade comum';
      el.querySelector('[data-pesado="barra"]').style.width = est === 'ok' ? '100%' : '0';
      _av.t = setTimeout(() => { el.style.opacity = '0'; _av.t = setTimeout(() => { if (!_av.jobs.length && el.parentNode) { el.parentNode.removeChild(el); if (_av.el === el) _av.el = null; } }, 450); }, est === 'ok' ? 2500 : 4500);
    }
  };
}
