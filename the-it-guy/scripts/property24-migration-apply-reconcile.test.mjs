import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildProperty24MigrationApplyPlan,
  executeProperty24MigrationApply,
  fetchProperty24MigrationLiveSnapshot,
} from '../server/property24/migrationApplyService.js'
import { parseProperty24MigrationApplyArgs } from './property24-migration-apply-reconcile.mjs'

const organisationId = '11111111-1111-4111-8111-111111111111'

function listingPlan(number, listingType, agentId, sourceReference) {
  return {
    identityKey: `property24:exdev:31382:listing:${number}`,
    listingNumber: number,
    sourceStatus: 'Active',
    sourceReference,
    mappingFingerprint: `fingerprint-${number}`,
    privateListing: {
      organisationId,
      assignedAgentId: null,
      listingReference: sourceReference,
      listingStatus: 'active',
      listingVisibility: 'active_market',
      propertyCategory: 'residential',
      listingSource: 'imported_stock',
      propertyStructureType: 'other',
      propertyType: 'house',
      listingCategory: listingType === 'Rental' ? 'rental' : 'private_sale',
      title: `Listing ${number}`,
      description: 'Description',
      askingPrice: 1000,
      addressLine1: '1 Main Road',
      formattedAddress: '1 Main Road, Cape Town',
      streetAddress: '1 Main Road',
      suburb: 'Cape Town',
      city: 'Cape Town',
      province: 'Western Cape',
      country: 'South Africa',
      mandateStatus: 'signed_external_pending_upload',
      sellerOnboardingStatus: 'not_started',
      isActive: true,
      property24Reference: String(number),
      property24Status: 'published',
      internalListingNotes: 'imported',
      sellerCanonicalFacts: { property24Import: { listingType, raw: { ListingVisibility: 'Public' } } },
    },
    publicationData: {
      title: `Listing ${number}`,
      address: '1 Main Road, Cape Town',
      suburb: 'Cape Town',
      province: 'Western Cape',
      propertyType: 'house',
      listingType,
      askingPrice: 1000,
      bedrooms: 2,
      bathrooms: 1,
      garages: 0,
      parkingBays: 1,
      floorSize: 80,
      erfSize: 100,
      ratesTaxes: 10,
      levies: 20,
      description: 'Description',
      features: [],
      amenities: [],
    },
    agentRelationships: [{ property24AgentId: agentId, arch9UserId: null }],
    mediaPlan: { images: [{ sourceUrl: `https://images.exdev.property24-test.com/${number}`, sourceOrdinal: 1 }] },
  }
}

const mappingPlan = {
  version: 'property24_migration_mapping_v1',
  status: 'READY_WITH_RESOLUTION_REQUIRED',
  context: { organisationId, environment: 'exdev', agencyId: 31382 },
  summary: { imageRelationshipCount: 2 },
  agentPlans: [
    {
      property24AgentId: 10,
      sourceReference: 'AGENT-10',
      arch9UserId: null,
      mappingRow: { source_reference: 'AGENT-10', match_type: 'manual', confidence: 0, status: 'active' },
    },
    {
      property24AgentId: 20,
      sourceReference: 'AGENT-20',
      arch9UserId: null,
      mappingRow: { source_reference: 'AGENT-20', match_type: 'manual', confidence: 0, status: 'active' },
    },
  ],
  listingPlans: [
    listingPlan(1001, 'Rental', 10, 'LISTING-1001'),
    listingPlan(1002, 'Sale', 20, 'LISTING-1002'),
  ],
}

const property24 = {
  async fetchAgencyAgents() {
    return { status: 200, data: [
      { agentId: 10, sourceReference: 'AGENT-10', status: 'Inactive', firstname: 'Jon', lastname: 'Snow', emailAddress: 'jon@example.com', mobileNumber: '1' },
      { agentId: 20, sourceReference: 'AGENT-20', status: 'Active', firstname: 'Pauly', lastname: 'Shore', emailAddress: 'pauly@example.com', mobileNumber: '2' },
    ] }
  },
  async fetchListingReconciliation() {
    return { status: 200, data: [{ listingNumber: 1001, status: 'Active' }, { listingNumber: 1002, status: 'Active' }] }
  },
  async fetchListingUpdates() {
    return { status: 200, data: { listings: [{ listingNumber: 1001, currentStatus: 'Rented', reasonType: 'Valid', isOnPortal: false }] } }
  },
  async checkListingOnPortal(number) {
    return { status: 200, data: number === 1002 }
  },
}

