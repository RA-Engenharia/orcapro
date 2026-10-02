/* =====================================================================
 * auth.js — Autenticação multi-empresa + gate de plano (licença)
 * MVP: login local (cada e-mail = uma "empresa"/tenant isolado no Store).
 * SaaS: trocar LocalAuth por FirebaseAuth implementando o mesmo contrato.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SESSAO_KEY = "orcapro:sessao";

  var LocalAuth = {
    // Lista de usuários demo cadastrados localmente (em SaaS isto vai pro backend)
    _usuariosKey: "orcapro:usuarios",

    _lerUsuarios: function () {
      try { return JSON.parse(localStorage.getItem(this._usuariosKey) || "[]"); }
      catch (e) { return []; }
    },
    _gravarUsuarios: function (us) {
      localStorage.setItem(this._usuariosKey, JSON.stringify(us));
    },

    /* LOTE 3 — hash de senha v2: SHA-256 iterado 3000× com salt por usuário
     * (formato "v2$<salt>$<hex>"). O formato antigo era Base64 REVERSÍVEL —
     * segue aceito SÓ para migrar no primeiro login válido (transparente,
     * nenhuma conta invalidada). Sem WebCrypto de propósito: o app roda em
     * http/file:// onde crypto.subtle não existe. */
    _salt: function () {
      var s = "";
      try {
        var a = new Uint8Array(8);
        (global.crypto || {}).getRandomValues(a);
        for (var i = 0; i < 8; i++) s += ("0" + a[i].toString(16)).slice(-2);
      } catch (e) {}
      while (s.length < 16) s += Math.floor(Math.random() * 16).toString(16);
      return s.slice(0, 16);
    },
    _hashV2: function (senha, salt) {
      var h = String(senha) + "|" + salt;
      for (var i = 0; i < 3000; i++) h = Util.sha256hex(h + "|" + salt + "|" + i);
      return "v2$" + salt + "$" + h;
    },
    _conferir: function (senha, armazenado) {
      var s = String(armazenado || "");
      /* ⚠ Registro SEM senha gravada não autentica NINGUÉM, e senha vazia não
         autentica em lugar nenhum. Sem esta linha, `btoa("") === ""` casa: um
         registro sem `senhaHash` entraria com o campo de senha em branco.
         Antes isso não acontecia por acidente (`undefined === ""` é falso);
         ao normalizar com `|| ""` para conferir o formato, o acidente sumiu e
         a porta apareceu. */
      if (!s || String(senha || "") === "") return { ok: false, legado: false };
      if (s.indexOf("v2$") === 0) {
        var partes = s.split("$");
        return { ok: this._hashV2(senha, partes[1] || "") === s, legado: false };
      }
      // formato legado (Base64): confere para permitir a migração no login
      return { ok: btoa(unescape(encodeURIComponent(senha))) === s, legado: true };
    },

    registrar: function (empresa, email, senha, plano) {
      email = String(email || "").trim().toLowerCase();
      if (!Util.naoVazio(email) || !Util.naoVazio(senha)) {
        return { ok: false, erro: "E-mail e senha são obrigatórios." };
      }
      var us = this._lerUsuarios();
      if (us.some(function (u) { return u.email === email; })) {
        return { ok: false, erro: "Já existe conta com este e-mail." };
      }
      var u = {
        empresaId: Util.uid("emp"),
        empresa: empresa || "Minha Empresa",
        email: email,
        senhaHash: this._hashV2(senha, this._salt()), // v2 desde o nascimento
        plano: plano || "PRO", // demo nasce PRO para mostrar tudo
        criadoEm: Util.agoraISO()
      };
      us.push(u);
      this._gravarUsuarios(us);
      return { ok: true, usuario: u };
    },

    login: function (email, senha) {
      email = String(email || "").trim().toLowerCase();
      var us = this._lerUsuarios();
      var u = us.filter(function (x) { return x.email === email; })[0];
      if (!u) return { ok: false, erro: "E-mail ou senha inválidos." };
      var c = this._conferir(senha, u.senhaHash);
      if (!c.ok) return { ok: false, erro: "E-mail ou senha inválidos." };
      if (c.legado) { // migração transparente: Base64 morre aqui, conta preservada
        u.senhaHash = this._hashV2(senha, this._salt());
        this._gravarUsuarios(us);
      }
      return { ok: true, usuario: u };
    },

    existe: function (email) {
      email = String(email || "").trim().toLowerCase();
      return this._lerUsuarios().some(function (u) { return u.email === email; });
    },
    listar: function () {
      return this._lerUsuarios().map(function (u) { return { empresa: u.empresa, email: u.email, plano: u.plano }; });
    },
    // Redefinição local (é o próprio navegador/dados do usuário) — não recupera senha, define uma nova.
    redefinirSenha: function (email, nova) {
      email = String(email || "").trim().toLowerCase();
      if (!Util.naoVazio(nova)) return { ok: false, erro: "Informe a nova senha." };
      var us = this._lerUsuarios();
      var u = us.filter(function (x) { return x.email === email; })[0];
      if (!u) return { ok: false, erro: "Não há conta com esse e-mail neste navegador." };
      u.senhaHash = this._hashV2(nova, this._salt()); // sempre v2
      this._gravarUsuarios(us);
      return { ok: true, usuario: u };
    }
  };

  var Auth = {
    backend: LocalAuth,
    _usuario: null,

    init: function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESSAO_KEY) || "null");
        if (s && s.email) this._usuario = s;
      } catch (e) {}
      var u = this._usuario;
      /* ⚠ REMOVIDA a migração do módulo "cotacoes" (v1.1.79, ago/2026).
         Ela dava `push("cotacoes")` em quem tinha "requisicoes" e REGRAVAVA o
         registro — ou seja, desfazia o que o admin tinha acabado de desmarcar,
         e a cada aparelho que ainda não tinha rodado a marca voltava. Permissão
         que se re-concede sozinha não é permissão. A migração já correu na
         frota há um mês; quem precisa de Cotações recebe do admin, na tela. */
      // sub-usuário: re-sincroniza permissões (o admin pode ter alterado/desativado desde o último login)
      if (u && u.papel === "usuario" && u.usuarioId) {
        var eq = this._equipe(u.empresaId), atual = null;
        for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { atual = eq[i]; break; } }
        if (!atual || atual.ativo === false) { this.logout(); return null; } // removido/desativado → desloga
        /* prazo vencido sai como o inativo — mas com o recado, para a tela de
           login dizer o porquê (ver `acessoVencido`, acima) */
        if (this.acessoVencido(atual)) { var recado = this.msgAcessoVencido(atual); this.logout(); this._recadoSaida = recado; return null; }
        u.modulos = atual.modulos || []; u.obras = atual.obras || []; u.departamento = atual.departamento || ""; u.nome = atual.nome || u.nome; u.nomePessoal = String(atual.nome || u.nomePessoal || "").trim(); u.aprovador = atual.aprovador === true; u.editaGestao = atual.editaGestao === true; u.trocarSenha = atual.trocarSenha === true; u.acessoAte = String(atual.acessoAte || "");
        localStorage.setItem(SESSAO_KEY, JSON.stringify(u));
      }
      return this._usuario;
    },

    usuario: function () { return this._usuario; },
    empresaId: function () { return this._usuario ? this._usuario.empresaId : "default"; },
    plano: function () { return this._usuario ? this._usuario.plano : "FREE"; },

    podeUsar: function (featureKey) { return CONFIG.feature(featureKey, this.plano()); },
    limite: function (limiteKey) { return CONFIG.limite(limiteKey, this.plano()); },

    registrar: function (empresa, email, senha) {
      var r = this.backend.registrar(empresa, email, senha);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    login: function (email, senha) {
      var r = this.backend.login(email, senha);        // 1) tenta o DONO da empresa (admin)
      if (r.ok) { r.usuario._papel = "admin"; this._iniciarSessao(r.usuario); return r; }
      var sub = this._loginEquipe(email, senha);        // 2) tenta um SUB-USUÁRIO (login) de qualquer empresa local
      if (sub.ok) { this._iniciarSessao(sub.usuario); return sub; }
      var nuv = this.loginNuvem(email, senha, this.empresaId()); // 3) modo nuvem: conta mestre + equipe sincronizadas (multi-aparelho)
      if (nuv.ok) { this._iniciarSessao(nuv.usuario); return nuv; }
      /* ⚠ 4) O NAMESPACE "local" PRECISA SER TENTADO EXPLICITAMENTE.
         Sem sessão, `empresaId()` devolve "default" (linha 144) — e no uso
         solo os dados e a equipe estão em "local". Sem este passo, fechar o
         `autoEntrar` (a correção de segurança acima) trancaria TODO MUNDO
         para fora: o dono e os sub-usuários, sobre os próprios dados. Os
         passos 1 a 3 continuam antes porque cobrem os casos com conta
         registrada e multi-aparelho; este é a rede de baixo. */
      var loc = null;
      if (this.empresaId() !== "local") {
        loc = this.loginNuvem(email, senha, "local");
        if (loc.ok) { this._iniciarSessao(loc.usuario); return loc; }
      }
      /* ⚠ PRAZO VENCIDO É A RESPOSTA, NÃO "E-mail ou senha inválidos". O `r`
         de baixo é o erro do passo 1 (o dono), e devolvê-lo jogava fora o
         recado próprio que os passos 2 a 4 montaram — que só existe quando a
         senha estava CERTA (ver `_loginEquipe`). */
      if (sub.vencido) return sub;
      if (nuv.vencido) return nuv;
      if (loc && loc.vencido) return loc;
      return r;
    },

    /* Existe RBAC configurado neste aparelho? Olha o namespace do uso solo
       ("local") e os das contas registradas. Basta UM sub-usuário para que a
       entrada automática deixe de ser aceitável — ela abriria como admin. */
    _temEquipeLocal: function () {
      var eq = this._equipe("local");
      return !!(eq && eq.length);
    },

    existeEmail: function (email) { return this.backend.existe(email); },
    listarContas: function () { return this.backend.listar(); },

    // ---------- Equipe: sub-usuários por empresa (RBAC de módulos) ----------
    /* ⚠ Isto era `btoa()` — Base64 é CODIFICAÇÃO, não hash: `c2VuaGExMjM=`
     * volta a ser `senha123` numa linha. E as duas entidades que guardam senha
     * SINCRONIZAM (`equipe` e `conta`), então cada sub-usuário tinha no próprio
     * aparelho a senha de todos os colegas — e a do dono.
     *
     * Agora grava no mesmo formato v2 que a conta registrada já usava desde o
     * LOTE 3 (SHA-256 iterado 3000× com salt por usuário, `_hashV2` no topo).
     *
     * ⚠ NÃO trocar isto por `crypto.subtle`/PBKDF2. O app abre em `http://` e
     *   `file://`, onde `crypto.subtle` simplesmente não existe (a nota está no
     *   topo do arquivo) — e o fallback que faltasse cairia de volta no Base64,
     *   reproduzindo o buraco exatamente onde ele estava. */
    _hashSenha: function (senha) {
      return this.backend._hashV2(String(senha || ""), this.backend._salt());
    },
    /* Confere nos DOIS formatos e diz se veio do antigo.
     * ⚠ Com salt por usuário não dá mais para calcular UM hash e comparar com
     *   `===` contra a lista toda: tem de conferir registro a registro. Era
     *   assim que os quatro caminhos abaixo funcionavam, e é o que muda neles. */
    _confereSenha: function (senha, armazenado) {
      try { return this.backend._conferir(String(senha || ""), armazenado); }
      catch (e) { return { ok: false, legado: false }; }
    },
    /* Primeiro login válido com o formato antigo: regrava em v2 e EXIGE senha
     * nova. Re-hashear sozinho seria cosmético — o Base64 de todo mundo já está
     * no aparelho de cada colega, e só uma senha NOVA tira a vazada de circulação.
     * ⚠ Falha de gravação não pode trancar ninguém: o app é offline-first, e a
     *   sessão já sai com `trocarSenha` mesmo se o disco recusar. */
    _migrarSenhaEquipe: function (empresaId, rec, senha) {
      rec.trocarSenha = true;
      try {
        rec.senhaHash = this._hashSenha(senha);
        if (typeof Store !== "undefined" && Store.salvar) Store.salvar(empresaId, "equipe", rec);
      } catch (e) {}
    },
    _migrarSenhaConta: function (empresaId, conta, senha) {
      conta.trocarSenha = true;
      try {
        conta.senhaHash = this._hashSenha(senha);
        conta.atualizadoEm = Util.agoraISO();
        var a = this._adapter(); if (a) a.gravar(empresaId, "conta", conta);
      } catch (e) {}
    },
    _equipe: function (empresaId) {
      if (typeof Store === "undefined" || !Store.listar) return [];
      try { return Store.listar(empresaId, "equipe") || []; } catch (e) { return []; }
    },

    /* =====================================================================
     * ACESSO COM PRAZO — "Acesso válido até" (`acessoAte`) por usuário da equipe
     *
     * Para que serve: o administrador dá a um CONVIDADO (cliente que só vai
     * acompanhar uma obra, consultor por contrato) um acesso que acaba
     * sozinho, sem depender de alguém lembrar de desativar no dia certo.
     *
     * Contrato do campo: "AAAA-MM-DD", INCLUSIVO — vale até o fim desse dia
     * no RELÓGIO DO APARELHO (acaba à meia-noite local do dia seguinte).
     * Vazio, ausente ou inválido = SEM LIMITE: registro antigo não muda de
     * comportamento no dia do update, e não há migração a rodar.
     *
     * Um só juiz: `acessoVencido(u, agora)`. Quem pergunta é o login da
     * equipe (`_loginEquipe`), o login por empresa (`loginNuvem`), a abertura
     * do app (`init`) e a checagem periódica com o app aberto
     * (`conferirAcesso`, chamada pelo App.render e por um relógio de 1 min em
     * js/app.js). Regra copiada em cada ponto apodrece em um deles.
     *
     * ⚠ "2026-10-05" NUNCA passa por `new Date(texto)`: string só de data é
     *   lida como meia-noite UTC, e em Brasília o acesso venceria às 21h do
     *   dia ANTERIOR ao combinado (é a mesma armadilha da nota de
     *   `Util.fmtDia`). A data é montada em partes, no fuso do aparelho;
     *   tools/test-acesso-validade.js prova em vários fusos.
     *
     * ⚠ A CHECAGEM É NO APARELHO — dois limites que a tela não pode esconder:
     *   1. A identidade na nuvem é da EMPRESA, não da pessoa (js/nuvem.js; é
     *      o mesmo aviso do escopo por obra no `formUsuario`, js/gestao.js).
     *      O prazo tranca a ENTRADA no app; não revoga a nuvem nem apaga o
     *      que já sincronizou no aparelho do convidado. E quem atrasa o
     *      relógio do aparelho atrasa o vencimento.
     *   2. Só vale nos aparelhos que tiverem ESTA versão. Versão anterior não
     *      conhece o campo e deixa entrar. Para cortar também nesses, o
     *      caminho continua sendo Status "Inativo" (que toda versão confere)
     *      ou excluir o usuário.
     *
     * ⚠ Admin e conta mestre NUNCA vencem: o prazo é de sub-usuário. Trancar
     *   o dono fora do próprio sistema é o incidente de 27/08 (ver
     *   `redefinirSenha`) aberto por outra porta.
     * ===================================================================== */
    /* "AAAA-MM-DD" → { a, m, d }, ou null. Estrito: dia que não existe
       ("2026-02-30") é inválido — e inválido é SEM LIMITE, nunca "vencido". */
    _acessoAtePartes: function (s) {
      var t = String(s == null ? "" : s).trim();
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      if (!m) return null;
      var a = +m[1], me = +m[2], d = +m[3];
      var dt = new Date(a, me - 1, d);
      if (dt.getFullYear() !== a || dt.getMonth() !== me - 1 || dt.getDate() !== d) return null;
      return { a: a, m: me, d: d };
    },
    /* o instante (ms) em que o acesso ACABA: meia-noite LOCAL do dia seguinte
       ao `acessoAte`; null = sem limite. `d + 1` vira o mês/ano sozinho
       (31/12 → 01/01), e o construtor por partes usa o fuso do aparelho. */
    acessoFimMs: function (acessoAte) {
      var p = this._acessoAtePartes(acessoAte);
      if (!p) return null;
      return new Date(p.a, p.m - 1, p.d + 1, 0, 0, 0, 0).getTime();
    },
    /* "dd/mm/aaaa" para mostrar; "" quando não há data válida */
    acessoAteBR: function (acessoAte) {
      var p = this._acessoAtePartes(acessoAte);
      if (!p) return "";
      return ("0" + p.d).slice(-2) + "/" + ("0" + p.m).slice(-2) + "/" + ("000" + p.a).slice(-4);
    },
    /* QUEM está sujeito ao prazo: só sub-usuário. Sessão e resultado de
       login dizem o papel; registro da equipe não diz, mas tem `login` (a
       conta mestre e o dono registrado não têm). Forma desconhecida = sem
       limite: é o mesmo lado para onde a data inválida cai. */
    _sujeitoAPrazo: function (u) {
      if (u.papel != null) return u.papel === "usuario";      // sessão
      if (u._papel != null) return u._papel === "usuario";    // resultado de login
      if (u.id === "conta") return false;                     // conta mestre (admin)
      return !!String(u.login || "").trim();                  // registro da equipe
    },
    /* ⚠ O JUIZ ÚNICO. `agora`: Date, ms ou nada (= relógio do aparelho). */
    acessoVencido: function (u, agora) {
      if (!u || typeof u !== "object") return false;
      if (!this._sujeitoAPrazo(u)) return false;
      var fim = this.acessoFimMs(u.acessoAte);
      if (fim === null) return false;
      var t = (agora instanceof Date) ? agora.getTime() : (agora == null ? Date.now() : Number(agora));
      if (!isFinite(t)) t = Date.now();
      return t >= fim;
    },
    msgAcessoVencido: function (u) {
      return "Seu acesso a esta empresa terminou em " + this.acessoAteBR(u && u.acessoAte) + ". Fale com o administrador.";
    },
    /* ⚠ ERRO PRÓPRIO, NÃO "senha inválida". A pessoa que acertou a senha e
       ouve "inválida" tenta de novo, pede outra senha, conclui que o sistema
       quebrou — e o administrador redefine a senha de quem ele mesmo
       desligou. O texto diz o que houve e o que fazer. */
    _erroAcessoVencido: function (u) {
      return { ok: false, vencido: true, acessoAte: String(u.acessoAte || ""), erro: this.msgAcessoVencido(u) };
    },
    /* o que o FORMULÁRIO grava: "AAAA-MM-DD", "" (sem prazo) ou null (não é
       data — e o formulário RECUSA salvar). Gravar "sem limite" quando o
       administrador quis pôr um seria o recado que mente. Aceita
       "dd/mm/aaaa" porque o <input type="date"> vira caixa de texto comum em
       WebView antiga, e é assim que a pessoa digita data. */
    normalizarAcessoAte: function (txt) {
      var s = String(txt == null ? "" : txt).trim();
      if (!s) return "";
      var br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      if (br) s = br[3] + "-" + ("0" + br[2]).slice(-2) + "-" + ("0" + br[1]).slice(-2);
      return this._acessoAtePartes(s) ? s : null;
    },
    /* CHECAGEM COM O APP ABERTO (App.render e o relógio de 1 min do App).
       Devolve "" ou o recado — e, no recado, a sessão JÁ foi encerrada.
       ⚠ Confere o registro FRESCO da equipe, não a cópia da sessão: o
       administrador que estende (ou encurta) o prazo noutro aparelho manda o
       registro pela nuvem, e é ele que vale. A cópia da sessão é só a rede
       de baixo, para registro que não está no aparelho. */
    conferirAcesso: function (agora) {
      var u = this._usuario;
      if (!u || u.papel !== "usuario") return "";             // admin/conta mestre: nunca
      var alvo = u;
      if (u.usuarioId) {
        var eq = this._equipe(u.empresaId);
        for (var i = 0; i < eq.length; i++) { if (eq[i] && eq[i].id === u.usuarioId) { alvo = eq[i]; break; } }
      }
      if (!this.acessoVencido(alvo, agora)) return "";
      var recado = this.msgAcessoVencido(alvo);
      this.logout();
      this._recadoSaida = recado;                             // a tela de login mostra (UI.renderLogin)
      return recado;
    },
    /* o porquê da última saída forçada (prazo vencido), para a tela de login.
       Limpa no login seguinte e no "Sair" — ver `_iniciarSessao` e `logout`. */
    _recadoSaida: "",
    recadoSaida: function () { return this._recadoSaida || ""; },

    _loginEquipe: function (login, senha) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return { ok: false, erro: "Usuário ou senha inválidos." };
      var contas = this.backend._lerUsuarios(), vencido = null;
      for (var i = 0; i < contas.length; i++) {
        var dono = contas[i], equipe = this._equipe(dono.empresaId);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login) {
            var c = this._confereSenha(senha, u.senhaHash);
            if (!c.ok) continue;
            /* ⚠ O PRAZO VEM DEPOIS DA SENHA, e antes da migração dela. Depois
               da senha: com senha errada a resposta segue a genérica — o
               recado do prazo não serve para descobrir que um login existe.
               Antes da migração: acesso vencido não grava nada no registro
               (a migração regrava a equipe, e isso sincroniza). */
            if (this.acessoVencido(u)) { if (!vencido) vencido = this._erroAcessoVencido(u); continue; }
            if (c.legado) this._migrarSenhaEquipe(dono.empresaId, u, senha);
            var mot = c.legado ? "seguranca" : "";
            return { ok: true, usuario: { empresaId: dono.empresaId, empresa: dono.empresa, email: u.login, nome: u.nome || u.login, plano: dono.plano || "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _obras: u.obras || [], _aprovador: u.aprovador === true, _autoAprovar: u.autoAprovar === true, _editaGestao: u.editaGestao === true, _trocarSenha: u.trocarSenha === true, _motivoTroca: mot, _acessoAte: String(u.acessoAte || "") } };
          }
        }
      }
      return vencido || { ok: false, erro: "Usuário ou senha inválidos." };
    },
    existeLoginEquipe: function (login) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return false;
      var contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var equipe = this._equipe(contas[i].empresaId);
        for (var j = 0; j < equipe.length; j++) { if (String(equipe[j].login || "").trim().toLowerCase() === login) return true; }
      }
      return false;
    },
    // Login de sub-usuário deve ser ÚNICO GLOBALMENTE (senão o login cairia na empresa errada em navegador multi-conta).
    // Retorna true se o login já é usado por OUTRO usuário (ignora o próprio registro em edição).
    /* ⚠ DOIS DEFEITOS, um em cada direção, e a mesma causa: a varredura saía
     * das contas de dono REGISTRADAS localmente e a exceção do próprio
     * registro exigia bater TAMBÉM o empresaId.
     *
     * FALSO POSITIVO (o que o cliente viu): conta registrada com `empresaId`
     * de uma ativação antiga, diferente do `empresaId` da sessão. O registro
     * de Deborah era encontrado com o mesmo login, mas `empId !== except`, e
     * a exceção não pegava — resultado: EDITAR qualquer usuário sem mudar o
     * login respondia 'Já existe um usuário com o login "dedes"'. Não dava
     * para salvar alteração nenhuma.
     *
     * FALSO NEGATIVO: no modo nuvem/licença a lista de contas registradas é
     * VAZIA, então o laço não rodava e a função devolvia false para tudo —
     * dois usuários podiam nascer com o mesmo login, e aí o login cairia na
     * pessoa errada.
     *
     * Correções: varrer também a empresa da SESSÃO, e excluir pelo ID do
     * registro, que é único e é o que a pergunta realmente significa
     * ("existe OUTRO usuário com este login?"). */
    loginEquipeEmUso: function (login, exceptEmpresaId, exceptId) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return false;
      var alvos = [], vistos = {};
      var add = function (id) { if (id && !vistos[id]) { vistos[id] = 1; alvos.push(id); } };
      add(this.empresaId());                 // a empresa em uso — pode não estar registrada
      add(exceptEmpresaId);
      var contas = [];
      try { contas = this.backend._lerUsuarios() || []; } catch (e) {}
      for (var i = 0; i < contas.length; i++) add(contas[i].empresaId);

      for (var a = 0; a < alvos.length; a++) {
        var equipe = this._equipe(alvos[a]);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (String(u.login || "").trim().toLowerCase() !== login) continue;
          if (exceptId && String(u.id) === String(exceptId)) continue;  // é o próprio, em edição
          return true;
        }
      }
      return false;
    },
    // Papel/permissões da sessão atual
    /* ⚠ FALHA FECHADA. Isto era `!u || u.papel !== "usuario"`: a AUSÊNCIA de
     * sessão valia ADMIN. Quem não estava logado respondia `true` aqui, `true`
     * em `podeModulo` para QUALQUER módulo (inclusive "usuarios") e `true` em
     * `podeAprovar`. A tela de login de `App.render` (js/app.js:411) segurava a
     * porta da frente, mas toda entrada que não passa por ela — handler solto,
     * deep-link, código que roda antes do `init`, harness — herdava tudo.
     *
     * E a correção do `autoEntrar` na v1.1.242 tornou o caso MAIS comum, não
     * menos: antes ele criava uma sessão; agora devolve `null` (certo) e o app
     * pode seguir sem sessão nenhuma. `Auth.init` também desloga sozinho quando
     * o admin desativa o sub-usuário (linha ~143).
     *
     * Sem sessão o certo é NÃO PODER NADA. A vitrine não é afetada: ela monta
     * `Auth._usuario` com empresaId "demo" (js/app.js:350), então tem sessão. */
    temSessao: function () { return !!this._usuario; },
    ehAdmin: function () { var u = this._usuario; return !!u && u.papel !== "usuario"; },
    /* ⚠ QUEM PODE DEFINIR O "RESPONSÁVEL PELO PLANEJAMENTO E GESTÃO" (28/09/2026).
       Os Dados da empresa são só do administrador — e continuam sendo. Este é o
       único campo de lá que um usuário comum pode mudar, e só com a permissão
       `editaGestao` marcada pelo administrador em Usuários (caso de quem faz o
       planejamento da obra por contrato sem ser o dono da conta). O campo é o
       padrão das composições próprias e das requisições geradas do orçamento;
       mora nas prefs e converge entre aparelhos pelo mais novo (`gestaoEm`,
       ver Nuvem._merge). Guarda de função: a tela e o salvar perguntam aqui,
       não só o menu. */
    podeEditarGestao: function () { var u = this._usuario; if (!u) return false; return this.ehAdmin() || u.editaGestao === true; },
    papel: function () { return (this._usuario && this._usuario.papel) || (this._usuario ? "admin" : ""); },
    /* ⚠ O NOME DA PESSOA, NAO O DA EMPRESA.
     *
     * Isto devolvia `u.nome || u.empresa`, e o dono da licenca nunca teve
     * `nome`: a conta mestre guarda empresa, e-mail e senha, e nenhum campo
     * para a pessoa. Entao TODO lugar que pergunta quem esta logado recebia o
     * nome da EMPRESA — inclusive `_quemAprova`, que carimba o aprovador no
     * documento, e a telemetria, onde os "usuarios" da frota inteira eram
     * razoes sociais e nao dava para saber quem estava usando o sistema.
     * ⚠ Este comentario JA CITOU o nome de um cliente real como exemplo. Nao
     * citar: `js/` inteira e copiada para o pacote de cada licenciado E para
     * o PWA em URL publica — o cliente A abria este arquivo no bloco de notas
     * e lia o nome do cliente B. Exemplo de razao social, aqui, e generico.
     *
     * Uma raiz, muitos sintomas: consertar aqui conserta aprovacao, barra do
     * topo, trilha de auditoria e painel de vendas de uma vez.
     * `nomePessoal` e preenchido no inicio da sessao — do cadastro da equipe,
     * para sub-usuario, e de `prefs.nomeDono` para o dono. A empresa segue como
     * ultimo recurso: quem nunca preencheu o nome nao pode ficar sem rotulo. */
    nome: function () {
      return this.nomePessoal() || (this._usuario && (this._usuario.empresa || this._usuario.email)) || "";
    },
    /* nome so da PESSOA — string vazia quando ninguem preencheu. Quem precisa
       saber se ha nome de verdade (a telemetria, o painel de vendas) pergunta
       por aqui, em vez de comparar com o nome da empresa e torcer. */
    nomePessoal: function () {
      var u = this._usuario; if (!u) return "";
      if (u.nomePessoal) return u.nomePessoal;
      var nm = String(u.nome || "").trim();
      /* ⚠ SESSAO GRAVADA ANTES DESTA VERSAO nao tem `nomePessoal`. Para o
         sub-usuario, `u.nome` e sempre a pessoa — o login monta
         `nome: u.nome || u.login`, nunca a empresa —, entao da para cair nele
         sem risco. Sem esta linha, quem atualizasse com a sessao aberta
         perderia o proprio nome ate deslogar.
         ⚠ E o teste e `papel`, nao so `usuarioId`: ha sessao de sub-usuario
         sem o id (o proprio test-gap3 monta uma). Olhar so o id mandava esse
         caso para o caminho do dono e apagava o nome do aprovador. */
      if (u.usuarioId || u.papel === "usuario") return nm;
      /* ⚠ e so o DONO cai em prefs. Prefs sao POR EMPRESA: se o sub-usuario
         lesse dali, o encarregado sem nome apareceria como o dono da conta —
         e assinaria aprovacoes com o nome dele. Mesma regra da foto. */
      var d = this._nomeDono();
      if (d) return d;
      /* ⚠ ULTIMO RECURSO DO DONO. A conta mestre copia a razao social para
         `nome`; nesse caso ele nao diz quem e a pessoa e nao serve aqui. Mas
         quando `nome` traz OUTRA coisa, e nome de gente de verdade e nao pode
         ser jogado fora — foi assim que a primeira versao deste conserto
         apagou o aprovador em sete asserts do test-gap3. O criterio e o
         CONTEUDO (diferente da empresa), nao um palpite sobre a origem. */
      return (nm && nm !== String(u.empresa || "").trim()) ? nm : "";
    },
    /* o dono nao tem registro em `equipe`: o nome dele mora ao lado da foto,
       em prefs (`nomeDono`), seguindo o par que `fotoDono` ja usava.
       ⚠ MEMOIZADO. `Auth.nome()` roda a cada render da barra do topo e em
       cada carimbo de aprovacao; ler prefs toda vez seria um JSON.parse por
       render. Quem grava o nome chama `esquecerNome()`.
       ⚠ E O CACHE E CHAVEADO PELA EMPRESA, nao global. A previa
       (`PreviewCli.entrar`) e a vitrine trocam `Auth._usuario` por atribuicao
       DIRETA, sem logout e sem reload — um cache global seguiria quente com o
       nome da conta da RA e a previa do cliente abriria assinada com ele,
       inclusive no print que vai para o cliente. Chave errada e pior que
       cache nenhum: e ler prefs de uma empresa com outra empresa ativa.
       ⚠ E O VAZIO NAO E MEMOIZADO. A nuvem e o restaurar-backup gravam prefs
       por fora do `Empresa` (Store.adapter.gravar direto), sem avisar
       ninguem. Congelando o "" do boot, o dono que preencheu o nome no
       celular a noite passava a MANHA INTEIRA assinando com a razao social no
       computador — o nome ja no disco, e o cache preso. Custa um JSON.parse
       por render so enquanto nao ha nome; assim que ha, memoiza. */
    _nomeDonoCache: null,
    _nomeDono: function () {
      var id = this.empresaId();
      var c = this._nomeDonoCache;
      if (c && c.id === id && c.v) return c.v;
      var v = "";
      try { v = String((Store.lerPrefs(id) || {}).nomeDono || "").trim(); } catch (e) { v = ""; }
      this._nomeDonoCache = { id: id, v: v };
      return v;
    },
    esquecerNome: function () { this._nomeDonoCache = null; },
    podeModulo: function (id) {
      /* ⚠ ANTES do atalho dos módulos "sempre liberados": sem sessão não há
         "sempre liberado". Painel/Ajuda/Relatos devolviam `true` mesmo sem
         ninguém logado, e o Painel é justamente a tela que agrega número de
         financeiro, folha e custo. */
      if (!this._usuario) return false;
      /* ⚠ O PERFIL DE IMPLANTAÇÃO ENTRA ANTES DO ATALHO DE ADMIN, e é de
         propósito. O perfil enxuga o sistema para a operação da empresa —
         uma carpintaria que não usa BIM nem Frota. Se ele viesse depois do
         `ehAdmin()`, não valeria justamente para o DONO, que é quem mais
         usa o sistema; a barra dele continuaria com os 34 módulos e o
         enxugamento só apareceria para o sub-usuário. O núcleo (painel,
         ajuda, suporte, usuários) nunca é filtrado — ver js/perfis.js. */
      if (typeof Perfis !== "undefined" && !Perfis.permite(id)) return false;
      if (this.ehAdmin()) return true;                 // dono/demo vê tudo
      /* "relatos" entra aqui junto com a ajuda: quem topa com o defeito é o
         sub-usuário que usa a tela o dia inteiro, não o admin. Trancar o canal
         de suporte no admin é garantir que o problema não chegue. */
      if (id === "dashboard" || id === "ajuda" || id === "relatos") return true; // painel, ajuda e suporte sempre acessíveis
      if (id === "usuarios") return false;             // gestão de usuários é exclusiva do admin
      var mods = (this._usuario && this._usuario.modulos) || [];
      return mods.indexOf(id) > -1;
    },
    /* ===== ESCOPO POR OBRA =====
     * `null` = sem restrição (admin, vitrine, ou sub-usuário sem obras
     * atribuídas). Array = só estas obras.
     * ⚠ Nunca "podar" id de obra excluída deste array: uma limpeza esvaziaria
     *   a lista de quem só tocava obras encerradas e o vazio significa TODAS —
     *   ou seja, a faxina promoveria a pessoa. Id órfão é inofensivo. */
    obrasPermitidas: function () {
      var u = this._usuario;
      if (!u) return [];                       // sem sessão não vê obra nenhuma
      if (this.ehAdmin()) return null;         // dono e vitrine veem tudo
      var l = u.obras;
      return (l && l.length) ? l : null;       // vazio = todas (regra da leitura)
    },
    podeObra: function (id) {
      var l = this.obrasPermitidas();
      if (l === null) return true;
      if (!id) return true;                    // sem obra = despesa geral, ver nota no funil
      return l.indexOf(String(id)) > -1;
    },

    /* =====================================================================
     * ESCOPO DOS ORÇAMENTOS POR OBRA (02/10/2026)
     *
     * O DEFEITO: o escopo por obra (`obras` do usuário da equipe) podava as
     * entidades da Gestão (`filtrarPorObra`, js/gestao.js), mas o ORÇAMENTO
     * não passa por aquele funil — mora em `Store.listarOrcamentos`. Medido
     * no app: o usuário restrito à obra A com o módulo Orçamentos via na
     * lista "Meus Orçamentos" o orçamento da obra B, com cliente e valor
     * (`veOrcDeOutraObra: true`). A lista de obras escondia a obra B; a de
     * orçamentos entregava o preço dela.
     *
     * A REGRA (um juiz só, `orcamentosVisiveisDe`, puro):
     *   - sem restrição (admin, vitrine, sub-usuário sem obras marcadas) →
     *     `null`, e nada muda;
     *   - restrito: vê o orçamento LIGADO POR ID a uma obra liberada —
     *       obra.orcamentoId  (o vínculo da ficha da obra; é o principal),
     *       orc.obraId        (campo antigo, ainda honrado quando existe),
     *       contrato.orcamentoId / medicao.orcamentoId com o obraId liberado
     *                         (o aditivo em orçamento separado chega por aí);
     *     e as REVISÕES desse orçamento (cadeia `revisaoDe`, para cima e para
     *     baixo) — a revisão é o mesmo orçamento da mesma obra, e quem cria a
     *     revisão do orçamento da própria obra não pode vê-la sumir.
     *   - orçamento SEM obra é invisível para o restrito. É de propósito: a
     *     proposta em negociação ainda não tem obra, e é justamente o que um
     *     convidado não pode ver.
     *   ⚠ A família NÃO atravessa orçamento ligado a obra alheia: revisão que
     *     outra obra adotou (ou "revisão" usada como modelo de outro cliente)
     *     é da outra obra. Ligado às duas, vale o vínculo com a liberada.
     *   ⚠ `orc.obra` NÃO é vínculo: é texto livre ({nome, local, regime})
     *     digitado no orçamento. Casar por nome seria ligar por semelhança —
     *     duas obras "Residência" e o restrito leria a proposta da outra.
     *
     * ⚠ O FILTRO MORA NA LEITURA DE TELA, NUNCA NO `Store.listarOrcamentos`.
     *   `Store.salvarOrcamento` lê a lista por ele e regrava a lista INTEIRA:
     *   lista podada ali faria o restrito que salva um orçamento APAGAR os
     *   das outras obras — e a nuvem levaria o estrago à frota (é a mesma
     *   nota do `filtrarPorObra`).
     *
     * ⚠ O QUE ISTO NÃO FAZ (e a tela não pode prometer): a nuvem baixa a
     *   empresa inteira para o aparelho (a identidade lá é da EMPRESA). O
     *   escopo esconde o que a pessoa vê e abre no app; não tira o dado do
     *   aparelho dela. É o mesmo aviso do `formUsuario`, js/gestao.js.
     * ===================================================================== */
    /* PURO: `permitidas` (null = sem restrição), listas cruas. Devolve null
       ou o mapa { orcId: true } do que o restrito pode ver. */
    orcamentosVisiveisDe: function (permitidas, obras, orcs, outros) {
      if (permitidas === null || permitidas === undefined) return null;
      var P = {}, perm = {}, alheia = {}, pai = {}, filhos = {}, fam = {}, vis = {}, fila = [], k, g;
      function txt(v) { return v == null ? "" : String(v).trim(); }
      function arr(v) { return Array.isArray(v) ? v : []; }
      arr(permitidas).forEach(function (id) { if (txt(id)) P[txt(id)] = 1; });
      function marca(orcId, obraId) {
        var o = txt(orcId), ob = txt(obraId);
        if (!o || !ob) return;
        if (P[ob] === 1) perm[o] = true; else alheia[o] = true;
      }
      arr(obras).forEach(function (ob) { if (ob) marca(ob.orcamentoId, ob.id); });
      arr(orcs).forEach(function (o) {
        if (!o || !txt(o.id)) return;
        marca(o.id, o.obraId);
        var rv = txt(o.revisaoDe);
        if (rv && rv !== txt(o.id)) { pai[txt(o.id)] = rv; (filhos[rv] = filhos[rv] || []).push(txt(o.id)); }
      });
      arr(outros).forEach(function (l) { arr(l).forEach(function (r) { if (r) marca(r.orcamentoId, r.obraId); }); });
      /* "alheia" sem "perm" = ligado SÓ a obra que a pessoa não vê */
      function bloqueado(id) { return alheia[id] === true && perm[id] !== true; }
      for (k in perm) {
        if (!Object.prototype.hasOwnProperty.call(perm, k)) continue;
        /* sobe pela cadeia até esbarrar em quem já foi visto ou em orçamento de obra alheia */
        var c = k; g = 0;
        while (c && !fam[c] && !bloqueado(c) && g++ < 1000) { fam[c] = true; fila.push(c); c = pai[c]; }
      }
      g = 0;
      while (fila.length && g++ < 20000) {
        var at = fila.shift();
        arr(filhos[at]).forEach(function (f) { if (!fam[f] && !bloqueado(f)) { fam[f] = true; fila.push(f); } });
      }
      for (k in fam) if (Object.prototype.hasOwnProperty.call(fam, k)) vis[k] = true;
      return vis;
    },
    /* FIAÇÃO: lê do Store o que o juiz precisa. `orcsTodos` evita reler a
       lista quando quem chama já a tem (a lista inteira, não um recorte —
       a cadeia de revisões precisa dos elos do meio).
       ⚠ FALHA FECHADA: leitura que estoura devolve mapa vazio (não vê nada),
         nunca `null` (veria tudo). */
    orcamentosVisiveis: function (orcsTodos) {
      var perm = this.obrasPermitidas();
      if (perm === null) return null;
      var eid = this.empresaId();
      /* ⚠ `var`, não declaração de função dentro do `try`: em modo estrito o
         ES5 recusa função declarada dentro de bloco (WebView antiga = erro de
         sintaxe no arquivo inteiro, e sem auth.js não há login) */
      var ler = function (ent) { try { return Store.listar(eid, ent) || []; } catch (e) { return []; } };
      try {
        var orcs = orcsTodos || Store.listarOrcamentos(eid) || [];
        return this.orcamentosVisiveisDe(perm, ler("obras"), orcs, [ler("contratos"), ler("medicoes")]);
      } catch (eV) { return {}; }
    },
    /* O restrito pode ver/abrir ESTE orçamento? (objeto ou id). Sem
       restrição: sempre. Sem id: não. Objeto que ainda não está no disco
       entra na conta (é por ele que a revisão recém-montada se acha na
       cadeia); o do disco, quando há, é o que vale. */
    podeOrcamento: function (orcOuId) {
      if (this.obrasPermitidas() === null) return true;
      var obj = (orcOuId && typeof orcOuId === "object") ? orcOuId : null;
      var id = String(obj ? (obj.id == null ? "" : obj.id) : (orcOuId == null ? "" : orcOuId)).trim();
      if (!id) return false;
      var orcs = [];
      try { orcs = Store.listarOrcamentos(this.empresaId()) || []; } catch (eL) { orcs = []; }
      if (obj && !orcs.some(function (o) { return o && String(o.id) === id; })) orcs = orcs.concat([obj]);
      var m = this.orcamentosVisiveis(orcs);
      return !!(m && m[id] === true);
    },
    /* a lista que a TELA mostra. `todos` = a lista inteira, quando `lista`
       for um recorte (a cadeia de revisões precisa dela). */
    filtrarOrcamentos: function (lista, todos) {
      var m = this.orcamentosVisiveis(todos || lista);
      if (m === null) return lista;
      return (Array.isArray(lista) ? lista : []).filter(function (o) { return !!o && o.id != null && m[String(o.id)] === true; });
    },
    /* Recados — um texto só para todas as portas (lista, abrir por id, busca,
       medição, vínculo da obra). Dizem o que houve e o que fazer. */
    msgOrcForaDoEscopo: function () {
      return "Este orçamento não está ligado a nenhuma obra liberada para o seu usuário — por isso ele não abre aqui. Se você precisa dele, peça ao administrador para ligá-lo à obra (ficha da obra → Vincular a um orçamento).";
    },
    /* "" = pode criar; texto = por que não. ⚠ O RESTRITO NÃO CRIA ORÇAMENTO
       SOLTO: o novo nasce sem obra, e sem obra ele é invisível para quem o
       criou — sumiria da lista no primeiro clique fora dele, com o trabalho
       dentro. Recusar ANTES de gravar é a porta honesta; quem cria e liga à
       obra é o administrador. (A revisão do orçamento da própria obra não
       passa por aqui: ela é da família, e a família é visível.) */
    orcNovoRestrito: function () {
      if (this.obrasPermitidas() === null) return "";
      return "Seu usuário vê só os orçamentos ligados às obras liberadas para ele, e um orçamento novo nasce sem obra — ele sumiria da sua lista assim que você saísse dele. Peça ao administrador para criar o orçamento e ligá-lo à obra.";
    },

    // G3: quem pode APROVAR/rejeitar medições, compras e requisições.
    // Dono/demo sempre pode; sub-usuário só com a flag "aprovador" marcada pelo admin.
    podeAprovar: function () {
      if (this.ehAdmin()) return true;
      return !!(this._usuario && this._usuario.aprovador);
    },
    // 1º acesso do sub-usuário: precisa definir a própria senha antes de usar o sistema.
    /* ⚠ O DONO também cai aqui agora. Antes a regra exigia `papel === "usuario"`,
       e o admin não tinha caminho nenhum para trocar a própria senha — mas a
       senha dele estava no mesmo Base64, no aparelho de cada funcionário. Deixar
       só a equipe trocar consertaria todo mundo menos quem tem acesso a tudo. */
    precisaTrocarSenha: function () { return !!(this._usuario && this._usuario.trocarSenha); },
    /* Por que a senha está sendo pedida — muda o texto da tela, não a regra.
       "seguranca" = a senha estava no formato antigo e acabou de ser migrada. */
    motivoTrocaSenha: function () {
      var u = this._usuario;
      if (!u || !u.trocarSenha) return "";
      return u.motivoTroca === "seguranca" ? "seguranca" : "primeiro";
    },
    // Troca a própria senha: sub-usuário grava na equipe, dono grava na conta mestre.
    trocarMinhaSenha: function (nova) {
      var u = this._usuario;
      if (!u) return { ok: false, erro: "Nenhuma sessão ativa." };
      if (!Util.naoVazio(nova) || String(nova).length < 4) return { ok: false, erro: "A nova senha precisa de ao menos 4 caracteres." };

      if (u.papel === "usuario") {
        if (!u.usuarioId) return { ok: false, erro: "Usuário não encontrado." };
        var eq = this._equipe(u.empresaId), rec = null;
        for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { rec = eq[i]; break; } }
        if (!rec) return { ok: false, erro: "Usuário não encontrado." };
        rec.senhaHash = this._hashSenha(nova); rec.trocarSenha = false;
        try { Store.salvar(u.empresaId, "equipe", rec); } catch (e) { return { ok: false, erro: "Falha ao salvar a nova senha." }; }
      } else {
        /* Dono. A senha dele mora na conta mestre (sincronizada), e é a mesma
           que abre o sistema em qualquer aparelho da empresa. */
        var conta = this.contaMestre(u.empresaId);
        if (!conta) return { ok: false, erro: "Não há conta de administrador neste aparelho." };
        conta.senhaHash = this._hashSenha(nova);
        conta.trocarSenha = false;
        conta.atualizadoEm = Util.agoraISO();
        var a = this._adapter(); if (!a) return { ok: false, erro: "Armazenamento indisponível." };
        try { a.gravar(u.empresaId, "conta", conta); } catch (e) { return { ok: false, erro: "Falha ao salvar a nova senha." }; }
        /* A conta registrada localmente (`orcapro:usuarios`), quando existe, é
           o mesmo dono e o mesmo e-mail — deixar a antiga valendo manteria a
           senha vazada abrindo o sistema por esse caminho. */
        try { if (u.email && this.backend.existe(u.email)) this.backend.redefinirSenha(u.email, nova); } catch (e) {}
      }
      u.trocarSenha = false; u.motivoTroca = ""; localStorage.setItem(SESSAO_KEY, JSON.stringify(u));
      return { ok: true };
    },

    // ---------- Modo nuvem multi-aparelho: conta mestre (admin) + login por licença ----------
    _adapter: function () { return (typeof Store !== "undefined" && Store.adapter) ? Store.adapter : null; },
    // Lê a conta de administrador sincronizada (o "dono" da licença, compartilhado na nuvem).
    contaMestre: function (empresaId) {
      var a = this._adapter(); if (!a) return null;
      try { var c = a.ler(empresaId || this.empresaId(), "conta", {}); return (c && c.email) ? c : null; } catch (e) { return null; }
    },
    // Cria/atualiza a conta de ADMINISTRADOR (sincroniza pela nuvem-tenant da licença) —
    // é o que permite o admin e a equipe logarem nos aparelhos deles.
    criarContaMestre: function (empresa, email, senha) {
      email = String(email || "").trim().toLowerCase();
      if (!email || !Util.naoVazio(senha) || String(senha).length < 4) return { ok: false, erro: "Informe e-mail e uma senha (mín. 4)." };
      var a = this._adapter(); if (!a) return { ok: false, erro: "Armazenamento indisponível." };
      var eid = this.empresaId();
      var conta = { id: "conta", empresa: empresa || (this._usuario && this._usuario.empresa) || "Minha Empresa", email: email, senhaHash: this._hashSenha(senha), criadoEm: Util.agoraISO(), atualizadoEm: Util.agoraISO() };
      try { a.gravar(eid, "conta", conta); } catch (e) { return { ok: false, erro: "Falha ao salvar." }; }
      if (this._usuario) { this._usuario.email = email; this._usuario.empresa = conta.empresa; localStorage.setItem(SESSAO_KEY, JSON.stringify(this._usuario)); }
      return { ok: true, conta: conta };
    },
    // Login no modo nuvem: valida contra a CONTA mestre (admin) + a EQUIPE sincronizadas
    // sob empresaId — funciona em QUALQUER aparelho, sem dono registrado localmente.
    loginNuvem: function (idOuEmail, senha, empresaId) {
      empresaId = empresaId || this.empresaId();
      var login = String(idOuEmail || "").trim().toLowerCase();
      var conta = this.contaMestre(empresaId);
      if (conta && conta.email === login) {
        var cc = this._confereSenha(senha, conta.senhaHash);
        if (cc.ok) {
          if (cc.legado) this._migrarSenhaConta(empresaId, conta, senha);
          return { ok: true, usuario: { empresaId: empresaId, empresa: conta.empresa, email: conta.email, nome: conta.empresa, plano: "PRO", _papel: "admin", _trocarSenha: conta.trocarSenha === true, _motivoTroca: cc.legado ? "seguranca" : "" } };
        }
      }
      var eq = this._equipe(empresaId), vencido = null;
      for (var i = 0; i < eq.length; i++) {
        var u = eq[i];
        if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login) {
          var c = this._confereSenha(senha, u.senhaHash);
          if (!c.ok) continue;
          /* ⚠ mesma ordem do `_loginEquipe`: prazo depois da senha, antes da
             migração. A conta mestre, acima, nunca passa por aqui. */
          if (this.acessoVencido(u)) { if (!vencido) vencido = this._erroAcessoVencido(u); continue; }
          if (c.legado) this._migrarSenhaEquipe(empresaId, u, senha);
          var mot = c.legado ? "seguranca" : "";
          return { ok: true, usuario: { empresaId: empresaId, empresa: (conta && conta.empresa) || "Minha Empresa", email: u.login, nome: u.nome || u.login, plano: "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _obras: u.obras || [], _aprovador: u.aprovador === true, _autoAprovar: u.autoAprovar === true, _editaGestao: u.editaGestao === true, _trocarSenha: u.trocarSenha === true, _motivoTroca: mot, _acessoAte: String(u.acessoAte || "") } };
        }
      }
      return vencido || { ok: false, erro: "Usuário ou senha inválidos." };
    },
    // Este aparelho é secundário/anônimo mas o tenant já tem admin? → precisa logar (não auto-entra).
    precisaLoginNuvem: function () {
      var u = this._usuario;
      /* só interessa a sessão ANÔNIMA de admin — a que o `autoEntrar` cria
         em aparelho virgem. A sessão de gente de verdade tem e-mail (dono) ou
         usuarioId (equipe) e não é tocada aqui. */
      if (!u || u.papel !== "admin" || u.email || u.usuarioId) return false;
      /* ⚠ A EQUIPE TAMBÉM CONTA, e a falta disso deixava um caminho aberto.
         Antes, só a conta mestre disparava o login. Mas no aparelho VIRGEM
         que abre o link de acesso a ordem é outra: o `autoEntrar` cria a
         sessão anônima ANTES de existir qualquer dado local (e por isso a
         guarda de `_temEquipeLocal` lá não pega), e só DEPOIS a ativação da
         licença sincroniza a empresa inteira. Se o dono nunca configurou a
         conta mestre, `contaMestre()` era null, isto devolvia false — e o
         funcionário ficava como administrador anônimo sobre os dados que
         acabaram de descer.
         Aparelho que guarda a equipe de uma empresa não roda sessão anônima:
         quem chegou aqui tem login e senha, e é com eles que entra. */
      return !!(this.contaMestre() || this._temEquipeLocal());
    },
    /* ⚠ ESCALADA DE PRIVILÉGIO — era a porta mais larga do sistema.
     *
     * Isto fazia `_iniciarSessao(r.usuario)` com o registro CRU da conta, que
     * não tem `_papel` nem `_modulos`. Resultado: `papel` caía no default
     * "admin" e `modulos` virava `null` — e `null` significa "todos". Somando à
     * única barreira existente, que é só `existeEmail`:
     *
     *   sub-usuário de RDO → "Sair" → digita o e-mail do DONO → "Esqueci a
     *   senha" → escolhe uma senha → está ADMIN da empresa, no namespace REAL,
     *   com Financeiro, Folha, Contratos e a tela de Usuários abertos.
     *
     * Duas coisas erradas, e as duas precisam cair:
     * 1) Redefinir senha NÃO É autenticar. Não abre sessão. Redefiniu, vai
     *    para o login e entra com a senha nova.
     * 2) Tirar o auto-login sozinho não bastava: ela definiria a senha e
     *    entraria com ela. Onde há EQUIPE ou CONTA MESTRE, o reset local é
     *    tomada de conta — quem redefine senha de gente é o administrador.
     *    É a mesma doutrina do `autoEntrar` (v1.1.242): o "é o seu próprio
     *    navegador" só vale quando o navegador é mesmo só seu. */
    /* ⚠ E A GUARDA TINHA UM BURACO DO OUTRO LADO: NÃO SOBRAVA PORTA PARA O DONO.
     *
     * Incidente de 27/08/2026: o dono de uma conta de cliente ficou trancado
     * fora do próprio sistema. Ele pedia "Esqueci a senha" e ouvia "só o
     * administrador redefine — fale com ele", sendo que o administrador É ELE.
     * A mensagem mandava a pessoa falar consigo mesma, e não havia caminho
     * nenhum de volta sem mexer no navegador por fora.
     *
     * A trava contra escalada continua de pé, e a régua que a preserva é esta:
     * quem comprou a licença é o DONO, e o servidor guarda o e-mail dela. Um
     * sub-usuário digitando o e-mail do chefe não passa — o e-mail dele não é
     * o da licença. Não é confiança no que a pessoa digita: é comparação com o
     * que o servidor registrou na ativação.
     *
     * Sem licença verificada (trial, offline sem carência) não há como provar
     * quem é o dono, e aí a porta continua fechada — mas dizendo o que fazer. */
    _emailDaLicenca: function () {
      try {
        if (typeof Licenca === "undefined" || !Licenca.status) return "";
        var st = Licenca.status() || {};
        return String(st.email || "").trim().toLowerCase();
      } catch (e) { return ""; }
    },
    ehDonoDaLicenca: function (email) {
      var lic = this._emailDaLicenca();
      if (!lic) return false;
      return String(email || "").trim().toLowerCase() === lic;
    },
    redefinirSenha: function (email, nova) {
      var alvo = String(email || "").trim().toLowerCase();
      if (this.ehDonoDaLicenca(alvo)) return this.backend.redefinirSenha(alvo, nova);
      if (this.contaMestre() || this._temEquipeLocal() || this._temEquipeDeQualquerDono(alvo)) {
        var lic = this._emailDaLicenca();
        return { ok: false, erro: lic
          ? "Só o dono da conta (" + lic + ") redefine senha por aqui. Para os demais, quem troca a senha é o administrador, na tela de Usuários."
          : "Esta conta tem usuários vinculados. Só o administrador redefine senha, na tela de Usuários. Se você é o dono e perdeu o acesso, ative a licença neste aparelho — aí o e-mail da licença libera a redefinição." };
      }
      return this.backend.redefinirSenha(alvo, nova);
    },
    /* ⚠ SÓ A CONTA-ALVO, não todas as registradas.
     *
     * Antes isto varria TODAS as contas do navegador e bastava UMA ter equipe
     * para reprovar qualquer redefinição — inclusive a de um dono solo cuja
     * conta não tem sub-usuário nenhum. Numa máquina que recebeu, por engano,
     * a equipe de OUTRA empresa (foi o incidente de 27/08), isso trancou o dono
     * de verdade para fora por causa de gente que nem devia estar ali.
     * A proteção continua inteira: o sub-usuário que digita o e-mail do chefe
     * cai na equipe DAQUELE dono e continua barrado. */
    _temEquipeDeQualquerDono: function (email) {
      var contas = [];
      try { contas = this.backend._lerUsuarios() || []; } catch (e) { return false; }
      var alvo = String(email || "").trim().toLowerCase();
      for (var i = 0; i < contas.length; i++) {
        if (alvo && String(contas[i].email || "").trim().toLowerCase() !== alvo) continue;
        var eq = this._equipe(contas[i].empresaId);
        if (eq && eq.length) return true;
      }
      return false;
    },

    /* =====================================================================
     * RECUPERAR A SENHA DO ADMINISTRADOR POR CÓDIGO NO E-MAIL (12/09/2026)
     *
     * Quem esquecia a senha de administrador não tinha porta quando o e-mail
     * dele não era o da compra da licença: `redefinirSenha` (acima) só libera
     * o dono DA LICENÇA. Agora a prova é um código de seis dígitos que o
     * servidor manda para o e-mail do administrador (server/senha-srv.js).
     *
     * ⚠ O SERVIDOR DECIDE PARA ONDE VAI O CÓDIGO, NÃO ESTE ARQUIVO. Ele lê o
     *   e-mail da conta de admin na NUVEM da licença. Se o aparelho dissesse
     *   "o admin é fulano@", um funcionário trocaria esse campo no navegador
     *   e receberia o código. O e-mail digitado aqui só é conferido lá.
     *
     * ⚠ A GUARDA ESTÁ NA FUNÇÃO, NÃO NO BOTÃO. `aplicarSenhaRecuperada` só
     *   grava depois de `conferirCodigoSenha` ter recebido `ok` do servidor
     *   para o MESMO e-mail, há menos de 10 minutos. Tela escondida não é
     *   trava: qualquer código que chame a função sem a conferência é recusado.
     *
     * ⚠ REDEFINIR NÃO É AUTENTICAR (mesma doutrina de `redefinirSenha`): grava
     *   a senha nova e manda para o login. Quem abre a sessão é o login.
     * ===================================================================== */
    _RECUP_JANELA_MS: 10 * 60 * 1000,
    _recuperacao: null,
    /* toda conta de administrador que mora NESTE aparelho: a registrada
       (`orcapro:usuarios`) e a conta mestre de cada empresa
       (`orcapro:<empresaId>:conta`). O login tenta as duas (ver `login`),
       então a senha nova tem de valer nas duas. */
    contasAdminNoAparelho: function () {
      var out = [], vistos = {};
      var add = function (eid, email, onde) {
        email = String(email || "").trim().toLowerCase();
        if (!email || vistos[onde + "|" + eid + "|" + email]) return;
        vistos[onde + "|" + eid + "|" + email] = 1;
        out.push({ empresaId: eid, email: email, onde: onde });
      };
      try { (this.backend._lerUsuarios() || []).forEach(function (u) { add(u.empresaId, u.email, "registrada"); }); } catch (e) {}
      try {
        var n = localStorage.length || 0;
        for (var i = 0; i < n; i++) {
          var k = localStorage.key(i), m = /^orcapro:(.+):conta$/.exec(String(k || ""));
          if (!m) continue;
          var c = null; try { c = JSON.parse(localStorage.getItem(k) || "null"); } catch (e2) { c = null; }
          if (c && c.email) add(m[1], c.email, "mestre");
        }
      } catch (e3) {}
      return out;
    },
    ehAdminNoAparelho: function (email) {
      var alvo = String(email || "").trim().toLowerCase();
      if (!alvo) return false;
      return this.contasAdminNoAparelho().some(function (c) { return c.email === alvo; });
    },
    /* a recuperação por código precisa da licença deste aparelho: é ela que
       diz ao servidor qual empresa e qual nuvem conferir */
    recuperacaoPorCodigoDisponivel: function () {
      try {
        return !!(typeof Licenca !== "undefined" && Licenca.chave && Licenca.chave() && Licenca.deviceId && this._servidorRecup());
      } catch (e) { return false; }
    },
    _servidorRecup: function () {
      try {
        if (typeof Licenca !== "undefined" && Licenca._servidor) return Licenca._servidor();
        return (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
      } catch (e) { return ""; }
    },
    _postRecup: function (rota, corpo) {
      var srv = this._servidorRecup();
      if (!srv || typeof fetch === "undefined") return Promise.resolve({ ok: false, erro: "Sem conexão com o servidor de licenças neste aparelho." });
      return fetch(srv + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, erro: "O servidor respondeu de um jeito inesperado (" + r.status + "). Tente de novo em instantes." }; }); })
        .catch(function () {
          return { ok: false, semRede: true, erro: "Sem internet agora — o código precisa do servidor. Confira a conexão e tente de novo." };
        });
    },
    pedirCodigoSenha: function (email) {
      var alvo = String(email || "").trim().toLowerCase();
      if (!alvo || alvo.indexOf("@") < 1) return Promise.resolve({ ok: false, erro: "Digite o e-mail do administrador." });
      if (!this.recuperacaoPorCodigoDisponivel()) {
        return Promise.resolve({ ok: false, semLicenca: true, erro: "A recuperação por código usa a licença deste aparelho, e ele está sem licença ativa. Ative a licença e tente de novo — ou fale com o suporte." });
      }
      this._recuperacao = null;               // pedir código novo invalida a liberação anterior
      return this._postRecup("/api/senha/codigo", { chave: Licenca.chave(), deviceId: Licenca.deviceId(), email: alvo });
    },
    conferirCodigoSenha: function (email, codigo) {
      var self = this, alvo = String(email || "").trim().toLowerCase();
      var cod = String(codigo || "").replace(/\D/g, "");
      if (cod.length !== 6) return Promise.resolve({ ok: false, erro: "O código tem 6 dígitos. Confira o e-mail e digite os seis." });
      if (!this.recuperacaoPorCodigoDisponivel()) return Promise.resolve({ ok: false, semLicenca: true, erro: "Este aparelho ficou sem licença ativa. Ative a licença e peça um código novo." });
      return this._postRecup("/api/senha/conferir", { chave: Licenca.chave(), deviceId: Licenca.deviceId(), email: alvo, codigo: cod })
        .then(function (r) {
          /* ⚠ SÓ `ok === true` LIBERA. Resposta torta, 500 com corpo esquisito
             ou `ok: "sim"` não abrem a troca de senha. */
          if (r && r.ok === true) self._recuperacao = { email: alvo, ate: Date.now() + self._RECUP_JANELA_MS };
          return r || { ok: false, erro: "Sem resposta do servidor." };
        });
    },
    aplicarSenhaRecuperada: function (email, nova) {
      var alvo = String(email || "").trim().toLowerCase();
      var lib = this._recuperacao;
      if (!lib || lib.email !== alvo) return { ok: false, erro: "Confirme o código enviado ao e-mail antes de definir a senha nova." };
      if (Date.now() > lib.ate) { this._recuperacao = null; return { ok: false, vencido: true, erro: "Passaram mais de 10 minutos desde a confirmação do código. Peça um código novo." }; }
      if (!Util.naoVazio(nova) || String(nova).length < 4) return { ok: false, erro: "A nova senha precisa de ao menos 4 caracteres." };

      var self = this, gravou = 0, falhou = 0, agora = Util.agoraISO();
      /* 1) conta registrada neste navegador (`orcapro:usuarios`) */
      try {
        if (this.backend.existe(alvo)) { var rb = this.backend.redefinirSenha(alvo, nova); if (rb && rb.ok) gravou++; else falhou++; }
      } catch (e) { falhou++; }
      /* 2) a conta mestre de CADA empresa deste aparelho com esse e-mail.
         ⚠ `atualizadoEm` é o que faz a senha nova atravessar a nuvem: o merge
         de `conta` (js/nuvem.js) deixa a nuvem vencer quando ELA é mais nova.
         Sem carimbo novo, o próximo sync traria a senha esquecida de volta. */
      var a = this._adapter();
      this.contasAdminNoAparelho().forEach(function (c) {
        if (c.onde !== "mestre" || c.email !== alvo || !a) return;
        try {
          var conta = a.ler(c.empresaId, "conta", {});
          if (!conta || String(conta.email || "").trim().toLowerCase() !== alvo) return;
          conta.senhaHash = self._hashSenha(nova);
          conta.trocarSenha = false;
          conta.atualizadoEm = agora;
          if (a.gravar(c.empresaId, "conta", conta) === false) falhou++; else gravou++;
        } catch (e2) { falhou++; }
      });
      if (!gravou) return { ok: false, erro: falhou ? "Não consegui gravar a senha nova neste aparelho (armazenamento cheio ou bloqueado). Faça backup e fale com o suporte." : "Não achei a conta de administrador " + alvo + " neste aparelho. Abra o sistema num aparelho onde esse administrador já entrou." };
      /* uso único, como o código: a mesma conferência não troca a senha duas vezes */
      this._recuperacao = null;
      return { ok: true, contas: gravou, falhou: falhou };
    },

    // Auto-entrada (uso solo/local): abre o app direto, sem a barreira de login.
    // Regras: já há sessão -> nada; algum dono com sub-usuários (RBAC) -> mantém o login;
    // 1 dono solo já cadastrado -> entra nele; primeiro uso -> sessão local direta (namespace estável "local").
    // O login continua acessível via "Sair" p/ quem usa RBAC/multiempresa ou quer conta com e-mail.
    autoEntrar: function () {
      if (this._usuario) return this._usuario;                 // init já restaurou a sessão
      var contas = [];
      try { contas = this.backend._lerUsuarios() || []; } catch (e) {}
      for (var i = 0; i < contas.length; i++) {                // RBAC configurado? respeita o login por perfil
        var eq = this._equipe(contas[i].empresaId);
        if (eq && eq.length) return null;
      }
      /* ⚠ FALHA DE PERMISSÃO RELATADA POR CLIENTE (15/08/2026) — CORRIGIDA AQUI.
         O laço acima só olhava as contas de dono REGISTRADAS (orcapro:usuarios).
         Quem usa o app em "uso solo" nunca registra conta: os dados — e a
         EQUIPE — vivem no namespace "local". Com a lista de contas vazia, o
         laço não rodava e a execução caía na sessão anônima de admin lá
         embaixo, no MESMO namespace onde estão os dados da empresa.
         Efeito real, reproduzido: o sub-usuário com permissão só de RDO
         clicava em "Sair", a página recarregava e o app entrava sozinho como
         ADMINISTRADOR — com Financeiro, Folha, Contratos e a própria lista de
         usuários (com os hashes de senha) abertos. Um clique, sem má
         intenção e sem conhecimento técnico.
         A guarda não pode depender de haver conta registrada: se existe
         EQUIPE em qualquer lugar deste aparelho, existe RBAC, e RBAC exige
         login. Ver `_temEquipeLocal`. */
      if (this._temEquipeLocal()) return null;
      if (contas.length) {                                     // dono solo já cadastrado -> entra nele (sem senha)
        var dono = contas[0]; dono._papel = "admin";
        this._iniciarSessao(dono);
        return this._usuario;
      }
      // primeiro uso: sessão local direta (sem cadastro). empresaId estável p/ os dados persistirem entre boots.
      this._iniciarSessao({ empresaId: "local", empresa: "Minha Empresa", email: "", plano: "PRO", _papel: "admin" });
      return this._usuario;
    },

    _iniciarSessao: function (u) {
      this._usuario = {
        empresaId: u.empresaId, empresa: u.empresa, email: u.email, plano: u.plano,
        papel: u._papel || "admin",
        nome: u.nome || u.empresa || u.email,
        /* ⚠ SO ENTRA AQUI SE FOR MESMO UMA PESSOA.
           `loginNuvem` devolve, para a CONTA MESTRE, `nome: conta.empresa`
           (l.510) — a conta mestre nao tem campo para a pessoa. Copiar cru
           fazia a RAZAO SOCIAL nascer dentro de `nomePessoal`, e como
           `nomePessoal()` comeca por ele, o curto-circuito pulava tanto
           `prefs.nomeDono` quanto a guarda de conteudo la embaixo.
           Efeito medido: o dono preenchia o nome no computador, abria no
           tablet (que entra pela nuvem) e a barra, o `_quemAprova` e o ping
           voltavam para a razao social — o MESMO documento assinado com dois
           nomes conforme o aparelho, sem conserto possivel pela tela.
           O criterio e o CONTEUDO: nome igual a razao social nao identifica
           ninguem. Sub-usuario nao passa por aqui com a empresa — o login
           dele monta `nome: u.nome || u.login`. */
        nomePessoal: (function () {
          var nm = String(u.nome || "").trim();
          return (nm && nm !== String(u.empresa || "").trim()) ? nm : "";
        })(),
        usuarioId: u._usuarioId || null,
        departamento: u._departamento || "",
        modulos: u._modulos || null,  // null = admin (todos os módulos)
        /* ⚠ ESCOPO POR OBRA. Vazio/ausente = TODAS as obras na LEITURA — assim
           ninguém fica trancado no dia do update e não há migração a rodar.
           ⚠ Mas NUNCA vazio na ESCRITA: desmarcar tudo é o gesto mais
           restritivo do admin e gravaria o resultado mais permissivo. Quem
           impede isso é o formulário (recusa salvar com zero marcadas). */
        obras: u._obras || null,
        aprovador: u._aprovador === true,
        autoAprovar: u._autoAprovar === true,  // pode aprovar a própria criação (medição/compra/requisição/RDO)
        editaGestao: u._editaGestao === true,  // pode definir o responsável pelo planejamento e gestão sem ser admin (ver podeEditarGestao)
        trocarSenha: u._trocarSenha === true,  // força definir a própria senha (1º acesso OU migração de senha)
        motivoTroca: u._motivoTroca || "",      // "seguranca" = a senha estava no formato antigo e foi migrada agora
        /* cópia do prazo (ver `acessoVencido`): rede de baixo do
           `conferirAcesso` quando o registro da equipe não está no aparelho */
        acessoAte: u._acessoAte || ""
      };
      this._recadoSaida = "";                   // entrou: o recado da saída anterior não vale mais
      localStorage.setItem(SESSAO_KEY, JSON.stringify(this._usuario));
    },

    logout: function () {
      this._usuario = null;
      this._recadoSaida = "";   // "Sair" de propósito não herda recado; a saída por prazo o grava DEPOIS de chamar logout
      /* ⚠ o cache do nome do dono e por CONTA. Sem isto, trocar de licenca na
         mesma maquina faria a barra do topo — e as aprovacoes — abrirem com o
         nome de quem saiu. */
      this._nomeDonoCache = null;
      localStorage.removeItem(SESSAO_KEY);
    }
  };

  global.Auth = Auth;
})(window);
