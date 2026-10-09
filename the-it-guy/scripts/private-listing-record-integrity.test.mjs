import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  findPrivateListingById,
  getPrivateListingRecordId,
  normalizePrivateListingRecord,
  sanitizePrivateListingRows,
} from '../src/lib/privateListingRecordIntegrity.js'

const rows = sanitizePrivateListingRows([
  null,
  undefined,
  false,
  'not-a-listing',
  { id: 'listing-1', listingTitle: 'Valid listing' },
  { listing_id: 'listing-2', listingTitle: 'Legacy valid listing' },
])

assert.equal(rows.length, 2)
assert.equal(findPrivateListingById(rows, 'listing-1')?.listingTitle, 'Valid listing')
assert.equal(findPrivateListingById(rows, 'listing-2')?.listingTitle, 'Legacy valid listing')
assert.equal(findPrivateListingById([null], 'listing-1'), null)
assert.equal(findPrivateListingById(rows, ''), null)
assert.equal(getPrivateListingRecordId({ listingId: 'listing-3' }), 'listing-3')
assert.equal(normalizePrivateListingRecord({ listing_id: 'listing-4' })?.id, 'listing-4')

// Exercise the single-record reader with the options actually sent by the
// detail page. The catalog's Previous Listings tab includes these records.
const service = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const detail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const visibilityFunctions = service.slice(service.indexOf('function isDeletedPrivateListingRow('), service.indexOf('function applyVisiblePrivateListingFilters('))
const readerFunction = service.slice(service.indexOf('async function getPrivateListingById('), service.indexOf('\nasync function fetchMandatePacketRowsForListings('))
let storedRow = null
const client = { from: (table) => {
  assert.equal(table, 'private_listings')
  return { select: () => ({ eq: (key, id) => {
    assert.equal(key, 'id')
    assert.equal(id, '11111111-1111-4111-8111-111111111111')
    return { maybeSingle: async () => ({ data: storedRow, error: null }) }
  } }) }
} }
const scope = {
  requireClient: () => client, normalizeUuid: value => value,
  normalizeKey: value => String(value || '').trim().toLowerCase(),
  DELETED_LISTING_STATUSES: new Set(['withdrawn', 'deleted', 'archived']),
  DELETED_LISTING_VISIBILITIES: new Set(['archived', 'deleted']),
  isMissingTableError: () => false,
  ...Object.fromEntries(['fetchOnboardingRowsForListings', 'fetchRequirementRowsForListings', 'fetchDocumentRowsForListings', 'fetchExternalLinkRowsForListings', 'fetchPublicationRowsForListings', 'fetchMandatePacketRowsForListings', 'fetchMediaRowsForListings', 'fetchAssignedAgentProfilesForListings'].map(name => [name, async () => new Map()])),
  mapPrivateListingRow: row => row,
  attachDistributionMediaToListing: row => row,
}
const readListing = Function(...Object.keys(scope), `${visibilityFunctions}\n${readerFunction}\nreturn getPrivateListingById`)(...Object.values(scope))
const detailCall = detail.slice(detail.indexOf('const loadListingData = useCallback(')).match(/getPrivateListing\(listingId(?:,\s*(\{[^}]*\}))?\)/)
assert.ok(detailCall, 'The listing detail page must load its requested record.')
const detailOptions = detailCall[1] ? Function(`return ${detailCall[1]}`)() : {}
const listingId = '11111111-1111-4111-8111-111111111111'
for (const status of ['archived', 'withdrawn', 'active']) {
  storedRow = { id: listingId, listing_status: status, listingTitle: `Fixture ${status}` }
  assert.equal((await readListing(listingId, detailOptions))?.id, listingId, `The detail page must open ${status} listings.`)
  if (status !== 'active') assert.equal(await readListing(listingId), null, 'Ordinary listing reads must still exclude previous stock.')
}
for (const deleted of [{ listing_status: 'deleted' }, { listing_status: 'archived', deleted_at: '2026-10-09T00:00:00Z' }, { listing_status: 'archived', is_deleted: true }]) {
  storedRow = { id: listingId, ...deleted }
  assert.equal(await readListing(listingId, detailOptions), null, 'Opening Previous Listings must not restore deleted records.')
}
storedRow = null
assert.equal(await readListing(listingId, detailOptions), null, 'A genuinely absent or inaccessible listing remains unavailable.')

console.log('Private listing record integrity checks passed.')
