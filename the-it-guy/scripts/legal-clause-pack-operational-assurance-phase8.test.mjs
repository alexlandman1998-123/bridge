import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const diagnostics = await readFile(new URL('../src/services/documents/legalClausePackOperationalDiagnosticsService.js', import.meta.url), 'utf8')
const diagnosticsPage = await readFile(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
const rollout = await readFile(new URL('../docs/audits/legal-clause-pack-phase-8.md', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:legal-clause-pack-operational-assurance-phase8'],
  'node src/services/documents/__tests__/legalClausePackOperationalDiagnosticsService.test.js && node scripts/legal-clause-pack-operational-assurance-phase8.test.mjs',
  'package.json should expose the Phase 8 operational-assurance regression.',
)

for (const token of [
  'sa_legal_clause_pack_operational_diagnostics_v1',
  'released_without_valid_approval',
  'awaiting_attorney_approval',
  'stale_approval',
  'invalid_approval_role',
  'approved_ready_to_send',
  'getLegalClausePackOperationalDiagnosticsSnapshot',
  'renderLegalClausePackOperationalDiagnosticsMarkdown',
]) {
  assert.ok(diagnostics.includes(token), `Phase 8 diagnostics should preserve ${token}.`)
}

for (const token of [
  'Governed OTP signature release',
  'Run OTP release audit',
  'Phase 8 gate',
  'Attorney queue',
  'The audit is partial',
  'This check is read-only',
]) {
  assert.ok(diagnosticsPage.includes(token), `Platform Diagnostics should expose ${token}.`)
}

for (const token of [
  'The audit never changes packet, version, signer, or approval data.',
  'Legacy OTPs remain visible but do not fail the governed release gate.',
  'Resolve critical rows before rollout',
]) {
  assert.ok(rollout.includes(token), `Phase 8 rollout note should preserve ${token}.`)
}

console.log('Legal clause-pack operational assurance Phase 8 contract passed.')