const liveSnapshot = await fetchProperty24MigrationLiveSnapshot({ property24, mappingPlan, fromDate: '2026-08-25T00:00:00.000Z' })
assert.equal(liveSnapshot.blockers.length, 0)
assert.equal(liveSnapshot.listings[0].status, 'Rented')
assert.equal(liveSnapshot.listings[0].source, 'updates')
assert.equal(liveSnapshot.listings[1].status, 'Active')
assert.equal(liveSnapshot.agents[0].status, 'Inactive')

const exportStatusFallback = await fetchProperty24MigrationLiveSnapshot({
  property24: {
    async fetchAgencyAgents() { return { status: 200, data: property24.fetchAgencyAgents ? (await property24.fetchAgencyAgents()).data : [] } },
    async fetchListingReconciliation() { return { status: 200, data: [] } },
    async fetchListingUpdates() { return { status: 200, data: [] } },
    async checkListingOnPortal() { return { status: 200, data: true } },
  },
  mappingPlan: {
    ...mappingPlan,
    listingPlans: [listingPlan(1003, 'Sale', 10, 'LISTING-1003')],
  },
})
assert.equal(exportStatusFallback.blockers.length, 0)
assert.equal(exportStatusFallback.listings[0].status, 'Active')
assert.equal(exportStatusFallback.listings[0].source, 'export')

const portalStateFallback = await fetchProperty24MigrationLiveSnapshot({
  property24: {
    async fetchAgencyAgents() { return { status: 200, data: (await property24.fetchAgencyAgents()).data } },
    async fetchListingReconciliation() { return { status: 200, data: [] } },
    async fetchListingUpdates() { return { status: 200, data: [] } },
    async checkListingOnPortal() { return { status: 200, data: false } },
  },
  mappingPlan: {
    ...mappingPlan,
    listingPlans: [listingPlan(1004, 'Sale', 10, 'LISTING-1004')],
  },
})
assert.equal(portalStateFallback.blockers.length, 0)
assert.equal(portalStateFallback.listings[0].status, 'Withdrawn')
assert.equal(portalStateFallback.listings[0].source, 'portal_state_fallback')

const target = {
  organisation: { id: organisationId, name: 'Agency' },
  branch: { id: '22222222-2222-4222-8222-222222222222' },
  listings: [],
  syncs: [],
  agentMappings: [],
  bucket: { id: 'listing-media', public: true },
}

const dryPlan = buildProperty24MigrationApplyPlan({ mappingPlan, liveSnapshot, target, generatedAt: '2026-08-31T10:00:00.000Z' })
const secondDryPlan = buildProperty24MigrationApplyPlan({ mappingPlan, liveSnapshot, target, generatedAt: '2026-08-31T10:00:00.000Z' })
assert.equal(dryPlan.status, 'READY')
assert.deepEqual(dryPlan.listingIds, secondDryPlan.listingIds, 'new listing IDs must be deterministic across resumptions')
assert.equal(dryPlan.agentOperations[0].row.status, 'inactive')
assert.equal(dryPlan.listingOperations[0].privateListingRow.listing_status, 'withdrawn')
assert.equal(dryPlan.listingOperations[0].privateListingRow.property24_status, 'removed')
assert.equal(dryPlan.listingOperations[1].privateListingRow.listing_status, 'active')
assert.equal(dryPlan.summary.unresolvedArch9AgentCount, 2)

const imageManifest = {
  status: 'COMPLETE',
  summary: { completedImageCount: 2 },
  listings: dryPlan.listingOperations.map((operation, index) => ({
    listingNumber: operation.listingNumber,
    media: [{
      status: index ? 'reused' : 'uploaded',
      publicUrl: `https://example.supabase.co/${operation.listingNumber}.jpg`,
      caption: null,
      sortOrder: 0,
      isCover: true,
      storageBucket: 'listing-media',
      storagePath: `${operation.listingNumber}.jpg`,
      contentType: 'image/jpeg',
      byteLength: 10,
      width: 10,
      height: 10,
      sha256: `hash-${operation.listingNumber}`,
    }],
  })),
}

const completePlan = buildProperty24MigrationApplyPlan({ mappingPlan, liveSnapshot, target, imageManifest, requireCompleteImages: true })
assert.equal(completePlan.status, 'READY')
assert.equal(completePlan.summary.mediaRowCount, 2)

