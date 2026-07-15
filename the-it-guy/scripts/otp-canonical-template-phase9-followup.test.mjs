import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const escalation = fs.readFileSync(new URL('../src/services/documents/legalClausePackEscalationService.js', import.meta.url), 'utf8')
const overview = fs.readFileSync(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')
const diagnostics = fs.readFileSync(new URL('../src/services/documents/legalClausePackOperationalDiagnosticsService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-canonical-template-phase9'],
  'node src/services/documents/__tests__/legalClausePackEscalationService.test.js && node scripts/otp-canonical-template-phase9-followup.test.mjs && npm run test:otp-canonical-template-phase8',
)

for (const token of [
  'sa_legal_clause_pack_escalation_v2',
  'canonical_version_evidence_invalid',
  'canonicalTemplateVersionId',
  'canonicalEvidenceIssues',
  'canonicalEvidenceKey',
  'approvedPlanFingerprint',
  'LEGAL_ESCALATION_PLAN_STALE',
]) {
  assert.ok(escalation.includes(token), `canonical Phase 9 follow-up should preserve ${token}`)
}

assert.match(diagnostics, /canonical_version_evidence_invalid/)
assert.match(overview, /master-version evidence/)
assert.match(overview, /action\.canonicalTemplateVersionId\.slice\(0, 8\)/)
assert.match(overview, /This does not approve an OTP.*perform rollback/s)

console.log('Canonical OTP Phase 9 controlled follow-up checks passed.')
