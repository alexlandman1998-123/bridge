import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [apiSource, transactionPage, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140014_declined_transfer_attorney_reassignment_phase6.sql'), 'utf8'),
])

assert.match(apiSource, /export async function reassignDeclinedTransferAttorneyInstruction/)
assert.match(apiSource, /does not have a declined transfer instruction to reassign/)
assert.match(apiSource, /Choose a different transfer attorney from the firm that declined/)
assert.match(apiSource, /assignmentStatus:\s*selection\.assignmentStatus/)
assert.match(apiSource, /activationTrigger:\s*selection\.activationTrigger/)
assert.match(apiSource, /status:\s*ATTORNEY_INCOMING_INSTRUCTION_STATUSES\.readyForAcceptance/)
assert.match(apiSource, /selection_source:\s*'agency_recommended'/)
assert.match(apiSource, /eventType:\s*'transfer_attorney_reassigned'/)
assert.match(transactionPage, /Replace Declined Transfer Attorney/)
assert.match(transactionPage, /Issue Replacement Instruction/)
assert.match(transactionPage, /transferAttorneyReassignmentRequired/)
assert.match(migrationSource, /agent_reassignment/)

console.log('Declined transfer attorney reassignment Phase 6 checks passed.')

