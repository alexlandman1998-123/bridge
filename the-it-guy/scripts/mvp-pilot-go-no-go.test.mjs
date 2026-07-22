import assert from 'node:assert/strict'
import { evaluateMvpPilotGoNoGo } from '../src/core/transactions/mvpPilotGoNoGo.js'

const green = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'go_for_controlled_pilot' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2 },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
  evidencePath: 'evidence/staging.json',
})
assert.equal(green.decision, 'ready_for_controlled_exposure')
assert.equal(green.batchLimit, 2)

const held = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: true },
  pilotSession: { decision: 'no_go' },
  batchDryRun: { passed: true, batchSize: 2, batchLimit: 2 },
  exposureReadiness: { decision: 'ready_for_controlled_exposure' },
})
assert.equal(held.decision, 'do_not_expose')
assert.ok(held.blockers.includes('pilot_session_not_open'))
assert.ok(held.blockers.includes('staging_evidence_required'))

console.log('mvp-pilot-go-no-go: passed')
