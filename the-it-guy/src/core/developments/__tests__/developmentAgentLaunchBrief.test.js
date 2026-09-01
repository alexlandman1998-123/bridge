import assert from 'node:assert/strict'
import { buildDevelopmentAgentLaunchBrief, formatDevelopmentAgentLaunchBrief } from '../developmentAgentLaunchBrief.js'

const brief = buildDevelopmentAgentLaunchBrief({
  development: { name: 'The Grove', location: 'Brooklyn' },
  units: [{ status: 'Available', unitType: '2 Bed', listPrice: 1650000 }, { status: 'Reserved', listPrice: 1700000 }],
  productCatalogue: { unitTypes: [{ id: 'two-bed', name: '2 Bed', noTransferDuty: true }] },
})
assert.equal(brief.availableCount, 1)
assert.equal(brief.priceFrom, 1650000)
assert.match(formatDevelopmentAgentLaunchBrief(brief), /No transfer duty/)
console.log('development agent launch brief checks passed')
