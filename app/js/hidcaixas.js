/* =====================================================================
 * hidcaixas.js — CAIXAS NOMEADAS E EM ORDEM (motor PURO, ES5, Node-testável). Frente F2 da Casa 487, 27/10/2026.
 *
 * Pedido do Rogério (27/10/2026): "o traçado do esgoto é feito DEPOIS de pôr uma caixa de inspeção próxima, que serve de referência de
 * para onde vai; o usuário renomeia as caixas e elas se interligam pela ordem." Nomes CI-01, CI-02… (inspeção do esgoto), CG-01…
 * (gordura) e CP-01… (pluvial), de MONTANTE para JUSANTE até a saída para a rua; os nomes saem na prancha e no memorial.
 *
 *   HidCaixas.listar(estado)                       → [{ id, fonte:"peca"|"familia", tipo:"CI"|"CG"|"CP", x, y, z, prof?, nome, auto }]
 *   HidCaixas.ordenar(estado, caixas, o)           → as mesmas, com .ordem (1 = mais a montante) e .jusante (id da seguinte, se a rede ligar)
 *   HidCaixas.nomear(estado, o)                    → { ops, lista[{id,nome,tipo,ordem}], ligacoes[{de,para}], avisos }  (renomeia SÓ o que é nome automático)
 *   HidCaixas.renomear(estado, id, nome)           → { ok, op } | { ok:false, motivo }  (a op instAlterar/instancia; Ctrl+Z desfaz)
 *   HidCaixas.cadeia(estado, o)                    → { ops, ligacoes, avisos, pendencias } — liga CI-n em CI-n+1 e a última à SAÍDA (espera), pelo lado de fora
 *   HidCaixas.nomeDe(item)                         → o nome gravado na peça (nome) ou na instância da família (inst.Nome)
 *
 * o = { rua?: { eixo:"z"|"x", borda:m, sinal:±1 }, saida?: {x,z}, parametros?, avaliarFam? }
 * ⚠ Nenhum número de norma aqui (declividade mínima e DN vêm do BimInst/HidNormas); distâncias de captura são geometria (hid:ok).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  var EPS = 1e-6;          // hid:ok tolerância numérica
  var CASAS = 10000;       // hid:ok 4 casas do biminst
  var CAPTURA = 0.35;      // hid:ok a ponta do tubo a até 35 cm do centro da caixa = ligada a ela (raio de 0,30 m + folga)
  var PASSOS = 200;        // hid:ok limite de saltos ao seguir a rede
  var PADRAO_AUTO = /^(CI|CG|CP)-\d+$/;
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function dois(n) { return (n < 10 ? "0" : "") + n; }   // hid:ok numeração com 2 dígitos

  var FAMILIAS = { "hid-caixa-inspecao": "CI", "hid-caixa-gordura": "CG", "hid-caixa-areia": "CP" };

  function nomeDe(item) {
    if (!item) return "";
    if (item.nome) return txt(item.nome);
    var inst = item.inst || {};
    return txt(inst.Nome || inst.nome || "");
  }
  /* as caixas do modelo: peça do traçado (caixa_inspecao / caixa_gordura) ou instância das famílias hid-caixa-* */
  function listar(estado) {
    var out = [], ins = estado && estado.instalacoes || {};
    arr(ins.pecas).forEach(function (k) {
      var tipo = null;
      if (k.peca === "caixa_inspecao") tipo = k.sistema === "pluvial" ? "CP" : "CI";
      else if (k.peca === "caixa_gordura") tipo = "CG";
      else if (k.peca === "caixa_areia") tipo = "CP";
      if (!tipo) return;
      var nome = nomeDe(k);
      out.push({ id: txt(k.id), fonte: "peca", tipo: tipo, x: k.x, y: k.y, z: k.z, prof: num(k.prof, null), nome: nome, auto: !nome || PADRAO_AUTO.test(nome), sistema: k.sistema });
    });
    arr(estado && estado.familias).forEach(function (f) {
      var tipo = FAMILIAS[txt(f.famId)]; if (!tipo) return;
      var nome = nomeDe(f);
      out.push({ id: txt(f.id), fonte: "familia", tipo: tipo, x: f.x, y: f.y, z: f.z, prof: null, nome: nome, auto: !nome || PADRAO_AUTO.test(nome), sistema: tipo === "CP" ? "pluvial" : "esgoto" });
    });
    return out;
  }
  function segmentos(estado, sistema) {
    return arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema === sistema; });
  }
  /* segue a rede a jusante de cada caixa (de p1 para p2) até outra caixa do mesmo grupo: o grafo montante → jusante */
  function jusanteDe(caixas, trechos) {
    var porP1 = trechos.slice();
    function caixaEm(p, ex) { var m = null; caixas.forEach(function (c) { if (c !== ex && d2(c, p) <= CAPTURA && (!m || d2(c, p) < d2(m, p))) m = c; }); return m; }
    caixas.forEach(function (c) {
      c.jusante = null;
      var atual = { x: c.x, z: c.z }, vistos = {}, n = 0, achou = false; c.jusanteL = 0;
      while (n++ < PASSOS && !achou) {
        var prox = porP1.filter(function (t) { return !vistos[t.id] && d2(atual, t.p1) <= CAPTURA; }).sort(function (a, b) { return d2(atual, a.p1) - d2(atual, b.p1); })[0];
        if (!prox) break;
        vistos[prox.id] = 1; c.jusanteL += d2(prox.p1, prox.p2);
        var fim = caixaEm(prox.p2, c);
        if (fim) { c.jusante = fim.id; achou = true; } else atual = { x: prox.p2.x, z: prox.p2.z };
      }
    });
  }
  function distRua(c, o) {
    if (o && o.saida) return d2(c, o.saida);
    if (o && o.rua) { var R = o.rua, v = R.eixo === "z" ? c.z : c.x; return Math.abs(R.borda - v); }
    return 0;
  }
  /* MONTANTE → JUSANTE por grupo (CI, CG, CP): a profundidade na rede (mais longe da saída primeiro); sem rede, a distância até a rua */
  function ordenar(estado, caixas, o) {
    o = o || {};
    ["CI", "CG", "CP"].forEach(function (tipo) {
      var gr = caixas.filter(function (c) { return c.tipo === tipo; }); if (!gr.length) return;
      var sis = tipo === "CP" ? "pluvial" : "esgoto";
      /* o esgoto liga CI com CG: a rede é uma só; o grafo usa o grupo todo do sistema */
      var grSis = caixas.filter(function (c) { return (c.tipo === "CP") === (sis === "pluvial"); });
      jusanteDe(grSis, segmentos(estado, sis));
      var porId = {}; grSis.forEach(function (c) { porId[c.id] = c; });
      /* "alt" = o comprimento do tubo até a saída (cada caixa soma o trecho até a seguinte): a mais longe da saída é a de montante */
      function alt(c, vis) { if (!c.jusante || !porId[c.jusante] || vis[c.id]) return 0; vis[c.id] = 1; return c.jusanteL + alt(porId[c.jusante], vis); }
      gr.forEach(function (c) { c._alt = alt(c, {}); c._dr = distRua(c, o); });
      var temRede = gr.some(function (c) { return c.jusante; });
      gr.sort(function (a, b) {
        if (temRede && Math.abs(b._alt - a._alt) > EPS) return b._alt - a._alt;
        if (Math.abs(b._dr - a._dr) > EPS) return b._dr - a._dr;
        return a.x - b.x || a.z - b.z || (a.id < b.id ? -1 : 1);
      });
      gr.forEach(function (c, i) { c.ordem = i + 1; });
    });
    caixas.forEach(function (c) { delete c._alt; delete c._dr; });
    return caixas;
  }
  /* renomeia SÓ o nome automático (CI-nn): o que o usuário escreveu fica; a numeração pula os números já tomados por nome do usuário */
  function nomear(estado, o) {
    var cs = ordenar(estado, listar(estado), o), ops = [], lista = [], avisos = [];
    ["CI", "CG", "CP"].forEach(function (tipo) {
      var gr = cs.filter(function (c) { return c.tipo === tipo; }).sort(function (a, b) { return a.ordem - b.ordem; });
      var tomados = {}; gr.forEach(function (c) { if (!c.auto) tomados[c.nome.toLowerCase()] = 1; });
      var n = 0;
      gr.forEach(function (c) {
        var nome = c.nome;
        if (c.auto) {
          do { n++; nome = tipo + "-" + dois(n); } while (tomados[nome.toLowerCase()]);
          tomados[nome.toLowerCase()] = 1;
          if (nome !== c.nome) ops.push(c.fonte === "peca" ? { op: "instAlterar", id: c.id, nome: nome } : { op: "instancia", id: c.id, inst: { Nome: nome } });
        }
        lista.push({ id: c.id, nome: nome, tipo: tipo, ordem: c.ordem, auto: c.auto, jusante: c.jusante || null });
      });
    });
    var porId = {}; lista.forEach(function (c) { porId[c.id] = c; });
    var ligacoes = [];
    lista.forEach(function (c) { if (c.jusante && porId[c.jusante]) ligacoes.push({ de: c.nome, para: porId[c.jusante].nome }); });
    /* "CI-n liga em CI-n+1": avisa onde a rede salta a ordem */
    ["CI", "CP"].forEach(function (tipo) {
      var gr = lista.filter(function (c) { return c.tipo === tipo; }).sort(function (a, b) { return a.ordem - b.ordem; });
      gr.forEach(function (c, i) { if (c.jusante && porId[c.jusante] && i + 1 < gr.length && porId[c.jusante].tipo === tipo && gr[i + 1].id !== c.jusante && porId[c.jusante].ordem !== c.ordem + 1) avisos.push("A caixa " + c.nome + " lança em " + porId[c.jusante].nome + " (não na seguinte, " + gr[i + 1].nome + "): conferir a ordem da rede."); });
    });
    return { ops: ops, lista: lista, ligacoes: ligacoes, avisos: avisos };
  }
  function renomear(estado, id, nome) {
    nome = txt(nome).trim();
    if (!nome) return { ok: false, motivo: "nome vazio" };
    var c = listar(estado).filter(function (x) { return x.id === txt(id); })[0];
    if (!c) return { ok: false, motivo: "a caixa " + id + " não existe no modelo" };
    var igual = listar(estado).filter(function (x) { return x.id !== c.id && x.nome.toLowerCase() === nome.toLowerCase(); })[0];
    if (igual) return { ok: false, motivo: "já existe a caixa " + igual.nome + " (" + igual.id + ")" };
    return { ok: true, op: c.fonte === "peca" ? { op: "instAlterar", id: c.id, nome: nome.slice(0, 40) } : { op: "instancia", id: c.id, inst: { Nome: nome.slice(0, 40) } } };   // hid:ok 40 caracteres
  }

  /* LIGA as caixas do esgoto em ORDEM (CI-n → CI-n+1) e a última à SAÍDA, pelo lado de fora (HidImplantacao.caminhoExterno), com a
     declividade mínima do DN (BimInst.declMinDn). Só liga o que a rede ainda não liga. */
  function cadeia(estado, o) {
    o = o || {};
    var B = dep("BimInst", "./biminst.js"), HI = dep("HidImplantacao", "./hidimplantacao.js"), HR = dep("HidRede", "./hidrede.js");
    var out = { ops: [], ligacoes: [], avisos: [], pendencias: [] }, par = o.parametros || {};
    if (!B || !HI) { out.pendencias.push({ chave: "caixas.motores", motivo: "os motores do biminst/implantação não carregaram" }); return out; }
    var cs = ordenar(estado, listar(estado), o).filter(function (c) { return c.tipo === "CI" || c.tipo === "CG"; });
    var ci = cs.filter(function (c) { return c.tipo === "CI"; }).sort(function (a, b) { return a.ordem - b.ordem; });
    if (!ci.length) return out;
    var dn = num(B.MATERIAIS.pvc_esgoto.dn, 100), i = B.declMinDn("esgoto", dn) / 100, T = HR && HR.terrenoDe ? HR.terrenoDe(estado, par) : null;   // hid:ok % → fração
    function yEntradaMax(c) { var yT = num(c.y, T ? T.y : 0); try { var v = HR.yMaxEntrada(par, dn, yT, {}); return isFinite(v) ? v : yT - 0.4; } catch (e) { return yT - 0.4; } }   // hid:ok reserva: 40 cm abaixo da tampa
    var out0 = {};
    ci.forEach(function (c, k) {
      out0[c.id] = yEntradaMax(c);
      if (k === 0) return;
      var a = ci[k - 1], b = c;
      if (a.jusante === b.id) { out.ligacoes.push({ de: a.id, para: b.id, existente: true }); return; }
      var cam; try { cam = HI.caminhoExterno(estado, { x: a.x, z: a.z }, { x: b.x, z: b.z }, { parametros: par }); } catch (e2) { cam = [{ x: a.x, z: a.z }, { x: b.x, z: b.z }]; }
      var yA = out0[a.id], pts = cam, L = 0;
      for (var q = 1; q < pts.length; q++) L += d2(pts[q - 1], pts[q]);
      var yIn = Math.min(yA - i * L, yEntradaMax(b)); out0[b.id] = yIn;
      var y = yA, nI = 0;
      for (var s = 1; s < pts.length; s++) {
        var Ls = d2(pts[s - 1], pts[s]), y2 = s === pts.length - 1 ? yIn : r4(y - i * Ls);
        out.ops.push({ op: "trecho", id: "cadeia-" + a.id + "-" + b.id + "-" + (++nI), sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: r4(pts[s - 1].x), y: r4(y), z: r4(pts[s - 1].z) }, p2: { x: r4(pts[s].x), y: r4(y2), z: r4(pts[s].z) } });
        y = y2;
      }
      out.ligacoes.push({ de: a.id, para: b.id, existente: false, comprimento: r4(L) });
    });
    /* a última caixa: a ESPERA da saída (continua) rumo à rua */
    var ult = ci[ci.length - 1], dirS = null;
    if (o.saida) { var dd = d2(ult, o.saida) || 1; dirS = { x: (o.saida.x - ult.x) / dd, z: (o.saida.z - ult.z) / dd }; }
    else if (o.rua) dirS = o.rua.eixo === "z" ? { x: 0, z: o.rua.sinal } : { x: o.rua.sinal, z: 0 };
    if (dirS && !ult.jusante) {
      var Ls2 = 0.6, yU = out0[ult.id];   // hid:ok o toco de espera da saída predial (a mesma do HidRede)
      out.ops.push({ op: "trecho", id: "cadeia-" + ult.id + "-saida", sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: r4(ult.x), y: r4(yU), z: r4(ult.z) }, p2: { x: r4(ult.x + dirS.x * Ls2), y: r4(yU - i * Ls2), z: r4(ult.z + dirS.z * Ls2) }, continua: "p2" });
      out.pendencias.push({ chave: "caixas.ligacao_publica", motivo: "saída de " + (nomeDe(ult) || ult.id) + " para a rede pública/fossa: informe a posição e a cota do coletor público" });
    } else if (!dirS) out.pendencias.push({ chave: "caixas.saida", motivo: "sem o lado da rua (o.rua ou o.saida): a última caixa " + ult.id + " ficou sem a espera de saída" });
    return out;
  }

  /* LIGA as caixas por um MAPA explícito de ligações (F6 da Casa 487, 28/10/2026): lote sem faixa externa contínua — a rede é uma ÁRVORE
     (ramos que se juntam antes da saída) e o caminho de cada ligação é dado pelo projetista (pontos intermediários `via`), não pelo
     anel externo da edificação. A cadeia() acima só faz uma fila reta CI-n → CI-n+1.
       mapa = { ligacoes: [{ de: idCaixa, para: idCaixa, via?: [{x,z}] }], saida?: { caixa: idCaixa, x, z } }   (z/x da divisa: onde a espera termina)
     → { ops (trechos DN do esgoto + a peça de cada caixa re-emitida com a profundidade real), ligacoes[{de,para,comprimento,yEntrada,yFim}],
         saida, avisos, pendencias }
     Cotas: de MONTANTE para JUSANTE; a saída de cada caixa fica na entrada mais baixa que chega nela (os ramais dos ambientes já gravados no
     modelo contam); o tubo desce com a declividade mínima do DN (BimInst.declMinDn). Ordem topológica: a ligação só sai depois de todas
     que chegam na caixa de montante dela. Mesmo id de trecho = refazer (idempotente: a ferramenta apaga o lote antes). */
  function qDesce(v) { return Math.ceil(v * 10000 - 1e-9) / 10000; }   // hid:ok desnível em 4 casas, nunca abaixo do mínimo
  function ligarMapa(estado, mapa, o) {
    o = o || {}; mapa = mapa || {};
    var B = dep("BimInst", "./biminst.js"), HR = dep("HidRede", "./hidrede.js"), par = o.parametros || {}, pref = o.prefixo || "rede-pred";
    var out = { ops: [], ligacoes: [], saida: null, avisos: [], pendencias: [] };
    if (!B) { out.pendencias.push({ chave: "caixas.motores", motivo: "os motores do biminst não carregaram" }); return out; }
    var dn = num(B.MATERIAIS.pvc_esgoto.dn, 100), i = B.declMinDn("esgoto", dn) / 100, raio = dn / 2000;   // hid:ok % → fração; DN mm → raio m
    var porId = {}; listar(estado).forEach(function (c) { porId[c.id] = c; });
    var pecas = {}; arr(estado && estado.instalacoes && estado.instalacoes.pecas).forEach(function (k) { pecas[txt(k.id)] = k; });
    var trechos = segmentos(estado, "esgoto").filter(function (t) { return txt(t.id).indexOf(pref + "-") !== 0; });
    var ligs = arr(mapa.ligacoes).filter(function (l) { return l && l.de && l.para; });
    ligs.forEach(function (l) { [l.de, l.para].forEach(function (id) { if (!porId[id]) out.pendencias.push({ chave: "caixas.mapa.sem_caixa", motivo: "a caixa " + id + " do mapa não existe no modelo" }); }); });
    if (out.pendencias.length) return out;
    function yEM(c) { var yT = num(c.y, 0); try { var v = HR.yMaxEntrada(par, dn, yT, { tipoCaixa: pecas[c.id] && pecas[c.id].tipoCaixa, tampa: pecas[c.id] && pecas[c.id].tampa }); return isFinite(v) ? v : yT - 0.4; } catch (e) { return yT - 0.4; } }   // hid:ok reserva: 40 cm abaixo da tampa
    /* o que já chega na caixa (ramais dos ambientes): a ponta p2 do tubo de esgoto no centro dela */
    var ent = {}, saiRamal = {};
    Object.keys(porId).forEach(function (id) {
      var c = porId[id], ys = [];
      trechos.forEach(function (t) { if (d2(t.p2, c) <= CAPTURA) ys.push(num(t.p2.y, 0)); });
      ent[id] = ys;
    });
    var entradas = {}; Object.keys(porId).forEach(function (id) { entradas[id] = ent[id].slice(); });
    var saida = {}, feito = {}, pend = ligs.slice(), guarda = 0, cam = {};
    var quedas = mapa.quedas || {};   // { idCaixa: m } — degrau na caixa: a saída parte m abaixo da entrada mais baixa (cruzar o pluvial com folga vertical, sem deixar o fim do coletor mais fundo que o ramo mais fundo)
    function saidaDe(id) { var ys = entradas[id].concat([yEM(porId[id])]); return r4(Math.min.apply(null, ys) - num(quedas[id], 0)); }
    var recebe = {}; ligs.forEach(function (l) { recebe[l.para] = (recebe[l.para] || 0) + 1; });
    var chegou = {};
    while (pend.length && guarda++ < ligs.length + 2) {
      var prox = pend.filter(function (l) { return (chegou[l.de] || 0) >= (recebe[l.de] || 0); });
      if (!prox.length) { out.pendencias.push({ chave: "caixas.mapa.ciclo", motivo: "o mapa de ligações tem laço (uma caixa lança nela mesma): corrija o sentido das ligações" }); break; }
      prox.forEach(function (l) {
        var a = porId[l.de], b = porId[l.para], pts = [{ x: a.x, z: a.z }].concat(arr(l.via).map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; })).concat([{ x: b.x, z: b.z }]), L = 0;
        for (var q = 1; q < pts.length; q++) L += d2(pts[q - 1], pts[q]);
        /* R04b: o desnível arredonda PARA CIMA em 0,1 mm (r4 cortava 0,1 mm num trecho diagonal de 2,61 m e a declividade dava 0,999 %, reprovada) */
        var yA = saidaDe(l.de), yB = r4(yA - qDesce(i * L));
        entradas[l.para].push(yB); chegou[l.para] = (chegou[l.para] || 0) + 1;
        var y = yA, n = 0;
        for (var s = 1; s < pts.length; s++) {
          var Ls = d2(pts[s - 1], pts[s]), y2 = s === pts.length - 1 ? yB : r4(y - qDesce(i * Ls));
          if (Ls < 0.01) continue;   // hid:ok ponto repetido
          out.ops.push({ op: "trecho", id: pref + "-" + l.de + "-" + l.para + "-" + (++n), sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: r4(pts[s - 1].x), y: r4(y), z: r4(pts[s - 1].z) }, p2: { x: r4(pts[s].x), y: r4(y2), z: r4(pts[s].z) } });
          y = y2;
        }
        out.ligacoes.push({ de: nomeDe(pecas[l.de]) || l.de, para: nomeDe(pecas[l.para]) || l.para, comprimento: r4(L), yEntrada: r4(yA), yFim: yB, declividade_pct: r4(i * 100) });   // hid:ok fração → %
        pend.splice(pend.indexOf(l), 1);
      });
    }
    /* a SAÍDA: da caixa de jusante até a divisa (a espera "continua" para a ligação pública) */
    var sd = mapa.saida;
    if (sd && porId[sd.caixa]) {
      var u = porId[sd.caixa], yU = saidaDe(sd.caixa), Ls3 = d2(u, sd) || 0.6;   // hid:ok toco mínimo de espera da saída predial (o mesmo do HidRede)
      var yF = r4(yU - i * Ls3);
      out.ops.push({ op: "trecho", id: pref + "-" + sd.caixa + "-saida", sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: r4(u.x), y: r4(yU), z: r4(u.z) }, p2: { x: r4(sd.x), y: yF, z: r4(sd.z) }, continua: "p2" });
      entradas[sd.caixa].push(yU); out.saida = { caixa: nomeDe(pecas[sd.caixa]) || sd.caixa, p: { x: sd.x, z: sd.z }, y: yF, comprimento: r4(Ls3) };
      out.pendencias.push({ chave: "caixas.ligacao_publica", motivo: "saída de " + (nomeDe(pecas[sd.caixa]) || sd.caixa) + " para a rede pública/fossa: informe a posição e a cota do coletor público (cota do eixo na divisa " + yF.toFixed(2).replace(".", ",") + " m)" });
    }
    /* as caixas: a profundidade real (tampa até o tubo mais baixo + raio + fundo), nunca mais rasa que a padrão da peça */
    Object.keys(porId).forEach(function (id) {
      var p = pecas[id]; if (!p || !(chegou[id] || recebe[id] || (sd && sd.caixa === id) || ligs.some(function (l) { return l.de === id; }))) return;
      var ys = entradas[id].concat(ligs.some(function (l) { return l.de === id; }) || (sd && sd.caixa === id) ? [saidaDe(id)] : []);
      if (!ys.length) return;
      var prof = Math.max(r4(num(p.y, 0) - Math.min.apply(null, ys) + raio + num(mapa.fundoCaixa, 0.10)), num(B.PECAS.caixa_inspecao.prof, 0.6));   // hid:ok fundo da caixa abaixo do tubo mais baixo (padrão 10 cm; mapa.fundoCaixa troca)
      var op = { op: "peca", id: txt(p.id), peca: p.peca, sistema: p.sistema, x: p.x, y: p.y, z: p.z, prof: r4(prof) };
      ["tipoCaixa", "tampa", "nome", "comentarios"].forEach(function (k) { if (p[k] != null && p[k] !== "") op[k] = p[k]; });
      out.ops.unshift(op);
    });
    return out;
  }

  var HidCaixas = { VERSAO: 1, listar: listar, ordenar: ordenar, nomear: nomear, renomear: renomear, cadeia: cadeia, ligarMapa: ligarMapa, nomeDe: nomeDe, FAMILIAS: FAMILIAS };
  global.HidCaixas = HidCaixas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCaixas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
