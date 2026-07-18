import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180029_attorney_accounting_phase3_3_proof_reconciliation_guard.sql')
const phase32MigrationPath = path.join(repoRoot, '../supabase/migrations/202607180028_attorney_accounting_phase3_2_client_portal_proof_upload.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const panelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const phase32MigrationSource = fs.readFileSync(phase32MigrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const panelSource = fs.readFileSync(panelPath, 'utf8')

assert.match(
  migrationSource,
  /matter_financial_entries_one_posted_client_proof_idx/,
  'Phase 3.3 must add a duplicate-post guard for client proof reconciliation',
)
assert.match(
  migrationSource,
  /source_type\s*=\s*'client_payment_proof'/,
  'Duplicate-post guard must be scoped to client proof payment entries',
)
assert.match(
  migrationSource,
  /financial_document_id is not null[\s\S]*entry_status = 'posted'/,
  'Duplicate-post guard must only apply to posted document-backed entries',
)
assert.doesNotMatch(
  phase32MigrationSource,
  /insert into public\.matter_financial_entries/i,
  'Phase 3.2 client proof upload must remain evidence-only and must not post entries',
)

assert.match(apiSource, /export async function reconcileMatterFinancialProofDocument/, 'API must expose attorney proof reconciliation')
assert.match(apiSource, /\.from\('matter_financial_documents'\)[\s\S]*\.eq\('id', normalizedDocumentId\)/, 'API must load the proof document by id')
assert.match(apiSource, /document\.document_type !== 'proof_of_payment'/, 'API must reject non-proof documents')
assert.match(apiSource, /\.from\('matter_financial_entries'\)[\s\S]*\.eq\('financial_document_id', document\.id\)[\s\S]*\.eq\('source_type', 'client_payment_proof'\)/, 'API must pre-check duplicate proof postings')
assert.match(apiSource, /entry_type:\s*'payment'/, 'Proof reconciliation must post a payment entry')
assert.match(apiSource, /financial_document_id:\s*document\.id/, 'Posted payment entry must link back to the proof document')
assert.match(apiSource, /source_type:\s*'client_payment_proof'/, 'Posted payment entry must be sourced from the client proof')
assert.match(apiSource, /requiresAttorneyReview:\s*false/, 'Proof metadata must clear the attorney-review flag after posting')
assert.match(apiSource, /reviewStatus:\s*'posted'/, 'Proof metadata must record posted review status')
assert.match(apiSource, /postedEntryId:\s*data\.id/, 'Proof metadata must retain the posted ledger entry id')
assert.match(apiSource, /client_payment_proof_posted/, 'Proof reconciliation must emit a matter-account event')

assert.match(panelSource, /reconcileMatterFinancialProofDocument/, 'Attorney panel must call proof reconciliation API')
assert.match(panelSource, /proofNeedsAttorneyReview/, 'Attorney panel must detect proofs requiring review')
assert.match(panelSource, /Needs review/, 'Attorney panel must label proof documents that need attorney review')
assert.match(panelSource, /Client submitted this proof/, 'Attorney panel must explain client-submitted evidence')
assert.match(panelSource, /Post payment/, 'Attorney panel must expose a post-payment action for reviewed proof')
assert.match(panelSource, /Reconciled/, 'Attorney panel must show reconciled proof state')

console.log('Attorney accounting Phase 3.3 proof reconciliation contract checks passed.')
