import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const repositorySource = await fs.readFile(new URL('../src/lib/canvassingRepository.js', import.meta.url), 'utf8')
const statusMigrationSource = await fs.readFile(new URL('../../supabase/migrations/202607250012_canvassing_durable_statuses.sql', import.meta.url), 'utf8')

assert.doesNotMatch(
  repositorySource,
  /metadata\?\.migratedFromLocalStorage\s*===\s*true/,
  'migrated local canvassing rows should remain visible as durable Supabase rows, not filtered as demo data',
)
assert.match(
  repositorySource,
  /function buildExistingProspectMigrationIndex\(existingProspectRows = \[\]\)/,
  'local-to-Supabase migration should index existing remote prospects before inserting fallback rows',
)
assert.match(
  repositorySource,
  /function buildExistingActivityMigrationIndex\(existingActivityRows = \[\]\)/,
  'local-to-Supabase migration should index existing remote activities before inserting fallback rows',
)
assert.match(
  repositorySource,
  /existingProspectIndex\.byLocalId\.get\(localId\)/,
  'fallback prospect migration should dedupe rows previously migrated by local id',
)
assert.match(
  repositorySource,
  /byLocalId\.set\(id, id\)/,
  'fallback prospect migration should recognize cached Supabase snapshot ids as already durable rows',
)
assert.match(
  repositorySource,
  /existingProspectIndex\.byIdentity\.get\(key\)/,
  'fallback prospect migration should dedupe rows that already exist remotely by contact or address identity',
)
assert.match(
  repositorySource,
  /existingActivityIndex\.byLocalId\.has\(localId\)/,
  'fallback activity migration should dedupe previously migrated activities by local id',
)
assert.match(
  repositorySource,
  /existingProspectIds\.has\(localProspectId\) \? localProspectId : ''/,
  'fallback activity migration should attach pending local activity to an already-durable Supabase prospect id',
)
assert.match(
  repositorySource,
  /existingActivityIndex\.byIdentity\.has\(identityKey\)/,
  'fallback activity migration should dedupe existing remote activities by activity fingerprint',
)
assert.match(
  repositorySource,
  /migrateFallbackStoreToSupabase\(client, orgId, fallbackStore, prospectsResult\.data \|\| \[\], activitiesResult\.data \|\| \[\]\)/,
  'workspace loading should merge local fallback data into existing Supabase canvassing data',
)
assert.match(
  repositorySource,
  /\(Array\.isArray\(fallbackStore\.activities\) && fallbackStore\.activities\.length\)/,
  'workspace loading should migrate pending local canvassing activity even when local prospects are already remote',
)
assert.match(
  repositorySource,
  /writeCanvassingFallbackStore\(organisationId, migratedStore\)/,
  'migration should refresh local fallback storage with the durable Supabase snapshot after a successful merge',
)
assert.match(
  repositorySource,
  /fallbackIsSyncedSnapshot = fallbackStore\.persistence === 'supabase' && fallbackStore\.pendingLocalChanges !== true/,
  'workspace loading should not re-migrate a cached Supabase snapshot on every canvassing load',
)
assert.match(
  repositorySource,
  /store\.persistence = 'local'[\s\S]*store\.pendingLocalChanges = true/,
  'local fallback mutations should be marked as pending local work until the next durable Supabase merge',
)
assert.match(
  repositorySource,
  /pendingLocalChanges: false,[\s\S]*syncedAt: new Date\(\)\.toISOString\(\)/,
  'successful Supabase loads should cache a synced snapshot instead of ambiguous fallback data',
)

for (const status of ['Qualified', 'Viewing Scheduled', 'Offer Potential', 'Not Ready']) {
  assert.match(statusMigrationSource, new RegExp(`'${status}'`), `status migration should allow buyer canvassing status "${status}"`)
}

console.log('canvassing durable persistence checks passed')
