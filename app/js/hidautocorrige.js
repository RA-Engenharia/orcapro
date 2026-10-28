/* =====================================================================
 * hidautocorrige.js — AUTOCORREÇÃO DO DIMENSIONAMENTO (motor PURO, ES5, Node-testável). Frente F2 da Casa 487, 27/10/2026.
 *
 * Pedido do Rogério (27/10/2026): "erro no dimensionamento → o sistema corrige sozinho (aumenta o DN, acrescenta tubo/coluna) e entrega o
 * dimensionamento todo", em vez de o usuário clicar em "Aplicar" e ler a reprovação.
 *
 *   HidAutoCorrigir.rodar(io, opc) → { ok, convergiu, voltas, aplicadas[], corrigidos[], duplicados[], pendencias[], resultado, relatorio[] }
 *
 *   io = {
 *     calcular()            → o resultado do HidDimensionar.calcular (res.ops com os DN, res.verificacoes, res.avisos, res.pendencias);
 *     aplicarOps(ops, rot)  → true/false: aplica um LOTE no modelo (um Ctrl+Z desfaz) — sem recalcular;
 *     achados?()            → HidCorrigir.achados(ctx) do modelo ATUAL: o que tem Corrigir automático (inclinação, bitola…);
 *     propor?(achado)       → HidCorrigir.propor(ctx, achado) → { ok, ops, texto, motivo };
 *     trecho?(id)           → o trecho do modelo (p1, p2, dn, material, sistema…) — para duplicar a linha;
 *     livre?(p1, p2)        → o caminho paralelo está livre? (parede, esgoto)
 *   }
 *   opc = { voltas?: 3 (máximo de voltas do calcular→aplicar), corrigirMax?: 40 (Corrigir automáticos por volta), duplicar?: true, tipos?: ["inclinacao","bitola"] }
 *
 * COMO AGE:
 *  1. calcula; as ops de DN do cálculo (res.ops) entram no modelo (aumentar o DN) — nunca diminuir (o próprio HidDimensionar já não diminui);
 *  2. refaz o cálculo; repete até não haver op nova ou até `voltas` (a mesma op duas vezes = não converge, para);
 *  3. o que ainda reprova e tem Corrigir automático (inclinação, bitola, ponta) é aplicado pelo HidCorrigir, que recusa a correção que piora o modelo;
 *  4. se a capacidade do MAIOR DN admissível não bastar (reprovação "acima da tabela"/"sem DN que atenda"), divide a contribuição numa SEGUNDA
 *     LINHA paralela (mesmo traçado deslocado, mesmo DN) quando o caminho está livre; senão vira pendência com o motivo;
 *  5. o resto vira PENDÊNCIA com o motivo — nada some calado, nada vira "ok" sem cálculo.
 * ⚠ Nenhum número de norma aqui: o DN e a capacidade vêm do HidDimensionar; o deslocamento da 2ª linha é critério de desenho (hid:ok).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var EPS = 1e-6;          // hid:ok tolerância numérica
  var VOLTAS = 3;          // hid:ok máximo de voltas (pedido do Rogério: "máx. 3 voltas")
  var CORRIGIR_MAX = 40;   // hid:ok teto de correções automáticas por volta (segurança contra laço)
  var DESLOC = 0.20;       // hid:ok a 2ª linha corre a 20 cm da primeira (eixo a eixo, além do diâmetro)
  var LIM_TXT = 120;       // hid:ok cortar o texto do motivo (formatação)
  var TIPOS_AUTO = ["inclinacao", "bitola"];   /* só o que é de DIMENSIONAMENTO: declividade e bitola; ligar peça/ponta é decisão do traçado, não da autocorreção */
  var SEM_CAPACIDADE = /acima da tabela|sem dn que atenda|nenhum dn|maior dn|n[aã]o h[aá] dn|capacidade.*(esgot|insuficiente)/i;

  function assinatura(ops) { return JSON.stringify(arr(ops).map(function (o) { return [o.op, o.id, o.dn, o.diametro, o.peca]; })); }
  function soDn(ops) { return arr(ops).filter(function (o) { return o && o.id != null && (o.op === "instAlterar" || o.op === "peca"); }); }

  /* os reprovados que a capacidade do maior DN não resolve (para a 2ª linha) */
  function semCapacidade(R) {
    var out = {};
    arr(R && R.verificacoes).forEach(function (v) {
      if (v.status !== "reprovado") return;
      var t = (arr(v.passos).join(" ") + " " + txt(v.nome));
      if (SEM_CAPACIDADE.test(t)) out[txt(v.alvo)] = t;
    });
    arr(R && R.avisos).forEach(function (a) {
      if (a.gravidade !== "erro" || !SEM_CAPACIDADE.test(txt(a.texto))) return;
      arr(a.elementos).forEach(function (id) { out[txt(id)] = txt(a.texto); });
    });
    return out;
  }
  /* a 2ª LINHA: o mesmo trecho deslocado na perpendicular, mesmo DN. Só trecho horizontal. → { op } | null */
  function duplicarTrecho(t, de, lado) {
    if (!t || !t.p1 || !t.p2) return null;
    var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, L = Math.sqrt(dx * dx + dz * dz);
    if (!(L > EPS)) return null;                                   /* vertical: não há "ao lado" */
    var nx = -dz / L * lado, nz = dx / L * lado, d = DE(t) + DESLOC;
    var o = copia(t); delete o.avisos; delete o.comprimento; delete o.comprimentoH; delete o.desnivel; delete o.inclinacao; delete o.vertical; delete o.diametro; delete o.aplicacaoAuto;
    o.op = "trecho"; o.id = txt(t.id) + "-b";
    o.p1 = { x: Math.round((t.p1.x + nx * d) * 10000) / 10000, y: t.p1.y, z: Math.round((t.p1.z + nz * d) * 10000) / 10000 };   // hid:ok 4 casas do biminst
    o.p2 = { x: Math.round((t.p2.x + nx * d) * 10000) / 10000, y: t.p2.y, z: Math.round((t.p2.z + nz * d) * 10000) / 10000 };   // hid:ok 4 casas do biminst
    delete o.continua; delete o.tomada;
    return o;
  }
  function DE(t) { return num(t && t.dn, 100) / 1000; }   // hid:ok mm → m (o DE do PVC ≈ DN; o deslocamento soma folga)

  /* "DN do modelo 75 < DN de conferência 100" (condutor vertical: a tabela de conferência está acima do DN do modelo): sobe o DN, nunca desce */
  var CONFERENCIA = /DN do modelo (\d+) < DN de confer[eê]ncia (\d+)/i;
  function opsConferencia(R) {
    var out = [];
    arr(R && R.verificacoes).forEach(function (v) {
      if (v.status !== "reprovado") return;
      var m = CONFERENCIA.exec(arr(v.passos).join(" ")); if (!m) return;
      var de = Number(m[1]), para = Number(m[2]);
      if (para > de) out.push({ op: "instAlterar", id: txt(v.alvo), dn: para });
    });
    return out;
  }
  function junta(a, b) {
    var por = {}, ordem = [];
    a.concat(b).forEach(function (o) { var k = o.id; if (por[k] == null) { por[k] = o; ordem.push(k); } else if (num(o.dn, 0) > num(por[k].dn, 0)) por[k] = o; });
    return ordem.map(function (k) { return por[k]; });
  }
  function rodar(io, opc) {
    opc = opc || {};
    var voltas = Math.max(1, Math.round(num(opc.voltas, VOLTAS))), cMax = Math.max(1, Math.round(num(opc.corrigirMax, CORRIGIR_MAX)));
    var out = { ok: false, convergiu: false, voltas: 0, aplicadas: [], corrigidos: [], duplicados: [], pendencias: [], resultado: null, relatorio: [] };
    if (!io || typeof io.calcular !== "function" || typeof io.aplicarOps !== "function") { out.pendencias.push({ chave: "autocorrecao.io", motivo: "sem calcular/aplicar: a autocorreção não rodou" }); return out; }
    var vistas = {}, R = null, v, tipos = arr(opc.tipos).length ? opc.tipos : TIPOS_AUTO;
    function corrigiveis() { return arr(io.achados()).filter(function (a) { return a && a.correcao && a.gravidade !== "info" && tipos.indexOf(a.tipo) >= 0; }).slice(0, cMax); }
    for (v = 1; v <= voltas; v++) {
      out.voltas = v;
      R = io.calcular(); if (!R) { out.pendencias.push({ chave: "autocorrecao.calculo", motivo: "o cálculo falhou na volta " + v }); break; }
      var mudou = false;
      /* 1) os DN do cálculo */
      var ops = junta(soDn(R.ops), opsConferencia(R));
      if (ops.length) {
        var as = assinatura(ops);
        if (vistas[as]) { out.relatorio.push("Volta " + v + ": as mesmas " + ops.length + " alteração(ões) de DN voltaram — o modelo não aceita (peça travada?); parei para não girar em falso."); out.pendencias.push({ chave: "autocorrecao.dn", motivo: "as alterações de DN calculadas não ficam no modelo (peça travada, fixada ou id inexistente)", ids: ops.map(function (o) { return o.id; }) }); break; }
        vistas[as] = 1;
        if (io.aplicarOps(ops, "Autocorreção: DN")) { mudou = true; out.aplicadas.push({ volta: v, tipo: "dn", qtd: ops.length, ids: ops.map(function (o) { return o.id; }) }); out.relatorio.push("Volta " + v + ": " + ops.length + " DN corrigido(s) pelo cálculo."); }
        else out.pendencias.push({ chave: "autocorrecao.dn", motivo: "o editor recusou as alterações de DN da volta " + v });
      }
      /* 2) o que reprova e tem Corrigir automático (inclinação, bitola, ponta…) */
      if (typeof io.achados === "function" && typeof io.propor === "function") {
        var ach = corrigiveis(), nOk = 0;
        for (var k = 0; k < ach.length; k++) {
          var P = io.propor(ach[k]);
          if (P && P.ok && arr(P.ops).length) {
            if (io.aplicarOps(P.ops, "Autocorreção: " + txt(ach[k].titulo))) { nOk++; mudou = true; out.corrigidos.push({ volta: v, chave: ach[k].chave, titulo: ach[k].titulo, texto: P.texto || ach[k].correcao.texto }); }
            ach = corrigiveis(); k = -1;   /* o modelo mudou: recomeça sobre os achados novos */
            if (nOk >= cMax) break;
          } else if (P && !P.ok) out.pendencias.push({ chave: "corrigir." + txt(ach[k].chave), motivo: txt(P.motivo) || "correção recusada", ids: ach[k].ids || [] });
        }
        if (nOk) out.relatorio.push("Volta " + v + ": " + nOk + " correção(ões) automática(s) (inclinação, bitola, ponta).");
      }
      if (!mudou) { out.convergiu = true; break; }
    }
    R = io.calcular() || R;
    /* 3) a capacidade do maior DN não basta → 2ª linha */
    if (opc.duplicar !== false && typeof io.trecho === "function") {
      var sc = semCapacidade(R), ids = Object.keys(sc), feitos = [];
      ids.forEach(function (id) {
        var t = io.trecho(id); if (!t) return;
        var tent = null;
        [1, -1].forEach(function (lado) {
          if (tent) return;
          var o = duplicarTrecho(t, DE(t), lado); if (!o) return;
          if (typeof io.livre === "function" && !io.livre(o.p1, o.p2)) return;
          tent = o;
        });
        if (!tent) { out.pendencias.push({ chave: "autocorrecao.duplicar." + id, motivo: "o maior DN não atende " + id + " e não há caminho livre para uma 2ª linha ao lado (" + sc[id].slice(0, LIM_TXT) + ")", ids: [id] }); return; }
        if (io.aplicarOps([tent], "Autocorreção: 2ª linha")) { feitos.push(tent); out.duplicados.push({ de: id, nova: tent.id, dn: tent.dn }); }
      });
      if (feitos.length) { out.relatorio.push(feitos.length + " 2ª linha(s) paralela(s) pelo limite de capacidade do maior DN: " + feitos.map(function (o) { return o.id; }).join(", ") + " — a contribuição deve ser DIVIDIDA entre as duas (conferir a ligação a montante)."); R = io.calcular() || R; }
    }
    /* 4) o que resta */
    out.resultado = R;
    arr(R && R.verificacoes).forEach(function (x) { if (x.status === "reprovado") out.pendencias.push({ chave: "reprovado." + txt(x.alvo), motivo: txt(x.nome) + ": " + arr(x.passos).slice(0, 2).join(" — "), ids: [x.alvo] }); });
    arr(R && R.avisos).forEach(function (a) { if (a.gravidade === "erro") out.pendencias.push({ chave: "aviso." + txt(a.id), motivo: txt(a.texto), ids: a.elementos || [] }); });
    arr(R && R.pendencias).forEach(function (p) { out.pendencias.push({ chave: "pendencia." + txt(p.chave), motivo: txt(p.motivo || p.texto), ids: [] }); });
    var vistasP = {}; out.pendencias = out.pendencias.filter(function (p) { var k = p.chave + "|" + p.motivo; if (vistasP[k]) return false; vistasP[k] = 1; return true; });
    out.ok = !!R && !arr(R.verificacoes).some(function (x) { return x.status === "reprovado"; }) && !arr(R.avisos).some(function (a) { return a.gravidade === "erro"; });
    out.convergiu = out.convergiu || (soDn(R && R.ops).length === 0 && opsConferencia(R).length === 0);
    out.relatorio.push(out.ok ? "Dimensionamento sem reprovação depois de " + out.voltas + " volta(s)." : "Depois de " + out.voltas + " volta(s) ainda há " + out.pendencias.length + " ponto(s) para o projetista (ver pendências).");
    return out;
  }

  var HidAutoCorrigir = { VERSAO: 1, rodar: rodar, duplicarTrecho: duplicarTrecho, semCapacidade: semCapacidade, VOLTAS: VOLTAS };
  global.HidAutoCorrigir = HidAutoCorrigir;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAutoCorrigir;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
