import { validateDevelopmentStructureNodes } from './developmentStructureModel.js'

export const STOCK_STEPS = ['Structure', 'Unit layouts', 'Check units']
const MAX_UNITS = 10000
const text = (value) => String(value || '').trim()
const key = (value) => text(value).toLowerCase()
const whole = (value) => Number.isInteger(Number(value)) && Number(value) >= 0
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0

export function createStockFloorplan() {
  return { id: crypto.randomUUID(), name: '', propertyType: 'Apartment', sizeSqm: '', storeys: '1', listPrice: '', quantity: '', allocations: [], file: null }
}

export function createStockUnitType() {
  return { id: crypto.randomUUID(), name: '', floorplans: [createStockFloorplan()] }
}

export function createStockGroup(name = 'Building A') {
  return { id: crypto.randomUUID(), name, floors: [] }
}

export function createStockPlan() {
  return { structureType: 'none', groups: [], unitTypes: [], numberingStrategy: 'sequential', numberingPadding: 3 }
}

export function buildStockStructureNodes(plan) {
  if (plan.structureType === 'none') return []
  return plan.groups.flatMap((group, index) => [
    { id: group.id, parentId: '', nodeType: plan.structureType === 'blocks' ? 'block' : 'building', label: text(group.name), sortOrder: index },
    ...group.floors.map((floor, floorIndex) => ({ id: floor.id, parentId: group.id, nodeType: 'floor', label: text(floor.name), sortOrder: floorIndex })),
  ])
}

export function buildStockTargets(plan) {
  if (plan.structureType === 'none') return [{ id: 'development', label: 'Development', groupName: '', floorName: '', structureNodeId: null }]
  return plan.groups.flatMap((group) => group.floors.length
    ? group.floors.map((floor) => ({ id: floor.id, label: `${text(group.name)} / ${text(floor.name)}`, groupName: text(group.name), floorName: text(floor.name), structureNodeId: floor.id }))
    : [{ id: group.id, label: text(group.name), groupName: text(group.name), floorName: '', structureNodeId: group.id }])
}

function allocationsFor(floorplan, targets) {
  if (targets.length === 1) return [{ target: targets[0], quantity: Number(floorplan.quantity) }]
  return (floorplan.allocations || []).flatMap((entry) => {
    const target = targets.find((item) => item.id === entry.targetId)
    return target && Number(entry.quantity) > 0 ? [{ target, quantity: Number(entry.quantity) }] : []
  })
}

export function stockPlanErrors(plan, step = 2) {
  const errors = []
  if (!['none', 'buildings', 'blocks'].includes(plan.structureType)) errors.push('Choose a physical structure.')
  if (plan.structureType !== 'none') {
    if (!plan.groups.length) errors.push('Add at least one building or block.')
    const names = new Set()
    plan.groups.forEach((group) => {
      if (!text(group.name)) errors.push('Each building or block needs a name.')
      if (names.has(key(group.name))) errors.push('Building or block names must be unique.')
      names.add(key(group.name))
      const floorNames = new Set()
      group.floors.forEach((floor) => {
        if (!text(floor.name)) errors.push(`${group.name} has a floor without a name.`)
        if (floorNames.has(key(floor.name))) errors.push(`Floor names in ${group.name} must be unique.`)
        floorNames.add(key(floor.name))
      })
    })
    errors.push(...validateDevelopmentStructureNodes(buildStockStructureNodes(plan)))
  }
  if (step === 0) return [...new Set(errors)]
  const targets = buildStockTargets(plan)
  const targetIds = new Set(targets.map((target) => target.id))
  if (!plan.unitTypes.length) errors.push('Add at least one unit layout.')
  let total = 0
  const typeNames = new Set()
  plan.unitTypes.forEach((type) => {
    if (!text(type.name)) errors.push('Each unit type needs a name.')
    if (typeNames.has(key(type.name))) errors.push('Unit type names must be unique.')
    typeNames.add(key(type.name))
    if (type.bedrooms !== undefined && type.bedrooms !== '' && !whole(type.bedrooms)) errors.push('Bedrooms must be a whole number of zero or more.')
    if (type.bathrooms !== undefined && type.bathrooms !== '' && (!Number.isFinite(Number(type.bathrooms)) || Number(type.bathrooms) < 0 || Number(type.bathrooms) * 2 % 1 !== 0)) errors.push('Bathrooms must be zero or more, in steps of 0.5.')
    if (!type.floorplans.length) errors.push(`${type.name || 'Each unit type'} needs at least one layout.`)
    const layoutNames = new Set()
    type.floorplans.forEach((layout) => {
      const name = text(layout.name) || 'Each layout'
      if (!text(layout.name)) errors.push(`${type.name || 'A unit type'} has a layout without a name.`)
      if (layoutNames.has(key(layout.name))) errors.push(`Layout names in ${type.name} must be unique.`)
      layoutNames.add(key(layout.name))
      if (!whole(layout.quantity) || !positive(layout.quantity)) errors.push(`${name} needs a positive whole-number quantity.`)
      if (!positive(layout.sizeSqm)) errors.push(`${name} needs a size greater than zero.`)
      if (!whole(layout.storeys ?? 1) || !positive(layout.storeys ?? 1)) errors.push(`${name} needs a positive whole number of storeys.`)
      if (!positive(layout.listPrice)) errors.push(`${name} needs a list price greater than zero.`)
      total += Number(layout.quantity) || 0
      if (targets.length > 1) {
        const seen = new Set()
        let allocated = 0
        ;(layout.allocations || []).forEach((entry) => {
          if (!whole(entry.quantity)) errors.push(`${name} allocations must be whole numbers of zero or more.`)
          if (!targetIds.has(entry.targetId) && Number(entry.quantity) !== 0) errors.push(`${name} includes a removed building or floor. Update its allocation.`)
          if (seen.has(entry.targetId)) errors.push(`${name} includes a duplicate allocation.`)
          seen.add(entry.targetId)
          if (targetIds.has(entry.targetId)) allocated += Number(entry.quantity) || 0
        })
        if (allocated !== Number(layout.quantity)) errors.push(`${name}: allocate exactly ${layout.quantity || 0} units across the buildings or floors (${allocated} assigned).`)
      }
    })
  })
  if (total > MAX_UNITS) errors.push(`Generate up to ${MAX_UNITS.toLocaleString('en-ZA')} units at a time.`)
  if (!whole(plan.numberingPadding) || Number(plan.numberingPadding) < 1 || Number(plan.numberingPadding) > 8) errors.push('Number padding must be between 1 and 8.')
  if (!['sequential', 'structure'].includes(plan.numberingStrategy)) errors.push('Choose a unit numbering format.')
  return [...new Set(errors)]
}

