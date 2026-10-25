/* =====================================================================
 * bimmat2k.js — MATERIAIS 2K DO RENDER AO VIVO (módulo ES, frente G da onda 2, 20/10/2026)
 *
 * Os 45 materiais da biblioteca em 2K (img/texturas2k/, manifesto data/texturas2k.json) com relevo,
 * sem pesar:
 *   1. SÓ OS MATERIAIS DA CENA: lê o manifesto e baixa o 2K apenas do que a cena usa, dos de maior área para os
 *      menores, até o TETO DE MEMÓRIA da qualidade (planejar). O resto fica no 1K de sempre.
 *   2. O 1K É A RESERVA: o material nasce com os nós ligados às texturas 1K (as mesmas do motor) e, quando o 2K
 *      chega, só o `value` dos nós troca — o shader NÃO recompila (o padrão do LuzObraNos). Um material por vez,
 *      com pausa: o upload + mipmaps de 3 texturas 2K custa uns 20 ms, espalhado não vira soluço.
 *   3. RELEVO: normal 2K; rugosidade por mapa; OCLUSÃO de ambiente do mapa AO (nó `aoNode`: abate a luz indireta e o
 *      reflexo nas frestas, normalizada pela média do próprio mapa para o brilho médio da parede não cair);
 *      PARALAXE (parallax occlusion mapping em TSL: 8 a 12 passos, some com a distância) só nos materiais de relevo
 *      forte (tijolo, pedra, telha, brita…). O `parallaxUV` do three r186 é um passo só (deslocamento simples) e
 *      deforma no ângulo rasante; aqui é a busca linear + interpolação.
 *   4. ANTI-REPETIÇÃO nas superfícies grandes: variação de luminosidade/croma em escala de metros (ruído 3D no
 *      mundo, por categoria — madeira e porcelanato quase nada) e, nas superfícies aleatórias (reboco, concreto,
 *      asfalto, areia), mistura de duas amostras deslocadas (Quilez, "texture repetition").
 *   5. ANISOTROPIA no máximo nas texturas de piso.
 *
 * MAPAS: cor (sRGB) · normal · ORM empacotado numa textura só — R = AO, G = rugosidade, B = altura (rugosidade e
 * AO são os canais que o three já lê; a altura vai no B, que ninguém usa). Uma textura em vez de três: o limite
 * de 16 texturas amostradas por estágio do WebGPU não aguenta mais bindings (sondas 6 + atlas + sombras + ambiente).
 *
 * [frente T, 21/10/2026] TEXTURAS CERTAS EM TUDO:
 *   6. NADA PULADO POR MEMÓRIA: o orçamento é dividido por DEGRAUS (2k = cor 2048 + normal 2048 · med = cor 2048 + normal
 *      1024 · peq = só normal 1024 + ORM 1024, a cor fica na reserva). Começa todo mundo em 2k e rebaixa de baixo para
 *      cima (menor área primeiro) até caber: a maior área ganha 2K, a pequena ganha 1K e longe a mipmap resolve.
 *      Antes o orçamento cortava os últimos da fila (cascalho, mármore, São Tomé, cimento queimado ficavam sem AO/relevo).
 *   7. TINTA QUE FUNCIONA NO ESCURO: o `tinta` do bimtextura limita o fator a 0,2..5; laca grafite sobre madeira clara
 *      saía marrom. Quando a tinta bate no teto (ou o matiz muda demais) o grafo usa SÓ A LUMINÂNCIA da foto como
 *      detalhe e a cor do material como cor (modo "luma"); madeira nesse modo vira laca (veio a 25 %).
 *   8. REJUNTE ANALÍTICO (porcelanato, cerâmica, azulejo): peça, junta e chanfro calculados no shader, em metros —
 *      nítido a qualquer distância, sem textura de 1024 px por material (eram ~17 MB cada) e cada peça sorteia um
 *      pedaço da foto de porcelanato.
 *   9. VEIO NA DIREÇÃO CERTA: a projeção planar põe u na horizontal; a foto de MDF/PVC amadeirado tem veio em u, então
 *      nas faces VERTICAIS (porta, lateral de armário) u e v trocam (e o X/Y do normal junto).
 *  10. METAL ESCOVADO com reflexo anisotrópico simples (`anisotropy` do MeshPhysicalNodeMaterial), na direção das escovadas.
 *
 * ⚠ Sem import no topo: o three e o TSL entram por `configurar`/construtor (o teste em node carrega só a parte pura).
 * ⚠ Dentro de If/Loop do WGSL não pode haver derivada implícita: o TBN (dFdx) e os gradientes das UVs são calculados
 *   ANTES do If e toda amostra lá dentro usa `.grad()`. Ver `_grafo`.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * PARTE PURA (testada em node: tools/test-bimmat2k.js)
 * --------------------------------------------------------------------- */

/* TETO DE MEMÓRIA DE TEXTURA NA PLACA, em MB (cor + normal + ORM, com mipmaps, RGBA8). Leve = nenhum 2K
   (notebook/celular: o 1K de sempre). O número é DECLARADO aqui e MEDIDO no roteiro (foto-render-vivo --memoria). */
export const TETO_MB = { leve: 0, alta: 320, ultra: 640 };
/* passos da paralaxe por qualidade (0 = desligada) */
export const PASSOS_POM = { leve: 0, alta: 8, ultra: 12 };
/* a paralaxe vale inteira até d0 e some em d1 (metros do olho): relevo de centímetros não se vê além disso */
export const POM_DIST = { d0: 3.5, d1: 9 };
/* abaixo disto a superfície é detalhe de canto: fica no 1K */
export const AREA_MIN_M2 = 0.25;

/* categoria → variação anti-repetição: lum = amplitude de luminosidade (±), esc = escala do ruído (m), croma = desvio
   de matiz (±), mist = mistura de 2 amostras (só superfície sem "desenho": reboco, concreto liso, asfalto…),
   ao = quanto do AO entra (0..1), aniso = anisotropia máxima (piso) */
const CAT = {
  parede:    { lum: 0.060, esc: 2.6, croma: 0.020, mist: 1, ao: 0.7 },
  alvenaria: { lum: 0.090, esc: 1.8, croma: 0.030, mist: 0, ao: 1.0 },
  pedra:     { lum: 0.080, esc: 2.0, croma: 0.025, mist: 0, ao: 1.0 },
  madeira:   { lum: 0.035, esc: 1.4, croma: 0.012, mist: 0, ao: 0.8 },
  cobertura: { lum: 0.070, esc: 2.2, croma: 0.025, mist: 0, ao: 1.0 },
  piso:      { lum: 0.020, esc: 3.0, croma: 0.008, mist: 0, ao: 0.7, aniso: 1 },
  concreto:  { lum: 0.070, esc: 3.0, croma: 0.015, mist: 1, ao: 0.8 },
  externo:   { lum: 0.090, esc: 3.5, croma: 0.030, mist: 0, ao: 0.9, aniso: 1 },
  metal:     { lum: 0.015, esc: 2.0, croma: 0.000, mist: 0, ao: 0.6 },
  tecido:    { lum: 0.030, esc: 1.5, croma: 0.010, mist: 0, ao: 0.6 },     /* [frente T] estofado, couro */
  plastico:  { lum: 0.015, esc: 2.0, croma: 0.000, mist: 0, ao: 0.5 },     /* [frente T] PVC, laminado branco, borracha, louça */
  casca:     { lum: 0.060, esc: 1.2, croma: 0.030, mist: 0, ao: 1.0 }      /* [frente T] tronco */
};
/* [frente T] o REJUNTE analítico: id do material do render → foto de porcelanato que dá o "rosto" de cada peça
   (null = esmalte liso: só variação de tom). `forca` = quanto da luminância da foto entra (0..1). */
