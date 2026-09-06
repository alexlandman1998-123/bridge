import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF } from '../src/services/attorneyPracticalReleaseCandidatePhase6.js'
import { ATTORNEY_PRACTICAL_PHASE8_VERSION, buildAttorneyPracticalPhase8Decision } from '../src/services/attorneyPracticalPilotObservationPhase8.js'

const contract = JSON.parse(readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url), 'utf8'))
const phase7ReceiptFingerprint = 'phase7-hash'; const phase7Receipt = { productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, deploymentId: 'deploy-1' }
const predecessor = { phase7Report: { status: 'PILOT_ACTIVE', pilotActive: true, receiptFingerprint: phase7ReceiptFingerprint }, phase7Receipt, phase7ReceiptFingerprint }
assert.equal(buildAttorneyPracticalPhase8Decision({ contract }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase8Decision({ contract, ...predecessor }).status, 'OBSERVATION_REQUIRED')
const startedAt = '2026-09-07T14:00:00.000Z'; const completedAt = '2026-09-08T14:00:00.000Z'; const roles = Object.keys(contract.roles)
const actions = Array.from({ length: 30 }, (_, index) => { const role = roles[index % roles.length]; const action = contract.roles[role][index % contract.roles[role].length]; return { receiptId: `receipt-${index}`, matterId: `matter-${index % 6}`, role, action, authenticated: true, status: 'success', completedAt: new Date(Date.parse(startedAt) + (index + 1) * 45 * 60000).toISOString(), ...(action === 'open_assigned_matter' ? {} : { propagationLatencySeconds: 45 }) } })
const evidence = { version: ATTORNEY_PRACTICAL_PHASE8_VERSION, environment: 'production', productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, phase7ReceiptFingerprint, observedBy: 'Operations', startedAt, completedAt, monitoringDashboardPath: 'monitoring/pilot', actions, healthChecks: Array.from({ length: 25 }, (_, index) => ({ observedAt: new Date(Date.parse(startedAt) + index * 60 * 60000).toISOString(), healthy: true })), runtimeLogScan: { boundedQuery: true, evidencePath: 'output/logs.ndjson', queriedAt: completedAt, deploymentId: 'deploy-1', errorCount: 0, http5xxCount: 0, timeoutCount: 0 }, webVitals: { lcpP75Ms: 2200, inpP75Ms: 180, clsP75: 0.08, evidencePath: 'output/vitals.json' }, destinationHealth: contract.destinations.map((destination) => ({ destination, healthy: true, evidencePath: `output/${destination}.json` })), browserCheckpoints: roles.flatMap((role) => contract.viewports.map((viewport) => ({ role, viewport, passed: true, evidencePath: `output/${role}-${viewport}.png` }))), securityIncidents: 0, visibilityIncidents: 0, dataIntegrityIncidents: 0, propagationGaps: 0, unexpectedPermissionAllows: 0, supportTickets: [] }
assert.equal(buildAttorneyPracticalPhase8Decision({ contract, ...predecessor, evidence, evidenceFingerprint: 'phase8-hash' }).status, 'READY_FOR_EXPANSION')
const errors = structuredClone(evidence); errors.runtimeLogScan.http5xxCount = 1
assert.equal(buildAttorneyPracticalPhase8Decision({ contract, ...predecessor, evidence: errors }).status, 'HOLD')
const leak = structuredClone(evidence); leak.unexpectedPermissionAllows = 1
assert.equal(buildAttorneyPracticalPhase8Decision({ contract, ...predecessor, evidence: leak }).status, 'ROLLBACK')
const slow = structuredClone(evidence); slow.webVitals.inpP75Ms = 250
assert.equal(buildAttorneyPracticalPhase8Decision({ contract, ...predecessor, evidence: slow }).status, 'HOLD')
console.log('Attorney practical pilot observation Phase 8 gate passed.')
