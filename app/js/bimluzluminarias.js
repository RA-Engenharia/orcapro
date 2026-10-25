/* =====================================================================
 * bimluzluminarias.js — AS LUMINÁRIAS NA LUZ ASSADA (módulo ES, frente E
 * do render ao vivo, 20/10/2026; usado pelo js/bimluzassada.js na placa e
 * pelo js/bimluzobra.js nas sondas)
 *
 * O que resolve: no tempo real cada luminária ligada entra no shader de
 * TODO material — no quiosque de ensaio (38 luminárias) a placa ficou minutos
 * compilando e andava a 2 qps. A obra é estática: a luz das luminárias
 * (direta, com sombra, e o rebote dela) é calculada UMA vez junto com a
 * luz assada e o tempo real anda sem luz nenhuma no shader.
 *
 * AS MESMAS GRANDEZAS E A MESMA GEOMETRIA DA FOTO FÍSICA (o path tracer do
 * three-gpu-pathtracer 0.0.27, js/bimrendermotor.js), conferidas no código
 * dele (randomAreaLightSample / randomSpotLightSample / randomLightSample):
 *  · painel retangular (cd/m², um lado só, para baixo): E = L·A·cosθl·cosθs/d²,
 *    ponto uniforme no retângulo u × v (u = largura no x local, v =
 *    profundidade no y local; giro YXZ: y = rotY, x = −90°);
 *  · painel circular: disco de DIÂMETRO = largura (raio 0,5 em u/v),
 *    área = |u × v| · π/4;
 *  · spot (cd): disco de raio 3 cm cujo centro fica r/tan(ângulo) ABAIXO
 *    da luminária (o path tracer desloca o disco pelo −"normal" do lookAt,
 *    que aponta para cima) e E = I·smoothstep(cos cone, cos penumbra, cosθ)
 *    ·cosθs/max(d², ε); penumbra 0,3, cone = ângulo de facho / 2;
 *  · pontual (cd): 5 cm abaixo da posição, E = I·cosθs/max(d², 0,01).
 * Cor = a cor linear da temperatura (kelvinRGB) × intensidade.
 *
 * Na placa: 4 texels RGBA32F por luz, numa linha:
 *   t0 = (ponto de referência xyz, tipo)  tipo 0 retângulo, 1 disco, 2 spot, 3 pontual
 *   t1 = (emissão rgb = cor × intensidade, área do painel | raio do spot)
 *   t2 = (u do painel | eixo do spot, para CIMA; w = cos do cone)
 *   t3 = (v do painel | 1º eixo do disco do spot; w = cos da penumbra)
 * ===================================================================== */

export const TIPO = { retangulo: 0, disco: 1, spot: 2, pontual: 3 };

/* as luminárias LIGADAS da cena (BimRender._cenaDe → cena.luzes) no formato da placa */
export function luzesParaPlaca(luzes) {
  const L = (luzes || []).filter((l) => l && l.ligada !== false && +l.intensidade > 0 && Array.isArray(l.posicao));
  const n = L.length, d = new Float32Array(Math.max(1, n) * 16);
  L.forEach((l, i) => {
    const o = i * 16, c = l.cor || [1, 1, 1], I = +l.intensidade, p = l.posicao;
    d[o + 4] = c[0] * I; d[o + 5] = c[1] * I; d[o + 6] = c[2] * I;
    if (l.tipo === 'painel') {
      const w = +l.largura || 0.2, h = +l.profundidade || w, r = +l.rotY || 0, cs = Math.cos(r), sn = Math.sin(r);
      d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = l.circular ? TIPO.disco : TIPO.retangulo;
      d[o + 7] = w * h * (l.circular ? Math.PI / 4 : 1);
      /* u = R·(w,0,0), v = R·(0,h,0) com R = Ry(rotY)·Rx(rotX) (ordem YXZ do three); rotX = −π/2 (o padrão): u × v = (0, w·h, 0) —
         normal para cima, emite para baixo (o ponto iluminado está do lado −normal). [frente I] rotX = +π/2 emite para cima (sanca),
         0 para o lado (v = (h·sen rotX·sen rotY, h·cos rotX, h·sen rotX·cos rotY)) */
      const ax = l.rotX == null ? -Math.PI / 2 : +l.rotX, ca = Math.cos(ax), sa = Math.sin(ax);
      d[o + 8] = w * cs; d[o + 9] = 0; d[o + 10] = -w * sn;
      d[o + 12] = h * sa * sn; d[o + 13] = h * ca; d[o + 14] = h * sa * cs;
    } else if (l.tipo === 'spot') {
      const ang = Math.max(1e-3, (+l.angulo || 36) / 2 * Math.PI / 180), raio = 0.03, ini = raio / Math.max(Math.tan(ang), 1e-6);
      /* [frente I] o facho aponta para l.dir (spot dirigível); sem dir, para baixo. Eixo = −dir; 1º eixo do disco ⟂ ao eixo */
      const dv = Array.isArray(l.dir) ? l.dir : [0, -1, 0], dn = Math.hypot(dv[0], dv[1], dv[2]) || 1, ex = -dv[0] / dn, ey = -dv[1] / dn, ez = -dv[2] / dn;
      let e1x = 1, e1y = 0, e1z = 0; if (Math.abs(ex) > 0.9) { e1x = 0; e1z = 1; }
      const pr = e1x * ex + e1y * ey + e1z * ez; e1x -= pr * ex; e1y -= pr * ey; e1z -= pr * ez; const e1n = Math.hypot(e1x, e1y, e1z) || 1;
      d[o] = p[0] - ex * ini; d[o + 1] = p[1] - ey * ini; d[o + 2] = p[2] - ez * ini; d[o + 3] = TIPO.spot;
      d[o + 7] = raio;
      d[o + 8] = ex; d[o + 9] = ey; d[o + 10] = ez; d[o + 11] = Math.cos(ang);
      d[o + 12] = e1x / e1n; d[o + 13] = e1y / e1n; d[o + 14] = e1z / e1n; d[o + 15] = Math.cos(ang * (1 - 0.3));
    } else {
      d[o] = p[0]; d[o + 1] = p[1] - 0.05; d[o + 2] = p[2]; d[o + 3] = TIPO.pontual;
    }
  });
  return { dados: d, n, largura: Math.max(1, n) * 4 };
}

