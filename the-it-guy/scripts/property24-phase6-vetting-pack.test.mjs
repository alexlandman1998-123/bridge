import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24VettingPack,
  redactProperty24VettingValue,
  renderProperty24VettingPackMarkdown,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const reports = {
  phase1: {
    summary: { status: 'PASS' },
    checks: [
      { name: 'authenticated echo accepts Basic Auth', status: 'PASS', httpStatus: 200, summary: { value: 'ok' } },
      { name: 'fetch agency 31382', status: 'PASS', httpStatus: 200, summary: { sample: { name: 'Exdev ARCH9' } } },
      { name: 'fetch agency 31382 agents', status: 'PASS', httpStatus: 200, summary: { count: 1 } },
      { name: 'fetch countries', status: 'PASS', httpStatus: 200 },
      { name: 'fetch provinces', status: 'PASS', httpStatus: 200 },
      { name: 'fetch property types', status: 'PASS', httpStatus: 200 },
      { name: 'fetch listing types', status: 'PASS', httpStatus: 200 },
    ],
  },
  preview: {
    canSubmit: true,
    summary: {
      imageCount: 4,
      listingNumber: null,
      propertyTypeId: 4,
      suburbId: 140,
    },
    imageByteLoad: {
      summary: { loaded: 4, failed: 0 },
    },
  },
  publish: {
    status: 'SUBMITTED',
    listingId: 'listing-1',
    preview: {
      summary: { listingNumber: 100314793 },
      imageByteLoad: { summary: { loaded: 4, convertedToJpeg: 4 } },
    },
    redactedPayload: {
      listingNumber: 100314793,
      photos: [{ bytesLoaded: true, sourceUrl: 'https://example.test/storage/v1/object/sign/private' }],
    },
    syncAttempt: {
      status: 'succeeded',
      idempotency_key: 'property24:exdev:update:listing-1:hash',
    },
  },
  recordSync: {
    status: 'RECORDED',
    listingId: 'listing-1',
    databaseWrite: {
      listingNumber: 100314793,
      property24Status: 'published',
    },
  },
  reconciliation: {
    status: 'OK',
    reconciliation: {
      summary: {
        localCount: 1,
        remoteCount: 1,
        matchedCount: 1,
        statusDriftCount: 0,
      },
      matched: [
        {
          listingNumber: 100314793,
          local: { listingId: 'listing-1' },
        },
      ],
    },
    updates: {
      summary: { updateCount: 1, matchedCount: 1, unmatchedCount: 0 },
    },
  },
}

const pack = createProperty24VettingPack({ reports })
assert.equal(pack.phase, 'property24-phase6-vetting-pack')
assert.equal(pack.status, 'READY_WITH_MANUAL_EXDEV_STEPS')
assert.ok(pack.summary.passCount >= 8)
assert.ok(pack.summary.manualCount >= 1)
assert.equal(pack.safety.credentialsRedacted, true)
assert.equal(pack.safety.imageBytesRedacted, true)
assert.equal(pack.evidence.find((item) => item.id === 'authenticated_echo').status, 'PASS')
assert.equal(pack.evidence.find((item) => item.id === 'invalid_listing_error_handling').status, 'PASS')
assert.equal(pack.evidence.find((item) => item.id === 'status_withdrawn_back_to_market_pending_sold').status, 'MANUAL_REQUIRED')
assert.ok(pack.suggestedCommands.manualExDevEvidence.some((command) => command.includes('status-update')))

const redacted = redactProperty24VettingValue({
  password: 'secret',
  serviceRoleKey: 'service',
  photos: [{ bytes: 'base64', sourceUrl: 'https://example.test/storage/v1/object/sign/private' }],
})
assert.equal(redacted.password, '[REDACTED]')
assert.equal(redacted.serviceRoleKey, '[REDACTED]')
assert.equal(redacted.photos[0].bytes, '[REDACTED_IMAGE_BYTES]')
assert.equal(redacted.photos[0].sourceUrl, '[REDACTED_SIGNED_STORAGE_URL]')

const markdown = renderProperty24VettingPackMarkdown(pack)
assert.match(markdown, /Property24 ExDev Vetting Pack/)
assert.match(markdown, /Authenticated echo test/)
assert.doesNotMatch(markdown, /secret/)

for (const path of [
  'server/property24/vettingPackService.js',
  'scripts/property24-vetting-pack.mjs',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}
const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:vetting-pack'], 'node scripts/property24-vetting-pack.mjs')
assert.equal(packageJson.scripts['test:property24-phase6-vetting-pack'], 'node scripts/property24-phase6-vetting-pack.test.mjs')
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:vetting-pack'], 'npm --prefix the-it-guy run property24:vetting-pack --')

console.log('Property24 phase 6 vetting pack contract passed')
