#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const unitDetailSource = readProjectFile('src/pages/UnitDetail.jsx')
const attorneyDetailSource = readProjectFile('src/pages/AttorneyTransactionDetail.jsx')
const packageJson = readProjectFile('package.json')

for (const source of [unitDetailSource, attorneyDetailSource]) {
  assert.match(
    source,
    /AGENT_ASSISTED_ROLLUP_ACTION_KEYS[\s\S]*record_agent_assisted_buyer_onboarding[\s\S]*record_agent_assisted_seller_onboarding[\s\S]*record_agent_assisted_supporting_docs/,
    'Agent transaction headers should allow agent-assisted workflow actions from the rollup.',
  )
  assert.match(
    source,
    /function buildAgentWorkflowActionPayload[\s\S]*agent_assisted_onboarding[\s\S]*completionMode:\s*'agent_assisted_completed'[\s\S]*agent_assisted_supporting_docs[\s\S]*captureMethod:\s*'offline_verified'/,
    'Agent-assisted UI actions should send explicit audit payloads.',
  )
  assert.match(
    source,
    /payload:\s*buildAgentWorkflowActionPayload/,
    'Generic rollup workflow action handlers should use the agent-assisted payload builder.',
  )
}

assert.match(
  unitDetailSource,
  /addRollupWorkflowAction\('RECORD_AGENT_ASSISTED_BUYER_ONBOARDING',\s*'Record Buyer Assisted'\)/,
  'Unit Detail sales lane should expose buyer assisted onboarding completion.',
)
assert.match(
  unitDetailSource,
  /addRollupWorkflowAction\('RECORD_AGENT_ASSISTED_SELLER_ONBOARDING',\s*'Record Seller Assisted'\)/,
  'Unit Detail sales lane should expose seller assisted onboarding completion.',
)
assert.match(
  unitDetailSource,
  /addRollupWorkflowAction\('RECORD_AGENT_ASSISTED_SUPPORTING_DOCS',\s*'Record Docs Verified Offline',\s*\{\s*variant:\s*'primary'\s*\}\)/,
  'Unit Detail sales lane should expose offline supporting docs verification.',
)

assert.match(
  packageJson,
  /"test:workflow-agent-ui-actions-phase9":\s*"node scripts\/workflow-agent-ui-actions-phase9\.test\.mjs"/,
  'package.json should expose the Phase 9 agent UI action regression test.',
)

console.log('workflow agent UI actions Phase 9 tests passed')
