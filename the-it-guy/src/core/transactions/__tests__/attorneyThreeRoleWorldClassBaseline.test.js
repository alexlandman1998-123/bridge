import assert from 'node:assert/strict'
import {
  ATTORNEY_THREE_ROLE_PILOT_FIXTURES,
  ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS,
  ATTORNEY_THREE_ROLE_SCENARIOS,
  ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES,
  buildAttorneyThreeRoleBaselineReport,
} from '../attorneyThreeRoleWorldClassBaseline.js'
import { LEGAL_ROLE_AUTHORITY_MATRIX, LEGAL_ROLE_TYPES } from '../legalRoleCoordinationContract.js'

const roles = Object.values(LEGAL_ROLE_TYPES)
assert.deepEqual(Object.keys(ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES).sort(), roles.sort())

for (const role of roles) {
  const responsibility = ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES[role]
  const authority = LEGAL_ROLE_AUTHORITY_MATRIX[role]
  assert.ok(responsibility.valueProposition)
  assert.ok(responsibility.owns.length >= 5)
  assert.ok(responsibility.evidence.length >= 4)
  assert.deepEqual(responsibility.appointmentAuthority, authority.appointmentAuthorities)
  assert.deepEqual(responsibility.formalInstructors, authority.formalInstructors)
}

const report = buildAttorneyThreeRoleBaselineReport()
assert.equal(report.failedScenarios.length, 0, JSON.stringify(report.failedScenarios, null, 2))
assert.ok(report.scenarioCount >= 10)
assert.ok(report.exceptionScenarioCount >= 4)
assert.ok(ATTORNEY_THREE_ROLE_SCENARIOS.some((item) => item.expectedRoles.length === 3))
assert.ok(ATTORNEY_THREE_ROLE_SCENARIOS.some((item) => item.expectedMissingFields.includes('finance_type')))

for (const fixture of ATTORNEY_THREE_ROLE_PILOT_FIXTURES) {
  const scenario = ATTORNEY_THREE_ROLE_SCENARIOS.find((item) => item.id === fixture.scenarioId)
  assert.ok(scenario, `${fixture.id}: scenario must exist`)
  assert.deepEqual(Object.keys(fixture.firmIds).sort(), [...scenario.expectedRoles].sort())
  assert.deepEqual(Object.keys(fixture.userIds).sort(), [...scenario.expectedRoles].sort())
  assert.equal(new Set(Object.values(fixture.firmIds)).size, scenario.expectedRoles.length)
  assert.equal(new Set(Object.values(fixture.userIds)).size, scenario.expectedRoles.length)
}

assert.deepEqual(
  ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS.map((item) => item.id).sort(),
  ['live_assignment_coverage_incomplete'],
)
assert.ok(ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS.every((item) => item.exitEvidence && item.targetPhase > 0))

console.log(`Attorney three-role Phase 0 baseline passed (${report.scenarioCount} scenarios, ${report.pilotFixtureCount} pilots).`)
