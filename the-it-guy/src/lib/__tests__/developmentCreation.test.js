import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateDevelopmentStructureNodes } from '../../core/developments/developmentStructureModel.js'

// Exercise the production creation sequence with local persistence adapters.
// These fixtures never initialise Supabase or make database writes.
const api = await readFile(new URL('../api.js', import.meta.url), 'utf8')
const start = api.indexOf('export async function createDevelopmentWorkspace(')
const end = api.indexOf('\nfunction normalizeDeveloperPartnerType(', start)
const source = api.slice(start, end).replace('export async function', 'async function')

function setup(overrides = {}) {
  const calls = []
  const deps = {
    validateDevelopmentStructureNodes,
    saveDevelopmentStructureNodes: async (payload) => { calls.push(['structure', payload]); return payload.nodes },
    saveDevelopmentProductCatalogue: async (payload) => { calls.push(['catalogue', payload]); return payload },
    createDevelopment: async (payload) => { calls.push(['create', payload]); return { id: 'saved-development' } },
    saveDevelopmentDetails: async (...args) => { calls.push(['details', ...args]); return { saved: true, warnings: [] } },
    hasDevelopmentFinancialInputs: () => false,
    saveDevelopmentFinancials: async () => {},
    isPermissionDeniedError: (error) => error?.code === '42501',
    updateDevelopmentSettings: async (...args) => { calls.push(['settings', ...args]) },
    DEFAULT_DEVELOPMENT_SETTINGS: {},
    normalizeTextValue: (value) => String(value || '').trim(),
    saveDevelopmentAttorneyConfig: async () => {},
    saveDevelopmentBondConfig: async () => {},
    saveDevelopmentUnit: async (payload) => { calls.push(['unit', payload]) },
    saveDevelopmentDocument: async () => {},
    uploadDevelopmentDocumentAsset: async (payload) => { calls.push(['upload', payload]); return { id: 'saved-asset', fileUrl: 'https://example.test/plan.png' } },
    ...overrides,
  }
  const create = new Function(...Object.keys(deps), `${source}; return createDevelopmentWorkspace`)(...Object.values(deps))
  return { create, calls }
}

test('retains development type and structured manual address through both creation and profile save', async () => {
  const { create, calls } = setup()
  const details = { name: 'Willow Park', totalUnitsExpected: 12, address: '12 Test Road', suburb: 'Test suburb', marketingContent: { listingOverview: { developmentType: 'mixed_use' } } }
  const result = await create({ details })
  assert.equal(result.id, 'saved-development')
  assert.deepEqual(calls.find(([name]) => name === 'create')[1].profile.marketingContent, details.marketingContent)
  assert.deepEqual(calls.find(([name]) => name === 'details')[2], details)
  assert.equal(calls.find(([name]) => name === 'details')[3].reportWarnings, true)
  assert.equal(calls.filter(([name]) => name === 'unit').length, 0)
})

test('saves the storey-bearing catalogue before units linked to those layouts', async () => {
  const { create, calls } = setup()
  const productCatalogue = { unitTypes: [{ id: 'type', name: 'Duplex' }], floorplans: [{ id: 'layout', unitTypeId: 'type', name: 'D1', storeys: 2 }] }
  await create({ productCatalogue, units: [{ unitNumber: '001', unitTypeId: 'type', catalogueFloorplanId: 'layout' }] })
  const catalogueIndex = calls.findIndex(([name]) => name === 'catalogue')
  const unitIndex = calls.findIndex(([name]) => name === 'unit')
  assert.ok(catalogueIndex >= 0 && catalogueIndex < unitIndex)
  assert.equal(calls[catalogueIndex][1].floorplans[0].storeys, 2)
  assert.equal(calls[unitIndex][1].catalogueFloorplanId, 'layout')
  assert.equal(calls[catalogueIndex][1].developmentId, 'saved-development')
})

test('a layout persistence failure retains the saved development and stops unit creation', async () => {
  const { create, calls } = setup({ saveDevelopmentProductCatalogue: async () => { throw new Error('Layout permission denied') } })
  await assert.rejects(create({ productCatalogue: { floorplans: [{ name: 'D1', storeys: 2 }] }, units: [{ unitNumber: '001' }] }), (error) => {
    assert.equal(error.developmentId, 'saved-development')
    assert.match(error.message, /Layout permission denied/)
    return true
  })
  assert.equal(calls.filter(([name]) => name === 'unit').length, 0)
})

test('uploads a selected floor plan once and links its receipt before saving the catalogue and units', async () => {
  const { create, calls } = setup()
  const file = { name: 'A2.png', type: 'image/png' }
  await create({ productCatalogue: { unitTypes: [{ id: 'type', name: 'Apartment A2', bedrooms: 2, bathrooms: 2 }], floorplans: [{ id: 'layout', name: 'A2', unitTypeId: 'type', file }] }, units: [{ unitNumber: '001' }] })
  assert.equal(calls.filter(([name]) => name === 'upload').length, 1)
  const upload = calls.find(([name]) => name === 'upload')[1]
  assert.equal(upload.file, file)
  assert.equal(upload.developmentId, 'saved-development')
  assert.equal(upload.linkedUnitType, 'Apartment A2')
  const saved = calls.find(([name]) => name === 'catalogue')[1].floorplans[0]
  assert.equal(saved.documentId, 'saved-asset')
  assert.equal(saved.thumbnailUrl, 'https://example.test/plan.png')
  assert.equal(saved.file, undefined)
  assert.ok(calls.findIndex(([name]) => name === 'upload') < calls.findIndex(([name]) => name === 'catalogue'))
})

