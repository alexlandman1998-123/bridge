import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const panelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const detailPath = path.join(repoRoot, 'src/pages/AttorneyTransactionDetail.jsx')
const phaseOneMigrationPath = path.join(repoRoot, '../supabase/migrations/202607180025_attorney_accounting_phase1_1_canonical_model.sql')

const apiSource = fs.readFileSync(apiPath, 'utf8')
const panelSource = fs.readFileSync(panelPath, 'utf8')
const detailSource = fs.readFileSync(detailPath, 'utf8')
const phaseOneMigrationSource = fs.readFileSync(phaseOneMigrationPath, 'utf8')

const requiredApiExports = [
  'fetchMatterFinancialAccounts',
  'registerMatterFinancialDocument',
  'publishMatterFinancialDocument',
  'recordMatterFinancialEntry',
  'reverseMatterFinancialEntry',
  'updateMatterFinancialAccountPortal',
]

for (const exportName of requiredApiExports) {
  assert.match(apiSource, new RegExp(`export async function ${exportName}\\b`), `${exportName} API export is required`)
}

for (const tableName of ['matter_financial_accounts', 'matter_financial_documents', 'matter_financial_entries', 'matter_financial_account_events']) {
  assert.match(apiSource, new RegExp(tableName, 'g'), `${tableName} must be used by the Phase 2 API`)
}

const legacyFinancialRecordSection = apiSource.slice(
  apiSource.indexOf('export async function fetchMatterFinancialAccounts'),
  apiSource.indexOf('async function deactivateExistingUnitTransactions'),
)
assert.doesNotMatch(
  legacyFinancialRecordSection,
  /transaction_financial_records/,
  'Phase 2 matter account workflow must not write to the legacy one-row transaction_financial_records table',
)

assert.match(panelSource, /Upload external financial document/, 'Panel must expose the invoice/statement upload workflow')
assert.match(panelSource, /Upload & publish/, 'Panel must support draft-to-publish uploads')
assert.match(panelSource, /Record entry/, 'Panel must support manual payment/adjustment entries')
assert.match(panelSource, /publishMatterFinancialDocument/, 'Panel must wire document publishing')
assert.match(panelSource, /reverseMatterFinancialEntry/, 'Panel must wire entry reversal')
assert.match(panelSource, /Enable portal/, 'Panel must let attorneys enable buyer/seller portal visibility')

assert.match(detailSource, /import AttorneyMatterAccountsPanel/, 'Attorney transaction detail must import the Phase 2 panel')
assert.match(detailSource, /<AttorneyMatterAccountsPanel/, 'Attorney transaction finance tab must render the Phase 2 panel')
assert.match(detailSource, /workspaceRole === 'attorney'[\s\S]*<AttorneyMatterAccountsPanel/, 'Phase 2 panel should be scoped to the attorney module')

assert.doesNotMatch(
  phaseOneMigrationSource,
  /create table if not exists public\.matter_financial_entries[\s\S]*?references public\.matter_financial_accounts\(id, transaction_id\)\s+on delete cascade\s+\)\s+\)\s+\);/,
  'Phase 1.1 migration must not contain the extra closing parenthesis in matter_financial_entries',
)

console.log('Attorney accounting Phase 2 matter UI contract checks passed.')
