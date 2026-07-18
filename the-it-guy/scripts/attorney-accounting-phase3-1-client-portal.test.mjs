import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180027_attorney_accounting_phase3_1_client_portal_accounts.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const portalPath = path.join(repoRoot, 'src/pages/ClientPortal.jsx')
const panelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const portalSource = fs.readFileSync(portalPath, 'utf8')
const panelSource = fs.readFileSync(panelPath, 'utf8')

assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_matter_financial_accounts/,
  'Phase 3.1 must expose a client portal read RPC',
)
assert.match(migrationSource, /x-bridge-client-portal-token/, 'RPC must be scoped by the client portal token header')
assert.match(migrationSource, /account\.portal_enabled = true/, 'Portal RPC must only expose portal-enabled accounts')
assert.match(migrationSource, /document\.document_status = 'published'/, 'Portal RPC must only expose published documents')
assert.match(migrationSource, /entry\.entry_visibility = 'client_visible'/, 'Portal RPC must only expose client-visible entries')
assert.match(migrationSource, /grant execute on function public\.bridge_client_portal_matter_financial_accounts\(text\) to anon, authenticated;/, 'Portal RPC must be callable by anon/authenticated token sessions')
assert.doesNotMatch(migrationSource, /grant\s+select[^;]+matter_financial_(accounts|documents|entries)[^;]+to\s+anon/i, 'Phase 3.1 must not grant anonymous table reads')

assert.match(apiSource, /export async function fetchClientPortalMatterFinancialAccounts/, 'API must expose the portal account read helper')
assert.match(apiSource, /client\.rpc\('bridge_client_portal_matter_financial_accounts'/, 'API must call the secure portal RPC')
assert.match(apiSource, /requireClientPortalTokenClient\(normalizedToken\)/, 'API must use the client portal token-scoped client')

assert.match(portalSource, /ClientPortalMatterAccountsPanel/, 'Client portal must render the account panel')
assert.match(portalSource, /fetchClientPortalMatterFinancialAccounts/, 'Client portal must load matter account details')
assert.match(portalSource, /location\.pathname\.endsWith\('\/account'\)/, 'Client portal must route /account to the account section')
assert.match(portalSource, /key: 'account', label: 'Account'/, 'Client portal nav must include the Account section')
assert.match(portalSource, /const isAccount = workspaceSection === 'account'/, 'Client portal must track the account section flag')

assert.match(panelSource, /Account details/, 'Account panel must present account details')
assert.match(panelSource, /Published documents/, 'Account panel must show published documents')
assert.match(panelSource, /Account activity/, 'Account panel must show visible ledger activity')
assert.match(panelSource, /No account details published yet/, 'Account panel must handle empty state')
assert.match(panelSource, /Drafts and internal notes are kept private/, 'Account panel must explain published-only protocol')

console.log('Attorney accounting Phase 3.1 client portal contract checks passed.')
