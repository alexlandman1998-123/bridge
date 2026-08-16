import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const MAX_SOURCE_ISSUES_AFTER_PHASE7 = 168
const REPORT_PATH = 'test-results/conveyancing-workspace-ui-overflow/report.json'
const runBrowserAudit = process.argv.includes('--browser')
const strictBrowser = process.argv.includes('--strict-browser')

const contractScripts = [
  'scripts/conveyancing-workspace-ui-overflow-audit.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase2.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase3.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase4.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase5.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase6.test.mjs',
  'scripts/conveyancing-workspace-ui-overflow-phase7.test.mjs',
]

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function readReport() {
  assert.ok(existsSync(REPORT_PATH), `Expected ${REPORT_PATH} to exist`)
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'))
}

for (const script of contractScripts) {
  run(process.execPath, [script])
}

run(process.execPath, ['scripts/conveyancing-workspace-ui-overflow-audit.mjs', '--source-only'])

const sourceReport = readReport()
const sourceAudit = sourceReport.sourceAudit || {}
const rankedComponents = sourceAudit.rankedComponents || []
const topComponentNames = rankedComponents.slice(0, 8).map((item) => item.component)

assert.equal(sourceReport.phase, 'conveyancing_workspace_ui_overflow_phase1')
assert.equal(sourceReport.status, 'READY_FOR_REFINEMENT')
assert.ok(
  sourceAudit.totalIssues <= MAX_SOURCE_ISSUES_AFTER_PHASE7,
  `Source overflow risks increased above ${MAX_SOURCE_ISSUES_AFTER_PHASE7}: ${sourceAudit.totalIssues}`,
)
assert.equal(
  topComponentNames.includes('ArchlineMatterHeader'),
  false,
  'ArchlineMatterHeader should stay out of the top overflow hotspots after phase 3.',
)
assert.equal(
  topComponentNames.includes('ArchlineTransferWorkspace'),
  false,
  'ArchlineTransferWorkspace should stay out of the top overflow hotspots after phase 4.',
)
assert.equal(
  topComponentNames.includes('ArchlineWorkflowWorkspace'),
  false,
  'ArchlineWorkflowWorkspace should stay out of the top overflow hotspots after phase 5.',
)
assert.equal(
  topComponentNames.includes('ArchlineDocumentsWorkspace'),
  false,
  'ArchlineDocumentsWorkspace should stay out of the top overflow hotspots after phase 6.',
)
assert.equal(
  topComponentNames.includes('WorkflowDetailsDrawer'),
  false,
  'WorkflowDetailsDrawer should stay out of the top overflow hotspots after phase 7.',
)
assert.equal(
  topComponentNames.includes('AttorneyRoleWorkspacePanel'),
  false,
  'AttorneyRoleWorkspacePanel should stay out of the top overflow hotspots after phase 7.',
)
assert.equal(
  topComponentNames.includes('AttorneyMatterCommandCenter'),
  false,
  'AttorneyMatterCommandCenter should stay out of the top overflow hotspots after phase 7.',
)

if (runBrowserAudit) {
  const browserArgs = ['scripts/conveyancing-workspace-ui-overflow-audit.mjs']
  run(process.execPath, browserArgs)
  const browserReport = readReport()
  const blockers = browserReport.browserAudit?.blockers || []
  const nonAuthBlockers = blockers.filter((blocker) => blocker.code !== 'CONVEYANCING_WORKSPACE_AUTH_BLOCKED')

  assert.equal(browserReport.phase, 'conveyancing_workspace_ui_overflow_phase1')
  assert.equal(nonAuthBlockers.length, 0, `Browser audit has non-auth blockers: ${nonAuthBlockers.map((item) => item.code).join(', ')}`)
  if (strictBrowser) {
    assert.equal(blockers.length, 0, `Strict browser verification found blockers: ${blockers.map((item) => item.code).join(', ')}`)
  }
}

console.log(JSON.stringify({
  phase: 'conveyancing_workspace_ui_overflow_phase8',
  status: 'VERIFIED',
  sourceIssueCount: sourceAudit.totalIssues,
  sourceIssueLimit: MAX_SOURCE_ISSUES_AFTER_PHASE7,
  topComponents: topComponentNames,
  browserAudit: runBrowserAudit ? (strictBrowser ? 'strict' : 'report-mode') : 'skipped',
}, null, 2))
