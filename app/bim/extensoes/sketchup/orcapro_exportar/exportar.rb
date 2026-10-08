# encoding: UTF-8
# =====================================================================
# OrçaPRO — Exportar para OrçaPRO (SketchUp 2017+)            v1.0.0
#
# O .skp é formato fechado: o navegador não lê. Quem lê o .skp por inteiro é
# o próprio SketchUp — por isso a conversão acontece AQUI, e sai um .json no
# formato "OrcaPRO-Malha" v1 que o BIM do OrçaPRO abre em
# Arquivo › Importar de outros programas › SketchUp.
#
# O que vai, por peça (cada grupo/componente com faces próprias):
#   nome, definição (componente), etiqueta (tag/camada), material, cor,
#   opacidade, GUID persistente, caminho na hierarquia e TODOS os atributos
#   (dicionários da instância e da definição — inclusive a classificação IFC
#   e os atributos de componente dinâmico).
# Geometria em METROS, eixo Y para cima (o SketchUp é Z para cima; o
# OrçaPRO, como o three.js, é Y para cima): (x, y, z)su → (x, z, −y).
# Peça oculta ou em etiqueta desligada NÃO vai (o resumo diz quantas ficaram).
# =====================================================================
require 'json'

module OrcaPRO
  module Exportar
    POL_M = 0.0254  # o SketchUp guarda tudo em polegadas

    def self.cor_de(mat)
      return [200, 204, 210] unless mat
      c = mat.color
      [c.red, c.green, c.blue]
    end

    def self.valor_json(v)
      case v
      when nil, true, false, Integer, String then v
      when Float then v.finite? ? v : v.to_s
      when Array then v.map { |x| valor_json(x) }
      else v.to_s
      end
    end

    def self.atributos_de(ent)
      out = {}
      dicts = ent.attribute_dictionaries
      return out unless dicts
      dicts.each do |d|
        h = {}
        d.each_pair { |k, v| h[k.to_s] = valor_json(v) }
        out[d.name.to_s] = h unless h.empty?
      end
      out
    end

    def self.visivel?(ent)
      return false if ent.respond_to?(:hidden?) && ent.hidden?
      lay = ent.respond_to?(:layer) ? ent.layer : nil
      return false if lay && lay.respond_to?(:visible?) && !lay.visible?
      true
    end

    def self.nome_tag(ent)
      lay = ent.respond_to?(:layer) ? ent.layer : nil
      return '' unless lay
      lay.respond_to?(:display_name) ? lay.display_name.to_s : lay.name.to_s
    end

    # Percorre as entidades. `obj` é a peça que recebe as faces soltas deste nível.
    def self.percorrer(ents, tr, obj, mat_herdado, caminho, est)
      ents.each do |e|
        if e.is_a?(Sketchup::Face)
          next unless visivel?(e)
          adicionar_face(e, tr, obj, mat_herdado)
        elsif e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          unless visivel?(e)
            est[:ocultos] += 1
            next
          end
          defn = e.definition
          nome = e.name.to_s
          nome = defn.name.to_s if nome.empty?
          mat = e.material || mat_herdado
          atr = atributos_de(defn).merge(atributos_de(e)) { |_, a, b| a.merge(b) }
          novo = {
            'nome' => nome, 'definicao' => defn.name.to_s, 'tag' => nome_tag(e),
            'material' => (mat ? mat.display_name.to_s : ''), 'atributos' => atr,
            'guid' => (e.respond_to?(:guid) ? e.guid.to_s : ''),
            'caminho' => (caminho + [nome]).join(' › '),
            '_pos' => [], '_idx' => [], '_area_mat' => {}, '_mat' => mat
          }
          est[:pecas] << novo
          percorrer(defn.entities, tr * e.transformation, novo, mat, caminho + [nome], est)
        end
      end
    end

    def self.adicionar_face(face, tr, obj, mat_herdado)
      mat = face.material || mat_herdado
      malha = face.mesh(0)
      base = obj['_pos'].length / 3
      n = malha.count_points
      (1..n).each do |i|
        p = malha.point_at(i).transform(tr)
        obj['_pos'] << (p.x * POL_M).round(5) << (p.z * POL_M).round(5) << (-p.y * POL_M).round(5)
      end
      malha.polygons.each do |pol|
        next unless pol.length == 3
        obj['_idx'] << (base + pol[0].abs - 1) << (base + pol[1].abs - 1) << (base + pol[2].abs - 1)
      end
      chave = mat ? mat.display_name.to_s : ''
      obj['_area_mat'][chave] = (obj['_area_mat'][chave] || 0) + face.area
      obj['_mats'] ||= {}
      obj['_mats'][chave] = mat
    end

    # Gera o .json. Devolve { ok:, pecas:, triangulos:, ocultos:, caminho: }
    def self.exportar_para(caminho_arq, model = Sketchup.active_model, so_selecao = false)
      est = { pecas: [], ocultos: 0 }
      solta = { 'nome' => 'Geometria solta', 'definicao' => '', 'tag' => '', 'material' => '', 'atributos' => {},
                'guid' => '', 'caminho' => 'Modelo', '_pos' => [], '_idx' => [], '_area_mat' => {}, '_mat' => nil }
      ents = so_selecao ? model.selection.to_a : model.entities.to_a
      percorrer(ents, Geom::Transformation.new, solta, nil, [], est)
      todas = [solta] + est[:pecas]
      objetos = []
      tri = 0
      todas.each do |o|
        next if o['_idx'].empty?
        # a cor da peça = a do material que cobre a maior área dela
        dom = o['_area_mat'].max_by { |_, a| a }
        mat = dom && o['_mats'] ? o['_mats'][dom[0]] : o['_mat']
        o['material'] = dom[0] if dom && !dom[0].empty?
        alpha = mat && mat.respond_to?(:alpha) ? mat.alpha.to_f : 1.0
        tri += o['_idx'].length / 3
        objetos << {
          'nome' => o['nome'], 'definicao' => o['definicao'], 'tag' => o['tag'], 'material' => o['material'],
          'cor' => cor_de(mat), 'opacidade' => alpha.round(3), 'atributos' => o['atributos'], 'guid' => o['guid'],
          'caminho' => o['caminho'], 'posicoes' => o['_pos'], 'indices' => o['_idx']
        }
      end
      doc = {
        'formato' => 'OrcaPRO-Malha', 'versao' => 1, 'programa' => 'SketchUp',
        'versaoPrograma' => Sketchup.version.to_s, 'extensao' => '1.0.0',
        'modelo' => (model.title.to_s.empty? ? 'Modelo SketchUp' : model.title.to_s),
        'arquivo' => model.path.to_s, 'unidade' => 'm', 'eixoY' => 'cima',
        'criadoEm' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'resumo' => { 'pecas' => objetos.length, 'triangulos' => tri, 'ocultosNaoExportados' => est[:ocultos] },
        'objetos' => objetos
      }
      File.open(caminho_arq, 'w:UTF-8') { |f| f.write(JSON.generate(doc)) }
      { ok: true, pecas: objetos.length, triangulos: tri, ocultos: est[:ocultos], caminho: caminho_arq }
    end

    def self.comando
      model = Sketchup.active_model
      so_sel = false
      unless model.selection.empty?
        r = UI.messagebox("Exportar só a seleção (#{model.selection.length} item(ns))?\n\nSim = só a seleção · Não = o modelo inteiro", MB_YESNOCANCEL)
        return if r == IDCANCEL
        so_sel = (r == IDYES)
      end
      base = model.title.to_s.empty? ? 'modelo' : model.title.to_s
      dir = model.path.to_s.empty? ? nil : File.dirname(model.path)
      arq = UI.savepanel('Exportar para OrçaPRO', dir, "#{base}.orcapro.json")
      return unless arq
      arq += '.json' unless arq =~ /\.json\z/i
      Sketchup.status_text = 'OrçaPRO: exportando…'
      t0 = Time.now
      r = exportar_para(arq, model, so_sel)
      Sketchup.status_text = ''
      msg = "Exportado para o OrçaPRO em #{(Time.now - t0).round(1)} s:\n\n" \
            "#{r[:pecas]} peça(s), #{r[:triangulos]} triângulos.\n"
      msg += "#{r[:ocultos]} peça(s) oculta(s) ou em etiqueta desligada ficaram de fora.\n" if r[:ocultos] > 0
      msg += "\nNo OrçaPRO: BIM › Arquivo › Importar de outros programas › SketchUp › Importar o .json.\n\n#{r[:caminho]}"
      UI.messagebox(msg)
    rescue StandardError => e
      Sketchup.status_text = ''
      UI.messagebox("Não consegui exportar: #{e.message}")
    end

    unless file_loaded?(__FILE__)
      sub = UI.menu('Extensions').add_submenu('OrçaPRO')
      sub.add_item('Exportar para OrçaPRO…') { comando }
      file_loaded(__FILE__)
    end
  end
end
