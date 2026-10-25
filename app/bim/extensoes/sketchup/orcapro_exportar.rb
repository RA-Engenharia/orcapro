# encoding: UTF-8
# OrçaPRO — Exportar para OrçaPRO (extensão do SketchUp)
# Registra a extensão; o código fica em orcapro_exportar/exportar.rb.
# O .rbz NÃO se monta à mão: node tools/gerar-rbz-sketchup.js (o teste test-sketchup-rbz.js confere).
require 'sketchup.rb'
require 'extensions.rb'

module OrcaPRO
  module Exportar
    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('OrçaPRO — Exportar para OrçaPRO', 'orcapro_exportar/exportar')
      ext.description = 'Exporta o modelo (grupos, componentes, etiquetas, materiais e atributos) ' \
                        'para o BIM do OrçaPRO, sem perder a identidade de cada peça.'
      ext.version = '1.0.1'
      ext.creator = 'RA Engenharia — OrçaPRO'
      ext.copyright = '2026 RA Engenharia'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
