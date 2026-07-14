import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  shouldActivateAttorneyRoleplayerAtSignedOtp,
  shouldCreateAttorneyAssignmentForSelection,
} from '../src/core/transactions/attorneyInstructionActivation.js'

assert.equal(
  shouldCreateAttorneyAssignmentForSelection({
    roleType: 'transfer_attorney',
    assignmentStatus: 'selected',
    activationTrigger: 'attorney_instruction_stage',
  }),
  false,
  'The mandate attorney must remain staged during buyer onboarding.',
)
assert.equal(
  shouldCreateAttorneyAssignmentForSelection({
    roleType: 'transfer_attorney',
    assignmentStatus: 'active',
    activationTrigger: 'attorney_instruction_stage',
  }),
  true,
  'An activated transfer attorney may create the formal assignment.',
)
assert.equal(
  shouldActivateAttorneyRoleplayerAtSignedOtp(
    { roleType: 'transfer_attorney', assignmentStatus: 'selected' },
    { bondActivationRequested: false },
  ),
  true,
  'Cash transactions must activate the transfer attorney after signed OTP.',
)
assert.equal(
  shouldActivateAttorneyRoleplayerAtSignedOtp(
    { roleType: 'bond_attorney', assignmentStatus: 'selected' },
    { bondActivationRequested: false },
  ),
  false,
  'Cash transactions must not activate a staged bond attorney.',
)
assert.equal(
  shouldActivateAttorneyRoleplayerAtSignedOtp(
    { roleType: 'bond_attorney', assignmentStatus: 'selected' },
    { bondActivationRequested: true },
  ),
  true,
  'Bond transactions may activate the staged bond attorney.',
)
assert.equal(
  shouldActivateAttorneyRoleplayerAtSignedOtp(
    { roleType: 'transfer_attorney', assignmentStatus: 'removed' },
    { bondActivationRequested: true },
  ),
  false,
  'Removed attorney selections must never reactivate.',
)

const root = process.cwd()
const [apiSource, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140012_signed_otp_transfer_instruction_activation_phase4.sql'), 'utf8'),
])

assert.match(apiSource, /status:\s*ATTORNEY_INCOMING_INSTRUCTION_STATUSES\.readyForAcceptance/)
assert.match(apiSource, /promoteMandateTransferAttorneyAllocationToInstruction/)
assert.match(apiSource, /instruction_source:\s*allocation\.instruction_source \|\| source/)
assert.match(migrationSource, /allocation_status = 'instructed'/)
assert.match(migrationSource, /transaction_id = new\.id/)
assert.match(migrationSource, /signed_otp_received/)

console.log('Signed OTP transfer instruction Phase 4 checks passed.')
