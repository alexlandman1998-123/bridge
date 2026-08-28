import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  findPrivateListingById,
  getPrivateListingIdentityCandidates,
  getPrivateListingRecordId,
  getPrivateListingRemoteRecordId,
} from '../src/lib/privateListingRecordIntegrity.js'

const remoteListingId = '4f63a8e7-a565-4dc9-bce5-2395bc5fb71e'
const localListingId = 'listing_local_shell_1'
const listing = {
  id: localListingId,
  listingId: remoteListingId,
  privateListingId: remoteListingId,
  listingTitle: 'Recovered listing',
}

assert.equal(getPrivateListingRecordId(listing), localListingId)
assert.equal(getPrivateListingRemoteRecordId(listing), remoteListingId)
assert.deepEqual(
  getPrivateListingIdentityCandidates(listing),
  [localListingId, remoteListingId],
)
assert.equal(findPrivateListingById([listing], localListingId)?.listingTitle, 'Recovered listing')
assert.equal(findPrivateListingById([listing], remoteListingId)?.listingTitle, 'Recovered listing')

const detailSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(detailSource, /getPrivateListingRemoteRecordId/)
assert.match(detailSource, /const sellerPortalActivationListingId = useMemo/)
assert.match(detailSource, /activateSellerPortalForListing\(\{[\s\S]*listingId: sellerPortalActivationListingId/)
assert.doesNotMatch(
  detailSource,
  /Seller Portal activation requires a Supabase-backed listing\.[\s\S]{0,180}isUuidLike\(listingRecord\.id\)/,
  'portal activation must not reject a local shell when a Supabase listing id is available',
)

const listingsSource = await fs.readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
assert.match(listingsSource, /function getListingWorkspaceIdForCard/)
assert.match(
  listingsSource,
  /navigate\(`\/agent\/listings\/\$\{encodeURIComponent\(getListingWorkspaceIdForCard\(card\)\)\}`\)/,
  'listing cards should open the Supabase-backed workspace id when available',
)
assert.match(
  listingsSource,
  /const listingId = getListingWorkspaceIdForCard\(card\)/,
  'mandate workspace links should also use the Supabase-backed listing id when available',
)

console.log('seller portal Supabase-backed listing resolution tests passed')