export const REJ_FACE = {
  porcelanato_polido: { slug: 'porcelanato_acetinado_claro', forca: 0.45 },
  porcelanato_acetinado: { slug: 'porcelanato_acetinado_claro', forca: 0.55 },
  ceramica_piso: null,
  azulejo: null
};
/* slug → [categoria, profundidade da paralaxe em metros (0 = sem), ajustes] */
const SLUGS = {
  reboco_rustico_offwhite: ['parede'], pintura_lisa: ['parede'],
  tijolo_macico_colonial_palha: ['alvenaria', 0.010], tijolinho_laranja: ['alvenaria', 0.009],
  bloco_ceramico_furado: ['alvenaria', 0.008], bloco_concreto: ['alvenaria', 0.007],
  pedra_moledo_clara: ['pedra', 0.018], pedra_rachao: ['pedra', 0.030],
  pedra_sao_tome: ['pedra', 0, { aniso: 1 }], granito_cinza: ['pedra', 0, { aniso: 1 }], marmore_branco: ['pedra', 0, { aniso: 1 }],
  madeira_tabua_vertical_avela: ['madeira'], madeira_angelim_pedra: ['madeira'], pvc_amadeirado_caramelo: ['madeira', 0, { veio: 1 }],
  forro_madeira_lambri: ['madeira'], madeira_escura_imbuia: ['madeira'], madeira_clara_freijo: ['madeira', 0, { veio: 1 }],
  madeira_deck: ['madeira', 0, { aniso: 1 }], piso_laminado_claro: ['madeira', 0, { aniso: 1 }], taco_espinha: ['madeira', 0, { aniso: 1 }],
  telha_shingle_marrom: ['cobertura', 0.012], telha_ceramica: ['cobertura', 0.030], telha_colonial: ['cobertura', 0.035],
  telha_fibrocimento: ['cobertura'], telha_metalica: ['cobertura'],
  porcelanato_acetinado_claro: ['piso'], porcelanato_antiderrapante_externo: ['piso'], azulejo_porcelanato_bwc: ['piso'],
  porcelanato_branco_60: ['piso'], porcelanato_grafite: ['piso'], pastilha_vidro: ['piso'], ladrilho_hidraulico: ['piso'],
  concreto_natural_greige: ['concreto'], concreto_aparente_formas: ['concreto', 0, { mist: 0 }], concreto_liso_claro: ['concreto', 0, { mist: 0 }],
  cimento_queimado: ['concreto', 0, { aniso: 1 }],
  piso_tijolo_macico: ['externo', 0.009], piso_permeavel: ['externo', 0.010], cascalho: ['externo', 0.025],
  grama: ['externo'], terra: ['externo', 0, { mist: 0 }], areia: ['externo', 0, { mist: 1 }], asfalto: ['externo', 0, { mist: 1 }],
  metal_preto_fosco: ['metal'], aluminio_escovado: ['metal', 0, { aniEsp: 0.6 }],
  /* [frente T] a leva de 21/10/2026 (tools/gerar-texturas-t.py) */
  tecido_estofado: ['tecido'], couro_claro: ['tecido'], aco_pintado_liso: ['metal'], aco_galvanizado: ['metal', 0, { aniEsp: 0.3 }], inox_escovado: ['metal', 0, { aniEsp: 0.6 }],
  plastico_liso_branco: ['plastico'], borracha_preta: ['plastico'], louca_porcelana: ['plastico'], casca_arvore: ['casca', 0.020]
};

/* o perfil de um slug (categoria + ajustes); null = slug fora da biblioteca */
export function perfilDe(slug) {
  const e = SLUGS[slug]; if (!e) return null;
  const c = CAT[e[0]];
  return Object.assign({ slug, cat: e[0], prof: e[1] || 0 }, c, e[2] || {}, { aniso: (e[2] && e[2].aniso != null ? e[2].aniso : c.aniso) ? 1 : 0 });
}
export function slugsDoPerfil() { return Object.keys(SLUGS); }

/* bytes de uma textura RGBA8 com a cadeia de mipmaps (≈ 4/3) */
export function bytesTextura(w, h) { return Math.round(w * h * 4 * 4 / 3); }
/* [frente T] OS DEGRAUS de resolução (o que SOBE à placa além da reserva 1K do pacote, que já está lá):
     2k  = cor 2048 + normal 2048 + ORM 1024        med = cor 2048 + normal 1024 + ORM 1024
     peq = normal 1024 + ORM 1024 (a cor fica na reserva de 1024 — repetir a mesma resolução seria desperdício; o ganho
           do degrau é o AO, a altura/paralaxe, a rugosidade e o normal a 1024 em vez de 512)
   soCor (só a foto de porcelanato do rejunte): cor 2048 e nada mais. */
export const DEGRAUS = ['2k', 'med', 'peq'];
export function bytesDegrau(degrau, comNormal, soCor) {
  const cor2k = bytesTextura(2048, 2048), n1k = bytesTextura(1024, 1024);
  if (soCor) return degrau === 'peq' ? 0 : cor2k;
  if (degrau === 'peq') return (comNormal ? n1k : 0) + n1k;
  return cor2k + (comNormal ? (degrau === '2k' ? cor2k : n1k) : 0) + n1k;
}
/* estimativa ANTES de baixar (o manifesto não traz as dimensões) */
export function estimativaBytes(comNormal, degrau, soCor) { return bytesDegrau(degrau || '2k', comNormal, soCor); }

/* área (m²) por índice de material, somando os triângulos dos grupos da cena (pos Float32 xyz, idx Uint32 opcional) */
export function areasPorMaterial(grupos) {
  const out = {};
  (grupos || []).forEach((g) => {
    if (!g || !g.pos || !g.pos.length) return;
    const P = g.pos, I = g.idx, n = I ? I.length : P.length / 3;
    let s = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = (I ? I[t] : t) * 3, b = (I ? I[t + 1] : t + 1) * 3, c = (I ? I[t + 2] : t + 2) * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      s += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    }
    out[g.mat] = (out[g.mat] || 0) + s;
  });
  return out;
}

/* O PLANO (frente T): de quais slugs subir mapas maiores, em que degrau e em que ordem.
   entradas = [{ slug, area, normal, soCor }] (uma por slug, área somada); o manifesto diz quem TEM 2K.
   NADA É CORTADO PELO FIM DA FILA: todo slug começa no degrau mais barato (peq: normal e ORM a 1024, a cor fica na reserva)
   e a memória que sobra compra UPGRADES, na ordem do melhor custo-benefício (valor ÷ MB):
     peq → med (cor 2048): valor = log2(1 + área m²)          med → 2k (normal 2048): 0,3 × isso
   (log, para o terreno de 75 mil m² não comer o orçamento de uma cozinha de 20 m²). Assim a maior área ganha 2K, a pequena fica
   no 1K e longe a mipmap resolve. Só se nem o degrau barato de todos couber é que o de MENOR área fica na reserva 1K.
   Detalhe de canto (< AREA_MIN_M2) fica na reserva. Devolve `degraus` { slug: 'peq'|'med'|'2k' } e `previstoMB`. */
