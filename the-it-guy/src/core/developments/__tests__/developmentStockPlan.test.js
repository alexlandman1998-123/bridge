import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStockSummary, buildStockTargets, createStockGroup, createStockPlan, createStockUnitType, validateStockStep } from '../developmentStockPlan.js'

function plan() {
  const result = createStockPlan()
  result.unitTypes.push(createStockUnitType())
  result.unitTypes[0].name = 'Apartment'
  Object.assign(result.unitTypes[0].floorplans[0], { name: 'A1', sizeSqm: '80', listPrice: '1500000', quantity: '4' })
  return result
}
function grouped() {
  const result = plan()
  result.structureType = 'buildings'
  result.groups = [createStockGroup('Building A'), createStockGroup('Building B')]
  result.groups.forEach((group) => { group.floors = [{ id: crypto.randomUUID(), name: 'Floor 1' }] })
  result.unitTypes[0].floorplans[0].allocations = buildStockTargets(result).map((target) => ({ targetId: target.id, quantity: '2' }))
  return result
}

test('direct units have no physical nodes or release assignment', () => {
  const result = buildStockSummary(plan())
  assert.deepEqual(result.warnings, [])
  assert.equal(result.totalUnits, 4)
  assert.deepEqual(result.structureNodes, [])
  assert.deepEqual(result.generatedUnits.map((unit) => unit.unitNumber), ['001', '002', '003', '004'])
  assert.ok(result.generatedUnits.every((unit) => unit.phase === '' && unit.structureNodeId === null))
})

test('a duplex retains its two internal storeys without creating building floor nodes', () => {
  const draft = plan()
  draft.unitTypes[0].name = 'Duplex'
  draft.unitTypes[0].floorplans[0].storeys = '2'
  const result = buildStockSummary(draft)
  assert.equal(result.totalUnits, 4)
  assert.deepEqual(result.structureNodes, [])
  assert.equal(result.rows[0].storeys, 2)
  assert.ok(result.generatedUnits.every((unit) => unit.storeys === 2 && unit.structureNodeId === null && unit.catalogueFloorplanId === draft.unitTypes[0].floorplans[0].id))
  assert.equal(result.productCatalogue.floorplans[0].storeys, 2)
  assert.equal(result.productCatalogue.floorplans[0].unitTypeId, draft.unitTypes[0].id)
})

test('internal storeys remain independent of the building floor allocation', () => {
  const draft = grouped()
  draft.unitTypes[0].floorplans[0].storeys = '2'
  const result = buildStockSummary(draft)
  assert.equal(result.structureNodes.filter((node) => node.nodeType === 'floor').length, 2)
  assert.equal(result.totalUnits, 4)
  assert.ok(result.generatedUnits.every((unit) => unit.storeys === 2 && unit.structureNodeId))
})

test('storeys must be positive whole numbers and legacy layouts default to one', () => {
  const draft = plan()
  for (const storeys of ['', '0', '-1', '1.5', 'Infinity']) {
    draft.unitTypes[0].floorplans[0].storeys = storeys
    assert.throws(() => validateStockStep(draft, 1), /whole number of storeys/)
  }
  delete draft.unitTypes[0].floorplans[0].storeys
  assert.equal(buildStockSummary(draft).productCatalogue.floorplans[0].storeys, 1)
})

test('same floor label in different buildings stays linked to the correct parent', () => {
  const draft = grouped()
  const result = buildStockSummary(draft)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.structureNodes.length, 4)
  assert.equal(result.structureNodes[1].parentId, draft.groups[0].id)
  assert.equal(result.structureNodes[3].parentId, draft.groups[1].id)
  assert.deepEqual(result.rows.map((row) => [row.location, row.quantity]), [['Building A / Floor 1', 2], ['Building B / Floor 1', 2]])
  assert.deepEqual(result.generatedUnits.map((unit) => unit.structureNodeId), [draft.groups[0].floors[0].id, draft.groups[0].floors[0].id, draft.groups[1].floors[0].id, draft.groups[1].floors[0].id])
  assert.ok(result.generatedUnits.every((unit) => unit.phase === ''))
})