function code(value) { return text(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase() }

export function buildStockSummary(plan) {
  const errors = stockPlanErrors(plan)
  const targets = buildStockTargets(plan)
  const rows = []
  const units = []
  const counters = new Map()
  let sequence = 0
  if (!errors.length) plan.unitTypes.forEach((type) => type.floorplans.forEach((layout) => {
    allocationsFor(layout, targets).forEach(({ target, quantity }) => {
      const numbers = []
      for (let index = 0; index < quantity; index += 1) {
        sequence += 1
        const local = (counters.get(target.id) || 0) + 1
        counters.set(target.id, local)
        const prefix = plan.numberingStrategy === 'structure' ? [code(target.groupName), code(target.floorName)].filter(Boolean).join('-') : ''
        const number = String(prefix ? local : sequence).padStart(Number(plan.numberingPadding), '0')
        const unitNumber = prefix ? `${prefix}-${number}` : number
        numbers.push(unitNumber)
        units.push({ unitNumber, unitLabel: `${text(type.name)} • ${text(layout.name)}`, unitType: text(type.name), layoutName: text(layout.name), phase: '', block: target.groupName, sizeSqm: Number(layout.sizeSqm), listPrice: Number(layout.listPrice), status: 'Available', floorplanId: '', unitTypeId: type.id, catalogueFloorplanId: layout.id, storeys: Number(layout.storeys ?? 1), structureNodeId: target.structureNodeId })
      }
      rows.push({ key: `${layout.id}:${target.id}`, location: target.label, type: text(type.name), layout: text(layout.name), storeys: Number(layout.storeys ?? 1), quantity, firstNumber: numbers[0], lastNumber: numbers.at(-1) })
    })
  }))
  const numbers = new Set()
  units.forEach((unit) => {
    if (numbers.has(key(unit.unitNumber))) errors.push('The numbering format creates duplicate unit numbers. Rename the buildings or floors, or use sequential numbers.')
    numbers.add(key(unit.unitNumber))
  })
  const productCatalogue = {
    unitTypes: plan.unitTypes.map((type) => ({ id: type.id, name: text(type.name), bedrooms: type.bedrooms === '' || type.bedrooms === undefined ? null : Number(type.bedrooms), bathrooms: type.bathrooms === '' || type.bathrooms === undefined ? null : Number(type.bathrooms) })),
    floorplans: plan.unitTypes.flatMap((type) => type.floorplans.map((layout) => ({
      id: layout.id, unitTypeId: type.id, name: text(layout.name),
      internalSizeSqm: Number(layout.sizeSqm), storeys: Number(layout.storeys ?? 1),
      file: layout.file || null, fileUrl: layout.fileUrl || '',
      metadata: { propertyType: layout.propertyType || type.name },
    }))),
    prices: plan.unitTypes.flatMap((type) => type.floorplans.map((layout) => ({
      unitTypeId: type.id, floorplanId: layout.id, listPrice: Number(layout.listPrice),
    }))),
  }
  return { totalUnits: units.length, generatedUnits: units, structureNodes: buildStockStructureNodes(plan), productCatalogue, rows, warnings: [...new Set(errors)] }
}

export function validateStockStep(plan, step) {
  const errors = step === 0 ? stockPlanErrors(plan, 0) : buildStockSummary(plan).warnings
  if (errors.length) throw new Error(errors[0])
  if (step === 2 && !buildStockSummary(plan).totalUnits) throw new Error('Add at least one unit before generating stock.')
}
