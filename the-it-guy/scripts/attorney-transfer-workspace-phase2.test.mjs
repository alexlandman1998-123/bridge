import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.scripts['test:attorney-transfer-workspace-phase2'],
  'node scripts/attorney-transfer-workspace-phase2.test.mjs',
  'package script should expose the phase 2 regression',
)
assert.match(
  source,
  /import \{[\s\S]*TRANSFER_WORKSPACE_ACTION_CONTRACT,[\s\S]*TRANSFER_WORKSPACE_PHASES,[\s\S]*\} from '\.\.\/constants\/attorneyTransferWorkspacePresentation\.js'/,
  'the transfer layout should consume the Phase 1 presentation contract',
)

const workspaceStart = source.indexOf('function TransferWorkflowWorkspace({')
const specialistWorkspaceStart = source.indexOf('function SpecialistLegalWorkflowWorkspace({', workspaceStart)
const legacyProgressStart = specialistWorkspaceStart === -1
  ? source.indexOf('function LegalWorkflowProgressBar({', workspaceStart)
  : specialistWorkspaceStart
assert.notEqual(workspaceStart, -1, 'the focused transfer workspace should exist')
assert.notEqual(legacyProgressStart, -1, 'the legacy workflow component should remain available for other lanes')

const workspace = source.slice(workspaceStart, legacyProgressStart)
assert.match(workspace, />Do this next</, 'the workspace should expose one primary next-action panel')
assert.match(workspace, />Transfer workflow</, 'the workspace should render the vertical phase list')
assert.match(workspace, /setExpandedPhaseKey\(currentPhaseKey\)/, 'the live phase should open automatically')
assert.match(workspace, /aria-expanded=\{expanded\}/, 'phase rows should expose accessible expansion state')
assert.match(workspace, /buildTransferWorkspacePhaseGroups\(steps, workflow\?\.lane\)/, 'the workspace should build its rows from the explicit presentation phase groups')
const phaseBuilderStart = source.indexOf('function buildTransferWorkspacePhaseGroups(steps = [], lane = {})')
const presentationPhaseMap = source.indexOf('TRANSFER_WORKSPACE_PHASES.map', phaseBuilderStart)
assert.notEqual(phaseBuilderStart, -1, 'the transfer phase builder should exist')
assert.ok(presentationPhaseMap > phaseBuilderStart && presentationPhaseMap < workspaceStart, 'phase grouping should use the Phase 1 presentation contract')
assert.match(workspace, /getTransferWorkspacePrimaryAction\(workflow\)/, 'the next-action panel should use the aligned action selector')
assert.doesNotMatch(workspace, /LegalWorkflowActionPanel/, 'the transfer workspace should not render the old action rail')
assert.doesNotMatch(workspace, /LegalWorkflowRequirementsPanel/, 'the transfer workspace should not render the page-level requirements catch-all')
assert.doesNotMatch(workspace, /2xl:grid-cols-\[minmax\(0,1fr\)_minmax\(340px/, 'the transfer workspace should not use the old two-column rail layout')

const transferBranch = source.indexOf("if (activeLegalWorkflowDetailKey === 'transfer')")
const transferWorkspaceRender = source.indexOf('<TransferWorkflowWorkspace', transferBranch)
assert.notEqual(transferBranch, -1, 'the transfer detail should have a dedicated presentation branch')
assert.ok(transferWorkspaceRender > transferBranch, 'the transfer detail should render the focused workspace')

console.log('attorney transfer workspace phase 2 tests passed')
