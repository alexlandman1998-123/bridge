import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')

function read(path) {
  return readFileSync(path, 'utf8')
}

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905175935_public_websites_phase3_listing_channel.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase3_listing_channel_rls_test.sql'))
const service = read(resolve(appRoot, 'src/services/websiteListingPublicationService.js'))
const panel = read(resolve(appRoot, 'src/components/listings/WebsiteListingPublicationPanel.jsx'))
const listingDetail = read(resolve(appRoot, 'src/pages/AgentListingDetail.jsx'))
const publicRepository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))

for (const [pattern, message] of [
  [/create table if not exists public\.website_listing_publications/i, 'creates an explicit website-channel table'],
  [/unique \(listing_id\)/i, 'prevents duplicate channel rows for one listing'],
  [/publication_json jsonb not null/i, 'stores an allow-listed public listing snapshot'],
  [/media_json jsonb not null/i, 'stores an ordered public media snapshot'],
  [/alter table public\.website_listing_publications enable row level security/i, 'enables RLS on the exposed-schema table'],
  [/revoke all on table public\.website_listing_publications from anon, authenticated/i, 'blocks direct browser mutations'],
  [/grant select on table public\.website_listing_publications to service_role/i, 'allows server-only public rendering'],
  [/create or replace function public\.website_get_listing_publication_status/i, 'creates the readiness/status command'],
  [/create or replace function public\.website_set_listing_publication/i, 'creates the publication mutation command'],
  [/v_user_id uuid := auth\.uid\(\)/i, 'requires authentication'],
  [/public\.bridge_is_active_member\(v_listing\.organisation_id\)/i, 'enforces listing-organisation membership'],
  [/v_action not in \('publish', 'update', 'unpublish'\)/i, 'allow-lists channel actions'],
  [/v_projection\.status <> 'Published'/i, 'requires the canonical projection to be Published'],
  [/title, property type, listing type, price and suburb/i, 'validates the minimum public listing fields'],
  [/media\.media_type = 'image'[\s\S]*media\.file_url ~\* '\^https:\/\//i, 'requires at least one public HTTPS image'],
  [/jsonb_build_object\([\s\S]*'listing_id'[\s\S]*'title'[\s\S]*'features'[\s\S]*'amenities'/i, 'copies only approved listing fields into the snapshot'],
  [/media\.media_type in \('image', 'floor_plan', 'video', 'virtual_tour'\)/i, 'copies only supported media types'],
  [/on conflict \(listing_id\) do update/i, 'updates rather than duplicates a published listing'],
  [/set status = 'unpublished'/i, 'supports explicit unpublish without deleting the CRM listing'],
  [/revoke all on function public\.website_set_listing_publication\(uuid, text\) from public, anon/i, 'keeps the privileged mutation private'],
]) {
  assert.match(migration, pattern, message)
}

assert.match(databaseTest, /relrowsecurity/, 'database test checks RLS')
assert.match(databaseTest, /not has_table_privilege\('anon'/, 'database test checks anonymous denial')
assert.match(databaseTest, /has_function_privilege\('authenticated'/, 'database test checks guarded RPC access')

assert.match(service, /website_get_listing_publication_status/, 'client loads readiness from the guarded RPC')
assert.match(service, /website_set_listing_publication/, 'client mutates through the guarded RPC')
for (const label of ['Publish to website', 'Update website', 'Unpublish', 'Refresh status']) {
  assert.match(panel, new RegExp(label, 'i'), `renders the ${label} control`)
}
assert.match(panel, /The CRM remains the source of truth/i, 'explains the source-of-truth boundary')
assert.match(listingDetail, /<WebsiteListingPublicationPanel/, 'mounts the channel controls in listing detail')
assert.match(listingDetail, /prepareAgencyWebsiteListing/, 'saves current CRM details before a channel publish/update')

assert.match(publicRepository, /from\('website_listing_publications'\)/, 'public rendering requires an explicit website-channel row')
assert.match(publicRepository, /\.eq\('status', 'published'\)/, 'public rendering excludes unpublished channel rows')
assert.match(publicRepository, /from\('listing_publication_data'\)[\s\S]*\.eq\('status', 'Published'\)/, 'public rendering rechecks canonical projection eligibility')
assert.match(publicRepository, /private_listings\.organisation_id/, 'public rendering enforces organisation ownership')
assert.match(publicRepository, /publication_json/, 'public rendering uses the explicitly synchronized snapshot')
assert.match(publicRepository, /media_json/, 'public rendering uses the explicitly synchronized media snapshot')

console.log('Public websites phase 3 listing channel checks passed')
