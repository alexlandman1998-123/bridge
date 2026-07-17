import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const page = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const laneService = fs.readFileSync(path.join(root, 'src/services/attorneyWorkflow/attorneyWorkflowLaneService.js'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.scripts['test:attorney-transfer-workspace-phase4'],
  'node scripts/attorney-transfer-workspace-phase4.test.mjs',
)

const workspaceStart = page.indexOf('function TransferWorkflowWorkspace({')
const workspaceEnd = page.indexOf('function LegalWorkflowProgressBar({', workspaceStart)
const workspace = page.slice(workspaceStart, workspaceEnd)

for (const action of ["Capture {requirement.label || 'information'}", 'Upload document', 'View document', 'Review document', 'Request document']) {
  assert.ok(workspace.includes(action), `phase workspace should expose the contextual ${action} action`)
}
for (const status of ["onUpdateStep(step, 'completed')", "onUpdateStep(step, 'waiting')", "onUpdateStep(step, 'blocked')"]) {
  assert.ok(workspace.includes(status), `active steps should expose ${status}`)
}
assert.match(page, /Confirm completion evidence/)
assert.match(page, /Waiting on/)
assert.match(page, /Follow-up date/)
assert.match(page, /Blocker owner/)
assert.match(page, /saveTransactionAttorneyMatterFact/)
assert.match(api, /const ATTORNEY_MATTER_FACT_FIELDS = Object\.freeze/)
assert.match(api, /AttorneyMatterFactUpdated/)
assert.match(api, /canUpdateAttorneyLanePermission\(actorProfile\.userId, transactionId, 'transfer_attorney'\)/)
assert.match(api, /Only the assigned transfer attorney can update this matter field/)
assert.match(laneService, /requirement = null,[\s\S]*buildDocumentRequestPayload\(\{[\s\S]*requirement,/)
assert.match(page, /requirement: action\?\.requirement \|\| null/)
assert.match(page, /workspaceRole !== 'attorney' \|\| canUseLaneCapability\('transfer', 'canEdit'\)/)

console.log('attorney transfer workspace phase 4 tests passed')
