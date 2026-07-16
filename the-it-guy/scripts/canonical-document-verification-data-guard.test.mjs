import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertCanonicalVerificationDataSource } from './canonical-document-verification-data-guard.mjs'

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

console.log('canonical document verification data guard tests passed')
