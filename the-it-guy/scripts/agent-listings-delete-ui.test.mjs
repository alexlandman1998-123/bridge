import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'src/pages/AgentListings.jsx')
const packagePath = path.join(root, 'package.json')

const source = fs.readFileSync(sourcePath, 'utf8')
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
  source.includes('identityKeys,') && source.includes('id: identityKeys[0] || String(listing.id ||'),
  'listing cards should carry identityKeys and use a stable fallback id.',
)

assert(
  source.includes('className="group flex h-full cursor-pointer flex-col') &&
    source.includes('h-[132px]') &&
    source.includes('No open listing blockers.'),
  'listing cards should use the compact, equal-height card treatment.',
)

console.log('agent-listings-delete-ui tests passed')
