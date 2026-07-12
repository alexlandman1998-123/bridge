#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  ATTORNEY_WORKFLOW_AUTOMATION_STATUSES,
  ATTORNEY_WORKFLOW_BLOCKER_TYPES,
  ATTORNEY_WORKFLOW_LAUNCH_CONTRACT_VERSION,
  ATTORNEY_WORKFLOW_PERMISSION_CONTRACT,
  ATTORNEY_WORKFLOW_PHASE0_SCENARIOS,
  ATTORNEY_WORKFLOW_REQUIRED_LANES,
  getAttorneyWorkflowPhaseTicketMap,
  listAttorneyWorkflowLaunchScenarios,
} from '../src/core/attorney/attorneyWorkflowLaunchContract.js'
import { LEGAL_SCENARIO_STATUSES, resolveLegalMatterSupport } from '../src/core/legal/legalScenarioMatrix.js'
import { resolveLegalDocumentRequirements } from '../src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { resolveAttorneyLanes } from '../src/services/attorneyWorkflow/attorneyWorkflowResolver.js'
import { resolveTransactionFacts } from '../src/services/attorneyWorkflow/transactionFactsResolver.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function keys(items = []) {
  return new Set(items.map((item) => item.id || item.key || item.attorneyRole || item.role).filter(Boolean))
}

function requiredRolesFromLanes(lanes = {}) {
  return Object.values(lanes)
    .filter((lane) => lane?.role && lane.required)
    .map((lane) => lane.role)
}

function assertSetIncludes(actualValues, expectedValues, label) {
  const actual = new Set(actualValues)
  for (const expected of expectedValues) {
    assert.equal(actual.has(expected), true, `${label}: expected ${expected}`)
  }
}

function expectedLegalStatusForScenario(scenario) {
  if (scenario.automationStatus === ATTORNEY_WORKFLOW_AUTOMATION_STATUSES.automated) return LEGAL_SCENARIO_STATUSES.supported
  if (scenario.automationStatus === ATTORNEY_WORKFLOW_AUTOMATION_STATUSES.manualReview) return LEGAL_SCENARIO_STATUSES.manualReview
  return LEGAL_SCENARIO_STATUSES.unsupported
}

assert.equal(ATTORNEY_WORKFLOW_LAUNCH_CONTRACT_VERSION, 'attorney_workflow_launch_contract_v1')
assert.equal(listAttorneyWorkflowLaunchScenarios().length, ATTORNEY_WORKFLOW_PHASE0_SCENARIOS.length)
assert.equal(listAttorneyWorkflowLaunchScenarios({ automationStatus: ATTORNEY_WORKFLOW_AUTOMATION_STATUSES.automated }).length >= 5, true)
assert.equal(listAttorneyWorkflowLaunchScenarios({ automationStatus: ATTORNEY_WORKFLOW_AUTOMATION_STATUSES.manualReview }).length >= 3, true)
assert.equal(listAttorneyWorkflowLaunchScenarios({ automationStatus: ATTORNEY_WORKFLOW_AUTOMATION_STATUSES.unsupported }).length >= 1, true)

assertSetIncludes(keys(ATTORNEY_WORKFLOW_REQUIRED_LANES), ['transfer', 'bond', 'cancellation'], 'lane contract')
assertSetIncludes(keys(ATTORNEY_WORKFLOW_BLOCKER_TYPES), [
  'missing_assignment',
  'missing_document',
  'rejected_document',
  'unsigned_document',
  'inactive_matter',
  'manual_blocker',
  'missing_data',
], 'blocker contract')
assertSetIncludes(keys(ATTORNEY_WORKFLOW_PERMISSION_CONTRACT), ['transfer_lane_scope', 'bond_lane_scope', 'cancellation_lane_scope'], 'permission contract')

