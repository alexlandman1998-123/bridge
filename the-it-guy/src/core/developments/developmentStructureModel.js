export const DEVELOPMENT_STRUCTURE_NODE_TYPES = Object.freeze({
  building: 'building',
  block: 'block',
  wing: 'wing',
  precinct: 'precinct',
  floor: 'floor',
  level: 'level',
  zone: 'zone',
})

export const DEVELOPMENT_STRUCTURE_TEMPLATES = Object.freeze([
  { id: 'estate', label: 'Estate / townhouse', nodeTypes: ['precinct'] },
  { id: 'apartment_blocks', label: 'Apartment blocks', nodeTypes: ['block', 'floor'] },
  { id: 'tower', label: 'Single tower', nodeTypes: ['building', 'floor'] },
  { id: 'hotel', label: 'Hotel / serviced apartments', nodeTypes: ['building', 'level', 'wing'] },
  { id: 'mixed_use', label: 'Mixed-use development', nodeTypes: ['building', 'zone', 'floor'] },
  { id: 'custom', label: 'Custom structure', nodeTypes: [] },
])

const NODE_TYPE_SET = new Set(Object.values(DEVELOPMENT_STRUCTURE_NODE_TYPES))
const TOP_LEVEL_NODE_TYPES = new Set(['building', 'block', 'precinct', 'zone'])
const LEVEL_NODE_TYPES = new Set(['floor', 'level'])

export function normalizeDevelopmentStructureNodeType(value = '') {
  const nodeType = String(value || '').trim().toLowerCase()
  return NODE_TYPE_SET.has(nodeType) ? nodeType : ''
}

export function getDevelopmentStructureTemplate(templateId = '') {
  const id = String(templateId || '').trim().toLowerCase()
  return DEVELOPMENT_STRUCTURE_TEMPLATES.find((template) => template.id === id) || DEVELOPMENT_STRUCTURE_TEMPLATES.at(-1)
}

export function getAllowedDevelopmentStructureChildTypes(parentType = '') {
  const normalizedParentType = normalizeDevelopmentStructureNodeType(parentType)
  if (!normalizedParentType) return [...TOP_LEVEL_NODE_TYPES]
  if (LEVEL_NODE_TYPES.has(normalizedParentType)) return ['wing', 'zone']
  if (['building', 'block', 'precinct', 'wing', 'zone'].includes(normalizedParentType)) {
    return ['building', 'block', 'wing', 'zone', 'floor', 'level']
  }
  return []
}

export function validateDevelopmentStructureNodes(nodes = []) {
  const errors = []
  const sourceNodes = Array.isArray(nodes) ? nodes : []
  const ids = new Set()
  const nodesById = new Map()

  sourceNodes.forEach((node, index) => {
    const id = String(node?.id || '').trim()
    const label = String(node?.label || '').trim()
    const nodeType = normalizeDevelopmentStructureNodeType(node?.nodeType || node?.node_type)
    if (!id) errors.push(`Structure node ${index + 1} needs an id.`)
    if (id && ids.has(id)) errors.push(`Structure node id ${id} is duplicated.`)
    if (id) ids.add(id)
    if (!label) errors.push(`Structure node ${index + 1} needs a label.`)
    if (!nodeType) errors.push(`Structure node ${label || index + 1} has an unsupported type.`)
    if (id) nodesById.set(id, { id, parentId: String(node?.parentId || node?.parent_id || '').trim(), nodeType, label })
  })

  nodesById.forEach((node) => {
    if (!node.parentId) return
    const parent = nodesById.get(node.parentId)
    if (!parent) {
      errors.push(`${node.label} references a missing parent.`)
      return
    }
    if (!getAllowedDevelopmentStructureChildTypes(parent.nodeType).includes(node.nodeType)) {
      errors.push(`${node.label} cannot sit below ${parent.nodeType}.`)
    }
  })

  nodesById.forEach((node) => {
    const visited = new Set([node.id])
    let cursor = node
    while (cursor.parentId) {
      if (visited.has(cursor.parentId)) {
        errors.push(`${node.label} creates a circular structure reference.`)
        break
      }
      visited.add(cursor.parentId)
      cursor = nodesById.get(cursor.parentId) || { parentId: '' }
    }
  })

  return [...new Set(errors)]
}

