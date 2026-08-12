import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'src/pages/AgentListings.jsx')
const storagePath = path.join(root, 'src/lib/agentListingStorage.js')
const packagePath = path.join(root, 'package.json')

const source = fs.readFileSync(sourcePath, 'utf8')
const storageSource = fs.readFileSync(storagePath, 'utf8')
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
  source.includes('const remoteListingId = listingIdentityKeys.find((value) => isUuidLike(value)) ||'),
  'handleDeleteListing should choose a UUID identity for remote Supabase deletion.',
)

assert(
  source.includes('rememberDeletedListingIds(deletedIds)'),
  'handleDeleteListing should persist delete tombstones before reload.',
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
