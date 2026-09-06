import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_COORDINATION_PHASE6_DESTINATIONS,
  ATTORNEY_COORDINATION_PHASE6_SCENARIOS,
  ATTORNEY_COORDINATION_PHASE6_VERSION,
  buildAttorneyCoordinationPhase6Decision,
} from '../src/services/attorneyCoordinationAcceptancePhase6.js'

const schema = { stagingSafe: true, delegationTable: true, delegationAttribution: true, sharedProgressAttribution: true }
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema: {} }).status, 'BLOCKED')
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema }).status, 'READY_TO_RUN')

const evidence = {
  version: ATTORNEY_COORDINATION_PHASE6_VERSION,
  environment: 'staging', transactionId: 'tx-1', codeRevision: 'abc123',
  startedAt: '2026-09-06T08:00:00.000Z', completedAt: '2026-09-06T09:00:00.000Z',
  actors: {
    transfer: { userId: 'user-transfer', firmId: 'firm-transfer' },
    bond: { userId: 'user-bond', firmId: 'firm-bond' },
    cancellation: { userId: 'user-cancellation', firmId: 'firm-cancellation' },
  },
  scenarios: ATTORNEY_COORDINATION_PHASE6_SCENARIOS.map((id) => ({ id, status: 'passed', evidence: `screenshots/${id}.png` })),
  destinations: Object.fromEntries(ATTORNEY_COORDINATION_PHASE6_DESTINATIONS.map((id) => [id, true])),
  attribution: { actualActorPreserved: true, responsibleFirmPreserved: true, delegationIdPreserved: true },
  ui: { desktopPassed: true, mobilePassed: true, keyboardPassed: true }, defects: [],
}
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema, evidence }).status, 'PASSED')
const revokedFailure = structuredClone(evidence)
revokedFailure.scenarios.find((item) => item.id === 'revoked_action_denied').status = 'failed'
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema, evidence: revokedFailure }).status, 'FAILED')
const privacyFailure = structuredClone(evidence)
privacyFailure.scenarios.find((item) => item.id === 'internal_update_hidden_from_clients').evidence = ''
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema, evidence: privacyFailure }).status, 'FAILED')
const actorFailure = structuredClone(evidence)
actorFailure.actors.bond.userId = actorFailure.actors.transfer.userId
assert.equal(buildAttorneyCoordinationPhase6Decision({ schema, evidence: actorFailure }).status, 'FAILED')

const checker = readFileSync(new URL('./check-attorney-coordination-phase6.mjs', import.meta.url), 'utf8')
assert.match(checker, /assertAttorneyStagingTarget/)
assert.match(checker, /productionMutated: false/)
assert.doesNotMatch(checker, /client\.from\([^\n]+\)\.(?:insert|update|delete|upsert)\(|client\.rpc\(/)
console.log('Attorney coordination staging acceptance Phase 6 gate passed.')
