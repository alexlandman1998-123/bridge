import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const intake = await readFile(new URL('../src/components/documents/OtpDraftIntakePanel.jsx', import.meta.url), 'utf8')
const readinessPanel = await readFile(new URL('../src/components/documents/OtpClausePackReadinessPanel.jsx', import.meta.url), 'utf8')
const workspacePage = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:legal-clause-pack-readiness-phase6'],
  'node scripts/legal-clause-pack-readiness-phase6.test.mjs',
  'package.json should expose the current legal clause-pack Phase 6 contract.',
)

for (const token of [
  'resolveLegalClausePackTransactionReadiness',
  '<OtpClausePackReadinessPanel',
  'missingFieldKeys',
  'data-otp-field',
  'Complete the highlighted deal details before generating this OTP.',
]) {
  assert.ok(intake.includes(token), `OTP intake should expose guided Phase 6 readiness: ${token}`)
}

for (const token of [
  'OTP readiness',
  'Choose an item below to jump to the right answer.',
  'Attorney confirmation before signature',
  'aria-live="polite"',
]) {
  assert.ok(readinessPanel.includes(token), `Readiness panel should keep the end-user contract: ${token}`)
}

for (const token of [
  'legalClausePackTransactionReadiness',
  'Complete the highlighted clause-pack details before generating this OTP.',
  "source: 'legal_clause_pack_transaction_readiness'",
]) {
  assert.ok(workspacePage.includes(token), `Legal workspace should enforce Phase 6 before generation: ${token}`)
}

for (const token of [
  'resolveLegalClausePackTransactionReadiness',
  'legalClausePackTransactionReadinessRuntimeEnforced',
  'legalClausePackTransactionReadinessIssues',
  'LEGAL_CLAUSE_PACK_TRANSACTION_READINESS_BLOCKED',
  'legalClausePackTransactionReadinessVersion',
  'legalClausePackTransactionMissingFields',
]) {
  assert.ok(packetService.includes(token), `Packet runtime should preserve Phase 6 readiness and provenance: ${token}`)
}

assert.ok(
  packetService.includes('hasLegalClausePackTransactionReadinessBlockingIssues') &&
    packetService.includes('hasNonBypassableLegalGovernanceIssues'),
  'Governed Phase 6 readiness failures must remain non-bypassable.',
)

console.log('Legal clause-pack transaction readiness Phase 6 contract passed.')
