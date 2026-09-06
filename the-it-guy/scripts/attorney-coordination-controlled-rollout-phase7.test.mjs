import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_COORDINATION_PHASE7_CONFIRMATION,
  ATTORNEY_COORDINATION_PHASE7_VERSION,
  ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS,
  buildAttorneyCoordinationPhase7Decision,
} from '../src/services/attorneyCoordinationControlledRolloutPhase7.js'

const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const evidence = { environment: 'staging', codeRevision: 'abc123' }
const evidenceFingerprint = fingerprint(evidence)
const reportCore = { status: 'PASSED', evidenceFingerprint }
const reportFingerprint = fingerprint(reportCore)
const report = { ...reportCore, reportFingerprint }
const chain = { phase6Report: report, phase6ReportFingerprint: reportFingerprint, phase6Evidence: evidence, phase6EvidenceFingerprint: evidenceFingerprint }
assert.equal(buildAttorneyCoordinationPhase7Decision({}).status, 'BLOCKED')
assert.equal(buildAttorneyCoordinationPhase7Decision(chain).status, 'READY_FOR_AUTHORIZATION')

const request = {
  version: ATTORNEY_COORDINATION_PHASE7_VERSION, phase6ReportFingerprint: reportFingerprint, phase6EvidenceFingerprint: evidenceFingerprint,
  codeRevision: 'abc123', stagingProjectRef: 'stage-ref', productionProjectRef: 'prod-ref', organisationIds: ['org-1'],
  featureFlag: 'attorney_coordination_v1', killSwitchVerified: true, migrations: [...ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS],
  authorizedBy: 'Release owner', authorizedAt: '2026-09-06T10:00:00.000Z', changeReference: 'change-1', confirmation: ATTORNEY_COORDINATION_PHASE7_CONFIRMATION,
}
const requestFingerprint = fingerprint(request)
assert.equal(buildAttorneyCoordinationPhase7Decision({ ...chain, request, requestFingerprint }).status, 'AUTHORIZED_TO_EXECUTE')

const receipt = {
  version: ATTORNEY_COORDINATION_PHASE7_VERSION, requestFingerprint, productionProjectRef: 'prod-ref', codeRevision: 'abc123', organisationIds: ['org-1'],
  featureFlag: 'attorney_coordination_v1', featureFlagEnabled: true, killSwitchAvailable: true, appliedMigrations: [...ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS],
  activatedAt: '2026-09-06T11:00:00.000Z', activatedBy: 'Release operator', monitoringEvidence: 'output/monitoring.json',
  roleSmokes: ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].map((role) => ({ role, passed: true, evidence: `output/${role}.json` })),
  destinationSmokes: ['attorney_workspace', 'transaction_sync', 'televent_updates'].map((destination) => ({ destination, passed: true, evidence: `output/${destination}.json` })),
  securityIncidents: 0, visibilityIncidents: 0, unexpectedPermissionAllows: 0, propagationGaps: 0, attributionGaps: 0, productionErrors: 0,
}
assert.equal(buildAttorneyCoordinationPhase7Decision({ ...chain, request, requestFingerprint, receipt, receiptFingerprint: fingerprint(receipt) }).status, 'PILOT_ACTIVE')
const leakage = { ...receipt, visibilityIncidents: 1 }
assert.equal(buildAttorneyCoordinationPhase7Decision({ ...chain, request, requestFingerprint, receipt: leakage, receiptFingerprint: fingerprint(leakage) }).status, 'ROLLBACK')
const widened = { ...request, organisationIds: ['org-1', 'org-2'] }
assert.equal(buildAttorneyCoordinationPhase7Decision({ ...chain, request: widened, requestFingerprint: fingerprint(widened) }).status, 'AUTHORIZATION_INVALID')

const checker = readFileSync(new URL('./check-attorney-coordination-phase7.mjs', import.meta.url), 'utf8')
assert.match(checker, /deploymentPerformed: false/)
assert.match(checker, /featureFlagChanged: false/)
assert.doesNotMatch(checker, /createClient|\.rpc\(|execSync|spawnSync/)
console.log('Attorney coordination controlled pilot Phase 7 gate passed.')