export function buildDevelopmentStructureSummary(nodes = []) {
  const sourceNodes = Array.isArray(nodes) ? nodes : []
  const counts = sourceNodes.reduce((result, node) => {
    const nodeType = normalizeDevelopmentStructureNodeType(node?.nodeType || node?.node_type)
    if (nodeType) result[nodeType] = Number(result[nodeType] || 0) + 1
    return result
  }, {})
  return {
    nodeCount: sourceNodes.length,
    counts,
    errors: validateDevelopmentStructureNodes(sourceNodes),
  }
}

export function buildDevelopmentStructurePathMap(nodes = []) {
  const nodeById = new Map(nodes.filter((node) => node?.id).map((node) => [node.id, node]))
  const paths = new Map()

  function resolve(node, seen = new Set()) {
    if (!node?.id || seen.has(node.id)) return []
    const parent = node.parentId ? nodeById.get(node.parentId) : null
    const parentPath = parent ? resolve(parent, new Set([...seen, node.id])) : []
    return [...parentPath, { id: node.id, nodeType: node.nodeType, label: node.label }]
  }

  nodeById.forEach((node) => {
    const path = resolve(node)
    paths.set(node.id, {
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      path,
      labelPath: path.map((item) => item.label).filter(Boolean).join(' / '),
    })
  })
  return paths
}

export function buildDevelopmentStructureImportPreview({ templateId = 'custom', csv = '' } = {}) {
  const template = getDevelopmentStructureTemplate(templateId)
  const rows = String(csv || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const headers = rows.length ? rows[0].split(',').map((value) => value.trim().toLowerCase()) : []
  const hasHeader = headers.includes('unitnumber') || headers.includes('unit_number')
  const columns = hasHeader ? headers : ['unitnumber', 'building', 'floor', 'unittype', 'listprice']
  const values = (hasHeader ? rows.slice(1) : rows).map((line) => line.split(',').map((value) => value.trim()))
  const units = values.map((cells) => Object.fromEntries(columns.map((key, columnIndex) => [key, cells[columnIndex] || ''])))
  const nodes = []
  const nodeByKey = new Map()

  units.forEach((unit, index) => {
    const unitNumber = String(unit.unitnumber || unit.unit_number || '').trim()
    const hierarchy = ['building', 'block', 'precinct', 'zone', 'floor', 'level', 'wing']
      .filter((nodeType) => template.id === 'custom' || template.nodeTypes.includes(nodeType) || String(unit[nodeType] || '').trim())
      .map((nodeType) => ({ nodeType, label: String(unit[nodeType] || '').trim() }))
      .filter((node) => node.label)
    let parentId = ''
    hierarchy.forEach((node) => {
      const key = `${parentId}:${node.nodeType}:${node.label.toLowerCase()}`
      let existing = nodeByKey.get(key)
      if (!existing) {
        existing = { id: crypto.randomUUID(), nodeType: node.nodeType, label: node.label, parentId }
        nodeByKey.set(key, existing)
        nodes.push(existing)
      }
      parentId = existing.id
    })
    unit.unitNumber = unitNumber
    unit.structureNodeId = parentId || null
    unit.rowNumber = index + (hasHeader ? 2 : 1)
  })

  const errors = [
    ...validateDevelopmentStructureNodes(nodes),
    ...units.flatMap((unit) => unit.unitNumber ? [] : [`Import row ${unit.rowNumber} needs a unit number.`]),
  ]
  const seenUnitNumbers = new Set()
  units.forEach((unit) => {
    const key = unit.unitNumber.toLowerCase()
    if (key && seenUnitNumbers.has(key)) errors.push(`Unit number ${unit.unitNumber} is duplicated in the import.`)
    seenUnitNumbers.add(key)
  })
  return { template, nodes, units, errors: [...new Set(errors)] }
}
