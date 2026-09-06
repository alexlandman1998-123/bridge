import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  ATTORNEY_COORDINATION_PHASE9_CONFIRMATION,
  ATTORNEY_COORDINATION_PHASE9_VERSION,
  buildAttorneyCoordinationPhase9Decision,
} from '../src/services/attorneyCoordinationExpansionPhase9.js'

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const phase8Evidence = { phase7ReceiptFingerprint: 'receipt-hash' }
const evidenceFingerprint = hash(phase8Evidence)
const phase7Receipt = { featureFlag: 'attorney_coordination_v1', featureFlagEnabled: true, killSwitchAvailable: true, organisationIds: ['org-1'] }
const predecessor = { phase8Report: { status: 'READY_FOR_EXPANSION', expansionReady: true, evidenceFingerprint }, phase8Evidence, phase8EvidenceFingerprint: evidenceFingerprint, phase7Receipt }
assert.equal(buildAttorneyCoordinationPhase9Decision({}).status, 'BLOCKED')
assert.equal(buildAttorneyCoordinationPhase9Decision(predecessor).status, 'READY_TO_PLAN')
const organisation = (id) => ({ organisationId: id, transferAttorneyReady: true, bondAttorneyReady: true, cancellationAttorneyReady: true, supportReady: true, readinessEvidence: `output/${id}.json` })
const wave = (id, sequence, organisations) => ({ id, sequence, organisations, minimumObservationHours: 24, minimumActionsPerRole: 4, maximumPropagationP95Seconds: 120, requireZeroSafetyIncidents: true, requireTeleventParity: true, requireAttributionIntegrity: true, requireSeparateAuthorization: true })
const plan = {
  version: ATTORNEY_COORDINATION_PHASE9_VERSION, phase8EvidenceFingerprint: evidenceFingerprint, preparedBy: 'Release manager', preparedAt: '2026-09-08T10:00:00.000Z', changeReference: 'change-9',
  featureFlag: 'attorney_coordination_v1', targetingMode: 'organisation_id_allowlist', defaultOff: true, evaluationLogged: true,
  killSwitchVerified: true, rollbackOwner: 'Operations', rollbackRunbook: 'docs/rollback.md', maximumRollbackMinutes: 15,
  currentOrganisationIds: ['org-1'], waves: [wave('wave-1', 1, [organisation('org-2')]), wave('wave-2', 2, [organisation('org-3'), organisation('org-4')])],
  monitoringOwner: 'Operations', monitoringEvidencePath: 'output/monitoring.json', supportOwner: 'Support', escalationPath: 'runbooks/attorney.md',
}
const planFingerprint = hash(plan)
assert.equal(buildAttorneyCoordinationPhase9Decision({ ...predecessor, plan, planFingerprint }).status, 'READY_FOR_APPROVAL')
const approval = { planFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-08T11:00:00.000Z', approvalReference: 'approval-9', confirmation: ATTORNEY_COORDINATION_PHASE9_CONFIRMATION }
assert.equal(buildAttorneyCoordinationPhase9Decision({ ...predecessor, plan, planFingerprint, approval }).status, 'APPROVED')
const oversized = structuredClone(plan); oversized.waves[0].organisations.push(organisation('org-3'))
assert.equal(buildAttorneyCoordinationPhase9Decision({ ...predecessor, plan: oversized, planFingerprint: hash(oversized), approval }).status, 'INVALID')
const unready = structuredClone(plan); unready.waves[0].organisations[0].cancellationAttorneyReady = false
assert.equal(buildAttorneyCoordinationPhase9Decision({ ...predecessor, plan: unready, planFingerprint: hash(unready), approval }).status, 'INVALID')
console.log('Attorney coordination graduated expansion Phase 9 gate passed.')
