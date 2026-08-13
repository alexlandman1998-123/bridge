import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

function sliceBetween(start, end, label) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `${label} start marker missing`)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(endIndex, -1, `${label} end marker missing`)
  return source.slice(startIndex, endIndex)
}

const bondTabBlock = sliceBetween('const BOND_ORIGINATOR_WORKSPACE_TABS = [', 'const ROUTING_FINANCE_TYPE_OPTIONS = [', 'bond originator tabs')
assert.match(bondTabBlock, /label: 'Today'/)
assert.match(bondTabBlock, /label: 'Work Queue'/)
assert.match(bondTabBlock, /label: 'Application'/)

assert.match(source, /function BondConsultantOverviewWorkspace\(/)
assert.match(source, /const bondConsultantWorkspaceAction = useMemo\([\s\S]*resolveBondConsultantAction\(\{/)
assert.match(source, /const handleBondConsultantPrimaryAction = useCallback\(/)
assert.equal(
  (source.match(/workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'workflow'/g) || []).length,
  1,
  'bond originator should have one workflow render path',
)

const bondOverviewBlock = sliceBetween(
  "workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'overview'",
  "{workspaceRole === 'attorney' && ['today', 'overview'].includes(activeWorkspaceMenu)",
  'bond originator overview render',
)
assert.match(bondOverviewBlock, /<BondConsultantOverviewWorkspace/)
assert.match(bondOverviewBlock, /consultantAction=\{bondConsultantWorkspaceAction\}/)
assert.doesNotMatch(bondOverviewBlock, /<FinanceProgressBar/)
assert.doesNotMatch(bondOverviewBlock, /<FinanceReadinessDashboard/)
assert.doesNotMatch(bondOverviewBlock, /<AppointmentDashboardSection/)
assert.doesNotMatch(bondOverviewBlock, /<BankSubmissionTracker/)
assert.doesNotMatch(bondOverviewBlock, /<BestQuoteSummary/)
assert.doesNotMatch(bondOverviewBlock, /<form onSubmit=\{handleAddDiscussion\}/)

const bondWorkflowBlock = sliceBetween(
  "workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'workflow'",
  "{activeWorkspaceMenu === 'finance' && workspaceRole !== 'attorney'",
  'bond originator workflow render',
)
assert.match(bondWorkflowBlock, /<BondBankSubmissionCommandCenter/)
assert.match(bondWorkflowBlock, /<QuoteComparisonCommandCenter/)
assert.match(bondWorkflowBlock, /<BuyerDecisionPanel/)
assert.match(bondWorkflowBlock, /<BondMatterConversationPanel/)

console.log('Bond originator workspace phase 2 tests passed')
