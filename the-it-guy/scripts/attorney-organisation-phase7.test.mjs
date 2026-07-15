import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150005_attorney_organisation_canonical_write_phase7.sql', import.meta.url),
  'utf8',
)
const service = readFileSync(new URL('../src/services/attorneyFirms.js', import.meta.url), 'utf8')
const readiness = readFileSync(
  new URL('./attorney-organisation-runtime-readiness.mjs', import.meta.url),
  'utf8',
)

assert.match(migration, /create or replace function public\.bridge_update_attorney_organisation_identity_v3/)
assert.match(migration, /security definer/)
assert.match(migration, /auth\.uid\(\)/)
assert.match(migration, /member\.role in \('firm_admin', 'director_partner'\)/)
assert.match(migration, /pg_advisory_xact_lock/)
assert.match(migration, /identity_patch \? 'website'/)
assert.match(migration, /identity_patch \? 'logo_bucket'/)
assert.match(migration, /attorneyCanonicalWriteVersion/)
assert.match(migration, /grant execute on function public\.bridge_update_attorney_organisation_identity_v3\(uuid, jsonb\) to authenticated/)
assert.doesNotMatch(migration, /execute\s+format\s*\(/i)

assert.match(service, /updateCanonicalAttorneyOrganisationWithRpc/)
assert.match(service, /bridge_update_attorney_organisation_identity_v3/)
assert.match(service, /if \(canonicalRpc\.available\)/)
assert.match(service, /\.update\(\{ is_active: firmPayload\.is_active \}\)/)
assert.match(service, /!canonicalRpc\.available && hasAttorneyBrandingPayload\(payload\)/)
assert.match(service, /Mixed-version fallback retained until the Phase 7 RPC is deployed/)

assert.match(readiness, /bridge_update_attorney_organisation_identity_v3/)
assert.match(readiness, /Required Phase 2–7 contracts/)

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /"test:attorney-organisation-phase7"/)

console.log('attorney organisation Phase 7 canonical write retirement contracts passed')

