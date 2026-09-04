import assert from 'node:assert/strict'
import { normaliseSitePlanViewport, remapSitePlanCoordinates } from '../developmentSitePlanViewport.js'

assert.deepEqual(normaliseSitePlanViewport({ x: -5, y: 90, width: 70, height: 70 }), { x: 0, y: 30, width: 70, height: 70 })
assert.deepEqual(remapSitePlanCoordinates({ unitA: { x: 50, y: 50 } }, {}, { x: 25, y: 25, width: 50, height: 50 }), { unitA: { x: 50, y: 50 } })
assert.deepEqual(remapSitePlanCoordinates({ outside: { x: 10, y: 10 } }, {}, { x: 25, y: 25, width: 50, height: 50 }), {})
console.log('development site plan viewport checks passed')
