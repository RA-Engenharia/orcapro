/* =====================================================================
 * servidor-ia-modelo-proposta.js — A ROTA QUE FALTA NO VPS
 *
 * DIAGNÓSTICO (03/09/2026). O botão "Montar com a IA" (js/proptplui.js)
 * sempre chamou `POST {iaBackend}/ia/modelo-proposta`, e o servidor responde
 * **404**: a rota nunca foi implementada. Enquanto o app não tinha rede de
 * segurança, isso virava um toast vermelho e nenhum modelo.
 *
 * O app já não depende mais dela — sem resposta, `PropTpl.montarDoRoteiro`
 * monta a estrutura no próprio navegador. Esta rota é o ganho de qualidade:
 * a IA escreve os textos ("quem somos", serviços, condições) com as palavras
 * do ramo da empresa, coisa que uma regra não faz.
 *
 * COMO USAR: cole este arquivo no projeto do servidor de IA e registre
 *   app.use(require("./servidor-ia-modelo-proposta")(deps));
 * onde `deps.chamarIA(prompt, opcoes)` é a mesma função que as outras rotas
 * (/ia/orcamento, /ia/documento) já usam. Nada aqui é específico de provedor.
 *
 * ---------------------------------------------------------------------
 * O CONTRATO, exatamente como o app espera (js/proptplui.js):
 *
 *   REQUISIÇÃO   POST /ia/modelo-proposta
 *                headers: x-licenca: <chave>
 *                body: { roteiro: { ramo, oQueVende, paraQuem, tom,
 *                                   naoPodeFaltar, diferenciais,
 *                                   quantasFotos, formato } }
 *
 *   RESPOSTA OK  { ok: true, resultado: { nome, descricao, estilo, paginas } }
 *   RESPOSTA ERRO{ ok: false, error: "mensagem para o usuário" }
 *
 * ⚠ O APP CONFERE A RESPOSTA (`PropTpl.doAgente`): página de tipo que ele não
 *   sabe desenhar é descartada com aviso, e a de Investimento é acrescentada
 *   se faltar. Ou seja: uma resposta imperfeita não quebra o cliente. Ainda
 *   assim, o prompt abaixo lista os tipos válidos — errar menos é melhor que
 *   ser consertado depois.
 *
 * ⚠ A IA NÃO PODE INVENTAR FATO SOBRE A EMPRESA. É a promessa que a tela faz
 *   ao usuário, em letras grandes. O que o roteiro não disser tem de sair como
 *   "[preencher: ...]" — o app lista esses marcadores na tela de pendências.
 * ===================================================================== */

/* Os tipos de página que o motor do cliente sabe desenhar (js/proptpl.js
   BLOCOS). Manter em sincronia: um tipo a mais aqui vira página descartada lá. */
var BLOCOS = {
  capa: ["titulo", "subtitulo", "chamada", "mostrarCliente", "mostrarNumero", "mostrarLogo"],
  sobre: ["titulo", "texto", "mostrarLogo"],
  servicos: ["titulo", "abertura", "itens", "fechamento"],
  imagens: ["titulo", "cap1", "cap2", "cap3", "legenda"],
  texto: ["titulo", "abertura", "rotuloLista", "itens", "obsTitulo", "observacao", "usarComercial"],
  investimento: ["titulo", "colTrabalho", "colValor", "tituloPagamento", "detalhar"],
  cronograma: ["titulo", "abertura", "mostrarValores", "periodos", "rotuloMes", "legenda"],
  condicoes: ["titulo", "paragrafos", "usarPrazo", "usarGarantia"],
  encerramento: ["frase", "mostrarLogo"],
  contato: ["titulo", "pessoas", "redes", "telefone", "site", "whatsapp", "email", "endereco",
    "usarEmpresa", "textoZap", "botaoPlanilha", "textoBotao", "mostrarFoto", "molduraCelular"],
  assinatura: ["titulo", "texto", "mostrarValidade"]
};

var FONTES = ["montserrat", "editorial", "impacto", "condensada", "bloco", "classica", "tecnica", "geometrica", "mista"];

