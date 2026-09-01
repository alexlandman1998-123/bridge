import assert from 'node:assert/strict'
import { buildDevelopmentLaunchPacket, formatDevelopmentLaunchPacket } from '../developmentLaunchPacket.js'

const packet = buildDevelopmentLaunchPacket({
  development: { id: 'd1', name: 'The Grove' },
  readiness: { launchReady: false, score: 80, blockers: [{ id: 'media', label: 'Presentation asset', detail: 'Add a hero image.', tab: 'marketing' }], gates: [] },
  units: [{ status: 'Available', listPrice: 1650000 }, { status: 'Sold' }],
  structureNodes: [{ nodeType: 'building' }],
  productCatalogue: { unitTypes: [{ id: 't1' }], floorplans: [], priceBooks: [{ name: 'Current', isDefault: true }] },
  listings: [{ status: 'published' }],
})
assert.equal(packet.releaseDecision, 'blocked')
assert.equal(packet.inventory.totalUnits, 2)
assert.match(formatDevelopmentLaunchPacket(packet), /Presentation asset/)
console.log('development launch packet checks passed')
