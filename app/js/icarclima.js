/* =====================================================================
 * icarclima.js — CLIMA DO IÇAMENTO: VENTO NO GANCHO, JANELA DO DIA, AO VIVO E VOZ (ESPEC-ICAMENTO-CENARIO.md §II.10).
 * Motor PURO (ES5, testável em Node). A previsão vem do servidor da RA (server/icar-geo.js → /ia/geo/clima), normalizada:
 *   horas: [{ t (ISO UTC), passoH, v10, v80?, v120?, v180?, dir10, raj10 (null = o provedor não dá), chuva (mm/h), vis (m)?, neblina (%)?,
 *             trovoada, cape?, temp }]
 *
 * ⚠ RAJADA: o MET Norway não dá rajada no Brasil. Sem ela, a rajada a 10 m é ESTIMADA = vento médio × fatorRajada (premissa 1,5,
 *   editável) — e a tela diz "estimada". O ANEMÔMETRO do equipamento, digitado, MANDA no status ao vivo.
 * ⚠ ALTURA: com vento a 80/120/180 m (Open-Meteo comercial) → interpolação LOG-LINEAR em z; acima do último nível ou só com 10 m →
 *   o perfil S2 da NBR 6123 (IcarPlano.S2, categoria do terreno e classe da carga) a partir do nível conhecido. Abaixo de 10 m vale
 *   o de 10 m (reduzir seria contra a segurança — a mesma regra do motor do plano).
 * ⚠ Compara a RAJADA no gancho com o limite do fabricante (a favor da segurança) e diz isso; quando a ficha disser outra grandeza,
 *   troca-se aqui.
 * ===================================================================== */
