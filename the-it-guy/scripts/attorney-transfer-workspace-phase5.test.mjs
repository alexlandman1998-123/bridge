import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildAttorneyWorkflowActionCommand } from '../src/constants/attorneyWorkflowUsability.js'
import { TRANSFER_WORKSPACE_ACTION_CONTRACT } from '../src/constants/attorneyTransferWorkspacePresentation.js'

const root = process.cwd()
const page = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const operations = fs.readFileSync(path.join(root, 'src/services/attorneyOperations.js'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.scripts['test:attorney-transfer-workspace-phase5'],
  'node scripts/attorney-transfer-workspace-phase5.test.mjs',
)

const actionCases = [
  ['manage_signing', 'schedule_signing'],
  ['resolve_blocker', 'resolve_blocker'],
  ['update_matter_data', 'capture_matter_data'],
  ['review_workflow', 'focus_workflow'],
]

for (const [actionType, commandType] of actionCases) {
  assert.equal(TRANSFER_WORKSPACE_ACTION_CONTRACT[actionType].aligned, true, `${actionType} should be safe to promote`)
  const command = buildAttorneyWorkflowActionCommand({
    id: `phase5_${actionType}`,
    type: actionType,
    label: actionType === 'update_matter_data' ? 'Capture Purchase Price' : actionType.replaceAll('_', ' '),
    laneKey: 'transfer',
    stageKey: 'buyer_signing_scheduled',
    relatedId: actionType === 'update_matter_data' ? 'purchase_price' : '',
    target: actionType === 'manage_signing' ? 'buyer' : 'attorney',
  })
  assert.equal(command.commandType, commandType, `${actionType} should create ${commandType}`)
}

assert.match(page, /form="attorney-signing-appointment-form"/)
assert.match(page, /Schedule & Send Invite/)
assert.match(page, /createAttorneyAppointmentInvite\(\{/)
assert.match(page, /command\.commandType === 'capture_matter_data'/)
assert.match(page, /command\.commandType === 'resolve_blocker'/)
assert.match(page, /command\.commandType === 'focus_workflow'/)
assert.match(page, /Only the assigned attorney can schedule signing for this workflow/)
assert.match(operations, /canManageAttorneySigning\(user\?\.id, transactionId, signingRole\)/)
assert.match(operations, /AttorneySigningAppointmentScheduled/)

console.log('attorney transfer workspace phase 5 tests passed')
