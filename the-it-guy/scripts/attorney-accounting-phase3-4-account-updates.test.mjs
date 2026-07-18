import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180030_attorney_accounting_phase3_4_portal_account_updates.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const clientPanelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const clientPanelSource = fs.readFileSync(clientPanelPath, 'utf8')

assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_matter_financial_accounts/,
  'Phase 3.4 must upgrade the client portal account read RPC',
)
assert.match(migrationSource, /visible_events as/, 'Portal RPC must define a client-visible event scope')
assert.match(migrationSource, /event\.event_visibility = 'client_visible'/, 'Portal RPC must exclude internal account events from buyer/seller payloads')
assert.match(migrationSource, /'events', coalesce\(\(/, 'Portal RPC must return an events array per account')
assert.match(migrationSource, /'eventCount', coalesce\(sum\(event_count\), 0\)/, 'Portal RPC summary must include eventCount')
assert.match(migrationSource, /published documents, client-visible posted entries, and client-visible account events/, 'RPC comment must document the event visibility boundary')

assert.match(apiSource, /function buildMatterFinancialAccountEventViewModel/, 'Attorney API must normalize account events')
assert.match(apiSource, /\.from\('matter_financial_account_events'\)[\s\S]*event_type, event_visibility/, 'Attorney API must fetch account events')
assert.match(apiSource, /eventsByAccountId/, 'Attorney API must group events by account')
assert.match(apiSource, /events:\s*eventsByAccountId\.get\(account\.id\) \|\| \[\]/, 'Attorney API must attach events to account view models')
assert.match(apiSource, /function buildClientPortalMatterFinancialEventViewModel/, 'Client portal API must normalize client-visible events')
assert.match(apiSource, /events: \(Array\.isArray\(account\.events\) \? account\.events : \[\]\)\.map\(buildClientPortalMatterFinancialEventViewModel\)/, 'Client portal accounts must include events')
assert.match(apiSource, /eventCount: normalizeOptionalNumber\(payload\.summary\.eventCount/, 'Client portal summary must retain eventCount')

assert.match(attorneyPanelSource, /accountEventLabel/, 'Attorney panel must render event labels')
assert.match(attorneyPanelSource, /Account audit events/, 'Attorney summary cards must include event updates')
assert.match(attorneyPanelSource, /No account updates recorded yet/, 'Attorney panel must include an empty event state')
assert.match(attorneyPanelSource, /account\.events\.slice\(0, 8\)/, 'Attorney panel must show a bounded account event timeline')

assert.match(clientPanelSource, /Updates from your legal team/, 'Client portal must render legal team updates')
assert.match(clientPanelSource, /account\.events\.slice\(0, 6\)/, 'Client portal must show a bounded client-visible updates timeline')
assert.match(clientPanelSource, /No legal team updates have been published/, 'Client portal must include an empty updates state')
assert.match(clientPanelSource, /summary\.eventCount/, 'Client portal summary must display update count')

console.log('Attorney accounting Phase 3.4 account updates contract checks passed.')
