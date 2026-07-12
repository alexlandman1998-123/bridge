#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionAvailabilitySource = readProjectFile('server/services/workflowActionAvailabilityService.js')
const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const workflowActionTestSource = readProjectFile('server/tests/workflowActionService.test.js')
const packageJson = readProjectFile('package.json')

for (const [actionKey, stepKey] of [
  ['RECORD_AGENT_ASSISTED_BUYER_ONBOARDING', 'buyer_onboarding_complete'],
  ['RECORD_AGENT_ASSISTED_SELLER_ONBOARDING', 'seller_onboarding_complete'],
]) {
  assert.match(
    actionAvailabilitySource,
    new RegExp(`${actionKey}:\\s*\\{[\\s\\S]*workflowKey:\\s*'sales_otp'[\\s\\S]*stepKey:\\s*'${stepKey}'[\\s\\S]*actionContext:\\s*'agent_assisted_onboarding'`),
    `${actionKey} should be a first-class agent-assisted onboarding workflow action.`,
  )
}

assert.match(
  actionServiceSource,
  /RECORD_AGENT_ASSISTED_BUYER_ONBOARDING[\s\S]*onboarding_status:[\s\S]*'awaiting_signed_otp'[\s\S]*onboarding_completed_at[\s\S]*external_onboarding_submitted_at/,
  'Agent-assisted buyer onboarding should update buyer onboarding compatibility fields.',
)

assert.match(
  actionServiceSource,
  /RECORD_AGENT_ASSISTED_SELLER_ONBOARDING[\s\S]*seller_onboarding_status:[\s\S]*'approved'/,
  'Agent-assisted seller onboarding should update seller onboarding compatibility fields.',
)

assert.match(
  workflowActionTestSource,
  /RECORD_AGENT_ASSISTED_BUYER_ONBOARDING[\s\S]*evidence_id === 'RECORD_AGENT_ASSISTED_BUYER_ONBOARDING'[\s\S]*evidence_type,\s*'event'/,
  'Agent-assisted buyer onboarding should be covered as event evidence, not manual override evidence.',
)

assert.match(
  workflowActionTestSource,
  /RECORD_AGENT_ASSISTED_SELLER_ONBOARDING[\s\S]*evidence_id === 'RECORD_AGENT_ASSISTED_SELLER_ONBOARDING'[\s\S]*evidence_type,\s*'event'/,
  'Agent-assisted seller onboarding should be covered as event evidence, not manual override evidence.',
)

assert.match(
  packageJson,
  /"test:workflow-agent-assisted-onboarding-phase6":\s*"node scripts\/workflow-agent-assisted-onboarding-phase6\.test\.mjs"/,
  'package.json should expose the Phase 6 agent-assisted onboarding regression test.',
)

console.log('workflow agent-assisted onboarding Phase 6 tests passed')
