/* =====================================================================
 * feriados.js — calendário de feriados brasileiros para o cronograma.
 *
 * POR QUE EXISTE: até aqui o cronograma contava DIAS ÚTEIS por semana (5, 6
 * ou 7) e não conhecia feriado nenhum. Uma obra que atravessa Carnaval,
 * Semana Santa, Corpus Christi e as datas de fim de ano entrega DEZ dias
 * depois da data que o app imprimia — e essa data ia para a proposta
 * comercial, que o cliente lê como promessa.
 *
 * ⚠ NACIONAL ≠ FACULTATIVO, e a diferença está marcada em cada linha. Carnaval
 *   (segunda e terça) e Corpus Christi NÃO são feriados nacionais por lei:
 *   são ponto facultativo federal. Na obra, porém, a equipe não aparece — por
 *   isso entram por padrão, mas identificados, para quem trabalha nesses dias
 *   poder tirá-los. Inventar que são feriado legal seria mentir num documento
 *   assinado; escondê-los seria prometer uma data que a obra não cumpre.
 *
 * ⚠ 20 DE NOVEMBRO é feriado NACIONAL desde a Lei 14.759/2023. Antes disso era
 *   municipal em parte do país; para anos anteriores a 2024 sai como
 *   facultativo, porque em 2022 a obra em Belo Horizonte parava e a de
 *   Uberlândia não.
 *
 * O que NÃO está aqui: feriado estadual e municipal. São centenas, mudam por
 * lei local todo ano, e chutar a lista erraria em silêncio. Eles entram como
 * `extras` — digitados pela pessoa, que sabe onde a obra fica.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function chave(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function mais(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  var Feriados = {

    chave: chave,

    /* Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Butcher).
       É daqui que saem Carnaval (−48/−47), Sexta-feira Santa (−2) e Corpus
       Christi (+60) — as quatro datas que mudam de lugar todo ano e que, por
       isso, ninguém lembra de descontar do prazo à mão. */
    pascoa: function (ano) {
      var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
      var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
      var i = Math.floor(c / 4), k = c % 4;
      var l = (32 + 2 * e + 2 * i - h - k) % 7;
      var m = Math.floor((a + 11 * h + 22 * l) / 451);
      var mes = Math.floor((h + l - 7 * m + 114) / 31);
      var dia = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(ano, mes - 1, dia);
    },

    // Todos os feriados de um ano, em ordem de data.
    doAno: function (ano) {
      var p = this.pascoa(ano), L = [];
      function fixo(mes, dia, nome, tipo) { L.push({ data: ano + "-" + dd(mes) + "-" + dd(dia), nome: nome, tipo: tipo || "nacional" }); }
      function movel(off, nome, tipo) { L.push({ data: chave(mais(p, off)), nome: nome, tipo: tipo || "nacional" }); }
      fixo(1, 1, "Confraternização Universal");
      movel(-48, "Carnaval (segunda)", "facultativo");
      movel(-47, "Carnaval (terça)", "facultativo");
      movel(-2, "Sexta-feira Santa");
      fixo(4, 21, "Tiradentes");
      fixo(5, 1, "Dia do Trabalho");
      movel(60, "Corpus Christi", "facultativo");
      fixo(9, 7, "Independência do Brasil");
      fixo(10, 12, "Nossa Senhora Aparecida");
      fixo(11, 2, "Finados");
      fixo(11, 15, "Proclamação da República");
      // nacional só a partir da Lei 14.759/2023 — antes disso, municipal em parte do país
      fixo(11, 20, "Consciência Negra", ano >= 2024 ? "nacional" : "facultativo");
      fixo(12, 25, "Natal");
      L.sort(function (x, y) { return x.data < y.data ? -1 : (x.data > y.data ? 1 : 0); });
      return L;
    },

    /* Lista para um intervalo de anos + os extras digitados (municipais,
       estaduais, parada da empresa). `extras` aceita "2026-06-24" ou
       { data:"2026-06-24", nome:"São João" }; data inválida é IGNORADA e sai
       em `invalidos` — gravar um feriado que não existe deslocaria a entrega
       da obra por causa de um erro de digitação. */
    entre: function (anoIni, anoFim, extras, incluirFacultativos) {
      var L = [], vistos = {}, invalidos = [];
      var a1 = parseInt(anoIni, 10), a2 = parseInt(anoFim, 10);
      if (!isFinite(a1)) return { lista: [], invalidos: [] };
      if (!isFinite(a2) || a2 < a1) a2 = a1;
      if (a2 - a1 > 30) a2 = a1 + 30;   // guarda: cronograma de 30 anos não existe
      for (var a = a1; a <= a2; a++) {
        this.doAno(a).forEach(function (f) {
          if (f.tipo === "facultativo" && incluirFacultativos === false) return;
          if (vistos[f.data]) return; vistos[f.data] = 1; L.push(f);
        });
      }
      (extras || []).forEach(function (x) {
        var s = (x && x.data != null) ? String(x.data).trim() : String(x == null ? "" : x).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { if (s) invalidos.push(s); return; }
        var t = new Date(s + "T12:00:00");
        if (isNaN(t.getTime()) || chave(t) !== s) { invalidos.push(s); return; }
        if (vistos[s]) return; vistos[s] = 1;
        L.push({ data: s, nome: (x && x.nome) ? String(x.nome) : "Feriado local", tipo: "local" });
      });
      L.sort(function (x, y) { return x.data < y.data ? -1 : (x.data > y.data ? 1 : 0); });
      return { lista: L, invalidos: invalidos };
    },

    // { "2026-12-25": "Natal", … } — o formato que o motor consulta por dia
    mapa: function (lista) {
      var m = {};
      (lista || []).forEach(function (f) { m[f.data] = f.nome; });
      return m;
    }
  };

  global.Feriados = Feriados;
  if (typeof module !== "undefined" && module.exports) module.exports = Feriados;
})(typeof window !== "undefined" ? window : this);
