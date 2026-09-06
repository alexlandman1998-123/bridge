import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  ATTORNEY_COORDINATION_PHASE10_GA_CONFIRMATION,
  ATTORNEY_COORDINATION_PHASE10_VERSION,
  ATTORNEY_COORDINATION_PHASE10_WAVE_CONFIRMATION,
  buildAttorneyCoordinationPhase10Decision,
} from '../src/services/attorneyCoordinationCloseoutPhase10.js'

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const organisation = { organisationId: 'org-2' }
const plan = { featureFlag: 'attorney_coordination_v1', currentOrganisationIds: ['org-1'], waves: [{ id: 'wave-1', sequence: 1, organisations: [organisation], minimumObservationHours: 24, minimumActionsPerRole: 4, maximumPropagationP95Seconds: 120 }] }
const planFingerprint = hash(plan)
const phase9Approval = { planFingerprint }
const predecessor = { phase9Report: { status: 'APPROVED', expansionAuthorized: true, planFingerprint }, phase9Plan: plan, phase9PlanFingerprint: planFingerprint, phase9Approval }
assert.equal(buildAttorneyCoordinationPhase10Decision({}).status, 'BLOCKED')
assert.equal(buildAttorneyCoordinationPhase10Decision(predecessor).status, 'READY_TO_EXECUTE')
const authorization = { planFingerprint, waveId: 'wave-1', confirmation: ATTORNEY_COORDINATION_PHASE10_WAVE_CONFIRMATION, authorizedBy: 'Owner', authorizedAt: '2026-09-09T00:00:00.000Z', approvalReference: 'wave-1' }
const authorizationFingerprint = hash(authorization)
const roles = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']
const actions = roles.flatMap((role) => Array.from({ length: 4 }, (_, index) => ({ receiptId: `${role}-${index}`, role, status: 'success', authenticated: true, televentVisible: true, attributionVerified: true, propagationLatencySeconds: 30 })))
const observation = { waveId: 'wave-1', planFingerprint, startedAt: '2026-09-09T00:10:00.000Z', completedAt: '2026-09-10T00:10:00.000Z', actions, monitoringEvidence: 'output/monitoring.json', televentHealthy: true, delegationControlsHealthy: true, securityIncidents: 0, visibilityIncidents: 0, unexpectedPermissionAllows: 0, propagationGaps: 0, attributionGaps: 0, dataIntegrityIncidents: 0, runtimeErrors: 0 }
const ledger = { version: ATTORNEY_COORDINATION_PHASE10_VERSION, planFingerprint, executedBy: 'Operator', startedAt: '2026-09-08T23:00:00.000Z', completedAt: '2026-09-10T00:20:00.000Z', waves: [{ waveId: 'wave-1', authorization, authorizationFingerprint, receipt: { waveId: 'wave-1', planFingerprint, authorizationFingerprint, beforeOrganisationIds: ['org-1'], addedOrganisationIds: ['org-2'], afterOrganisationIds: ['org-1', 'org-2'], featureFlag: 'attorney_coordination_v1', defaultOff: true, evaluationLogged: true, killSwitchAvailable: true, providerReceiptId: 'provider-1', changedBy: 'Operator', changedAt: '2026-09-09T00:05:00.000Z' }, observation }], finalOrganisationIds: ['org-1', 'org-2'], targetPopulationCovered: true, targetPopulationEvidence: 'output/population.json', orphanActiveDelegations: 0, delegationRegisterReviewed: true, monitoringActive: true, supportHandoffComplete: true, securityOwnershipComplete: true, dataOwnershipComplete: true, rollbackStillAvailable: true, flagStillDefaultOff: true }
const ledgerFingerprint = hash(ledger)
const waveFingerprints = { 'wave-1': authorizationFingerprint }
assert.equal(buildAttorneyCoordinationPhase10Decision({ ...predecessor, ledger, ledgerFingerprint, authorizationFingerprints: waveFingerprints }).status, 'READY_FOR_STEADY_STATE_APPROVAL')
const approval = { ledgerFingerprint, approvedBy: 'Accountable owner', approvedAt: '2026-09-10T01:00:00.000Z', approvalReference: 'ga-1', confirmation: ATTORNEY_COORDINATION_PHASE10_GA_CONFIRMATION }
assert.equal(buildAttorneyCoordinationPhase10Decision({ ...predecessor, ledger, ledgerFingerprint, authorizationFingerprints: waveFingerprints, approval }).status, 'STEADY_STATE_APPROVED')
const orphaned = { ...ledger, orphanActiveDelegations: 1 }
assert.equal(buildAttorneyCoordinationPhase10Decision({ ...predecessor, ledger: orphaned, ledgerFingerprint: hash(orphaned), authorizationFingerprints: waveFingerprints, approval }).status, 'ROLLBACK')
const drift = structuredClone(ledger); drift.waves[0].receipt.afterOrganisationIds.push('org-unknown')
assert.equal(buildAttorneyCoordinationPhase10Decision({ ...predecessor, ledger: drift, ledgerFingerprint: hash(drift), authorizationFingerprints: waveFingerprints }).status, 'ROLLBACK')
console.log('Attorney coordination expansion closeout Phase 10 gate passed.')
