import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  AGENT_TRANSACTION_STAGE_OPTIONS,
  CANONICAL_TRANSACTION_STAGES,
  getMainStageFromDetailedStage,
  normalizeTransactionStage,
} from '../src/lib/stages.js'
import { normalizeDetailedStage } from '../src/core/workflows/workflowConstants.js'

const expectedAgentStages = [
  ['Offer Accepted', 'DEP'],
  ['Deposit', 'OTP'],
  ['Finance', 'FIN'],
  ['Transfer', 'XFER'],
  ['Registration', 'REG'],
]

assert.deepEqual(
  AGENT_TRANSACTION_STAGE_OPTIONS,
  expectedAgentStages.map(([stage]) => stage),
)

for (const [stage, mainStage] of expectedAgentStages) {
  assert.equal(normalizeTransactionStage(stage.toLowerCase()), stage)
  assert.equal(normalizeDetailedStage(stage), stage)
  assert.equal(getMainStageFromDetailedStage(stage), mainStage)
}

assert.equal(normalizeTransactionStage('Offer_Accepted'), 'Offer Accepted')
assert.equal(normalizeTransactionStage('Finance In Progress'), 'Finance')
assert.equal(normalizeTransactionStage('Transfer In Progress'), 'Transfer in Progress')
assert.equal(normalizeTransactionStage('not-a-real-stage'), null)
assert.equal(normalizeTransactionStage('not-a-real-stage', 'also-not-real'), null)

const migrationUrl = new URL(
  '../../supabase/migrations/20260831105623_align_agent_transaction_stages.sql',
  import.meta.url,
)
const migration = await readFile(fileURLToPath(migrationUrl), 'utf8')
const sqlCanonicalStages = new Set(
  [...migration.matchAll(/then\s+'([^']+)'/gi)].map((match) => match[1]),
)

for (const stage of CANONICAL_TRANSACTION_STAGES) {
  assert.ok(sqlCanonicalStages.has(stage), `SQL mapper is missing canonical stage: ${stage}`)
}

assert.match(
  migration,
  /update public\.transactions\s+set stage = public\.bridge_normalize_transaction_stage\(stage\)/i,
)
assert.match(
  migration,
  /constraint transactions_stage_check[\s\S]+stage = public\.bridge_normalize_transaction_stage\(stage\)/i,
)
assert.match(
  migration,
  /bridge_normalize_transaction_stage\(stage\) is not null[\s\S]+stage = public\.bridge_normalize_transaction_stage\(stage\)/i,
)

console.log('agent transaction stage alignment tests passed')
