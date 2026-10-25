/* =====================================================================
 * bimcenaarm.js — ONDE A CENA DO ORÇAPRO CENA MORA (24/10/2026)
 *
 * "Salvar a cena NO PROJETO": a cena (hora, estação, materiais editados, câmeras, objetos postos, efeitos) é
 * registro da OBRA, na entidade `bim_cenas` do Store — acompanha a obra de um computador para o outro (entra na
 * nuvem, no backup e na cascata de exclusão da obra), e não fica presa às preferências deste navegador como o
 * render físico (BimRender.cfg, localStorage por obra).
 *
 * O REGISTRO: { id, obraId, nome, v, padrao, criadoEm, atualizadoEm, autor, json, miniatura }
 *   json      a cena como TEXTO. ⚠ Nunca como objeto: a cena tem lista dentro de lista (posição, quaternion…) e o
 *             Firestore recusa array dentro de array — derruba a entidade INTEIRA (memória orcapro-nuvem-lista-em-lista).
 *             Texto também deixa a cena passar pelo Store sem normalizador nenhum.
 *   padrao    UM por obra: a "última cena", gravada sozinha enquanto a pessoa trabalha (autossalvar). As cenas
 *             com nome (as que ela salvou de propósito) têm padrao:false e são o que a lista mostra.
 *   miniatura JPEG pequeno (dataURL) da cena inteira; as das câmeras vão dentro do json.
 *
 * ⚠ TETO DE 400 KB POR REGISTRO. A gravação em partes da nuvem põe cada REGISTRO inteiro numa parte de ~1 MiB
 * (js/nuvem.js, TETO_PARTE): registro maior recusa a entidade inteira e a lista para de subir com o app dizendo
 * "Sincronizado". A cena típica pesa 5–60 KB; o que a faz crescer são as miniaturas das câmeras (~6 KB × até 24).
 * Passou do teto: tira as miniaturas e AVISA (`semMiniaturas`); se ainda passar, recusa com o motivo — nunca
 * grava um registro que trava a sincronização.
 *
 * ⚠ LER NUNCA LANÇA. Json corrompido ou de versão futura (a cena foi salva por um OrçaPRO mais novo) volta como
 * `{erro}` e a tela decide; o registro continua intacto na lista (nada se apaga por não entender).
 *
 * Idempotente: salvar duas vezes a mesma coisa deixa um registro só e não mexe em `atualizadoEm` (o merge da
 * nuvem é "mais novo vence": carimbo à toa faria um aparelho atropelar o outro).
 *
 * ⚠ REVISÃO ADVERSARIAL (24/10/2026, tools/test-bimcena-nuvem-rev.js — cada item reprova sem a correção):
 *  (R1) A "ÚLTIMA CENA" QUE ESTE APARELHO NÃO ENTENDE NÃO É SOBRESCRITA NEM APAGADA. Antes, a cena de versão futura
 *       (salva por um OrçaPRO mais novo noutro computador) ou corrompida abria com o recado "ela não foi alterada" — e o
 *       `fechar` da tela gravava a cena VAZIA por cima dela, com o mesmo id (e a limpeza do padrão duplicado apagava a
 *       que sobrasse). Agora o padrão grava só sobre o mais novo LEGÍVEL; o ilegível fica como está.
 *  (R2) TETO DA LISTA INTEIRA (TETO_TOTAL). A nuvem fatia a lista em partes, mas a lista inteira tem teto (js/nuvem.js
 *       TETO_LOTE, 9 MiB): passou dele, a entidade INTEIRA para de subir — todas as cenas de todas as obras, com a tela
 *       dizendo "Sincronizado". Cena com nome não se apaga sozinha, então a lista só cresce. Agora o que faria a lista
 *       passar de TETO_TOTAL é recusado com o motivo (apague cenas antigas); o que não cresce passa sempre.
 *  (R3) FECHAR SEM MUDANÇA NÃO ATROPELA O OUTRO APARELHO (`salvarVistaPadrao`). A tela aberta aqui a manhã inteira, sem
 *       mexer, gravava no fechar a cena que leu ao abrir — por cima de uma hora de trabalho feita noutro computador e já
 *       sincronizada. Sem mudança, o fechar só leva a posição da câmera para a última cena que ESTÁ no projeto.
 *  (R4) AUTOSSALVAR COM RITMO (`esperaAutosalvar`). Cada gravação da cena sobe a lista bim_cenas INTEIRA (todas as
 *       cenas da empresa, em partes) — com 1,5 s de espera, arrastar e soltar objetos regravava megabytes a cada poucos
 *       segundos. Agora no máximo uma gravação a cada INTERVALO_AUTO; fechar, esconder a aba ou sair da página gravam
 *       na hora o que estiver pendente.
 * ES5, sem DOM. Store e Auth entram por `global`, como no resto do app.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENT = "bim_cenas";
  var VERSAO = 1;                       // versão do JSON da cena que ESTE arquivo entende
  var TETO_JSON = 400 * 1024;           // caracteres do json (ver o cabeçalho)
  var TETO_MINIATURA = 60 * 1024;       // miniatura da cena (dataURL); acima disso fica sem
  var NOME_PADRAO = "Última cena";
  /* (R2) a lista inteira, em caracteres do JSON de cada registro: 6 MiB deixa folga para os 9 MiB do TETO_LOTE da nuvem
     (que conta bytes — acento é 2) e para os outros campos */
  var TETO_TOTAL = 6 * 1024 * 1024;
  /* (R4) ritmo do autossalvar: espera a pessoa parar (DEBOUNCE) e nunca grava duas vezes em menos de INTERVALO */
  var DEBOUNCE_AUTO = 1500, INTERVALO_AUTO = 20000;

  function Store() { return global.Store || null; }
  function eid() { try { return (global.Auth && global.Auth.empresaId) ? global.Auth.empresaId() : ""; } catch (e) { return ""; } }
  function autor() {
    try { var u = (global.Auth && global.Auth.usuario && global.Auth.usuario()) || {}; return String(u.nome || u.email || ""); } catch (e) { return ""; }
  }
  function txt(v) { return v == null ? "" : String(v); }
  function log(m) { try { if (global.console && global.console.info) global.console.info("[cena] " + m); } catch (e) { /* sem console */ } }
  function aviso(m) { try { if (global.console && global.console.warn) global.console.warn("[cena] " + m); } catch (e) { /* sem console */ } }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function doObra(obraId) { return function (r) { return r && txt(r.obraId) === txt(obraId); }; }
  function todas() {
    var S = Store(); if (!S) return [];
    try { return S.listar(eid(), ENT) || []; } catch (e) { return []; }
  }
  /* o registro sem o texto da cena: a lista não precisa dele (e o `json` é o que pesa) */
  function resumo(r) {
    var o = {}; Object.keys(r).forEach(function (k) { if (k !== "json") o[k] = r[k]; });
    o.bytes = txt(r.json).length;
    return o;
  }
  function maisNovoPrimeiro(a, b) { return txt(b.atualizadoEm).localeCompare(txt(a.atualizadoEm)); }

  /* V1 → atual. Hoje só normaliza `v`; quando o formato mudar, a conversão mora aqui (uma função por salto).
     Devolve a cena migrada (cópia) ou null se não for cena / for de versão que este arquivo não entende. */
  function migrar(estado) {
    if (!estado || typeof estado !== "object" || Array.isArray(estado)) return null;
    var v = +estado.v;
    if (!isFinite(v) || v < 1) v = 1;                 // cena sem versão = a primeira
    if (v > VERSAO) return null;                       // de um OrçaPRO mais novo: não adivinhar
    var o = clonar(estado);
    o.v = VERSAO;
    return o;
  }

  function tirarMiniaturas(e) {
    var n = 0;
    (e.cameras || []).forEach(function (c) { if (c && c.miniatura) { delete c.miniatura; n++; } });
    return n;
  }

  /* ---------------------------------------------------------------- */
  function listar(obraId, opcoes) {
    var incluirPadrao = !!(opcoes && opcoes.padrao);
    return todas().filter(doObra(obraId)).filter(function (r) { return incluirPadrao || !r.padrao; })
      .sort(maisNovoPrimeiro).map(resumo);
  }

  function ler(id) {
    var S = Store();
    var r = null;
    try { r = S ? S.obter(eid(), ENT, id) : null; } catch (e) { r = null; }
    if (!r) return { registro: null, estado: null, erro: "Cena não encontrada (foi excluída em outro aparelho?)." };
    return abrir(r);
  }
  function abrir(r) {
    var bruto;
    try { bruto = JSON.parse(txt(r.json)); }
    catch (e) {
      aviso("cena " + r.id + ": json ilegível (" + (e && e.message) + ")");
      return { registro: r, estado: null, erro: "A cena \"" + txt(r.nome) + "\" está corrompida e não pôde ser aberta. Ela continua guardada; as outras cenas não foram afetadas." };
    }
    var m = migrar(bruto);
    if (!m) {
      var futura = bruto && +bruto.v > VERSAO;
      aviso("cena " + r.id + ": " + (futura ? "versão " + bruto.v + " > " + VERSAO : "formato desconhecido"));
      return { registro: r, estado: null, erro: futura
        ? "A cena \"" + txt(r.nome) + "\" foi salva por uma versão mais nova do OrçaPRO. Atualize o OrçaPRO para abri-la — ela não foi alterada."
        : "A cena \"" + txt(r.nome) + "\" não tem o formato esperado e não pôde ser aberta." };
    }
    return { registro: r, estado: m };
  }

  /* monta o json respeitando o teto; devolve { json } ou { erro } (+ semMiniaturas) */
  function empacotar(estado) {
    var e;
    try { e = clonar(estado); } catch (x) { return { erro: "A cena tem dados que não podem ser guardados (" + (x && x.message) + ")." }; }
    if (!e || typeof e !== "object" || Array.isArray(e)) return { erro: "Cena vazia: nada para salvar." };
    e.v = VERSAO;
    var json = JSON.stringify(e), semMin = false;
    if (json.length > TETO_JSON) {
      if (tirarMiniaturas(e)) { semMin = true; json = JSON.stringify(e); }
    }
    if (json.length > TETO_JSON) {
      return { erro: "A cena ficou grande demais para guardar no projeto (" + Math.round(json.length / 1024) + " KB; o limite é " + Math.round(TETO_JSON / 1024) + " KB). Remova objetos ou câmeras e salve de novo." };
    }
    return { json: json, semMiniaturas: semMin };
  }

  function gravar(reg) {
    var S = Store();
    if (!S) return null;
    try { return S.salvar(eid(), ENT, reg); } catch (e) { return null; }
  }
  var MOTIVO_CHEIO = "Não consegui guardar a cena: o armazenamento deste computador está cheio. Libere espaço (apague cenas antigas ou fotos) e tente de novo — a cena na tela continua aberta.";

  function nomeNovo(obraId) {
    var nomes = {}; todas().filter(doObra(obraId)).forEach(function (r) { nomes[txt(r.nome)] = 1; });
    var n = todas().filter(doObra(obraId)).filter(function (r) { return !r.padrao; }).length + 1;
    while (nomes["Cena " + n]) n++;
    return "Cena " + n;
  }

  function tamanhoReg(r) { try { return JSON.stringify(r).length; } catch (e) { return 0; } }
  /* o que a lista inteira ocupa sem o registro `semId` (o que vai ser substituído) */
  function totalSem(semId) { return todas().reduce(function (a, r) { return a + (r && r.id === semId ? 0 : tamanhoReg(r)); }, 0); }
  function legivel(r) { return !abrir(r).erro; }
  /* (R4) quanto esperar antes de autossalvar: `agora` e `ultimo` em ms (ultimo = 0: nunca gravou nesta abertura) */
  function esperaAutosalvar(agora, ultimo) {
    var a = +agora || 0, u = +ultimo || 0;
    return Math.max(DEBOUNCE_AUTO, u ? u + INTERVALO_AUTO - a : 0);
  }

  function miniaturaOk(m) { m = txt(m); return m && m.length <= TETO_MINIATURA && /^data:image\//.test(m) ? m : ""; }

  /* entrada: { id?, nome?, estado, miniatura? } → { ok, id, registro, semMiniaturas?, igual? } | { ok:false, motivo } */
  function salvar(obraId, d) {
    d = d || {};
    if (!txt(obraId)) return { ok: false, motivo: "Abra uma obra antes de salvar a cena: ela fica guardada no projeto da obra." };
    if (!Store()) return { ok: false, motivo: "O armazenamento do OrçaPRO não está disponível." };
    var emp = empacotar(d.estado);
    if (emp.erro) return { ok: false, motivo: emp.erro };
    var existente = null;
    if (d.id) {
      existente = todas().filter(function (r) { return r.id === d.id && doObra(obraId)(r); })[0] || null;
    }
    var nome = txt(d.nome).trim() || (existente ? txt(existente.nome) : "") || nomeNovo(obraId);
    var mini = d.miniatura === undefined && existente ? txt(existente.miniatura) : miniaturaOk(d.miniatura);
    if (existente && existente.json === emp.json && txt(existente.nome) === nome && txt(existente.miniatura) === mini && (d.padrao != null ? !!d.padrao : !!existente.padrao) === !!existente.padrao) {
      return { ok: true, id: existente.id, registro: resumo(existente), igual: true, semMiniaturas: emp.semMiniaturas };
    }
    /* ⚠ id que já é de OUTRA obra não se reaproveita: o Store tem um registro por id e a cena da outra obra seria
       sobrescrita em silêncio (a tela que reabre uma cena e salva em outra obra mandaria o id velho) */
    var idLivre = d.id && !todas().some(function (r) { return r.id === d.id; });
    var reg = existente ? clonar(existente) : { id: idLivre ? d.id : undefined, obraId: txt(obraId), criadoEm: "", autor: autor(), padrao: false };
    if (!reg.id) delete reg.id;
    reg.nome = nome; reg.v = VERSAO; reg.json = emp.json; reg.miniatura = mini;
    if (d.padrao != null) reg.padrao = !!d.padrao;
    reg.obraId = txt(obraId);
    /* (R2) a lista inteira não passa do teto da nuvem — o que não cresce passa sempre (nunca trava a edição do que já existe) */
    var novoTam = tamanhoReg(reg) + 64, velhoTam = existente ? tamanhoReg(existente) : 0;
    if (novoTam > velhoTam) {
      var total = totalSem(existente && existente.id) + novoTam;
      if (total > TETO_TOTAL) {
        aviso("lista bim_cenas: " + Math.round(total / 1024) + " KB > teto " + Math.round(TETO_TOTAL / 1024) + " KB — recusado");
        return { ok: false, cheio: true, motivo: "As cenas salvas no projeto já ocupam " + String(Math.round(total / 104857.6) / 10).replace(".", ",") + " MB (o limite é " + Math.round(TETO_TOTAL / 1048576) + " MB, para todas as cenas da empresa continuarem sincronizando entre os computadores). Exclua cenas antigas (aba Cena, Cenas salvas) e salve de novo — a cena na tela continua aberta." };
      }
    }
    var r = gravar(reg);
    if (!r) return { ok: false, motivo: MOTIVO_CHEIO };
    log((existente ? "atualizada" : "criada") + ": " + r.id + " (" + nome + ", " + Math.round(emp.json.length / 1024) + " KB)");
    return { ok: true, id: r.id, registro: resumo(r), semMiniaturas: emp.semMiniaturas, criada: !existente };
  }

  /* a "última cena" da obra: UM registro padrao:true. Duas máquinas que gravaram a sua enquanto estavam offline
     deixam dois depois do sync: fica o mais novo, o outro sai (não é cena que a pessoa nomeou). */
  function padroes(obraId) { return todas().filter(doObra(obraId)).filter(function (r) { return r.padrao; }).sort(maisNovoPrimeiro); }
  /* (R1) só os que ESTE aparelho abre: o de versão futura ou corrompido não é alvo da gravação nem da limpeza */
  function padroesLegiveis(obraId) { return padroes(obraId).filter(legivel); }
  function salvarPadrao(obraId, estado) {
    var ps = padroesLegiveis(obraId), S = Store();
    var r = salvar(obraId, { id: ps[0] && ps[0].id, nome: NOME_PADRAO, estado: estado, padrao: true });
    if (r.ok && S) ps.forEach(function (x) { if (x.id !== r.id) { try { S.excluir(eid(), ENT, x.id); } catch (e) { /* o excesso fica para a próxima */ } } });
    return r;
  }
  /* (R3) o fechar SEM mudança: só a posição da câmera, sobre a última cena que está no projeto AGORA (a que outro
     aparelho pode ter gravado depois que esta tela abriu). Sem última cena legível, nada a fazer. */
  function salvarVistaPadrao(obraId, vista) {
    var ps = padroesLegiveis(obraId);
    if (!ps.length) return { ok: true, nada: true };
    var o = abrir(ps[0]);
    if (!o.estado) return { ok: true, nada: true };
    if (vista) o.estado.vista = vista;
    return salvar(obraId, { id: ps[0].id, nome: txt(ps[0].nome) || NOME_PADRAO, estado: o.estado, padrao: true });
  }
  function lerPadrao(obraId) {
    var ps = padroes(obraId);
    if (!ps.length) return null;
    var leg = ps.filter(legivel);
    /* a mais nova que este aparelho abre; se a mais nova de todas é ilegível, o recado dela vai junto */
    if (!leg.length) return abrir(ps[0]);
    var o = abrir(leg[0]);
    if (leg[0] !== ps[0]) o.aviso = abrir(ps[0]).erro;
    return o;
  }

  function excluir(id) {
    var S = Store(); if (!S) return false;
    var existe = todas().some(function (r) { return r.id === id; });
    if (!existe) return false;
    var ok = false;
    try { ok = S.excluir(eid(), ENT, id) !== false; } catch (e) { ok = false; }
    if (ok) log("excluída: " + id);
    return ok;
  }

  function duplicar(id) {
    var o = ler(id);
    if (!o.registro) return { ok: false, motivo: o.erro };
    if (!o.estado) return { ok: false, motivo: o.erro };
    var nomes = {}; todas().filter(doObra(o.registro.obraId)).forEach(function (r) { nomes[txt(r.nome)] = 1; });
    var base = txt(o.registro.nome).replace(/ \(cópia( \d+)?\)$/, ""), nome = base + " (cópia)", k = 2;
    while (nomes[nome]) nome = base + " (cópia " + (k++) + ")";
    return salvar(o.registro.obraId, { nome: nome, estado: o.estado, miniatura: o.registro.miniatura || "" });
  }

  var BimCenaArm = {
    ENT: ENT, VERSAO: VERSAO, TETO_JSON: TETO_JSON, TETO_MINIATURA: TETO_MINIATURA, NOME_PADRAO: NOME_PADRAO,
    TETO_TOTAL: TETO_TOTAL, DEBOUNCE_AUTO: DEBOUNCE_AUTO, INTERVALO_AUTO: INTERVALO_AUTO,
    listar: listar, ler: ler, salvar: salvar, salvarPadrao: salvarPadrao, lerPadrao: lerPadrao,
    salvarVistaPadrao: salvarVistaPadrao, esperaAutosalvar: esperaAutosalvar,
    excluir: excluir, duplicar: duplicar, migrar: migrar
  };
  global.BimCenaArm = BimCenaArm;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCenaArm;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
