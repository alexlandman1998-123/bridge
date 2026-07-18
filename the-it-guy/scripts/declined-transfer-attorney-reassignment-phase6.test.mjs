import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const [apiSource, transactionPage, migrationSource, incomingActions, incomingQueue, matterWorkspace, mattersPage] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607170004_attorney_firm_first_reassignment_phase6.sql'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyIncomingMatterInstructionActions.js'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyIncomingMatterQueue.js'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyMatterWorkspace.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyMattersPage.jsx'), 'utf8'),
])

assert.match(apiSource, /export async function reassignDeclinedTransferAttorneyInstruction/)
assert.match(apiSource, /does not have a declined transfer instruction to reassign/)
assert.match(apiSource, /Choose a different transfer attorney firm from the firm that declined/)
assert.match(apiSource, /prepareFirmFirstTransferRoleplayer\(\{/)
assert.match(apiSource, /assignmentStatus:\s*'selected'/)
assert.match(apiSource, /activationTrigger:\s*'appointed_firm_staff_assignment'/)
assert.match(apiSource, /userId:\s*null,[\s\S]*firmFirstAllocation:\s*true/)
assert.match(apiSource, /assigned_attorney_email:\s*null/)
assert.match(apiSource, /status:\s*ATTORNEY_INCOMING_INSTRUCTION_STATUSES\.readyForAcceptance/)
assert.match(apiSource, /selection_source:\s*'agency_recommended'/)
assert.match(apiSource, /eventType:\s*'transfer_attorney_firm_renominated'/)
assert.match(apiSource, /allocationState:\s*'awaiting_firm_acceptance'/)
assert.match(transactionPage, /Replace Declined Transfer Attorney Firm/)
assert.match(transactionPage, /Nominate Replacement Firm/)
assert.match(transactionPage, /transferAttorneyReassignmentRequired/)
assert.match(transactionPage, /firm will allocate its own primary attorney/)
assert.match(migrationSource, /replaces_assignment_id/)
assert.match(migrationSource, /replacement transfer firm must differ/i)
assert.match(migrationSource, /pending firm-only nomination/i)
assert.doesNotMatch(migrationSource, /delete from|drop table|drop column/i)
assert.match(incomingActions, /p_action:\s*'accept'/)
assert.match(incomingActions, /firmAccepted:\s*true/)
assert.match(incomingActions, /p_action:\s*'decline'/)
assert.match(incomingActions, /firmDeclined:\s*true/)
assert.match(incomingQueue, /Firm accepted\. Assign an internal primary transfer attorney\./)
assert.match(matterWorkspace, /firmAcceptanceStatus:\s*row\.firmAcceptanceStatus/)
assert.match(mattersPage, /row\.firmAcceptanceStatus === 'accepted'/)

console.log('Firm-first declined transfer attorney reassignment Phase 6 checks passed.')
