import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import {
  evaluateProperty24MigrationVerification,
  verifyProperty24MigrationMedia,
} from '../server/property24/migrationVerificationService.js'
import {
  parseProperty24MigrationVerifyArgs,
  renderProperty24MigrationVerificationMarkdown,
} from './property24-migration-verify.mjs'

const organisationId = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const listingNumber = 1001
const bytes = Buffer.from('verified property image')
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
const storagePath = `organisations/${organisationId}/property24/exdev/31382/${listingNumber}/0001-${sha256.slice(0, 20)}.jpg`
const publicUrl = `https://example.supabase.co/storage/v1/object/public/listing-media/${storagePath}`

const mappingPlan = {
  status: 'READY_WITH_RESOLUTION_REQUIRED',
  context: { organisationId, environment: 'exdev', agencyId: 31382 },
  summary: { imageRelationshipCount: 1 },
  agentPlans: [{ property24AgentId: 10, sourceReference: 'AGENT-10' }],
  listingPlans: [{
    identityKey: `property24:exdev:31382:listing:${listingNumber}`,
    listingNumber,
    sourceReference: 'LISTING-1001',
    privateListing: {
      listingReference: 'LISTING-1001',
      sellerCanonicalFacts: { property24Import: { listingType: 'Sale', raw: { ListingVisibility: 'Public' } } },
    },
    publicationData: { listingType: 'Sale' },
    mediaPlan: { images: [{ sourceOrdinal: 1 }] },
  }],
}

const imageManifest = {
  status: 'COMPLETE',
  summary: { completedImageCount: 1 },
  listings: [{
    listingNumber,
    media: [{ status: 'reused', sortOrder: 0, isCover: true, storagePath, publicUrl, sha256 }],
  }],
}

const rerunEvidence = {
  status: 'COMPLETE',
  summary: { createListingCount: 0, staleMediaRowCount: 0 },
  verification: { summary: { passed: true } },
  imageManifest: { summary: { uploadedImageCount: 0, reusedImageCount: 1, completedImageCount: 1 } },
  listingIds: { [String(listingNumber)]: listingId },
  completed: [{ step: 'listing_import', listingNumber, listingId, action: 'update', staleMediaRemoved: 0 }],
}

const liveSnapshot = {
  agents: [{ agentId: 10, sourceReference: 'AGENT-10', status: 'Inactive' }],
  listings: [{ listingNumber, listingType: 'Sale', status: 'Sold', isOnPortal: false }],
  blockers: [],
}

const arch9State = {
  organisation: { id: organisationId, name: 'Agency' },
  bucket: { id: 'listing-media', public: true },
  agents: [{ id: 'agent-map-1', property24_agent_id: 10, source_reference: 'AGENT-10', status: 'inactive', arch9_user_id: null }],
  listings: [{
    id: listingId,
    listing_reference: 'LISTING-1001',
    property24_reference: String(listingNumber),
    listing_status: 'sold',
    listing_visibility: 'archived',
    is_active: false,
    property24_status: 'removed',
    seller_canonical_facts_json: { property24Import: { sourceStatus: 'Sold', semanticStatus: 'sold' } },
  }],
  publications: [{ id: 'publication-1', listing_id: listingId, status: 'Archived' }],
  syncs: [{
    id: 'sync-1',
    private_listing_id: listingId,
    listing_number: listingNumber,
    external_status: 'removed',
    is_on_portal: false,
    last_response_summary: { currentStatus: 'Sold' },
  }],
  media: [{
    id: 'media-1',
    listing_id: listingId,
    media_type: 'image',
    storage_bucket: 'listing-media',
    storage_path: storagePath,
    file_url: publicUrl,
    sort_order: 0,
    is_cover: true,
  }],
}

const storageResults = [{
  listingNumber,
  sortOrder: 0,
  publicUrl,
  expectedSha256: sha256,
  actualSha256: sha256,
  httpStatus: 200,
  byteLength: bytes.length,
  ok: true,
  sha256Matches: true,
}]

const verified = evaluateProperty24MigrationVerification({
  mappingPlan,
  imageManifest,
  rerunEvidence,
  liveSnapshot,
  arch9State,
  storageResults,
  generatedAt: '2026-08-31T12:00:00.000Z',
})
assert.equal(verified.status, 'VERIFIED')
assert.equal(verified.summary.failedCheckCount, 0)
assert.equal(verified.summary.duplicateAgentMappingCount, 0)
assert.equal(verified.summary.duplicateListingIdentityCount, 0)
assert.equal(verified.summary.duplicateSyncCount, 0)
assert.equal(verified.summary.duplicateImageRowCount, 0)
assert.equal(verified.summary.unexpectedImageCount, 0)
assert.equal(verified.summary.verifiedImageCount, 1)
assert.equal(verified.safety.verificationReadOnly, true)

const duplicated = evaluateProperty24MigrationVerification({
  mappingPlan,
  imageManifest,
  rerunEvidence,
  liveSnapshot,
  arch9State: {
    ...arch9State,
    agents: [...arch9State.agents, { ...arch9State.agents[0], id: 'agent-map-2' }],
    listings: [...arch9State.listings, { ...arch9State.listings[0], id: '33333333-3333-4333-8333-333333333333' }],
    syncs: [...arch9State.syncs, { ...arch9State.syncs[0], id: 'sync-2' }],
    media: [...arch9State.media, { ...arch9State.media[0], id: 'media-2', sort_order: 1, is_cover: false }],
  },
  storageResults,
})
assert.equal(duplicated.status, 'FAILED')
assert.equal(duplicated.summary.duplicateAgentMappingCount, 1)
assert.equal(duplicated.summary.duplicateListingIdentityCount, 1)
assert.equal(duplicated.summary.duplicateSyncCount, 1)
assert.equal(duplicated.summary.duplicateImageRowCount, 1)
assert.equal(duplicated.summary.unexpectedImageCount, 0)
assert.ok(duplicated.failures.some((entry) => entry.id === 'listing_1001_media_exact_set'))

const mediaResults = await verifyProperty24MigrationMedia({
  imageManifest,
  fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes }),
})
assert.equal(mediaResults.length, 1)
assert.equal(mediaResults[0].sha256Matches, true)

const badMediaResults = await verifyProperty24MigrationMedia({
  imageManifest,
  fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('wrong') }),
})
assert.equal(badMediaResults[0].sha256Matches, false)

const options = parseProperty24MigrationVerifyArgs(['--concurrency=2', '--output=report.json', '--markdown-output=report.md'])
assert.equal(options.concurrency, 2)
assert.equal(options.output, 'report.json')
assert.equal(options.markdownOutput, 'report.md')
assert.match(renderProperty24MigrationVerificationMarkdown(verified), /Status: \*\*VERIFIED\*\*/)
assert.match(renderProperty24MigrationVerificationMarkdown(verified), /Duplicate listing identities: 0/)

const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(appPackage.scripts['property24:migration-verify'], 'node scripts/property24-migration-verify.mjs')
assert.equal(appPackage.scripts['test:property24-migration-verify'], 'node scripts/property24-migration-verify.test.mjs')

console.log('Property24 migration final verification tests passed')
