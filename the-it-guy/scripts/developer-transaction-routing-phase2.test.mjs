import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.match(
  source,
  /const isDeveloperTransactionView = workspaceRole === 'developer'/,
  'Developer transaction view must be detected explicitly.',
)

assert.match(
  source,
  /const isTransactionOperatorView = isAgentTransactionView \|\| isDeveloperTransactionView/,
  'Developer and agent views must share the transaction operator workspace gate.',
)

assert.match(
  source,
  /isTransactionOperatorView\s*\?\s*AGENT_WORKSPACE_TABS/,
  'Developer transactions must use the newer transaction workspace tabs.',
)

assert.match(
  source,
  /tabs=\{isTransactionOperatorView[\s\S]*?workspaceMenuTabs\.map[\s\S]*?activeTab=\{isTransactionOperatorView \? activeWorkspaceMenu[\s\S]*?onTabChange=\{isTransactionOperatorView \? openWorkspaceMenu/,
  'Developer transactions must wire the shared header to the operator tabs and navigation.',
)

assert.doesNotMatch(source, /onSendSellerReminder=/, 'The retired seller-reminder prop must not be reintroduced into the operator overview.')

for (const workspaceName of ['documents', 'activity', 'stakeholders']) {
  assert.match(
    source,
    new RegExp(`activeWorkspaceMenu === '${workspaceName}' && workspaceRole !== 'attorney' && !isTransactionOperatorView`),
    `Legacy ${workspaceName} workspace must not render for developer transaction operator views.`,
  )
}

assert.match(
  source,
  /developerOverview=\{isDeveloperTransactionView\}/,
  'Developer transaction overview must use the developer journey variant.',
)

assert.match(
  source,
  /useTransactionPartnerOptions\(\{[\s\S]*?enabled:[\s\S]*?organisationId: workspaceOrganisationId/,
  'Developer transaction workspace must load scoped partner defaults.',
)

console.log('developer transaction routing phase 2 test passed')
