import assert from 'node:assert/strict'
import {
  estimateJsonBytes,
  evaluateListingBaseline,
  getSignedUrlExpiry,
  inspectListingMediaRows,
} from '../the-it-guy/src/services/observability/listingArchitectureBaseline.js'

assert.ok(estimateJsonBytes({ value: 'listing' }) > 0)
assert.equal(getSignedUrlExpiry('https://example.test/a.jpg?Expires=1893456000')?.toISOString(), '2030-01-01T00:00:00.000Z')

const media = inspectListingMediaRows([
  { listing_id: 'one', file_url: 'https://example.test/a.jpg?Expires=1893456000' },
  { listing_id: 'one', file_url: 'https://example.test/b.jpg?Expires=1' },
  { listing_id: '', file_url: '' },
], { now: new Date('2026-08-30T00:00:00.000Z') })
assert.equal(media.rowCount, 3)
assert.equal(media.listingCount, 1)
assert.equal(media.expiredUrlCount, 1)
assert.equal(media.incompleteRowCount, 1)

assert.equal(evaluateListingBaseline({
  telemetry: { p95DurationMs: 500, maximumResultCount: 50, maximumResponseBytes: 200000 },
  media: { expiredUrlCount: 0, incompleteRowCount: 0 },
}).status, 'pass')
const missingTelemetry = evaluateListingBaseline({ telemetry: {}, media: { expiredUrlCount: 0, incompleteRowCount: 0 } })
assert.equal(missingTelemetry.status, 'attention_required')
assert.equal(missingTelemetry.checks.p95Duration, false)
assert.equal(missingTelemetry.checks.resultCount, false)
assert.equal(missingTelemetry.checks.responseBytes, false)

console.log('listing architecture baseline tests passed')
