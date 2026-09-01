import assert from 'node:assert/strict'
import { buildDevelopmentDemandIntelligence } from '../developmentDemandIntelligence.js'

const intelligence = buildDevelopmentDemandIntelligence({
  units: [{ unitType: '2 Bed', status: 'Available' }, { unitType: '1 Bed', status: 'Available' }],
  leads: [{ unitTypeInterest: '2 Bed' }, { unitTypeInterest: '2 Bed' }, { unitTypeInterest: '3 Bed' }, {}],
})
assert.equal(intelligence.tightTypes.length, 2)
assert.equal(intelligence.unclassifiedLeadInterest, 1)
assert.equal(intelligence.rows.find((row) => row.type === '2 Bed').signal, 'tight')
console.log('development demand intelligence checks passed')
