/* DWG -> DXF no NAVEGADOR (27/11/2026): Worker separado que roda o LibreDWG em WebAssembly.
 *
 * Por que existe: a conversao de DWG so existia no OrcaPRO instalado (/__dwg/converter, ODA ou AutoCAD na maquina).
 * Na versao online (GitHub Pages) a rota nao existe e o vinculo parava com "erro 405" — a cliente do Hidro nao
 * conseguia trazer o DWG. Aqui o arquivo e convertido no proprio navegador e NAO sai da maquina.
 *
 * Licenca: este arquivo, libredwg-web.js e libredwg-web.wasm formam um programa separado sob a GPLv3 (COPYING.txt).
 * Ele roda num Worker proprio e conversa com o OrcaPRO so por mensagens (bytes do DWG entram, bytes do DXF saem),
 * do mesmo jeito que o dxf2dwg do LibreDWG roda como PROCESSO SEPARADO no app instalado (server/dwg.js).
 * Fonte: LibreDWG https://www.gnu.org/software/libredwg/ · ligacao WebAssembly @mlightcad/libredwg-web 0.9.4
 * (https://github.com/mlightcad/libredwg-web), arquivos da pasta wasm/ sem modificacao.
 */
import createModule from "./libredwg-web.js";

var modulo = null;
function carregar() {
  if (!modulo) modulo = createModule({ locateFile: function (nome) { return new URL(nome, import.meta.url).href; } });
  return modulo;
}

self.onmessage = function (ev) {
  var id = ev.data && ev.data.id, buf = ev.data && ev.data.buf;
  carregar().then(function (m) {
    var ent = "in-" + id + ".dwg", sai = "out-" + id + ".dxf";
    try {
      m.FS.writeFile(ent, new Uint8Array(buf));
      var err = m.dwg_write_dxf(ent, sai);
      /* o LibreDWG devolve aviso (bit baixo) mesmo quando converte; o que vale e o DXF ter saido */
      var ok = m.FS.analyzePath(sai, false).exists;
      if (!ok) { self.postMessage({ id: id, ok: false, erro: "o LibreDWG nao conseguiu ler este DWG (codigo " + err + ")" }); return; }
      var out = m.FS.readFile(sai);
      var ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
      self.postMessage({ id: id, ok: true, dxf: ab, codigo: err }, [ab]);
    } catch (e) {
      self.postMessage({ id: id, ok: false, erro: String(e && e.message || e) });
    } finally {
      try { if (m.FS.analyzePath(ent, false).exists) m.FS.unlink(ent); } catch (e1) {}
      try { if (m.FS.analyzePath(sai, false).exists) m.FS.unlink(sai); } catch (e2) {}
    }
  }, function (e) {
    modulo = null;
    self.postMessage({ id: id, ok: false, erro: "nao carreguei o conversor (" + String(e && e.message || e) + ")" });
  });
};
