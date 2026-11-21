/* =====================================================================
 * cepui.js — FIAÇÃO do endereço pelo CEP e da lista de cidades por UF (motor: js/cep.js)
 *
 * Funciona por DELEGAÇÃO no documento: não precisa de código em cada formulário, só dos ids dos campos (tabela FORMS).
 * Quem não tem os campos na tela não sofre nada. Nada é chamado ao abrir o formulário:
 *   • CEP com 8 dígitos + ~600 ms sem digitar → UMA consulta ao ViaCEP (cache de 30 dias);
 *   • foco no campo Cidade com a UF escolhida → UMA consulta ao IBGE (lista da UF, cache de 30 dias) vira sugestão (datalist).
 * Preenche cidade e UF sempre (vêm do CEP); a rua só se o campo estiver VAZIO (não apaga o que a pessoa digitou); o código IBGE
 * do município vai para o campo `ibge` quando o formulário tem um. Cada resposta mostra a fonte. Falha de rede = recado e segue digitando.
 * ES5.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;
  if (!doc || !global.Cep) return;

  /* ids dos campos por formulário. cep dispara a busca; rua/bairro/cidade/uf/ibge são os destinos. */
  var FORMS = [
    { cep: "g-cep", rua: "g-end", cidade: "g-cidade", uf: "g-uf" },                                              /* cliente */
    { cep: "g-obracep", rua: "g-local", ruaFn: function (p) { return [p.logradouro, p.bairro].filter(Boolean).join(", "); }, cidade: "g-obracidade", uf: "g-obrauf", ibge: "g-obraibge" },   /* obra */
    { cidade: "g-cidade", uf: "g-uf" }                                                                          /* fornecedor (sem CEP): só a lista de cidades */
  ];
  var timer = null, cidadesCarregando = {};

  function el(id) { return id ? doc.getElementById(id) : null; }
  function formDoCampo(campo, chave) { var i; for (i = 0; i < FORMS.length; i++) if (FORMS[i][chave] && FORMS[i][chave] === campo.id && el(FORMS[i].uf)) return FORMS[i]; return null; }
  function msgDe(inputCep) {
    var m = inputCep.parentNode.querySelector("[data-cepmsg]");
    if (!m) { m = doc.createElement("div"); m.setAttribute("data-cepmsg", "1"); m.className = "muted"; m.style.cssText = "font-size:11.5px;margin-top:3px"; inputCep.parentNode.appendChild(m); }
    return m;
  }
  function escrever(campo, valor) { if (!campo) return; campo.value = valor; try { campo.dispatchEvent(new global.Event("change", { bubbles: true })); } catch (e) {} }

  function buscar(f, inputCep) {
    var cep = global.Cep.normalizar(inputCep.value), m = msgDe(inputCep);
    if (!cep) { m.textContent = ""; return; }
    m.textContent = "Consultando o CEP…"; m.style.color = "";
    global.Cep.consultarCep(cep).then(function (p) {
      if (!doc.body.contains(inputCep) || global.Cep.normalizar(inputCep.value) !== cep) return;   /* a pessoa já mudou/fechou */
      if (!p.ok) { m.textContent = p.erro; m.style.color = "#b45309"; return; }
      var cid = el(f.cidade), uf = el(f.uf), rua = el(f.rua), ib = el(f.ibge);
      escrever(cid, p.cidade); escrever(uf, p.uf);
      if (ib) ib.value = p.ibge;
      if (rua && !String(rua.value).replace(/\s/g, "")) escrever(rua, f.ruaFn ? f.ruaFn(p) : p.logradouro);
      m.style.color = "#166534";
      m.textContent = "✔ " + [p.logradouro, p.bairro].filter(Boolean).join(", ") + (p.logradouro || p.bairro ? " — " : "") + p.cidade + "/" + p.uf + (p.ibge ? " · IBGE " + p.ibge : "") + " · fonte: ViaCEP" + (p.deCache ? " (guardado neste computador)" : "");
    }, function (e) {
      if (!doc.body.contains(inputCep)) return;
      m.style.color = "#b45309"; m.textContent = e && e.message ? e.message : "Não consegui consultar o CEP — preencha à mão.";
    });
  }

  /* lista de municípios da UF como sugestão no campo Cidade; e o código IBGE quando o nome bate com um só município */
  function carregarCidades(f, inputCidade) {
    var uf = el(f.uf) ? el(f.uf).value : "";
    if (!uf || cidadesCarregando[uf]) return;
    cidadesCarregando[uf] = true;
    global.Cep.municipios(uf).then(function (r) {
      cidadesCarregando[uf] = false;
      if (!r.ok || !doc.body.contains(inputCidade)) return;
      var id = "cepui-dl-" + uf, dl = el(id);
      if (!dl) { dl = doc.createElement("datalist"); dl.id = id; dl.innerHTML = r.lista.map(function (m) { return '<option value="' + m.nome.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">'; }).join(""); doc.body.appendChild(dl); }
      inputCidade.setAttribute("list", id);
      inputCidade._cepLista = r.lista;
    }, function () { cidadesCarregando[uf] = false; /* sem rede: segue digitando à mão, sem recado a cada foco */ });
  }

  doc.addEventListener("input", function (e) {
    var t = e.target; if (!t || !t.id) return;
    var f = formDoCampo(t, "cep"); if (!f) return;
    clearTimeout(timer);
    timer = setTimeout(function () { buscar(f, t); }, 600);
  });
  doc.addEventListener("focusin", function (e) {
    var t = e.target; if (!t || !t.id) return;
    var f = formDoCampo(t, "cidade"); if (f) carregarCidades(f, t);
  });
  /* escolheu/digitou a cidade: o código IBGE acompanha, se o formulário tem o campo e a lista já veio */
  doc.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.id) return;
    var f = formDoCampo(t, "cidade"); if (!f || !f.ibge || !t._cepLista) return;
    var ib = el(f.ibge), cod = global.Cep.ibgeDe(t._cepLista, t.value);
    if (ib && cod) ib.value = cod;   /* nome que não casa NÃO apaga o código que o CEP trouxe */
  });

  global.CepUI = { FORMS: FORMS, _buscar: buscar };
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
