/* =====================================================================
 * resumocliente.js — O AVISO SEMANAL PARA O CLIENTE
 *
 * O Portal só existe se o cliente lembrar de abrir. Um recado semanal
 * ("sua obra andou 4,2% esta semana, 3 diários, 12 fotos") transforma um site
 * que ele esquece num canal que ele acompanha.
 *
 * ------------------------------------------------------------------
 * ⚠ ESTE MÓDULO NASCE COM MEDO, E O MEDO TEM NOME.
 *
 * O canal de avisos deste sistema já disparou **cerca de 5.500 mensagens
 * repetidas** — 1.509 delas sobre o MESMO pedido — porque não havia trava de
 * idempotência: cada passagem do laço reenviava tudo o que continuava
 * "pendente". Ninguém percebeu por semanas; quem recebeu foi o dono.
 *
 * Por isso, aqui, TRÊS regras que não podem cair:
 *
 * 1) A TRAVA VEM ANTES DA PRIMEIRA LINHA DE ENVIO. `podeEnviar()` é
 *    consultado antes de compor a mensagem, não depois. Quem chamar este
 *    módulo e ignorar o `pode:false` está reintroduzindo o defeito.
 *
 * 2) A CHAVE É DETERMINÍSTICA E GROSSA: obra + semana (a segunda-feira). Duas
 *    tentativas na mesma semana, para a mesma obra, são o MESMO aviso — não
 *    importa se o app reiniciou, se o usuário clicou duas vezes ou se a
 *    sincronização trouxe o registro de outro aparelho.
 *
 * 3) MARCA-SE A TENTATIVA, NÃO O SUCESSO. Se o envio falhar no meio, o
 *    registro fica como `tentado` e a semana continua travada até alguém
 *    liberar de propósito (`liberar()`). É deliberado: o custo de um aviso
 *    que não chegou é o cliente não ler uma vez; o custo de reenviar em laço
 *    é o que já aconteceu.
 *
 * Módulo PURO — não envia nada, não toca em rede, não toca em Store. Devolve
 * texto e veredito; quem envia e quem grava é quem chama.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function br(n, dec) {
    var d = dec === undefined ? 1 : dec;
    var x = Math.round(num(n) * Math.pow(10, d)) / Math.pow(10, d);
    return String(x).replace(".", ",");
  }
  function dataBR(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  }
  /* a semana é a SEGUNDA-FEIRA — a mesma chave do Last Planner e do
     Fisico.serie. Três numerações de semana no mesmo produto fariam o aviso
     do cliente discordar do relatório que ele abriria em seguida. */
  function segundaDe(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return "";
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    if (!isFinite(d.getTime())) return "";
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function maisDias(iso, n) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return "";
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /* -------------------------------------------------------------------
   * A CHAVE DE IDEMPOTÊNCIA. Grossa de propósito.
   * ----------------------------------------------------------------- */
  function chaveAviso(obraId, dataRef) {
    var seg = segundaDe(dataRef);
    if (!texto(obraId) || !seg) return "";
    return "sem|" + texto(obraId) + "|" + seg;
  }

  /* -------------------------------------------------------------------
   * A TRAVA. Consultar ANTES de compor e de enviar.
   *
   * `registro` é o que ficou guardado da última vez daquela chave:
   *   { chave, em, canal, estado: "enviado" | "tentado" }
   * ----------------------------------------------------------------- */
  function podeEnviar(registro, opc) {
    var o = opc || {};
    if (!registro) return { pode: true, motivo: "" };
    if (o.forcar === true) return { pode: true, motivo: "liberado-manualmente", jaEm: registro.em || "" };
    if (registro.estado === "enviado") {
      return { pode: false, motivo: "ja-enviado", jaEm: registro.em || "",
               explicacao: "O aviso desta semana para esta obra já foi enviado em " + (dataBR(registro.em) || "data desconhecida") + "." };
    }
    if (registro.estado === "tentado") {
      return { pode: false, motivo: "tentativa-anterior", jaEm: registro.em || "",
               explicacao: "Houve uma tentativa de envio em " + (dataBR(registro.em) || "data desconhecida") +
                 " que não confirmou. Confira se o cliente recebeu antes de mandar de novo — reenviar em laço é o defeito que já mandou milhares de mensagens repetidas aqui." };
    }
    return { pode: true, motivo: "" };
  }

  /* marca a TENTATIVA. Quem chama grava o retorno ANTES de disparar. */
  function marcarTentativa(chave, quando, canal) {
    return { chave: chave, em: quando || "", canal: texto(canal), estado: "tentado" };
  }
  function marcarEnviado(reg, quando) {
    var r = reg || {};
    return { chave: r.chave || "", em: quando || r.em || "", canal: r.canal || "", estado: "enviado" };
  }

  /* -------------------------------------------------------------------
   * O CONTEÚDO. `d` traz o que o app já sabe:
   *   { obra, cliente, semana (ISO da segunda), pctAntes, pctDepois,
   *     diarios, fotos, servicos:[{descricao,qtd,unidade}], ocorrencias,
   *     paralisacoes, proximaMedicao, link, previsao }
   * ----------------------------------------------------------------- */
  function resumo(d) {
    d = d || {};
    var seg = segundaDe(d.semana) || texto(d.semana);
    var fim = maisDias(seg, 6);
    var avanco = num(d.pctDepois) - num(d.pctAntes);
    var linhas = [];

    linhas.push("*" + (texto(d.obra) || "Sua obra") + "*");
    linhas.push("Resumo de " + dataBR(seg) + " a " + dataBR(fim));
    linhas.push("");

    /* ⚠ AVANÇO ZERO É NOTÍCIA, e tem de ser dito sem rodeio. Uma semana sem
       produção com um texto animado ("seguimos trabalhando!") é o tipo de
       mensagem que faz o cliente parar de acreditar em todas as outras. */
    if (avanco > 0.05) {
      linhas.push("📈 A obra avançou *" + br(avanco, 1) + "%* nesta semana.");
      linhas.push("Total concluído: *" + br(d.pctDepois, 1) + "%* do previsto.");
    } else if (num(d.diarios) > 0) {
      linhas.push("📋 Esta semana não houve avanço medido em serviços com quantidade prevista.");
      linhas.push("Total concluído segue em *" + br(d.pctDepois, 1) + "%* do previsto.");
    } else {
      linhas.push("📋 Nenhum diário foi registrado nesta semana.");
    }
    linhas.push("");

    var partes = [];
    if (num(d.diarios)) partes.push(num(d.diarios) + " diário(s) publicado(s)");
    if (num(d.fotos)) partes.push(num(d.fotos) + " foto(s)");
    if (partes.length) { linhas.push("🗂️ " + partes.join(" · ")); linhas.push(""); }

    var sv = (d.servicos || []).slice(0, 5);
    if (sv.length) {
      linhas.push("*O que foi executado:*");
      sv.forEach(function (s) {
        linhas.push("• " + texto(s.descricao) + (num(s.qtd) ? " — " + br(s.qtd, 2) + " " + texto(s.unidade) : ""));
      });
      if ((d.servicos || []).length > sv.length) {
        linhas.push("• …e mais " + ((d.servicos || []).length - sv.length) + " serviço(s) — veja no portal.");
      }
      linhas.push("");
    }

    /* o que deu errado vai JUNTO. Aviso que só conta a parte boa é
       propaganda, e o cliente descobre a parte ruim depois — pior. */
    if (num(d.paralisacoes)) {
      linhas.push("⛔ " + num(d.paralisacoes) + " dia(s) com serviço paralisado.");
    }
    if (num(d.ocorrencias)) {
      linhas.push("⚠️ " + num(d.ocorrencias) + " ocorrência(s) registrada(s) — detalhes no diário.");
    }
    if (num(d.paralisacoes) || num(d.ocorrencias)) linhas.push("");

    if (d.previsao && d.previsao.ok && d.previsao.dataProvavel) {
      linhas.push("🎯 Projeção de término: *" + dataBR(d.previsao.dataProvavel) + "*" +
        (d.previsao.situacao === "atrasada" ? " (acima do prazo contratado)" : "") + ".");
      linhas.push("_Projeção pelo ritmo atual, não é compromisso de prazo._");
      linhas.push("");
    }

    if (texto(d.link)) {
      linhas.push("👉 Acompanhe tudo no portal:");
      linhas.push(texto(d.link));
    }

    return {
      chave: chaveAviso(d.obraId, seg),
      semana: seg, semanaFim: fim,
      avanco: Math.round(avanco * 10) / 10,
      texto: linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      /* `vazio` diz a quem chama que não há o que contar: mandar um aviso
         "nada aconteceu" toda semana treina o cliente a ignorar o canal */
      vazio: !num(d.diarios) && avanco <= 0.05 && !num(d.ocorrencias) && !num(d.paralisacoes)
    };
  }

  var ResumoCliente = {
    chaveAviso: chaveAviso, podeEnviar: podeEnviar,
    marcarTentativa: marcarTentativa, marcarEnviado: marcarEnviado,
    segundaDe: segundaDe, resumo: resumo
  };
  global.ResumoCliente = ResumoCliente;
  if (typeof module !== "undefined" && module.exports) module.exports = ResumoCliente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