function prompt(roteiro) {
  var r = roteiro || {};
  return [
    "Você monta a ESTRUTURA de uma proposta comercial de uma empresa brasileira.",
    "Responda SOMENTE com JSON válido, sem cercas de código e sem comentários.",
    "",
    "O QUE A EMPRESA RESPONDEU (use só isto como fato):",
    JSON.stringify(r, null, 2),
    "",
    "REGRAS QUE NÃO PODEM SER QUEBRADAS:",
    "1. NÃO INVENTE FATO sobre a empresa: nada de anos de mercado, número de obras,",
    "   prêmios, certificações ou nomes que não estejam nas respostas acima.",
    "   O que faltar deve sair no texto como [preencher: o que falta], literalmente.",
    "2. NÃO ESCREVA PREÇO, PRAZO, FORMA DE PAGAMENTO NEM GARANTIA. Esses quatro vêm",
    "   prontos do orçamento do cliente e entram sozinhos nas páginas certas.",
    "3. Use somente estes tipos de página: " + Object.keys(BLOCOS).join(", ") + ".",
    "4. A página 'investimento' é obrigatória e deve aparecer UMA vez.",
    "5. Só use 'imagens' e 'encerramento' se a empresa disse ter fotos suficientes",
    "   (campo quantasFotos). Página de foto sem foto sai como retângulo vazio.",
    "6. Em 'texto', prefira usarComercial: true — assim a lista de incluso/não incluso",
    "   vem do orçamento e não fica desatualizada.",
    "7. Português do Brasil, tom profissional, frases curtas. Nada de superlativo",
    "   vazio ('excelência', 'referência no mercado', 'soluções inovadoras').",
    "",
    "FORMATO DA RESPOSTA:",
    JSON.stringify({
      nome: "nome curto do modelo",
      descricao: "uma linha sobre para que serve",
      estilo: {
        corTitulo: "#0F3B5E", corTexto: "#26303A", corFundo: "#FFFFFF",
        corDestaque: "#7D6E4F", corDestaque2: "#3F7D22", corFundoEscuro: "#0B2E4A",
        fonte: "uma de: " + FONTES.join("|"),
        formato: "a4 ou vertical", ornamento: "curvas ou vazio",
        rodape: "contatos ou vazio", fundoInternas: "claro ou vazio",
        logoEscuro: "clarear", marcaDagua: "auto"
      },
      paginas: [{ tipo: "capa", titulo: "PROPOSTA", chamada: "..." }]
    }, null, 2),
    "",
    "CAMPOS DE CADA TIPO (use só estes):",
    JSON.stringify(BLOCOS, null, 2)
  ].join("\n");
}

/* Recorta o JSON de uma resposta que veio com texto em volta — modelo que
   obedece "só JSON" na maior parte das vezes ainda erra de vez em quando, e
   devolver 500 por causa de uma crase é jogar fora um resultado bom. */
function extrairJSON(txt) {
  var s = String(txt == null ? "" : txt).trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  var i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
}

/* Tira o que o motor do cliente não conhece, ANTES de responder: assim o
   usuário não vê "3 páginas descartadas" por culpa do servidor. */
function limpar(res) {
  var out = { nome: String(res.nome || "").slice(0, 60), descricao: String(res.descricao || "").slice(0, 200) };
  out.estilo = {};
  var est = res.estilo || {};
  ["corTitulo", "corTexto", "corFundo", "corDestaque", "corDestaque2", "corFundoEscuro"].forEach(function (k) {
    if (/^#[0-9a-fA-F]{6}$/.test(String(est[k] || ""))) out.estilo[k] = est[k];
  });
  if (FONTES.indexOf(String(est.fonte)) > -1) out.estilo.fonte = est.fonte;
  out.estilo.formato = est.formato === "vertical" ? "vertical" : "a4";
  if (est.ornamento === "curvas") out.estilo.ornamento = "curvas";
  if (est.rodape === "contatos") out.estilo.rodape = "contatos";
  if (est.fundoInternas === "claro") out.estilo.fundoInternas = "claro";
  if (est.logoEscuro === "clarear" || est.logoEscuro === "pastilha") out.estilo.logoEscuro = est.logoEscuro;
  if (est.marcaDagua === "auto") out.estilo.marcaDagua = "auto";

  out.paginas = (Array.isArray(res.paginas) ? res.paginas : []).map(function (p, i) {
    var t = String((p && p.tipo) || "");
    if (!BLOCOS[t]) return null;
    var pg = { id: "p" + (i + 1), tipo: t };
    BLOCOS[t].forEach(function (c) { if (p[c] !== undefined && p[c] !== null) pg[c] = p[c]; });
    return pg;
  }).filter(Boolean);
  return out;
}

module.exports = function (deps) {
  var express = deps.express || require("express");
  var router = express.Router();

  router.post("/ia/modelo-proposta", async function (req, res) {
    var roteiro = (req.body && req.body.roteiro) || {};
    if (!roteiro.ramo && !roteiro.oQueVende) {
      return res.json({ ok: false, error: "O roteiro veio vazio: diga ao menos o que a empresa faz." });
    }
    try {
      var bruto = await deps.chamarIA(prompt(roteiro), { json: true, temperatura: 0.4, maxTokens: 3000 });
      var obj = (bruto && typeof bruto === "object") ? bruto : extrairJSON(bruto);
      if (!obj) return res.json({ ok: false, error: "a IA não devolveu um JSON que eu conseguisse ler" });
      var limpo = limpar(obj);
      if (!limpo.paginas.length) return res.json({ ok: false, error: "a IA não devolveu nenhuma página conhecida" });
      return res.json({ ok: true, resultado: limpo });
    } catch (e) {
      /* ⚠ NUNCA 500 AQUI. O cliente trata `{ok:false}` mostrando o motivo e
         montando o modelo localmente; um 500 vira "erro de rede" na tela e
         manda o usuário procurar defeito na internet dele. */
      return res.json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
    }
  });

  return router;
};

module.exports.prompt = prompt;
module.exports.limpar = limpar;
module.exports.extrairJSON = extrairJSON;
module.exports.BLOCOS = BLOCOS;
