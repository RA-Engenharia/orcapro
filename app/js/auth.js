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
      // v1.1.79 (1× por empresa): módulo Cotações é novo — quem já operava Requisições ganha acesso;
      // depois da migração, o que o admin marcar/desmarcar no usuário vale normalmente.
      if (u && u.empresaId && typeof Store !== "undefined" && Store.listar) {
        try {
          var flagCot = "orcapro:mig:cotacoes79:" + u.empresaId;
          if (!localStorage.getItem(flagCot)) {
            (Store.listar(u.empresaId, "equipe") || []).forEach(function (m) {
              if (m && m.modulos && m.modulos.indexOf("requisicoes") > -1 && m.modulos.indexOf("cotacoes") === -1) { m.modulos.push("cotacoes"); Store.salvar(u.empresaId, "equipe", m); }
            });
            localStorage.setItem(flagCot, "1");
          }
        } catch (eMig) {}
      }
      // sub-usuário: re-sincroniza permissões (o admin pode ter alterado/desativado desde o último login)
      if (u && u.papel === "usuario" && u.usuarioId) {
        var eq = this._equipe(u.empresaId), atual = null;
        for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { atual = eq[i]; break; } }
        if (!atual || atual.ativo === false) { this.logout(); return null; } // removido/desativado → desloga
        u.modulos = atual.modulos || []; u.departamento = atual.departamento || ""; u.nome = atual.nome || u.nome; u.aprovador = atual.aprovador === true; u.trocarSenha = atual.trocarSenha === true;
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
      if (this.empresaId() !== "local") {
        var loc = this.loginNuvem(email, senha, "local");
        if (loc.ok) { this._iniciarSessao(loc.usuario); return loc; }
      }
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
    _loginEquipe: function (login, senha) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return { ok: false, erro: "Usuário ou senha inválidos." };
      var contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var dono = contas[i], equipe = this._equipe(dono.empresaId);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login) {
            var c = this._confereSenha(senha, u.senhaHash);
            if (!c.ok) continue;
            if (c.legado) this._migrarSenhaEquipe(dono.empresaId, u, senha);
            var mot = c.legado ? "seguranca" : "";
            return { ok: true, usuario: { empresaId: dono.empresaId, empresa: dono.empresa, email: u.login, nome: u.nome || u.login, plano: dono.plano || "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _aprovador: u.aprovador === true, _autoAprovar: u.autoAprovar === true, _trocarSenha: u.trocarSenha === true, _motivoTroca: mot } };
          }
        }
      }
      return { ok: false, erro: "Usuário ou senha inválidos." };
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
    loginEquipeEmUso: function (login, exceptEmpresaId, exceptId) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return false;
      var contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var empId = contas[i].empresaId, equipe = this._equipe(empId);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (String(u.login || "").trim().toLowerCase() === login && !(empId === exceptEmpresaId && u.id === exceptId)) return true;
        }
      }
      return false;
    },
    // Papel/permissões da sessão atual
    ehAdmin: function () { var u = this._usuario; return !u || u.papel !== "usuario"; },
    papel: function () { return (this._usuario && this._usuario.papel) || "admin"; },
    nome: function () { var u = this._usuario; return u ? (u.nome || u.empresa || u.email || "") : ""; },
    podeModulo: function (id) {
      if (this.ehAdmin()) return true;                 // dono/demo vê tudo
      /* "relatos" entra aqui junto com a ajuda: quem topa com o defeito é o
         sub-usuário que usa a tela o dia inteiro, não o admin. Trancar o canal
         de suporte no admin é garantir que o problema não chegue. */
      if (id === "dashboard" || id === "ajuda" || id === "relatos") return true; // painel, ajuda e suporte sempre acessíveis
      if (id === "usuarios") return false;             // gestão de usuários é exclusiva do admin
      var mods = (this._usuario && this._usuario.modulos) || [];
      return mods.indexOf(id) > -1;
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
      var eq = this._equipe(empresaId);
      for (var i = 0; i < eq.length; i++) {
        var u = eq[i];
        if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login) {
          var c = this._confereSenha(senha, u.senhaHash);
          if (!c.ok) continue;
          if (c.legado) this._migrarSenhaEquipe(empresaId, u, senha);
          var mot = c.legado ? "seguranca" : "";
          return { ok: true, usuario: { empresaId: empresaId, empresa: (conta && conta.empresa) || "Minha Empresa", email: u.login, nome: u.nome || u.login, plano: "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _aprovador: u.aprovador === true, _autoAprovar: u.autoAprovar === true, _trocarSenha: u.trocarSenha === true, _motivoTroca: mot } };
        }
      }
      return { ok: false, erro: "Usuário ou senha inválidos." };
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
    redefinirSenha: function (email, nova) {
      var r = this.backend.redefinirSenha(email, nova);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
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
        usuarioId: u._usuarioId || null,
        departamento: u._departamento || "",
        modulos: u._modulos || null,  // null = admin (todos os módulos)
        aprovador: u._aprovador === true,
        autoAprovar: u._autoAprovar === true,  // pode aprovar a própria criação (medição/compra/requisição/RDO)
        trocarSenha: u._trocarSenha === true,  // força definir a própria senha (1º acesso OU migração de senha)
        motivoTroca: u._motivoTroca || ""       // "seguranca" = a senha estava no formato antigo e foi migrada agora
      };
      localStorage.setItem(SESSAO_KEY, JSON.stringify(this._usuario));
    },

    logout: function () {
      this._usuario = null;
      localStorage.removeItem(SESSAO_KEY);
    }
  };

  global.Auth = Auth;
})(window);