export function planejar(entradas, manifesto, qualidade) {
  const teto = (TETO_MB[qualidade] != null ? TETO_MB[qualidade] : 0) * 1048576;
  const slugs = (manifesto && manifesto.slugs) || {};
  const lista = (entradas || []).filter((e) => e && e.slug && slugs[e.slug] && perfilDe(e.slug)).sort((a, b) => (b.area || 0) - (a.area || 0));
  const pulados = [], cand = [];
  lista.forEach((e) => {
    if (teto <= 0) pulados.push({ slug: e.slug, motivo: 'qualidade sem 2K' });
    else if ((e.area || 0) < AREA_MIN_M2) pulados.push({ slug: e.slug, motivo: 'área < ' + AREA_MIN_M2 + ' m²' });
    else cand.push(e);
  });
  const c = (e, g) => bytesDegrau(g, !!e.normal, !!e.soCor);
  const nivel = {};          /* 'peq' | 'med' | '2k' | 'fora' */
  let previsto = 0;
  cand.forEach((e) => { nivel[e.slug] = 'peq'; previsto += c(e, 'peq'); });
  /* nem o degrau barato de todos cabe: sai o de menor área (cand está do maior para o menor) */
  for (let i = cand.length - 1; i >= 0 && previsto > teto; i--) { previsto -= c(cand[i], 'peq'); nivel[cand[i].slug] = 'fora'; }
  const opcoes = [];
  cand.forEach((e) => {
    if (nivel[e.slug] === 'fora') return;
    const w = Math.log2(1 + (e.area || 0));
    opcoes.push({ e, de: 'peq', para: 'med', d: c(e, 'med') - c(e, 'peq'), v: w });
    opcoes.push({ e, de: 'med', para: '2k', d: c(e, '2k') - c(e, 'med'), v: w * 0.3 });
  });
  opcoes.forEach((o) => { o.r = o.d > 0 ? o.v / o.d : Infinity; });
  opcoes.sort((a, b) => b.r - a.r || (b.e.area || 0) - (a.e.area || 0));
  for (let k = 0; k < opcoes.length; k++) {
    const o = opcoes[k];
    if (nivel[o.e.slug] !== o.de) continue;               /* o 2k só depois do med (a ordem por razão pode trazer o 2k antes: volta no laço abaixo) */
    if (previsto + o.d > teto) continue;
    previsto += o.d; nivel[o.e.slug] = o.para;
  }
  /* uma segunda volta pega os 2k cujo med só foi comprado depois deles na ordem */
  for (let k = 0; k < opcoes.length; k++) {
    const o = opcoes[k];
    if (nivel[o.e.slug] !== o.de || previsto + o.d > teto) continue;
    previsto += o.d; nivel[o.e.slug] = o.para;
  }
  const carregar = [], degraus = {};
  cand.forEach((e) => {
    const g = nivel[e.slug];
    if (g === 'fora') { pulados.push({ slug: e.slug, motivo: 'teto de memória (fica na reserva 1K)' }); return; }
    if (e.soCor && g === 'peq') return;      /* só a foto do rejunte: sem cor nova não há o que subir */
    carregar.push(e.slug); degraus[e.slug] = g;
  });
  return { carregar, degraus, pulados, previstoMB: Math.round(previsto / 1048576), tetoMB: Math.round(teto / 1048576) };
}

/* [frente T] COMO TINGIR: o bimtextura.tinta leva a média da foto à cor do material, mas limita o fator a 0,2..5.
   Laca grafite (cor 0,13) sobre madeira clara pedia fator 0,04 e saía marrom; branco sobre foto escura pedia > 5.
   tx = { tinta, alvoSrgb, mediaSrgb }. Modo 'razao' = a tinta de sempre (por canal); modo 'luma' = a cor do material
   multiplicada pela LUMINÂNCIA da foto normalizada (o detalhe da foto, a cor do projeto). 'luma' também quando o matiz muda
   muito (razão entre o maior e o menor fator > 2,5: o ruído de croma da foto seria esticado). */
const linS = (c) => { c = Math.min(1, Math.max(0, +c || 0)); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export function modoTinta(tx) {
  const t = (tx && tx.tinta) || [1, 1, 1];
  if (!tx || !tx.alvoSrgb || !tx.mediaSrgb) return { modo: 'razao' };
  if (t[0] === 1 && t[1] === 1 && t[2] === 1) return { modo: 'razao' };          /* sem tinta (cinza genérico sobre foto natural, ou material que não tinge) */
  const alvo = tx.alvoSrgb.map(linS), media = tx.mediaSrgb.map(linS);
  const raw = [0, 1, 2].map((i) => alvo[i] / Math.max(media[i], 0.002));
  const maior = Math.max(raw[0], raw[1], raw[2]), menor = Math.max(Math.min(raw[0], raw[1], raw[2]), 1e-4);
  const bateuNoTeto = raw.some((v) => v < 0.2 || v > 5);
  if (!bateuNoTeto && maior / menor <= 2.5) return { modo: 'razao' };
  const lumM = Math.max(0.2126 * media[0] + 0.7152 * media[1] + 0.0722 * media[2], 0.002);
  const lumA = 0.2126 * alvo[0] + 0.7152 * alvo[1] + 0.0722 * alvo[2];
  const mx = Math.max(alvo[0], alvo[1], alvo[2]), mn = Math.min(alvo[0], alvo[1], alvo[2]);
  const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
  return { modo: 'luma', k: alvo.map((v) => v / lumM), lumM, lumA, sat, raw, neutra: sat < 0.18 };
}

/* as URLs dos mapas de um slug (a pasta pode ser apelido de outra: porcelanato_branco_60 lê a do azulejo) */
export function urlsDe(slug, manifesto, base) {
  const m = manifesto && manifesto.slugs && manifesto.slugs[slug]; if (!m) return null;
  const pasta = base + (m.pasta || slug) + '/', a = m.arquivos || {}, o = {};
  ['cor', 'normal', 'rugosidade', 'ao', 'altura'].forEach((k) => { if (a[k]) o[k] = pasta + a[k]; });
  return o.cor ? o : null;
}

/* [entrega pesada, 25/10/2026] os arquivos que o _carregarSlug vai pedir de um slug, no degrau dele — a MESMA regra
   (peq sem a cor; soCor só a cor; normal só com relevo). É o que a Cena baixa sob demanda (js/bimpesado.js). */
export function arquivosDoSlug(u, comNormal, degrau, soCor) {
  if (!u) return [];
  const semCor = degrau === 'peq' && !soCor, o = [];
  if (!semCor && u.cor) o.push(u.cor);
  if (!soCor && comNormal && u.normal) o.push(u.normal);
  if (!soCor) ['rugosidade', 'ao', 'altura'].forEach((k) => { if (u[k]) o.push(u[k]); });
  return o;
}
/* o caminho das peças 2K como o repositório (e o data/render-pesado.json) as chama */
export const REL_2K = 'img/texturas2k/';

/* ORM: R = AO, G = rugosidade, B = altura (8 bits cada, w × h). Mapa ausente: AO 255 (sem oclusão), rugosidade 255, altura 128.
   Mapas de tamanhos diferentes são reamostrados (vizinho mais próximo) para o da rugosidade. Devolve também a média do AO. */
export function empacotarORM(ao, rug, alt, w, h, wa, ha, wb, hb) {
  const px = new Uint8Array(w * h * 4), n = w * h;
  let somaAO = 0;
  const igualA = ao && (wa || w) === w && (ha || h) === h, igualB = alt && (wb || w) === w && (hb || h) === h;
  const amostra = (m, mw, mh, x, y) => m[Math.min(mh - 1, Math.floor(y * mh / h)) * mw + Math.min(mw - 1, Math.floor(x * mw / w))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x, i = k * 4;
      const a = !ao ? 255 : (igualA ? ao[k] : amostra(ao, wa, ha, x, y));
      px[i] = a; px[i + 1] = rug ? rug[k] : 255;
      px[i + 2] = !alt ? 128 : (igualB ? alt[k] : amostra(alt, wb, hb, x, y));
      px[i + 3] = 255; somaAO += a;
    }
  }
  return { px, mediaAO: somaAO / (n * 255) };
}

