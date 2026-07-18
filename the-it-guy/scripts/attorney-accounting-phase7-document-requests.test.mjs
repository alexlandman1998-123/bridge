import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const migrationPath = path.join(repoRoot, '../supabase/migrations/202607180035_attorney_accounting_phase7_document_requests.sql')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const clientPanelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')
const clientPortalPath = path.join(repoRoot, 'src/pages/ClientPortal.jsx')
const readinessPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountReadiness.js')

const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const clientPanelSource = fs.readFileSync(clientPanelPath, 'utf8')
const clientPortalSource = fs.readFileSync(clientPortalPath, 'utf8')
const readinessSource = fs.readFileSync(readinessPath, 'utf8')

assert.match(migrationSource, /create table if not exists public\.matter_financial_document_requests/, 'Phase 7 must add a finance document request table')
assert.match(migrationSource, /request_status in \([\s\S]*'requested'[\s\S]*'awaiting_review'[\s\S]*'complete'[\s\S]*'cancelled'/, 'Request workflow must support requested, review, complete, and cancelled states')
assert.match(migrationSource, /matter_financial_document_requests_select_scoped/, 'Requests must have scoped RLS')
assert.match(migrationSource, /visible_requests as \(/, 'Client portal account RPC must include visible requests')
assert.match(migrationSource, /'requests', coalesce/, 'Client portal account payload must include requests')
assert.match(migrationSource, /p_request_id uuid default null/, 'Client proof upload RPC must accept an optional request id')
assert.match(migrationSource, /request_status = 'awaiting_review'/, 'Linked client uploads must move the request into attorney review')
assert.match(migrationSource, /'requestId', p_request_id/, 'Client proof upload metadata/events must retain the request id')

assert.match(apiSource, /buildMatterFinancialDocumentRequestViewModel/, 'API must normalize finance document requests')
assert.match(apiSource, /export async function createMatterFinancialDocumentRequest/, 'API must expose request creation')
assert.match(apiSource, /export async function updateMatterFinancialDocumentRequestStatus/, 'API must expose request status updates')
assert.match(apiSource, /\.from\('matter_financial_document_requests'\)/, 'API must read/write request rows')
assert.match(apiSource, /requests: requestsByAccountId\.get\(account\.id\) \|\| \[\]/, 'Attorney account view model must attach requests')
assert.match(apiSource, /p_request_id: normalizeNullableText\(requestId\)/, 'Client proof upload API must send request id to the RPC')
assert.match(apiSource, /openRequests/, 'Account summaries must count open requests')
assert.match(apiSource, /requestsAwaitingReview/, 'Account summaries must count requests awaiting review')

assert.match(attorneyPanelSource, /Request finance document \/ POP/, 'Attorney panel must render request creation UI')
assert.match(attorneyPanelSource, /createMatterFinancialDocumentRequest/, 'Attorney panel must call request creation API')
assert.match(attorneyPanelSource, /updateMatterFinancialDocumentRequestStatus/, 'Attorney panel must call request status update API')
assert.match(attorneyPanelSource, /Client submission requests/, 'Attorney account details must show request queue')
assert.match(attorneyPanelSource, /Create request/, 'Attorney request form must create checklist items')
assert.match(attorneyPanelSource, /Accept/, 'Attorney request queue must support accepting submissions')
assert.match(attorneyPanelSource, /Reject/, 'Attorney request queue must support rejecting submissions')
assert.match(attorneyPanelSource, /requestStatus: 'complete'/, 'Reconciled linked proofs must complete their request')

assert.match(clientPanelSource, /Requested from you/, 'Client portal must show the submission checklist')
assert.match(clientPanelSource, /Related request/, 'Client proof upload form must let clients link POP to a request')
assert.match(clientPanelSource, /requestId: ''/, 'Client portal proof drafts must track request id')
assert.match(clientPortalSource, /requestId/, 'Client portal upload handler must forward request id')

assert.match(readinessSource, /openRequestCount/, 'Readiness must understand open finance document requests')
assert.match(readinessSource, /client submission request[\s\S]*remain open/, 'Readiness must warn about open requests')

console.log('Attorney accounting Phase 7 document request workflow contract checks passed.')
