import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PHASE5_VERSION, buildAttorneyPracticalPhase5Decision, calculatePercentile } from '../src/services/attorneyPracticalSoakPhase5.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url)); const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const phase4EvidenceFingerprint = 'phase4-hash'; const phase4Evidence = { contractFingerprint }
const predecessor = { phase4Report: { status: 'PASSED', evidenceFingerprint: phase4EvidenceFingerprint }, phase4Evidence, phase4EvidenceFingerprint }
assert.equal(calculatePercentile([1, 2, 3, 100], 0.95), 100)
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor }).status, 'READY_TO_RUN')
const startedAt = '2026-09-06T00:00:00.000Z'; const completedAt = '2026-09-07T00:00:00.000Z'
const roles = Object.keys(contract.roles)
const actions = Array.from({ length: 30 }, (_, index) => {
  const role = roles[index % roles.length]; const action = contract.roles[role][index % contract.roles[role].length]
  return { receiptId: `receipt-${index}`, matterId: `matter-${index % 6}`, role, action, authenticated: true, status: 'success', completedAt: new Date(Date.parse(startedAt) + (index + 1) * 45 * 60000).toISOString(), ...(action === 'open_assigned_matter' ? {} : { propagationLatencySeconds: 60 }) }
})
const evidence = { version: ATTORNEY_PRACTICAL_PHASE5_VERSION, environment: 'staging', contractFingerprint, phase4EvidenceFingerprint, executedBy: 'Soak owner', startedAt, completedAt, deploymentReference: 'staging-deploy-1', actions, healthChecks: Array.from({ length: 25 }, (_, index) => ({ observedAt: new Date(Date.parse(startedAt) + index * 60 * 60000).toISOString(), healthy: true })), destinationChecks: contract.destinations.map((destination) => ({ destination, healthy: true, evidencePath: `output/${destination}.json` })), securityIncidents: 0, visibilityIncidents: 0, dataIntegrityIncidents: 0, propagationGaps: 0, incidents: [] }
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor, evidence, evidenceFingerprint: 'phase5-hash' }).status, 'STABILIZED')
const short = structuredClone(evidence); short.completedAt = '2026-09-06T12:00:00.000Z'; short.actions = short.actions.filter(({ completedAt: time }) => Date.parse(time) <= Date.parse(short.completedAt)); short.healthChecks = short.healthChecks.filter(({ observedAt }) => Date.parse(observedAt) <= Date.parse(short.completedAt))
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor, evidence: short }).status, 'HOLD')
const incident = structuredClone(evidence); incident.visibilityIncidents = 1
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor, evidence: incident }).status, 'ROLLBACK')
const slow = structuredClone(evidence); slow.actions.filter(({ action }) => action !== 'open_assigned_matter').forEach((action) => { action.propagationLatencySeconds = 121 })
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor, evidence: slow }).status, 'HOLD')
const incomplete = structuredClone(evidence); delete incomplete.securityIncidents
assert.equal(buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint, ...predecessor, evidence: incomplete }).status, 'HOLD')
console.log('Attorney practical staging soak Phase 5 gate passed.')
