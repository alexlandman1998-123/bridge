import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180031_attorney_accounting_phase5_payment_instructions.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const clientPanelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')
const statementPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountStatement.js')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const clientPanelSource = fs.readFileSync(clientPanelPath, 'utf8')
const statementSource = fs.readFileSync(statementPath, 'utf8')

assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_matter_financial_accounts/,
  'Phase 5 must upgrade the client portal account RPC',
)
assert.match(migrationSource, /'paymentInstructions', case/, 'Portal RPC must include a paymentInstructions object')
assert.match(
  migrationSource,
  /metadata_json -> 'paymentInstructions' ->> 'published'[\s\S]*then account\.metadata_json -> 'paymentInstructions'[\s\S]*else '\{\}'::jsonb/,
  'Portal RPC must return payment instructions only when explicitly published',
)
assert.match(migrationSource, /Payment instructions are returned only when explicitly published/, 'RPC comment must document the publish boundary')

assert.match(apiSource, /normalizeMatterFinancialPaymentInstructions/, 'API must normalize payment instructions')
assert.match(apiSource, /paymentInstructions: buildMatterFinancialPaymentInstructionsViewModel/, 'Attorney account view model must expose payment instructions')
assert.match(apiSource, /export async function updateMatterFinancialAccountPaymentInstructions/, 'API must expose payment instruction save/publish helper')
assert.match(apiSource, /Add the account holder, bank name, and account number before publishing/, 'Publishing must require core bank details')
assert.match(apiSource, /eventType: normalizedInstructions\.published \? 'payment_instructions_published' : 'payment_instructions_saved'/, 'Saving instructions must emit account events')
assert.match(apiSource, /eventVisibility: normalizedInstructions\.published \? 'client_visible' : 'internal'/, 'Only published instructions should create client-visible events')
assert.match(apiSource, /buildClientPortalMatterFinancialPaymentInstructionsViewModel/, 'Client portal API must normalize payment instructions')

assert.match(attorneyPanelSource, /emptyPaymentInstructionDraft/, 'Attorney panel must maintain payment instruction drafts')
assert.match(attorneyPanelSource, /updateMatterFinancialAccountPaymentInstructions/, 'Attorney panel must call the payment instruction API')
assert.match(attorneyPanelSource, /Payment instructions/, 'Attorney panel must render payment instruction controls')
assert.match(attorneyPanelSource, /Save draft/, 'Attorney panel must support internal draft save')
assert.match(attorneyPanelSource, /Publish instructions/, 'Attorney panel must support publishing instructions')

assert.match(clientPanelSource, /Payment instructions/, 'Client portal must render published payment instructions')
assert.match(clientPanelSource, /account\.paymentInstructions\?\.published/, 'Client portal must only show instructions when published')
assert.match(clientPanelSource, /Use these details exactly as provided by your legal team/, 'Client portal must include cautionary payment copy')

assert.match(statementSource, /Payment instructions/, 'Statement export must include payment instructions')
assert.match(statementSource, /paymentInstructions\.accountHolder/, 'Statement export must include payment account holder when visible')

console.log('Attorney accounting Phase 5 payment instructions contract checks passed.')