test('blocks without floors receive units directly', () => {
  const draft = plan()
  draft.structureType = 'blocks'
  draft.groups = [createStockGroup('Block A')]
  const result = buildStockSummary(draft)
  assert.equal(result.structureNodes[0].nodeType, 'block')
  assert.ok(result.generatedUnits.every((unit) => unit.structureNodeId === draft.groups[0].id))
})

test('numbering counters continue across layouts within the same physical location', () => {
  const draft = grouped()
  draft.numberingStrategy = 'structure'
  draft.unitTypes[0].floorplans.push({ ...draft.unitTypes[0].floorplans[0], id: crypto.randomUUID(), name: 'A2' })
  const result = buildStockSummary(draft)
  assert.deepEqual(result.warnings, [])
  assert.equal(new Set(result.generatedUnits.map((unit) => unit.unitNumber)).size, 8)
  assert.equal(result.generatedUnits[4].unitNumber, 'BUILDING-A-FLOOR-1-003')
  assert.equal(result.rows[1].layout, 'A1')
  assert.equal(result.rows[2].layout, 'A2')
})

test('mismatched allocations stop generation at both template and final review stages', () => {
  const draft = grouped()
  draft.unitTypes[0].floorplans[0].allocations[0].quantity = '1'
  assert.equal(buildStockSummary(draft).totalUnits, 0)
  assert.throws(() => validateStockStep(draft, 1), /allocate exactly 4/)
  assert.throws(() => validateStockStep(draft, 2), /allocate exactly 4/)
})

test('fractional, negative and non-finite quantities and prices cannot create stock', () => {
  for (const value of ['1.5', '-1', 'Infinity', 'NaN', '0']) {
    const draft = plan()
    draft.unitTypes[0].floorplans[0].quantity = value
    assert.throws(() => validateStockStep(draft, 2), /quantity/)
  }
  const draft = grouped()
  draft.unitTypes[0].floorplans[0].allocations[0].quantity = '-1'
  assert.throws(() => validateStockStep(draft, 2), /allocations/)
  draft.unitTypes[0].floorplans[0].listPrice = 'Infinity'
  assert.match(buildStockSummary(draft).warnings.join(' '), /list price/)
})

test('renamed or removed floors cannot silently lose allocations', () => {
  const draft = grouped()
  draft.groups[0].floors[0].name = 'Ground floor'
  assert.equal(buildStockSummary(draft).totalUnits, 4)
  draft.groups[0].floors = [{ id: crypto.randomUUID(), name: 'Ground floor' }]
  assert.throws(() => validateStockStep(draft, 2), /removed building or floor/)
})

test('duplicate building and floor names are rejected while structure is being edited', () => {
  const draft = grouped()
  draft.groups[1].name = ' building a '
  assert.throws(() => validateStockStep(draft, 0), /names must be unique/)
  draft.groups[1].name = 'Building B'
  draft.groups[0].floors.push({ id: crypto.randomUUID(), name: 'floor 1' })
  assert.throws(() => validateStockStep(draft, 0), /Floor names/)
})

test('normalized prefix collisions require a different number format', () => {
  const draft = grouped()
  draft.groups[0].name = 'A / B'
  draft.groups[1].name = 'A-B'
  draft.numberingStrategy = 'structure'
  assert.throws(() => validateStockStep(draft, 2), /duplicate unit numbers/)
  draft.numberingStrategy = 'sequential'
  assert.doesNotThrow(() => validateStockStep(draft, 2))
})

test('very large plans are rejected before allocating unit arrays', () => {
  const draft = plan()
  draft.unitTypes[0].floorplans[0].quantity = '1000000000'
  assert.equal(buildStockSummary(draft).generatedUnits.length, 0)
  assert.throws(() => validateStockStep(draft, 2), /at a time/)
})
