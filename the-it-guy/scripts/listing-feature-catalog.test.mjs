import assert from 'node:assert/strict'
import {
  LISTING_FEATURE_CATALOG,
  mergeListingFeatureSelections,
  normalizeListingFeatureFacts,
  resolveListingFeature,
  serializeListingFeatureFacts,
  setListingFeatureFact,
} from '../src/services/listings/listingFeatureCatalog.js'

const keys = LISTING_FEATURE_CATALOG.map((feature) => feature.key)
assert.equal(new Set(keys).size, keys.length, 'Feature keys must be unique')
assert.ok(LISTING_FEATURE_CATALOG.every((feature) => ['boolean', 'count', 'choice'].includes(feature.type)))
assert.ok(LISTING_FEATURE_CATALOG.every((feature) => feature.group && feature.label))
assert.ok(LISTING_FEATURE_CATALOG.every((feature) => feature.listingTypes?.length))
for (const key of ['study', 'studies', 'air_conditioning', 'alarm', 'access_gate', 'security_post', 'built_in_braai', 'solar_panels', 'solar_geyser', 'inverter_battery', 'water_tank', 'wheelchair_accessible', 'en_suite', 'lounges', 'dining_areas', 'carports', 'storeys', 'roof_type', 'finishes']) {
  assert.ok(keys.includes(key), `Missing canonical capture for ${key}`)
}

const legacy = normalizeListingFeatureFacts({}, ['Solar', 'Air Conditioning', 'Staff Accommodation'])
assert.equal(legacy.solar, true)
assert.equal(legacy.air_conditioning, true)
assert.equal(legacy.staff_quarters, true)
assert.equal(legacy.alarm, undefined, 'An omitted feature is Unknown, not No')
assert.equal(resolveListingFeature('electric_fencing')?.key, 'electric_fence')

const answered = setListingFeatureFact(setListingFeatureFact(legacy, 'solar', 'no'), 'alarm', 'yes')
assert.equal(answered.solar, false)
assert.equal(answered.alarm, true)
assert.equal(normalizeListingFeatureFacts(answered, ['solar']).solar, false, 'Explicit No wins over a legacy Yes')
assert.deepEqual(mergeListingFeatureSelections(['solar', 'custom_feature'], answered).sort(), ['alarm', 'air_conditioning', 'custom_feature', 'staff_quarters'].sort())

assert.equal(setListingFeatureFact({}, 'lounges', '2').lounges, 2)
assert.equal(setListingFeatureFact({}, 'lounges', '').lounges, null)
assert.equal(setListingFeatureFact({}, 'roof_type', 'Tiles').roof_type, 'Tiles')
assert.equal(setListingFeatureFact({}, 'roof_type', 'Concrete').roof_type, null)
assert.equal(serializeListingFeatureFacts({ solar: null }).solar, 'unknown')
assert.equal(normalizeListingFeatureFacts(serializeListingFeatureFacts({ solar: null }), ['solar']).solar, null)

console.log('Listing feature catalogue contract passed')
