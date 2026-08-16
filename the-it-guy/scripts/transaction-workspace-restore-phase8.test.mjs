import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

function sliceBetween(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `${label} should include ${startMarker}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `${label} should end before ${endMarker}`)
  return source.slice(start, end)
}

function assertPackageScript(name) {
  assert.equal(packageJson.scripts[name], `node scripts/${name.replace(/^test:/, '')}.test.mjs`, `package script should expose ${name}`)
}

assertPackageScript('test:transaction-documents-command-centre')
assertPackageScript('test:agent-transaction-overview-refactor')
assertPackageScript('test:attorney-documents-workspace-phase8')
assertPackageScript('test:finance-tab-launch-readiness')
assertPackageScript('test:transaction-workspace-restore-phase8')

const agentTabs = sliceBetween('const AGENT_WORKSPACE_TABS = [', 'const BOND_ORIGINATOR_WORKSPACE_TABS = [', 'agent workspace tabs')
const agentOverview = sliceBetween('function AgentTransactionOverview(', 'function MatterOverviewHeader(', 'agent transaction overview')
assert.match(agentTabs, /\{ id: 'transfer', label: 'Conveyancing' \}/, 'agent transfer route should be labelled Conveyancing')
assert.doesNotMatch(agentTabs, /\{ id: 'transfer', label: 'Transfer' \}/, 'agent tabs should not expose the old Transfer label')
assert.match(source, /workspaceLabel=\{isAgentTransactionView \? 'Transaction Workspace' : 'Legal Matter Workspace'\}/, 'agent shell should use the restored transaction workspace label')
assert.match(source, /showWorkflowProgress=\{!isAgentTransactionView\}/, 'agent shell should suppress the duplicate header workflow rail')
assert.match(source, /tabs=\{isAgentTransactionView[\s\S]*workspaceMenuTabs\.map\(\(tab\) => \(\{ id: tab\.id, label: tab\.label \}\)\)[\s\S]*: archlineWorkspaceTabs\}/, 'agent shell tabs should not render workflow status metadata chips')
assert.doesNotMatch(source, /workspaceMenuTabs\.map\(\(tab\) => \(\{ id: tab\.id, label: tab\.label, count: tab\.meta \}\)\)/, 'agent shell should not pass FICA or onboarding metadata into the tab count slot')
assert.match(source, /rounded-\[28px\] border border-\[#dfe8f2\] bg-white/, 'agent shell header should use the current transaction workspace header surface')
assert.match(source, /function buildTransactionRouteShell\(transactionId\)/, 'transaction detail route should create a stable shell from the route id')
assert.match(source, /const initialTransactionShell = useMemo\([\s\S]*navigationPreviewData \|\| buildTransactionRouteShell\(transactionId\)/, 'transaction detail should seed render state from preview data or the route shell')
assert.match(source, /const \[data, setData\] = useState\(\(\) => initialTransactionShell\)/, 'transaction detail should keep shell data mounted while loading')
assert.match(source, /const canRenderInitialShell = Boolean\(data\?\.transaction && \(data\?\.__isNavigationPreview \|\| data\?\.__isRouteShell\)\)/, 'transaction detail should recognise route shells as renderable')
assert.match(source, /if \(loading && !canRenderInitialShell\) \{[\s\S]*return <LoadingSkeleton lines=\{8\} className="panel" \/>[\s\S]*\}/, 'transaction detail should only show the blocking loading skeleton when no shell can render')

const documentDefinitions = sliceBetween(
  'const ATTORNEY_DOCUMENT_DASHBOARD_CATEGORY_DEFINITIONS = {',
  'const ATTORNEY_DOCUMENT_DASHBOARD_PARTIES = [',
  'attorney document dashboard definitions',
)
for (const category of ['property', 'sales', 'fica', 'finance', 'additional']) {
  assert.match(documentDefinitions, new RegExp(`key: 'buyer_${category}'`), `documents workspace should keep the simplified buyer ${category} category`)
  assert.match(documentDefinitions, new RegExp(`key: 'seller_${category}'`), `documents workspace should keep the simplified seller ${category} category`)
}
for (const label of ['Property Documents', 'Sales Documents', 'FICA Documents', 'Finance Documents', 'Additional Requests']) {
  assert.match(documentDefinitions, new RegExp(`label: '${label}'`), `documents workspace should expose ${label}`)
}

const documentsWorkspace = sliceBetween('function ArchlineDocumentsWorkspace', 'function ArchlineTasksWorkspace', 'documents workspace')
for (const removedPanel of ['Document Health', 'Quick Actions', 'Document Activity', 'Bulk Download', 'Document Checklist']) {
  assert.doesNotMatch(documentsWorkspace, new RegExp(removedPanel), `documents workspace should not restore the removed ${removedPanel} panel`)
}

const journeyStages = sliceBetween('const AGENT_TRANSACTION_JOURNEY_STAGES = [', 'const AGENT_DOCUMENT_SNAPSHOT_GROUPS = [', 'agent transaction journey stages')
assert.equal((journeyStages.match(/key: '/g) || []).length, 5, 'agent transaction journey should remain the canonical five-stage flow')
for (const label of ['Confirmed', 'OTP', 'Finance', 'Transfer', 'Registration']) {
  assert.match(journeyStages, new RegExp(`label: '${label}'`), `agent transaction journey should include ${label}`)
}
assert.doesNotMatch(journeyStages, /Buyer Onboarding|OTP Signed/, 'agent transaction journey should not regress to onboarding labels')
assert.match(agentOverview, /w-full min-w-\[820px\]/, 'agent transaction journey rail should retain stable responsive sizing')
assert.doesNotMatch(agentOverview, /grid-cols-6/, 'agent transaction journey should not reserve a stale sixth column')

assert.match(source, /const financeManagedByForTransaction = deriveFinanceManagedBy\(\{/, 'finance tab should derive finance ownership')
assert.match(source, /const agentShouldUseOriginatorFinanceTracker =\s*isAgentTransactionView && isBondOrHybridFinance && financeManagedByForTransaction === 'bond_originator'/, 'finance tab should guard originator tracker eligibility')
assert.match(
  source,
  /agentShouldUseOriginatorFinanceTracker \? \([\s\S]*<BondOriginatorAgentProgressView/,
  'agent finance tab should only show the originator progress tracker when eligible',
)
assert.doesNotMatch(
  source,
  /isAgentTransactionView \? \(\s*<BondOriginatorAgentProgressView/,
  'agent finance tab should not unconditionally route every transaction into the originator tracker',
)

const agentConveyancingWorkspace = sliceBetween('function AgentConveyancingWorkspace(', 'function LegalWorkflowActionPanel', 'agent Conveyancing workspace')
assert.match(source, /isAgentTransactionView && activeWorkspaceMenu === 'transfer' \? \([\s\S]*<AgentConveyancingWorkspace/, 'agent Conveyancing tab should use the agent-safe workspace')
assert.match(source, /workspaceRole === 'attorney' && activeWorkspaceMenu === 'transfer'/, 'attorney Transfer tab should keep the editable workflow workspace')
assert.match(source, /<AgentConveyancingWorkspace[\s\S]*workflows=\{transferHubWorkflows\}/, 'agent Conveyancing lanes should use the attorney workflow models')
assert.match(
  agentConveyancingWorkspace,
  /<LegalWorkflowProgressBar[\s\S]*workflow=\{activeWorkflow\}[\s\S]*diagnostics=\{routingDiagnostics\}[\s\S]*saving=\{saving\}/,
  'agent Conveyancing detail should reuse the shared progress detail',
)
for (const attorneyOnlyControl of ['onQuickUpdateStep=', 'onStartInlineStepUpdate=', 'onSubmitInlineStepUpdate=']) {
  assert.doesNotMatch(agentConveyancingWorkspace, new RegExp(attorneyOnlyControl), `agent Conveyancing detail should not expose ${attorneyOnlyControl}`)
}
assert.match(agentConveyancingWorkspace, /No shared attorney update has been posted for this lane yet\./, 'agent Conveyancing should include a safe empty latest-update state')

assert.match(source, /function isInternalActivityEntry\(entry = \{\}\)/, 'activity feed should have an internal-entry guard')
assert.match(source, /function isAgentSafeWorkflowUpdate\(entry = \{\}\)/, 'lane latest update should have an agent-safe visibility guard')
assert.match(source, /function normalizeWorkflowUpdateForAgent\(entry = \{\}\)/, 'lane latest update should normalize attorney update rows for agents')
assert.match(source, /function getAgentConveyancingLatestUpdate\(workflow = \{\}, activityFeed = \[\]\)/, 'agent Conveyancing should derive the latest lane update')
assert.match(source, /\.\.\.\(Array\.isArray\(workflow\?\.timeline\) \? workflow\.timeline : \[\]\)/, 'agent latest update should read workflow timeline rows')
assert.match(source, /\.\.\.\(Array\.isArray\(workflow\?\.updates\) \? workflow\.updates : \[\]\)/, 'agent latest update should read stored workflow update rows')
assert.match(source, /return isAgentTransactionView \? fullFeed\.filter\(\(entry\) => !isInternalActivityEntry\(entry\)\) : fullFeed/, 'agent activity feed should filter internal attorney notes')
assert.match(source, /eventVisibility = String\(event\.visibility \|\| event\.visibility_scope \|\| eventData\.visibility \|\| eventData\.visibilityScope \|\| 'shared'\)/, 'activity rows should preserve event visibility')

assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'activity'/, 'agent Activity should use the restored Archline workspace')
assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'stakeholders'/, 'agent Roleplayers should use the restored Archline workspace')
assert.match(source, /activeWorkspaceMenu === 'activity' && workspaceRole !== 'attorney' && !isAgentTransactionView/, 'legacy non-attorney activity fallback should not catch agents')
assert.match(source, /activeWorkspaceMenu === 'stakeholders' && workspaceRole !== 'attorney' && !isAgentTransactionView/, 'legacy non-attorney roleplayer fallback should not catch agents')

console.log('transaction workspace restore Phase 8 checks passed')