(function (global) {
  "use strict";
  var PREMISSAS = {
    fatorRajada: 1.5,      // rajada de 3 s ≈ 1,5 × vento médio, quando o provedor não dá rajada (premissa; o anemômetro manda)
    chuvaMax_mmh: 2,       // premissa da RA: acima disso, suspender
    neblinaMax_pct: 50,    // MET Norway dá neblina em % de área — acima disso, suspender (sem visibilidade em metros)
    visMin_m: 500,         // quando o provedor dá visibilidade (Open-Meteo comercial)
    capeMax: null,         // risco de raio por CAPE (J/kg) — sem valor da RA, não usado
    atencao: 0.8           // ATENÇÃO a partir de 80 % de algum limite
  };
  function prem(p) { var o = {}, k; for (k in PREMISSAS) o[k] = PREMISSAS[k]; if (p) for (k in p) if (p[k] != null && p[k] !== "") o[k] = +p[k]; return o; }
  function P() { return global.IcarPlano; }
  function arred(v, c) { var f = Math.pow(10, c == null ? 1 : c); return Math.round(v * f) / f; }
  function br(v, c) { return String(arred(v, c == null ? 1 : c)).replace(".", ","); }
  function S2(cat, classe, z) { var pl = P(); return pl && pl.S2 ? pl.S2(cat || "III", classe || "B", Math.max(10, z)) : Math.pow(Math.max(10, z) / 10, 0.105); }

  /* vento MÉDIO na altura z */
  function ventoNaAltura(h, z, cat, classe) {
    if (!h || h.v10 == null) return null;
    z = Math.max(10, +z || 10);
    var niv = [[10, h.v10], [80, h.v80], [120, h.v120], [180, h.v180]].filter(function (x) { return x[1] != null && isFinite(x[1]); });
    if (niv.length > 1) {
      for (var i = 0; i < niv.length - 1; i++) {
        var a = niv[i], b = niv[i + 1];
        if (z <= b[0]) { var u = (Math.log(z) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0])); return a[1] + (b[1] - a[1]) * u; }
      }
      var ult = niv[niv.length - 1];
      return ult[1] * S2(cat, classe, z) / S2(cat, classe, ult[0]);
    }
    return h.v10 * S2(cat, classe, z) / S2(cat, classe, 10);
  }
  /* RAJADA na altura z: a do provedor a 10 m (ou a estimada) levada pelo perfil S2 */
  function rajadaNaAltura(h, z, cat, classe, pp) {
    if (!h || h.v10 == null) return null;
    pp = pp || PREMISSAS;
    var est = h.raj10 == null, r10 = est ? h.v10 * pp.fatorRajada : h.raj10;
    return { valor: r10 * S2(cat, classe, z) / S2(cat, classe, 10), estimada: est };
  }

  /* uma hora para os içamentos ics = [{ nome, z (altura do gancho, m), limite (m/s), cat, classe }] */
  function avaliarHora(h, ics, lim) {
    var pp = prem(lim), out = { t: h.t, estado: "ok", motivos: [], rajadas: [] };
    function marca(e, m) { if (e === "bloqueado" || (e === "atencao" && out.estado === "ok")) out.estado = e; out.motivos.push(m); }
    (ics || []).forEach(function (ic) {
      var r = rajadaNaAltura(h, ic.z, ic.cat, ic.classe, pp); if (!r) return;
      out.rajadas.push({ nome: ic.nome, valor: arred(r.valor, 1), estimada: r.estimada });
      if (!(+ic.limite > 0)) return;
      var txt = "rajada " + (r.estimada ? "estimada " : "") + br(r.valor) + " m/s no gancho" + (ic.nome ? " (" + ic.nome + ")" : "") + " · limite " + br(ic.limite);
      if (r.valor > +ic.limite) marca("bloqueado", txt); else if (r.valor >= pp.atencao * ic.limite) marca("atencao", txt);
    });
    if (h.trovoada) marca("bloqueado", "trovoada prevista");
    if (h.chuva != null && h.chuva > pp.chuvaMax_mmh) marca("bloqueado", "chuva " + br(h.chuva) + " mm/h · máximo " + br(pp.chuvaMax_mmh));
    else if (h.chuva != null && pp.chuvaMax_mmh > 0 && h.chuva >= pp.atencao * pp.chuvaMax_mmh) marca("atencao", "chuva " + br(h.chuva) + " mm/h");
    if (h.vis != null && h.vis < pp.visMin_m) marca("bloqueado", "visibilidade " + Math.round(h.vis) + " m · mínimo " + Math.round(pp.visMin_m));
    if (h.neblina != null && h.neblina >= pp.neblinaMax_pct) marca("bloqueado", "neblina em " + Math.round(h.neblina) + " % da área");
    if (pp.capeMax != null && h.cape != null && h.cape > pp.capeMax) marca("bloqueado", "risco de raio (CAPE " + Math.round(h.cape) + ")");
    return out;
  }

  /* as horas (inteiras, LOCAIS) do dia `dia` entre o nascer e o pôr; o bloco de 6 h do provedor vale para cada hora dele */
  function horasDoDia(horas, dia, fusoMin, nascer, por) {
    var b = Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)) - fusoMin * 60000, out = [];
    for (var k = 0; k < 24; k++) {
      var t = b + k * 3600000;
      if (nascer != null && t + 3600000 <= nascer) continue;
      if (por != null && t >= por) continue;
      var h = null;
      for (var i = 0; i < horas.length; i++) { var t0 = Date.parse(horas[i].t), dur = (horas[i].passoH || 1) * 3600000; if (t >= t0 && t < t0 + dur) { h = horas[i]; break; } }
      if (h) { var c = {}; for (var x in h) c[x] = h[x]; c.t = new Date(t).toISOString(); c.horaLocal = k; out.push(c); }
    }
    return out;
  }
  /* JANELA: a primeira sequência de horas em que TODOS os içamentos do dia cabem (duração somada), sem hora bloqueada */
  function janela(horas, dia, ics, lim, opts) {
    opts = opts || {};
    var hs = horasDoDia(horas || [], dia, +opts.fusoMin || 0, opts.nascer, opts.por), dur = 0;
    (ics || []).forEach(function (ic) { dur += +ic.duracao_min || 0; });
    var nh = Math.max(1, Math.ceil(dur / 60)), aval = hs.map(function (h) { var a = avaliarHora(h, ics, lim); a.horaLocal = h.horaLocal; a.h = h; return a; });   // a.h: a hora crua (a tela desenha chuva, neblina e vento dela)
    var melhor = null;
    for (var i = 0; i + nh <= aval.length && !melhor; i++) {
      var ok = true, aten = false;
      for (var j = i; j < i + nh; j++) { if (aval[j].estado === "bloqueado" || aval[j].horaLocal !== aval[i].horaLocal + (j - i)) { ok = false; break; } if (aval[j].estado === "atencao") aten = true; }
      if (ok) melhor = { inicio: aval[i].horaLocal, fim: aval[i].horaLocal + nh, atencao: aten };
    }
    return { dia: dia, horas: aval, melhor: melhor, duracao_min: dur, semPrevisao: !hs.length,
      motivo: !hs.length ? "previsão ainda não disponível para esse dia" : !melhor ? "nenhuma janela de " + nh + " h seguidas sem bloqueio entre o nascer e o pôr do sol" : "" };
  }
  /* AGORA: a hora corrente da previsão — ou o ANEMÔMETRO digitado (manda) */
  function agora(horas, tMs, ics, lim, anemometro) {
    var pp = prem(lim), h = null;
    for (var i = 0; i < (horas || []).length; i++) { var t0 = Date.parse(horas[i].t), dur = (horas[i].passoH || 1) * 3600000; if (tMs >= t0 && tMs < t0 + dur) { h = horas[i]; break; } }
    var out = { status: "SEM DADOS", motivos: [], fonte: "previsao", hora: h ? h.t : null };
    if (anemometro && +anemometro.ms >= 0 && anemometro.ms !== "" && anemometro.ms != null) {
      out.fonte = "anemometro"; out.status = "LIBERADO";
      (ics || []).forEach(function (ic) {
        if (!(+ic.limite > 0)) return;
        var txt = "anemômetro " + br(+anemometro.ms) + " m/s · limite " + br(ic.limite) + (ic.nome ? " (" + ic.nome + ")" : "");
        if (+anemometro.ms > +ic.limite) { out.status = "SUSPENDER"; out.motivos.push(txt); }
        else if (+anemometro.ms >= pp.atencao * ic.limite && out.status !== "SUSPENDER") { out.status = "ATENCAO"; out.motivos.push(txt); }
      });
      if (h) { var a2 = avaliarHora(h, [], lim); if (a2.estado === "bloqueado") { out.status = "SUSPENDER"; out.motivos = out.motivos.concat(a2.motivos); } else if (a2.estado === "atencao" && out.status === "LIBERADO") { out.status = "ATENCAO"; out.motivos = out.motivos.concat(a2.motivos); } }
      return out;
    }
    if (!h) return out;
    var a = avaliarHora(h, ics, lim);
    out.status = a.estado === "bloqueado" ? "SUSPENDER" : a.estado === "atencao" ? "ATENCAO" : "LIBERADO";
    out.motivos = a.motivos; out.rajadas = a.rajadas;
    return out;
  }

  /* VOZ: frases curtas, unidades por extenso, sem sigla nem pontuação falada (regra da casa); número arredondado ao inteiro */
  function falaNumero(v) { return String(Math.round(+v)); }
  function frases(tipo, d) {
    d = d || {};
    if (tipo === "melhor") return d.melhor ? "Melhor horário para os içamentos de hoje: das " + d.melhor.inicio + " às " + d.melhor.fim + " horas." : "Hoje não há janela segura para os içamentos.";
    if (tipo === "liberado") return "Içamento " + (d.n || "") + " liberado. Vento na altura do gancho " + falaNumero(d.vento) + " metros por segundo. Limite " + falaNumero(d.limite) + ".";
    if (tipo === "atencao") return "Atenção. Rajada de " + falaNumero(d.vento) + " metros por segundo, perto do limite de " + falaNumero(d.limite) + ".";
    if (tipo === "suspender") return "Suspender o içamento. " + (d.motivo || ("Rajada de " + falaNumero(d.vento) + " metros por segundo agora, acima do limite de " + falaNumero(d.limite) + "."));
    if (tipo === "neblina") return "Neblina. Visibilidade baixa no canteiro.";
    if (tipo === "trovoada") return "Trovoada prevista. Suspender os içamentos.";
    return "";
  }
  /* retrato para a liberação (II.11.2): o que valia no instante */
  function retrato(clima, ag, tMs) {
    return { fonte: clima && clima.fonte || null, consultadoEm: clima && clima.consultadoEm || null, lat: clima && clima.lat, lon: clima && clima.lon, hora: ag && ag.hora || null,
      status: ag && ag.status || null, motivos: ag && ag.motivos ? ag.motivos.slice(0, 4) : [], rajadas: ag && ag.rajadas ? ag.rajadas.slice(0, 6) : [], fonteStatus: ag && ag.fonte || null, em: tMs ? new Date(tMs).toISOString() : null };
  }

  var IcarClima = { PREMISSAS: PREMISSAS, ventoNaAltura: ventoNaAltura, rajadaNaAltura: rajadaNaAltura, avaliarHora: avaliarHora, horasDoDia: horasDoDia, janela: janela, agora: agora, frases: frases, retrato: retrato };
  global.IcarClima = IcarClima;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarClima;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
