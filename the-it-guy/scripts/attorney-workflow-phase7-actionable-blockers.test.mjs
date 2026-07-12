#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAttorneyWorkflowPhase7ActionableBlockers } from './attorney-workflow-phase7-actionable-blockers.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const packageSource = read('package.json')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase6AuditSource = read('docs/audits/attorney-workflow-phase6-person-level-requirements.md')
const phase7AuditSource = read('docs/audits/attorney-workflow-phase7-actionable-blockers.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.match(detailSource, /ATTORNEY_ACTIONABLE_BLOCKER_TARGETS/, 'Phase 7 must define target actions for visible blockers.')
assert.match(detailSource, /function getAttorneyActionableBlockerAction/, 'Phase 7 must resolve a blocker to a next action.')
assert.match(detailSource, /function ActionableBlockerButton/, 'Phase 7 must render blocker CTAs consistently.')
assert.match(detailSource, /function ActionableBlockerRows/, 'Phase 7 must render rows of actionable blockers.')
assert.match(detailSource, /function handleAttorneyActionableBlocker/, 'Phase 7 must wire actions to existing workflows.')
assert.match(detailSource, /target === 'documents'/, 'Document blockers must open documents.')
assert.match(detailSource, /target === 'signing'/, 'Signing blockers must open signing workflow.')
assert.match(detailSource, /target === 'roleplayers'/, 'Roleplayer blockers must open roleplayer controls.')
assert.match(detailSource, /target === 'registration'/, 'Registration blockers must open registration.')
assert.match(detailSource, /target === 'finance'/, 'Finance blockers must open finance.')
assert.match(detailSource, /openLegalWorkflowDetail\(detailKey\)/, 'Fallback blocker action must open the lane.')

assert.match(detailSource, /source: 'attorney_unblocker_board'/, 'Unblocker-board items must be actionable.')
assert.match(detailSource, /source: 'attorney_unblocker_board_count'/, 'Unblocker-board counted hidden items must still be actionable.')
assert.match(detailSource, /source: 'legal_workflow_hub_card'/, 'Workflow hub blocker card must be actionable.')
assert.match(detailSource, /source: 'document_readiness'/, 'Document readiness blocker must be actionable.')
assert.match(detailSource, /const roleplayerActionableBlockers = useMemo/, 'Roleplayer blockers must be rendered as action rows.')
assert.match(detailSource, /Roleplayer Blocker Actions/, 'Roleplayer workspace must expose the action list.')
assert.match(detailSource, /source: 'registration_validation'/, 'Registration validation blockers must be actionable.')
assert.match(detailSource, /ATTORNEY_ACTIONABLE_BLOCKER_TARGETS\.recheck/, 'Registration validation must expose recheck action.')

assert.match(packageSource, /"test:attorney-workflow-phase7-actionable-blockers":\s*"node scripts\/attorney-workflow-phase7-actionable-blockers\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase7-actionable-blockers":\s*"node scripts\/attorney-workflow-phase7-actionable-blockers\.mjs"/)
assert.match(phase0AuditSource, /Attorney workflow Phase 7 actionable blockers/)
assert.match(phase6AuditSource, /Phase 7 actionable blocker UI is implemented/)
assert.match(phase7AuditSource, /# Attorney Workflow Phase 7 Actionable Blockers/)
assert.match(phase7AuditSource, /Decision: GO TO PHASE 8 WITH BLOCKERS ACTIONABLE WHERE THEY APPEAR/)
assert.match(launchReadinessSource, /Attorney workflow Phase 7 actionable blockers: `docs\/audits\/attorney-workflow-phase7-actionable-blockers\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase7-actionable-blockers/)

const staticOnlyReport = await runAttorneyWorkflowPhase7ActionableBlockers({
  staticOnly: true,
  skipPrerequisites: true,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 7 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_STATIC_ONLY', 'Static-only Phase 7 should not claim full prerequisite sign-off.')

console.log('attorney workflow Phase 7 actionable blocker tests passed')
