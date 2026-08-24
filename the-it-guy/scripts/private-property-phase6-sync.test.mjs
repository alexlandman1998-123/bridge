import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  recordPrivatePropertyListingSync,
  resolveArch9PrivatePropertyStatus,
  resolvePrivatePropertyExternalStatus,
  summarizePrivatePropertySyncPayload,
} from '../server/services/privatePropertyListingSyncService.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(table, operations) {
    this.table = table
    this.operations = operations
    this.last = null
  }

  upsert(payload, options) {
    this.last = { op: 'upsert', table: this.table, payload, options }
    this.operations.push(this.last)
    return this
  }

  update(payload) {
    this.last = { op: 'update', table: this.table, payload, filters: [] }
    this.operations.push(this.last)
    return this
  }

  eq(column, value) {
    this.last.filters.push({ column, value })
    return this
  }

  select(columns) {
    this.last.columns = columns
    return this
  }

  async single() {
    if (this.table === 'private_property_listing_syncs') {
      return {
        data: {
          id: 'sync-1',
          ...this.last.payload,
        },
        error: null,
      }
    }
    if (this.table === 'private_listings') {
      return {
        data: {
          id: this.last.filters.find((filter) => filter.column === 'id')?.value,
          private_property_reference: this.last.payload.private_property_reference || 'T2870287',
          private_property_status: this.last.payload.private_property_status,
          private_property_listing_url: this.last.payload.private_property_listing_url || null,
          updated_at: '2026-08-24T08:10:00.000Z',
        },
        error: null,
      }
    }
    if (this.table === 'listing_external_links') {
      return {
        data: {
          id: 'external-link-1',
          listing_id: this.last.payload.listing_id,
          platform: this.last.payload.platform,
          url: this.last.payload.url,
          status: this.last.payload.status,
          published_at: this.last.payload.published_at,
          last_checked_at: this.last.payload.last_checked_at,
          visible_to_seller: this.last.payload.visible_to_seller,
        },
        error: null,
      }
    }
    return { data: null, error: null }
  }
}

function createFakeClient() {
  const operations = []
  return {
    operations,
    from(table) {
      return new FakeQuery(table, operations)
    },
  }
}

function createMandateBlockedClient() {
  const client = createFakeClient()
  client.from = (table) => {
    const query = new FakeQuery(table, client.operations)
    if (table === 'private_listings') {
      query.single = async () => ({
        data: null,
        error: {
          code: 'P0001',
          message: 'A completed canonical mandate packet or manual signed mandate upload is required before activating this listing.',
          details: 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED',
        },
      })
    }
    return query
  }
  return client
}

assert.equal(resolvePrivatePropertyExternalStatus({ privatePropertyStatus: 'For Sale' }), 'active')
assert.equal(resolvePrivatePropertyExternalStatus({ eventType: 'Activated', eventStatus: 'Active' }), 'active')
assert.equal(resolvePrivatePropertyExternalStatus({ eventType: 'ErrorDownloadingImages' }), 'failed')
assert.equal(resolvePrivatePropertyExternalStatus({ privatePropertyStatus: 'Inactive' }), 'inactive')
assert.equal(resolvePrivatePropertyExternalStatus({ fallback: 'Active' }), 'active')
assert.equal(resolveArch9PrivatePropertyStatus({ externalStatus: 'active' }), 'published')
assert.equal(resolveArch9PrivatePropertyStatus({ externalStatus: 'failed' }), 'draft')
assert.deepEqual(summarizePrivatePropertySyncPayload({
  propertyId: 'PRV-1',
  branchId: 'branch',
  agentIds: ['A1'],
  listingType: 'Sale',
  category: 'Residential',
  mandateType: 'FullMandate',
  propertyStatus: 'ForSale',
  price: 100,
  listingDate: '2026-08-24',
  suburbId: 140,
  imageUrlCount: 4,
  photoUrlPayloadCount: 4,
  attributeCount: 9,
  photoUrls: ['https://signed.example.com/secret-token'],
}), {
  propertyId: 'PRV-1',
  branchId: 'branch',
  agentIds: ['A1'],
  listingType: 'Sale',
  category: 'Residential',
  mandateType: 'FullMandate',
  propertyStatus: 'ForSale',
  price: 100,
  listingDate: '2026-08-24',
  suburbId: 140,
  imageUrlCount: 4,
  photoUrlPayloadCount: 4,
  attributeCount: 9,
})

