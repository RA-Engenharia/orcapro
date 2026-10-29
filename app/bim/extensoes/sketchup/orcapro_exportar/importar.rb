# encoding: UTF-8
# =====================================================================
# OrçaPRO — Importar do OrçaPRO (SketchUp 2017+)                v1.1.0
#
# Lê o arquivo `<projeto>.orcapro-su.json` que o OrçaPRO grava em
# BIM › Arquivo › Enviar para › SketchUp e monta o modelo AQUI, com as
# informações de cada peça:
#   · um GRUPO por peça (paredes, pisos, forros, cobertura, estrutura…), com o
#     nome da peça, a etiqueta (tag) "<Disciplina> - <Categoria>" e o material;
#   · um COMPONENTE por família+tipo (a mesma janela/porta/louça repetida = uma
#     definição só, colocada várias vezes — editar uma muda todas);
#   · materiais com cor e opacidade, de nome estável ("OrcaPRO · <nome>");
#   · o dicionário de atributos "OrcaPRO" (Id, GlobalId, Categoria, ClasseIFC,
#     Disciplina, Família, Tipo, Marca, Comentários, Fase, Código de orçamento,
#     Nível, Ambiente, Material) e "OrcaPRO_Parametros" (TODOS os parâmetros
#     das Propriedades do OrçaPRO, "Grupo | Nome" => valor);
#   · a classificação IFC do SketchUp (IFC 4) de cada peça;
#   · cenas: 3D e uma planta por nível.
# Unidade: o arquivo vem em METROS, eixo Y para cima (como o three.js); o
# SketchUp é Z para cima: (x, y, z) -> (x, -z, y), e converte para polegadas.
#
# IDEMPOTENTE: tudo vai dentro de UM grupo "OrçaPRO — <projeto>"; importar de
# novo apaga o grupo anterior (e as definições que ele criou) e refaz — não
# duplica. A operação inteira é UMA ação desfazível (Ctrl+Z).
# =====================================================================
require 'json'

