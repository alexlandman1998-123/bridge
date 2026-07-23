import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  resolveAttorneyInstructionActivationLane,
  shouldActivateAttorneyRoleplayerAtSignedOtp,
  shouldCreateAttorneyAssignmentForSelection,
} from '../src/core/transactions/attorneyInstructionActivation.js'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'

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
    { roleType: 'cancellation_attorney', assignmentStatus: 'selected' },
    { cancellationActivationRequested: false },
  ),
  false,
  'A staged cancellation attorney must not activate until the seller-bond route requires cancellation.',
)
assert.equal(
  shouldActivateAttorneyRoleplayerAtSignedOtp(
    { roleType: 'cancellation_attorney', assignmentStatus: 'selected' },
    { cancellationActivationRequested: true },
  ),
  true,
  'A selected cancellation attorney must activate once the existing cancellation route is required.',
)
assert.deepEqual(
  resolveAttorneyInstructionActivationLane({ roleType: 'cancellation_attorney' }),
  {
    roleType: 'cancellation_attorney',
    legalRole: 'cancellation',
    assignmentType: 'cancellation',
    activationEventType: 'cancellation_attorney_activated',
  },
  'Cancellation activation must retain its own participant, assignment, and event identities.',
)
assert.equal(
  resolveTransactionRoutingProfile({
    transaction: { seller_has_existing_bond: true },
  }).requiresCancellationAttorney,
  true,
  'An existing seller bond must turn on the cancellation route before signed-OTP activation.',
)
assert.equal(
  resolveTransactionRoutingProfile({
    transaction: { seller_has_existing_bond: false, cancellation_required: false },
  }).requiresCancellationAttorney,
  false,
  'A matter without seller-bond/cancellation facts must not activate a staged cancellation attorney.',
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
assert.match(apiSource, /resolveAttorneyActivationRoutingProfile/)
assert.match(apiSource, /cancellationActivationRequested/)
assert.match(apiSource, /legalRole:\s*lane\.legalRole/)
assert.match(apiSource, /assignmentType:\s*lane\.assignmentType/)
assert.match(apiSource, /eventType:\s*lane\.activationEventType/)
assert.match(migrationSource, /allocation_status = 'instructed'/)
assert.match(migrationSource, /transaction_id = new\.id/)
assert.match(migrationSource, /signed_otp_received/)

console.log('Signed OTP transfer instruction Phase 4 checks passed.')
