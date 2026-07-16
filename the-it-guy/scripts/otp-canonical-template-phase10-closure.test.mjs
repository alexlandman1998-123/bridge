import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const resolution = fs.readFileSync(new URL('../src/services/documents/legalClausePackResolutionService.js', import.meta.url), 'utf8')
const overview = fs.readFileSync(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')
const workspaceHook = fs.readFileSync(new URL('../src/hooks/useLegalDocumentWorkspace.js', import.meta.url), 'utf8')
const workspaceRoute = fs.readFileSync(new URL('../src/pages/settings/LegalDocumentWorkspaceRoute.jsx', import.meta.url), 'utf8')
const workspacePanel = fs.readFileSync(new URL('../src/components/legal-document-workspace/FollowUpResolutionPanel.jsx', import.meta.url), 'utf8')
const phase9 = fs.readFileSync(new URL('../src/services/documents/legalClausePackEscalationService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-canonical-template-phase10'],
  'node src/services/documents/__tests__/legalClausePackResolutionService.test.js && node scripts/otp-canonical-template-phase10-closure.test.mjs && npm run test:otp-canonical-template-phase9',
)

for (const token of [
  'sa_legal_clause_pack_resolution_v2',
  'canonicalTemplateVersionId',
  'canonicalEvidenceKey',
  'canonicalEvidenceIssues',
  'canonicalActiveFindings',
  'canonicalResolvedAfterNotification',
  'resolved_after_notification',
]) {
  assert.ok(resolution.includes(token), `canonical Phase 10 closure should preserve ${token}`)
}

assert.match(phase9, /canonicalEvidenceKey/)
assert.match(overview, /item\.canonicalTemplateVersionId\.slice\(0, 8\)/)
assert.match(overview, /finding is resolved only when it disappears from a freshly generated Phase 8 audit/i)
assert.match(workspaceHook, /getLegalClausePackResolutionSnapshot/)
assert.match(workspaceHook, /setAssuranceState\(\{ organisationId: activeOrganisationId, diagnostics: report\.diagnostics/)
assert.match(workspaceHook, /setFollowUpState\(\{ organisationId: activeOrganisationId, plan: null/)
assert.match(workspaceRoute, /<FollowUpResolutionPanel/)
for (const token of [
  'Check follow-up status',
  'Notification missing',
  'Awaiting acknowledgement',
  'Overdue unread',
  'Acknowledged, unresolved',
  'Resolved after notification',
  'canonicalTemplateVersionId',
]) {
  assert.ok(workspacePanel.includes(token), `simplified Phase 10 workspace should expose ${token}`)
}
assert.match(workspacePanel, /This check is read-only/i)

console.log('Canonical OTP Phase 10 closed-loop resolution checks passed.')
