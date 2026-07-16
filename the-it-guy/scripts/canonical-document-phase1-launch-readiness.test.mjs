import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const migration = await readFile(
  new URL('../../supabase/migrations/202607160019_canonical_document_phase1_launch_mappings.sql', import.meta.url),
  'utf8',
)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const {
    canonicalDefinitionKeyToLegacyKey,
    getUnmappedLegacyRequirementKeys,
    legacyRequirementKeyToCanonicalKey,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')
  const { resolveCrossModuleDocumentKey } = await server.ssrLoadModule('/src/services/documents/crossModuleDocumentKeyMapService.js')

  assert.equal(legacyRequirementKeyToCanonicalKey('income_tax_number'), 'seller_tax_number')
  assert.equal(canonicalDefinitionKeyToLegacyKey('seller_tax_number'), 'income_tax_number')
  assert.equal(resolveCrossModuleDocumentKey('income_tax_number'), 'seller_tax_number')

  assert.equal(legacyRequirementKeyToCanonicalKey('alteration_approvals'), 'alteration_approvals')
  assert.equal(canonicalDefinitionKeyToLegacyKey('alteration_approvals'), 'alteration_approvals')
  assert.equal(resolveCrossModuleDocumentKey('alteration_approvals'), 'alteration_approvals')

  assert.deepEqual(getUnmappedLegacyRequirementKeys([
    { requirement_key: 'income_tax_number' },
    { requirement_key: 'alteration_approvals' },
  ]), [])
} finally {
  await server.close()
}

for (const token of [
  "'alteration_approvals'",
  "where key = 'seller_tax_number'",
  "'income_tax_number'",
  'on conflict (key) do update',
  "'canonical_document_phase1_launch_mappings_v1'",
]) {
  assert.ok(migration.includes(token), `Phase 1 launch mapping migration should include ${token}.`)
}

assert.doesNotMatch(migration, /delete\s+from|drop\s+table|truncate/i, 'Phase 1 launch mapping migration must remain additive and idempotent.')

console.log('canonical document Phase 1 launch-readiness checks passed')
