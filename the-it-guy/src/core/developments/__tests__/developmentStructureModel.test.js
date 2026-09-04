import assert from 'node:assert/strict'
import {
  buildDevelopmentStructureSummary,
  buildDevelopmentStructurePathMap,
  buildDevelopmentStructureImportPreview,
  getDevelopmentStructureTemplate,
  validateDevelopmentStructureNodes,
} from '../developmentStructureModel.js'

assert.deepEqual(getDevelopmentStructureTemplate('tower').nodeTypes, ['building', 'floor'])

const tower = [
  { id: 'tower-a', nodeType: 'building', label: 'Tower A' },
  { id: 'floor-10', parentId: 'tower-a', nodeType: 'floor', label: 'Level 10' },
  { id: 'floor-11', parentId: 'tower-a', nodeType: 'floor', label: 'Level 11' },
]
assert.deepEqual(validateDevelopmentStructureNodes(tower), [])
assert.deepEqual(buildDevelopmentStructureSummary(tower).counts, { building: 1, floor: 2 })
assert.equal(buildDevelopmentStructurePathMap(tower).get('floor-10').labelPath, 'Tower A / Level 10')

assert.ok(validateDevelopmentStructureNodes([
  { id: 'a', parentId: 'b', nodeType: 'floor', label: 'Level 1' },
  { id: 'b', parentId: 'a', nodeType: 'building', label: 'Tower A' },
]).some((error) => error.includes('circular')))

const importPreview = buildDevelopmentStructureImportPreview({
  templateId: 'tower',
  csv: 'unitNumber,building,floor,unitType,listPrice\nA-1001,Tower A,10,Type A,1650000\nA-1002,Tower A,10,Type A,1650000',
})
assert.equal(importPreview.errors.length, 0)
assert.equal(importPreview.nodes.length, 2)
assert.ok(importPreview.units[0].structureNodeId)

const simpleEstate = buildDevelopmentStructureImportPreview({
  templateId: 'estate',
  csv: 'unitNumber,phase,unitType\n001,Phase 1,Two bed\n002,Phase 1,Two bed',
})
assert.equal(simpleEstate.errors.length, 0)
assert.equal(simpleEstate.nodes.length, 0)
assert.equal(simpleEstate.units[0].phase, 'Phase 1')

const apartmentBuilding = buildDevelopmentStructureImportPreview({
  templateId: 'apartment_blocks',
  csv: 'unitNumber,building,floor\nA-101,Building A,Level 1',
})
assert.equal(apartmentBuilding.errors.length, 0)
assert.equal(apartmentBuilding.nodes.length, 2)
assert.equal(apartmentBuilding.nodes.find((node) => node.nodeType === 'floor').parentId, apartmentBuilding.nodes.find((node) => node.nodeType === 'building').id)

console.log('development structure model checks passed')
