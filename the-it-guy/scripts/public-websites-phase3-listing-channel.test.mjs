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
const durableMediaMigration = read(resolve(repositoryRoot, 'supabase/migrations/20260906074654_public_websites_durable_listing_media.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase3_listing_channel_rls_test.sql'))
const durableMediaDatabaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_durable_listing_media_test.sql'))
const durableMediaFunction = read(resolve(repositoryRoot, 'supabase/functions/website-listing-publication/index.ts'))
const durableMediaHelpers = read(resolve(repositoryRoot, 'supabase/functions/_shared/websiteListingMedia.ts'))
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

for (const [pattern, message] of [
  [/create table if not exists public\.website_listing_media_assets/i, 'creates the durable website media ledger'],
  [/source_media_id uuid references public\.listing_media\(id\) on delete set null/i, 'preserves cleanup evidence when source media is removed'],
  [/storage_bucket text not null default 'listing-media'/i, 'uses the existing public listing media bucket'],
  [/source_fingerprint text not null/i, 'records a content fingerprint'],
  [/byte_size bigint not null/i, 'records and bounds copied bytes'],
  [/alter table public\.website_listing_media_assets enable row level security/i, 'enables RLS on the asset ledger'],
  [/revoke all on table public\.website_listing_media_assets from public, anon, authenticated/i, 'blocks direct browser ledger writes'],
  [/website_register_listing_media_assets/i, 'registers a service-only atomic media set'],
  [/website_commit_listing_publication/i, 'commits publication through a service-only command'],
  [/drop function if exists public\.website_set_listing_publication/i, 'removes the legacy browser-callable mutation'],
  [/Prepare durable website media before publishing or updating this listing/i, 'fails closed when durable copies are missing'],
  [/asset\.public_url/i, 'snapshots durable public URLs instead of source signed URLs'],
  [/set status = 'retired'/i, 'retires assets when a listing is unpublished'],
]) {
  assert.match(durableMediaMigration, pattern, message)
}

assert.match(durableMediaDatabaseTest, /not has_table_privilege\('authenticated'/, 'durable media pgTAP checks browser denial')
assert.match(durableMediaDatabaseTest, /confdeltype = 'n'/, 'durable media pgTAP checks cleanup-safe source deletion')
assert.match(durableMediaHelpers, /source\.origin !== project\.origin/, 'rejects cross-project and external storage URLs')
assert.match(durableMediaHelpers, /SHA-256/, 'uses content-addressed immutable object paths')
assert.match(durableMediaFunction, /admin\.storage\.from\(source\.bucket\)\.download/, 'downloads source media server-side')
assert.match(durableMediaFunction, /upsert: false/, 'does not overwrite immutable CDN objects')
assert.match(durableMediaFunction, /website_register_listing_media_assets/, 'atomically registers the copied media set')
assert.match(durableMediaFunction, /website_commit_listing_publication/, 'commits only through the server-side publisher')
assert.match(durableMediaFunction, /cleanupRetiredAssets/, 'removes retired public copies')
assert.match(durableMediaFunction, /removeNewUploads/, 'removes partial uploads when preparation fails')
assert.match(durableMediaFunction, /admin\.auth\.getUser\(token\)/, 'verifies the authenticated actor server-side')

assert.match(service, /website_get_listing_publication_status/, 'client loads readiness from the guarded RPC')
assert.match(service, /functions\.invoke\('website-listing-publication'/, 'client routes mutations through the durable media publisher')
for (const label of ['Publish', 'Update website', 'Unpublish', 'Refresh status', 'View listing']) {
  assert.match(panel, new RegExp(label, 'i'), `renders the ${label} control`)
}
assert.match(panel, /MoreVertical/, 'groups secondary website actions in the channel menu')
assert.match(panel, /Agency Website/, 'renders the website as a first-class listing channel')
assert.match(panel, /mediaCleanupPending/i, 'surfaces incomplete public media cleanup')
assert.match(listingDetail, /<WebsiteListingPublicationPanel/, 'mounts the channel controls in listing detail')
assert.match(listingDetail, /prepareAgencyWebsiteListing/, 'saves current CRM details before a channel publish/update')

assert.match(publicRepository, /from\('website_listing_publications'\)/, 'public rendering requires an explicit website-channel row')
assert.match(publicRepository, /\.eq\('status', 'published'\)/, 'public rendering excludes unpublished channel rows')
assert.match(publicRepository, /from\('listing_publication_data'\)[\s\S]*\.eq\('status', 'Published'\)/, 'public rendering rechecks canonical projection eligibility')
assert.match(publicRepository, /private_listings\.organisation_id/, 'public rendering enforces organisation ownership')
assert.match(publicRepository, /publication_json/, 'public rendering uses the explicitly synchronized snapshot')
assert.match(publicRepository, /media_json/, 'public rendering uses the explicitly synchronized media snapshot')

console.log('Public websites phase 3 listing channel checks passed')
