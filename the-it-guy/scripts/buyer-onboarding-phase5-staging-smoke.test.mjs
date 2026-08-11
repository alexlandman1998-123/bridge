import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const smokeSource = await readFile(
  new URL('./buyer-onboarding-projection-recovery-staging-smoke.mjs', import.meta.url),
  'utf8',
)
const migrationSource = await readFile(
  new URL('../../supabase/migrations/202607310008_buyer_onboarding_projection_recovery_events.sql', import.meta.url),
  'utf8',
)

const markerEventTypes = [
  'buyer_onboarding_required_documents_projection_failed',
  'buyer_onboarding_platform_fee_consent_projection_failed',
  'buyer_onboarding_information_sheet_projection_failed',
  'buyer_onboarding_roleplayer_projection_failed',
  'buyer_onboarding_workflow_evidence_projection_failed',
  'buyer_onboarding_awaiting_signed_otp_projection_failed',
  'buyer_onboarding_finance_event_projection_failed',
]

assert.equal(
  packageJson.scripts?.['test:buyer-onboarding-phase5-staging-smoke'],
  'node scripts/buyer-onboarding-phase5-staging-smoke.test.mjs',
  'Phase 5 staging smoke contract must be runnable through npm',
)
assert.equal(
  packageJson.scripts?.['verify:buyer-onboarding:phase5-staging-smoke'],
  'node scripts/buyer-onboarding-projection-recovery-staging-smoke.mjs --environment staging',
  'Phase 5 live staging smoke must be exposed through a guarded verify script',
)

assert.match(smokeSource, /projectRef:\s*'vaszuxjeoajeuhlcnzzf'/, 'smoke must target the guarded buyer onboarding staging project')
assert.match(smokeSource, /SUPABASE_STAGING_PROJECT_REF/, 'smoke must require the explicit staging project ref')
assert.match(smokeSource, /SUPABASE_STAGING_DB_URL/, 'smoke must require the staging database URL')
assert.match(smokeSource, /--environment staging/, 'smoke must require an explicit staging environment argument')
assert.match(smokeSource, /begin;[\s\S]*rollback;/, 'smoke must run inside a transaction that rolls back')
assert.match(smokeSource, /set local role anon/, 'smoke must exercise the browser anon role after fixture selection')
assert.match(
  smokeSource,
  /bridge_save_buyer_onboarding_snapshot[\s\S]*p_submit\s*=>\s*false/,
  'smoke must verify the token-bound snapshot save without advancing onboarding lifecycle',
)
assert.match(
  smokeSource,
  /bridge_accept_transaction_platform_fee_consent\(text,jsonb\)/,
  'smoke must verify the staging platform fee consent RPC exists',
)
assert.match(
  smokeSource,
  /x-bridge-onboarding-token/,
  'smoke must bind access through the buyer onboarding bearer token',
)
assert.match(
  smokeSource,
  /unsafe_marker_shape[\s\S]*v_unsafe_marker_blocked\s*:=\s*true/,
  'smoke must prove malformed projection markers are blocked',
)
assert.match(smokeSource, /redact\(error\?\.message/, 'smoke must redact failure output')

for (const eventType of markerEventTypes) {
  assert.match(smokeSource, new RegExp(eventType), `${eventType} must be covered by the live smoke`)
  assert.match(migrationSource, new RegExp(eventType), `${eventType} must be allowed by the recovery marker policy`)
}

assert.match(
  migrationSource,
  /grant insert on public\.transaction_events to anon, authenticated;/,
  'migration must grant the table privilege required for scoped marker inserts',
)
assert.match(
  migrationSource,
  /create policy transaction_events_insert_buyer_onboarding_projection_recovery[\s\S]*for insert[\s\S]*to anon, authenticated/,
  'migration must add a dedicated scoped insert policy',
)
assert.match(
  migrationSource,
  /bridge_has_onboarding_token_transaction_access\s*\(\s*transaction_id\s*\)/,
  'marker insert policy must be scoped to the onboarding token transaction',
)
assert.match(
  migrationSource,
  /event_data ->> 'source'[\s\S]*buyer_onboarding_projection_recovery_marker/,
  'marker insert policy must require the sanitized recovery marker source',
)
assert.match(
  migrationSource,
  /event_data ->> 'recoveryRequired'[\s\S]*'true'[\s\S]*event_data ->> 'retryable'[\s\S]*'true'/,
  'marker insert policy must require replayable recovery markers',
)
assert.match(
  migrationSource,
  /created_by is null[\s\S]*created_by_role[\s\S]*system/,
  'marker insert policy must not allow caller-supplied user attribution',
)
assert.doesNotMatch(
  migrationSource,
  /with check\s*\(\s*true\s*\)/,
  'marker insert policy must not open unrestricted transaction event inserts',
)

console.log('buyer onboarding Phase 5 staging smoke contract passed')