const client = createFakeClient()
const result = await recordPrivatePropertyListingSync({
  client,
  listingId: 'f35d8916-2ae9-4364-b364-fc279e260fa7',
  propertyId: 'PRV-202608201031-U8YM',
  branchGuid: '11111111-1111-4111-8111-111111111111',
  environment: 'sandbox',
  listingType: 'Sale',
  privatePropertyRef: 'T2870287',
  privatePropertyStatus: 'For Sale',
  eventType: 'Activated',
  eventStatus: 'Active',
  eventDescription: 'T2870287',
  eventAt: '2026-08-24T07:56:09.6449114Z',
  continuationKey: 'cursor',
  suburbId: 140,
  agentIds: ['ARCH9-SANDBOX-USER-1'],
  responseSummary: { method: 'UpdateListing', resultText: 'Successful' },
  payloadSummary: { propertyId: 'PRV-202608201031-U8YM', branchId: '11111111-1111-4111-8111-111111111111', agentIds: ['ARCH9-SANDBOX-USER-1'], imageUrlCount: 4 },
  eventSummary: { listingFeedEventType: 'Activated', privatePropertyRef: 'T2870287' },
  submittedAt: '2026-08-24T07:55:00.336Z',
  activatedAt: '2026-08-24T07:56:09.6449114Z',
  privatePropertyListingUrl: 'https://www.privateproperty.co.za/for-sale/example/T2870287',
})

assert.equal(result.sync.private_listing_id, 'f35d8916-2ae9-4364-b364-fc279e260fa7')
assert.equal(result.sync.property_id, 'PRV-202608201031-U8YM')
assert.equal(result.sync.private_property_ref, 'T2870287')
assert.equal(result.sync.external_status, 'active')
assert.equal(result.sync.is_on_portal, true)
assert.equal(result.listing.private_property_status, 'published')
assert.equal(result.listing.private_property_reference, 'T2870287')
assert.equal(result.externalLink.platform, 'Private Property')
assert.equal(result.listingUpdateWarning, null)

assert.ok(client.operations.some((operation) => operation.table === 'private_property_listing_syncs' && operation.op === 'upsert'))
assert.ok(client.operations.some((operation) => operation.table === 'private_listings' && operation.op === 'update'))
assert.ok(client.operations.some((operation) => operation.table === 'listing_external_links' && operation.op === 'upsert'))
const syncOperation = client.operations.find((operation) => operation.table === 'private_property_listing_syncs')
assert.deepEqual(syncOperation.options, { onConflict: 'private_listing_id,environment' })
assert.equal(syncOperation.payload.agent_ids[0], 'ARCH9-SANDBOX-USER-1')
assert.equal(syncOperation.payload.last_payload_summary.imageUrlCount, 4)
assert.equal(syncOperation.payload.last_payload_summary.photoUrls, undefined)

const mandateBlockedClient = createMandateBlockedClient()
const mandateBlockedResult = await recordPrivatePropertyListingSync({
  client: mandateBlockedClient,
  listingId: 'f35d8916-2ae9-4364-b364-fc279e260fa7',
  propertyId: 'PRV-202608201031-U8YM',
  branchGuid: '11111111-1111-4111-8111-111111111111',
  privatePropertyRef: 'T2870287',
  privatePropertyStatus: 'For Sale',
})
assert.equal(mandateBlockedResult.sync.private_property_ref, 'T2870287')
assert.equal(mandateBlockedResult.listing, null)
assert.equal(mandateBlockedResult.listingUpdateWarning.details, 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED')

const sql = read('sql/20260824_private_property_listing_syncs.sql')
assert.match(sql, /create table if not exists public\.private_property_listing_syncs/)
assert.match(sql, /private_listing_id uuid not null references public\.private_listings\(id\) on delete cascade/)
assert.match(sql, /branch_guid uuid not null/)
assert.match(sql, /private_property_ref text/)
assert.match(sql, /continuation_key text/)
assert.match(sql, /alter table public\.private_property_listing_syncs enable row level security/)
assert.match(sql, /grant select, insert, update, delete on public\.private_property_listing_syncs to service_role/)
assert.doesNotMatch(sql, /create policy/i)

const migration = fs.readFileSync(new URL('../../supabase/migrations/20260824080502_private_property_listing_syncs.sql', import.meta.url), 'utf8')
assert.match(migration, /private_property_listing_syncs/)
assert.match(migration, /service_role/)

const recordScript = read('scripts/private-property-record-listing-sync.mjs')
assert.match(recordScript, /private-property-publish-listing\.json/)
assert.match(recordScript, /private-property-listing-status\.json/)
assert.match(recordScript, /private-property-event-feed\.json/)
assert.match(recordScript, /RECORDED/)
assert.doesNotMatch(recordScript, /requestBody/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:record-listing-sync'], 'node scripts/private-property-record-listing-sync.mjs')
assert.equal(packageJson.scripts['test:private-property-phase6'], 'node scripts/private-property-phase6-sync.test.mjs')

console.log('Private Property phase 6 listing sync contract passed')
