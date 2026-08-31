import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  RENTAL_PROPERTY24_VETTING_FIXTURE,
  RENTAL_PROPERTY24_VETTING_PHASE0_VERSION,
  buildRentalProperty24VettingPhase0Pack,
  formatRentalProperty24VettingPhase0Markdown,
} from '../the-it-guy/src/services/rentals/rentalProperty24VettingPhase0Model.js'

const pack = buildRentalProperty24VettingPhase0Pack()
assert.equal(pack.version, RENTAL_PROPERTY24_VETTING_PHASE0_VERSION)
assert.equal(pack.status, 'READY_FOR_CONTROLLED_VETTING')
assert.equal(pack.fixture.id, RENTAL_PROPERTY24_VETTING_FIXTURE.id)
assert.equal(pack.fixture.mustNotBeSubmitted, true)
assert.equal(pack.readiness.percent, 100)
assert.equal(pack.handoff.canPrepare, true)
assert.equal(pack.handoff.liveWriteEnabled, false)
assert.equal(pack.handoff.requiresBackendPublisher, true)
assert.equal(pack.demoSteps.length, 5)
assert.ok(pack.outOfScope.includes('Live Property24 rental submission'))
assert.match(formatRentalProperty24VettingPhase0Markdown(pack), /Live submit: disabled/)

const repoRoot = process.cwd()
const script = path.join(repoRoot, 'scripts', 'report-rental-property24-vetting-phase0.mjs')
const result = spawnSync(process.execPath, [script, '--json'], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr || result.stdout)
const reported = JSON.parse(result.stdout)
assert.equal(reported.status, 'READY_FOR_CONTROLLED_VETTING')
assert.equal(reported.outputs, null)

console.log('rental Property24 vetting Phase 0 tests passed')