const scenarioKeys = new Set()
for (const scenario of ATTORNEY_WORKFLOW_PHASE0_SCENARIOS) {
  assert.equal(Boolean(scenario.key), true, 'scenario key is required')
  assert.equal(scenarioKeys.has(scenario.key), false, `duplicate scenario key ${scenario.key}`)
  scenarioKeys.add(scenario.key)

  assert.equal(Boolean(scenario.title), true, `${scenario.key}: title is required`)
  assert.equal(Object.values(ATTORNEY_WORKFLOW_AUTOMATION_STATUSES).includes(scenario.automationStatus), true, `${scenario.key}: invalid automation status`)
  assert.equal(scenario.expectedRoles.length > 0, true, `${scenario.key}: expected roles required`)
  assert.equal(scenario.requiredBlockers.length > 0, true, `${scenario.key}: required blockers required`)
  assert.equal(scenario.nextActions.length > 0, true, `${scenario.key}: next actions required`)
  assert.equal(scenario.uiSurfaces.includes('AttorneyTransactionDetail'), true, `${scenario.key}: AttorneyTransactionDetail must be a recovery surface`)

  const facts = resolveTransactionFacts(scenario.transaction)
  const lanes = resolveAttorneyLanes(facts)
  const requiredRoles = requiredRolesFromLanes(lanes)
  assert.deepEqual(requiredRoles.sort(), [...scenario.expectedRoles].sort(), `${scenario.key}: required attorney roles`)

  const documentResult = resolveLegalDocumentRequirements(facts)
  assertSetIncludes(documentResult.requirements.map((item) => item.id), scenario.expectedDocuments, `${scenario.key}: document requirements`)
  assertSetIncludes(documentResult.signingRequirements.map((item) => item.id), scenario.expectedSigningRequirements, `${scenario.key}: signing requirements`)
  assertSetIncludes(facts.missingFields || [], scenario.expectedMissingFields, `${scenario.key}: missing fields`)

  const support = resolveLegalMatterSupport(scenario.legalMatterSupport)
  assert.equal(support.status, expectedLegalStatusForScenario(scenario), `${scenario.key}: legal support status`)
}

const ticketMap = getAttorneyWorkflowPhaseTicketMap()
for (const phase of ['queue_action_wiring', 'lane_permission_lock', 'launch_gate_cleanup', 'staging_multi_firm_smoke', 'signing_workflow', 'person_level_requirement_ux', 'actionable_blockers', 'exceptional_legal_scenarios', 'pilot_metrics']) {
  assert.equal(Array.isArray(ticketMap[phase]) && ticketMap[phase].length > 0, true, `phase ticket map should include ${phase}`)
}

const auditDoc = readProjectFile('docs/audits/attorney-workflow-contract-phase0.md')
for (const pattern of [
  /# Attorney Workflow Contract Phase 0/,
  /Phase 0 is a contract-lock implementation/,
  /## Scenario Matrix/,
  /## Lane Contract/,
  /## Blocker And Recovery Contract/,
  /## Permission Contract/,
  /## Manual Review And Unsupported Boundary/,
  /## P0 Implementation Map/,
  /## P1 Implementation Map/,
  /## Phase 0 Acceptance/,
]) {
  assert.match(auditDoc, pattern)
}

const packageJson = readProjectFile('package.json')
assert.match(packageJson, /"test:attorney-workflow-phase0-contract":\s*"node scripts\/attorney-workflow-contract-phase0\.test\.mjs"/)
assert.match(packageJson, /"verify:attorney-workflow-phase0-contract":\s*"node scripts\/attorney-workflow-contract-phase0\.test\.mjs"/)

const launchReadiness = readProjectFile('docs/phase-8-launch-readiness.md')
assert.match(launchReadiness, /Attorney workflow contract Phase 0: `docs\/audits\/attorney-workflow-contract-phase0\.md`/)
assert.match(launchReadiness, /npm run verify:attorney-workflow-phase0-contract/)

console.log('attorney workflow contract Phase 0 tests passed')
