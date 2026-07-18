import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180036_attorney_accounting_phase8_client_submission_checklist.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const clientPanelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const clientPortalPath = path.join(repoRoot, 'src/pages/ClientPortal.jsx')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const clientPanelSource = fs.readFileSync(clientPanelPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const clientPortalSource = fs.readFileSync(clientPortalPath, 'utf8')

assert.match(
  migrationSource,
  /create or replace function public\.bridge_client_portal_submit_matter_financial_request_document/,
  'Phase 8 must add a token-scoped generic request submission RPC',
)
assert.match(migrationSource, /p_request_id uuid default null/, 'Generic request submission must require a request id')
assert.match(migrationSource, /v_request\.request_type/, 'Submitted document type must derive from the request type')
assert.match(migrationSource, /'client_portal_finance_request_submission'/, 'Submitted documents must be marked with the Phase 8 source')
assert.match(migrationSource, /request_status = 'awaiting_review'/, 'Submitting a requested document must move the request to attorney review')
assert.match(migrationSource, /client_finance_request_document_uploaded/, 'Submitting a requested document must emit an account event')
assert.match(migrationSource, /it does not post ledger entries/, 'Generic request submission must not post ledger entries')

assert.match(
  apiSource,
  /export async function uploadClientPortalMatterFinancialRequestDocument/,
  'API must expose generic request document upload helper',
)
assert.match(
  apiSource,
  /bridge_client_portal_submit_matter_financial_request_document/,
  'API helper must call the Phase 8 request submission RPC',
)
assert.match(apiSource, /matter-financial-request-documents/, 'Request submissions must be stored under a distinct storage prefix')
assert.match(apiSource, /p_request_id: normalizedRequestId/, 'API must pass the normalized request id to the RPC')

assert.match(clientPanelSource, /onUploadRequestDocument/, 'Client portal panel must accept a request upload callback')
assert.match(clientPanelSource, /requestUploadFeedback/, 'Client portal panel must show per-request upload feedback')
assert.match(clientPanelSource, /handleSubmitRequestDocument/, 'Client portal panel must submit documents from checklist items')
assert.match(clientPanelSource, /Submit \$\{title\(request\.requestType\)\}/, 'Checklist upload button must be type-aware')
assert.match(clientPanelSource, /\['requested', 'rejected'\]\.includes\(request\.requestStatus\)/, 'Checklist uploads should be available only when action is needed from the client')

assert.match(clientPortalSource, /uploadClientPortalMatterFinancialRequestDocument/, 'Client portal page must import the Phase 8 upload API')
assert.match(clientPortalSource, /handleUploadMatterRequestDocument/, 'Client portal page must wire the request upload handler')
assert.match(clientPortalSource, /uploadingRequestId=\{uploadingMatterRequestId\}/, 'Client portal page must pass request upload busy state')
assert.match(clientPortalSource, /onUploadRequestDocument=\{handleUploadMatterRequestDocument\}/, 'Client portal page must pass the request upload callback')

assert.match(attorneyPanelSource, /client_finance_request_document_uploaded/, 'Attorney panel event timeline must label Phase 8 submissions')

console.log('Attorney accounting Phase 8 client submission checklist contract checks passed.')
