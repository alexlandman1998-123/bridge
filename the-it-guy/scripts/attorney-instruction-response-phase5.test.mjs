import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [actionsSource, apiSource, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/services/attorneyIncomingMatterInstructionActions.js'), 'utf8'),
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140013_attorney_instruction_response_phase5.sql'), 'utf8'),
])

assert.match(actionsSource, /syncTransferInstructionDecisionLifecycle/)
assert.match(actionsSource, /allocation_status:\s*'converted'/)
assert.match(actionsSource, /allocation_status:\s*'withdrawn'/)
assert.match(actionsSource, /status:\s*'removed'/)
assert.match(apiSource, /title:\s*'Transfer instruction accepted'/)
assert.match(apiSource, /title:\s*'Transfer attorney reassignment required'/)
assert.match(migrationSource, /bridge_sync_transfer_instruction_decision/)
assert.match(migrationSource, /new\.instruction_status = 'accepted'/)
assert.match(migrationSource, /allocation_status = 'converted'/)
assert.match(migrationSource, /allocation_status = 'withdrawn'/)

console.log('Attorney instruction response Phase 5 checks passed.')

