#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAttorneyWorkflowPhase9PilotMonitoring } from './attorney-workflow-phase9-pilot-monitoring.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const packageSource = read('package.json')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase3AuditSource = read('docs/audits/attorney-workflow-phase3-launch-gate.md')
const phase8AuditSource = read('docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md')
const phase9AuditSource = read('docs/audits/attorney-workflow-phase9-pilot-monitoring.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')
const legacyPhase9Source = read('scripts/verify-attorney-workflow-phase9.mjs')

assert.match(detailSource, /function buildAttorneyPilotMonitorModel/, 'Phase 9 must derive pilot monitoring metrics.')
assert.match(detailSource, /function AttorneyPilotMonitorPanel/, 'Phase 9 must render pilot monitoring UI.')
assert.match(detailSource, /Stuck Matter Signals/, 'Phase 9 must surface stuck-matter signals.')
assert.match(detailSource, /Pilot Feedback/, 'Phase 9 must surface pilot feedback state.')
assert.match(detailSource, /Idle Days/, 'Phase 9 must track idle-day metric.')
assert.match(detailSource, /Blocked Lanes/, 'Phase 9 must track blocked-lane metric.')
assert.match(detailSource, /Document Gaps/, 'Phase 9 must track document-gap metric.')
assert.match(detailSource, /Log Pilot Feedback/, 'Phase 9 must provide feedback capture.')
assert.match(detailSource, /No pilot feedback logged/, 'Phase 9 must flag missing pilot feedback.')
assert.match(detailSource, /const attorneyPilotMonitor = useMemo/, 'Phase 9 must wire monitor to live matter data.')
assert.match(detailSource, /roleplayerActionableBlockers,/, 'Phase 9 must include roleplayer blockers in pilot metrics.')
assert.match(detailSource, /legalExceptionReview,/, 'Phase 9 must include legal exceptions in pilot metrics.')
assert.match(detailSource, /activityFeed,/, 'Phase 9 must include activity in pilot metrics.')
assert.match(detailSource, /visibleTransactionDiscussion,/, 'Phase 9 must include discussion feedback in pilot metrics.')
assert.match(detailSource, /function handleDraftAttorneyPilotFeedbackNote/, 'Phase 9 must draft pilot feedback notes.')
assert.match(detailSource, /Pilot feedback\./, 'Phase 9 feedback note must be identifiable.')
assert.match(detailSource, /setDiscussionActionKey\('quick_internal_note'\)/, 'Pilot feedback must post as an internal note.')
assert.match(detailSource, /onDraftFeedback=\{handleDraftAttorneyPilotFeedbackNote\}/)

assert.match(packageSource, /"test:attorney-workflow-phase9-pilot-monitoring":\s*"node scripts\/attorney-workflow-phase9-pilot-monitoring\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase9-pilot-monitoring":\s*"node scripts\/attorney-workflow-phase9-pilot-monitoring\.mjs"/)
assert.match(phase0AuditSource, /Attorney workflow Phase 9 pilot monitoring/)
assert.match(phase0AuditSource, /B-ATTY-0-8 \| Closed/)
assert.match(phase3AuditSource, /Phase 9 pilot monitoring is implemented/)
assert.match(phase8AuditSource, /Phase 9 pilot monitoring is implemented/)
assert.match(phase9AuditSource, /# Attorney Workflow Phase 9 Pilot Monitoring/)
assert.match(phase9AuditSource, /Decision: READY FOR ATTORNEY PILOT MONITORING/)
assert.match(launchReadinessSource, /Attorney workflow Phase 9 pilot monitoring: `docs\/audits\/attorney-workflow-phase9-pilot-monitoring\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase9-pilot-monitoring/)
assert.match(legacyPhase9Source, /Attorney workflow Phase 9 coordination verification passed\./)

const staticOnlyReport = await runAttorneyWorkflowPhase9PilotMonitoring({
  staticOnly: true,
  skipPrerequisites: true,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 9 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_STATIC_ONLY', 'Static-only Phase 9 should not claim full prerequisite sign-off.')

console.log('attorney workflow Phase 9 pilot monitoring tests passed')