module OrcaPRO
  module Importar
    VERSAO = '1.1.0'  # igual a ext.version do registrador (orcapro_exportar.rb); tools/test-sketchup-rbz.js confere
    POL = 39.37007874015748  # polegadas por metro
    DIC = 'OrcaPRO'
    DIC_PAR = 'OrcaPRO_Parametros'
    DIC_IMP = 'OrcaPRO_Importacao'

    # (x, y, z) do OrçaPRO (Y para cima, metros) -> ponto do SketchUp (Z para cima, polegadas)
    def self.ponto(x, y, z)
      Geom::Point3d.new(x * POL, -z * POL, y * POL)
    end

    # matriz do OrçaPRO (16, ordem de coluna, metros) -> Geom::Transformation do SketchUp (mesmo mundo, Z para cima)
    def self.transf(m)
      w = Geom::Transformation.new([m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12] * POL, m[13] * POL, m[14] * POL, m[15]])
      c = Geom::Transformation.new([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1])  # x->x, y->z, z->-y
      c * w * c.inverse
    end

    def self.aplicar_matriz(m, p)
      [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]
    end

    # Duas faces vizinhas SÃO a mesma face? Normal igual e todos os vértices na mesma superfície (0,0025 mm).
    # ⚠ Tolerância larga demais aqui apaga face: apagar a aresta entre duas faces "quase" coplanares
    # (folha de planta, curva facetada) leva as DUAS faces junto — foi o que encolheu 12 plantas na 1ª prova (0,27 m).
    def self.coplanares?(f1, f2)
      return false unless f1.normal.dot(f2.normal) > 1.0 - 1e-10
      pl = f1.plane
      f2.vertices.all? { |v| v.position.distance_to_plane(pl) < 1e-4 }
    end

    # Faz as faces de uma lista de triângulos (posicoes planas em m, indices) dentro de `ents`.
    # Devolve [faces, arestas_unidas]. Os triângulos coplanares do mesmo material voltam a ser UMA face.
    def self.faces_de(ents, pos, idx, material, matriz = nil)
      mesh = Geom::PolygonMesh.new
      mapa = {}
      n = pos.length / 3
      ids = Array.new(n)
      n.times do |i|
        p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
        p = aplicar_matriz(matriz, p) if matriz
        k = [p[0].round(5), p[1].round(5), p[2].round(5)]
        ids[i] = (mapa[k] ||= mesh.add_point(ponto(p[0], p[1], p[2])))
      end
      tris = 0
      (0...(idx.length / 3)).each do |t|
        a, b, c = ids[idx[t * 3]], ids[idx[t * 3 + 1]], ids[idx[t * 3 + 2]]
        next if a == b || b == c || a == c
        pa, pb, pc = mesh.point_at(a), mesh.point_at(b), mesh.point_at(c)
        next if ((pb - pa).cross(pc - pa)).length < 1e-6  # triângulo sem área (polegadas²)
        mesh.add_polygon(a, b, c)
        tris += 1
      end
      return [0, 0] if tris == 0
      antes = ents.grep(Sketchup::Face).length
      ents.add_faces_from_mesh(mesh, 0, material, material)
      faces = ents.grep(Sketchup::Face)
      unidas = 0
      faces.each do |f|
        next unless f.valid?
        f.edges.each do |e|
          next unless e.valid? && e.faces.length == 2
          f1, f2 = e.faces
          next unless f1.material == f2.material && coplanares?(f1, f2)
          e.erase!
          unidas += 1
        end
      end
      [ents.grep(Sketchup::Face).length - antes, unidas]
    end

    def self.valor_attr(v)
      case v
      when nil then ''
      when Integer, Float, String, true, false then v
      else v.to_s
      end
    end

    def self.gravar_atributos(ent, atr, extras = {})
      (atr || {}).each do |dic, h|
        next unless h.is_a?(Hash)
        h.each { |k, v| ent.set_attribute(dic.to_s, k.to_s, valor_attr(v)) }
      end
      extras.each { |k, v| ent.set_attribute(DIC_IMP, k.to_s, valor_attr(v)) }
    end

    # classificação IFC do SketchUp: acha o esquema IFC 4 (ou 2x3) já carregado; carrega o que vem com o programa se faltar
    def self.esquema_ifc(model)
      nomes = []
      model.classifications.each { |s| nomes << s.name } rescue nil
      achou = nomes.find { |n| n =~ /IFC\s*4/i } || nomes.find { |n| n =~ /IFC/i }
      return achou if achou
      pasta = nil
      begin
        base = File.dirname(Sketchup.find_support_file('SketchUp.exe')) rescue nil
        base = File.dirname(Sketchup.find_support_file('Plugins')) if base.nil?
        [File.join(base.to_s, 'ShippedClassifications'), File.join(base.to_s, '..', 'ShippedClassifications')].each { |d| pasta = d if File.directory?(d) }
      rescue StandardError
      end
      if pasta
        %w[IFC4.skc].each do |arq|
          cam = File.join(pasta, arq)
          model.classifications.load_schema(cam) if File.exist?(cam)
        end
        nomes = []
        model.classifications.each { |s| nomes << s.name }
        return nomes.find { |n| n =~ /IFC\s*4/i } || nomes.find { |n| n =~ /IFC/i }
      end
      nil
    rescue StandardError
      nil
    end

    def self.classificar(ent, esquema, ifc, est)
      return unless esquema && ifc && !ifc.to_s.empty?
      alvo = ent.respond_to?(:definition) ? ent.definition : ent
      ok = alvo.add_classification(esquema, ifc.to_s)
      if ok
        est[:classificados] += 1
      else
        est[:sem_classe] << ifc.to_s unless est[:sem_classe].include?(ifc.to_s)
      end
    rescue StandardError => e
      est[:sem_classe] << "#{ifc} (#{e.message[0, 40]})" unless est[:sem_classe].include?(ifc.to_s)
    end

    def self.limpar_anterior(model)
      n = 0
      model.entities.to_a.each do |e|
        next unless e.valid? && e.respond_to?(:get_attribute)
        if e.get_attribute(DIC_IMP, 'raiz', false)
          e.erase!
          n += 1
        end
      end
      # as definições que a importação anterior criou e que ninguém mais usa
      model.definitions.to_a.each do |d|
        next unless d.valid? && d.get_attribute(DIC_IMP, 'definicao', false)
        next unless d.instances.empty?
        if model.definitions.respond_to?(:remove)
          model.definitions.remove(d) rescue nil
        else
          d.entities.clear! rescue nil
          d.name = "OrcaPRO-antiga-#{d.entityID}" rescue nil
        end
      end
      n
    end

    # Importa. Devolve um Hash com as contagens (também escrito no relatório da tela).
    def self.importar_de(caminho, model = Sketchup.active_model, opcoes = {})
      t0 = Time.now
      doc = JSON.parse(File.read(caminho, encoding: 'UTF-8'))
      raise 'Este arquivo não é do OrçaPRO (formato OrcaPRO-Malha).' unless doc['formato'] == 'OrcaPRO-Malha'
      raise 'O arquivo não traz as peças enviadas pelo OrçaPRO (falta "objetos").' unless doc['objetos'].is_a?(Array)
      est = { pecas: 0, grupos: 0, instancias: 0, definicoes: 0, materiais: 0, etiquetas: 0, faces: 0, classificados: 0, sem_classe: [], cenas: 0, ignoradas: 0, avisos: [] }
      model.start_operation('OrçaPRO — Importar do OrçaPRO', true)
      begin
        removidos = limpar_anterior(model)
        est[:substituiu] = removidos

        # --- materiais
        mats = {}
        (doc['materiais'] || []).each do |m|
          mat = model.materials[m['nome']] || model.materials.add(m['nome'])
          c = m['cor'] || [200, 204, 210]
          mat.color = Sketchup::Color.new(c[0].to_i, c[1].to_i, c[2].to_i)
          mat.alpha = (m['opacidade'] || 1.0).to_f
          mats[m['nome']] = mat
          est[:materiais] += 1
        end

        # --- etiquetas (tags)
        tags = {}
        (doc['etiquetas'] || []).each do |t|
          tags[t['nome']] = model.layers[t['nome']] || model.layers.add(t['nome'])
          est[:etiquetas] += 1
        end
        achar_tag = lambda { |nome| nome.to_s.empty? ? nil : (tags[nome] ||= (model.layers[nome] || model.layers.add(nome))) }

        # --- o grupo-raiz (tudo da importação mora aqui: reimportar apaga e refaz)
        raiz = model.entities.add_group
        raiz.name = "OrçaPRO — #{doc['modelo']}"
        raiz.set_attribute(DIC_IMP, 'raiz', true)
        raiz.set_attribute(DIC_IMP, 'extensao', VERSAO)
        raiz.set_attribute(DIC_IMP, 'projeto', doc['modelo'].to_s)
        raiz.set_attribute(DIC_IMP, 'criadoEm', doc['criadoEm'].to_s)
        raiz.set_attribute(DIC_IMP, 'versaoOrcaPRO', doc['versaoPrograma'].to_s)

        esquema = esquema_ifc(model)
        est[:esquema_ifc] = esquema

        # --- definições (componentes de família)
        defs = {}
        (doc['definicoes'] || []).each do |d|
          defn = model.definitions.add(d['nome'])
          defn.set_attribute(DIC_IMP, 'definicao', true)
          defn.set_attribute(DIC, 'Familia', d['familia'].to_s)
          defn.set_attribute(DIC, 'Tipo', d['tipo'].to_s)
          defn.set_attribute(DIC, 'ClasseIFC', d['ifc'].to_s)
          (d['partes'] || []).each do |p|
            r = faces_de(defn.entities, p['posicoes'], p['indices'], mats[p['material']], p['matriz'])
            est[:faces] += r[0]
          end
          defs[d['nome']] = defn
          est[:definicoes] += 1
        end

        # --- peças
        doc['objetos'].each do |o|
          est[:pecas] += 1
          ent = nil
          if o['instancia']
            defn = defs[o['instancia']['definicao']]
            unless defn
              est[:avisos] << "peça #{o['id']}: definição #{o['instancia']['definicao']} não existe"
              est[:ignoradas] += 1
              next
            end
            ent = raiz.entities.add_instance(defn, transf(o['instancia']['matriz']))
            est[:instancias] += 1
          else
            g = raiz.entities.add_group
            r = faces_de(g.entities, o['posicoes'] || [], o['indices'] || [], mats[o['material']])
            if r[0] == 0
              g.erase!
              est[:ignoradas] += 1
              next
            end
            est[:faces] += r[0]
            ent = g
            est[:grupos] += 1
          end
          ent.name = o['nome'].to_s
          tag = achar_tag.call(o['tag'])
          ent.layer = tag if tag
          mt = mats[o['material']]
          ent.material = mt if mt && !o['instancia']
          gravar_atributos(ent, o['atributos'], 'id' => o['id'], 'tag' => o['tag'])
          classificar(ent, esquema, o['ifc'], est)
        end

        # --- cenas
        est[:cenas] = criar_cenas(model, doc, raiz)
        model.commit_operation
      rescue StandardError, ScriptError => e
        model.abort_operation
        raise e
      end
      est[:segundos] = (Time.now - t0).round(1)
      est
    end

    # cena 3D (isométrica) + uma planta por nível (câmera de cima, paralela, plano de corte a 1,20 m do piso)
    def self.criar_cenas(model, doc, raiz)
      n = 0
      bb = raiz.bounds
      return 0 if bb.empty?
      c = bb.center
      diag = bb.diagonal
      pages = model.pages
      (model.options['PageOptions']['ShowTransition'] = false) rescue nil
      # 3D
      eye = Geom::Point3d.new(c.x + diag * 0.6, c.y - diag * 0.9, c.z + diag * 0.7)
      model.active_view.camera = Sketchup::Camera.new(eye, c, Geom::Vector3d.new(0, 0, 1))
      model.active_view.zoom_extents rescue nil
      nome3d = 'OrçaPRO - 3D'
      (pg = pages[nome3d]) && pages.erase(pg)
      pg3n = pages.add(nome3d)
      pg3n.transition_time = 0 rescue nil
      n += 1
      (doc['cenas'] || []).each do |cena|
        next unless cena['tipo'] == 'planta'
        z = (cena['corte'].to_f) * POL
        nome = cena['nome'].to_s
        (old = model.entities.grep(Sketchup::SectionPlane).find { |s| s.name == nome }) && old.erase!
        sp = model.entities.add_section_plane([c.x, c.y, z], [0, 0, -1])
        sp.name = nome
        sp.activate
        topo = Geom::Point3d.new(c.x, c.y, bb.max.z + diag)
        cam = Sketchup::Camera.new(topo, Geom::Point3d.new(c.x, c.y, z), Geom::Vector3d.new(0, 1, 0))
        cam.perspective = false
        model.active_view.camera = cam
        model.active_view.zoom_extents rescue nil
        (pg = pages[nome]) && pages.erase(pg)
        pgn = pages.add(nome)
        pgn.transition_time = 0 rescue nil  # sem animação: a cena abre direto (e o print da prova sai da cena certa)
        n += 1
      end
      # volta ao 3D sem corte
      model.entities.grep(Sketchup::SectionPlane).each { |s| s.deactivate rescue nil }
      pg3 = pages[nome3d]
      pages.selected_page = pg3 if pg3
      n
    end

    def self.comando
      arq = UI.openpanel('Importar do OrçaPRO', Dir.home, 'OrçaPRO (*.json)|*.json||')
      return unless arq
      Sketchup.status_text = 'OrçaPRO: importando…'
      r = importar_de(arq, Sketchup.active_model)
      Sketchup.status_text = ''
      msg = "Importado do OrçaPRO em #{r[:segundos]} s:\n\n" \
            "#{r[:pecas]} peça(s): #{r[:grupos]} grupo(s) e #{r[:instancias]} componente(s) de família (#{r[:definicoes]} definição(ões)).\n" \
            "#{r[:materiais]} material(is), #{r[:etiquetas]} etiqueta(s), #{r[:cenas]} cena(s).\n" \
            "Classificação IFC em #{r[:classificados]} peça(s).\n"
      msg += "#{r[:ignoradas]} peça(s) ignorada(s).\n" if r[:ignoradas] > 0
      msg += "\nAs informações de cada peça estão nos atributos do dicionário \"OrcaPRO\" (Janela > Informações da entidade > Classificador, ou Extensões > Desenvolvedor)."
      UI.messagebox(msg)
    rescue StandardError => e
      Sketchup.status_text = ''
      UI.messagebox("Não consegui importar: #{e.message}")
    end
  end
end
