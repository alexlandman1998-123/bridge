import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getAttorneyWorkflowNavigation,
} from '../src/core/transactions/attorneyMatterWorkflowNavigation.js'

const root = process.cwd()
const page = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.scripts['test:attorney-transfer-workspace-phase6'],
  'node scripts/attorney-transfer-workspace-phase6.test.mjs',
)

for (const [matterRole, defaultLaneKey, label, detailKey] of [
  ['transfer_attorney', 'transfer', 'Transfer', 'transfer'],
  ['bond_attorney', 'bond', 'Bond Registration', 'bond-registration'],
  ['cancellation_attorney', 'cancellation', 'Bond Cancellation', 'bond-cancellation'],
]) {
  assert.deepEqual(
    getAttorneyWorkflowNavigation({ matterRole, defaultLaneKey, assignedLaneKeys: [defaultLaneKey] }),
    { mode: 'direct', label, defaultLaneKey, detailKey },
  )
}

const specialistStart = page.indexOf('function SpecialistLegalWorkflowWorkspace({')
const specialistEnd = page.indexOf('function LegalWorkflowProgressBar({', specialistStart)
assert.notEqual(specialistStart, -1, 'the focused specialist workspace should exist')
assert.notEqual(specialistEnd, -1, 'the specialist workspace should end before the shared progress component')
const specialistWorkspace = page.slice(specialistStart, specialistEnd)

assert.match(specialistWorkspace, />Do this next</)
assert.match(specialistWorkspace, /Bond Registration/)
assert.match(specialistWorkspace, /Bond Cancellation/)
assert.match(specialistWorkspace, /LegalWorkflowProgressBar/)
assert.match(specialistWorkspace, /LegalWorkflowRequirementsPanel/)
assert.match(specialistWorkspace, /viewerCapability\?\.canManageSigning/)
assert.match(specialistWorkspace, /viewerCapability\?\.canRequestDocuments/)
assert.doesNotMatch(specialistWorkspace, /2xl:grid-cols-\[minmax\(0,1fr\)_minmax\(340px/)
assert.doesNotMatch(specialistWorkspace, /LegalWorkflowSnapshotPanel/)
assert.doesNotMatch(specialistWorkspace, /LegalWorkflowCoordinationPanel/)

const detailBranchStart = page.indexOf("if (activeLegalWorkflowDetailKey === 'transfer')")
const detailBranchEnd = page.indexOf('})()', detailBranchStart)
const detailBranch = page.slice(detailBranchStart, detailBranchEnd)
assert.match(detailBranch, /<TransferWorkflowWorkspace/)
assert.match(detailBranch, /<SpecialistLegalWorkflowWorkspace/)
assert.doesNotMatch(detailBranch, /<aside/)
assert.doesNotMatch(detailBranch, /<LegalWorkflowActionPanel/)
assert.doesNotMatch(detailBranch, /<LegalWorkflowSnapshotPanel/)

assert.match(page, /nextMenu === 'transfer' && attorneyWorkflowNavigation\.mode === 'direct'/)
assert.match(page, /buildAttorneyWorkflowPath\(transactionWorkspaceBasePath, attorneyWorkflowNavigation\.detailKey\)/)

console.log('attorney transfer workspace phase 6 tests passed')