/* quanto o AO do mapa é "esticado": 1 / média, limitado (a média do AO de ambientCG fica entre 0,75 e 0,95) */
export function fatorAO(media) { return 1 / Math.min(1, Math.max(0.35, media || 1)); }

/* ---------------------------------------------------------------------
 * PARTE DO NAVEGADOR (three r186 WebGPU + TSL)
 * --------------------------------------------------------------------- */
let THREE = null, T = null;
export function configurar(tres, tsl) { THREE = tres; T = tsl; }


/* [frente T] reflexo anisotrópico dos metais escovados (aluminio_escovado, aco_galvanizado). Precisa de um atributo `tangent` na
   malha (ver `tangentes`): é a direção u da projeção planar, que o bimtextura sabe de cabeça. false = desliga o ramo todo. */
export const ANISO_ESPECULAR = true;

export class Mat2K {
  /* o: { qualidade: 'leve'|'alta'|'ultra', aniso: n, base: URL da pasta das texturas 2K, manifestoUrl, THREE, TSL } */
  constructor(o) {
    o = o || {};
    if (o.THREE && o.TSL) configurar(o.THREE, o.TSL);
    this.qualidade = TETO_MB[o.qualidade] != null ? o.qualidade : 'alta';
    this.aniso = o.aniso || 8; this.anisoMax = Math.min(16, o.anisoMax || 16);
    this.rejunte = o.rejunte !== false;          /* [frente T] false = o rejunte volta a ser o das texturas CPU (o ANTES) */
    this.anisoEsp = o.anisoEsp !== false && ANISO_ESPECULAR;
    const aqui = (typeof import.meta !== 'undefined' && import.meta.url) ? import.meta.url : 'http://localhost/js/bimmat2k.js';
    this.base = o.base || new URL('../img/texturas2k/', aqui).href;
    /* [entrega pesada, 25/10/2026] o 2K NÃO vem mais no pacote: sem `base` explícita, as peças vêm do js/bimpesado.js (baixadas
       sob demanda, guardadas no IndexedDB). `fonte: false` = o caminho antigo (pasta local), para teste e ferramenta. */
    this.fonte = o.fonte === false || o.base ? null : (o.fonte || 'auto');
    this._urls = null; this.pesado = null;
    this.manifestoUrl = o.manifestoUrl || new URL('../data/texturas2k.json', aqui).href;
    this.manifesto = null; this.erroManifesto = null;
    this._zerar();
  }
  _zerar() {
    this.entradas = [];            /* um por material da cena que ganhou o grafo */
    this.texturas = [];            /* o que este módulo criou (e desfaz) */
    this.pacotes = {};             /* slug → { cor, normal, orm, mediaAO } já criados */
    this.bytes = 0; this.falhas = []; this.plano = null; this.aplicados = []; this.pom = 0; this.nRejunte = 0; this.nLuma = 0; this.nAniso = 0;
    this._tok = (this._tok || 0) + 1;
    this.fase = 'vazio'; this.ms = null;
  }
  get ativo() { return this.qualidade !== 'leve' && !!this.manifesto && !!THREE && !!T; }
  get passos() { return PASSOS_POM[this.qualidade] || 0; }

  async carregarManifesto() {
    if (this.manifesto || this.erroManifesto) return this.manifesto;
    try {
      const r = await fetch(this.manifestoUrl);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this.manifesto = await r.json();
    } catch (e) { this.erroManifesto = String(e && e.message || e); }
    return this.manifesto;
  }
  /* uma cena nova: desfaz o que a anterior criou */
  nova() { this.descartar(); this._zerar(); }

  /* [frente T] este material vai pelo rejunte ANALÍTICO? (o motor, nesse caso, nem monta as 3 texturas de 1024 px da CPU) */
  querRejunte(p) { return !!(this.ativo && this.rejunte && p && p.textura && p.textura.tipo === 'rejunte' && p.textura.peca && p.textura.peca.length === 2); }

  /* ------------------------------------------------------------ o grafo do material */
  /* chamado pelo `_material` do motor: m já tem o 1K ligado (map/normalMap/roughnessMap); `base(url, srgb)` devolve a textura
     1K COMPARTILHADA do motor (sem repetição, sem clone). O grafo nasce ligado ao 1K; o 2K entra trocando o value. */
  registrar(m, p, base) {
    if (!this.ativo) return false;
    const tx = p && p.textura;
    if (this.querRejunte(p)) return this._registrarRejunte(m, p, tx, base);
    if (!tx || tx.tipo !== 'cc0' || !tx.arquivos || !tx.slug) return false;
    const perfil = perfilDe(tx.slug); if (!perfil || !this.manifesto.slugs[tx.slug]) return false;
    const a = tx.arquivos, comNormal = p.relevo > 0 && !!a.normal;
    const cor = base(a.cor, true), nor = comNormal ? base(a.normal, false) : null, rug = a.rugosidade ? base(a.rugosidade, false) : null;
    if (!cor || !rug) return false;
    if (perfil.aniso) [cor, nor, rug].forEach((t) => { if (t) t.anisotropy = this.anisoMax; });   /* piso: anisotropia máxima já na reserva 1K */
    const veg = p.id === 'grama' || p.id === 'terra';
    const lt = modoTinta(tx);
    const e = {
      m, p, slug: tx.slug, perfil, comNormal, veg, lt, nos: { cor: [], normal: [], orm: [] }, res: { cor, normal: nor, orm: rug },
      uAo: T.uniform(0), uPom: T.uniform(0), uAoK: T.uniform(1),
      pom: this.passos > 0 && perfil.prof > 0 && !veg
    };
    try { this._grafo(e, tx); } catch (err) { this.falhas.push({ slug: tx.slug, erro: 'grafo: ' + String(err && err.message || err) }); return false; }
    /* [frente E2] a luz da obra e a luz assada tiram o ALBEDO da cor média do mapa (albedoDe, js/bimluzobra.js): sem o map ele
       caía na cor do material (branca) → 0,9 em madeira, tijolo e piso, e o rebote saía claro demais (21/10/2026) */
    m.mapaAlbedo = cor;   /* ⚠ fora do userData: Material.copy/clone serializa o userData em JSON (uma Texture lá dentro vira imagem) */
    m.map = null; m.normalMap = null; m.roughnessMap = null;
    m.userData.mat2k = true;
    /* [frente T] O ALBEDO PARA A LUZ DE REBOTE. O `albedoDe` (bimluzobra.js) = cor do material × média da imagem em m.map; o grafo do 2K
       zera m.map e a cor virou o FATOR de tinta (≈ 1): toda parede de madeira, telha e tijolo rebatia a luz como se fosse branca (albedo ≈ 0,9
       em vez de 0,3). Aqui o albedo vai pronto: a média da foto × a tinta (razão) ou a própria cor do material (luma), com o desconto do metal. */
    { const med = (tx.mediaSrgb || [0.5, 0.5, 0.5]).map(linS), tt = tx.tinta || [1, 1, 1];
      const alb = lt.modo === 'luma' ? lt.k.map((v) => v * lt.lumM) : med.map((v, i) => v * tt[i]), metal = m.metalness || 0;
      m.userData.albedo = alb.map((v) => Math.min(0.9, v * (1 - 0.8 * metal))); }
    this.entradas.push(e);
    if (e.pom) this.pom++;
    if (lt.modo === 'luma') this.nLuma++;
    return true;
  }

