import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_RELEASE_PHASE10_CONFIRMATION, buildAttorneyReleasePhase10Decision } from '../src/services/attorneyReleasePhase10.js'
const deploymentId = 'dpl_canary'; const reportFingerprint = 'phase9-report'
const phase9Receipt = { status: 'VERIFIED', immutable: true, deploymentId, reportFingerprint }
const readiness = { deploymentId, phase9ReportFingerprint: reportFingerprint, supportOwner: 'Support', monitoringOwner: 'Monitor', securityOwner: 'Security', rollbackOwner: 'Rollback', incidentChannel: '#incidents', supportRunbook: 'docs/runbook', monitoringDashboard: 'dashboard', rollbackDeploymentId: 'dpl_previous', rollbackDrillAt: '2026-09-09T12:00:00.000Z', onCallAcknowledged: true, supportBriefed: true, monitoringActive: true, rollbackTested: true, expansionMode: 'gradual', maximumExpansionPercent: 10, maximumOrganisationsPerStep: 5, securityIncidents: 0, visibilityBreaches: 0, dataIntegrityFailures: 0, unexpectedPermissionAllows: 0, propagationGaps: 0, runtimeErrors: 0 }
const approval = { deploymentId, phase9ReportFingerprint: reportFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-09T12:05:00.000Z', approvalReference: 'ga-1', confirmation: ATTORNEY_RELEASE_PHASE10_CONFIRMATION }
const ready = { phase9Receipt, receiptIntegrityPassed: true, readiness, readinessIntegrityPassed: true, approval }
assert.equal(buildAttorneyReleasePhase10Decision(ready).status, 'READY_FOR_GRADUAL_EXPANSION')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, phase9Receipt: null }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, readiness: { ...readiness, maximumExpansionPercent: 100 } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, readiness: { ...readiness, maximumOrganisationsPerStep: 11 } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, readiness: { ...readiness, supportBriefed: false } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, readiness: { ...readiness, propagationGaps: 1 }, readinessIntegrityPassed: false }).status, 'ROLLBACK')
assert.equal(buildAttorneyReleasePhase10Decision({ ...ready, approval: { ...approval, confirmation: 'yes' } }).status, 'BLOCKED')
const checker = readFileSync(new URL('./check-attorney-release-phase10.mjs', import.meta.url), 'utf8')
for (const token of ['productionMutated: false', 'cohortExpanded: false', 'deploymentChanged: false', 'rollbackPerformed: false', 'automaticExpansion: false']) assert.match(checker, new RegExp(token.replace(': ', ':\\s*')))
assert.doesNotMatch(checker, /vercel (deploy|promote|rollback)/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney release Phase 10 steady-state expansion gate passed.')
