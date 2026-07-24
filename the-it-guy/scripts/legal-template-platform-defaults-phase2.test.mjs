import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/202607240001_global_mandate_platform_default_phase2.sql', import.meta.url), 'utf8')
const verifier = await readFile(new URL('./verify-legal-template-platform-defaults-phase2.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase2'],
  'node scripts/legal-template-platform-defaults-phase2.test.mjs',
  'package.json should expose the Phase 2 platform-defaults contract.',
)
assert.equal(
  packageJson.scripts?.['verify:legal-template-platform-defaults-phase2'],
  'node --env-file=.env --env-file=.env.staging.local scripts/verify-legal-template-platform-defaults-phase2.mjs',
  'package.json should expose the read-only Phase 2 verifier.',
)

for (const token of [
  'mandate_default_v1',
  "'global_default'",
  "'platform_default_phase', 'phase2'",
  "'platform_default_can_route_without_org_template', true",
  "'render_mode', 'native_structured'",
  "'legal_runtime_release_required', true",
  'v_section_count < 10',
  "section.section_type, '')) = 'signature_zone'",
]) {
  assert.ok(migration.includes(token), `Phase 2 migration should include: ${token}`)
}

for (const forbidden of [
  "'legal_review_status', 'approved'",
  "'legal_b3_applied_at'",
  "'legal_b3_applied_by'",
  'document_packet_template_release_provenance_phase4',
]) {
  assert.ok(!migration.includes(forbidden), `Phase 2 migration must not forge release evidence: ${forbidden}`)
}

for (const token of [
  'assessLegalTemplateApproval',
  'assessNativeStarterTemplate',
  'GLOBAL_MANDATE_NOT_APPROVED',
  'GLOBAL_MANDATE_NATIVE_STARTER_INVALID',
  'mutatedData: false',
]) {
  assert.ok(verifier.includes(token), `Phase 2 verifier should include: ${token}`)
}

console.log('Legal template platform defaults Phase 2 contract passed.')