const planWithLegacyMedia = buildProperty24MigrationApplyPlan({
  mappingPlan,
  liveSnapshot,
  target: {
    ...target,
    media: [{
      id: '55555555-5555-4555-8555-555555555555',
      listing_id: completePlan.listingOperations[0].listingId,
      media_type: 'image',
      storage_bucket: 'documents',
      storage_path: 'legacy/image.jpg',
      file_url: 'https://example.com/legacy.jpg',
    }],
  },
  imageManifest,
  requireCompleteImages: true,
})
assert.equal(planWithLegacyMedia.summary.staleMediaRowCount, 1)
assert.deepEqual(planWithLegacyMedia.listingOperations[0].staleMediaIds, ['55555555-5555-4555-8555-555555555555'])

const incomplete = buildProperty24MigrationApplyPlan({ mappingPlan, liveSnapshot, target, imageManifest: { status: 'PARTIAL', summary: { completedImageCount: 1 } }, requireCompleteImages: true })
assert.equal(incomplete.status, 'BLOCKED')
assert.ok(incomplete.blockers.some((blocker) => blocker.code === 'image_import_incomplete'))

const collision = buildProperty24MigrationApplyPlan({
  mappingPlan,
  liveSnapshot,
  target: {
    ...target,
    syncs: [{ listing_number: 1001, private_listing_id: '33333333-3333-4333-8333-333333333333' }],
    listings: [{ id: '44444444-4444-4444-8444-444444444444', property24_reference: '1001', listing_reference: '' }],
  },
})
assert.ok(collision.blockers.some((blocker) => blocker.code === 'listing_identity_collision'))

const writes = []
let appliedPlan = null
const repository = {
  async inspect() { return target },
  async saveAgent(operation) { writes.push(['agent', operation.property24AgentId]); return operation.row },
  async saveListing(operation) { writes.push(['listing', operation.listingNumber]); return operation.privateListingRow },
  async savePublication(operation) { writes.push(['publication', operation.listingNumber]); return operation.publicationRow },
  async saveSync(operation) { writes.push(['sync', operation.listingNumber]); return operation.syncRow },
  async saveMedia(operation) { writes.push(['media', operation.listingNumber]); return operation.mediaRows },
  async verify(input) {
    appliedPlan = input
    return {
      listings: input.listingIds.map((id) => ({ id })),
      publications: input.listingIds.map((listing_id) => ({ listing_id })),
      syncs: input.listingNumbers.map((listing_number, index) => ({ listing_number, private_listing_id: input.listingIds[index] })),
      media: input.listingIds.map((listing_id, index) => ({ listing_id, storage_bucket: 'listing-media', storage_path: `${input.listingNumbers[index]}.jpg` })),
      agents: input.property24AgentIds.map((property24_agent_id) => ({ property24_agent_id })),
    }
  },
}

const dryRun = await executeProperty24MigrationApply({ repository, property24, mappingPlan, apply: false })
assert.equal(dryRun.status, 'DRY_RUN_READY')
assert.equal(writes.length, 0)

const applied = await executeProperty24MigrationApply({ repository, property24, mappingPlan, imageManifest, apply: true })
assert.equal(applied.status, 'COMPLETE')
assert.equal(applied.safety.property24WritesPerformed, false)
assert.equal(applied.verification.summary.passed, true)
assert.equal(writes.filter(([type]) => type === 'agent').length, 2)
assert.equal(writes.filter(([type]) => type === 'listing').length, 2)
assert.ok(appliedPlan)

const options = parseProperty24MigrationApplyArgs(['--apply', '--concurrency=2', '--attempts=2'])
assert.equal(options.apply, true)
assert.equal(options.concurrency, 2)
assert.equal(options.attempts, 2)

const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(appPackage.scripts['property24:migration-apply-reconcile'], 'node scripts/property24-migration-apply-reconcile.mjs')
assert.equal(appPackage.scripts['test:property24-migration-apply-reconcile'], 'node scripts/property24-migration-apply-reconcile.test.mjs')
const mappingMigration = fs.readFileSync(new URL('../../supabase/migrations/202608200002_property24_agent_catalog_mappings.sql', import.meta.url), 'utf8')
assert.match(mappingMigration, /property24_mappings_set_updated_at[\s\S]*set search_path = public/)

console.log('Property24 migration apply/reconcile tests passed')
