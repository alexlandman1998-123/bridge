import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'src/pages/AgentListings.jsx')
const storagePath = path.join(root, 'src/lib/agentListingStorage.js')
const servicePath = path.join(root, 'src/services/privateListingService.js')
const packagePath = path.join(root, 'package.json')

const source = fs.readFileSync(sourcePath, 'utf8')
const storageSource = fs.readFileSync(storagePath, 'utf8')
const serviceSource = fs.readFileSync(servicePath, 'utf8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  pkg.scripts?.['test:agent-listings-delete-ui'] === 'node scripts/agent-listings-delete-ui.test.mjs',
  'package.json must expose test:agent-listings-delete-ui',
)

assert(
  source.includes('rememberDeletedListingIds'),
  'AgentListings should import/use rememberDeletedListingIds so deleted listings stay hidden after reload.',
)

assert(
  source.includes('const listingIdentityKeys = Array.from(new Set(['),
  'handleDeleteListing should build a normalized identity set for the listing.',
)

assert(
  source.includes('...getListingIdentityKeys(card?.listingRecord || {})'),
  'handleDeleteListing should include canonical listing record identity keys.',
)

assert(
  source.includes('const remoteListingId = getRemotePrivateListingId(card?.listingRecord || card) || listingIdentityKeys.find((value) => isUuidLike(value)) ||'),
  'handleDeleteListing should prefer the typed private listing id and fall back to a UUID identity for remote Supabase deletion.',
)

assert(
  source.includes('rememberDeletedListingIds(deletedIds)'),
  'handleDeleteListing should persist delete tombstones before reload.',
)

assert(
  source.includes('const deletedListingIdsRef = useRef(readDeletedListingIds())') &&
    source.includes('const getCurrentDeletedListingIds = useCallback') &&
    source.includes('getCurrentDeletedListingIds(locallyDeletedIds)'),
  'late listing hydration responses must resolve the current delete tombstones before publishing cards.',
)

assert(
  source.includes('...getListingIdentityKeys(remoteDelete?.listing || {})') &&
    source.includes('const currentDeletedIds = syncDeletedListingIds(deletedIds)'),
  'the delete path must tombstone canonical server identities before a reload can rehydrate stale data.',
)

assert(
  source.includes("addListingIdentityKey(keys, 'address', getListingAddressFingerprint(row))") &&
    source.includes("addListingIdentityKey(keys, 'ref', row.listingReference || row.listing_reference || row.listingCode || row.listing_code)") &&
    source.includes("addListingIdentityKey(keys, 'place', row.googlePlaceId || row.google_place_id || row.placeId || row.place_id)"),
  'listing cards should tombstone imported/address-only listings by stable non-UUID identities.',
)

assert(
  storageSource.includes("addListingDeleteIdentity(ids, 'address', getListingAddressFingerprint(record))") &&
    storageSource.includes("addListingDeleteIdentity(ids, 'ref', record.listingReference || record.listing_reference || record.listingCode || record.listing_code)") &&
    storageSource.includes("addListingDeleteIdentity(ids, 'place', record.googlePlaceId || record.google_place_id || record.placeId || record.place_id)"),
  'local listing storage should use the same non-UUID tombstone identities.',
)

assert(
  serviceSource.includes('isMissingTableError(error, tableName) || isMissingColumnError(error, columnName)') &&
    !serviceSource.includes('isMissingTableError(error, tableName) || isMissingColumnError(error, columnName) || isPermissionDeniedError(error)'),
  'private listing cleanup must not hide a row-level-security failure as a recoverable schema issue.',
)

const deletePrivateListingSource = serviceSource.match(
  /export async function deletePrivateListing\([\s\S]*?\n}\n\nexport async function updatePrivateListingOnboardingFormData/,
)?.[0] || ''

assert(
  !deletePrivateListingSource.includes('archivePrivateListingDeleteFallback') &&
    !deletePrivateListingSource.includes('deletePrivateListingRelatedRows'),
  'permanent deletion must issue the canonical parent-row delete directly and must never silently substitute an archive.',
)

assert(
  deletePrivateListingSource.includes("throw new Error('You do not have permission to permanently delete this listing. Ask its assigned agent or an organisation administrator.')"),
  'a denied deletion must explain the RLS rule instead of reporting a false success.',
)

assert(
  deletePrivateListingSource.includes("constraintText.includes('website_production_dark_launches')") &&
    deletePrivateListingSource.includes("Retire that launch before permanently deleting the listing."),
  'a published website launch must explain its deletion guard instead of being silently archived.',
)

assert(
  source.includes('identityKeys,') && source.includes('id: identityKeys[0] || String(listing.id ||'),
  'listing cards should carry identityKeys and use a stable fallback id.',
)

assert(
  source.includes('className="group flex h-full cursor-pointer flex-col') &&
    source.includes('h-[132px]') &&
    source.includes('ListingAgentAvatar') &&
    source.includes('propertyFacts'),
  'listing cards should use the compact property-focused card treatment.',
)

console.log('agent-listings-delete-ui tests passed')
