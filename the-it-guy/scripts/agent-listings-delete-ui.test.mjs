import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'src/pages/AgentListings.jsx')
const detailSourcePath = path.join(root, 'src/pages/AgentListingDetail.jsx')
const storagePath = path.join(root, 'src/lib/agentListingStorage.js')
const servicePath = path.join(root, 'src/services/privateListingService.js')
const packagePath = path.join(root, 'package.json')
const deletionMigrationPath = path.join(root, '..', 'supabase/migrations/20260908055855_agent_listing_deletion_rpc.sql')

const source = fs.readFileSync(sourcePath, 'utf8')
const detailSource = fs.readFileSync(detailSourcePath, 'utf8')
const storageSource = fs.readFileSync(storagePath, 'utf8')
const serviceSource = fs.readFileSync(servicePath, 'utf8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const deletionMigration = fs.readFileSync(deletionMigrationPath, 'utf8')

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
  deletePrivateListingSource.includes("client.rpc('delete_private_listing', { p_listing_id: canonical?.id || normalizedId })") &&
    !deletePrivateListingSource.includes(".from('private_listings')\n    .delete()"),
  'permanent deletion must use the atomic database RPC rather than issuing a client-side parent-row delete.',
)

assert(
  deletePrivateListingSource.includes("throw new Error('You do not have permission to permanently delete this listing. Ask its assigned agent or an organisation administrator.')") &&
    deletePrivateListingSource.includes("throw new Error(result.data?.message || 'This listing cannot be permanently deleted until its linked workflows are resolved.')"),
  'the client must explain permission denials and structured deletion blockers instead of reporting false success.',
)

assert(
  !deletePrivateListingSource.includes('archivePrivateListingDeleteFallback') &&
    !deletePrivateListingSource.includes('deletePrivateListingRelatedRows'),
  'the client must not substitute an archive or attempt partial relationship cleanup outside the atomic database workflow.',
)

assert(
  deletionMigration.includes('create or replace function public.delete_private_listing(p_listing_id uuid)') &&
    deletionMigration.includes('security definer') &&
    deletionMigration.includes('revoke all on function public.delete_private_listing(uuid) from public;') &&
    deletionMigration.includes('grant execute on function public.delete_private_listing(uuid) to authenticated;'),
  'the database delete RPC must be explicitly secured and callable only by authenticated users.',
)

assert(
  deletionMigration.includes("v_launch.status is distinct from 'rolled_back'") &&
    deletionMigration.includes('set listing_id = null') &&
    deletionMigration.includes('on delete set null') &&
    deletionMigration.includes("when foreign_key_violation then"),
  'an active website launch must block deletion, while a rolled-back launch keeps its audit record after unlinking.',
)

assert(
  source.includes('identityKeys,') && source.includes('id: identityKeys[0] || String(listing.id ||'),
  'listing cards should carry identityKeys and use a stable fallback id.',
)

assert(
  !source.includes('window.confirm(') &&
    source.includes('const [deleteListingCandidate, setDeleteListingCandidate] = useState(null)') &&
    source.includes('function requestDeleteListing(card, event)') &&
    source.includes('title="Delete listing?"'),
  'listing-card deletion should use the in-app confirmation dialog instead of the browser confirmation prompt.',
)

const detailDeleteHandler = detailSource.match(
  /async function confirmDeleteListing\(\)[\s\S]*?\n  }\n\n  const sellerProfileBuilderBranch/,
)?.[0] || ''

assert(
  detailSource.includes('const [deleteListingDialogOpen, setDeleteListingDialogOpen] = useState(false)') &&
    detailSource.includes('function requestDeleteListing()') &&
    detailSource.includes('open={deleteListingDialogOpen}') &&
    !detailDeleteHandler.includes('window.confirm('),
  'listing-detail deletion should use the same in-app confirmation dialog while leaving unrelated browser confirmations untouched.',
)

assert(
  source.includes('className="group flex h-full cursor-pointer flex-col') &&
    source.includes('h-[132px]') &&
    source.includes('ListingAgentAvatar') &&
    source.includes('propertyFacts'),
  'listing cards should use the compact property-focused card treatment.',
)

console.log('agent-listings-delete-ui tests passed')
