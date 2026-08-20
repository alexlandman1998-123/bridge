import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const sql = read('sql/20260820_property24_listing_syncs.sql')
assert.match(sql, /create table if not exists public\.property24_listing_syncs/)
assert.match(sql, /private_listing_id uuid not null references public\.private_listings\(id\) on delete cascade/)
assert.match(sql, /listing_number integer not null/)
assert.match(sql, /alter table public\.property24_listing_syncs enable row level security/)
assert.doesNotMatch(sql, /create policy/i)

const overrideMigration = fs.readFileSync(new URL('../../supabase/migrations/202608200001_property24_publish_without_mandate_override.sql', import.meta.url), 'utf8')
assert.match(overrideMigration, /property24_publish_without_mandate boolean not null default false/)
assert.match(overrideMigration, /property24_publish_without_mandate_reason text/)
assert.match(overrideMigration, /v_property24_override_allowed/)
assert.match(overrideMigration, /v_property24_published_requested and not v_property24_override_allowed/)
assert.match(overrideMigration, /is distinct from lower\(coalesce\(old\.property24_status/)
assert.match(overrideMigration, /bridge_private_listing_is_current_import_activation_phase0/)

const syncService = read('server/services/property24ListingSyncService.js')
assert.match(syncService, /recordProperty24ListingSync/)
assert.match(syncService, /property24_listing_syncs/)
assert.match(syncService, /property24_reference/)
assert.match(syncService, /property24_status/)
assert.match(syncService, /published/)
assert.match(syncService, /allowPublishWithoutMandate/)
assert.match(syncService, /property24_publish_without_mandate/)

const publishScript = read('scripts/property24-publish-listing.mjs')
assert.match(publishScript, /allowPublishWithoutMandate:\s*true/)

const publishService = read('server/property24/publishService.js')
assert.match(publishService, /recordProperty24ListingSync/)
assert.match(publishService, /databaseWritten = true/)

const recordScript = read('scripts/property24-record-listing-sync.mjs')
assert.match(recordScript, /property24-publish-listing\.json/)
assert.match(recordScript, /RECORDED/)
assert.match(recordScript, /allowPublishWithoutMandate:\s*true/)
assert.doesNotMatch(recordScript, /31382@arch9\.co\.za/i)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:record-listing-sync'], 'node scripts/property24-record-listing-sync.mjs')
assert.equal(packageJson.scripts['test:property24-listing-sync'], 'node scripts/property24-listing-sync.test.mjs')

console.log('Property24 listing sync contract passed')
