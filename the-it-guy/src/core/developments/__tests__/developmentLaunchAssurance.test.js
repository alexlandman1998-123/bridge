import assert from 'node:assert/strict'
import { buildDevelopmentLaunchAssurance } from '../developmentLaunchAssurance.js'

const assurance = buildDevelopmentLaunchAssurance({
  now: new Date('2026-09-01T00:00:00Z'),
  publicVisibility: true,
  structureNodes: [{ id: 'tower', nodeType: 'building' }],
  productCatalogue: { unitTypes: [{ id: 'type-a' }], priceBooks: [{ id: 'current', isDefault: true }], prices: [] },
  units: [{ id: 'u1', status: 'Available', lastUpdated: '2026-08-01', unitTypeId: '', structureNodeId: '' }],
  listings: [],
})
assert.equal(assurance.criticalCount, 1)
assert.ok(assurance.issues.some((issue) => issue.id === 'unpriced'))
assert.ok(assurance.issues.some((issue) => issue.id === 'stale-stock'))
console.log('development launch assurance checks passed')
