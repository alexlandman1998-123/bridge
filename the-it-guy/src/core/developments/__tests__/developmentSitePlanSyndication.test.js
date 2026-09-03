import assert from 'node:assert/strict'
import { buildDevelopmentSitePlanSyndicationPayload } from '../developmentSitePlanSyndication.js'

const mediaLibrary = {
  sitePlanUrl: 'https://cdn.example.test/junoah-map.png',
  sitePlanMap: {
    unit_1: { x: 12.5, y: 42.1 },
    incomplete: { x: 'not-a-coordinate' },
  },
}

const assetOnlyPayload = buildDevelopmentSitePlanSyndicationPayload({ mediaLibrary })
assert.equal(assetOnlyPayload.mode, 'asset_only')
assert.deepEqual(assetOnlyPayload.sitePlanAsset, {
  type: 'site_plan',
  url: 'https://cdn.example.test/junoah-map.png',
})
assert.equal('interactiveMap' in assetOnlyPayload, false)

const interactivePayload = buildDevelopmentSitePlanSyndicationPayload({
  mediaLibrary,
  destination: { supportsInteractiveSitePlan: true },
})
assert.equal(interactivePayload.mode, 'interactive_map')
assert.deepEqual(interactivePayload.interactiveMap, {
  coordinateUnit: 'percent',
  units: { unit_1: { x: 12.5, y: 42.1 } },
})

console.log('development site-plan syndication checks passed')
