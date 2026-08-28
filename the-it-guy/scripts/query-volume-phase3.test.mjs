import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../supabase/migrations/20260827211341_short_circuit_missing_portal_tokens_phase3.sql',
  import.meta.url,
)

test('portal-token access helpers return before querying when headers are absent', async () => {
  const migration = await readFile(migrationUrl, 'utf8')

  for (const helper of [
    'bridge_has_client_portal_token_transaction_access',
    'bridge_has_onboarding_token_transaction_access',
    'bridge_has_status_token_transaction_access',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${helper}`))
  }

  assert.equal(
    (migration.match(/if coalesce\(request_token, ''\) = '' then/g) || []).length,
    3,
  )
  assert.equal((migration.match(/return false;/g) || []).length, 3)
  assert.equal((migration.match(/stable\nsecurity definer\nset search_path to 'public'/g) || []).length, 3)
})

test('hot branding policies use a once-per-statement onboarding-token guard', async () => {
  const migration = await readFile(migrationUrl, 'utf8')

  assert.match(migration, /alter policy organisations_select_onboarding_token_brand_scope/)
  assert.match(migration, /alter policy organisation_branding_select_onboarding_token_brand_scope/)
  assert.equal(
    (migration.match(/\(select public\.bridge_onboarding_request_token\(\)\) <> ''/g) || []).length,
    2,
  )
})

test('phase 3 does not broaden database access', async () => {
  const migration = await readFile(migrationUrl, 'utf8')

  assert.doesNotMatch(migration, /disable row level security/i)
  assert.doesNotMatch(migration, /grant\s+/i)
  assert.doesNotMatch(migration, /to\s+(anon|authenticated)/i)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i)
})
