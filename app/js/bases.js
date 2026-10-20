/* =====================================================================
 * bases.js — Camada MULTI-BASE de preços (aditiva)
 * A SINAPI continua no motor `Sinapi` (não duplica índice). Bases extras
 * (SICRO, SEINFRA, SETOP, ORSE, SBC, Própria) ficam aqui. Busca unificada
 * em todas as bases ativas, com badge de origem. Lógica pura/testável.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EXTRA = []; // bases extras: {fonte,label,cor,competencia,uf,itens,porCodigo,tokens,ativa}

  function norm(s) {
    if (typeof Util !== "undefined" && Util.normalizar) return Util.normalizar(s);
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }

  var Bases = {
    sinapiAtiva: true,
    META: {
      SINAPI: { label: "SINAPI", cor: "sinapi" },
      SINAPI_DES: { label: "SINAPI desonerada", cor: "sinapi" },
      SICRO: { label: "SICRO (DNIT)", cor: "sicro" },
      SEINFRA: { label: "SEINFRA-CE", cor: "seinfra" },
      SETOP: { label: "SETOP-MG", cor: "setop" },
      ORSE: { label: "ORSE-SE", cor: "orse" },
      SUDECAP: { label: "SUDECAP-BH", cor: "sudecap" },
      SBC: { label: "SBC", cor: "sbc" },
      EMOP: { label: "EMOP-RJ", cor: "emop" },
      CPOS: { label: "CPOS-SP", cor: "cpos" },
      FDE: { label: "FDE-SP", cor: "fde" },
      AGETOP: { label: "AGETOP-GO", cor: "agetop" },
      SEDOP: { label: "SEDOP-PA", cor: "sedop" },
      CEHOP: { label: "CEHOP-SE", cor: "cehop" },
      /* ⚠ A CHAVE CONTINUA "IOPES"; SÓ O NOME MUDOU (20/10/2026).
         O IOPES foi extinto pela LC estadual 926/2019 e absorvido pelo DER-ES
         (Departamento de Edificações e de Rodovias), que é quem publica a
         Tabela Referencial de Edificações. Documento que cita instituto
         extinto em licitação é questionado. Mas "IOPES" está gravado em cada
         item de orçamento salvo (baseFonte/origem), nos nomes dos arquivos do
         servidor e nos robôs: trocar a chave pediria migrar a frota. Daí:
         `label` (documentos, analítico) e `curto` (coluna Fonte, etiqueta da
         planilha) mudam; a chave não. */
      IOPES: { label: "DER-ES Edificações", curto: "DER-ES", cor: "iopes" },
      DEINFRA: { label: "DEINFRA-SC", cor: "deinfra" },
      DER: { label: "DER (rodovias)", cor: "der" },
      CDHU: { label: "CDHU-SP", cor: "cdhu" },
      PROPRIA: { label: "Própria", cor: "proprio" }
    },

    /* nome curto da fonte para coluna/etiqueta de item ("DER-ES" para a
       chave IOPES); sem `curto`, a própria chave — como sempre foi */
    rotuloCurto: function (fonte) {
      var f = String(fonte == null ? "" : fonte);
      var m = this.META[f.toUpperCase()];
      return (m && m.curto) || f;
    },

    _indexar: function (b) {
      b.porCodigo = {}; b.tokens = new Array(b.itens.length);
      for (var i = 0; i < b.itens.length; i++) {
        var it = b.itens[i];
        if (it && it.codigo != null) { b.porCodigo[String(it.codigo)] = it; b.tokens[i] = norm(it.codigo + " " + (it.descricao || "")); }
        else b.tokens[i] = "";
      }
      return b;
    },

    /* ==================================================================
     * ⚠ DOIS MOTIVOS DIFERENTES PARA UMA BASE ESTAR DESLIGADA — e misturar
     * os dois num campo só apagava base de cliente.
     *
     * `ativaUsuario`  é ESCOLHA: o cliente desmarcou o checkbox em 🗂 Tabelas
     *                 (app.js:961). Isso é decisão dele e TEM de sobreviver
     *                 ao reload — hoje não sobrevive, some no boot seguinte.
     * `inativaPorUf`  é CIRCUNSTÂNCIA: a base é de outra UF que não a que
     *                 está carregada, então `carregar()` a silencia para não
     *                 precificar obra de MG com tabela do Acre. Isso vale só
     *                 para ESTA sessão e NUNCA pode ser gravado.
     *
     * Enquanto era um campo só, bastava QUALQUER `persistir()` acontecer
     * depois de um boot em UF diferente para a desativação circunstancial
     * virar `ativa:false` no disco — permanente, silenciosa, sem volta. Quem
     * abrisse o app uma vez no Acre perdia a SETOP-MG para sempre.
     *
     * Usável = escolheu manter E a circunstância permite.
     * ================================================================== */
    usavel: function (b) { return !!b && b.ativaUsuario !== false && !b.inativaPorUf; },

    /* Registra/atualiza uma base extra a partir de um pacote { dados, mes, uf }.
     * opts: { sel, catId, ativaUsuario } — `sel` é a variante escolhida
     * (região do SETOP, regime/preço da GOINFRA) e `catId` liga a base ao
     * catálogo (BasesCat). Guardados aqui porque sem eles a tela não sabe
     * dizer QUAL variante está instalada — e reinstalar por engano troca o
     * preço de quem já orçou. */
    registrar: function (fonte, pacote, opts) {
      fonte = String(fonte || "PROPRIA").toUpperCase();
      opts = opts || {};
      var dados = (pacote && pacote.dados) ? pacote.dados : (Array.isArray(pacote) ? pacote : []);
      var meta = this.META[fonte] || { label: fonte, cor: "proprio" };
      /* reinstalar NÃO religa o que o usuário desligou de propósito */
      var antiga = EXTRA.filter(function (x) { return x.fonte === fonte; })[0];
      var ativaU = (opts.ativaUsuario !== undefined) ? !!opts.ativaUsuario
        : (antiga ? antiga.ativaUsuario !== false : true);
      var b = this._indexar({
        fonte: fonte, label: meta.label, cor: meta.cor,
        competencia: (pacote && pacote.mes) || null, uf: (pacote && pacote.uf) || null,
        /* o regime que o PRÓPRIO arquivo declara (true/false), ou null quando
           não declara — o painel das bases exigidas pelo edital confere o
           regime, e "não sei" não pode virar "confere" */
        desonerado: (pacote && (pacote.desonerado === true || pacote.desonerado === false)) ? pacote.desonerado : null,
        itens: dados,
        ativaUsuario: ativaU,
        inativaPorUf: false,           // runtime; quem decide é carregar()
        sel: opts.sel || (antiga ? antiga.sel : null) || null,
        catId: opts.catId || (antiga ? antiga.catId : null) || null
      });
      EXTRA = EXTRA.filter(function (x) { return x.fonte !== fonte; });
      EXTRA.push(b);
      /* base (re)instalada = mês novo possível: o detalhamento carregado
         (js/analiticobases.js) é descartado e volta a ser escolhido pelo mês */
      try { if (typeof AnaliticoBases !== "undefined" && AnaliticoBases._limparCache) AnaliticoBases._limparCache(); } catch (eAB) {}
      return dados.length;
    },

    extras: function () { return EXTRA; },
    remover: function (fonte) { fonte = String(fonte).toUpperCase(); EXTRA = EXTRA.filter(function (x) { return x.fonte !== fonte; }); },
    /* escolha do usuário — é ela que vai para o disco */
    setAtiva: function (fonte, val) {
      fonte = String(fonte).toUpperCase();
      if (fonte === "SINAPI") { this.sinapiAtiva = !!val; return; }
      var b = EXTRA.filter(function (x) { return x.fonte === fonte; })[0]; if (b) b.ativaUsuario = !!val;
    },
    /* circunstância da sessão — NUNCA é persistida (ver o bloco acima) */
    setInativaPorUf: function (fonte, val) {
      fonte = String(fonte).toUpperCase();
      var b = EXTRA.filter(function (x) { return x.fonte === fonte; })[0]; if (b) b.inativaPorUf = !!val;
    },

    /* Lista de TODAS as bases (inclui SINAPI) p/ a UI do gerenciador.
     * `ativa` continua existindo com o MESMO significado de sempre (dá para
     * usar agora?) — quem consome não precisa saber da separação. Quem
     * precisa (o checkbox, a persistência) lê ativaUsuario/inativaPorUf. */
    lista: function () {
      var self = this, out = [];
      if (typeof Sinapi !== "undefined" && Sinapi.carregado) {
        out.push({ fonte: "SINAPI", label: "SINAPI", cor: "sinapi", competencia: Sinapi.competencia, uf: Sinapi.uf, total: Sinapi.resumo().total, ativa: this.sinapiAtiva, ativaUsuario: this.sinapiAtiva, inativaPorUf: false, sel: null, catId: "SINAPI" });
      }
      EXTRA.forEach(function (b) {
        out.push({
          fonte: b.fonte, label: b.label, cor: b.cor, competencia: b.competencia, uf: b.uf, desonerado: b.desonerado,
          total: b.itens.length, ativa: self.usavel(b),
          ativaUsuario: b.ativaUsuario !== false, inativaPorUf: !!b.inativaPorUf,
          sel: b.sel || null, catId: b.catId || b.fonte
        });
      });
      return out;
    },

    /* Tipo do item: "composicao" | "insumo" (heurística sobre tipoItem/tipo/categoria). */
    tipoDe: function (it) {
      var t = String((it && (it.tipoItem || it.tipo || it.categoria)) || "").toLowerCase();
      return t.indexOf("insumo") !== -1 ? "insumo" : "composicao";
    },

    /* Busca unificada com FILTROS. opts: número (=max, retrocompat) OU
       { max, fonte:"SINAPI"|"SICRO"|…|null(todas), tipo:"composicao"|"insumo"|null, desonerado:true|false|null }.
       Retorna [{item,fonte,label,cor,tipo}]. */
    buscar: function (texto, opts) {
      if (typeof opts === "number") opts = { max: opts };
      opts = opts || {};
      var self = this, max = opts.max || 40;
      var fFonte = opts.fonte ? String(opts.fonte).toUpperCase() : null;
      // Filtros por orçamento (passo 3 do assistente):
      //   opts.fontes         — allowlist explícita (quem passar decide tudo)
      //   opts.excluirFontes  — DENYLIST: só o que o usuário desmarcou sai; tabela
      //                         instalada depois continua aparecendo sozinha.
      var permit = null;
      if (opts.fontes && opts.fontes.length) {
        permit = {};
        for (var pi = 0; pi < opts.fontes.length; pi++) { permit[String(opts.fontes[pi]).toUpperCase()] = 1; }
      }
      var negar = null;
      if (opts.excluirFontes && opts.excluirFontes.length) {
        negar = {};
        for (var ni = 0; ni < opts.excluirFontes.length; ni++) { negar[String(opts.excluirFontes[ni]).toUpperCase()] = 1; }
      }
      var fTipo = (opts.tipo === "composicao" || opts.tipo === "insumo") ? opts.tipo : null;
      var fDeson = (opts.desonerado === true || opts.desonerado === false) ? opts.desonerado : null;
      var alvo = norm(texto), termos = alvo.split(" ").filter(Boolean), out = [];
      if (!termos.length) return out;
      function passa(it) {
        if (fTipo && self.tipoDe(it) !== fTipo) return false;
        // desoneração: só exclui itens EXPLICITAMENTE do regime oposto (não penaliza base sem flag)
        if (fDeson !== null && (it.desonerado === true || it.desonerado === false) && it.desonerado !== fDeson) return false;
        return true;
      }
      if ((!fFonte || fFonte === "SINAPI") && (!permit || permit.SINAPI) && !(negar && negar.SINAPI) && this.sinapiAtiva && typeof Sinapi !== "undefined" && Sinapi.carregado) {
        Sinapi.buscar(texto, { max: max * 2, tipo: fTipo }).forEach(function (it) { if (passa(it)) out.push({ item: it, fonte: "SINAPI", label: "SINAPI", cor: "sinapi", tipo: self.tipoDe(it) }); });
      }
      EXTRA.forEach(function (b) {
        if (!self.usavel(b)) return;
        if (permit && !permit[String(b.fonte).toUpperCase()]) return;
        if (negar && negar[String(b.fonte).toUpperCase()]) return;
        if (fFonte && b.fonte !== fFonte) return;
        for (var i = 0; i < b.itens.length && out.length < max * 4; i++) {
          var it = b.itens[i], hay = b.tokens[i], ok = true;
          for (var t = 0; t < termos.length; t++) { if (hay.indexOf(termos[t]) === -1) { ok = false; break; } }
          if (ok && passa(it)) out.push({ item: it, fonte: b.fonte, label: b.label, cor: b.cor, tipo: self.tipoDe(it) });
        }
      });
      var q = String(texto).trim();
      out.sort(function (a, b) {
        var ea = (String(a.item.codigo) === q) ? 0 : 1, eb = (String(b.item.codigo) === q) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return (a.item.descricao || "").length - (b.item.descricao || "").length;
      });
      return out.slice(0, max);
    },

    /* Obtém item por (fonte, código). Sem fonte → tenta SINAPI e depois extras. */
    obter: function (fonte, codigo) {
      if (codigo === undefined) { codigo = fonte; fonte = null; }
      fonte = fonte ? String(fonte).toUpperCase() : null;
      if ((!fonte || fonte === "SINAPI") && typeof Sinapi !== "undefined") { var s = Sinapi.obter(codigo); if (s) return s; }
      if (fonte && fonte !== "SINAPI") { var b = EXTRA.filter(function (x) { return x.fonte === fonte; })[0]; return b ? (b.porCodigo[String(codigo)] || null) : null; }
      for (var i = 0; i < EXTRA.length; i++) { var it = EXTRA[i].porCodigo[String(codigo)]; if (it) return it; }
      return null;
    },

    /* Como obter(codigo), mas devolve { item, fonte } com a base REAL que resolveu o código
       (itens crus das bases extras não carregam baseFonte — rotular SINAPI no chute violaria a fonte honesta). */
    obterComFonte: function (codigo) {
      if (typeof Sinapi !== "undefined" && Sinapi.carregado) { var s = Sinapi.obter(codigo); if (s) return { item: s, fonte: "SINAPI" }; }
      for (var i = 0; i < EXTRA.length; i++) { var it = EXTRA[i].porCodigo[String(codigo)]; if (it) return { item: it, fonte: EXTRA[i].fonte }; }
      return null;
    },

    /* ==================================================================
     * _pegar — o ÚNICO buscador de base com prazo. Absorve as três cópias
     * de live-first dos EXTRAS (data-inclusa, carregarSetop, carregarGoinfra).
     *
     * ⚠ NÃO ABSORVE o `trocarBaseSinapi` nem o `Analitico._fetchJson`, e isso
     * é decisão, não esquecimento: aqueles dois são LOCAL-first de propósito,
     * têm .gz com DecompressionStream e estão no BOOT. Se algo der errado
     * neles o sintoma não é "a tabela ficou feia", é "o app não abre".
     *
     * ⚠ PRAZO EM DUAS ETAPAS, e não um número só. O ORSE tem 4 MB. Um prazo
     * único de 6 s mata o live-first exatamente onde ele é anunciado — numa
     * 4G de obra, 4 MB não chegam em 6 s e o cliente cairia sempre no arquivo
     * do pacote, tendo gasto a banda assim mesmo. Então: prazo CURTO até o
     * servidor responder (é isso que diz se ele está vivo) e prazo LARGO,
     * proporcional ao tamanho, para o corpo descer.
     * ================================================================== */
    PRAZO_CABECA: 6000,
    PRAZO_MB: 20000,          // por MB declarado, depois que a resposta começou
    PRAZO_CORPO_MIN: 30000,
    _pegar: function (url, opts) {
      opts = opts || {};
      var cabeca = opts.prazoCabeca || this.PRAZO_CABECA;
      var corpo = opts.prazoCorpo || Math.max(this.PRAZO_CORPO_MIN, (Number(opts.pesoMb) || 1) * this.PRAZO_MB);
      var temAC = (typeof AbortController !== "undefined");
      var ctrl = temAC ? new AbortController() : null;
      return new Promise(function (res, rej) {
        var timer = null, acabou = false;
        function encerrar(fn, arg) {
          if (acabou) return;
          acabou = true;
          if (timer) { clearTimeout(timer); timer = null; }
          fn(arg);
        }
        /* ⚠ O PRAZO REJEITA POR CONTA PRÓPRIA, e não é preciosismo.
           A primeira versão disto só chamava ctrl.abort() e esperava o fetch
           rejeitar sozinho. Um fetch que não coopera com o abort — polyfill,
           WebView antiga, ou o AbortController simplesmente não existir —
           deixaria esta promise pendurada PARA SEMPRE, que é exatamente o
           defeito que a função existe para matar. O teste pegou: com um
           fetch de mentira que nunca settla, nada acontecia.
           Então: abort para PARAR o download (economiza banda de 4G), e
           reject para SOLTAR quem está esperando. As duas coisas. */
        function armar(ms, msg) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            if (ctrl) { try { ctrl.abort(); } catch (e) {} }
            encerrar(rej, new Error("tempo esgotado (" + msg + ")"));
          }, ms);
        }
        armar(cabeca, "servidor não respondeu em " + Math.round(cabeca / 1000) + "s");
        var p;
        try { p = fetch(url, ctrl ? { signal: ctrl.signal } : undefined); }
        catch (e) { return encerrar(rej, e); }
        p.then(function (r) {
          if (acabou) return null;               // o prazo já venceu: não mexe mais
          if (!r.ok) throw new Error("HTTP " + r.status);
          armar(corpo, "download passou de " + Math.round(corpo / 1000) + "s");
          return r.json();
        }).then(function (j) { if (!acabou) encerrar(res, j); })
          .catch(function (e) { encerrar(rej, e); });
      });
    },

    /* Carrega uma base inclusa no app (JSON em data/), same-origin.
     * opts: { sel, catId } — a variante escolhida e o vínculo com o catálogo. */
    carregarInclusa: function (arquivo, fonte, regiao, opts) {
      var self = this;
      opts = opts || {};
      return this._pegar(arquivo, opts).then(function (pacote) {
        // base regionalizada (ex.: SETOP): usa o preço da região escolhida
        /* ⚠ AS PARCELAS MO/MAT/EQ ACOMPANHAM O PREÇO (16/10/2026, revisor). Elas
           estão no preço padrão do arquivo; trocar só o custoUnitario (região
           da SETOP, "Com BDI oficial" da GOINFRA) deixava MO+MAT+EQ ≠ preço, e o
           item "só mão de obra" cobrava a MO do custo direto num preço com BDI.
           Escala proporcional; o custo direto fica guardado para o analítico,
           que compara os insumos (sempre custo direto) com ele. */
        if (regiao && pacote.dados) pacote.dados.forEach(function (it) {
          if (!it.precos || it.precos[regiao] == null) return;
          var antes = Number(it.custoUnitario) || 0, novo = Number(it.precos[regiao]) || 0;
          if (regiao === "comBDI") it.custoDireto = antes;
          it.custoUnitario = it.precos[regiao];
          var soma = (Number(it.custoMO) || 0) + (Number(it.custoMAT) || 0) + (Number(it.custoEQ) || 0);
          if (antes > 0 && soma > 0 && novo !== antes) {
            var f = novo / antes;
            var mo = Math.round((Number(it.custoMO) || 0) * f * 100) / 100, eq = Math.round((Number(it.custoEQ) || 0) * f * 100) / 100;
            it.custoMO = mo; it.custoEQ = eq; it.custoMAT = Math.round((novo - mo - eq) * 100) / 100;
          }
        });
        var n = self.registrar(fonte || pacote.fonte || "PROPRIA", pacote, { sel: opts.sel, catId: opts.catId });
        var grav = { ok: true };
        if (typeof Store !== "undefined" && typeof Auth !== "undefined") grav = self.persistir(Auth.empresaId());
        return { total: n, fonte: (fonte || pacote.fonte || "PROPRIA"), competencia: pacote.mes, uf: pacote.uf, regiao: regiao || null, sel: opts.sel || null, persistido: grav.ok, gravErro: grav.erro };
      });
    },

    /* ==================================================================
     * instalar — UM caminho de instalação, dirigido pelo catálogo.
     *
     * Hoje existem QUATRO caminhos separados (data-inclusa, carregarSetop,
     * carregarGoinfra, importarBase), cada um com sua própria ideia de
     * live-first, de default de variante e de rota no servidor. Foi assim
     * que a GOINFRA acabou com dois defaults para o mesmo dado.
     *
     * Aqui a variante vem do catálogo (que já espelha os defaults de hoje),
     * o arquivo sai de BasesCat.resolver e a ordem é: servidor primeiro
     * (mais novo), arquivo do pacote depois (sempre existe, offline).
     * Devolve `live:true/false` para a tela dizer de onde veio.
     * ================================================================== */
    instalar: function (catId, sel, opts) {
      var self = this;
      opts = opts || {};
      if (typeof BasesCat === "undefined") return Promise.reject(new Error("catálogo indisponível"));
      var e = BasesCat.get(catId);
      if (!e) return Promise.reject(new Error("banco fora do catálogo: " + catId));
      /* ⚠ COMPETÊNCIA FIXADA vai pelo caminho que CONFERE o mês. O resolver
         abaixo monta o nome do arquivo com o mês ANUNCIADO pelo servidor; com
         `sel.competencia` passando por ele, a base subiria com o mês novo e o
         `sel` gravado diria o mês do edital — rótulo sem lastro. */
      if (sel && sel.competencia && BasesCat.temHistorico && BasesCat.temHistorico(e.id)) {
        return this.instalarCompetencia(e.id, { uf: sel.uf, competencia: sel.competencia }, opts);
      }
      /* ⚠ SEM CONTEXTO, O ÚLTIMO ANÚNCIO DO SERVIDOR. O arquivo da SINAPI
         desonerada tem a competência no nome (<COMP>), que sai do que o
         servidor anuncia. O botão de instalar não passa contexto nenhum — e
         sem isto ele montaria sempre o nome do mês embarcado (06/2026). */
      if (!opts.ctx) {
        try { if (typeof Atualizacao !== "undefined" && Atualizacao._ultimoStatus) opts.ctx = { servidor: Atualizacao._ultimoStatus }; } catch (eCtx) {}
      }
      var av = BasesCat.avaliar(e, opts.ctx || {});
      // ⚠ porta fechada por dentro: banco sem fonte não instala nem se alguém
      // chamar isto na mão pelo console
      if (!av.podeUsar) return Promise.reject(new Error(e.nome + " não tem fonte conectada — importe a planilha do órgão em Tabelas."));
      var r = BasesCat.resolver(catId, sel, opts.ctx);
      if (!r || (!r.arquivo && !r.vps)) return Promise.reject(new Error("não sei qual arquivo abrir para " + catId));
      var pesoMb = opts.pesoMb || 0;
      var base = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
      var live = (r.vps && base) ? (base + r.rotaVps + r.vps) : null;
      var chamar = function (url, ehLive) {
        return self.carregarInclusa(url, e.id, r.remap, { sel: sel || null, catId: e.id, pesoMb: pesoMb })
          .then(function (res) { res.live = ehLive; return res; });
      };
      /* ⚠ base que SÓ existe no servidor (a SINAPI desonerada: 79 MB nas 27 UFs,
         não cabe no pacote) não tem para onde cair. Sem internet ela não
         instala — e é melhor dizer isso do que fingir uma queda que não existe. */
      if (r.soServidor) {
        if (!live) return Promise.reject(new Error(e.nome + " só existe no servidor e não há endereço configurado."));
        return chamar(live, true).catch(function (err) {
          throw new Error(e.nome + " vem do servidor e não veio no aplicativo — precisa de internet para instalar (" + err.message + ").");
        });
      }
      return live
        ? chamar(live, true).catch(function () { return chamar(r.arquivo, false); })
        : chamar(r.arquivo, false);
    },

    /* ==================================================================
     * instalarCompetencia — UM MÊS ESPECÍFICO de uma base com histórico
     * (SINAPI desonerada, SICRO). Pedido = { uf, competencia: "AAAA-MM" }.
     *
     * Ordem: disco → servidor → espelho (BasesCat.fontesCompetencia), cada
     * arquivo CONFERIDO pelo conteúdo (UF, mês e regime — BasesCat.pacoteConfere)
     * antes de tocar na base instalada. Arquivo errado não para a busca: vira
     * uma "tentativa" com o motivo, e a próxima fonte é tentada.
     *
     * Não achou em nenhuma: rejeita com `naoEncontrada`, as `tentativas` (o que
     * cada fonte respondeu) e `achadas` (os meses que existem mas não são o
     * pedido — "o atual é 04/2026"). ⚠ NÃO cai em outro mês por conta própria:
     * em licitação isso é decisão de quem orça (garantirCompetencia +
     * permitirAtual, com o aviso e o registro na justificativa).
     *
     * opts.pegar(fonte) → Promise<pacote> substitui o download (testes).
     * ================================================================== */
    instalarCompetencia: function (catId, pedido, opts) {
      var self = this;
      opts = opts || {};
      pedido = pedido || {};
      var id = String(catId || "").toUpperCase();
      if (typeof BasesCat === "undefined" || !BasesCat.temHistorico || !BasesCat.temHistorico(id)) {
        return Promise.reject(new Error(id + " não tem tabela por competência — instale a atual em Tabelas."));
      }
      var cfg = {};
      try { cfg.servidor = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) || ""; cfg.espelho = (typeof CONFIG !== "undefined" && CONFIG.appWebUrl) || ""; } catch (eC) {}
      if (opts.cfg) cfg = opts.cfg;
      var uf = String(pedido.uf || "").trim().toUpperCase(), comp = BasesCat._iso(pedido.competencia);
      var fontes = BasesCat.fontesCompetencia(id, uf, comp, cfg);
      var e = BasesCat.get(id) || { nome: id };
      var rotulo = e.nome + " " + uf + " " + BasesCat.fmtVersao(comp);
      if (!fontes.length) return Promise.reject(new Error("Pedido inválido para " + e.nome + ": informe a UF e a competência (AAAA-MM)."));
      var regime = (BasesCat.HISTORICO[id] && BasesCat.HISTORICO[id].regime) || pedido.regime || "";
      var tentativas = [], achadas = [];
      var pegar = opts.pegar || function (f) { return self._pegarFonte(f, opts); };
      var tentar = function (k) {
        if (k >= fontes.length) {
          var err = new Error(rotulo + " não foi encontrada (" + tentativas.join("; ") + ").");
          err.naoEncontrada = true; err.tentativas = tentativas; err.achadas = achadas;
          return Promise.reject(err);
        }
        var f = fontes[k], nomeF = f.origem + (f.atual ? " (atual)" : "");
        return Promise.resolve().then(function () { return pegar(f); }).then(function (j) {
          var c = BasesCat.pacoteConfere(j, { uf: uf, competencia: comp, regime: regime });
          if (!c.ok) {
            tentativas.push(nomeF + ": " + c.motivo);
            if (c.competenciaAchada && achadas.indexOf(c.competenciaAchada) < 0) achadas.push(c.competenciaAchada);
            return tentar(k + 1);
          }
          /* `sel.competencia` = FIXADA: a varredura diária não troca o mês
             (Atualizacao.planoExtras) e a tela diz que está fixada */
          var n = self.registrar(id, j, { sel: { uf: uf, competencia: comp }, catId: id });
          var grav = { ok: true };
          if (typeof Store !== "undefined" && typeof Auth !== "undefined") grav = self.persistir(Auth.empresaId());
          return { total: n, fonte: id, competencia: j.mes || comp, uf: uf, origem: f.origem, atual: !!f.atual,
            live: f.origem !== "disco", fixada: true, persistido: grav.ok, gravErro: grav.erro, tentativas: tentativas };
        }, function (erro) {
          tentativas.push(nomeF + ": " + String((erro && erro.message) || erro || "falhou"));
          return tentar(k + 1);
        });
      };
      return tentar(0);
    },

    /* Baixa UMA fonte: `.gz` antes quando ela é do acervo comprimido (o mesmo
       helper da onerada, App._fetchBase, que sabe descomprimir), senão o
       _pegar com prazo. */
    _pegarFonte: function (f, opts) {
      if (f.gz && global.App && typeof global.App._fetchBase === "function") return global.App._fetchBase(f.url);
      return this._pegar(f.url, { pesoMb: (opts && opts.pesoMb) || 3 });
    },

    /* ==================================================================
     * garantirCompetencia — a pergunta do orçamento: "a base X de tal mês
     * está em uso?". Já instalada → nada a fazer. Senão tenta o mês exato.
     * Não existe em fonte nenhuma:
     *   · sem `permitirAtual` → rejeita (quem chama mostra e pergunta);
     *   · com `permitirAtual` → instala a ATUAL (o `current` do SICRO, a mais
     *     recente da desonerada) e devolve `fallback:true` com o `aviso` pronto
     *     ("usando SICRO de 04/2026, o edital pede 01/2026") — a tela mostra e
     *     o registro vai para a justificativa de preços. Nunca calado.
     * ================================================================== */
    garantirCompetencia: function (catId, pedido, opts) {
      var self = this;
      opts = opts || {};
      var id = String(catId || "").toUpperCase(), comp = BasesCat._iso(pedido && pedido.competencia), uf = String((pedido && pedido.uf) || "").toUpperCase();
      var inst = this.lista().filter(function (b) { return String(b.fonte).toUpperCase() === id; })[0];
      if (inst && String(inst.uf || "").toUpperCase() === uf && BasesCat._iso(inst.competencia) === comp) {
        return Promise.resolve({ ok: true, ja: true, fonte: id, uf: uf, competencia: comp });
      }
      var e = BasesCat.get(id) || { nome: id };
      return this.instalarCompetencia(id, pedido, opts).then(function (r) { r.ok = true; return r; }, function (err) {
        if (!err || !err.naoEncontrada || !opts.permitirAtual) throw err;
        return self.instalar(id, { uf: uf, competencia: "" }, { pesoMb: opts.pesoMb }).then(function (r) {
          var usada = BasesCat._iso(r.competencia) || r.competencia || "";
          r.ok = true; r.fallback = true; r.pedida = comp; r.tentativas = err.tentativas;
          r.aviso = "Usando " + e.nome + " de " + (BasesCat.fmtVersao(usada) || "competência não declarada") + " — o edital pede " + BasesCat.fmtVersao(comp) + ".";
          return r;
        });
      });
    },

    /* Importa base extra de texto colado/arquivo (JSON do fetcher ou CSV). */
    importarTexto: function (fonte, texto, nome, opts) {
      opts = opts || {};
      texto = String(texto || "").replace(/^﻿/, "").trim();
      if (!texto) return { ok: false, erro: "Conteúdo vazio." };
      var pacote = null, pareceJson = texto.charAt(0) === "{" || texto.charAt(0) === "[" || /\.json$/i.test(nome || "");
      if (pareceJson) {
        try { var j = JSON.parse(texto); pacote = (j && j.dados) ? j : { dados: Array.isArray(j) ? j : [] }; }
        catch (e) { return { ok: false, erro: "JSON inválido: " + e.message }; }
      } else if (typeof Sinapi !== "undefined" && Sinapi._parseCSV) {
        pacote = Sinapi._parseCSV(texto);
        if (!pacote) return { ok: false, erro: "Não reconheci as colunas do CSV (Código, Descrição e Custo)." };
      } else { return { ok: false, erro: "CSV não suportado." }; }
      if (opts.competencia) pacote.mes = opts.competencia;
      if (opts.uf) pacote.uf = opts.uf;
      var n = this.registrar(fonte, pacote);
      if (!n) return { ok: false, erro: "Nenhum item válido." };
      return { ok: true, total: n, fonte: String(fonte).toUpperCase(), pacote: pacote };
    },

    /* Persistência por empresa (localStorage via Store). */
    /* ==================================================================
     * GUARDA ANTI-PERDA — puro, Node-testável.
     *
     * O DEFEITO QUE ISTO IMPEDE (e que já custou as composições próprias de
     * um cliente): `persistir` grava o pacote INTEIRO por cima, a partir do
     * que está na memória. E `Store._bigGet` lê de um espelho em memória —
     * num boot em que o IndexedDB ainda não terminou de carregar, ele
     * devolve vazio, EXTRA fica vazio, e a primeira gravação apaga tudo.
     * Sem erro, sem aviso, sem volta.
     *
     * Regra: PERDER UMA BASE INTEIRA nunca é efeito colateral legítimo.
     * Só acontece quando o usuário manda remover — e aí quem chama diz
     * `permitirRemocao`. Fora disso, a gravação é RECUSADA.
     * ================================================================== */
    perdaDeBase: function (anterior, novo) {
      var antes = {}, perdidas = [];
      (anterior || []).forEach(function (b) {
        var f = String((b && b.fonte) || "").toUpperCase();
        if (f) antes[f] = ((b.dados || b.itens || []).length) || 0;
      });
      var agora = {};
      (novo || []).forEach(function (b) {
        var f = String((b && b.fonte) || "").toUpperCase();
        if (f) agora[f] = ((b.dados || b.itens || []).length) || 0;
      });
      for (var f2 in antes) {
        if (!antes.hasOwnProperty(f2)) continue;
        if (antes[f2] > 0 && !(agora[f2] > 0)) perdidas.push({ fonte: f2, itens: antes[f2] });
      }
      return perdidas;
    },

    /* ==================================================================
     * ALARME DE QUEDA BRUSCA — o furo que a guarda acima NÃO cobria.
     *
     * `perdaDeBase` só reage quando a base fica em ZERO. Uma gravação que
     * derruba a PRÓPRIA de 60 para 4 composições passava limpa: sobra
     * base, sobra fonte, e o cliente só descobre semanas depois, quando
     * procura uma composição que não existe mais.
     *
     * Onde a régua fica: bloqueia quando a queda é GRANDE (>= 30% do que
     * havia) E TEM VOLUME (>= 3 itens). Os dois juntos, de propósito:
     *  - excluir 1 composição de 2 é 50%, mas é 1 item -> passa (é o uso
     *    normal: excluirProprio apaga um código de cada vez);
     *  - perder 20 de 60 é 33% e 20 itens -> não existe caminho de uso
     *    que faça isso item a item. Isso é defeito, e é barrado.
     * Remoção em massa deliberada segue possível: quem chama passa
     * `permitirRemocao` (é o botão de apagar a base, que já pergunta).
     * ================================================================== */
    QUEDA_PCT: 0.30,
    QUEDA_MIN: 3,
    quedaBrusca: function (anterior, novo) {
      var self = this, antes = {}, quedas = [];
      (anterior || []).forEach(function (b) {
        var f = String((b && b.fonte) || "").toUpperCase();
        if (f) antes[f] = ((b && (b.dados || b.itens)) || []).length || 0;
      });
      (novo || []).forEach(function (b) {
        var f = String((b && b.fonte) || "").toUpperCase();
        if (!f || !(antes[f] > 0)) return;
        var agora = ((b && (b.dados || b.itens)) || []).length || 0;
        var perda = antes[f] - agora;
        if (perda <= 0) return;
        if (perda >= self.QUEDA_MIN && perda >= antes[f] * self.QUEDA_PCT) {
          quedas.push({ fonte: f, de: antes[f], para: agora, perda: perda, pct: Math.round(perda * 100 / antes[f]) });
        }
      });
      return quedas;
    },

    persistir: function (empresaId, opcoes) {
      if (typeof Store === "undefined") return { ok: false };
      var op = opcoes || {};
      /* ⚠ `inativaPorUf` NÃO entra no payload. Ele é a razão circunstancial
         da sessão (base de outra UF silenciada no boot); gravá-lo tornaria
         permanente uma desativação que ninguém pediu. Só `ativaUsuario`, que
         é escolha explícita no checkbox, atravessa para o disco. */
      var payload = EXTRA.map(function (b) {
        return {
          fonte: b.fonte, mes: b.competencia, uf: b.uf, dados: b.itens,
          /* aditivo: versão anterior ignora o campo; null não é gravado */
          desonerado: (b.desonerado === true || b.desonerado === false) ? b.desonerado : undefined,
          ativaUsuario: b.ativaUsuario !== false,
          sel: b.sel || null, catId: b.catId || null
        };
      });

      /* o que JÁ ESTÁ gravado — a régua da comparação */
      var anterior = [];
      try { anterior = Store.lerBasesExtras(empresaId) || []; } catch (e) { anterior = []; }

      var perdidas = this.perdaDeBase(anterior, payload);
      if (perdidas.length && !op.permitirRemocao) {
        var nomes = perdidas.map(function (p2) { return p2.fonte + " (" + p2.itens + " itens)"; }).join(", ");
        try {
          console.error("[bases] GRAVAÇÃO RECUSADA — perderia: " + nomes);
          if (typeof UI !== "undefined" && UI.toast) {
            UI.toast("⚠ Gravação bloqueada para proteger suas bases: " + nomes
              + ". Nada foi apagado. Recarregue o app e tente de novo.", "erro");
          }
        } catch (e2) {}
        return { ok: false, bloqueado: true, perdidas: perdidas };
      }

      /* queda grande DENTRO da base (a base sobrevive, o conteúdo não) */
      var quedas = this.quedaBrusca(anterior, payload);
      if (quedas.length && !op.permitirRemocao) {
        var texto = quedas.map(function (q) { return q.fonte + " (" + q.de + " → " + q.para + " itens, −" + q.pct + "%)"; }).join(", ");
        try {
          console.error("[bases] GRAVAÇÃO RECUSADA — queda brusca: " + texto);
          if (typeof UI !== "undefined" && UI.toast) {
            UI.toast("⚠ Gravação bloqueada: sumiriam muitos itens de uma vez — " + texto
              + ". Nada foi apagado. Feche e abra o app; se repetir, chame o suporte antes de mexer.", "erro");
          }
        } catch (e4) {}
        return { ok: false, bloqueado: true, quedas: quedas };
      }

      /* CÓPIA DA VERSÃO ANTERIOR antes de sobrescrever — recuperação em um
         clique, no próprio aparelho, sem depender de nuvem nem de suporte. */
      try {
        if (anterior && anterior.length && Store._bigSet) {
          Store._bigSet(empresaId, "bases_extras__anterior", {
            em: (typeof Util !== "undefined" && Util.agoraISO) ? Util.agoraISO() : "",
            payload: anterior
          });
        }
      } catch (e3) {}

      Store.salvarBasesExtras(empresaId, payload); // IndexedDB — sem cota do localStorage
      return { ok: true };
    },

    /* Devolve a versão anterior guardada (o "desfazer" da gravação em massa) */
    versaoAnterior: function (empresaId) {
      try { return (Store._bigGet && Store._bigGet(empresaId, "bases_extras__anterior")) || null; }
      catch (e) { return null; }
    },
    carregar: function (empresaId, ufAtiva) {
      if (typeof Store === "undefined") return 0;
      var arr = Store.lerBasesExtras(empresaId);
      var self = this; var n = 0;
      // LOTE 2: base de OUTRA UF não entra ativa por padrão — preço regional
      // errado em proposta é bug de valor. Dados preservados; reativar em 🗂
      // Tabelas é decisão consciente do usuário.
      ufAtiva = String(ufAtiva || (typeof Sinapi !== "undefined" && Sinapi.uf) || "").toUpperCase();
      var desativadas = [];
      (Array.isArray(arr) ? arr : []).forEach(function (p) {
        if (!p || !p.fonte) return;
        /* payload legado não tem ativaUsuario/sel/catId: `undefined` cai no
           padrão de registrar() (ativa, sem variante) e nada quebra */
        self.registrar(p.fonte, p, { ativaUsuario: p.ativaUsuario, sel: p.sel, catId: p.catId }); n++;
        var ufBase = String(p.uf || "").toUpperCase();
        // a base PROPRIA é AUTORAL (composições criadas pelo cliente) — vale em
        // qualquer UF e nunca é desativada pela troca de estado
        if (ufAtiva && ufBase && ufBase !== ufAtiva && ufBase !== "BR" && String(p.fonte).toUpperCase() !== "PROPRIA") {
          /* ⚠ setInativaPorUf, NÃO setAtiva: isto é circunstância da sessão.
             Com setAtiva, o primeiro persistir() seguinte gravaria a base
             como desligada no disco e ela nunca mais voltaria sozinha. */
          self.setInativaPorUf(p.fonte, true);
          desativadas.push(p.fonte + " (" + ufBase + ")");
        }
      });
      if (desativadas.length) {
        try {
          if (global.UI && global.UI.toast) global.UI.toast("Bases de outra UF desativadas: " + desativadas.join(", ") + " — UF atual é " + ufAtiva + ". Reative em 🗂 Tabelas se for intencional.", "erro");
        } catch (e) {}
      }
      return n;
    }
  };

  global.Bases = Bases;
  if (typeof module !== "undefined" && module.exports) module.exports = Bases;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