/* a luz i num ponto (sem sombra), no CENTRO da luminária: E (lux) numa superfície virada PARA a luz e a direção.
   As sondas usam isto (o cubo de luz pesa E pela direção); a placa faz a mesma conta com o ponto sorteado. */
export function luzNoPonto(pac, i, x, y, z, o) {
  const d = pac.dados, k = i * 16, tipo = d[k + 3];
  const tx = d[k] - x, ty = d[k + 1] - y, tz = d[k + 2] - z, d2 = tx * tx + ty * ty + tz * tz, dist = Math.sqrt(d2) || 1e-6;
  const lx = tx / dist, ly = ty / dist, lz = tz / dist;
  let f = 0;
  if (tipo <= 1) {
    const ux = d[k + 8], uy = d[k + 9], uz = d[k + 10], vx = d[k + 12], vy = d[k + 13], vz = d[k + 14];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const cl = lx * nx + ly * ny + lz * nz;
    f = cl > 0 ? d[k + 7] * cl / Math.max(d2, 1e-8) : 0;
  } else if (tipo === 2) {
    const ct = lx * d[k + 8] + ly * d[k + 9] + lz * d[k + 10], a = d[k + 11], b = d[k + 15];
    const t = Math.max(0, Math.min(1, (ct - a) / Math.max(1e-6, b - a))), sm = t * t * (3 - 2 * t);
    f = sm / Math.max(d2, 1e-6);
  } else f = 1 / Math.max(d2, 0.01);
  o[0] = d[k + 4] * f; o[1] = d[k + 5] * f; o[2] = d[k + 6] * f; o[3] = lx; o[4] = ly; o[5] = lz; o[6] = dist;
  return o;
}

/* GLSL (WebGL2): a mesma conta na placa. Precisa de PI e é incluído DEPOIS do GLSL_RAIO no shader das luminárias.
   ref = ponto da luz usado (para o raio de sombra). centro = sem sorteio (o peso da escolha da luz). */
export const GLSL_LUMINARIAS = `
uniform highp sampler2D uLuz;
uniform int uNLuz;
vec4 luzT(int i, int k) { return texelFetch(uLuz, ivec2(i * 4 + k, 0), 0); }
vec3 luzE(int i, vec3 P, vec3 N, vec2 r, bool centro, out vec3 ref) {
  vec4 a = luzT(i, 0), b = luzT(i, 1), c = luzT(i, 2), d = luzT(i, 3);
  int tipo = int(a.w + 0.5);
  ref = a.xyz;
  if (tipo <= 1) {
    vec2 q = vec2(0.0);
    if (!centro) q = tipo == 0 ? r - 0.5 : 0.5 * sqrt(r.x) * vec2(cos(2.0 * PI * r.y), sin(2.0 * PI * r.y));
    ref = a.xyz + c.xyz * q.x + d.xyz * q.y;
    vec3 nl = normalize(cross(c.xyz, d.xyz)), t = ref - P;
    float d2 = max(dot(t, t), 1e-8); vec3 l = t * inversesqrt(d2);
    float cl = dot(l, nl), cs = dot(N, l);
    return (cl > 0.0 && cs > 0.0) ? b.rgb * (b.w * cl * cs / d2) : vec3(0.0);
  }
  if (tipo == 2) {
    vec2 q = centro ? vec2(0.0) : b.w * sqrt(r.x) * vec2(cos(2.0 * PI * r.y), sin(2.0 * PI * r.y));
    vec3 ax = c.xyz, e1 = d.xyz, e2 = cross(ax, e1);
    ref = a.xyz + e1 * q.x + e2 * q.y;
    vec3 t = ref - P; float d2 = dot(t, t), dd = sqrt(d2); vec3 l = t / max(dd, 1e-6);
    float cs = dot(N, l), at = smoothstep(c.w, d.w, dot(l, ax));
    return cs > 0.0 ? b.rgb * (at * cs / max(d2, 1e-6)) : vec3(0.0);
  }
  vec3 t = ref - P; float d2 = dot(t, t); vec3 l = t * inversesqrt(max(d2, 1e-8));
  float cs = dot(N, l);
  return cs > 0.0 ? b.rgb * (cs / max(d2, 0.01)) : vec3(0.0);
}
float luzPeso(vec3 e) { return dot(e, vec3(0.2126, 0.7152, 0.0722)); }
`;
