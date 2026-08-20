import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  applyControlledProperty24ListingPublish,
  applyControlledProperty24StatusUpdate,
  createProperty24Client,
  createProperty24Hash,
  createProperty24IdempotencyKey,
  createProperty24PayloadHashes,
  resolveProperty24PublishAction,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function createQuery(table, operations, rows) {
  const query = {
    upsert(payload, options) {
      operations.push({ table, op: 'upsert', payload, options })
      this.payload = payload
      return this
    },
    update(payload) {
      operations.push({ table, op: 'update', payload })
      this.payload = payload
      return this
    },
    select(columns) {
      operations.push({ table, op: 'select', columns })
      return this
    },
    eq(column, value) {
      operations.push({ table, op: 'eq', column, value })
      return this
    },
    single() {
      const id = this.payload?.id || rows.length + 1
      const data = {
        id,
        ...this.payload,
      }
      rows.push({ table, data })
      return { data, error: null }
    },
  }
  return query
}

function createFakeSupabase() {
  const operations = []
  const rows = []
  return {
    operations,
    rows,
    from(table) {
      return createQuery(table, operations, rows)
    },
  }
}

for (const path of [
  'server/property24/workflowService.js',
  'scripts/property24-status-update.mjs',
  'sql/20260820_property24_sync_attempts.sql',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}
assert.ok(fs.existsSync(new URL('../../supabase/migrations/20260820114528_property24_sync_attempts.sql', import.meta.url)))
assert.ok(fs.existsSync(new URL('../api/property24/listings/[listingId]/status-update.js', import.meta.url)))

const payload = {
  listingNumber: 100314793,
  status: 'Active',
  photos: null,
}
const hashes = createProperty24PayloadHashes(payload)
assert.equal(hashes.payloadHash.length, 64)
assert.equal(hashes.imagePayloadHash, createProperty24Hash(null))
assert.equal(resolveProperty24PublishAction({ preview: { payload } }), 'update')
assert.equal(resolveProperty24PublishAction({ preview: { payload: { status: 'NewListing' } } }), 'create')
assert.match(createProperty24IdempotencyKey({
  listingId: 'listing-123',
  environment: 'exdev',
  action: 'update',
  payloadHash: hashes.payloadHash,
}), /^property24:exdev:update:listing-123:/)

const publishSupabase = createFakeSupabase()
let delegatedConfig = null
const publishReport = await applyControlledProperty24ListingPublish({
  supabase: publishSupabase,
  property24: { type: 'property24' },
  config: {
    listingId: 'listing-123',
    agencyId: 31382,
    environment: 'exdev',
  },
  preview: {
    canSubmit: true,
    summary: {
      listingNumber: null,
    },
    payload: {
      status: 'NewListing',
      photos: [{ bytes: 'RAW_BYTES', mimeContentType: 'image/jpeg' }],
    },
  },
  report: {
    status: 'READY_TO_APPLY',
    preview: { canSubmit: true },
  },
  applyPublish: async (args) => {
    delegatedConfig = args.config
    return {
      ...args.report,
      status: 'SUBMITTED',
      property24Response: {
        httpStatus: 200,
        durationMs: 12,
        summary: { type: 'object' },
        data: { listingNumber: 100314793, isOnPortal: true },
      },
      portalCheck: { summary: { value: true } },
      databaseWrite: { listingNumber: 100314793, property24Status: 'published' },
    }
  },
})
assert.equal(publishReport.status, 'SUBMITTED')
assert.equal(publishReport.syncAttempt.status, 'succeeded')
assert.equal(delegatedConfig.payloadHash.length, 64)
assert.equal(delegatedConfig.imagePayloadHash.length, 64)
assert.ok(publishSupabase.operations.some((operation) => operation.table === 'property24_sync_attempts' && operation.op === 'upsert'))
assert.ok(publishSupabase.operations.some((operation) => operation.table === 'property24_sync_attempts' && operation.op === 'update'))
assert.doesNotMatch(JSON.stringify(publishSupabase.operations), /RAW_BYTES/)

const blockedSupabase = createFakeSupabase()
const blockedReport = await applyControlledProperty24ListingPublish({
  supabase: blockedSupabase,
  property24: { type: 'property24' },
  config: {
    listingId: 'listing-123',
    agencyId: 31382,
    environment: 'exdev',
  },
  preview: {
    canSubmit: false,
    dataBlockers: ['missing_description'],
    technicalBlockers: [],
    payload: null,
  },
  report: {
    status: 'BLOCKED',
    preview: { canSubmit: false },
  },
  applyPublish: async () => {
    throw new Error('applyPublish must not be called when preview is blocked')
  },
})
assert.equal(blockedReport.status, 'BLOCKED')
assert.equal(blockedReport.syncAttempt.status, 'blocked')

const statusSupabase = createFakeSupabase()
const statusReport = await applyControlledProperty24StatusUpdate({
  supabase: statusSupabase,
  property24: {
    updateListingStatus: async (listingNumber, listingStatus) => ({
      status: 200,
      durationMs: 9,
      data: { listingNumber, listingStatus },
    }),
    checkListingOnPortal: async () => ({
      status: 200,
      durationMs: 4,
      data: false,
    }),
  },
  config: {
    listingId: 'listing-123',
    agencyId: 31382,
    environment: 'exdev',
  },
  listingNumber: 100314793,
  listingStatus: 'Withdrawn',
})
assert.equal(statusReport.status, 'SUBMITTED')
assert.equal(statusReport.syncAttempt.status, 'succeeded')
assert.ok(statusSupabase.operations.some((operation) => operation.table === 'property24_listing_syncs' && operation.op === 'upsert'))
assert.ok(statusSupabase.operations.some((operation) => operation.table === 'private_listings' && operation.op === 'update'))

const fetchCalls = []
const client = createProperty24Client({
  baseUrl: 'https://api.exdev.property24-test.com',
  username: 'user@example.test',
  password: 'secret',
  fetchImpl: async (url, options) => {
    fetchCalls.push({ url: String(url), options })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => '',
    }
  },
})
await client.updateListingStatus(100314793, 'Withdrawn')
assert.equal(fetchCalls[0].options.method, 'PUT')
assert.equal(fetchCalls[0].url, 'https://api.exdev.property24-test.com/listing/v53/listings/100314793/status?listingStatus=Withdrawn')

const apiContract = read('server/property24/apiContract.js')
assert.match(apiContract, /updateListingStatus/)
const apiSource = read('server/property24/api.js')
assert.match(apiSource, /applyControlledProperty24ListingPublish/)
assert.match(apiSource, /status-update/)
assert.match(apiSource, /photosChanged/)
const publishScript = read('scripts/property24-publish-listing.mjs')
assert.match(publishScript, /applyControlledProperty24ListingPublish/)
assert.match(publishScript, /--photos-unchanged/)
const statusScript = read('scripts/property24-status-update.mjs')
assert.match(statusScript, /No Property24 write was made/)

const migration = read('sql/20260820_property24_sync_attempts.sql')
assert.match(migration, /property24_sync_attempts/)
assert.match(migration, /last_payload_hash/)
assert.match(migration, /grant select, insert, update, delete on public\.property24_sync_attempts to service_role/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:status-update'], 'node scripts/property24-status-update.mjs')
assert.equal(packageJson.scripts['test:property24-phase4-workflow'], 'node scripts/property24-phase4-workflow.test.mjs')
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:status-update'], 'npm --prefix the-it-guy run property24:status-update --')

console.log('Property24 phase 4 workflow contract passed')
