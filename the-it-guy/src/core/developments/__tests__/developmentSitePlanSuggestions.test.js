import assert from 'node:assert/strict'
import { buildPdfSitePlanUnitSuggestions } from '../developmentSitePlanSuggestions.js'

const suggestions = buildPdfSitePlanUnitSuggestions({
  units: [
    { id: 'one', unitNumber: 'Unit 001' },
    { id: 'two', unitNumber: '2' },
    { id: 'already-placed', unitNumber: '3' },
  ],
  textAnchors: [
    { label: '001', x: 20.04, y: 55.06 },
    { label: 'Unit 2', x: 70, y: 30 },
    { label: '3', x: 90, y: 10 },
  ],
  sitePlanMap: { 'already-placed': { x: 10, y: 10 } },
})

assert.deepEqual(suggestions, {
  one: { x: 20, y: 55.1, sourceLabel: '001' },
  two: { x: 70, y: 30, sourceLabel: 'Unit 2' },
})

console.log('development site-plan PDF suggestion checks passed')
