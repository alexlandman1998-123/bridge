import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertCanonicalVerificationDataSource } from './canonical-document-verification-data-guard.mjs'
import { createCanonicalVerificationClient } from './canonical-document-verification-client.mjs'

function table(rows = [{}], extra = {}) {
  return { available: true, error: null, fetchedRows: rows.length, rows, ...extra }
}

function validTables() {
  return {
    document_definitions: table([{ key: 'signed_mandate' }]),
    document_requirement_rules: table([{ id: 'rule-1' }]),
    document_requirement_instances: table([{ id: 'instance-1' }]),
  }
}

assert.equal(assertCanonicalVerificationDataSource({
  snapshotAvailable: true,
  tables: validTables(),
}).ok, true)

assert.throws(
  () => assertCanonicalVerificationDataSource({
    snapshotAvailable: false,
    snapshotError: 'canceling statement due to statement timeout',
  }),
  (error) => error.code === 'CANONICAL_VERIFICATION_SNAPSHOT_UNAVAILABLE' && /statement timeout/.test(error.message),
)

assert.throws(
  () => assertCanonicalVerificationDataSource({
    snapshotAvailable: true,
    tables: {
      ...validTables(),
      document_definitions: table([], { error: 'permission denied for table document_definitions' }),
    },
  }),
  (error) => error.code === 'CANONICAL_VERIFICATION_TABLE_READ_FAILED' && /permission denied/.test(error.message),
)

assert.throws(
  () => assertCanonicalVerificationDataSource({
    snapshotAvailable: true,
    tables: { ...validTables(), document_definitions: table([]) },
  }),
  (error) => error.code === 'CANONICAL_VERIFICATION_FOUNDATION_EMPTY',
)

assert.throws(
  () => assertCanonicalVerificationDataSource({
    snapshotAvailable: true,
    tables: { ...validTables(), document_requirement_instances: table([]) },
  }),
  (error) => error.code === 'CANONICAL_VERIFICATION_INSTANCES_EMPTY',
)

assert.equal(assertCanonicalVerificationDataSource({
  snapshotAvailable: true,
  scoped: true,
  tables: { ...validTables(), document_requirement_instances: table([]) },
}).ok, true)

const verifierSource = await readFile(new URL('./canonical-document-real-staging-dry-run.mjs', import.meta.url), 'utf8')
assert.match(verifierSource, /assertCanonicalVerificationDataSource\(\{/, 'real staging verifier must invoke the fail-closed data guard')
assert.doesNotMatch(verifierSource, /direct_table_reads|fetchAllTables/, 'real staging verifier must not fall back to partial direct table reads')
assert.match(verifierSource, /fetchPhase6ReconciliationPlan\(supabase\)/, 'scoped verification must fetch the transaction reconciliation plan')

const testJwt = (role) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`
assert.throws(() => createCanonicalVerificationClient({ SUPABASE_URL: 'https://example.supabase.co' }), /SUPABASE_SERVICE_ROLE_KEY/)
assert.throws(() => createCanonicalVerificationClient({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: testJwt('anon'),
}), /service-role/)
assert.equal(createCanonicalVerificationClient({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: testJwt('service_role'),
}).supabaseUrl, 'https://example.supabase.co')

const migration = await readFile(new URL('../../supabase/migrations/20260927093752_transaction_document_existing_matter_reconciliation_phase6.sql', import.meta.url), 'utf8')
assert.match(migration, /revoke all on function public\.canonical_document_verification_snapshot\([\s\S]*?from public, anon, authenticated/i)
assert.match(migration, /create or replace function public\.bridge_plan_transaction_document_reconciliation_phase6/)
assert.match(migration, /create or replace function public\.bridge_apply_transaction_document_reconciliation_phase6/)
assert.match(migration, /p_expected_digest/)
assert.match(migration, /pg_advisory_xact_lock/)
assert.doesNotMatch(migration, /update public\.document_requests/i, 'historical request state must remain for manual review')

console.log('canonical document verification data guard tests passed')
