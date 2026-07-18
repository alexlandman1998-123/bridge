import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180028_attorney_accounting_phase3_2_client_portal_proof_upload.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const portalPath = path.join(repoRoot, 'src/pages/ClientPortal.jsx')
const panelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const portalSource = fs.readFileSync(portalPath, 'utf8')
const panelSource = fs.readFileSync(panelPath, 'utf8')

assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_upload_matter_financial_proof/,
  'Phase 3.2 must expose a token-scoped proof upload RPC',
)
assert.match(migrationSource, /public\.bridge_client_portal_request_token\(\)/, 'Proof upload RPC must use the client portal token header')
assert.match(migrationSource, /account\.portal_enabled = true/, 'Proof upload RPC must only allow portal-enabled accounts')
assert.match(migrationSource, /account\.party_role = v_party_role/, 'Proof upload RPC must scope uploads to buyer/seller workspace role')
assert.match(migrationSource, /'proof_of_payment'/, 'Proof upload must create proof_of_payment documents')
assert.match(migrationSource, /'requiresAttorneyReview', true/, 'Proof upload must flag attorney review')
assert.doesNotMatch(
  migrationSource,
  /insert into public\.matter_financial_entries/i,
  'Client proof upload must not post ledger entries automatically',
)
assert.doesNotMatch(
  migrationSource,
  /grant\s+insert[^;]+matter_financial_documents[^;]+to\s+anon/i,
  'Phase 3.2 must not grant anonymous direct document inserts',
)

assert.match(apiSource, /export async function uploadClientPortalMatterFinancialProof/, 'API must expose proof upload helper')
assert.match(apiSource, /uploadToDocumentsBucket\(client, filePath, file/, 'API must upload the proof file to document storage')
assert.match(apiSource, /client\.rpc\('bridge_client_portal_upload_matter_financial_proof'/, 'API must write proof metadata through the secure RPC')

assert.match(panelSource, /Upload proof of payment/, 'Portal account panel must expose proof upload')
assert.match(panelSource, /This does not mark the account as paid/, 'Portal account panel must explain no automatic payment posting')
assert.match(panelSource, /Submit proof/, 'Portal account panel must submit proof evidence')
assert.match(panelSource, /onUploadProof/, 'Portal account panel must call the upload handler')

assert.match(portalSource, /uploadClientPortalMatterFinancialProof/, 'Client portal must import the proof upload API')
assert.match(portalSource, /handleUploadMatterAccountProof/, 'Client portal must define a proof upload handler')
assert.match(portalSource, /fetchClientPortalMatterFinancialAccounts\(\{[\s\S]*workspace: effectiveWorkspace === 'seller' \? 'seller' : 'buyer'/, 'Client portal must refresh accounts after proof upload')
assert.match(portalSource, /onUploadProof=\{handleUploadMatterAccountProof\}/, 'Client portal must pass the upload handler to the account panel')

console.log('Attorney accounting Phase 3.2 client proof upload contract checks passed.')
