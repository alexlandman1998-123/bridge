import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildTransferWorkspaceRequirementOwnership,
} from '../src/constants/attorneyTransferWorkspacePresentation.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const transferStages = getAttorneyStageDefinitionsForLane('transfer')
const dataOwnership = buildTransferWorkspaceRequirementOwnership(transferStages, 'requiredData')
const documentOwnership = buildTransferWorkspaceRequirementOwnership(transferStages, 'requiredDocuments')

assert.equal(
  packageJson.scripts['test:attorney-transfer-workspace-phase3'],
  'node scripts/attorney-transfer-workspace-phase3.test.mjs',
  'package script should expose the phase 3 regression',
)
assert.deepEqual(dataOwnership.buyer_entity_type, { phaseKey: 'parties_fica', stageKey: 'buyer_fica_requested' })
assert.deepEqual(dataOwnership.vat_treatment, { phaseKey: 'duty_clearances', stageKey: 'transfer_duty_assessment_prepared' })
assert.deepEqual(documentOwnership.sales_agreement_or_otp, { phaseKey: 'open_file', stageKey: 'instruction_received' })
assert.deepEqual(documentOwnership.buyer_id_document, { phaseKey: 'parties_fica', stageKey: 'buyer_fica_requested' })
assert.deepEqual(documentOwnership.rates_clearance, { phaseKey: 'duty_clearances', stageKey: 'rates_clearance_received' })
assert.deepEqual(documentOwnership.guarantee_letter, { phaseKey: 'documents_signing_guarantees', stageKey: 'guarantees_received' })
assert.deepEqual(documentOwnership.registration_confirmation, { phaseKey: 'lodgement_registration', stageKey: 'registered' })

const workspaceStart = source.indexOf('function TransferWorkflowWorkspace({')
const specialistWorkspaceStart = source.indexOf('function SpecialistLegalWorkflowWorkspace({', workspaceStart)
const legacyProgressStart = specialistWorkspaceStart === -1
  ? source.indexOf('function LegalWorkflowProgressBar({', workspaceStart)
  : specialistWorkspaceStart
assert.notEqual(workspaceStart, -1)
assert.notEqual(legacyProgressStart, -1)
const workspace = source.slice(workspaceStart, legacyProgressStart)

for (const sectionLabel of ['Steps', 'Required information', 'Documents', 'Evidence and completion', 'Recent activity']) {
  assert.ok(workspace.includes(`>${sectionLabel}<`), `expanded phases should render ${sectionLabel}`)
}
assert.match(workspace, /phase\.dataRequirements\.length/, 'expanded phases should render their owned data requirements')
assert.match(workspace, /phase\.documents\.length/, 'expanded phases should render their owned document requirements')
assert.match(workspace, /focusedSigningRequirements\.map/, 'signing requirements should live with documents and guarantees')
assert.match(workspace, /phase\.evidence\.filter/, 'the workspace should keep evidence focused on active work')
assert.match(workspace, /visibleEvidence\.map/, 'expanded phases should render evidence from their active steps')
assert.match(workspace, /phase\.activity\.slice\(0, 4\)/, 'recent activity should remain concise')
assert.match(workspace, /type: requirement\.rejected \? 'request_corrected_document' : 'request_document'/, 'missing document actions should use the existing aligned request flow')
assert.doesNotMatch(workspace, />Capture information</, 'Phase 3 should not expose the known note-only capture action')

console.log('attorney transfer workspace phase 3 tests passed')
