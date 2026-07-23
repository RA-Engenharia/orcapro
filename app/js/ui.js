/* =====================================================================
 * ui.js — Renderização (telas, abas, modais, toasts, tabelas)
 * Consome o estado de app.js e os cálculos de orcamento.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var UI = {
    el: function (id) { return document.getElementById(id); },

    // ---------- Toast ----------
    toast: function (msg, tipo) {
      var wrap = this.el("toasts");
      var t = document.createElement("div");
      t.className = "toast " + (tipo || "");
      t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(function () { t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 250); }, 2600);
    },

    // ---------- Modal ----------
    modal: function (titulo, corpoHTML, rodapeBotoes) {
      this.fecharModal();
      var bg = document.createElement("div");
      bg.className = "modal-bg"; bg.id = "modal-bg";
      bg.innerHTML =
        '<div class="modal"><header><h2>' + Util.esc(titulo) + '</h2>' +
        '<span style="flex:1"></span><button class="btn ghost sm" data-fechar>✕</button></header>' +
        '<div class="body">' + corpoHTML + '</div>' +
        '<footer id="modal-footer"></footer></div>';
      document.body.appendChild(bg);
      var footer = bg.querySelector("#modal-footer");
      (rodapeBotoes || []).forEach(function (b) {
        var btn = document.createElement("button");
        btn.className = "btn " + (b.classe || "");
        btn.textContent = b.texto;
        btn.onclick = b.onClick;
        footer.appendChild(btn);
      });
      bg.addEventListener("click", function (e) {
        if (e.target === bg || e.target.hasAttribute("data-fechar")) UI.fecharModal();
      });
      return bg;
    },
    fecharModal: function () { var m = this.el("modal-bg"); if (m) m.remove(); },

    // LOTE 5: overlay de carregamento p/ operações longas (analítico 17MB, IA).
    // Sem isso o app parece travado e a primeira impressão morre ali.
    loading: function (msg) {
      this.loadingFim();
      if (!document.getElementById("ui-loading-css")) {
        var s = document.createElement("style"); s.id = "ui-loading-css";
        s.textContent = "@keyframes uiSpin{to{transform:rotate(360deg)}}";
        document.head.appendChild(s);
      }
      var d = document.createElement("div");
      d.id = "ui-loading";
      d.style.cssText = "position:fixed;inset:0;background:rgba(15,39,64,.45);z-index:9999;display:flex;align-items:center;justify-content:center";
      d.innerHTML = '<div style="background:#fff;border-radius:12px;padding:18px 26px;font-weight:600;color:#1e293b;box-shadow:0 18px 50px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center">' +
        '<span style="width:18px;height:18px;border:3px solid #cbd5e1;border-top-color:#2e6f9e;border-radius:50%;display:inline-block;animation:uiSpin .8s linear infinite"></span>' +
        Util.esc(msg || "Carregando…") + "</div>";
      document.body.appendChild(d);
    },
    loadingFim: function () { var d = document.getElementById("ui-loading"); if (d) d.remove(); },

    // ---------- Topbar ----------
    renderTopbar: function (usuario) {
      var plano = usuario.plano || "FREE";
      var freeCls = plano === "FREE" ? "free" : "";
      var admin = usuario.papel !== "usuario"; // sub-usuário não vê ações de dono (empresa/licença/backup)
      var deptoLbl = (usuario.departamento && typeof Gestao !== "undefined" && Gestao.rot) ? Gestao.rot(Gestao.P.departamento, usuario.departamento) : (usuario.departamento || "usuário");
      return '' +
        '<button class="topbar-burger" data-acao="menu" aria-label="Menu de módulos" title="Módulos">☰</button>' +
        '<div class="logo" style="display:flex;align-items:center;gap:10px">' +
          '<svg width="34" height="34" viewBox="0 0 100 100" style="flex:none"><defs><linearGradient id="tbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#163a5c"/><stop offset="1" stop-color="#2e6f9e"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#tbg)"/><rect x="24" y="52" width="13" height="22" rx="4" fill="#fff" opacity=".55"/><rect x="44" y="38" width="13" height="36" rx="4" fill="#fff" opacity=".9"/><rect x="64" y="24" width="13" height="50" rx="4" fill="#6fd08a"/><path d="M73 10 l2.4 5.1 5.6 .7 -4.1 3.9 1 5.6 -4.9 -2.7 -4.9 2.7 1 -5.6 -4.1 -3.9 5.6 -.7z" fill="#9be7af"/></svg>' +
          '<div style="display:flex;flex-direction:column;line-height:1.05">' + CONFIG.marca.logoTexto + '<small>' + CONFIG.marca.slogan + ' · <span style="opacity:.85">v' + CONFIG.versao + '</span></small></div>' +
        '</div>' +
        '<span class="badge-plano ' + freeCls + '">' + (CONFIG.planos[plano] ? CONFIG.planos[plano].nome : plano) + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="topo-ic-btn" data-busca-abrir aria-label="Busca universal (Ctrl+K)" title="Busca universal — pule pra qualquer obra, orçamento ou ação (Ctrl+K)">🔍<span class="topo-kbd">Ctrl+K</span></button>' +
        (function () {
          var n = (typeof AvisosUI !== "undefined") ? AvisosUI.contar() : 0;
          return '<button class="topo-ic-btn" data-avisos-abrir aria-label="Central de avisos" title="Central de avisos — medições a aprovar, tarefas atrasadas e restrições">🔔' +
            (n ? '<span class="aviso-badge">' + (n > 99 ? "99+" : n) + "</span>" : "") + "</button>";
        })() +
        '<div class="topbar-conta">' +
          '<button class="conta-btn" data-acao="conta" aria-label="Conta e configurações" title="Conta e configurações">' +
            '<span class="conta-ic">⚙</span><span class="conta-nome">' + Util.esc(usuario.empresa) + '</span><span class="conta-ca">▾</span>' +
          '</button>' +
          '<div class="conta-drop">' +
            '<div class="conta-cab"><b>' + Util.esc(usuario.empresa) + '</b><span>' + (admin ? Util.esc(usuario.email) : Util.esc(usuario.nome || usuario.email) + ' · ' + Util.esc(deptoLbl)) + '</span></div>' +
            (function () {
              if (!admin) return "";
              var lic = (typeof Licenca !== "undefined") ? Licenca.status() : null;
              if (!lic) return "";
              var lbl, alerta = false;
              // LOTE 5: trial 7 dias completo — mostra o tempo restante e acende no fim
              if (lic.trial && lic.ativo) { lbl = "Teste grátis: " + (lic.rotulo || "") + " restantes"; alerta = (lic.restanteMs || 0) < 2 * 86400000; }
              else if (lic.trial) { lbl = "Teste encerrado (ativar licença)"; alerta = true; }
              else if (lic.expirada) { lbl = "Licença vencida"; alerta = true; }
              else if (lic.outroDispositivo) { lbl = "Ativada em outra máquina"; alerta = true; }
              else if (lic.revalidar) { lbl = "Reconecte para validar"; alerta = true; }
              else if (lic.diasRestantes != null) { lbl = "Licença: " + lic.diasRestantes + " dias"; alerta = lic.diasRestantes <= 7; }
              else lbl = "Licenciado";
              return '<button class="conta-item' + (alerta ? " alerta" : "") + '" data-acao="licenca"><span>🔑</span>' + Util.esc(lbl) + '</button>';
            })() +
            (admin ? '<button class="conta-item" data-acao="empresa"><span>⚙</span>Dados da empresa</button>' : '') +
            '<button class="conta-item" data-acao="tabelas"><span>🗂</span>Tabelas de preço</button>' +
            (admin ? '<button class="conta-item" data-acao="nuvem"><span>☁</span>Nuvem — sincronizar aparelhos</button>' : '') +
            (admin ? '<button class="conta-item" data-acao="backup"><span>💾</span>Backup dos dados</button>' : '') +
            '<button class="conta-item" data-acao="tema"><span>🎨</span>Tema do aplicativo</button>' +
            '<button class="conta-item" data-acao="atualizar"><span>🔄</span>Buscar atualização</button>' +
            '<div class="conta-sep"></div>' +
            '<button class="conta-item sair" data-acao="logout"><span>🚪</span>Sair</button>' +
            '<div class="conta-sep"></div>' +
            '<div style="padding:4px 12px 6px;font-size:11.5px;color:var(--texto-fraco);text-align:center">' + Util.esc(CONFIG.marca.nomeProduto || "OrçaPRO IA") + ' · <b>v' + Util.esc(CONFIG.versao) + '</b></div>' +
          '</div>' +
        '</div>';
    },

    // ---------- Atualizar tabelas (backend sinapi-fetcher) ----------
    renderAtualizar: function (info) {
      if (!info.online) {
        return '<div class="vazio card">⚠️ <b>Backend offline.</b><br>O atualizador automático usa o servidor <b>sinapi-fetcher</b> do ERP (porta 3040). ' +
          'Ligue o ERP/servidor e tente de novo — ou use <b>🗂 Tabelas</b> / <b>⬆ Importar base SINAPI</b> para subir o arquivo manualmente.</div>';
      }
      var html = '<p>Backend <b style="color:var(--verde,#16a34a)">conectado</b> · base atual no app: <b>' + Util.esc(info.atual || "—") + ' / ' + Util.esc(info.uf) + '</b></p>';
      if (info.desatualizado) {
        html += '<div class="card" style="border-color:var(--amarelo,#f59e0b)">⚠️ Competência mais nova disponível na Caixa: <b>' + Util.esc(info.ultimaOficial || info.ultimaCache) + '</b></div>';
      } else {
        html += '<div class="muted mb">✔ Sua base está na competência mais recente.</div>';
      }
      html += '<h3 style="margin:12px 0 6px">Competências prontas no cache</h3>';
      if (info.cacheMeses.length) {
        html += '<div class="flex" style="flex-wrap:wrap;gap:8px">' + info.cacheMeses.map(function (m) {
          return '<button class="btn sm ' + (m === info.atual ? "" : "primary") + '" data-atz-carregar="' + Util.esc(m) + '">' + (m === info.atual ? "✔ " : "⬇ ") + Util.esc(m) + '</button>';
        }).join("") + '</div>';
      } else { html += '<p class="muted">Nenhuma no cache.</p>'; }
      if (info.ultimaOficial && info.cacheMeses.indexOf(info.ultimaOficial) === -1) {
        html += '<h3 style="margin:14px 0 6px">Baixar da Caixa</h3>' +
          '<button class="btn sm success" data-atz-baixar="' + Util.esc(info.ultimaOficial) + '">⬇ Baixar ' + Util.esc(info.ultimaOficial) + ' (30–60s)</button>';
      }
      return html;
    },

    // ---------- Tabelas de Preço (multi-base) ----------
    renderTabelas: function (lista) {
      var rows = (lista || []).map(function (b) {
        return '<tr><td><span class="pill ' + (b.cor || "proprio") + '">' + Util.esc(b.label) + '</span></td>' +
          '<td>' + Util.esc((b.competencia || "—") + " / " + (b.uf || "—")) + '</td>' +
          '<td class="num">' + (b.total || 0).toLocaleString("pt-BR") + '</td>' +
          '<td><label style="cursor:pointer"><input type="checkbox" data-base-toggle="' + Util.esc(b.fonte) + '"' + (b.ativa ? " checked" : "") + '> ativa</label></td>' +
          '<td class="right">' + (b.fonte !== "SINAPI" ? '<button class="btn sm danger" data-base-remover="' + Util.esc(b.fonte) + '">remover</button>' : '') + '</td></tr>';
      }).join("");
      var fontes = (typeof Bases !== "undefined" && Bases.META) ? Object.keys(Bases.META).filter(function (k) { return k !== "SINAPI"; }) : ["SICRO", "SEINFRA", "SETOP", "ORSE", "SUDECAP", "SBC", "PROPRIA"];
      var opts = fontes.map(function (x) { var m = (typeof Bases !== "undefined" && Bases.META && Bases.META[x]) || {}; return '<option value="' + x + '">' + Util.esc(m.label || x) + '</option>'; }).join("");
      return '<p class="muted mb">Habilite/priorize bancos de preço. A busca de itens varre todas as bases <b>ativas</b> (badge mostra a origem). A SINAPI continua padrão.</p>' +
        '<table class="tbl"><thead><tr><th>Base</th><th>Competência/UF</th><th class="num">Itens</th><th>Status</th><th></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5">—</td></tr>') + '</tbody></table>' +
        '<h3 style="margin:18px 0 8px">Importar base extra</h3>' +
        '<p class="muted" style="font-size:12px;margin:-2px 0 8px">Carregue a <b>planilha oficial da base do seu estado</b> (EMOP-RJ, CPOS/FDE-SP, ORSE-SE, AGETOP-GO…). O detector reconhece as colunas (código, descrição, unidade, custo) sozinho — nada é inventado.</p>' +
        '<div class="row"><div class="field"><label>Fonte</label><select id="tab-fonte">' + opts + '</select></div>' +
        '<div class="field"><label>UF (opcional)</label><input id="tab-uf" placeholder="MG"></div></div>' +
        '<div class="field"><label>Arquivo (planilha oficial: Excel .xlsx/.xls, CSV, ou JSON do fetcher)</label><input type="file" id="tab-file" accept=".xlsx,.xls,.json,.csv,.txt"></div>' +
        '<div class="field"><label>ou cole o conteúdo (JSON, ou CSV: Código;Descrição;Custo)</label><textarea id="tab-text" rows="3"></textarea></div>' +
        '<h3 style="margin:18px 0 6px">📦 Bases prontas (1 clique, já inclusas no app)</h3>' +
        '<div class="flex" style="flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
        '<button class="btn sm primary" data-inclusa="data/sudecap-BH-current.json|SUDECAP">📦 SUDECAP · Belo Horizonte (atual)</button>' +
        '<button class="btn sm primary" data-inclusa="data/seinfra-CE-current.json|SEINFRA">📦 SEINFRA · Ceará (atual)</button>' +
        '<button class="btn sm primary" data-inclusa="data/sicro-ES-current.json|SICRO" title="SICRO/DNIT — custos rodoviários oficiais. Relatório Sintético de Composições, trimestral.">📦 SICRO/DNIT · ES (rodoviárias)</button>' +
        '<button class="btn sm primary" data-inclusa="data/iopes-ES-current.json|IOPES" title="IOPES/DER-ES — Tabela Referencial de Edificações do Espírito Santo (não desonerada, BDI 0%), mensal.">📦 IOPES/DER-ES · ES (edificações)</button>' +
        '<button class="btn sm primary" data-inclusa="data/orse-SE-current.json|ORSE" title="ORSE/CEHOP-SE — Orçamento de Obras de Sergipe (consulta pública oficial), mensal.">📦 ORSE · Sergipe</button>' +
        '<span class="flex" style="gap:4px;align-items:center"><select id="setop-regiao" class="btn sm" style="padding:5px">' +
        [["Triangulo", "Triângulo"], ["Central", "Central"], ["Norte", "Norte"], ["Sul", "Sul"], ["Leste", "Leste"], ["Jequitinhonha", "Jequitinhonha/Mucuri"]].map(function (r) { return '<option value="' + r[0] + '">' + r[1] + '</option>'; }).join("") +
        '</select><select id="setop-regime" class="btn sm" style="padding:5px"><option value="desonerada">Desonerada</option><option value="onerada">Onerada</option></select>' +
        '<button class="btn sm primary" data-acao="carregar-setop">📦 SETOP · MG (ago/2023)</button></span>' +
        '<span class="flex" style="gap:4px;align-items:center"><select id="goinfra-regime" class="btn sm" style="padding:5px"><option value="onerada">Sem desoneração</option><option value="desonerada">Com desoneração</option></select>' +
        '<select id="goinfra-preco" class="btn sm" style="padding:5px" title="Custo direto: o app aplica o seu BDI. Com BDI: usa o preço final oficial da GOINFRA (27,21%)."><option value="direto">Custo direto (sem BDI)</option><option value="comBDI">Preço com BDI (oficial)</option></select>' +
        '<button class="btn sm primary" data-acao="carregar-goinfra">📦 GOINFRA/AGETOP · GO (rodoviárias)</button></span>' +
        '</div>' +
        '<h3 style="margin:18px 0 6px">📁 Escanear pasta inteira (de uma vez)</h3>' +
        '<p class="muted" style="font-size:12px">Pasta DENTRO do projeto do ERP (ex.: <b>mg-01-2026</b> = SICRO-MG). O fetcher parseia TUDO (composições com MO/MAT/EQ + materiais + equipamentos + mão de obra) e organiza no multi-base sozinho.</p>' +
        '<div class="row"><div class="field"><label>Pasta</label><input id="scan-pasta" value="mg-01-2026"></div>' +
        '<div class="field"><label>UF</label><input id="scan-uf" placeholder="MG (auto)"></div>' +
        '<div class="field"><label>Competência</label><input id="scan-mes" placeholder="2026-01 (auto)"></div></div>' +
        '<div class="flex" style="align-items:center;gap:12px"><label style="cursor:pointer"><input type="checkbox" id="scan-deson"> com desoneração</label>' +
        '<button class="btn sm primary" data-acao="escanear-pasta">📁 Escanear e organizar</button></div>';
    },

    // ---------- Comparar cenários de preço ----------
    renderCenarios: function (custo, cenarios) {
      var f = Util.fmtNum;
      var cards = cenarios.map(function (c) {
        var bdiV = custo * c.bdi / 100, venda = custo + bdiV;
        var border = c.dest ? "2px solid #16a34a" : "1px solid var(--linha,#e2e8f0)";
        return '<div style="flex:1;min-width:150px;border:' + border + ';border-radius:12px;padding:14px;text-align:center;background:' + (c.dest ? "#f0fdf4" : "#fff") + '">' +
          '<div style="font-weight:800;font-size:15px;color:' + c.cor + '">' + c.nome + (c.dest ? " ★" : "") + '</div>' +
          '<div style="font-size:11px;color:var(--mut,#64748b);min-height:30px">' + c.desc + '</div>' +
          '<div style="font-size:12px;color:var(--mut,#64748b);margin-top:6px">BDI ' + f(c.bdi, 2) + '%</div>' +
          '<div style="font-size:22px;font-weight:900;color:#0f2740;line-height:1.25">R$ ' + f(venda, 2) + '</div>' +
          '<div style="font-size:11px;color:#16a34a;margin-bottom:10px">margem R$ ' + f(bdiV, 2) + '</div>' +
          '<button class="btn sm primary" data-acao="aplicar-cenario" data-bdi="' + c.bdi + '">Aplicar</button>' +
          '</div>';
      }).join("");
      return '<p class="muted mb">Custo direto: <b>R$ ' + f(custo, 2) + '</b> (igual nos três). O que muda é o <b>BDI</b> (sua margem) e o preço final:</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' + cards + '</div>' +
        '<p class="muted" style="font-size:12px;margin-top:12px"><b>Agressivo</b> = preço menor pra ganhar a obra · <b>Conservador</b> = margem maior pra risco maior. Clique <b>Aplicar</b> pra usar o cenário no orçamento.</p>';
    },

    // ---------- Licença ----------
    renderLicenca: function (st) {
      var html = '<p class="muted mb">Status da sua licença do OrçaPRO.</p>';
      if (st.trial && st.ativo) {
        html += '<div class="card"><b>🔓 Teste grátis — ' + Util.esc(st.rotulo || "") + ' restantes</b><br>Durante o teste você usa <b>TUDO</b>: monta orçamento, salva e exporta (PDF, Excel, proposta, laudo). Ao final dos 7 dias, ative uma licença para continuar — seus orçamentos ficam preservados.</div>';
      } else if (st.trial) {
        html += '<div class="card"><b>⏰ Teste grátis encerrado</b><br>Seus orçamentos estão preservados. Ative sua licença com a chave da compra para voltar a salvar e exportar.</div>';
      } else {
        html += '<div class="card"><b style="color:var(--verde,#16a34a)">✓ Licenciado</b><br>' + Util.esc(st.email || "") + (st.expira ? ' · válida até ' + new Date(st.expira).toLocaleDateString("pt-BR") : ' · permanente') + '</div>';
      }
      html += '<div class="field" style="margin-top:12px"><label>Chave de licença</label><input id="lic-chave" placeholder="cole aqui a chave que você recebeu"></div>';
      return html;
    },

    // ---------- Cadastro da Empresa / Responsável Técnico ----------
    renderEmpresa: function (emp, logo) {
      function f(id, lab, val) { return '<div class="field"><label>' + lab + '</label><input id="emp-' + id + '" value="' + Util.esc(val || "") + '"></div>'; }
      return '<p class="muted mb">Estes dados aparecem nos documentos (Anexo de Laudo, Proposta).</p>' +
        '<div class="row">' + f("nome", "Razão social / Empresa", emp.nome) + f("cnpj", "CNPJ", emp.cnpj) + '</div>' +
        '<div class="row">' + f("responsavel", "Responsável técnico", emp.responsavel) + f("titulo", "Título profissional", emp.titulo) + '</div>' +
        '<div class="row">' + f("crea", "Registro CREA/CAU", emp.crea) + f("registroNacional", "Reg. Nacional", emp.registroNacional) + '</div>' +
        '<div class="row">' + f("cidade", "Cidade / UF", emp.cidade) + f("contato", "Contato (tel/e-mail)", emp.contato) + '</div>' +
        '<div class="field"><label>Endereço (rua, nº, bairro — usado nos documentos)</label><input id="emp-endereco" value="' + Util.esc(emp.endereco || "") + '"></div>' +
        '<div class="field"><label>Logo (PNG/JPG — aparece na capa dos documentos)</label>' +
        '<input type="file" id="emp-logo" accept="image/png,image/jpeg,image/jpg,image/webp">' +
        '<div id="emp-logo-prev" class="mt">' + (logo ? '<img src="' + logo + '" style="max-height:72px;border:1px solid var(--linha);border-radius:6px;padding:4px;background:#fff">' : '<span class="muted">Nenhum logo carregado.</span>') + '</div></div>' +
        this._renderEmpresaDocs();
    },
    /* Seção "Documentos & entregáveis" do ⚙ Empresa — white-label: os docs saem com a
     * marca DO CLIENTE; menção ao produto, marca d'água e QR são opcionais. */
    _renderEmpresaDocs: function () {
      var cfg = (typeof Empresa !== "undefined" && Empresa.docsCfg) ? Empresa.docsCfg() : { creditos: true, marcaDagua: "empresa", qr: true };
      return '' +
        '<div class="card mt" style="padding:12px 14px">' +
          '<b>Documentos &amp; entregáveis (sua marca)</b>' +
          '<p class="muted" style="font-size:12px;margin:4px 0 8px">Todos os documentos saem com a SUA logo e os SEUS dados. Aqui você escolhe o que mais aparece neles.</p>' +
          '<label class="flex" style="gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="emp-doc-creditos"' + (cfg.creditos ? " checked" : "") + '> Mencionar “Gerado pelo OrçaPRO IA” no rodapé dos documentos</label>' +
          '<label class="flex" style="gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="emp-doc-qr"' + (cfg.qr ? " checked" : "") + '> Incluir QR de verificação (Portal do Cliente) nos impressos</label>' +
          '<div class="field" style="margin:6px 0 0"><label>Marca d’água das páginas internas (Proposta / Laudo / Relatório)</label>' +
            '<select id="emp-doc-wm">' +
              '<option value="empresa"' + (cfg.marcaDagua !== "nenhuma" ? " selected" : "") + '>Nome da minha empresa</option>' +
              '<option value="nenhuma"' + (cfg.marcaDagua === "nenhuma" ? " selected" : "") + '>Nenhuma</option>' +
            '</select></div>' +
        '</div>';
    },

    // ---------- Tela: Login ----------
    renderLogin: function () {
      var contas = (typeof Auth !== "undefined" && Auth.listarContas) ? Auth.listarContas() : [];
      // Login sugerido pelo link de acesso do admin (?u=): a pessoa só digita a senha.
      var sugLogin = ""; try { sugLogin = localStorage.getItem("orcapro:login-sugerido") || ""; } catch (e) {}
      var chips = contas.length
        ? '<div class="field"><label>Suas contas neste navegador (clique p/ preencher o e-mail)</label><div class="flex" style="flex-wrap:wrap;gap:6px">' +
            contas.map(function (c) { return '<button type="button" class="btn sm" data-conta="' + Util.esc(c.email) + '">👤 ' + Util.esc(c.email) + '</button>'; }).join("") +
          '</div></div>'
        : '';
      var badge = '<svg width="46" height="46" viewBox="0 0 100 100" style="flex:none"><defs><linearGradient id="lgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#163a5c"/><stop offset="1" stop-color="#2e6f9e"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#lgg)"/><rect x="24" y="52" width="13" height="22" rx="4" fill="#fff" opacity=".55"/><rect x="44" y="38" width="13" height="36" rx="4" fill="#fff" opacity=".9"/><rect x="64" y="24" width="13" height="50" rx="4" fill="#6fd08a"/><path d="M73 10 l2.4 5.1 5.6 .7 -4.1 3.9 1 5.6 -4.9 -2.7 -4.9 2.7 1 -5.6 -4.1 -3.9 5.6 -.7z" fill="#9be7af"/></svg>';
      return '' +
        '<div class="login-wrap">' +
          '<div class="login-hero"><div class="lh-grid"></div><div class="lh-content">' +
            '<div class="lh-logo">' + badge + '<span>OrçaPRO<b>IA</b></span></div>' +
            '<h2 class="lh-h">Você descreve a obra.<br><em>A IA monta o orçamento.</em></h2>' +
            '<ul class="lh-feats">' +
              '<li>SINAPI, SICRO, SUDECAP e mais — já com BDI (TCU/DNIT)</li>' +
              '<li>Cronograma de Gantt e Excel profissional</li>' +
              '<li>Proposta comercial e anexo para laudo pericial</li>' +
            '</ul>' +
            '<div class="lh-trust">🔒 Roda no seu PC · seus orçamentos ficam salvos no dispositivo</div>' +
          '</div></div>' +
          '<div class="login-formside"><div class="login-card">' +
            '<div class="brand"><div class="lc-logo">' + badge + '<span class="nome">OrçaPRO<span class="ia">IA</span></span></div>' +
            '<div class="slogan">Entre ou crie sua conta para começar.</div></div>' +
            '<div id="login-form">' +
            chips +
            '<div class="field"><label>Empresa / Escritório</label><input id="lg-empresa" placeholder="Ex.: Studio Arq + Eng"></div>' +
            '<div class="field"><label>E-mail ou usuário</label><input id="lg-email" type="text" value="' + String(sugLogin).replace(/"/g, "&quot;") + '" placeholder="voce@empresa.com (ou seu login de usuário)"></div>' +
            '<div class="field"><label>Senha</label><input id="lg-senha" type="password" placeholder="••••••"></div>' +
            '<button class="btn primary" style="width:100%" data-acao="entrar">Entrar / Criar conta</button>' +
            (contas.length
              ? '<p class="muted mt" style="font-size:12px;text-align:center"><a href="#" data-acao="esqueci-senha" style="color:var(--aco)">Esqueci a senha</a> · seus orçamentos ficam salvos neste navegador</p>'
              : '<p class="muted mt" style="font-size:12px;text-align:center">Conta nova é criada automaticamente no 1º acesso (modo demo PRO).</p>') +
            '</div>' +
          '</div></div>' +
        '</div>';
    },

    // ---------- Tela: Lista de orçamentos ----------
    renderLista: function (orcamentos, baseInfo) {
      var html = "";
      // Banner da base SINAPI ativa
      if (baseInfo) {
        var origem = baseInfo.personalizada ? "base própria importada" : "base padrão";
        html += '<div class="card flex between mb" style="padding:12px 16px">' +
          '<div><span class="pill sinapi">SINAPI</span> <b>' + Util.esc(baseInfo.competencia) + ' / ' + Util.esc(baseInfo.uf) + '</b> · ' +
          baseInfo.total.toLocaleString("pt-BR") + ' itens <span class="muted">(' + origem + ')</span></div>' +
          '<div class="flex"><button class="btn sm" data-acao="atualizar">🔄 Atualizar</button> ' +
          '<button class="btn sm" data-acao="importar-sinapi">⬆ Importar base SINAPI</button></div></div>';
      }
      html += '<div class="flex between mb"><h1 style="margin:0">Meus Orçamentos</h1>' +
                 '<div class="flex"><button class="btn" data-acao="importar-planilha" title="Importe uma planilha de orçamento (Excel/CSV) de QUALQUER formato — o agente detecta as etapas e itens e casa o código SINAPI">📊 Importar planilha</button>' +
                 '<button class="btn primary" data-acao="novo">+ Novo Orçamento</button></div></div>';
      if (!orcamentos.length) {
        html += '<div class="vazio card"><h3>Nenhum orçamento ainda</h3>' +
                '<p>Crie seu primeiro orçamento e comece a buscar composições SINAPI.</p>' +
                '<button class="btn primary mt" data-acao="novo">+ Criar primeiro orçamento</button></div>';
        return html;
      }
      html += '<div class="grid-cards">';
      orcamentos.forEach(function (o) {
        var t = Orcamento.totais(o);
        html += '<div class="card orc-card" data-abrir="' + o.id + '">' +
          '<h3>' + Util.esc(o.nome) + '</h3>' +
          '<div class="meta">' + Util.esc(o.numero) + ' · ' + Util.esc(o.cliente.nome || "Sem cliente") + '</div>' +
          '<div class="meta">' + t.qtdEtapas + ' etapas · ' + t.qtdItens + ' itens · BDI ' + Util.fmtPct(t.bdiPercentual) + '</div>' +
          '<div class="valor">' + Util.fmtMoeda(t.precoVenda) + '</div>' +
          '<div class="meta mt">Atualizado ' + Util.fmtData(o.atualizadoEm) + '</div>' +
        '</div>';
      });
      html += '</div>';
      return html;
    },

    // ---------- Tela: Editor de orçamento ----------
    renderEditor: function (orc, abaAtiva) {
      var t = Orcamento.totais(orc);
      var html = '<div class="flex between mb">' +
        '<div><button class="btn ghost sm" data-acao="voltar">← Voltar</button> ' +
        '<span style="font-size:20px;font-weight:800;margin-left:8px">' + Util.esc(orc.nome) + '</span> ' +
        '<span class="muted">' + Util.esc(orc.numero) + '</span></div>' +
        '<div class="flex">' +
          '<button class="btn sm primary" data-acao="escopo">✨ Escopo Inteligente</button>' +
          '<button class="btn sm" data-acao="relatorio">🧾 Relatório completo</button>' +
          '<button class="btn sm success" data-acao="proposta">📄 Gerar Proposta</button>' +
          '<button class="btn sm" data-acao="apresentar" title="Modo apresentação: tela cheia pra reunião com o cliente (setas navegam, Esc sai)">🖥️ Apresentar</button>' +
          '<button class="btn sm" data-acao="laudo">📑 Anexo p/ Laudo</button>' +
          '<button class="btn sm" data-acao="config-orc">⚙ Dados</button>' +
          '<button class="btn sm" data-acao="cenarios">📊 Comparar cenários</button>' +
          '<button class="btn sm" data-acao="exportar-excel">📊 Excel (3 abas)</button>' +
          '<button class="btn sm" data-acao="reimportar-excel" title="Traz de volta as edições de Qtd/Custo feitas no Excel exportado">📥 Reimportar</button>' +
        '</div></div>';

      // KPIs
      html += '<div class="kpis">' +
        kpi("Custo Direto", Util.fmtMoeda(t.custoDireto), "custo") +
        kpi("BDI", Util.fmtPct(t.bdiPercentual) + " (" + Util.fmtMoeda(t.bdiValor) + ")", "") +
        kpi("Preço de Venda", Util.fmtMoeda(t.precoVenda), "destaque") +
        kpi("Itens / Etapas", t.qtdItens + " / " + t.qtdEtapas, "") +
      '</div>';

      // Abas
      var abas = [["planilha", "Planilha"], ["sintetico", "Sintético"], ["cronograma", "🗓 Cronograma"], ["execucao", "🏗️ Execução"], ["paredecebola", "🧱 Parede-Cebola"], ["graficos", "📊 Gráficos"], ["relatorios", "Relatórios"], ["bdi", "BDI & Parâmetros"]];
      html += '<div class="tabs">';
      abas.forEach(function (a) {
        html += '<div class="tab ' + (abaAtiva === a[0] ? "ativa" : "") + '" data-aba="' + a[0] + '">' + a[1] + '</div>';
      });
      html += '</div>';

      html += '<div id="aba-conteudo">';
      if (abaAtiva === "sintetico") html += this.renderSintetico(orc);
      else if (abaAtiva === "cronograma") html += this.renderCronograma(orc);
      else if (abaAtiva === "execucao") html += this.renderExecucao(orc);
      else if (abaAtiva === "paredecebola") html += this.renderParedeCebola(orc);
      else if (abaAtiva === "graficos") html += this.renderGraficos(orc);
      else if (abaAtiva === "relatorios") html += this.renderRelatorios(orc);
      else if (abaAtiva === "bdi") html += this.renderBdi(orc);
      else html += this.renderPlanilha(orc);
      html += '</div>';
      return html;
    },

    // ----- Aba Planilha (analítico editável) -----
    renderPlanilha: function (orc) {
      var html = '<div class="flex between mb"><div></div>' +
        '<button class="btn sm" data-acao="add-etapa">+ Etapa</button></div>';
      if (!orc.etapas.length) {
        html += '<div class="vazio card">Adicione uma <b>etapa</b> (ex.: Serviços Preliminares) e depois itens da SINAPI.</div>';
        return html;
      }
      html += '<table class="tbl"><thead><tr>' +
        '<th>Código</th><th>Descrição</th><th>Unid</th>' +
        '<th class="num">Qtd</th><th class="num">Custo Unit</th><th class="num">Custo Total</th>' +
        '<th class="num">Preço Venda</th><th></th></tr></thead><tbody>';

      var pct = orc.bdi ? orc.bdi.percentual : 0;
      orc.etapas.forEach(function (e) {
        var custoEtapa = 0;
        e.itens.forEach(function (it) { custoEtapa += Util.num(it.quantidade) * Util.num(it.custoUnitario); });
        html += '<tr class="etapa-row"><td>' + Util.esc(e.codigo) + '</td>' +
          '<td colspan="4">' + Util.esc(e.nome) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(custoEtapa) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(Bdi.aplicar(custoEtapa, pct)) + '</td>' +
          '<td class="right"><div class="acoes"><button class="btn sm" data-add-item="' + e.id + '">+ Item</button>' +
          '<button class="btn sm ico" data-edit-etapa="' + e.id + '" title="Renomear etapa">✎</button>' +
          '<button class="btn sm ico danger" data-del-etapa="' + e.id + '" title="Remover etapa">✕</button></div></td></tr>';

        e.itens.forEach(function (it) {
          var custo = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          var fonte = it.baseFonte || (it.origem === "SINAPI" ? "SINAPI" : "PROPRIO");
          var ehSinapi = it.origem === "SINAPI" && (!it.baseFonte || it.baseFonte === "SINAPI");
          var pillCls = fonte === "SINAPI" ? "sinapi" : (fonte === "PROPRIO" ? "proprio" : String(fonte).toLowerCase());
          html += '<tr>' +
            '<td><span class="pill ' + pillCls + '">' + Util.esc(it.codigo) + '</span>' + (fonte !== "SINAPI" && fonte !== "PROPRIO" ? ' <span class="muted" style="font-size:9px">' + Util.esc(fonte) + '</span>' : '') + '</td>' +
            '<td>' + Util.esc(it.descricao) + '</td>' +
            '<td>' + Util.esc(it.unidade) + '</td>' +
            '<td class="num"><input class="cell" data-edit="quantidade" data-eta="' + e.id + '" data-itm="' + it.id + '" value="' + Util.fmtNum(it.quantidade, 2) + '"></td>' +
            '<td class="num"><input class="cell" data-edit="custoUnitario" data-eta="' + e.id + '" data-itm="' + it.id + '" value="' + Util.fmtNum(it.custoUnitario, 2) + '"></td>' +
            '<td class="num">' + Util.fmtMoeda(custo) + '</td>' +
            '<td class="num">' + Util.fmtMoeda(Bdi.aplicar(custo, pct)) + '</td>' +
            '<td class="right"><div class="acoes">' +
              (ehSinapi ? '<button class="btn sm" data-ver-insumos="' + Util.esc(it.codigo) + '" title="Ver os insumos que compõem esta composição">🔍 Insumos</button>' : '') +
              '<button class="btn sm ico' + (it.memoriaCalculo ? ' primary' : '') + '" data-memoria="' + e.id + '|' + it.id + '" title="Memória de cálculo do quantitativo (Lei 14.133) — sai na aba Memória do Excel">📝</button>' +
              '<button class="btn sm ico danger" data-del-item="' + e.id + '|' + it.id + '" title="Remover item">✕</button></div></td></tr>';
        });
      });
      html += '</tbody></table>';
      return html;
    },

    // ----- Modal: composição explodida em insumos (base analítica SINAPI) -----
    renderInsumos: function (a, ufAtivo) {
      var catLabel = { MO: "Mão de obra", MAT: "Material", EQ: "Equipamento" };
      function box(rotulo, valor, classe) {
        return '<div class="kpi"><div class="rotulo">' + rotulo + '</div>' +
          '<div class="num' + (classe ? " " + classe : "") + '">' + Util.fmtMoeda(valor) + '</div></div>';
      }
      var anaUf = (typeof Analitico !== "undefined") ? Analitico.uf : null;
      var aviso = (ufAtivo && anaUf && ufAtivo !== anaUf)
        ? '<div class="muted mb" style="color:#f59e0b;font-size:12px">⚠ Analítico de referência da UF <b>' + Util.esc(anaUf) + '</b> (a base ativa é <b>' + Util.esc(ufAtivo) + '</b>). Coeficientes são nacionais; os preços exibidos aqui são da UF de referência.</div>'
        : '';
      var html = aviso + '<div class="muted mb"><b>' + Util.esc(a.codigo) + '</b> · ' + Util.esc(a.unidade) +
        (a.grupo ? ' · ' + Util.esc(a.grupo) : '') + '<br>' + Util.esc(a.descricao) + '</div>';
      html += '<div class="kpis">' +
        box("Mão de obra", a.custoMO) + box("Material", a.custoMAT) +
        box("Equipamento", a.custoEQ) + box("Custo Unit.", a.custoUnitario, "destaque") + '</div>';
      html += '<table class="tbl"><thead><tr><th>Tipo</th><th>Código</th><th>Insumo</th><th>Und</th>' +
        '<th class="num">Coef.</th><th class="num">Custo Unit</th><th class="num">Custo Total</th><th>Categoria</th></tr></thead><tbody>';
      Util.arr(a.insumos).forEach(function (it) {
        html += '<tr><td>' + (it.tipo === "COMPOSICAO" ? "Sub-comp." : "Insumo") + '</td>' +
          '<td>' + Util.esc(it.codigo) + '</td>' +
          '<td>' + Util.esc(it.descricao) + '</td>' +
          '<td>' + Util.esc(it.unidade) + '</td>' +
          '<td class="num">' + Util.fmtNum(it.coeficiente, 4) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(it.custoUnitario) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(it.custoTotal) + '</td>' +
          '<td><span class="pill ' + (it.categoria === "MAT" ? "sinapi" : "proprio") + '">' + (catLabel[it.categoria] || it.categoria) + '</span></td></tr>';
      });
      html += '</tbody></table>';
      html += '<p class="muted mt" style="font-size:12px">Base analítica SINAPI ' +
        (typeof Analitico !== "undefined" ? (Analitico.competencia || "") + " / " + (Analitico.uf || "") : "") +
        ' — composição → insumos com coeficientes. O orçamento usa o preço da sua competência; aqui é a referência da composição.</p>';
      return html;
    },

    // ----- Aba Sintético -----
    renderSintetico: function (orc) {
      var lin = Orcamento.sintetico(orc);
      if (!lin.length) return '<div class="vazio card">Sem etapas para resumir.</div>';
      var html = '<table class="tbl"><thead><tr><th>Cód</th><th>Etapa</th>' +
        '<th class="num">Itens</th><th class="num">Custo Direto</th><th class="num">Preço Venda</th><th class="num">Peso %</th></tr></thead><tbody>';
      lin.forEach(function (l) {
        html += '<tr><td>' + Util.esc(l.codigo) + '</td><td>' + Util.esc(l.nome) + '</td>' +
          '<td class="num">' + l.qtdItens + '</td>' +
          '<td class="num">' + Util.fmtMoeda(l.custoDireto) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(l.precoVenda) + '</td>' +
          '<td class="num">' + Util.fmtPct(l.peso, 1) + '</td></tr>';
      });
      var t = Orcamento.totais(orc);
      html += '</tbody><tfoot><tr class="etapa-row"><td colspan="3">TOTAL GERAL</td>' +
        '<td class="num">' + Util.fmtMoeda(t.custoDireto) + '</td>' +
        '<td class="num">' + Util.fmtMoeda(t.precoVenda) + '</td><td class="num">100%</td></tr></tfoot></table>';
      return html;
    },

    // ----- Aba Cronograma (Gantt parametrizado pelo agente) -----
    renderCronograma: function (orc) {
      if (typeof Cronograma === "undefined") return '<div class="vazio card">Módulo de cronograma indisponível.</div>';
      if (!(orc.etapas || []).length) return '<div class="vazio card">Adicione etapas e itens para o agente montar o cronograma.</div>';
      var r = Cronograma.estimar(orc), p = r.params;
      var iaM = (orc.cronograma && orc.cronograma.iaMotivos) || {};
      function ini() { try { return r.dataInicio.toISOString().slice(0, 10); } catch (e) { return ""; } }
      function opt(v, txt, sel) { return '<option value="' + v + '"' + (String(sel) === String(v) ? " selected" : "") + '>' + txt + '</option>'; }
      var html = '<div class="card" style="margin-bottom:12px"><div class="flex" style="flex-wrap:wrap;gap:12px;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label>Início</label><input id="cron-inicio" type="date" value="' + ini() + '"></div>' +
        '<div class="field" style="margin:0"><label>Equipes/frentes</label><input id="cron-equipes" type="number" min="1" value="' + p.equipes + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label>Dias úteis/sem.</label><input id="cron-dias" type="number" min="1" max="7" value="' + p.diasUteisSemana + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label>Paralelismo</label><select id="cron-paral">' + opt(0, "Nenhum", p.paralelismo) + opt(0.15, "Leve 15%", p.paralelismo) + opt(0.3, "Médio 30%", p.paralelismo) + opt(0.5, "Alto 50%", p.paralelismo) + '</select></div>' +
        '<div class="field" style="margin:0"><label>R$/dia-equipe</label><input id="cron-custodia" type="number" value="' + p.custoDiaEquipe + '" style="width:100px"></div>' +
        '<button class="btn sm primary" data-acao="cron-recalc">↻ Recalcular</button>' +
        '<button class="btn sm" data-acao="cron-reset">Limpar edições</button>' +
        '<button class="btn sm" data-acao="cron-ia" title="Refina as durações com a IA do ERP (planejador)">🤖 Refinar com IA</button>' +
        '</div></div>';
      html += '<div class="flex" style="gap:18px;margin-bottom:8px;align-items:baseline"><b style="font-size:16px">⏱ ' + r.totalDias + ' dias úteis (~' + r.totalSemanas + ' semanas)</b>' +
        '<span class="muted">' + r.dataInicio.toLocaleDateString("pt-BR") + ' → ' + r.dataFim.toLocaleDateString("pt-BR") + '</span>' +
        '<span class="muted" style="font-size:12px">🧠 estimado pelo agente · edite a duração na tabela</span></div>';
      html += this._gantt(r);
      html += '<table class="tbl" style="margin-top:12px"><thead><tr><th>Etapa</th><th>Categoria (agente)</th><th class="num">Eq-dias</th><th class="num">Duração (d)</th><th>Início</th><th>Fim</th></tr></thead><tbody>';
      r.etapas.forEach(function (e) {
        var c = Cronograma.cat(e.categoria);
        html += '<tr><td>' + Util.esc(e.codigo) + ' ' + Util.esc(e.nome) + '</td>' +
          '<td><span class="pill" style="background:' + c.cor + '22;color:' + c.cor + '">' + Util.esc(c.nome) + '</span></td>' +
          '<td class="num">' + e.equipeDias + '</td>' +
          '<td class="num"><input class="cell" type="number" min="1" data-cron-dur="' + e.id + '" value="' + e.duracao + '" style="width:60px;text-align:right' + (e.editado ? ';border-color:var(--azul,#2563eb)' : '') + '">' + (iaM[e.id] ? ' <span title="🤖 IA: ' + Util.esc(iaM[e.id]) + '" style="cursor:help">🤖</span>' : '') + '</td>' +
          '<td>' + e.dataInicio.toLocaleDateString("pt-BR") + '</td><td>' + e.dataFim.toLocaleDateString("pt-BR") + '</td></tr>';
      });
      html += '</tbody></table>';
      return html;
    },

    // ----- Aba Execução (agente de canteiro: equipe/prazo/custo × orçamento) -----
    renderExecucao: function (orc) {
      if (typeof Execucao === "undefined") return '<div class="vazio card">Agente de execução indisponível.</div>';
      if (!(orc.etapas || []).length) return '<div class="vazio card">Adicione etapas e itens para o agente dimensionar equipe, prazo e custo.</div>';
      // RBAC: só usa as diárias REAIS do RH se o usuário tem o módulo 'colaboradores'
      // (senão vazaria salário via a aba de orçamento). Sem acesso -> cai no fallback SINAPI.
      var podeRH = (typeof Auth === "undefined" || !Auth.podeModulo) ? true : Auth.podeModulo("colaboradores");
      var colab = [];
      if (podeRH) { try { colab = Store.listar(Auth.empresaId(), "colaboradores") || []; } catch (e) {} }
      var sim = Execucao.simular(orc, { colaboradores: colab });
      var p = sim.params;
      function d10(v) { try { var x = new Date(v); return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); } catch (e) { return ""; } }
      function moeda(v) { return Util.fmtMoeda(Math.round(v || 0)); }
      function curto(prof) { var w = String(prof).split(" ")[0].toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); }
      var COR = { dentro: "#16a34a", acima: "#dc2626", abaixo: "#2563eb", "sem-base": "#64748b" };
      var ROT = { dentro: "DENTRO DO ORÇADO", acima: "ACIMA DO ORÇADO", abaixo: "ABAIXO DO ORÇADO", "sem-base": "SEM BASE P/ RECONCILIAR" };
      var cor = COR[sim.status] || "#64748b";

      // form de parâmetros
      var html = '<div class="card" style="margin-bottom:12px"><div class="flex" style="flex-wrap:wrap;gap:12px;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label>Início da obra</label><input id="exec-inicio" type="date" value="' + d10(sim.dataInicio) + '"></div>' +
        '<div class="field" style="margin:0"><label>Entrega desejada</label><input id="exec-entrega" type="date" value="' + (p.dataEntrega || "") + '"></div>' +
        '<div class="field" style="margin:0"><label>Jornada (h/dia)</label><input id="exec-jornada" type="number" min="1" max="12" value="' + p.jornadaH + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label>Dias úteis/sem.</label><input id="exec-dias" type="number" min="1" max="7" value="' + p.diasUteisSemana + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label title="Onera a diária de colaboradores CLT p/ comparar com o SINAPI (que já vem onerado). Diarista/autônomo/PJ entram cheios.">Encargos CLT (%)</label><input id="exec-encargos" type="number" min="0" max="150" value="' + (p.encargosPct || 0) + '" style="width:90px"></div>' +
        '<button class="btn sm primary" data-acao="exec-recalc">↻ Recalcular</button>' +
        '<button class="btn sm" data-acao="exec-cronograma" title="Usar estas durações no Cronograma">🗓 Enviar ao cronograma</button>' +
        '</div>' +
        '<div class="muted" style="font-size:11px;margin-top:8px">Produtividade = coeficientes de mão-de-obra do SINAPI (horas-homem). Custo/dia = diária dos seus colaboradores (RH); onde não há colaborador da profissão, usa a <b>referência SINAPI</b>.' +
        (colab.length ? '' : ' <b>Cadastre colaboradores em RH</b> para usar suas diárias reais — por ora tudo está na referência SINAPI.') + '</div></div>';

      var semBase = sim.semBaseMO;

      // headline + semáforo (sem prazo/equipe FANTASMA quando a base não tem MO)
      html += '<div class="flex" style="gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px">';
      if (semBase) {
        html += '<b style="font-size:16px;color:#b45309">⏱ prazo/equipe não estimáveis</b>';
      } else {
        var parcial = sim.nEtapasSemBase > 0; // prazo cobre só as etapas estimáveis; as estaduais ficam de fora
        html += '<b style="font-size:16px">⏱ ' + sim.prazoDias + ' dias úteis (~' + sim.prazoSemanas + ' semanas)' + (parcial ? ' <span style="color:#b45309">*parcial</span>' : '') + '</b>' +
          (sim.dataFim ? '<span class="muted">' + sim.dataInicio.toLocaleDateString("pt-BR") + ' → ' + sim.dataFim.toLocaleDateString("pt-BR") + (parcial ? ' (só etapas estimáveis)' : '') + '</span>' : '') +
          (sim.metaAtingida === false ? '<span class="pill" style="background:#dc262622;color:#dc2626;font-weight:700">⚠ não bate a entrega pedida</span>' : '') +
          (parcial ? '<span class="pill" style="background:#f59e0b22;color:#b45309;font-weight:700">⚠ prazo parcial — ' + sim.nEtapasSemBase + ' etapa(s) sem base de MO fora da conta</span>' : '');
      }
      html += '<span class="pill" style="background:' + cor + '22;color:' + cor + ';font-weight:700">' + (ROT[sim.status] || sim.status) + (sim.reconConfiavel ? ' · ' + (sim.desvioPct >= 0 ? "+" : "") + sim.desvioPct.toFixed(1) + '%' : '') + '</span>';
      if (!semBase) html += '<span class="muted" style="font-size:12px' + (sim.coberturaBaixa ? ';color:#b45309;font-weight:600' : '') + '">🧠 ' + sim.cobertura.pct + '% dos itens (com qtd) têm produtividade SINAPI' + (sim.coberturaBaixa ? ' — reconciliação parcial' : '') + '</span>';
      html += '</div>';

      // aviso forte quando é 100% base estadual/própria sem custo de MO
      if (semBase) {
        html += '<div class="card" style="margin-bottom:12px;border-left:4px solid #b45309;background:#f59e0b0d"><b style="color:#b45309">⚠ Orçamento de base estadual/própria sem custo de mão-de-obra.</b><div class="muted" style="font-size:12px;margin-top:4px">O agente precisa de composições SINAPI (horas-homem) — ou da produtividade informada — para dimensionar equipe, prazo e custo. Os números abaixo NÃO são uma estimativa de obra.</div></div>';
      } else {
        // reconciliação — SÓ sobre a porção com DIÁRIA REAL (real × orçado-SINAPI da mesma profissão)
        html += '<div class="card" style="margin-bottom:12px;border-left:4px solid ' + cor + '">';
        if (sim.reconConfiavel) {
          html += '<div class="flex" style="gap:24px;flex-wrap:wrap;align-items:baseline">' +
            '<div><div class="muted" style="font-size:12px" title="MO orçada (SINAPI) das profissões que têm diária cadastrada no RH">MO orçada (porção reconciliável)</div><b style="font-size:18px">' + moeda(sim.orcadoMOReal) + '</b></div>' +
            '<div style="font-size:20px;color:var(--aco,#64748b)">→</div>' +
            '<div><div class="muted" style="font-size:12px">MO simulada (diárias reais do RH)</div><b style="font-size:18px;color:' + cor + '">' + moeda(sim.custoMOReal) + '</b></div>' +
            '<div><div class="muted" style="font-size:12px">Diferença</div><b style="font-size:16px;color:' + cor + '">' + (sim.desvio >= 0 ? "+" : "") + moeda(sim.desvio) + ' (' + (sim.desvioPct >= 0 ? "+" : "") + sim.desvioPct.toFixed(1) + '%)</b></div>' +
            '</div>' +
            (sim.coberturaBaixa ? '<div class="pill" style="display:inline-block;margin-top:8px;background:#f59e0b22;color:#b45309;font-weight:600;font-size:11px">⚠ Cobre só ' + Math.round(sim.reconCobPct) + '% do custo de MO-SINAPI — só as profissões com diária real cadastrada</div>' : '');
        } else {
          html += '<div style="font-size:13px">' + (sim.orcadoMOExato > 0 ? 'Há itens SINAPI, mas nenhuma <b>diária real</b> no RH que case as profissões — comparar SINAPI × SINAPI daria sempre 0%. Cadastre sua equipe em RH para reconciliar custo real × orçado.' : 'Nenhum item com composição SINAPI para reconciliar o custo de MO — a base é própria/estadual.') + '</div>';
        }
        html += '<div class="muted" style="font-size:11px;margin-top:8px">Custo total de MO simulado (obra inteira): <b>' + moeda(sim.custoMOSimulado) + '</b> · MO total orçada: ' + moeda(sim.orcadoMO) + (sim.orcadoMOExato ? ' · com produtividade SINAPI: ' + moeda(sim.orcadoMOExato) : '') + '.</div>';
        html += '</div>';
      }

      // observações do agente (sempre)
      html += '<div class="card" style="margin-bottom:12px"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">';
      sim.sugestoes.forEach(function (s) { html += '<li>' + Util.esc(s) + '</li>'; });
      html += '</ul></div>';

      // equipe de pico
      var picoKeys = Object.keys(sim.equipePico);
      if (picoKeys.length) {
        html += '<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 8px;font-size:14px">👷 Equipe de pico (máximo simultâneo no canteiro)</h3><div class="flex" style="gap:8px;flex-wrap:wrap">';
        picoKeys.sort(function (a, b) { return sim.equipePico[b] - sim.equipePico[a]; }).forEach(function (pf) {
          var estim = pf.indexOf("estimada") >= 0;
          var lbl = estim ? (sim.equipePico[pf] + '× equipe geral (est.)') : (sim.equipePico[pf] + '× ' + curto(pf));
          var bg = estim ? '#f59e0b18' : '#0f274012', bd = estim ? '#f59e0b55' : 'var(--linha,#e2e8f0)';
          html += '<span class="pill" title="' + (estim ? 'itens sem código SINAPI — equipe geral estimada pela MO do orçamento' : Util.esc(pf)) + '" style="background:' + bg + ';border:1px solid ' + bd + ';font-weight:600">' + Util.esc(lbl) + '</span>';
        });
        html += '</div></div>';
      }

      // tabela por etapa
      html += '<table class="tbl"><thead><tr><th>Etapa</th><th class="num">Duração</th><th>Equipe por profissão</th><th class="num">Custo MO</th></tr></thead><tbody>';
      sim.etapas.forEach(function (et) {
        if (!et.temBaseMO) {
          html += '<tr><td><b>' + Util.esc(et.nome) + '</b></td><td class="num muted">—</td>' +
            '<td><span class="pill" style="background:#f59e0b22;color:#b45309;font-size:11px" title="base estadual/própria sem custo de MO — sem coeficiente p/ dimensionar equipe/prazo">não estimável (base sem MO)</span></td>' +
            '<td class="num muted">—</td></tr>';
          return;
        }
        var chips = Object.keys(et.prof).map(function (pf) {
          var s = et.prof[pf], ref = s.fonteCusto !== "real";
          return '<span class="pill" title="' + Util.esc(pf) + ' · R$' + Math.round(s.custoDia) + '/dia ' + (ref ? '(ref. SINAPI)' : '(diária real)') + '" style="background:' + (ref ? '#94a3b822' : '#16a34a1a') + ';color:' + (ref ? '#64748b' : '#16a34a') + ';font-size:11px">' + s.equipe + '× ' + Util.esc(curto(pf)) + '</span>';
        }).join(" ");
        if (et.homensDiaEstim > 0) chips += ' <span class="pill" style="background:#f59e0b22;color:#b45309;font-size:11px" title="itens sem código SINAPI mas com custoMO — equipe/produtividade estimada pela MO do orçamento">~' + (et.equipeEstim || 1) + '× equipe geral (est.)</span>';
        html += '<tr><td><b>' + Util.esc(et.nome) + '</b>' + (et.dataInicio ? '<br><span class="muted" style="font-size:11px">' + et.dataInicio.toLocaleDateString("pt-BR") + ' → ' + et.dataFim.toLocaleDateString("pt-BR") + '</span>' : '') + '</td>' +
          '<td class="num">' + et.duracao + ' d</td>' +
          '<td>' + (chips || '<span class="muted">—</span>') + '</td>' +
          '<td class="num">' + moeda(et.custoMO) + '</td></tr>';
      });
      html += '<tr style="font-weight:700;border-top:2px solid var(--linha,#e2e8f0)"><td>Total</td><td class="num">' + (semBase ? '—' : sim.prazoDias + ' d') + '</td><td></td><td class="num">' + moeda(sim.custoMOSimulado) + '</td></tr>';
      html += '</tbody></table>';
      html += '<div class="muted" style="font-size:11px;margin-top:8px">O custo de MO é pelo conteúdo de trabalho (equipe eficientemente dimensionada). A hora do SINAPI já vem <b>com encargos sociais/complementares</b>; por isso, ao comparar, as diárias de CLT são oneradas em ' + (p.encargosPct || 0) + '% (campo acima — mesmo % da Folha de pagamento) e as de diarista/autônomo/PJ entram cheias. A reconciliação vale <b>só sobre as profissões com diária real cadastrada no RH</b> — se a cobertura for baixa, o veredito é parcial. Itens de base estadual sem custo de MO aparecem como “não estimável”.</div>';
      return html;
    },

    renderParedeCebola: function (orc) {
      if (typeof ParedeCebola === "undefined") return '<div class="vazio card">Parede-Cebola indisponível.</div>';
      // preview TRANSIENTE (não polui o orçamento salvo/sincronizado): vive em App._pcPreview
      var pc = (typeof App !== "undefined" && App._pcPreview && App._pcPreview.orcId === orc.id) ? App._pcPreview : {};
      var esc = Util.esc, inp = pc.inputs || {};
      var receitas = ParedeCebola.receitas();
      function selReceita() {
        return receitas.map(function (r) { return '<option value="' + r.id + '"' + (inp.receita === r.id ? " selected" : "") + '>' + esc(r.rotulo) + '</option>'; }).join("");
      }
      var html = '<div class="card" style="margin-bottom:12px">' +
        '<h3 style="margin:0 0 4px;font-size:15px">🧱 Parede-Cebola — do 2D à obra real</h3>' +
        '<p class="muted" style="font-size:12px;margin:0 0 10px">Uma parede é UMA linha, mas na obra ela é um empilhamento: bloco → chapisco → reboco → massa → pintura. Informe a parede e o sistema explode nas camadas de serviço, casando cada uma num <b>código SINAPI real</b> (nunca inventa — sem match vira “pendente”). Você revisa e joga no orçamento.</p>' +
        '<div class="flex" style="flex-wrap:wrap;gap:10px;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label>Nome</label><input id="pc-nome" value="' + esc(inp.nome || "") + '" placeholder="Parede sala" style="width:150px"></div>' +
        '<div class="field" style="margin:0"><label>Área (m²)</label><input id="pc-area" type="number" min="0" step="0.01" value="' + (inp.area != null ? inp.area : "") + '" placeholder="ou C×A →" style="width:100px"></div>' +
        '<div class="field" style="margin:0"><label>Comprim. (m)</label><input id="pc-comp" type="number" min="0" step="0.01" value="' + (inp.comprimento != null ? inp.comprimento : "") + '" style="width:90px"></div>' +
        '<div class="field" style="margin:0"><label>Altura (m)</label><input id="pc-alt" type="number" min="0" step="0.01" value="' + (inp.altura != null ? inp.altura : "") + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label title="Portas/janelas em m² a abater">Vãos (m²)</label><input id="pc-vaos" type="number" min="0" step="0.01" value="' + (inp.descontos != null ? inp.descontos : "") + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label>Faces</label><select id="pc-faces"><option value="2"' + (inp.faces == 1 ? "" : " selected") + '>2 faces</option><option value="1"' + (inp.faces == 1 ? " selected" : "") + '>1 face</option></select></div>' +
        '<div class="field" style="margin:0"><label>Receita (tipo de parede)</label><select id="pc-receita">' + selReceita() + '</select></div>' +
        '<div class="field" style="margin:0"><label style="white-space:nowrap"><input id="pc-alv" type="checkbox"' + (inp.incluiAlvenaria === false ? "" : " checked") + '> incluir alvenaria</label></div>' +
        '<button class="btn sm primary" data-acao="parede-explodir">🧅 Explodir em camadas</button>' +
        '</div></div>';

      if (pc.resultado) {
        var r = pc.resultado, badge = { ok: ["#16a34a", "casou"], revisar: ["#b45309", "revisar unidade"], pendente: ["#dc2626", "sem código"] };
        html += '<div class="card" style="margin-bottom:12px"><div class="flex" style="gap:18px;flex-wrap:wrap;align-items:baseline">' +
          '<b style="font-size:15px">🧅 ' + esc(r.parede.nome) + '</b>' +
          '<span class="muted" style="font-size:12px">' + r.parede.areaLiquida + ' m² líquidos' + (r.parede.descontos ? ' (' + r.parede.areaBruta + ' − ' + r.parede.descontos + ' de vãos)' : '') + ' · ' + r.parede.faces + ' face(s) · ' + esc(r.receita.rotulo) + '</span>' +
          '<span class="pill" style="background:#16a34a22;color:#16a34a;font-weight:700">' + r.nOk + ' casaram</span>' +
          (r.nRevisar ? '<span class="pill" style="background:#f59e0b22;color:#b45309;font-weight:700">' + r.nRevisar + ' p/ revisar</span>' : '') +
          (r.nPendentes ? '<span class="pill" style="background:#dc262622;color:#dc2626;font-weight:700">' + r.nPendentes + ' sem código</span>' : '') +
          '</div>';
        html += '<table class="tbl" style="margin-top:10px;font-size:13px"><thead><tr><th>#</th><th>Camada</th><th style="text-align:right">Qtd</th><th>Un</th><th>Código SINAPI casado</th><th>Confiança</th><th></th></tr></thead><tbody>';
        r.camadas.forEach(function (c) {
          var cand = (c.escolhido >= 0 && c.candidatos[c.escolhido]) ? c.candidatos[c.escolhido] : null;
          var b = badge[c.status] || badge.pendente;
          var codCel;
          if (c.candidatos && c.candidatos.length) {
            codCel = '<select data-pc-cand="' + c.seq + '" style="max-width:340px">' + c.candidatos.map(function (k, i) {
              return '<option value="' + i + '"' + (i === c.escolhido ? " selected" : "") + '>' + esc((k.item.codigo || "—") + " · " + (k.item.descricao || "").slice(0, 60)) + " [" + (k.item.unidade || "?") + "]</option>";
            }).join("") + '</select>' + (c.unidadeDivergente ? ' <span class="muted" style="color:#b45309;font-size:11px">⚠ unidade ' + esc(cand ? cand.item.unidade : "") + ' ≠ ' + c.unidade + '</span>' : "");
          } else {
            codCel = '<span class="muted" style="color:#dc2626">nenhum código casou — ajuste o termo ou lance manualmente</span>';
          }
          html += '<tr><td>' + c.seq + '</td><td>' + esc(c.camada) + (c.base ? ' <span class="muted" style="font-size:10px">(núcleo)</span>' : '') + '</td>' +
            '<td style="text-align:right">' + c.quantidade + '</td><td>' + c.unidade + '</td>' +
            '<td>' + codCel + '</td>' +
            '<td>' + (cand ? Math.round(c.confianca) + '%' : '—') + '</td>' +
            '<td><span class="pill" style="background:' + b[0] + '22;color:' + b[0] + ';font-size:11px;font-weight:700">' + b[1] + '</span></td></tr>';
        });
        html += '</tbody></table>';
        var etapas = (orc.etapas || []);
        var selEt = '<select id="pc-etapa"><option value="__nova__">➕ Nova etapa: Parede — ' + esc(r.parede.nome) + '</option>' +
          etapas.map(function (e) { return '<option value="' + e.id + '">' + esc((e.codigo ? e.codigo + " " : "") + e.nome) + '</option>'; }).join("") + '</select>';
        var aplicaveis = r.nOk + (r.nRevisar ? 0 : 0);
        html += '<div class="flex" style="gap:10px;align-items:flex-end;margin-top:12px;flex-wrap:wrap">' +
          '<div class="field" style="margin:0"><label>Adicionar em</label>' + selEt + '</div>' +
          '<button class="btn sm primary" data-acao="parede-aplicar" title="Só as camadas com código casado (OK) entram. Pendentes e as de unidade divergente ficam de fora.">➕ Adicionar ' + r.nOk + ' camada(s) ao orçamento</button>' +
          (r.nRevisar || r.nPendentes ? '<span class="muted" style="font-size:11px">' + (r.nRevisar ? r.nRevisar + ' de unidade divergente' : "") + (r.nRevisar && r.nPendentes ? " e " : "") + (r.nPendentes ? r.nPendentes + ' sem código' : "") + ' NÃO entram — resolva antes.</span>' : "") +
          '</div>';
        html += '<div class="muted" style="font-size:11px;margin-top:8px">Cada camada vira um <b>item normal do orçamento</b> (código SINAPI + qtd) — então o Agente de Execução (aba 🏗️) dimensiona equipe, prazo e custo dessas camadas automaticamente.</div>';
        html += '</div>';
      }
      return html;
    },

    _gantt: function (r) {
      var dias = r.totalDias || 1, W = 880, labelW = 184, rowH = 30, top = 22;
      var plotW = W - labelW - 14, h = top + r.etapas.length * rowH + 12, dpw = r.params.diasUteisSemana || 5;
      var svg = '<svg viewBox="0 0 ' + W + ' ' + h + '" style="width:100%;max-width:100%;background:var(--card,#fff);border:1px solid var(--linha,#e2e8f0);border-radius:8px;font-family:inherit">';
      for (var s = 0; s <= r.totalSemanas; s++) {
        var gx = labelW + Math.min(1, (s * dpw) / dias) * plotW;
        svg += '<line x1="' + gx.toFixed(1) + '" y1="' + top + '" x2="' + gx.toFixed(1) + '" y2="' + (h - 8) + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (s < r.totalSemanas) svg += '<text x="' + (gx + 3).toFixed(1) + '" y="' + (top - 7) + '" font-size="9" fill="#94a3b8">S' + (s + 1) + '</text>';
      }
      r.etapas.forEach(function (e, i) {
        var y = top + i * rowH + 5, x = labelW + (e.inicio / dias) * plotW, w = Math.max(4, ((e.fim - e.inicio) / dias) * plotW);
        var cor = Cronograma.cat(e.categoria).cor;
        svg += '<text x="6" y="' + (y + 13) + '" font-size="10" fill="#475569">' + Util.esc((e.codigo + " " + e.nome).slice(0, 30)) + '</text>';
        svg += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="18" rx="3" fill="' + cor + '" opacity="0.92"><title>' + Util.esc(e.nome) + ' — ' + e.duracao + ' dias</title></rect>';
        svg += '<text x="' + (x + w + 4).toFixed(1) + '" y="' + (y + 13) + '" font-size="9" fill="#64748b">' + e.duracao + 'd</text>';
      });
      return svg + '</svg>';
    },

    // ----- Aba Gráficos -----
    renderGraficos: function (orc) {
      if (!(orc.etapas || []).length) return '<div class="vazio card">Adicione etapas e itens para ver os gráficos.</div>';
      var sint = Orcamento.sintetico(orc);
      var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
      html += '<div class="card"><h3 style="margin:0 0 8px">Custo por etapa</h3>' + this._barH(sint.map(function (s) { return { rotulo: s.codigo + " " + s.nome, valor: s.custoDireto }; })) + '</div>';
      html += '<div class="card"><h3 style="margin:0 0 8px">Curva ABC (Pareto)</h3>' + this._pareto(sint) + '</div>';
      var mme = this._mmeOrc(orc);
      if (mme.total > 0) html += '<div class="card"><h3 style="margin:0 0 8px">Composição (MO/MAT/EQ)</h3>' + this._donut([{ rotulo: "Mão de obra", valor: mme.mo, cor: "#2563eb" }, { rotulo: "Material", valor: mme.mat, cor: "#16a34a" }, { rotulo: "Equipamento", valor: mme.eq, cor: "#f59e0b" }]) + '</div>';
      if (typeof Cronograma !== "undefined") {
        var r = Cronograma.estimar(orc), porCat = {};
        r.etapas.forEach(function (e) { porCat[e.categoria] = (porCat[e.categoria] || 0) + e.duracao; });
        var dd = Object.keys(porCat).map(function (k) { return { rotulo: Cronograma.cat(k).nome, valor: porCat[k], cor: Cronograma.cat(k).cor }; });
        html += '<div class="card"><h3 style="margin:0 0 8px">Prazo por categoria (dias)</h3>' + this._barH(dd) + '</div>';
      }
      html += '<div class="card" style="grid-column:1/-1"><h3 style="margin:0 0 8px">Curva S — avanço físico-financeiro acumulado</h3>' + this._curvaS(orc) + '</div>';
      return html + '</div>';
    },

    _curvaS: function (orc) {
      if (typeof Cronograma === "undefined") return '<div class="muted">—</div>';
      var r = Cronograma.estimar(orc), nSem = r.totalSemanas, dpw = r.params.diasUteisSemana || 5;
      var custoSem = [], totalCusto = 0, w;
      for (w = 0; w < nSem; w++) custoSem[w] = 0;
      r.etapas.forEach(function (e) {
        totalCusto += e.custo;
        var s0 = e.inicio / dpw, s1 = e.fim / dpw, dur = Math.max(0.01, s1 - s0);
        for (var ww = 0; ww < nSem; ww++) { var ov = Math.max(0, Math.min(ww + 1, s1) - Math.max(ww, s0)); if (ov > 0) custoSem[ww] += e.custo * (ov / dur); }
      });
      var acc = 0, pts = [], totV = totalCusto || 1;
      for (w = 0; w < nSem; w++) { acc += custoSem[w]; pts.push(acc / totV * 100); }
      var W = 640, H = 200, padL = 34, padB = 22, padT = 10, padR = 12, plotW = W - padL - padR, plotH = H - padB - padT;
      var X = function (i) { return padL + (nSem <= 1 ? plotW : (i / (nSem - 1)) * plotW); };
      var Y = function (v) { return padT + (1 - v / 100) * plotH; };
      var grid = "";
      [0, 25, 50, 75, 100].forEach(function (g) { var yy = Y(g); grid += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#e2e8f0"/><text x="2" y="' + (yy + 3).toFixed(1) + '" font-size="9" fill="#94a3b8">' + g + '%</text>'; });
      var area = "M" + X(0).toFixed(1) + "," + Y(0).toFixed(1) + " " + pts.map(function (v, i) { return "L" + X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ") + " L" + X(nSem - 1).toFixed(1) + "," + Y(0).toFixed(1) + " Z";
      var line = pts.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ");
      var dots = pts.map(function (v, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.5" fill="#2563eb"><title>Semana ' + (i + 1) + ': ' + v.toFixed(1) + '% acumulado</title></circle>'; }).join("");
      var xlab = "", step = Math.max(1, Math.ceil(nSem / 10));
      for (var i3 = 0; i3 < nSem; i3 += step) xlab += '<text x="' + X(i3).toFixed(1) + '" y="' + (H - 6) + '" font-size="8" fill="#94a3b8">S' + (i3 + 1) + '</text>';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">' + grid + '<path d="' + area + '" fill="#2563eb" opacity="0.08"/><path d="' + line + '" fill="none" stroke="#2563eb" stroke-width="2"/>' + dots + xlab + '</svg>' +
        '<div class="muted" style="font-size:11px">Custo distribuído ao longo das ' + nSem + ' semanas do cronograma (etapas em paralelo somam na semana). Total: ' + Util.fmtMoeda(totalCusto) + '.</div>';
    },

    _mmeOrc: function (orc) {
      var mo = 0, mat = 0, eq = 0;
      (orc.etapas || []).forEach(function (e) { (e.itens || []).forEach(function (it) { var q = Util.num(it.quantidade); mo += Util.num(it.custoMO) * q; mat += Util.num(it.custoMAT) * q; eq += Util.num(it.custoEQ) * q; }); });
      return { mo: mo, mat: mat, eq: eq, total: mo + mat + eq };
    },
    _barH: function (dados) {
      var max = dados.reduce(function (m, d) { return Math.max(m, d.valor); }, 0) || 1;
      return '<div>' + dados.map(function (d) {
        var pct = (d.valor / max) * 100, cor = d.cor || "#2563eb";
        return '<div style="margin:5px 0"><div style="font-size:11px;color:#475569;display:flex;justify-content:space-between"><span>' + Util.esc(String(d.rotulo).slice(0, 34)) + '</span><span>' + (d.valor >= 1000 ? Util.fmtMoeda(d.valor) : Util.fmtNum(d.valor, 0)) + '</span></div>' +
          '<div style="background:#e2e8f0;border-radius:4px;height:14px"><div style="width:' + pct.toFixed(1) + '%;background:' + cor + ';height:14px;border-radius:4px"></div></div></div>';
      }).join("") + '</div>';
    },
    _pareto: function (sint) {
      var ord = sint.slice().sort(function (a, b) { return b.custoDireto - a.custoDireto; });
      var tot = ord.reduce(function (s, x) { return s + x.custoDireto; }, 0) || 1, acc = 0;
      return '<table class="tbl" style="font-size:12px"><thead><tr><th>Etapa</th><th class="num">Custo</th><th class="num">%</th><th class="num">acum.</th><th>Cl.</th></tr></thead><tbody>' +
        ord.map(function (x) {
          var pc = x.custoDireto / tot * 100; acc += pc; var cl = acc <= 80 ? "A" : (acc <= 95 ? "B" : "C"), cor = cl === "A" ? "#dc2626" : (cl === "B" ? "#f59e0b" : "#16a34a");
          return '<tr><td>' + Util.esc((x.codigo + " " + x.nome).slice(0, 26)) + '</td><td class="num">' + Util.fmtMoeda(x.custoDireto) + '</td><td class="num">' + Util.fmtPct(pc, 1) + '</td><td class="num">' + Util.fmtPct(acc, 1) + '</td><td><b style="color:' + cor + '">' + cl + '</b></td></tr>';
        }).join("") + '</tbody></table>';
    },
    _donut: function (dados) {
      var tot = dados.reduce(function (s, d) { return s + d.valor; }, 0) || 1, ang = -Math.PI / 2, R = 60, cx = 80, cy = 80, parts = "";
      dados.forEach(function (d) {
        var frac = d.valor / tot, a0 = ang, a1 = ang + frac * 2 * Math.PI; ang = a1;
        var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1), large = frac > 0.5 ? 1 : 0;
        parts += '<path d="M' + cx + ',' + cy + ' L' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' Z" fill="' + d.cor + '"><title>' + Util.esc(d.rotulo) + ': ' + Util.fmtPct(frac * 100, 1) + '</title></path>';
      });
      var leg = dados.map(function (d) { return '<div style="font-size:12px;display:flex;align-items:center;gap:6px"><span style="width:11px;height:11px;background:' + d.cor + ';border-radius:2px;display:inline-block"></span>' + Util.esc(d.rotulo) + ' — <b>' + Util.fmtPct(d.valor / tot * 100, 1) + '</b></div>'; }).join("");
      return '<div style="display:flex;gap:14px;align-items:center"><svg viewBox="0 0 160 160" style="width:140px;flex:none">' + parts + '<circle cx="' + cx + '" cy="' + cy + '" r="32" fill="var(--card,#fff)"/></svg><div>' + leg + '</div></div>';
    },

    // ----- Aba Relatórios (Curva ABC + Cronograma) -----
    renderRelatorios: function (orc) {
      var abc = Orcamento.curvaABC(orc);
      var cron = Orcamento.cronograma(orc);
      if (!abc.linhas.length) return '<div class="vazio card">Adicione itens para ver Curva ABC e Cronograma.</div>';

      var corClasse = { A: "verde", B: "amarelo", C: "vermelho" };
      var html = '<h3 style="margin:4px 0 12px">Curva ABC de Itens</h3>';

      // Resumo A/B/C
      html += '<div class="kpis">';
      ["A", "B", "C"].forEach(function (k) {
        var r = abc.resumo[k];
        html += '<div class="kpi"><div class="rotulo">Classe ' + k + ' · ' + r.qtd + ' itens</div>' +
          '<div class="num" style="color:var(--' + corClasse[k] + ')">' + Util.fmtMoeda(r.valor) + '</div>' +
          '<div class="muted" style="font-size:12px">' + Util.fmtPct(r.pct, 1) + ' do custo</div></div>';
      });
      html += '</div>';

      // Tabela ABC
      html += '<table class="tbl"><thead><tr><th>Classe</th><th>Código</th><th>Descrição</th>' +
        '<th class="num">Custo</th><th class="num">% Indiv.</th><th class="num">% Acum.</th><th style="width:120px">Participação</th></tr></thead><tbody>';
      abc.linhas.forEach(function (x) {
        html += '<tr><td><span class="pill" style="background:var(--' + corClasse[x.classe] + ');color:#fff">' + x.classe + '</span></td>' +
          '<td>' + Util.esc(x.codigo) + '</td><td>' + Util.esc(x.descricao.slice(0, 50)) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(x.custoTotal) + '</td>' +
          '<td class="num">' + Util.fmtPct(x.pct, 1) + '</td>' +
          '<td class="num">' + Util.fmtPct(x.acumPct, 1) + '</td>' +
          '<td><div style="background:var(--surface-2);border-radius:4px;height:10px;overflow:hidden">' +
          '<div style="background:var(--' + corClasse[x.classe] + ');height:100%;width:' + Math.max(2, x.pct) + '%"></div></div></td></tr>';
      });
      html += '</tbody></table>';

      // Cronograma
      html += '<div class="flex between" style="margin:26px 0 12px"><h3 style="margin:0">Cronograma Físico-Financeiro</h3>' +
        '<div class="flex"><label class="muted" style="font-size:12px">Prazo (meses):</label>' +
        '<input id="cron-meses" class="cell" style="width:70px;border:1px solid var(--linha)" value="' + cron.meses + '"></div></div>';
      html += '<div style="overflow:auto"><table class="tbl"><thead><tr><th>Etapa</th>';
      for (var m = 0; m < cron.meses; m++) html += '<th class="num">Mês ' + (m + 1) + '</th>';
      html += '<th class="num">Total</th></tr></thead><tbody>';
      cron.etapas.forEach(function (e) {
        html += '<tr><td>' + Util.esc(e.codigo + " " + e.nome) + '</td>';
        e.meses.forEach(function (v) { html += '<td class="num">' + (v > 0.005 ? Util.fmtMoeda(v) : "—") + '</td>'; });
        html += '<td class="num"><b>' + Util.fmtMoeda(e.total) + '</b></td></tr>';
      });
      html += '</tbody><tfoot>';
      html += '<tr class="etapa-row"><td>Total mensal</td>';
      cron.totaisMes.forEach(function (v) { html += '<td class="num">' + Util.fmtMoeda(v) + '</td>'; });
      html += '<td class="num">' + Util.fmtMoeda(cron.total) + '</td></tr>';
      html += '<tr><td class="muted">Acumulado %</td>';
      cron.acumPct.forEach(function (p) { html += '<td class="num muted">' + Util.fmtPct(p, 1) + '</td>'; });
      html += '<td class="num muted">100%</td></tr>';
      html += '</tfoot></table></div>';
      html += '<p class="watermark-hint mt">Distribuição sequencial proporcional ao peso de cada etapa (valores com BDI). Ajuste o prazo para recalcular.</p>';
      return html;
    },

    // ----- Relatório completo (sintético + analítico) para impressão/PDF -----
    renderRelatorioCompleto: function (orc, usuario) {
      var t = Orcamento.totais(orc);
      var sint = Orcamento.sintetico(orc);
      var pct = orc.bdi ? orc.bdi.percentual : 0;
      // White-label: cadastro completo da Empresa primeiro; nunca cai no fabricante.
      var empresa = ((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "") || (usuario && usuario.empresa) || "Sua Empresa";
      var hoje = new Date().toLocaleDateString("pt-BR");

      var html = '<div class="rel-doc">';
      // marca d'água (mesmo padrão da Proposta/Laudo — configurável em ⚙ Empresa)
      var wmRel = (typeof Empresa !== "undefined" && Empresa.marcaDaguaTexto) ? Empresa.marcaDaguaTexto() : empresa;
      if (wmRel) html += '<div class="wm">' + Util.esc(wmRel) + '</div>';

      // Cabeçalho
      html += '<div class="rel-head">' +
        '<div><div class="rel-emp">' + Util.esc(empresa) + '</div><h1>Relatório de Orçamento</h1>' +
        '<div class="rel-sub">' + Util.esc(orc.nome) + '</div></div>' +
        '<div class="rel-meta">' +
          '<div><span>Nº</span> ' + Util.esc(orc.numero) + '</div>' +
          '<div><span>Cliente</span> ' + Util.esc(orc.cliente.nome || "—") + '</div>' +
          '<div><span>Obra</span> ' + Util.esc((orc.obra && orc.obra.nome) || "—") + '</div>' +
          '<div><span>' + (Orcamento.basesUsadas(orc).length > 1 ? "Bases" : "Base") + '</span> ' + Util.esc(Orcamento.basesUsadasTexto(orc)) + '</div>' +
          '<div><span>Data</span> ' + hoje + '</div>' +
        '</div></div>';

      // Resumo
      html += '<div class="rel-kpis">' +
        '<div><span>Custo Direto</span><b>' + Util.fmtMoeda(t.custoDireto) + '</b></div>' +
        '<div><span>BDI</span><b>' + Util.fmtPct(t.bdiPercentual) + '</b></div>' +
        '<div><span>Valor BDI</span><b>' + Util.fmtMoeda(t.bdiValor) + '</b></div>' +
        '<div class="dest"><span>Preço de Venda</span><b>' + Util.fmtMoeda(t.precoVenda) + '</b></div></div>';

      // 1) Planilha SINTÉTICA
      html += '<h2 class="rel-tit">1. Planilha Sintética (por etapa)</h2>';
      html += '<table class="prop-tbl"><thead><tr><th>Cód</th><th>Etapa</th>' +
        '<th class="r">Itens</th><th class="r">Custo Direto</th><th class="r">Preço Venda</th><th class="r">Peso</th></tr></thead><tbody>';
      sint.forEach(function (s) {
        html += '<tr><td>' + Util.esc(s.codigo) + '</td><td>' + Util.esc(s.nome) + '</td>' +
          '<td class="r">' + s.qtdItens + '</td><td class="r">' + Util.fmtMoeda(s.custoDireto) + '</td>' +
          '<td class="r">' + Util.fmtMoeda(s.precoVenda) + '</td><td class="r">' + Util.fmtPct(s.peso, 1) + '</td></tr>';
      });
      html += '</tbody><tfoot><tr><td colspan="3">TOTAL</td><td class="r">' + Util.fmtMoeda(t.custoDireto) +
        '</td><td class="r">' + Util.fmtMoeda(t.precoVenda) + '</td><td class="r">100%</td></tr></tfoot></table>';

      // 2) Planilha ANALÍTICA (detalhada, item a item, por etapa)
      html += '<h2 class="rel-tit">2. Planilha Analítica (detalhada)</h2>';
      html += '<table class="prop-tbl"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th>' +
        '<th class="r">Qtd</th><th class="r">Custo Unit.</th><th class="r">Custo Total</th><th class="r">Preço Venda</th></tr></thead><tbody>';
      Util.arr(orc.etapas).forEach(function (e) {
        var subCusto = 0;
        e.itens.forEach(function (it) { subCusto += Util.num(it.quantidade) * Util.num(it.custoUnitario); });
        html += '<tr class="grp"><td colspan="7">' + Util.esc(e.codigo + " · " + e.nome) + '</td></tr>';
        if (!e.itens.length) html += '<tr><td colspan="7" class="muted">(sem itens)</td></tr>';
        e.itens.forEach(function (it) {
          var custo = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          html += '<tr><td>' + Util.esc(it.codigo) + '</td><td>' + Util.esc(it.descricao) + '</td>' +
            '<td>' + Util.esc(it.unidade) + '</td>' +
            '<td class="r">' + Util.fmtNum(it.quantidade, 2) + '</td>' +
            '<td class="r">' + Util.fmtMoeda(it.custoUnitario) + '</td>' +
            '<td class="r">' + Util.fmtMoeda(custo) + '</td>' +
            '<td class="r">' + Util.fmtMoeda(Bdi.aplicar(custo, pct)) + '</td></tr>';
        });
        html += '<tr class="sub"><td colspan="5">Subtotal ' + Util.esc(e.codigo) + '</td>' +
          '<td class="r">' + Util.fmtMoeda(subCusto) + '</td><td class="r">' + Util.fmtMoeda(Bdi.aplicar(subCusto, pct)) + '</td></tr>';
      });
      html += '</tbody><tfoot><tr><td colspan="5">TOTAL GERAL</td><td class="r">' + Util.fmtMoeda(t.custoDireto) +
        '</td><td class="r">' + Util.fmtMoeda(t.precoVenda) + '</td></tr></tfoot></table>';

      // 3) COMPOSIÇÕES E INSUMOS (analítico SINAPI) — cada composição detalhada em seus insumos
      if (typeof Analitico !== "undefined" && Analitico.carregado) {
        var vistos = {}, comps = [];
        Util.arr(orc.etapas).forEach(function (e) {
          Util.arr(e.itens).forEach(function (it) {
            if (it.origem === "SINAPI" && it.codigo && it.codigo !== "—" && !vistos[it.codigo]) {
              var a = Analitico.obter(it.codigo);
              if (a && Util.arr(a.insumos).length) { vistos[it.codigo] = 1; comps.push({ it: it, a: a }); }
            }
          });
        });
        if (comps.length) {
          html += '<h2 class="rel-tit">3. Composições e Insumos (analítico SINAPI)</h2>';
          html += '<p class="muted" style="margin:-6px 0 10px;font-size:12px">' + comps.length +
            ' composição(ões) do orçamento, detalhada(s) em insumos, mão de obra e equipamentos — coeficientes da base SINAPI ' +
            Util.esc((Analitico.competencia || "") + (Analitico.uf ? " / " + Analitico.uf : "")) + '.</p>';
          comps.forEach(function (c) {
            var a = c.a;
            html += '<table class="prop-tbl" style="margin-bottom:12px"><thead>' +
              '<tr class="grp"><td colspan="6">' + Util.esc(c.it.codigo) + ' · ' +
              Util.esc(Util.fixEnc(a.descricao || c.it.descricao)) + ' — un. ' + Util.esc(a.unidade || c.it.unidade) + '</td></tr>' +
              '<tr><th>Tipo</th><th>Código</th><th>Insumo</th><th>Un</th><th class="r">Coef.</th><th class="r">Custo Unit.</th></tr></thead><tbody>';
            Util.arr(a.insumos).forEach(function (ins) {
              html += '<tr><td>' + (ins.tipo === "COMPOSICAO" ? "Sub-comp." : "Insumo") + '</td>' +
                '<td>' + Util.esc(ins.codigo) + '</td>' +
                '<td>' + Util.esc(Util.fixEnc(ins.descricao)) + '</td>' +
                '<td>' + Util.esc(ins.unidade) + '</td>' +
                '<td class="r">' + Util.fmtNum(ins.coeficiente, 4) + '</td>' +
                '<td class="r">' + Util.fmtMoeda(ins.custoUnitario) + '</td></tr>';
            });
            html += '<tr class="sub"><td colspan="4">Composição — MO ' + Util.fmtMoeda(a.custoMO) +
              ' · MAT ' + Util.fmtMoeda(a.custoMAT) + ' · EQ ' + Util.fmtMoeda(a.custoEQ) + '</td>' +
              '<td class="r">Custo unit.</td><td class="r">' + Util.fmtMoeda(a.custoUnitario) + '</td></tr>';
            html += '</tbody></table>';
          });
        }
      }

      var credRel = (typeof Empresa !== "undefined" && Empresa.creditoTexto) ? Empresa.creditoTexto() : "";
      html += '<div class="rel-rod">' + (credRel ? Util.esc(credRel) + " · " : "") + hoje +
        ' · Custos ref. ' + Util.esc(Orcamento.basesUsadasTexto(orc)) +
        ' com BDI ' + Util.fmtPct(pct) + ' incluso no preço de venda.</div>';
      html += '</div>';
      return html;
    },

    // ----- Aba BDI -----
    renderBdi: function (orc) {
      var p = orc.bdi.params || Bdi.paramsDoModelo("padrao");
      var campos = [
        ["AC", "Administração Central"], ["S", "Seguro"], ["R", "Risco"],
        ["G", "Garantia"], ["DF", "Despesas Financeiras"], ["L", "Lucro"], ["I", "Impostos (PIS+COFINS+ISS)"]
      ];
      var html = '<div class="card" style="max-width:620px">' +
        '<div class="flex mb"><b>Modelo:</b>' +
        '<select id="bdi-modelo" class="btn sm">' +
          Object.keys(CONFIG.bdiPresets).map(function (k) {
            return '<option value="' + k + '"' + (orc.bdi.modeloId === k ? " selected" : "") + '>' + CONFIG.bdiPresets[k].nome + '</option>';
          }).join("") +
        '<option value="dnit"' + (orc.bdi.modeloId === "dnit" ? " selected" : "") + '>🏛️ DNIT (Acórdão TCU 2.622/2013)</option>' +
        '<option value="custom"' + (orc.bdi.modeloId === "custom" ? " selected" : "") + '>Personalizado</option>' +
        '</select></div>' +
        (typeof DnitBdi !== "undefined" ? '<div class="muted mb" style="font-size:12px">🏛️ <b>DNIT · Acórdão 2.622/2013</b> — CPRB atualiza por ano (Lei 14.973/2024): ' +
          DnitBdi.cprbDoAno() + '% em ' + (new Date().getFullYear()) + ' · Selic ref. ' + Util.fmtNum(DnitBdi.selic, 2) + '% · ISS ' + Util.fmtNum(DnitBdi.tributos.iss, 2) + '%</div>' : '');
      html += '<div class="row">';
      campos.forEach(function (c) {
        html += '<div class="field"><label>' + c[1] + ' (%)</label>' +
          '<input id="bdi-' + c[0] + '" type="text" value="' + Util.fmtNum(p[c[0]], 2) + '"></div>';
      });
      html += '</div>';
      html += '<div class="flex between mt">' +
        '<div><div class="muted">BDI resultante</div>' +
        '<div style="font-size:32px;font-weight:800;color:var(--verde)" id="bdi-resultado">' + Util.fmtPct(orc.bdi.percentual) + '</div></div>' +
        '<button class="btn primary" data-acao="salvar-bdi">Aplicar BDI</button></div>';
      html += '<p class="watermark-hint mt">Fórmula Acórdão TCU 2.622/2013. Ajuste e clique em "Aplicar BDI".</p>';
      html += '</div>';
      return html;
    },

    // ---------- Importar base SINAPI ----------
    renderImportSinapi: function (resumo) {
      return '' +
        '<p class="muted">Use a base SINAPI da sua região/competência. Aceita <b>JSON</b> (export do ' +
        'sinapi-fetcher) ou <b>CSV</b> com colunas Código, Descrição, Unidade e Custo.</p>' +
        '<div class="row"><div class="field"><label>Competência</label><input id="imp-comp" value="' + Util.esc(resumo.competencia || "") + '" placeholder="2026-05"></div>' +
        '<div class="field"><label>UF</label><input id="imp-uf" value="' + Util.esc(resumo.uf || "") + '" placeholder="MG"></div></div>' +
        '<div class="field"><label>Arquivo (.json / .csv)</label><input id="imp-file" type="file" accept=".json,.csv,.txt"></div>' +
        '<div class="field"><label>…ou cole o conteúdo aqui</label><textarea id="imp-text" rows="5" placeholder=\'{"mes":"2026-05","uf":"MG","dados":[...]}  ou  Codigo;Descricao;Unidade;Custo\'></textarea></div>' +
        '<div class="watermark-hint">A base fica salva por empresa e passa a ser usada na busca e no Escopo. Bases muito grandes podem ficar só na sessão atual (aviso na hora).</div>';
    },

    // ---------- Agente Importador: preview + mapeamento de colunas ----------
    renderImportPreview: function (imp, semWrap) {
      var res = imp.res, mat = imp.matriz || [];
      // headerRow é índice do array SEM linhas vazias (o Importador filtra) — filtrar igual aqui,
      // senão o rótulo da coluna sai da linha errada quando há linha em branco no topo (comum no Excel).
      var matNV = mat.filter(function (r) { return r && r.some(function (c) { return String(Importador._txt(c)).trim() !== ""; }); });
      var nCols = 0; matNV.forEach(function (r) { if (r.length > nCols) nCols = r.length; });
      var hdr = (res.headerRow >= 0) ? (matNV[res.headerRow] || []) : [];
      function letra(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
      function colLabel(i) { var h = hdr[i] != null ? String(Importador._txt(hdr[i])).trim() : ""; return letra(i) + (h ? ": " + h : ""); }
      var roles = [["codigo", "Código"], ["descricao", "Descrição"], ["unidade", "Unidade"], ["quantidade", "Quantidade"], ["custoUnit", "Custo unit."], ["custoTotal", "Custo total"]];
      function selCol(role) {
        var cur = res.colunas ? res.colunas[role[0]] : null, opts = '<option value="">— nenhuma —</option>';
        for (var i = 0; i < nCols; i++) opts += '<option value="' + i + '"' + (cur === i ? " selected" : "") + ">" + Util.esc(colLabel(i)) + "</option>";
        return '<div class="field" style="margin:0"><label style="font-size:11px">' + role[1] + '</label><select id="imp-col-' + role[0] + '">' + opts + "</select></div>";
      }
      var conf = Math.round((res.confianca || 0) * 100), corConf = conf >= 80 ? "#16a34a" : conf >= 50 ? "#f59e0b" : "#dc2626";
      var html = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
        '<span class="g-pill" style="background:' + corConf + '22;color:' + corConf + ';font-weight:700">🤖 Confiança ' + conf + "%</span>" +
        '<span class="muted" style="font-size:13px">' + res.resumo.etapas + " etapas · " + res.resumo.itens + " itens" + (res.resumo.ignoradas ? " · " + res.resumo.ignoradas + " linhas ignoradas (totais/vazias)" : "") + "</span></div>";
      html += '<p class="muted" style="font-size:12.5px;margin:0 0 6px">O agente detectou o mapeamento abaixo. Se alguma coluna estiver errada, corrija e clique <b>🔄 Reanalisar</b>.</p>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px">' + roles.map(selCol).join("") + "</div>";
      html += '<input id="imp-header" type="hidden" value="' + (res.headerRow != null ? res.headerRow : -1) + '">';
      if (res.avisos && res.avisos.length) html += '<div class="card" style="background:#fffbeb;border-color:#fde68a;padding:8px 12px;margin-bottom:12px;font-size:12.5px;color:#92400e">⚠️ ' + res.avisos.map(function (a) { return Util.esc(a); }).join("<br>⚠️ ") + "</div>";
      var prev = [], nP = 0, LIMP = 40, cortou = false;
      Util.arr(res.etapas).forEach(function (e) {
        if (nP >= LIMP) { cortou = true; return; }   // não empurra cabeçalho de etapa depois do limite (senão sobram etapas vazias)
        prev.push('<tr class="etapa-row"><td colspan="5"><b>' + Util.esc((e.codigo ? e.codigo + " · " : "") + e.nome) + "</b></td></tr>");
        Util.arr(e.itens).forEach(function (it) { if (nP >= LIMP) { cortou = true; return; } prev.push("<tr><td>" + Util.esc(it.codigo || "—") + "</td><td>" + Util.esc(it.descricao) + "</td><td>" + Util.esc(it.unidade) + '</td><td class="num">' + Util.fmtNum(it.quantidade, 2) + '</td><td class="num">' + Util.fmtMoeda(it.custoUnitario) + "</td></tr>"); nP++; });
      });
      if (cortou) prev.push('<tr><td colspan="5" class="muted" style="text-align:center">… e mais ' + Math.max(0, res.resumo.itens - nP) + ' item(ns) — mostrando os ' + nP + ' primeiros</td></tr>');
      html += '<div style="max-height:300px;overflow:auto;border:1px solid var(--linha);border-radius:8px"><table class="tbl"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Qtd</th><th class="num">Custo unit.</th></tr></thead><tbody>' + (prev.join("") || '<tr><td colspan="5" class="muted">Nada detectado — ajuste o mapeamento.</td></tr>') + "</tbody></table></div>";
      html += '<p class="muted" style="font-size:11px;margin:8px 0 0">Ao importar: itens com <b>código SINAPI válido</b> são casados na base (o preço oficial preenche o que estiver vazio na planilha); os demais entram como <b>itens próprios</b> com os valores da planilha. Nenhum código é inventado.</p>';
      return semWrap ? html : '<div id="imp-body">' + html + "</div>";
    },

    // ---------- Escopo Inteligente: entrada ----------
    renderEscopoEntrada: function () {
      return '' +
        '<p class="muted">Cole a <b>descrição da obra</b> (texto livre / trecho do laudo) ou itens linha a linha. ' +
        'O <b>🤖 Estruturar com IA</b> quebra a obra em serviços, casa com as bases (SINAPI/SICRO/SUDECAP/SEINFRA/SETOP) e estima as quantidades. Nunca inventa código.</p>' +
        '<div class="field"><textarea id="esc-txt" rows="8" placeholder="Ex. (prosa livre): Reforma de banheiro 6m²: demolir revestimento antigo, novo contrapiso, assentar porcelanato no piso e paredes, instalar bacia e lavatório, impermeabilizar o box e pintar o forro...&#10;&#10;ou linha a linha:&#10;240 m2 alvenaria de bloco ceramico&#10;12 m3 concreto fck 25"></textarea></div>' +
        '<div class="flex" style="gap:8px;margin-bottom:6px"><button class="btn primary" data-acao="escopo-ia">🤖 Estruturar com IA</button>' +
        '<button class="btn" data-acao="escopo-analisar">Analisar linha a linha (sem IA)</button></div>' +
        '<div class="watermark-hint">Sem match, o item fica <b>Pendente</b> — nunca inventamos código. (A IA precisa do ERP ligado na porta 3040.)</div>';
    },

    // ---------- Escopo Inteligente: resultado ----------
    renderEscopoResultado: function (analise, etapas) {
      var totalOk = analise.filter(function (l) { return l.status === "ok"; }).length;
      var temIA = analise.some(function (l) { return l.etapaSugerida; });
      var html = '<div class="flex between mb"><div><b>' + analise.length + '</b> serviços · ' +
        '<span style="color:var(--verde)">' + totalOk + ' com sugestão</span> · ' +
        '<span style="color:var(--vermelho)">' + (analise.length - totalOk) + ' pendentes</span>' +
        (temIA ? ' <button class="btn sm primary" data-acao="escopo-casar" title="A IA escolhe o código exato entre os candidatos (em lotes)" style="margin-left:8px">🎯 Refinar com IA</button>' : '') + '</div>' +
        '<div class="flex"><label class="muted" style="font-size:12px">Adicionar à etapa:</label>' +
        '<select id="esc-etapa" class="btn sm">' +
          (temIA ? '<option value="__por_ia__" selected>★ Criar etapas conforme a IA</option>' : '') +
          '<option value="__por_categoria__"' + (temIA ? '' : ' selected') + '>★ Criar etapas por tipo de serviço (auto)</option>' + // FASE 1.3
          etapas.map(function (e) { return '<option value="' + e.id + '">' + Util.esc(e.codigo + " " + e.nome) + '</option>'; }).join("") +
          '<option value="__nova__">+ Nova etapa "Escopo"</option>' +
        '</select></div></div>';

      html += '<table class="tbl"><thead><tr><th>Serviço detectado</th><th class="num">Qtd</th><th>Unid</th>' +
        '<th>Composição sugerida (base)</th><th>Confiança</th></tr></thead><tbody>';

      analise.forEach(function (l, idx) {
        var qtd = '<input class="cell" style="max-width:80px" data-esc-qtd="' + idx + '" value="' + Util.fmtNum(l.quantidade, 2) + '">' +
                  (l.qtdInferida ? '<div class="watermark-hint">inferida</div>' : '');
        var unid = Util.esc(l.unidade || "—");

        var sel = '<select class="btn sm" style="max-width:340px" data-esc-pick="' + idx + '">';
        if (l.candidatos.length) {
          l.candidatos.forEach(function (c, ci) {
            sel += '<option value="' + ci + '"' + (l.escolhido === ci ? " selected" : "") + '>' +
              '[' + Util.esc(c.fonte || "SINAPI") + '] ' + Util.esc(c.item.codigo + " · " + String(c.item.descricao || "").slice(0, 54)) + ' (' + c.confianca + '%)</option>';
          });
        }
        sel += '<option value="-1"' + (l.escolhido === -1 ? " selected" : "") + '>— Ignorar / pendente —</option></select>';

        var confHtml = "—";
        var marca = l.refinadoIA ? ' <span title="Código escolhido pela IA do ERP">🎯</span>' : '';
        if (l.escolhido > -1 && l.candidatos[l.escolhido]) {
          var c = l.candidatos[l.escolhido];
          var n = Escopo.nivel(c.confianca);
          confHtml = '<span class="pill" style="background:var(--' + n.cor + ');color:#fff">' + n.rotulo + ' ' + c.confianca + '%</span>' + marca;
        } else {
          confHtml = '<span class="pill proprio">Pendente</span>' + marca;
        }

        html += '<tr><td>' + Util.esc(l.textoOriginal) + '</td>' +
          '<td class="num">' + qtd + '</td><td>' + unid + '</td>' +
          '<td data-esc-conf-cell="' + idx + '">' + sel + '</td>' +
          '<td data-esc-conf="' + idx + '">' + confHtml + '</td></tr>';
      });
      html += '</tbody></table>';
      return html;
    }
  };

  function kpi(rotulo, valor, cls) {
    return '<div class="kpi ' + (cls || "") + '"><div class="rotulo">' + rotulo + '</div><div class="num">' + valor + '</div></div>';
  }

  global.UI = UI;
})(window);