  _grafo(e, tx) {
    const { Fn, If, Loop, Break, uv, vec2, vec3, float, mix, clamp, floor, fract, sin, smoothstep, normalize, max, dFdx, dFdy, length, positionView, positionWorld, normalWorld, parallaxDirection, texture, normalMap, mx_fractal_noise_float, dot, select } = T;
    const { m, p, perfil, res, lt } = e;
    const escala = tx.escala > 0 ? tx.escala : 1, asp = tx.asp > 0 ? tx.asp : 1;
    /* ⚠ grama e terra: o motor sempre as amostrou SEM a repetição da textura (uv em metros, 1 m por ladrilho) — o aspecto aprovado.
       Mantido: o mesmo uv serve a cor, o normal e o ORM (antes o normal usava 2 m e a cor 1 m: descasados). */
    const rep = e.veg ? vec2(1, 1) : vec2(1 / escala, 1 / (escala * asp));
    /* um nó de amostra por uso; todos entram na lista do slot para a troca de value */
    const amostra = (slot, uvNo, grad) => {
      let n = texture(res[slot]).sample(uvNo);     /* res[slot] é sempre a textura ATUAL do slot: nó criado depois da troca já nasce 2K */
      if (grad) n = n.grad(grad[0], grad[1]);
      e.nos[slot].push(n);
      return n;
    };
    const N = this.passos, prof = perfil.prof, d0 = POM_DIST.d0, d1 = POM_DIST.d1;
    const uPom = e.uPom, uAo = e.uAo, uAoK = e.uAoK;
    const luma = lt.modo === 'luma', laca = luma && perfil.cat === 'madeira' && lt.neutra;   /* madeira pintada de grafite/branco = laca, não veio */

    /* ---- [frente T] a base das coordenadas: veio na direção certa nas faces verticais (u e v trocam) ---- */
    const uvBase0 = uv().mul(rep);
    const vert = perfil.veio ? normalWorld.y.abs().lessThan(0.5) : null;
    const uvBase = vert ? select(vert, vec2(uvBase0.y, uvBase0.x), uvBase0) : uvBase0;

    /* ---- as coordenadas (com a paralaxe, quando é material de relevo forte) ---- */
    const uvFinal = Fn(() => {
      const uvT = uvBase.toVar('m2kUV');
      const dx = dFdx(uvT).toVar('m2kDx'), dy = dFdy(uvT).toVar('m2kDy');
      const vd = normalize(parallaxDirection).toVar('m2kVd');            /* derivadas do TBN: FORA do If */
      const dist = length(positionView).toVar('m2kDist');
      const fade = float(1).sub(smoothstep(d0, d1, dist)).mul(uPom).toVar('m2kFade');
      const out = uvT.toVar('m2kOut');
      If(fade.greaterThan(0.02).and(vd.z.greaterThan(0.05)), () => {
        const altura = (c) => amostra('orm', c, [dx, dy]).b;
        const total = vd.xy.div(max(vd.z, 0.22)).mul(prof).mul(fade).mul(rep);   /* deslocamento em coordenadas de textura na profundidade máxima */
        const passo = total.div(N), camada = 1 / N;
        const cur = uvT.toVar('m2kCur'), curD = float(0).toVar('m2kCurD');
        const h = float(1).sub(altura(cur)).toVar('m2kH');                         /* profundidade da superfície = 1 − altura */
        Loop(N, () => {
          If(curD.greaterThanEqual(h), () => { Break(); });
          cur.subAssign(passo);
          h.assign(float(1).sub(altura(cur)));
          curD.addAssign(camada);
        });
        const prev = cur.add(passo);
        const depois = h.sub(curD);                                                /* ≤ 0: já dentro do relevo */
        const antes = float(1).sub(altura(prev)).sub(curD.sub(camada));            /* > 0: ainda fora */
        const w = clamp(depois.div(depois.sub(antes).sub(1e-5)), 0, 1);
        out.assign(mix(cur, prev, w));
      });
      return out;
    });
    const uvP = e.pom ? uvFinal().toVar('m2kUVP') : uvBase;
    /* gradientes da UV SEM deslocamento: a mip e a anisotropia vêm daqui (a paralaxe não pode "pular" de nível) */
    const gx = dFdx(uvBase), gy = dFdy(uvBase);

    /* ---- cor: variação anti-repetição + (superfície aleatória) mistura de duas amostras ---- */
    /* [frente T] modo 'luma': só a luminância da foto vira detalhe e a cor do material (k = alvo ÷ luminância média) é a cor */
    const tinta = luma ? vec3(lt.k[0], lt.k[1], lt.k[2]) : vec3(m.color.r, m.color.g, m.color.b);
    const detalhe = (rgb) => {
      if (!luma) return rgb;
      const l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      const l2 = laca ? mix(float(lt.lumM), l, 0.25) : l;          /* laca: o veio fica a 25 % */
      return vec3(l2, l2, l2);
    };
    let corNo;
    if (e.veg) {
      /* o mesmo ruído que o motor já usava no chão (gramado chapado de longe) */
      const v1 = mx_fractal_noise_float(positionWorld.xz.mul(0.045), 3, 2.0, 0.5).mul(0.5).add(0.5);
      const v2 = mx_fractal_noise_float(positionWorld.xz.mul(0.35), 2, 2.0, 0.5).mul(0.5).add(0.5);
      corNo = detalhe(amostra('cor', uvP, [gx, gy]).rgb).mul(tinta).mul(mix(0.72, 1.2, v1)).mul(mix(0.9, 1.08, v2));
    } else {
      let amo;
      const n3 = mx_fractal_noise_float(positionWorld.mul(1 / perfil.esc), 3, 2.0, 0.5).mul(0.5).add(0.5).clamp(0, 1);
      if (perfil.mist) {
        const idx = n3.mul(16.0), i0 = floor(idx), f = fract(idx);
        const oA = sin(vec2(3.0, 7.0).mul(i0)), oB = sin(vec2(3.0, 7.0).mul(i0.add(1.0)));
        const cA = amostra('cor', uvP.add(oA), [gx, gy]).rgb, cB = amostra('cor', uvP.add(oB), [gx, gy]).rgb;
        const t = smoothstep(0.2, 0.8, f.sub(dot(cA.sub(cB), vec3(0.1, 0.1, 0.1))));
        amo = mix(cA, cB, t);
      } else amo = amostra('cor', uvP, [gx, gy]).rgb;
      amo = detalhe(amo);
      const n2 = mx_fractal_noise_float(positionWorld.mul(1 / (perfil.esc * 0.37)).add(vec3(17.3, 5.1, 9.7)), 2, 2.0, 0.5).mul(0.5).add(0.5).clamp(0, 1);
      const al = laca ? 0.3 : 1;
      const lum = mix(1 - perfil.lum * al, 1 + perfil.lum * al, n3);
      const cr = n2.sub(0.5).mul(2 * perfil.croma * al);
      corNo = amo.mul(tinta).mul(lum).mul(vec3(float(1).add(cr), 1, float(1).sub(cr)));
    }
    m.colorNode = corNo;

    /* ---- normal 2K (no mesmo uv deslocado) ---- */
    if (e.comNormal) {
      let nrm = amostra('normal', uvP, [gx, gy]).rgb;
      if (vert) nrm = select(vert, vec3(nrm.y, nrm.x, nrm.z), nrm);        /* [frente T] u e v trocados: o X e o Y do normal trocam junto */
      const esc = p.relevo * (laca ? 0.3 : 1);
      m.normalNode = normalMap(nrm, vec2(esc, esc));
    }

    /* ---- ORM: rugosidade (G) sempre; AO (R) e altura (B) só depois do 2K (até lá o "ORM" é a rugosidade 1K em cinza) ---- */
    const orm = amostra('orm', uvP, [gx, gy]);
    m.roughnessNode = float(p.rugosidade * (laca ? 0.75 : 1)).mul(orm.g);
    const aoBruto = clamp(orm.r.mul(uAoK), 0, 1);
    m.aoNode = mix(float(1), aoBruto, uAo.mul(perfil.ao));

    /* ---- [frente T] metal escovado: o brilho se estica na direção das escovadas (u) ---- */
    if (this.anisoEsp && perfil.aniEsp > 0 && p.metalicidade > 0.5) {
      m.anisotropy = perfil.aniEsp; m.anisotropyRotation = 0;
      m.userData.mat2kAniso = true; this.nAniso++;
    }
  }

