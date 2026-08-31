import crypto from 'node:crypto'
import { fetchProperty24MigrationLiveSnapshot } from './migrationApplyService.js'
import { mapProperty24ListingStatus } from './migrationMappingService.js'

export const PROPERTY24_MIGRATION_VERIFICATION_VERSION = 'property24_migration_verification_v1'

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function integer(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function requireData(result, label) {
  if (result?.error) throw new Error(`${label}: ${result.error.message || result.error}`)
  return result?.data
}

function pass(id, detail, evidence = {}) {
  return { id, status: 'PASS', detail, evidence }
}

function fail(id, detail, evidence = {}) {
  return { id, status: 'FAIL', detail, evidence }
}

function check(id, condition, passDetail, failDetail, evidence = {}) {
  return condition ? pass(id, passDetail, evidence) : fail(id, failDetail, evidence)
}

function sourceListingType(plan = {}) {
  return text(plan.publicationData?.listingType || plan.privateListing?.sellerCanonicalFacts?.property24Import?.listingType || 'Sale')
}

function sourceListingVisibility(plan = {}) {
  return text(plan.privateListing?.sellerCanonicalFacts?.property24Import?.raw?.ListingVisibility || 'Public')
}

function successfulManifestMedia(imageManifest = {}, listingNumber) {
  const listing = (imageManifest.listings || []).find((entry) => integer(entry.listingNumber) === integer(listingNumber))
  return (listing?.media || []).filter((item) => ['uploaded', 'reused'].includes(item.status)).sort((left, right) => left.sortOrder - right.sortOrder)
}

function compareArrays(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function listingIdentityCandidates(plan, state) {
  const number = integer(plan.listingNumber)
  const sourceReference = text(plan.sourceReference || plan.privateListing?.listingReference)
  const syncIds = state.syncs.filter((row) => integer(row.listing_number) === number).map((row) => text(row.private_listing_id))
  const listingIds = state.listings.filter((row) => (
    text(row.property24_reference) === String(number) ||
    text(row.listing_reference) === sourceReference ||
    syncIds.includes(text(row.id))
  )).map((row) => text(row.id))
  return unique([...syncIds, ...listingIds])
}

function statusChecks(plan, live, listing, publication, sync) {
  const expected = mapProperty24ListingStatus(live.status, sourceListingType(plan), sourceListingVisibility(plan))
  const canonical = listing?.seller_canonical_facts_json?.property24Import || {}
  return [
    check(
      `listing_${plan.listingNumber}_status`,
      listing?.listing_status === expected.listingStatus &&
        listing?.listing_visibility === expected.listingVisibility &&
        Boolean(listing?.is_active) === expected.isActive &&
        listing?.property24_status === expected.property24Status,
      `Arch9 listing state matches Property24 ${live.status}.`,
      `Arch9 listing state does not match Property24 ${live.status}.`,
      {
        expected: {
          listingStatus: expected.listingStatus,
          listingVisibility: expected.listingVisibility,
          isActive: expected.isActive,
          property24Status: expected.property24Status,
        },
        actual: listing ? {
          listingStatus: listing.listing_status,
          listingVisibility: listing.listing_visibility,
          isActive: listing.is_active,
          property24Status: listing.property24_status,
        } : null,
      },
    ),
    check(
      `listing_${plan.listingNumber}_publication`,
      publication?.status === expected.publicationStatus,
      `Publication state is ${expected.publicationStatus}.`,
      `Publication state is not ${expected.publicationStatus}.`,
      { expected: expected.publicationStatus, actual: publication?.status || null },
    ),
    check(
      `listing_${plan.listingNumber}_sync`,
      sync?.external_status === expected.syncExternalStatus &&
        Boolean(sync?.is_on_portal) === Boolean(live.isOnPortal) &&
        text(sync?.last_response_summary?.currentStatus) === live.status,
      `Property24 sync row records ${live.status} and portal=${live.isOnPortal}.`,
      'Property24 sync row differs from the current Property24 snapshot.',
      {
        expected: { externalStatus: expected.syncExternalStatus, isOnPortal: live.isOnPortal, currentStatus: live.status },
        actual: sync ? { externalStatus: sync.external_status, isOnPortal: sync.is_on_portal, currentStatus: sync.last_response_summary?.currentStatus } : null,
      },
    ),
    check(
      `listing_${plan.listingNumber}_canonical_status`,
      text(canonical.sourceStatus) === live.status && key(canonical.semanticStatus) === key(expected.semanticStatus),
      'Canonical import metadata preserves the current Property24 semantic status.',
      'Canonical import metadata does not preserve the current Property24 semantic status.',
      {
        expected: { sourceStatus: live.status, semanticStatus: expected.semanticStatus },
        actual: { sourceStatus: canonical.sourceStatus || null, semanticStatus: canonical.semanticStatus || null },
      },
    ),
  ]
}

function mediaChecks(plan, listingId, state, imageManifest, storageResults) {
  const expected = successfulManifestMedia(imageManifest, plan.listingNumber)
  const expectedPaths = expected.map((item) => text(item.storagePath))
  const rows = state.media.filter((row) => text(row.listing_id) === listingId && key(row.media_type) === 'image')
  const ordered = [...rows].sort((left, right) => left.sort_order - right.sort_order)
  const actualPaths = ordered.map((row) => text(row.storage_path))
  const actualOrders = ordered.map((row) => row.sort_order)
  const expectedOrders = expected.map((_, index) => index)
  const covers = ordered.filter((row) => row.is_cover)
  const reachability = storageResults.filter((result) => result.listingNumber === integer(plan.listingNumber))
  return [
    check(
      `listing_${plan.listingNumber}_media_exact_set`,
      compareArrays(actualPaths, expectedPaths),
      `Exactly ${expected.length} canonical images are attached with no duplicates.`,
      'Attached image rows do not exactly match the canonical rehosted image set.',
      { expectedPaths, actualPaths },
    ),
    check(
      `listing_${plan.listingNumber}_media_order`,
      compareArrays(actualOrders, expectedOrders),
      `Image sort order is contiguous from 0 to ${Math.max(0, expected.length - 1)}.`,
      'Image sort order is duplicated or non-contiguous.',
      { expectedOrders, actualOrders },
    ),
    check(
      `listing_${plan.listingNumber}_cover`,
      covers.length === 1 && covers[0]?.sort_order === 0,
      'Exactly one cover image is set at sort order 0.',
      'The listing does not have exactly one cover at sort order 0.',
      { coverCount: covers.length, coverOrders: covers.map((row) => row.sort_order) },
    ),
    check(
      `listing_${plan.listingNumber}_media_integrity`,
      reachability.length === expected.length && reachability.every((result) => result.ok && result.sha256Matches),
      'Every rehosted image is publicly reachable and matches its source SHA-256.',
      'At least one rehosted image is unreachable or has a SHA-256 mismatch.',
      { objects: reachability },
    ),
  ]
}

function rerunChecks(rerunEvidence = {}, expectedImages) {
  const listingSteps = (rerunEvidence.completed || []).filter((entry) => entry.step === 'listing_import')
  return [
    check(
      'duplicate_protection_rerun_complete',
      rerunEvidence.status === 'COMPLETE' && rerunEvidence.verification?.summary?.passed === true,
      'The idempotent apply/reconcile rerun completed and verified successfully.',
      'The idempotent apply/reconcile rerun did not complete cleanly.',
      { status: rerunEvidence.status || null, verification: rerunEvidence.verification?.summary || null },
    ),
    check(
      'duplicate_protection_no_creates',
      rerunEvidence.summary?.createListingCount === 0 && listingSteps.every((entry) => entry.action === 'update'),
      'The rerun created no listings; all existing identities were updated in place.',
      'The rerun attempted to create at least one listing.',
      { createListingCount: rerunEvidence.summary?.createListingCount, actions: listingSteps.map((entry) => ({ listingNumber: entry.listingNumber, action: entry.action })) },
    ),
    check(
      'duplicate_protection_media_reuse',
      rerunEvidence.imageManifest?.summary?.uploadedImageCount === 0 &&
        rerunEvidence.imageManifest?.summary?.reusedImageCount === expectedImages &&
        rerunEvidence.imageManifest?.summary?.completedImageCount === expectedImages,
      `All ${expectedImages} images were reused without another upload.`,
      'The rerun uploaded new images or did not reuse the full canonical set.',
      { imageSummary: rerunEvidence.imageManifest?.summary || null },
    ),
    check(
      'duplicate_protection_no_stale_media',
      rerunEvidence.summary?.staleMediaRowCount === 0 && listingSteps.every((entry) => entry.staleMediaRemoved === 0),
      'The rerun found no duplicate or stale image rows.',
      'The rerun still found or removed duplicate/stale image rows.',
      { staleMediaRowCount: rerunEvidence.summary?.staleMediaRowCount, removed: listingSteps.map((entry) => ({ listingNumber: entry.listingNumber, count: entry.staleMediaRemoved })) },
    ),
  ]
}

export async function fetchArch9MigrationVerificationState({ supabase, mappingPlan } = {}) {
  if (!supabase?.from) throw new Error('A Supabase client is required.')
  const context = mappingPlan?.context || {}
  const listingPlans = mappingPlan?.listingPlans || []
  const numbers = listingPlans.map((plan) => integer(plan.listingNumber))
  const references = unique(listingPlans.map((plan) => text(plan.sourceReference || plan.privateListing?.listingReference)))
  const agentIds = (mappingPlan?.agentPlans || []).map((plan) => integer(plan.property24AgentId))
  const [organisation, bySource, byProperty24, syncs, agentMappings, bucket] = await Promise.all([
    supabase.from('organisations').select('id,name,display_name').eq('id', context.organisationId).maybeSingle(),
    supabase.from('private_listings').select('*').eq('organisation_id', context.organisationId).in('listing_reference', references),
    supabase.from('private_listings').select('*').eq('organisation_id', context.organisationId).in('property24_reference', numbers.map(String)),
    supabase.from('property24_listing_syncs').select('*').eq('environment', key(context.environment)).eq('agency_id', context.agencyId).in('listing_number', numbers),
    supabase.from('property24_agent_mappings').select('*').eq('organisation_id', context.organisationId).eq('environment', key(context.environment)).eq('agency_id', context.agencyId).in('property24_agent_id', agentIds),
    supabase.storage.getBucket('listing-media'),
  ])
  const syncRows = requireData(syncs, 'Property24 sync verification lookup failed') || []
  const syncIds = unique(syncRows.map((row) => text(row.private_listing_id)))
  const bySync = syncIds.length
    ? requireData(await supabase.from('private_listings').select('*').in('id', syncIds), 'Synced listing verification lookup failed') || []
    : []
  const listings = [...new Map([
    ...(requireData(bySource, 'Listing reference verification lookup failed') || []),
    ...(requireData(byProperty24, 'Property24 reference verification lookup failed') || []),
    ...bySync,
  ].map((row) => [row.id, row])).values()]
  const listingIds = unique(listings.map((row) => text(row.id)))
  const [publications, media] = await Promise.all([
    listingIds.length ? supabase.from('listing_publication_data').select('*').in('listing_id', listingIds) : Promise.resolve({ data: [], error: null }),
    listingIds.length ? supabase.from('listing_media').select('*').in('listing_id', listingIds).order('sort_order', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ])
  if (bucket.error || !bucket.data) throw new Error('Storage bucket listing-media is unavailable.')
  return {
    organisation: requireData(organisation, 'Organisation verification lookup failed'),
    listings,
    publications: requireData(publications, 'Publication verification lookup failed') || [],
    syncs: syncRows,
    agents: requireData(agentMappings, 'Agent mapping verification lookup failed') || [],
    media: requireData(media, 'Media verification lookup failed') || [],
    bucket: bucket.data,
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  async function consume() {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume))
  return results
}

export async function verifyProperty24MigrationMedia({ imageManifest, fetchImpl = globalThis.fetch, concurrency = 4 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  const items = (imageManifest?.listings || []).flatMap((listing) => successfulManifestMedia(imageManifest, listing.listingNumber).map((item) => ({
    listingNumber: integer(listing.listingNumber),
    sortOrder: item.sortOrder,
    publicUrl: item.publicUrl,
    expectedSha256: item.sha256,
  })))
  return mapConcurrent(items, Math.max(1, Math.min(8, integer(concurrency) || 4)), async (item) => {
    try {
      const response = await fetchImpl(item.publicUrl, { method: 'GET', headers: { Accept: 'image/*' } })
      if (!response.ok) return { ...item, ok: false, httpStatus: response.status, sha256Matches: false }
      const bytes = Buffer.from(await response.arrayBuffer())
      const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      return {
        ...item,
        ok: true,
        httpStatus: response.status,
        byteLength: bytes.length,
        actualSha256,
        sha256Matches: actualSha256 === item.expectedSha256,
      }
    } catch (error) {
      return { ...item, ok: false, httpStatus: null, sha256Matches: false, error: error.message }
    }
  })
}

export function evaluateProperty24MigrationVerification({
  mappingPlan = {},
  imageManifest = {},
  rerunEvidence = {},
  liveSnapshot = {},
  arch9State = {},
  storageResults = [],
  generatedAt = new Date().toISOString(),
  inputHashes = {},
} = {}) {
  const checks = []
  const expectedImages = integer(mappingPlan.summary?.imageRelationshipCount) || 0
  checks.push(check(
    'organisation_identity',
    text(arch9State.organisation?.id) === text(mappingPlan.context?.organisationId),
    `Verified Arch9 organisation ${arch9State.organisation?.display_name || arch9State.organisation?.name || mappingPlan.context?.organisationId}.`,
    'The Arch9 organisation does not match the mapping plan.',
    { expected: mappingPlan.context?.organisationId || null, actual: arch9State.organisation?.id || null },
  ))
  checks.push(check(
    'storage_bucket',
    arch9State.bucket?.id === 'listing-media' && arch9State.bucket?.public === true,
    'The listing-media bucket exists and is public.',
    'The listing-media bucket is missing or not public.',
    { bucket: arch9State.bucket || null },
  ))
  checks.push(...rerunChecks(rerunEvidence, expectedImages))

  const liveAgents = new Map((liveSnapshot.agents || []).map((row) => [integer(row.agentId), row]))
  for (const plan of mappingPlan.agentPlans || []) {
    const id = integer(plan.property24AgentId)
    const live = liveAgents.get(id)
    const rows = (arch9State.agents || []).filter((row) => integer(row.property24_agent_id) === id)
    const expectedStatus = key(live?.status) === 'active' ? 'active' : 'inactive'
    checks.push(check(
      `agent_${id}_unique`,
      rows.length === 1,
      `Agent ${id} has exactly one Arch9 mapping row.`,
      `Agent ${id} has ${rows.length} Arch9 mapping rows.`,
      { mappingRowIds: rows.map((row) => row.id) },
    ))
    checks.push(check(
      `agent_${id}_status`,
      rows.length === 1 && rows[0].status === expectedStatus && text(rows[0].source_reference) === text(plan.sourceReference),
      `Agent ${id} matches live Property24 status ${live?.status}.`,
      `Agent ${id} mapping differs from its live Property24 identity or status.`,
      {
        expected: { sourceReference: plan.sourceReference, status: expectedStatus },
        actual: rows[0] ? { sourceReference: rows[0].source_reference, status: rows[0].status } : null,
      },
    ))
  }

  const liveListings = new Map((liveSnapshot.listings || []).map((row) => [integer(row.listingNumber), row]))
  for (const plan of mappingPlan.listingPlans || []) {
    const number = integer(plan.listingNumber)
    const candidates = listingIdentityCandidates(plan, arch9State)
    const listingId = candidates[0] || ''
    const listing = arch9State.listings.find((row) => text(row.id) === listingId) || null
    const publications = arch9State.publications.filter((row) => text(row.listing_id) === listingId)
    const syncRows = arch9State.syncs.filter((row) => integer(row.listing_number) === number)
    const live = liveListings.get(number)
    checks.push(check(
      `listing_${number}_unique`,
      candidates.length === 1,
      `Listing ${number} resolves to exactly one Arch9 listing.`,
      `Listing ${number} resolves to ${candidates.length} Arch9 listings.`,
      { listingIds: candidates },
    ))
    checks.push(check(
      `listing_${number}_sync_unique`,
      syncRows.length === 1,
      `Listing ${number} has exactly one Property24 sync row.`,
      `Listing ${number} has ${syncRows.length} Property24 sync rows.`,
      { syncRowIds: syncRows.map((row) => row.id) },
    ))
    checks.push(check(
      `listing_${number}_publication_unique`,
      publications.length === 1,
      `Listing ${number} has exactly one publication row.`,
      `Listing ${number} has ${publications.length} publication rows.`,
      { publicationRowIds: publications.map((row) => row.id) },
    ))
    const expectedListingId = text(rerunEvidence.listingIds?.[String(number)])
    checks.push(check(
      `listing_${number}_rerun_identity`,
      Boolean(listingId) && listingId === expectedListingId,
      `Listing ${number} retained Arch9 ID ${listingId} during the rerun.`,
      `Listing ${number} does not match the rerun evidence identity.`,
      { expectedListingId: expectedListingId || null, actualListingId: listingId || null },
    ))
    if (live) checks.push(...statusChecks(plan, live, listing, publications[0], syncRows[0]))
    else checks.push(fail(`listing_${number}_live_snapshot`, 'No live Property24 status was available.', {}))
    checks.push(...mediaChecks(plan, listingId, arch9State, imageManifest, storageResults))
  }

  const failures = checks.filter((entry) => entry.status === 'FAIL')
  const listingSummary = (mappingPlan.listingPlans || []).map((plan) => {
    const number = integer(plan.listingNumber)
    const ids = listingIdentityCandidates(plan, arch9State)
    const listing = arch9State.listings.find((row) => text(row.id) === ids[0])
    const live = liveListings.get(number)
    const mediaCount = arch9State.media.filter((row) => text(row.listing_id) === ids[0] && key(row.media_type) === 'image').length
    return {
      listingNumber: number,
      listingId: ids[0] || null,
      listingType: sourceListingType(plan),
      property24Status: live?.status || null,
      isOnPortal: live?.isOnPortal ?? null,
      arch9ListingStatus: listing?.listing_status || null,
      arch9Property24Status: listing?.property24_status || null,
      mediaCount,
    }
  })
  const agentSummary = (mappingPlan.agentPlans || []).map((plan) => {
    const id = integer(plan.property24AgentId)
    const live = liveAgents.get(id)
    const row = arch9State.agents.find((entry) => integer(entry.property24_agent_id) === id)
    return {
      property24AgentId: id,
      sourceReference: plan.sourceReference,
      property24Status: live?.status || null,
      arch9MappingStatus: row?.status || null,
      arch9UserId: row?.arch9_user_id || null,
    }
  })
  return {
    version: PROPERTY24_MIGRATION_VERIFICATION_VERSION,
    phase: 'property24-migration-import-phase5-final-verification',
    status: failures.length ? 'FAILED' : 'VERIFIED',
    generatedAt,
    context: mappingPlan.context || {},
    inputs: inputHashes,
    safety: {
      property24WritesPerformed: false,
      databaseWritesPerformed: false,
      storageWritesPerformed: false,
      verificationReadOnly: true,
    },
    summary: {
      checkCount: checks.length,
      passedCheckCount: checks.length - failures.length,
      failedCheckCount: failures.length,
      agentCount: agentSummary.length,
      listingCount: listingSummary.length,
      expectedImageCount: expectedImages,
      verifiedImageCount: storageResults.filter((result) => result.ok && result.sha256Matches).length,
      duplicateAgentMappingCount: agentSummary.filter((agent) => arch9State.agents.filter((row) => integer(row.property24_agent_id) === agent.property24AgentId).length !== 1).length,
      duplicateListingIdentityCount: (mappingPlan.listingPlans || []).filter((plan) => listingIdentityCandidates(plan, arch9State).length !== 1).length,
      duplicateSyncCount: listingSummary.filter((listing) => arch9State.syncs.filter((row) => integer(row.listing_number) === listing.listingNumber).length !== 1).length,
      duplicateImageRowCount: (mappingPlan.listingPlans || []).reduce((count, plan) => {
        const ids = listingIdentityCandidates(plan, arch9State)
        const rows = arch9State.media.filter((row) => text(row.listing_id) === ids[0] && key(row.media_type) === 'image')
        return count + Math.max(0, rows.length - new Set(rows.map((row) => text(row.storage_path))).size)
      }, 0),
      unexpectedImageCount: (mappingPlan.listingPlans || []).reduce((count, plan) => {
        const ids = listingIdentityCandidates(plan, arch9State)
        const expectedPaths = new Set(successfulManifestMedia(imageManifest, plan.listingNumber).map((item) => text(item.storagePath)))
        return count + arch9State.media.filter((row) => text(row.listing_id) === ids[0] && key(row.media_type) === 'image' && !expectedPaths.has(text(row.storage_path))).length
      }, 0),
    },
    duplicateProtection: {
      rerunStatus: rerunEvidence.status || null,
      createListingCount: rerunEvidence.summary?.createListingCount ?? null,
      staleMediaRowCount: rerunEvidence.summary?.staleMediaRowCount ?? null,
      uploadedImageCount: rerunEvidence.imageManifest?.summary?.uploadedImageCount ?? null,
      reusedImageCount: rerunEvidence.imageManifest?.summary?.reusedImageCount ?? null,
    },
    agents: agentSummary,
    listings: listingSummary,
    checks,
    failures,
    storageResults,
  }
}

export async function verifyProperty24Migration({
  supabase,
  property24,
  mappingPlan,
  imageManifest,
  rerunEvidence,
  fromDate = '',
  fetchImpl = globalThis.fetch,
  concurrency = 4,
  generatedAt = new Date().toISOString(),
  inputHashes = {},
} = {}) {
  const [liveSnapshot, arch9State, storageResults] = await Promise.all([
    fetchProperty24MigrationLiveSnapshot({ property24, mappingPlan, fromDate }),
    fetchArch9MigrationVerificationState({ supabase, mappingPlan }),
    verifyProperty24MigrationMedia({ imageManifest, fetchImpl, concurrency }),
  ])
  return evaluateProperty24MigrationVerification({
    mappingPlan,
    imageManifest,
    rerunEvidence,
    liveSnapshot,
    arch9State,
    storageResults,
    generatedAt,
    inputHashes,
  })
}
