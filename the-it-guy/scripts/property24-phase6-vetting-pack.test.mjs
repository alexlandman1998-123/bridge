import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24OrganisationVettingPack,
  createProperty24VettingPack,
  redactProperty24VettingValue,
  renderProperty24VettingPackMarkdown,
} from '../server/property24/index.js'
import { buildProperty24VettingPackOperatorView } from '../src/services/property24VettingPackService.js'

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

function createFakeSupabase(tables = {}) {
  const operations = []
  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.limitCount = null
    }

    select() { operations.push({ table: this.table, action: 'select' }); return this }
    eq(column, value) { this.filters.push((row) => String(row[column]) === String(value)); return this }
    in(column, values) { const allowed = new Set(values.map(String)); this.filters.push((row) => allowed.has(String(row[column]))); return this }
    order() { return this }
    limit(value) { this.limitCount = Number(value); return this }
    then(resolve) {
      let data = [...(tables[this.table] || [])]
      for (const filter of this.filters) data = data.filter(filter)
      if (Number.isFinite(this.limitCount)) data = data.slice(0, this.limitCount)
      resolve({ data, error: null })
    }
  }
  return {
    operations,
    from(table) { return new Query(table) },
  }
}

function succeededAttempt(overrides = {}) {
  return {
    id: `attempt-${Math.random()}`,
    private_listing_id: 'listing-org-1',
    environment: 'exdev',
    agency_id: 31382,
    listing_number: 100314819,
    action: 'status_update',
    status: 'succeeded',
    idempotency_key: `idempotency-${Math.random()}`,
    property24_http_status: 200,
    retry_count: 0,
    request_payload_summary: {},
    created_at: '2026-08-31T10:00:00.000Z',
    ...overrides,
  }
}

const liveSupabase = createFakeSupabase({
  private_listings: [
    { id: 'listing-org-1', organisation_id: 'org-1', title: 'Organisation 1 home', property24_reference: '100314819', property24_status: 'published' },
    { id: 'listing-org-2', organisation_id: 'org-2', title: 'Organisation 2 home', property24_reference: '100399999', property24_status: 'published' },
  ],
  property24_listing_syncs: [
    { private_listing_id: 'listing-org-1', environment: 'exdev', agency_id: 31382, listing_number: 100314819, is_on_portal: true, updated_at: '2026-08-31T10:00:00.000Z' },
    { private_listing_id: 'listing-org-2', environment: 'exdev', agency_id: 31382, listing_number: 100399999, is_on_portal: true, updated_at: '2026-08-31T10:00:00.000Z' },
  ],
  property24_sync_attempts: [
    succeededAttempt({ request_payload_summary: { listingStatus: 'Active' }, created_at: '2026-08-31T10:07:00.000Z' }),
    succeededAttempt({ request_payload_summary: { listingStatus: 'Sold' }, created_at: '2026-08-31T10:06:00.000Z' }),
    succeededAttempt({ request_payload_summary: { listingStatus: 'Pending' }, created_at: '2026-08-31T10:05:00.000Z' }),
    succeededAttempt({ request_payload_summary: { listingStatus: 'Active' }, created_at: '2026-08-31T10:04:00.000Z' }),
    succeededAttempt({ request_payload_summary: { listingStatus: 'Withdrawn' }, created_at: '2026-08-31T10:03:00.000Z' }),
    succeededAttempt({
      action: 'update',
      request_payload_summary: { preview: { summary: { listingNumber: 100314819, imageCount: 3, photoPayloadCount: null }, imageByteLoad: { summary: { loaded: 3 } } } },
      created_at: '2026-08-31T10:02:00.000Z',
    }),
    succeededAttempt({
      action: 'update',
      request_payload_summary: { preview: { summary: { listingNumber: 100314819, imageCount: 3, photoPayloadCount: 3 }, imageByteLoad: { summary: { loaded: 3 } } } },
      created_at: '2026-08-31T10:01:00.000Z',
    }),
    succeededAttempt({ private_listing_id: 'listing-org-2', listing_number: 100399999 }),
  ],
})
const property24ReadResult = (data = []) => ({ status: 200, durationMs: 5, data })
const liveProperty24 = {
  echoAuthenticated: async () => property24ReadResult({ value: 'ok' }),
  fetchAgency: async () => property24ReadResult({ agencyId: 31382, name: 'Arch9 ExDev' }),
  fetchAgencyAgents: async () => property24ReadResult([{ agentId: 77959, firstname: 'Jon', lastname: 'Snow' }]),
  fetchCountries: async () => property24ReadResult([{ countryId: 1, name: 'South Africa' }]),
  fetchProvinces: async () => property24ReadResult([{ provinceId: 1, name: 'Western Cape' }]),
  fetchPropertyTypes: async () => property24ReadResult([{ id: 4, name: 'House' }]),
  fetchListingTypes: async () => property24ReadResult([{ id: 1, name: 'Sale' }]),
}
const liveReconciliation = {
  status: 'OK',
  reconciliation: {
    summary: { localCount: 1, remoteCount: 1, matchedCount: 1, statusDriftCount: 0 },
    matched: [{ listingNumber: 100314819, local: { listingId: 'listing-org-1' } }],
  },
  updates: { summary: { updateCount: 1, matchedCount: 1, unmatchedCount: 0 } },
}
const livePack = await createProperty24OrganisationVettingPack({
  supabase: liveSupabase,
  property24: liveProperty24,
  organisationId: 'org-1',
  connection: { environment: 'exdev', agencyId: 31382 },
  reconciliationReport: liveReconciliation,
  generatedAt: '2026-08-31T11:00:00.000Z',
})
assert.equal(livePack.status, 'READY_FOR_VETTING')
assert.equal(livePack.organisationId, 'org-1')
assert.equal(livePack.listingNumber, '100314819')
assert.equal(livePack.safety.property24ApiCalled, true)
assert.equal(livePack.safety.property24WriteCalled, false)
assert.equal(livePack.safety.databaseWritten, false)
assert.equal(livePack.redactedReports.publish.listingId, 'listing-org-1')
assert.doesNotMatch(JSON.stringify(livePack), /100399999/)
assert.ok(liveSupabase.operations.every((operation) => operation.action === 'select'))
const operatorView = buildProperty24VettingPackOperatorView(livePack)
assert.equal(operatorView.readyForVetting, true)
assert.equal(operatorView.summary.blockers, 0)
assert.equal(operatorView.summary.total, 12)

for (const path of [
  'server/property24/vettingPackService.js',
  'api/property24/settings/vetting-pack.js',
  'src/services/property24VettingPackService.js',
  'scripts/property24-vetting-pack.mjs',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}
assert.match(read('api/property24/settings/vetting-pack.js'), /auth\.getUser\(token\)/)
assert.match(read('api/property24/settings/vetting-pack.js'), /fetchOrganisationProperty24Connection/)
assert.match(read('api/property24/settings/vetting-pack.js'), /connection\.environment !== 'exdev'/)
assert.match(read('src/pages/settings/SettingsProperty24Page.jsx'), /ExDev vetting pack/)
assert.match(read('src/pages/settings/SettingsProperty24Page.jsx'), /Download report/)
const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:vetting-pack'], 'node scripts/property24-vetting-pack.mjs')
assert.equal(packageJson.scripts['test:property24-phase6-vetting-pack'], 'node scripts/property24-phase6-vetting-pack.test.mjs')
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:vetting-pack'], 'npm --prefix the-it-guy run property24:vetting-pack --')

console.log('Property24 phase 6 vetting pack contract passed')