  /* [frente T] a tangente da projeção planar (u horizontal ao longo da face; piso: X) para a malha de material anisotrópico */
  tangentes(geo) {
    try {
      if (!THREE || !geo || geo.getAttribute('tangent')) return;
      const nor = geo.getAttribute('normal'); if (!nor) return;
      const n = nor.count, t = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const nx = nor.getX(i), nz = nor.getZ(i), tl = Math.sqrt(nx * nx + nz * nz);
        if (tl < 0.05) { t[i * 4] = 1; t[i * 4 + 1] = 0; t[i * 4 + 2] = 0; }
        else { t[i * 4] = nz / tl; t[i * 4 + 1] = 0; t[i * 4 + 2] = -nx / tl; }
        t[i * 4 + 3] = 1;
      }
      geo.setAttribute('tangent', new THREE.BufferAttribute(t, 4));
    } catch (err) { /* sem tangente o anisotrópico some; o desenho segue */ }
  }

  /* ------------------------------------------------------------ [frente T] rejunte analítico */
  _registrarRejunte(m, p, tx, base) {
    const face = REJ_FACE[p.id] || null, man = face && this.manifesto.slugs[face.slug];
    const e = {
      m, p, slug: null, perfil: null, comNormal: false, rej: true, soCor: true, veg: false, lt: { modo: 'razao' }, nos: { cor: [], normal: [], orm: [] }, res: {},
      uAo: null, uPom: null, uAoK: null, pom: false
    };
    if (man) {
      const BT = (typeof globalThis !== 'undefined' && globalThis.BimTextura) || null;
      const arq = BT && BT.arquivos ? BT.arquivos(face.slug, true) : null;
      const t = arq && base(arq.cor, true);
      if (t) {
        t.anisotropy = this.anisoMax;
        e.slug = face.slug; e.res.cor = t; e.faceM = man.m > 0 ? man.m : 1.2; e.forca = face.forca;
        const med = BT && BT.BIB && BT.BIB[face.slug] && BT.BIB[face.slug].media;
        e.faceLum = med ? Math.max(0.2126 * linS(med[0]) + 0.7152 * linS(med[1]) + 0.0722 * linS(med[2]), 0.05) : 0.6;
      }
    }
    try { this._grafoRejunte(e, tx, p); } catch (err) { this.falhas.push({ slug: 'rejunte:' + p.id, erro: 'grafo: ' + String(err && err.message || err) }); return false; }
    m.map = null; m.normalMap = null; m.roughnessMap = null; m.clearcoatMap = null;
    m.userData.mat2k = true; m.userData.rejunteAnalitico = true;
    this.entradas.push(e); this.nRejunte++;
    return true;
  }

  _grafoRejunte(e, tx, p) {
    const { uv, vec2, vec3, float, mix, clamp, floor, fract, sin, smoothstep, min, max, dFdx, dFdy, length, texture, normalMap, mx_fractal_noise_float, dot, select, positionWorld } = T;
    const m = e.m, pw = tx.peca[0], ph = tx.peca[1], hw = Math.max(0.0005, tx.junta || 0.002) / 2;
    const cj = (tx.corJunta || [0.7, 0.68, 0.64]).map(linS), rugJ = tx.rugJunta != null ? tx.rugJunta : 0.9, vari = tx.variacao != null ? tx.variacao : 0.02;
    const uvM = uv();                                                    /* metros do modelo (projeção planar do bimtextura) */
    const q = uvM.div(vec2(pw, ph)), id = floor(q), f = fract(q);
    const dx = min(f.x, float(1).sub(f.x)).mul(pw), dy = min(f.y, float(1).sub(f.y)).mul(ph);
    const d = min(dx, dy);                                               /* distância (m) até a junta mais próxima */
    const gxm = dFdx(uvM), gym = dFdy(uvM);
    const aa = max(length(gxm), length(gym)).add(1e-5);                  /* o pixel em metros */
    /* cobertura da junta (largura 2·hw) por um pixel de largura aa — filtro de caixa EXATO: some com a distância sem inchar */
    const hi = min(float(hw), d.add(aa.mul(0.5))), lo = max(float(-hw), d.sub(aa.mul(0.5)));
    const grout = clamp(hi.sub(lo), 0, aa).div(aa);
    /* cada peça sorteia o seu tom e um pedaço (às vezes girado) da foto de porcelanato */
    const h = fract(sin(dot(id, vec2(127.1, 311.7))).mul(43758.5453)), h2 = fract(h.mul(97.13).add(0.31));
    let faceDet = float(1);
    if (e.slug) {
      const mF = e.faceM, rot = h2.greaterThan(0.5);
      const loc = f.mul(vec2(pw, ph)).div(mF).add(vec2(h.mul(9.7), h2.mul(7.3)));
      const uvF = select(rot, loc.yx, loc);
      const gxF = select(rot, gxm.yx, gxm).div(mF), gyF = select(rot, gym.yx, gym).div(mF);
      const tf = texture(e.res.cor).sample(uvF).grad(gxF, gyF); e.nos.cor.push(tf);
      faceDet = mix(float(1), dot(tf.rgb, vec3(0.2126, 0.7152, 0.0722)).div(e.faceLum), e.forca);
    }
    const mot = mix(float(0.985), float(1.015), mx_fractal_noise_float(positionWorld.mul(1.1), 3, 2.0, 0.5).mul(0.5).add(0.5).clamp(0, 1));
    const base = vec3(m.color.r, m.color.g, m.color.b);                  /* a cor do material (linear) */
    const peca = base.mul(mix(float(1 - vari), float(1 + vari), h)).mul(faceDet).mul(mot);
    m.colorNode = mix(peca, vec3(cj[0], cj[1], cj[2]), grout);
    m.roughnessNode = mix(float(p.rugosidade).mul(mix(float(0.9), float(1.1), h2)), float(rugJ), grout);
    if (p.clearcoat > 0) m.clearcoatNode = float(p.clearcoat).mul(float(1).sub(grout));
    m.aoNode = float(1).sub(grout.mul(0.45));
    /* o chanfro: a borda da peça desce 0,7 mm em 0,9 mm até a junta (o vale que a luz rasante vê); some quando o pixel é maior que ele */
    const bev = 0.0009, prof = 0.0007;
    const t = clamp(d.sub(hw).div(bev), 0, 1);
    const slope = t.mul(float(1).sub(t)).mul(6 * prof / bev);
    const fade = float(1).sub(smoothstep(bev * 0.8, bev * 3.0, aa));
    const sx = select(f.x.lessThan(0.5), float(1), float(-1)), sy = select(f.y.lessThan(0.5), float(1), float(-1));
    const alongU = dx.lessThan(dy);
    const nx = select(alongU, slope.mul(sx).negate(), float(0)), ny = select(alongU, float(0), slope.mul(sy).negate());
    const k = fade.mul(Math.max(0.3, (p.relevo || 0.25) * 2));
    m.normalNode = normalMap(vec3(nx.mul(k), ny.mul(k), float(1)).normalize().mul(0.5).add(0.5));
  }

  /* ------------------------------------------------------------ carga assíncrona */
  _tex(img, srgb, w, h) {
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.flipY = false;   /* o bitmap já nasce de cabeça para baixo (imageOrientation: 'flipY') */
    this.texturas.push(t);
    this.bytes += bytesTextura(w, h);
    return t;
  }
  /* larg: reduz na decodificação (o bitmap de 2048 nem chega a existir inteiro na memória da página) */
  async _bitmap(url, larg) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    const blob = await r.blob();
    const o = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    if (larg) { o.resizeWidth = larg; o.resizeQuality = 'high'; }
    return createImageBitmap(blob, o);
  }
  /* o canal de cinza (8 bits) de um mapa — o JPEG de 1 canal decodifica com R = G = B */
  async _cinza(url) {
    const bm = await this._bitmap(url), w = bm.width, h = bm.height;
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bm, 0, 0); bm.close();
    const d = cx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = d[i * 4];
    return { g, w, h };
  }
  /* as URLs de um slug: da pasta local (fonte desligada) ou os blob: do que o js/bimpesado.js já guardou */
  _urlsDe(slug) {
    if (!this.fonte) return urlsDe(slug, this.manifesto, this.base);
    const r = urlsDe(slug, this.manifesto, REL_2K); if (!r || !this._urls) return null;
    const o = {};
    for (const k of Object.keys(r)) { if (this._urls[r[k]]) o[k] = this._urls[r[k]]; }
    return o.cor || o.normal ? o : null;
  }
  async _fonte() {
    if (this.fonte && this.fonte !== 'auto') return this.fonte;
    try { this.fonte = await import('./bimpesado.js'); } catch (e) { this.fonte = null; this.pesado = { erro: 'bimpesado: ' + String(e && e.message || e) }; }
    return this.fonte;
  }
  /* o degrau diz o que sobe: 2k (cor + normal 2048) · med (cor 2048 + normal 1024) · peq (normal 1024; a cor fica na reserva) · soCor (a foto do rejunte) */
  async _carregarSlug(slug, comNormal, degrau, soCor) {
    const u = this._urlsDe(slug); if (!u) throw new Error('sem URLs');
    const tok = this._tok, semCor = degrau === 'peq' && !soCor;
    const [cor, nor, rug, ao, alt] = await Promise.all([
      semCor ? null : this._bitmap(u.cor), !soCor && comNormal && u.normal ? this._bitmap(u.normal, degrau === '2k' ? 0 : 1024) : null,
      !soCor && u.rugosidade ? this._cinza(u.rugosidade) : null, !soCor && u.ao ? this._cinza(u.ao) : null, !soCor && u.altura ? this._cinza(u.altura) : null
    ]);
    if (tok !== this._tok) { if (cor) cor.close(); if (nor) nor.close(); throw new Error('cena trocada'); }
    const base = rug || ao || alt;
    const pk = { cor: null, normal: null, orm: null, mediaAO: 1, degrau };
    if (cor) {
      pk.cor = this._tex(cor, true, cor.width, cor.height);
      pk.cor.onUpdate = () => { try { cor.close(); } catch (x) { /* já fechado */ } pk.cor.image = null; pk.cor.onUpdate = null; };
    }
    if (nor) { pk.normal = this._tex(nor, false, nor.width, nor.height); pk.normal.onUpdate = () => { try { nor.close(); } catch (x) { /* já fechado */ } pk.normal.image = null; pk.normal.onUpdate = null; }; }
    if (base) {
      const w = (rug || base).w, h = (rug || base).h;
      const emp = empacotarORM(ao && ao.g, rug && rug.g, alt && alt.g, w, h, ao && ao.w, ao && ao.h, alt && alt.w, alt && alt.h);
      const t = new THREE.DataTexture(emp.px, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.needsUpdate = false;
      this.texturas.push(t); this.bytes += bytesTextura(w, h);
      pk.orm = t; pk.mediaAO = emp.mediaAO; pk.temAO = !!ao; pk.temAltura = !!alt;
    }
    return pk;
  }

  /* Depois que o 1K terminou de baixar: reserva que falhou (offline, 404) vira textura neutra — nunca amostra de imagem vazia */
  conferir() {
    const neutra = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; this.texturas.push(t); return t; };
    const cache = {};
    this.entradas.forEach((e) => {
      [['cor', 255, 255, 255], ['normal', 128, 128, 255], ['orm', 255, 255, 255]].forEach(([k, r, g, b]) => {
        const t = e.res[k];
        if (t && (t.userData.erro || !t.image)) {
          const n = cache[k] || (cache[k] = neutra(r, g, b));
          e.res[k] = n; e.nos[k].forEach((no) => { no.value = n; });
          this.falhas.push({ slug: e.slug || ('rejunte:' + e.p.id), erro: 'reserva 1K de ' + k + ' não carregou' });
        }
      });
    });
  }

  /* Planeja e carrega: não bloqueia a abertura da cena (o 1K já está na tela). `grupos` = os da cena (áreas),
     `mats` = os materiais do motor na ordem de cena.materiais (o índice de cada um liga ao grupo). */
  async iniciar(grupos, mats) {
    if (!this.ativo || !this.entradas.length) { this.fase = 'sem 2K'; return this.info(); }
    const tok = this._tok, t0 = performance.now();
    const areaMat = areasPorMaterial(grupos), porSlug = {};
    this.entradas.forEach((e) => {
      if (!e.slug) return;
      const idx = (mats || []).indexOf(e.m), s = porSlug[e.slug] || (porSlug[e.slug] = { slug: e.slug, area: 0, normal: false, soCor: true });
      s.area += areaMat[idx] || 0; s.normal = s.normal || e.comNormal; s.soCor = s.soCor && !!e.soCor;
    });
    this.plano = planejar(Object.keys(porSlug).map((k) => porSlug[k]), this.manifesto, this.qualidade);
    /* [entrega pesada] as peças que o plano pede: o que já está guardado vira blob:, o que falta é baixado AGORA (o 1K segue na tela);
       sem rede ou falhou, a cena fica no 1K — sem pedido perdido, sem 404 */
    let lista = this.plano.carregar.slice();
    if (this.fonte) {
      const F = await this._fonte();
      if (tok !== this._tok) return null;
      if (!F) { this.fase = 'sem 2K (módulo de download não carregou)'; return this.info(); }
      const arqs = {}, rels = [];
      lista.forEach((slug) => { arqs[slug] = arquivosDoSlug(urlsDe(slug, this.manifesto, REL_2K), porSlug[slug].normal, this.plano.degraus[slug] || '2k', porSlug[slug].soCor); arqs[slug].forEach((r) => { if (rels.indexOf(r) < 0) rels.push(r); }); });
      let d = await F.disponiveis(rels);
      if (tok !== this._tok) return null;
      this.pesado = { pedidas: rels.length, guardadas: rels.length - d.faltam.length, mbFaltando: Math.round(d.bytesFaltam / 1048576), baixou: 0 };
      if (d.faltam.length) {
        this.fase = 'baixando 2K';
        const r = await F.baixar(d.faltam, { rotulo: 'texturas de alta qualidade' });
        if (tok !== this._tok) return null;
        this.pesado.baixou = r.baixados || 0; this.pesado.offline = !!r.offline; this.pesado.motivo = r.motivo || null; this.pesado.falhas = (r.falhas || []).length;
        d = await F.disponiveis(rels);
        if (tok !== this._tok) return null;
      }
      this._urls = d.urls;
      const falta = {}; d.faltam.concat(d.desconhecidos).forEach((r) => { falta[r] = 1; });
      lista = lista.filter((slug) => !arqs[slug].some((r) => falta[r]));   /* slug com peça faltando fica inteiro no 1K */
      if (!lista.length) { this.fase = this.pesado.offline ? 'sem 2K (sem rede: fica o 1K)' : 'sem 2K (fica o 1K)'; return this.info(); }
    }
    this.fase = 'carregando';
    const fila = lista, total = fila.length, pausa = (ms) => new Promise((r) => setTimeout(r, ms));
    const pronto = [];
    let tratados = 0;
    const aplicar = (slug, pk) => {
      /* as texturas entram primeiro (needsUpdate UMA vez por textura) e depois os nós de todos os materiais do slug */
      const af = Math.min(this.anisoMax, Math.max(this.aniso, this.entradas.some((e) => e.slug === slug && (e.rej || e.perfil.aniso)) ? 16 : 0));
      [pk.cor, pk.normal, pk.orm].forEach((t) => { if (t) { t.anisotropy = af; t.needsUpdate = true; } });
      this.entradas.filter((e) => e.slug === slug).forEach((e) => {
        if (pk.cor) { e.res.cor = pk.cor; e.nos.cor.forEach((n) => { n.value = pk.cor; }); }
        if (pk.normal && e.comNormal) { e.res.normal = pk.normal; e.nos.normal.forEach((n) => { n.value = pk.normal; }); }
        if (pk.orm && e.uAoK) {
          e.res.orm = pk.orm; e.nos.orm.forEach((n) => { n.value = pk.orm; });
          e.uAoK.value = fatorAO(pk.mediaAO);
          if (pk.temAO) e.uAo.value = 1;
          if (pk.temAltura && e.pom) e.uPom.value = 1;
        }
      });
      this.aplicados.push(slug);
    };
    /* dois por vez (rede + decodificação fora da thread principal); o upload à placa é um material por vez, com pausa */
    const trabalhador = async () => {
      while (fila.length && tok === this._tok) {
        const slug = fila.shift();
        try { const pk = await this._carregarSlug(slug, porSlug[slug].normal, this.plano.degraus[slug] || '2k', porSlug[slug].soCor); if (tok !== this._tok) return; this.pacotes[slug] = pk; pronto.push(slug); }
        catch (err) { if (tok === this._tok) { this.falhas.push({ slug, erro: String(err && err.message || err) }); tratados++; } }
      }
    };
    const aplicador = async () => {
      while (tok === this._tok && tratados < total) {
        if (pronto.length) { const s = pronto.shift(); aplicar(s, this.pacotes[s]); tratados++; await pausa(140); }
        else await pausa(60);
      }
    };
    await Promise.all([trabalhador(), trabalhador(), aplicador()]);
    if (tok !== this._tok) return null;
    this.fase = 'pronto'; this.ms = Math.round(performance.now() - t0);
    return this.info();
  }

  info() {
    return {
      ativo: this.ativo, qualidade: this.qualidade, fase: this.fase, materiais: this.entradas.length, paralaxe: this.pom, passos: this.passos,
      rejunte: this.nRejunte, luma: this.nLuma, aniso: this.nAniso,
      aplicados: this.aplicados.slice(), plano: this.plano, texturasMB: Math.round(this.bytes / 1048576), tetoMB: TETO_MB[this.qualidade],
      falhas: this.falhas.slice(), ms: this.ms, erroManifesto: this.erroManifesto, pesado: this.pesado
    };
  }

  /* devolve TUDO à placa: textura, bitmap, ORM. Chamar ao trocar de cena e ao fechar a aba (a régua da memória). */
  descartar() {
    this._tok = (this._tok || 0) + 1;
    this.texturas.forEach((t) => {
      try { if (t.image && t.image.close) t.image.close(); } catch (x) { /* já fechado */ }
      try { t.onUpdate = null; t.dispose(); } catch (x) { /* já descartado */ }
      t.image = null;
    });
    this.texturas = []; this.pacotes = {}; this.entradas = []; this.bytes = 0; this.aplicados = []; this.fase = 'descartado';
  }
}
