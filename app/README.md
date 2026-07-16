# OrçaPRO — Orçamento Inteligente de Obras

Sistema de orçamento de obras com bases oficiais (SINAPI, SICRO, SUDECAP, SEINFRA, SETOP),
BDI (incl. DNIT/TCU), **Escopo Inteligente com IA**, **Cronograma/Gantt**, gráficos,
**Excel profissional** e **Anexo de Orçamento para Laudo Pericial**.

> Versão 1.0.0 · roda 100% local (seus dados não saem do seu computador).

---

## 1. Instalação (5 minutos)

1. Instale o **Node.js LTS**: https://nodejs.org (Next → Next → Finish).
2. Descompacte a pasta do **OrçaPRO** onde quiser (ex.: `C:\OrcaPRO`).
3. Dê **dois cliques em `Iniciar-OrcaPRO.bat`**.
   - Sobem dois serviços (App na porta 8754 e IA na 3041) e o navegador abre sozinho.
   - Deixe as duas janelinhas minimizadas abertas enquanto usar.
4. Crie sua conta no primeiro acesso (e-mail + senha — ficam só no seu computador).

> Crie um atalho do `Iniciar-OrcaPRO.bat` na Área de Trabalho para abrir com 1 clique.

## 2. Ative a Inteligência Artificial (grátis)

Os recursos de IA (Escopo Inteligente e refino do Cronograma) usam a **sua própria chave** —
o plano grátis da **Groq** atende de sobra.

1. Acesse https://console.groq.com/keys e crie uma **API Key** (grátis).
2. Na pasta `server`, copie `ia-config.example.json` para **`ia-config.json`**.
3. Abra o `ia-config.json` e cole a sua chave no campo `apiKey`.
4. Reinicie o `Iniciar-OrcaPRO.bat`.

Sem isso, o resto do sistema funciona normal — só os botões de IA ficam inativos.

## 3. Primeiros passos

1. **⚙ Empresa** (topo) → preencha seus dados (razão social, responsável técnico,
   CREA/CAU, ART) e **suba seu logo**. Aparecem nos documentos.
2. **🗂 Tabelas** → carregue as bases que usa (📦 SUDECAP, SEINFRA, SETOP…). A SINAPI já vem.
3. **+ Novo Orçamento** → use a planilha, ou **✨ Escopo Inteligente** para a IA montar a partir de um texto livre.

## 4. Recursos

- **Multi-base** (SINAPI/SICRO/SUDECAP/SEINFRA/SETOP) com busca unificada e badge de origem.
- **Escopo Inteligente (IA):** cole a descrição da obra → a IA estrutura os serviços e casa com as bases.
- **BDI** por modelo, incluindo **DNIT / Acórdão TCU 2.622/2013** (CPRB automática por ano).
- **Cronograma / Gantt** parametrizado, com agente que estima durações (e refino por IA).
- **Gráficos:** custo por etapa, Curva ABC, MO/MAT/EQ, Curva S físico-financeira.
- **Excel** com 6+ abas (Resumo, Sintética, Analítica, Insumos, Curva ABC, Gantt).
- **Anexo de Orçamento para Laudo** (pericial: metodologia SINAPI, BDI TCU, normas ABNT, responsável técnico).
- **💾 Backup** dos orçamentos (exportar/importar `.json`).

## 5. Backup e segurança dos dados

Seus orçamentos ficam salvos **no seu navegador** (não saem do seu computador).
Use **💾 Backup → Exportar** de vez em quando para guardar uma cópia em arquivo
(e para transferir para outro computador).

## 6. Problemas comuns

- **Botão de IA não responde / "sem conexão":** confira se a janelinha "OrçaPRO IA" está aberta
  e se o `server/ia-config.json` tem a sua chave. Bloqueadores de anúncio podem barrar a porta
  local — teste em **janela anônima** (`Ctrl+Shift+N` → `localhost:8754`).
- **"Limite da IA grátis por minuto":** espere ~1 minuto e clique de novo (o plano grátis tem
  teto por minuto; o sistema continua de onde parou).
- **Tela parece antiga depois de atualizar:** dê `Ctrl+Shift+R` (recarregar sem cache).

## 7. Suporte

Dúvidas e suporte: _[preencha seu canal de contato aqui]_.

---

### Para o revendedor (licenciamento e marca)

- **Marca / white-label:** edite `js/config.js` → `CONFIG.marca` (nome, cores, logo).
- **Licenças:** gere uma chave por cliente com:
  ```
  node tools/gerar-licenca.js "cliente@email.com" 365
  ```
  (e-mail do cliente + dias de validade). Entregue a chave; o cliente ativa em **🔑 Licença**.
- **Planos (FREE/PRO):** definidos em `js/config.js`.
