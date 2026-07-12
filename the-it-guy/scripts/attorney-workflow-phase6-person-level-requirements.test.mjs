#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAttorneyWorkflowPhase6PersonLevelRequirements } from './attorney-workflow-phase6-person-level-requirements.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const packageSource = read('package.json')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase3AuditSource = read('docs/audits/attorney-workflow-phase3-launch-gate.md')
const phase5AuditSource = read('docs/audits/attorney-workflow-phase5-signing-appointments.md')
const phase6AuditSource = read('docs/audits/attorney-workflow-phase6-person-level-requirements.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.match(detailSource, /PERSON_LEVEL_REQUIREMENT_GROUPS/, 'Phase 6 must define person-level requirement groups.')
assert.match(detailSource, /buildPersonLevelRequirementRows/, 'Phase 6 must derive grouped person-level rows.')
assert.match(detailSource, /summarizePersonLevelRequirementRows/, 'Phase 6 must summarize person-level requirement rows.')
assert.match(detailSource, /PersonLevelRequirementsPanel/, 'Phase 6 must render a person-level requirements panel.')
assert.match(detailSource, /Person-Level Requirements/, 'Documents workspace must label the person-level requirement panel.')
assert.match(detailSource, /key: 'director'/, 'Phase 6 must cover directors.')
assert.match(detailSource, /key: 'trustee'/, 'Phase 6 must cover trustees.')
assert.match(detailSource, /key: 'spouse'/, 'Phase 6 must cover spouses.')
assert.match(detailSource, /key: 'co_owner'/, 'Phase 6 must cover co-owners.')
assert.match(detailSource, /key: 'signatory'/, 'Phase 6 must cover signatories.')
assert.match(detailSource, /key: 'beneficial_owner'/, 'Phase 6 must cover beneficial owners.')
assert.match(detailSource, /openDocumentUploadModal\(\{ requirement \}\)/, 'Open person-level requirements must launch the existing upload flow.')
assert.match(detailSource, /setActiveDocumentLibraryCategory\('missing'\)/, 'Person-level panel must let attorneys review related missing rows in the library.')

assert.match(packageSource, /"test:attorney-workflow-phase6-person-level-requirements":\s*"node scripts\/attorney-workflow-phase6-person-level-requirements\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase6-person-level-requirements":\s*"node scripts\/attorney-workflow-phase6-person-level-requirements\.mjs"/)
assert.match(phase0AuditSource, /Attorney workflow Phase 6 person-level requirements/)
assert.match(phase0AuditSource, /\| B-ATTY-0-6 \| Closed \| Attorney UX \/ Legal Docs \| Person-level director, trustee, spouse, co-owner, signatory, and beneficial-owner requirements are surfaced in attorney transaction UI\. \| Phase 6 \|/)
assert.match(phase3AuditSource, /Phase 6 person-level attorney UX is implemented/)
assert.match(phase5AuditSource, /Phase 6 person-level requirement UI is implemented/)
assert.match(phase6AuditSource, /# Attorney Workflow Phase 6 Person-Level Requirements/)
assert.match(phase6AuditSource, /Decision: GO TO PHASE 7 WITH PERSON-LEVEL REQUIREMENTS VISIBLE/)
assert.match(launchReadinessSource, /Attorney workflow Phase 6 person-level requirements: `docs\/audits\/attorney-workflow-phase6-person-level-requirements\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase6-person-level-requirements/)

const staticOnlyReport = await runAttorneyWorkflowPhase6PersonLevelRequirements({
  staticOnly: true,
  skipPrerequisites: true,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 6 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_STATIC_ONLY', 'Static-only Phase 6 should not claim full prerequisite sign-off.')

console.log('attorney workflow Phase 6 person-level requirement tests passed')
