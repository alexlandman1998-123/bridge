#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAttorneyWorkflowPhase8ExceptionalLegalScenarios } from './attorney-workflow-phase8-exceptional-legal-scenarios.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const packageSource = read('package.json')
const legalSupportBoundaryTestSource = read('scripts/legal-support-boundary-phase1.test.mjs')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase3AuditSource = read('docs/audits/attorney-workflow-phase3-launch-gate.md')
const phase7AuditSource = read('docs/audits/attorney-workflow-phase7-actionable-blockers.md')
const phase8AuditSource = read('docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.match(detailSource, /resolveLegalSupportBoundary/, 'Phase 8 must use the legal support-boundary resolver.')
assert.match(detailSource, /const legalExceptionBoundary = useMemo/, 'Phase 8 must derive a legal exception boundary model.')
assert.match(detailSource, /function buildLegalExceptionReviewModel/, 'Phase 8 must normalize exception boundary state for UI.')
assert.match(detailSource, /function LegalExceptionReviewPanel/, 'Phase 8 must expose a legal exception review panel.')
assert.match(detailSource, /Automation stopped/, 'Unsupported legal scenarios must show stopped automation policy.')
assert.match(detailSource, /Manual review required/, 'Manual-review legal scenarios must show manual-review policy.')
assert.match(detailSource, /Automated progression is stopped until a conveyancer explicitly decides how this matter continues\./)
assert.match(detailSource, /Automated progression is paused for conveyancer review while intake and supporting documents remain visible\./)
assert.match(detailSource, /Operational Owner/, 'Phase 8 must name the operational owner.')
assert.match(detailSource, /Review Boundary Docs/, 'Phase 8 must let attorneys review boundary documents.')
assert.match(detailSource, /Add Review Note/, 'Phase 8 must let attorneys draft an internal review note.')
assert.match(detailSource, /workspaceRole === 'attorney' && activeWorkspaceMenu === 'overview'/)
assert.match(detailSource, /model=\{legalExceptionReview\}/)
assert.match(detailSource, /onManageOwner=\{openRoleplayerConfirmation\}/)
assert.match(detailSource, /function handleOpenLegalExceptionDocuments/)
assert.match(detailSource, /setActiveDocumentLibraryCategory\(legalExceptionReview\?\.unsupported \? 'missing' : 'critical'\)/)
assert.match(detailSource, /function handleDraftLegalExceptionReviewNote/)
assert.match(detailSource, /setDiscussionActionKey\('quick_internal_note'\)/)

assert.match(legalSupportBoundaryTestSource, /manual_review/, 'Legal boundary tests must cover manual review.')
assert.match(legalSupportBoundaryTestSource, /unsupported/, 'Legal boundary tests must cover unsupported scenarios.')
assert.match(legalSupportBoundaryTestSource, /legal_support_boundary_review/)
assert.match(legalSupportBoundaryTestSource, /legal_support_boundary_stop/)

assert.match(packageSource, /"test:attorney-workflow-phase8-exceptional-legal-scenarios":\s*"node scripts\/attorney-workflow-phase8-exceptional-legal-scenarios\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase8-exceptional-legal-scenarios":\s*"node scripts\/attorney-workflow-phase8-exceptional-legal-scenarios\.mjs"/)
assert.match(phase0AuditSource, /Attorney workflow Phase 8 exceptional legal scenarios/)
assert.match(phase0AuditSource, /B-ATTY-0-7 \| Closed/)
assert.match(phase3AuditSource, /Phase 8 exceptional legal scenario ownership is implemented/)
assert.match(phase7AuditSource, /Phase 8 exceptional legal scenario ownership is implemented/)
assert.match(phase8AuditSource, /# Attorney Workflow Phase 8 Exceptional Legal Scenarios/)
assert.match(phase8AuditSource, /Decision: GO TO PHASE 9 WITH EXCEPTIONAL LEGAL SCENARIOS OWNED/)
assert.match(launchReadinessSource, /Attorney workflow Phase 8 exceptional legal scenarios: `docs\/audits\/attorney-workflow-phase8-exceptional-legal-scenarios\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios/)

const staticOnlyReport = await runAttorneyWorkflowPhase8ExceptionalLegalScenarios({
  staticOnly: true,
  skipPrerequisites: true,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 8 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_STATIC_ONLY', 'Static-only Phase 8 should not claim full prerequisite sign-off.')

console.log('attorney workflow Phase 8 exceptional legal scenario tests passed')
