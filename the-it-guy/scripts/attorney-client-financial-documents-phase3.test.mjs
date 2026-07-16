import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildAttorneyClientFinancialDocumentRows } from '../src/services/documents/attorneyClientFinancialDocumentService.js'

const documents = [
  { id: 'buyer-doc', document_type: 'buyer_transfer_cost_invoice', created_at: '2026-07-16T10:00:00Z' },
  { id: 'seller-doc', document_type: 'seller_attorney_invoice', created_at: '2026-07-16T11:00:00Z' },
]
const rows = buildAttorneyClientFinancialDocumentRows({
  documents,
  metadata: [
    { document_definition_key: 'buyer_transfer_cost_invoice', document_id: 'buyer-doc', publication_status: 'published' },
    { document_definition_key: 'seller_attorney_invoice', document_id: 'older-seller-doc', publication_status: 'published' },
  ],
})
assert.equal(rows.find((row) => row.key === 'buyer_transfer_cost_invoice')?.published, true)
assert.equal(rows.find((row) => row.key === 'seller_attorney_invoice')?.published, false, 'A replacement file must be republished explicitly.')

const component = readFileSync(path.resolve(process.cwd(), 'src/components/attorney/documents/AttorneyClientFinancialDocumentsPanel.jsx'), 'utf8')
assert.equal(component.includes('Publish to {row.recipientRole}'), true)
assert.equal(component.includes('Withdraw from {row.recipientRole}'), true)
assert.equal(component.includes("action: 'withdrawn'"), true, 'Replacing a published file must withdraw the old publication.')

const portalService = readFileSync(path.resolve(process.cwd(), 'src/services/clientPortalWorkspaceService.js'), 'utf8')
assert.equal(portalService.includes("workspaceMode === 'selling' ? 'seller' : 'buyer'"), true)
assert.equal(portalService.includes('fetchPublishedAttorneyClientFinancialDocumentsByToken'), true)

const api = readFileSync(path.resolve(process.cwd(), 'src/lib/api.js'), 'utf8')
assert.equal(api.includes('financialRecipient !== normalizedViewerRole'), true)
assert.equal(api.includes('bridge_attorney_client_financial_documents_by_token'), true)

const migration = readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607160014_attorney_client_financial_documents_phase3.sql'), 'utf8')
assert.equal(migration.includes('attorney_client_financial_document_publication_events'), true)
assert.equal(migration.includes("metadata.recipient_role = v_recipient_role"), true)
assert.equal(migration.includes("v_recipient_role = 'buyer'"), true)
assert.equal(migration.includes('bridge_private_listing_seller_portal_payload'), true)
assert.equal(migration.includes("publication_status = 'published'"), true)

console.log('attorney client financial documents phase 3 contract passed')
