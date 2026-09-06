import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  ATTORNEY_COORDINATION_PHASE8_VERSION,
  buildAttorneyCoordinationPhase8Decision,
} from '../src/services/attorneyCoordinationPilotObservationPhase8.js'

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const receipt = { productionProjectRef: 'prod-ref', featureFlagEnabled: true, killSwitchAvailable: true }
const receiptFingerprint = hash(receipt)
const chain = { phase7Report: { status: 'PILOT_ACTIVE', pilotActive: true, receiptFingerprint }, phase7Receipt: receipt, phase7ReceiptFingerprint: receiptFingerprint }
assert.equal(buildAttorneyCoordinationPhase8Decision({}).status, 'BLOCKED')
assert.equal(buildAttorneyCoordinationPhase8Decision(chain).status, 'OBSERVATION_REQUIRED')

const start = Date.parse('2026-09-06T00:00:00.000Z')
const roles = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']
const actions = roles.flatMap((role, roleIndex) => Array.from({ length: 4 }, (_, index) => ({
  receiptId: `${role}-${index}`, transactionId: 'tx-1', role, status: 'success',
  occurredAt: new Date(start + (roleIndex * 4 + index + 1) * 60 * 60 * 1000).toISOString(),
  propagationLatencySeconds: 20 + index, televentVisible: true, attributionVerified: true,
})))
const healthChecks = Array.from({ length: 24 }, (_, index) => ({ observedAt: new Date(start + (index + 1) * 60 * 60 * 1000).toISOString(), healthy: true }))
const evidence = {
  version: ATTORNEY_COORDINATION_PHASE8_VERSION, environment: 'production', productionProjectRef: 'prod-ref', phase7ReceiptFingerprint: receiptFingerprint,
  observedBy: 'Operations owner', startedAt: new Date(start).toISOString(), completedAt: new Date(start + 24 * 60 * 60 * 1000).toISOString(), monitoringEvidence: 'output/monitoring.json',
  actions, healthChecks,
  controlChecks: ['delegation_grant', 'delegated_action', 'revocation_denial', 'expiry_denial', 'internal_visibility_isolation'].map((id) => ({ id, passed: true, evidence: `output/${id}.json` })),
  securityIncidents: 0, visibilityIncidents: 0, unexpectedPermissionAllows: 0, propagationGaps: 0, attributionGaps: 0, dataIntegrityIncidents: 0, runtimeErrors: 0, defects: [],
}
assert.equal(buildAttorneyCoordinationPhase8Decision({ ...chain, evidence, evidenceFingerprint: hash(evidence) }).status, 'READY_FOR_EXPANSION')
const leak = { ...evidence, visibilityIncidents: 1 }
assert.equal(buildAttorneyCoordinationPhase8Decision({ ...chain, evidence: leak }).status, 'ROLLBACK')
const gap = structuredClone(evidence); gap.healthChecks.splice(4, 2)
assert.equal(buildAttorneyCoordinationPhase8Decision({ ...chain, evidence: gap }).status, 'HOLD')
const slow = structuredClone(evidence); slow.actions.forEach((action) => { action.propagationLatencySeconds = 121 })
assert.equal(buildAttorneyCoordinationPhase8Decision({ ...chain, evidence: slow }).status, 'HOLD')
console.log('Attorney coordination pilot observation Phase 8 gate passed.')
