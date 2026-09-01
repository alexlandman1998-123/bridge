import assert from 'node:assert/strict'
import { buildDevelopmentLaunchReadiness } from '../developmentLaunchReadiness.js'

const readiness = buildDevelopmentLaunchReadiness({
  units: [{ id: 'u1', status: 'Available', listPrice: 1650000 }],
  reservationDepositConfigured: true,
  marketing: { mediaLibrary: { heroImageUrl: 'https://example.com/hero.jpg' }, listingConfiguration: { publicVisibility: false } },
})
assert.equal(readiness.launchReady, true)
assert.equal(readiness.score, 100)
assert.equal(readiness.gates.find((gate) => gate.id === 'structure').ready, true)
assert.equal(buildDevelopmentLaunchReadiness({ units: [{ status: 'Available' }] }).blockers.some((gate) => gate.id === 'pricing'), true)
console.log('development launch readiness checks passed')
