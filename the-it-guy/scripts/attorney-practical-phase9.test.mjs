import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PHASE9_CONFIRMATION, ATTORNEY_PRACTICAL_PHASE9_VERSION, buildAttorneyPracticalPhase9Decision } from '../src/services/attorneyPracticalExpansionPlanPhase9.js'

const contract = JSON.parse(readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url), 'utf8'))
const phase8EvidenceFingerprint = 'phase8-hash'; const phase8Evidence = { phase7ReceiptFingerprint: 'phase7-hash' }; const phase7Receipt = { featureFlag: 'attorney_release', organisationIds: ['org-1', 'org-2'] }
const predecessor = { phase8Report: { status: 'READY_FOR_EXPANSION', expansionReady: true, evidenceFingerprint: phase8EvidenceFingerprint }, phase8Evidence, phase8EvidenceFingerprint, phase7Receipt }
assert.equal(buildAttorneyPracticalPhase9Decision({ contract }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor }).status, 'READY_TO_PLAN')
const wave = (id, sequence, addOrganisationIds) => ({ id, sequence, addOrganisationIds, minimumObservationHours: 24, minimumActions: 30, minimumActionsPerRole: 5, minimumSuccessRate: 0.99, maximumPropagationP95Seconds: 120, requireZeroSafetyIncidents: true, requireAllDestinationsHealthy: true, requireSeparateAuthorization: true })
const plan = { version: ATTORNEY_PRACTICAL_PHASE9_VERSION, phase8EvidenceFingerprint, preparedBy: 'Release manager', preparedAt: '2026-09-08T15:00:00.000Z', changeReference: 'change-2', featureFlag: 'attorney_release', targetingMode: 'organisation_id_allowlist', defaultOff: true, assignmentStable: true, evaluationLogged: true, killSwitchVerified: true, rollbackOwner: 'Operations', rollbackRunbookPath: 'docs/rollback.md', maximumRollbackMinutes: 15, currentOrganisationIds: ['org-1', 'org-2'], waves: [wave('wave-1', 1, ['org-3', 'org-4']), wave('wave-2', 2, ['org-5', 'org-6', 'org-7', 'org-8'])], monitoringOwner: 'Operations', monitoringDashboardPath: 'monitoring/attorney', supportOwner: 'Support', escalationPath: 'runbooks/attorney' }
const planFingerprint = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor, plan, planFingerprint }).status, 'READY_FOR_APPROVAL')
const approval = { planFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-08T15:30:00.000Z', approvalReference: 'release-2', confirmation: ATTORNEY_PRACTICAL_PHASE9_CONFIRMATION }
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor, plan, planFingerprint, approval }).status, 'APPROVED')
const oversized = structuredClone(plan); oversized.waves[0].addOrganisationIds.push('org-5')
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor, plan: oversized, planFingerprint: 'oversized', approval }).status, 'INVALID')
const repeated = structuredClone(plan); repeated.waves[1].addOrganisationIds[0] = 'org-3'
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor, plan: repeated, planFingerprint: 'repeated', approval }).status, 'INVALID')
const earlyApproval = { ...approval, approvedAt: '2026-09-08T14:30:00.000Z' }
assert.equal(buildAttorneyPracticalPhase9Decision({ contract, ...predecessor, plan, planFingerprint, approval: earlyApproval }).status, 'READY_FOR_APPROVAL')
console.log('Attorney practical graduated expansion Phase 9 gate passed.')
