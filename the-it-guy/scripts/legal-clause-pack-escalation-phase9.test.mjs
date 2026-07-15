import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const escalation = await readFile(new URL('../src/services/documents/legalClausePackEscalationService.js', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const diagnosticsPage = await readFile(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
const rollout = await readFile(new URL('../docs/audits/legal-clause-pack-phase-9.md', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:legal-clause-pack-escalation-phase9'],
  'node src/services/documents/__tests__/legalClausePackEscalationService.test.js && node scripts/legal-clause-pack-escalation-phase9.test.mjs',
  'package.json should expose the Phase 9 escalation regression.',
)

for (const token of [
  'sa_legal_clause_pack_escalation_v1',
  'buildLegalClausePackEscalationPlan',
  'executeLegalClausePackEscalationPlan',
  'approvedPlanFingerprint',
  'LEGAL_ESCALATION_PLAN_STALE',
  'legal_clause_pack_phase9_escalation',
  'no_active_recipients',
]) {
  assert.ok(escalation.includes(token), `Phase 9 escalation service should preserve ${token}.`)
}

for (const token of [
  'export async function notifyTransactionRoles',
  'dedupePrefix',
  'fetchNotificationTargetsByRole',
  'createTransactionNotificationIfPossible',
]) {
  assert.ok(api.includes(token), `Shared notification API should preserve ${token}.`)
}

for (const token of [
  'Plan review notifications',
  'Apply reviewed plan',
  'Phase 9 notification plan',
  'No notifications have been created.',
  'revalidated immediately before notification',
]) {
  assert.ok(diagnosticsPage.includes(token), `Platform Diagnostics should expose ${token}.`)
}

for (const token of [
  'It does not auto-approve, alter clauses, lock documents, release signing links, or repair legal evidence.',
  'deterministic plan fingerprint',
  'Only the authorised Phase 7 approval action can produce valid signature-release evidence',
]) {
  assert.ok(rollout.includes(token), `Phase 9 operating contract should preserve ${token}.`)
}

console.log('Legal clause-pack escalation Phase 9 contract passed.')