test('an attachment failure retains the created development and stops catalogue and unit saves', async () => {
  const { create, calls } = setup({ uploadDevelopmentDocumentAsset: async () => { throw new Error('Upload unavailable') } })
  await assert.rejects(create({ productCatalogue: { unitTypes: [], floorplans: [{ name: 'A2', file: { name: 'plan.pdf' } }] }, units: [{ unitNumber: '001' }] }), (error) => {
    assert.equal(error.developmentId, 'saved-development')
    assert.match(error.message, /Upload unavailable/)
    return true
  })
  assert.equal(calls.filter(([name]) => ['catalogue', 'unit'].includes(name)).length, 0)
})

test('a later unit failure identifies the saved development and stops further stock creation', async () => {
  let count = 0
  const { create, calls } = setup({ saveDevelopmentUnit: async () => { count++; throw new Error('Unit permission denied') } })
  await assert.rejects(create({ details: { name: 'Willow Park' }, units: [{ unitNumber: '001' }, { unitNumber: '002' }] }), (error) => {
    assert.equal(error.developmentId, 'saved-development')
    assert.match(error.message, /Unit permission denied/)
    return true
  })
  assert.equal(count, 1)
  assert.equal(calls.filter(([name]) => name === 'create').length, 1)
})

test('a base creation rejection remains a failure without claiming a saved record', async () => {
  const { create } = setup({ createDevelopment: async () => { throw new Error('No create access') } })
  await assert.rejects(create({ details: { name: 'Willow Park' } }), (error) => {
    assert.equal(error.developmentId, undefined)
    assert.match(error.message, /No create access/)
    return true
  })
})

test('settings failures and profile warnings remain visible in the saved receipt', async () => {
  const { create } = setup({
    saveDevelopmentDetails: async () => ({ saved: true, warnings: [{ message: 'Profile unavailable' }] }),
    updateDevelopmentSettings: async () => { throw new Error('Settings access denied') },
  })
  const result = await create({ details: { name: 'Willow Park' } })
  assert.equal(result.id, 'saved-development')
  assert.equal(result.warnings.length, 2)
  assert.match(result.warnings[1].message, /developer access or transaction defaults/)
})

test('saves buildings and floors before their units and requires the location link', async () => {
  const { create, calls } = setup()
  const nodes = [{ id: 'building', nodeType: 'building', label: 'A' }, { id: 'floor', parentId: 'building', nodeType: 'floor', label: '1' }]
  await create({ details: { name: 'Test' }, structureNodes: nodes, units: [{ unitNumber: '001', structureNodeId: 'floor', phase: '' }] })
  assert.ok(calls.findIndex(([name]) => name === 'structure') < calls.findIndex(([name]) => name === 'unit'))
  assert.equal(calls.find(([name]) => name === 'structure')[1].developmentId, 'saved-development')
  assert.equal(calls.find(([name]) => name === 'unit')[1].requireStructureLink, true)
})

test('a structure save failure stops units and retains the existing development ID', async () => {
  const { create, calls } = setup({ saveDevelopmentStructureNodes: async () => [] })
  await assert.rejects(create({ structureNodes: [{ id: 'building', nodeType: 'building', label: 'A' }], units: [{ unitNumber: '001', structureNodeId: 'building' }] }), (error) => {
    assert.equal(error.developmentId, 'saved-development')
    assert.match(error.message, /structure could not be fully saved/)
    return true
  })
  assert.equal(calls.filter(([name]) => name === 'unit').length, 0)
})

test('invalid hierarchy references are rejected before creating a development', async () => {
  const { create, calls } = setup()
  await assert.rejects(create({ units: [{ unitNumber: '001', structureNodeId: 'missing' }] }), /not included/)
  assert.equal(calls.length, 0)
})

function unitWriter() {
  const unitStart = api.indexOf('export async function saveDevelopmentUnit(')
  const unitEnd = api.indexOf('\nasync function fetchDevelopmentStructureNodes(', unitStart)
  const unitSource = api.slice(unitStart, unitEnd).replace('export async function', 'async function')
  const calls = []
  const client = { from: () => ({ upsert: (payload) => {
    calls.push(payload)
    return { select: () => ({ single: async () => calls.length === 1 ? { error: { column: 'unit_label' } } : { data: { id: 'unit', unit_number: '001' } } }) }
  } }) }
  const deps = {
    requireClient: () => client,
    normalizeTextValue: (value) => String(value || '').trim(),
    normalizeNullableText: (value) => value || null,
    normalizeDevelopmentUnitRow: (row) => ({ ...row, unitNumber: row.unit_number, structureNodeId: row.structure_node_id, catalogueFloorplanId: row.catalogue_floorplan_id }),
    isMissingColumnError: (error, column) => error?.column === column,
  }
  const save = new Function(...Object.keys(deps), `${unitSource}; return saveDevelopmentUnit`)(...Object.values(deps))
  return { save, calls }
}

test('grouped stock refuses a legacy fallback that would discard its floor link', async () => {
  const { save, calls } = unitWriter()
  await assert.rejects(save({ developmentId: 'development', unitNumber: '001', structureNodeId: 'floor', requireStructureLink: true }), /full building and floor stock/)
  assert.equal(calls.length, 1)
})

test('the existing legacy fallback remains available for ungrouped units', async () => {
  const { save, calls } = unitWriter()
  await save({ developmentId: 'development', unitNumber: '001' })
  assert.equal(calls.length, 2)
})


test('a duplex cannot fall back to a unit record that discards its saved layout', async () => {
  const { save, calls } = unitWriter()
  await assert.rejects(save({ developmentId: 'development', unitNumber: '001', catalogueFloorplanId: 'layout' }), /unit layout links/)
  assert.equal(calls.length, 1)
})
